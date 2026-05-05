import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeIsbn } from "../shared/normalization/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const functionsRequire = createRequire(path.resolve(__dirname, "../functions/package.json"));
const { cert, getApps, initializeApp } = functionsRequire("firebase-admin/app") as any;
const { FieldPath, getFirestore } = functionsRequire("firebase-admin/firestore") as any;
const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "serviceAccountKey.json");
const CHECKPOINT_PATH = path.resolve(__dirname, ".backfillSearchTokens.progress.json");
const COLLECTION_NAME = "books";
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 200;
const INTER_BATCH_PAUSE_MS = 200;
const SAMPLE_LIMIT = 10;

// Intentionally mirrored from functions/src/library/ingestBook.ts.
const SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

type CliOptions = {
  batchSize: number;
  dryRun: boolean;
  startAfterDocId: string;
};

type CheckpointState = {
  complete: boolean;
  dryRun: boolean;
  lastProcessedDocId: string;
  scannedDocs: number;
  booksNeedingTokens: number;
  booksUpdated: number;
  booksSkippedWithEmptyTokens: number;
  updatedAt: string;
};

type SampleUpdate = {
  docId: string;
  title: string;
  tokenCount: number;
  tokens: string[];
};

type Summary = {
  scannedDocs: number;
  booksNeedingTokens: number;
  booksUpdated: number;
  booksSkippedWithEmptyTokens: number;
  lastProcessedDocId: string;
  sampleUpdates: SampleUpdate[];
};

type BookDocument = {
  title?: unknown;
  authors?: unknown;
  isbn13?: unknown;
  isbn10?: unknown;
  search?: {
    tokens?: unknown;
  } | null;
};

function parseCliArgs(argv: string[]): Map<string, string> {
  const parsed = new Map<string, string>();

  for (const arg of argv) {
    if (!arg.startsWith("--")) {
      continue;
    }

    const trimmed = arg.slice(2);
    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      parsed.set(trimmed, "true");
      continue;
    }

    const key = trimmed.slice(0, separatorIndex);
    const value = trimmed.slice(separatorIndex + 1);
    parsed.set(key, value);
  }

  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (value === "true") return true;
  if (value === "false") return false;

  throw new Error(`Invalid boolean value "${value}". Use true or false.`);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer "${value}".`);
  }

  return parsed;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeSearchText(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearch(value?: string | null): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token));
}

function generateSearchTokens(book: BookDocument): string[] {
  const title = asNonEmptyString(book.title) || "";
  const authors = asStringArray(book.authors);
  const isbn13 = normalizeIsbn(book.isbn13, 13);
  const isbn10 = normalizeIsbn(book.isbn10, 10);

  return Array.from(
    new Set<string>([
      ...tokenizeSearch(title),
      ...authors.flatMap((entry) => tokenizeSearch(entry)),
      ...(isbn13 ? [isbn13] : []),
      ...(isbn10 ? [isbn10] : []),
    ])
  ).slice(0, 80);
}

function existingTokens(book: BookDocument): string[] {
  const candidate = book.search?.tokens;
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readCheckpoint(): Promise<CheckpointState | null> {
  try {
    const raw = await fs.readFile(CHECKPOINT_PATH, "utf8");
    return JSON.parse(raw) as CheckpointState;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeCheckpoint(state: CheckpointState): Promise<void> {
  await fs.writeFile(CHECKPOINT_PATH, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function loadServiceAccount(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(SERVICE_ACCOUNT_PATH, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      throw new Error(`Missing service account file at ${SERVICE_ACCOUNT_PATH}.`);
    }
    throw error;
  }
}

async function initFirestore() {
  const serviceAccount = await loadServiceAccount();

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  return getFirestore();
}

function resolveOptions(cliArgs: Map<string, string>, checkpoint: CheckpointState | null): CliOptions {
  const dryRun = parseBoolean(cliArgs.get("dryRun"), true);
  const batchSize = Math.min(
    parsePositiveInt(cliArgs.get("batchSize"), DEFAULT_BATCH_SIZE),
    MAX_BATCH_SIZE
  );
  const startAfterDocId =
    asNonEmptyString(cliArgs.get("startAfterDocId")) ||
    (checkpoint?.complete ? "" : checkpoint?.lastProcessedDocId || "");

  return {
    batchSize,
    dryRun,
    startAfterDocId,
  };
}

function printConfig(options: CliOptions, checkpoint: CheckpointState | null): void {
  console.log("[SEARCH_TOKENS_BACKFILL][START]", {
    collection: COLLECTION_NAME,
    batchSize: options.batchSize,
    dryRun: options.dryRun,
    startAfterDocId: options.startAfterDocId || null,
    checkpointFile: CHECKPOINT_PATH,
    checkpointFound: Boolean(checkpoint),
    serviceAccountPath: SERVICE_ACCOUNT_PATH,
  });
}

function printSampleUpdates(sampleUpdates: SampleUpdate[]): void {
  if (sampleUpdates.length === 0) {
    console.log("[SEARCH_TOKENS_BACKFILL][SAMPLES] No sample updates.");
    return;
  }

  console.log("[SEARCH_TOKENS_BACKFILL][SAMPLES]", sampleUpdates);
}

async function main(): Promise<void> {
  throw new Error(
    "LEGACY_BOOK_SEARCH_BACKFILL_DISABLED: Use the backend-maintained book search index trigger and admin backfillSearchFields utility."
  );

  const checkpoint = await readCheckpoint();
  const cliArgs = parseCliArgs(process.argv.slice(2));
  const options = resolveOptions(cliArgs, checkpoint);

  printConfig(options, checkpoint);

  const db = await initFirestore();
  const booksRef = db.collection(COLLECTION_NAME);

  const summary: Summary = {
    scannedDocs: 0,
    booksNeedingTokens: 0,
    booksUpdated: 0,
    booksSkippedWithEmptyTokens: 0,
    lastProcessedDocId: options.startAfterDocId,
    sampleUpdates: [],
  };

  let cursor = options.startAfterDocId;

  while (true) {
    let query = booksRef.orderBy(FieldPath.documentId()).limit(options.batchSize);
    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snapshot = await query.get();
    if (snapshot.empty) {
      break;
    }

    const batch = db.batch();
    let pendingWrites = 0;

    for (const doc of snapshot.docs) {
      summary.scannedDocs += 1;
      summary.lastProcessedDocId = doc.id;

      const data = doc.data() as BookDocument;
      const currentTokens = existingTokens(data);
      if (currentTokens.length > 0) {
        continue;
      }

      summary.booksNeedingTokens += 1;

      const generatedTokens = generateSearchTokens(data);
      if (generatedTokens.length === 0) {
        summary.booksSkippedWithEmptyTokens += 1;
        continue;
      }

      if (!options.dryRun) {
        batch.set(
          doc.ref,
          {
            search: {
              tokens: generatedTokens,
            },
          },
          { merge: true }
        );
        pendingWrites += 1;
      }

      summary.booksUpdated += 1;

      if (summary.sampleUpdates.length < SAMPLE_LIMIT) {
        summary.sampleUpdates.push({
          docId: doc.id,
          title: asNonEmptyString(data.title) || "(untitled)",
          tokenCount: generatedTokens.length,
          tokens: generatedTokens.slice(0, 10),
        });
      }
    }

    if (!options.dryRun && pendingWrites > 0) {
      await batch.commit();
    }

    await writeCheckpoint({
      complete: false,
      dryRun: options.dryRun,
      lastProcessedDocId: summary.lastProcessedDocId,
      scannedDocs: summary.scannedDocs,
      booksNeedingTokens: summary.booksNeedingTokens,
      booksUpdated: summary.booksUpdated,
      booksSkippedWithEmptyTokens: summary.booksSkippedWithEmptyTokens,
      updatedAt: new Date().toISOString(),
    });

    console.log("[SEARCH_TOKENS_BACKFILL][BATCH_COMPLETE]", {
      lastProcessedDocId: summary.lastProcessedDocId,
      scannedDocs: summary.scannedDocs,
      booksNeedingTokens: summary.booksNeedingTokens,
      booksUpdated: summary.booksUpdated,
      booksSkippedWithEmptyTokens: summary.booksSkippedWithEmptyTokens,
      committedWrites: options.dryRun ? 0 : pendingWrites,
      dryRun: options.dryRun,
    });

    cursor = summary.lastProcessedDocId;

    if (snapshot.size < options.batchSize) {
      break;
    }

    await sleep(INTER_BATCH_PAUSE_MS);
  }

  await writeCheckpoint({
    complete: true,
    dryRun: options.dryRun,
    lastProcessedDocId: summary.lastProcessedDocId,
    scannedDocs: summary.scannedDocs,
    booksNeedingTokens: summary.booksNeedingTokens,
    booksUpdated: summary.booksUpdated,
    booksSkippedWithEmptyTokens: summary.booksSkippedWithEmptyTokens,
    updatedAt: new Date().toISOString(),
  });

  console.log(`Books scanned: ${summary.scannedDocs}`);
  console.log(`Books needing tokens: ${summary.booksNeedingTokens}`);
  console.log(`Tokens generated: ${summary.booksUpdated}`);
  console.log(`Books skipped (empty generated tokens): ${summary.booksSkippedWithEmptyTokens}`);
  console.log(`Dry run: ${options.dryRun}`);
  console.log(`Last processed doc ID: ${summary.lastProcessedDocId || "(none)"}`);
  printSampleUpdates(summary.sampleUpdates);
  console.log(`[SEARCH_TOKENS_BACKFILL][COMPLETE] Checkpoint: ${CHECKPOINT_PATH}`);
}

main().catch((error) => {
  console.error("[SEARCH_TOKENS_BACKFILL][FAILED]", error);
  process.exitCode = 1;
});
