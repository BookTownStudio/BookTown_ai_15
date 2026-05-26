import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const functionsRequire = createRequire(path.resolve(__dirname, "../functions/package.json"));
const { applicationDefault, cert, getApps, initializeApp } = functionsRequire("firebase-admin/app") as any;
const { FieldPath, FieldValue, getFirestore } = functionsRequire("firebase-admin/firestore") as any;

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "serviceAccountKey.json");
const COLLECTION_NAME = "books";
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 400;
const WRITE_BATCH_LIMIT = 450;
const SAMPLE_LIMIT = 10;

type CliOptions = {
  batchSize: number;
  dryRun: boolean;
  limit: number;
  startAfterDocId: string;
};

type ReaderAuthorityProjection = {
  hasReadableAttachment: true;
  attachmentId: string;
  source: "ebook_attachment" | "acquisition";
  updatedAt: unknown;
};

type Summary = {
  scanned: number;
  updated: number;
  skippedAlreadyValid: number;
  skippedNotReadable: number;
  skippedMissingAttachmentId: number;
  skippedInvalidProjection: number;
  dryRun: boolean;
  lastProcessedDocId: string;
  sampleUpdates: Array<{
    bookId: string;
    attachmentId: string;
    source: ReaderAuthorityProjection["source"];
  }>;
};

function parseCliArgs(argv: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const separatorIndex = body.indexOf("=");
    if (separatorIndex === -1) {
      parsed.set(body, "true");
      continue;
    }
    parsed.set(body.slice(0, separatorIndex), body.slice(separatorIndex + 1));
  }
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean value "${value}". Use true or false.`);
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative integer "${value}".`);
  }
  return parsed;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = parseNonNegativeInt(value, fallback);
  if (parsed <= 0) throw new Error(`Invalid positive integer "${value}".`);
  return parsed;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function resolveOptions(args: Map<string, string>): CliOptions {
  return {
    batchSize: Math.min(parsePositiveInt(args.get("batchSize"), DEFAULT_BATCH_SIZE), MAX_BATCH_SIZE),
    dryRun: parseBoolean(args.get("dryRun") ?? args.get("dry-run"), true),
    limit: parseNonNegativeInt(args.get("limit"), 0),
    startAfterDocId: asNonEmptyString(args.get("startAfterDocId") ?? args.get("start-after")),
  };
}

async function loadServiceAccount(): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(SERVICE_ACCOUNT_PATH, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

async function initFirestore() {
  if (getApps().length === 0) {
    try {
      initializeApp({
        credential: cert(await loadServiceAccount()),
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      initializeApp({
        credential: applicationDefault(),
      });
    }
  }
  return getFirestore();
}

function hasReadableStoragePointer(data: Record<string, unknown>): boolean {
  return Boolean(
    asNonEmptyString(data.ebookStoragePath) ||
      asNonEmptyString(data.epubStoragePath) ||
      asNonEmptyString(data.storagePath)
  );
}

function resolveReaderAuthoritySource(
  data: Record<string, unknown>
): ReaderAuthorityProjection["source"] {
  return asArray(data.externalReadableSources).length > 0 ||
    asNonEmptyString(data.acquiredFromProvider).length > 0
    ? "acquisition"
    : "ebook_attachment";
}

function buildReaderAuthorityProjection(
  data: Record<string, unknown>
): ReaderAuthorityProjection | null {
  const attachmentId = asNonEmptyString(data.ebookAttachmentId);
  if (!attachmentId) return null;
  if (!hasReadableStoragePointer(data)) return null;
  return {
    hasReadableAttachment: true,
    attachmentId,
    source: resolveReaderAuthoritySource(data),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function hasValidReaderAuthority(
  data: Record<string, unknown>,
  expected: ReaderAuthorityProjection
): boolean {
  const current = asRecord(data.readerAuthority);
  return (
    current?.hasReadableAttachment === true &&
    asNonEmptyString(current.attachmentId) === expected.attachmentId &&
    asNonEmptyString(current.source) === expected.source
  );
}

function hasPartialInvalidProjection(data: Record<string, unknown>): boolean {
  const current = asRecord(data.readerAuthority);
  if (!current) return false;
  return (
    current.hasReadableAttachment !== true ||
    asNonEmptyString(current.attachmentId).length === 0 ||
    (asNonEmptyString(current.source) !== "ebook_attachment" &&
      asNonEmptyString(current.source) !== "acquisition")
  );
}

async function main(): Promise<void> {
  const options = resolveOptions(parseCliArgs(process.argv.slice(2)));
  const db = await initFirestore();
  const booksRef = db.collection(COLLECTION_NAME);
  const summary: Summary = {
    scanned: 0,
    updated: 0,
    skippedAlreadyValid: 0,
    skippedNotReadable: 0,
    skippedMissingAttachmentId: 0,
    skippedInvalidProjection: 0,
    dryRun: options.dryRun,
    lastProcessedDocId: options.startAfterDocId,
    sampleUpdates: [],
  };

  console.log("[READER_AUTHORITY_BACKFILL][START]", {
    collection: COLLECTION_NAME,
    batchSize: options.batchSize,
    dryRun: options.dryRun,
    limit: options.limit || null,
    startAfterDocId: options.startAfterDocId || null,
    serviceAccountPath: SERVICE_ACCOUNT_PATH,
  });

  let cursor = options.startAfterDocId;
  let pendingBatch = db.batch();
  let pendingWrites = 0;

  while (true) {
    if (options.limit > 0 && summary.scanned >= options.limit) break;

    const remaining = options.limit > 0 ? options.limit - summary.scanned : options.batchSize;
    const pageSize = Math.min(options.batchSize, remaining);
    let query = booksRef.orderBy(FieldPath.documentId()).limit(pageSize);
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      summary.scanned += 1;
      summary.lastProcessedDocId = doc.id;
      cursor = doc.id;

      const data = doc.data() as Record<string, unknown>;
      const projection = buildReaderAuthorityProjection(data);

      if (!projection) {
        if (!asNonEmptyString(data.ebookAttachmentId) && hasReadableStoragePointer(data)) {
          summary.skippedMissingAttachmentId += 1;
        } else {
          summary.skippedNotReadable += 1;
        }
        if (hasPartialInvalidProjection(data)) summary.skippedInvalidProjection += 1;
        continue;
      }

      if (hasValidReaderAuthority(data, projection)) {
        summary.skippedAlreadyValid += 1;
        continue;
      }

      summary.updated += 1;
      if (summary.sampleUpdates.length < SAMPLE_LIMIT) {
        summary.sampleUpdates.push({
          bookId: doc.id,
          attachmentId: projection.attachmentId,
          source: projection.source,
        });
      }

      if (!options.dryRun) {
        pendingBatch.set(doc.ref, { readerAuthority: projection }, { merge: true });
        pendingWrites += 1;
        if (pendingWrites >= WRITE_BATCH_LIMIT) {
          await pendingBatch.commit();
          pendingBatch = db.batch();
          pendingWrites = 0;
        }
      }
    }

    console.log("[READER_AUTHORITY_BACKFILL][BATCH]", {
      scanned: summary.scanned,
      updated: summary.updated,
      skippedAlreadyValid: summary.skippedAlreadyValid,
      skippedNotReadable: summary.skippedNotReadable,
      skippedMissingAttachmentId: summary.skippedMissingAttachmentId,
      skippedInvalidProjection: summary.skippedInvalidProjection,
      lastProcessedDocId: summary.lastProcessedDocId,
      dryRun: options.dryRun,
    });

    if (snapshot.size < pageSize) break;
  }

  if (!options.dryRun && pendingWrites > 0) {
    await pendingBatch.commit();
  }

  console.log("[READER_AUTHORITY_BACKFILL][SUMMARY]", summary);
}

main().catch((error) => {
  console.error("[READER_AUTHORITY_BACKFILL][FAILED]", error);
  process.exitCode = 1;
});
