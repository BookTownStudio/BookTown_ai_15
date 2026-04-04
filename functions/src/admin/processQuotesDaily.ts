import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { parse } from "csv-parse";

import { admin } from "../firebaseAdmin";
import { normalizeSearchText } from "../search/normalization";
import {
  findExistingCanonicalQuote,
  prepareCanonicalQuoteWrite,
  quoteIdentityRef,
  rootQuoteRef,
  type PreparedCanonicalQuoteWrite,
} from "../quotes";
import {
  QUOTE_IMPORT_BATCH_ROW_LIMIT,
  QUOTE_IMPORT_CANONICAL_STORAGE_PATH,
  QUOTE_IMPORT_DAILY_ROW_LIMIT,
  QUOTE_IMPORT_DAILY_WRITE_BUDGET,
  QUOTE_IMPORT_ALLOWED_HEADERS,
  quoteImportStateRef,
  readQuoteImportJobState,
  serializeQuoteImportJobState,
  type QuoteImportJobState,
} from "./importQuotes";

const bucket = admin.storage().bucket();
const db = admin.firestore();
const SYSTEM_ACTOR_UID = "system:dailyQuoteImport";
const IMPORT_LEASE_WINDOW_MS = 30 * 60 * 1000;
const IMPORT_STATE_WRITE_COST = 1;

type ResolvedAuthorLink = {
  authorId: string;
  authorName: string;
};

type NormalizedImportRow = {
  quote: string;
  author: string;
  category: string;
};

type PendingQuoteCreate = {
  prepared: PreparedCanonicalQuoteWrite;
};

function normalizeHeader(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function validateCsvColumns(headers: string[]): string[] {
  const normalizedHeaders = headers.map(normalizeHeader);
  const missing = QUOTE_IMPORT_ALLOWED_HEADERS.filter(
    (header) => !normalizedHeaders.includes(header)
  );
  if (missing.length > 0) {
    throw new Error(`CSV is missing required headers: ${missing.join(", ")}.`);
  }
  return normalizedHeaders;
}

function extractAuthorDisplayName(raw: FirebaseFirestore.DocumentData | undefined): string {
  if (typeof raw?.canonicalName === "string" && raw.canonicalName.trim()) {
    return raw.canonicalName.trim();
  }
  if (typeof raw?.displayName === "string" && raw.displayName.trim()) {
    return raw.displayName.trim();
  }
  if (typeof raw?.nameEn === "string" && raw.nameEn.trim()) {
    return raw.nameEn.trim();
  }
  return "";
}

function normalizeCategoryTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[|,;/]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 20)
    )
  );
}

async function resolveAuthorLink(
  rawAuthorName: string,
  cache: Map<string, ResolvedAuthorLink | null>
): Promise<ResolvedAuthorLink | null> {
  const normalizedAuthorName = normalizeSearchText(rawAuthorName);
  if (!normalizedAuthorName) {
    return null;
  }

  if (cache.has(normalizedAuthorName)) {
    return cache.get(normalizedAuthorName) ?? null;
  }

  const candidates = new Map<string, string>();
  const registerCandidates = (snap: FirebaseFirestore.QuerySnapshot) => {
    snap.docs.forEach((docSnap) => {
      const authorName = extractAuthorDisplayName(docSnap.data());
      if (!authorName) {
        return;
      }
      candidates.set(docSnap.id, authorName);
    });
  };

  registerCandidates(
    await db
      .collection("authors")
      .where("nameEnNormalized", "==", normalizedAuthorName)
      .limit(2)
      .get()
  );
  if (candidates.size <= 1) {
    registerCandidates(
      await db
        .collection("authors")
        .where("normalizedName", "==", normalizedAuthorName)
        .limit(2)
        .get()
    );
  }
  if (candidates.size <= 1) {
    registerCandidates(
      await db
        .collection("authors")
        .where("aliasesNormalized", "array-contains", normalizedAuthorName)
        .limit(2)
        .get()
    );
  }

  if (candidates.size !== 1) {
    cache.set(normalizedAuthorName, null);
    return null;
  }

  const [authorId, authorName] = Array.from(candidates.entries())[0];
  const resolved = {
    authorId,
    authorName,
  };
  cache.set(normalizedAuthorName, resolved);
  return resolved;
}

function normalizeImportRow(record: Record<string, unknown>): NormalizedImportRow {
  return {
    quote: typeof record.quote === "string" ? record.quote.trim() : "",
    author: typeof record.author === "string" ? record.author.trim() : "",
    category: typeof record.category === "string" ? record.category.trim() : "",
  };
}

function cloneJobForRun(job: QuoteImportJobState, nowIso: string): QuoteImportJobState {
  return {
    ...job,
    status: "running",
    updatedAt: nowIso,
    lastRunAt: nowIso,
    leaseExpiresAtMs: Date.now() + IMPORT_LEASE_WINDOW_MS,
  };
}

async function acquireJobLease(): Promise<QuoteImportJobState | null> {
  return db.runTransaction(async (tx) => {
    const ref = quoteImportStateRef();
    const snap = await tx.get(ref);
    const current = readQuoteImportJobState(snap.data());
    if (!current || current.completed) {
      return null;
    }

    const nowMs = Date.now();
    if (
      current.status === "running" &&
      typeof current.leaseExpiresAtMs === "number" &&
      current.leaseExpiresAtMs > nowMs
    ) {
      logger.info("[ADMIN][QUOTE_IMPORT][LEASE_BUSY]", {
        storagePath: current.storagePath,
        leaseExpiresAtMs: current.leaseExpiresAtMs,
      });
      return null;
    }

    const leased = cloneJobForRun(current, new Date(nowMs).toISOString());
    tx.set(
      ref,
      {
        quotes: serializeQuoteImportJobState(leased),
      },
      { merge: true }
    );
    return leased;
  });
}

async function persistJob(job: QuoteImportJobState): Promise<void> {
  await quoteImportStateRef().set(
    {
      quotes: serializeQuoteImportJobState(job),
    },
    { merge: true }
  );
}

async function flushPendingCreates(params: {
  job: QuoteImportJobState;
  pendingCreates: PendingQuoteCreate[];
  duplicateRows: number;
  rowsSinceLastPersist: number;
  writesThisRun: number;
}): Promise<{
  createdRows: number;
  duplicateRows: number;
  writesThisRun: number;
}> {
  if (params.pendingCreates.length === 0) {
    return {
      createdRows: 0,
      duplicateRows: params.duplicateRows,
      writesThisRun: params.writesThisRun + IMPORT_STATE_WRITE_COST,
    };
  }

  let createdRows = 0;
  let duplicateRows = params.duplicateRows;
  await db.runTransaction(async (tx) => {
    const identityRefs = params.pendingCreates.map((entry) =>
      quoteIdentityRef(entry.prepared.canonicalQuoteHash)
    );
    const identitySnaps = identityRefs.length > 0 ? await tx.getAll(...identityRefs) : [];

    identitySnaps.forEach((snap, index) => {
      const candidate = params.pendingCreates[index];
      const canonicalQuoteId =
        typeof snap.data()?.canonicalQuoteId === "string" && snap.data()?.canonicalQuoteId.trim()
          ? String(snap.data()?.canonicalQuoteId).trim()
          : "";
      if (canonicalQuoteId) {
        duplicateRows += 1;
        return;
      }

      tx.set(rootQuoteRef(candidate.prepared.canonicalQuoteId), candidate.prepared.rootQuoteData);
      tx.set(
        quoteIdentityRef(candidate.prepared.canonicalQuoteHash),
        candidate.prepared.identityData
      );
      createdRows += 1;
    });
  });

  return {
    createdRows,
    duplicateRows,
    writesThisRun:
      params.writesThisRun + createdRows * 2 + IMPORT_STATE_WRITE_COST,
  };
}

export const processQuotesDaily = onSchedule(
  {
    schedule: "0 2 * * *",
    timeZone: "UTC",
    memory: "1GiB",
    timeoutSeconds: 540,
  },
  async () => {
    const job = await acquireJobLease();
    if (!job) {
      return;
    }

    const authorCache = new Map<string, ResolvedAuthorLink | null>();
    const localPendingHashes = new Set<string>();
    let workingJob = { ...job };
    let rowsThisRun = 0;
    let rowsSinceLastPersist = 0;
    let writesThisRun = 0;
    let pendingCreates: PendingQuoteCreate[] = [];
    let reachedEndOfFile = true;

    const flushProgress = async () => {
      const flushResult = await flushPendingCreates({
        job: workingJob,
        pendingCreates,
        duplicateRows: workingJob.duplicateRows,
        rowsSinceLastPersist,
        writesThisRun,
      });

      workingJob = {
        ...workingJob,
        createdRows: workingJob.createdRows + flushResult.createdRows,
        duplicateRows: flushResult.duplicateRows,
        processedRows: workingJob.lastProcessedRow,
        updatedAt: new Date().toISOString(),
        lastRunAt: new Date().toISOString(),
        leaseExpiresAtMs: Date.now() + IMPORT_LEASE_WINDOW_MS,
      };
      writesThisRun = flushResult.writesThisRun;
      pendingCreates = [];
      localPendingHashes.clear();
      rowsSinceLastPersist = 0;
      await persistJob(workingJob);
    };

    try {
      const sourceFile = bucket.file(workingJob.storagePath || QUOTE_IMPORT_CANONICAL_STORAGE_PATH);
      const [exists] = await sourceFile.exists();
      if (!exists) {
        throw new Error("Registered quote import file is missing from Storage.");
      }

      const parser = parse({
        columns: (headers) => validateCsvColumns(headers),
        bom: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        relax_quotes: true,
      });

      let sourceRowIndex = 0;
      const stream = sourceFile.createReadStream().pipe(parser);
      for await (const record of stream) {
        sourceRowIndex += 1;
        if (sourceRowIndex <= workingJob.lastProcessedRow) {
          continue;
        }

        if (rowsThisRun >= QUOTE_IMPORT_DAILY_ROW_LIMIT) {
          reachedEndOfFile = false;
          break;
        }

        if (writesThisRun + pendingCreates.length * 2 + 4 > QUOTE_IMPORT_DAILY_WRITE_BUDGET) {
          await flushProgress();
          if (writesThisRun + 4 > QUOTE_IMPORT_DAILY_WRITE_BUDGET) {
            reachedEndOfFile = false;
            break;
          }
        }

        const row = normalizeImportRow(record as Record<string, unknown>);
        rowsThisRun += 1;
        rowsSinceLastPersist += 1;
        workingJob.lastProcessedRow = sourceRowIndex;
        workingJob.processedRows = sourceRowIndex;

        if (!row.quote || !row.author) {
          workingJob.skippedRows += 1;
          if (rowsSinceLastPersist >= QUOTE_IMPORT_BATCH_ROW_LIMIT) {
            await flushProgress();
          }
          continue;
        }

        try {
          const resolvedAuthor = await resolveAuthorLink(row.author, authorCache);
          if (!resolvedAuthor) {
            workingJob.skippedRows += 1;
            if (rowsSinceLastPersist >= QUOTE_IMPORT_BATCH_ROW_LIMIT) {
              await flushProgress();
            }
            continue;
          }

          const prepared = await prepareCanonicalQuoteWrite({
            actorUid: SYSTEM_ACTOR_UID,
            textEn: row.quote.slice(0, 2000),
            textAr: "",
            sourceEn: row.author.slice(0, 240),
            sourceAr: "",
            authorId: resolvedAuthor.authorId,
            authorNameOverride: resolvedAuthor.authorName,
            isPublic: false,
            originType: "dataset_import",
            createdBy: SYSTEM_ACTOR_UID,
            updatedBy: SYSTEM_ACTOR_UID,
            status: "active",
            language: "en",
            originalLanguage: "en",
            translationStatus: "original",
            sourceType: "dataset_import",
            sourceReference: workingJob.fileName,
            tags: normalizeCategoryTags(row.category),
          });

          if (localPendingHashes.has(prepared.canonicalQuoteHash)) {
            workingJob.duplicateRows += 1;
          } else {
            const duplicate = await findExistingCanonicalQuote({
              canonicalQuoteHash: prepared.canonicalQuoteHash,
              searchTextNormalized: prepared.searchTextNormalized,
              bookId: prepared.canonicalLinks.bookId,
              authorId: prepared.canonicalLinks.authorId,
            });

            if (duplicate) {
              workingJob.duplicateRows += 1;
            } else {
              pendingCreates.push({ prepared });
              localPendingHashes.add(prepared.canonicalQuoteHash);
            }
          }
        } catch (error) {
          workingJob.failedRows += 1;
          workingJob.lastError =
            error instanceof Error ? error.message.slice(0, 500) : "Unknown quote import row error.";
          logger.error("[ADMIN][QUOTE_IMPORT][ROW_FAILED]", {
            row: sourceRowIndex,
            error: workingJob.lastError,
          });
        }

        if (
          rowsSinceLastPersist >= QUOTE_IMPORT_BATCH_ROW_LIMIT ||
          pendingCreates.length >= QUOTE_IMPORT_BATCH_ROW_LIMIT
        ) {
          await flushProgress();
        }
      }

      if (rowsSinceLastPersist > 0 || pendingCreates.length > 0) {
        await flushProgress();
      }

      workingJob = {
        ...workingJob,
        status:
          workingJob.failedRows > 0 && rowsThisRun === 0
            ? "failed"
            : workingJob.lastProcessedRow >= workingJob.totalRows || reachedEndOfFile
              ? "completed"
              : "registered",
        completed:
          workingJob.lastProcessedRow >= workingJob.totalRows || reachedEndOfFile,
        updatedAt: new Date().toISOString(),
        lastRunAt: new Date().toISOString(),
        leaseExpiresAtMs: undefined,
      };

      await persistJob(workingJob);

      logger.info("[ADMIN][QUOTE_IMPORT][RUN_COMPLETE]", {
        processedRows: rowsThisRun,
        createdRows: workingJob.createdRows,
        duplicateRows: workingJob.duplicateRows,
        skippedRows: workingJob.skippedRows,
        failedRows: workingJob.failedRows,
        lastProcessedRow: workingJob.lastProcessedRow,
        completed: workingJob.completed,
        writesThisRun,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : "Quote import daily processor failed.";
      workingJob = {
        ...workingJob,
        status: "failed",
        completed: false,
        updatedAt: new Date().toISOString(),
        lastRunAt: new Date().toISOString(),
        lastError: message,
        leaseExpiresAtMs: undefined,
      };
      await persistJob(workingJob);
      logger.error("[ADMIN][QUOTE_IMPORT][RUN_FAILED]", {
        error: message,
        storagePath: workingJob.storagePath,
      });
    }
  }
);
