import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootRequire = createRequire(path.resolve(__dirname, "../package.json"));
const {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} = rootRequire("firebase-admin/app");
const { getFirestore } = rootRequire("firebase-admin/firestore");

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "serviceAccountKey.json");
const DEFAULT_PROJECT_ID = "booktown-ai";
const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 400;
const WRITE_BATCH_LIMIT = 450;
const SAMPLE_LIMIT = 20;

function parseArgs(argv) {
  const args = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const separatorIndex = body.indexOf("=");
    if (separatorIndex === -1) {
      args.set(body, "true");
      continue;
    }
    args.set(body.slice(0, separatorIndex), body.slice(separatorIndex + 1));
  }
  return args;
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean value "${value}". Use true or false.`);
}

function parsePositiveInt(value, fallback) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer "${value}".`);
  }
  return parsed;
}

function readString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(record, field) {
  return Object.prototype.hasOwnProperty.call(record, field);
}

async function loadServiceAccount() {
  const raw = await fs.readFile(SERVICE_ACCOUNT_PATH, "utf8");
  return JSON.parse(raw);
}

async function initFirestore(projectId) {
  if (getApps().length === 0) {
    try {
      initializeApp({
        credential: cert(await loadServiceAccount()),
        projectId,
      });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      initializeApp({
        credential: applicationDefault(),
        projectId,
      });
    }
  }
  return getFirestore();
}

function resolveOptions(args) {
  return {
    projectId: readString(args.get("projectId") ?? args.get("project")) || DEFAULT_PROJECT_ID,
    dryRun: parseBoolean(args.get("dryRun") ?? args.get("dry-run"), true),
    batchSize: Math.min(parsePositiveInt(args.get("batchSize"), DEFAULT_BATCH_SIZE), MAX_BATCH_SIZE),
  };
}

async function countExactReadNowQuery(db) {
  const snap = await db
    .collection("books")
    .where("readerAuthority.hasReadableAttachment", "==", true)
    .orderBy("rating", "desc")
    .limit(36)
    .get();
  return snap.size;
}

async function countReadableBooks(db) {
  const snap = await db
    .collection("books")
    .where("readerAuthority.hasReadableAttachment", "==", true)
    .count()
    .get();
  return Number(snap.data().count || 0);
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv.slice(2)));
  const db = await initFirestore(options.projectId);
  const beforeReadNowCount = await countExactReadNowQuery(db);
  const readableBookCount = await countReadableBooks(db);
  const summary = {
    projectId: options.projectId,
    dryRun: options.dryRun,
    readableBookCount,
    beforeReadNowQueryCount: beforeReadNowCount,
    scannedReadableBooks: 0,
    affectedBooks: 0,
    patchedBooks: 0,
    missingRating: 0,
    missingRatingsCount: 0,
    afterReadNowQueryCount: beforeReadNowCount,
    sampleAffectedBookIds: [],
  };

  console.log("[READABLE_BOOK_RANKING_BACKFILL][START]", {
    projectId: options.projectId,
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    beforeReadNowQueryCount: beforeReadNowCount,
    readableBookCount,
    serviceAccountPath: SERVICE_ACCOUNT_PATH,
  });

  let pendingBatch = db.batch();
  let pendingWrites = 0;
  let lastDoc = null;

  while (true) {
    let query = db
      .collection("books")
      .where("readerAuthority.hasReadableAttachment", "==", true)
      .orderBy("__name__")
      .limit(options.batchSize);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      summary.scannedReadableBooks += 1;
      lastDoc = doc;
      const data = doc.data() || {};
      const patch = {};

      if (!hasOwn(data, "rating")) {
        patch.rating = 0;
        summary.missingRating += 1;
      }

      if (!hasOwn(data, "ratingsCount")) {
        patch.ratingsCount = 0;
        summary.missingRatingsCount += 1;
      }

      if (Object.keys(patch).length === 0) continue;

      summary.affectedBooks += 1;
      if (summary.sampleAffectedBookIds.length < SAMPLE_LIMIT) {
        summary.sampleAffectedBookIds.push(doc.id);
      }

      if (!options.dryRun) {
        pendingBatch.set(doc.ref, patch, { merge: true });
        pendingWrites += 1;
        summary.patchedBooks += 1;
        if (pendingWrites >= WRITE_BATCH_LIMIT) {
          await pendingBatch.commit();
          pendingBatch = db.batch();
          pendingWrites = 0;
        }
      }
    }

    console.log("[READABLE_BOOK_RANKING_BACKFILL][BATCH]", {
      scannedReadableBooks: summary.scannedReadableBooks,
      affectedBooks: summary.affectedBooks,
      patchedBooks: summary.patchedBooks,
      missingRating: summary.missingRating,
      missingRatingsCount: summary.missingRatingsCount,
      lastProcessedBookId: lastDoc?.id ?? null,
      dryRun: options.dryRun,
    });

    if (snapshot.size < options.batchSize) break;
  }

  if (!options.dryRun && pendingWrites > 0) {
    await pendingBatch.commit();
  }

  summary.afterReadNowQueryCount = options.dryRun
    ? beforeReadNowCount + summary.missingRating
    : await countExactReadNowQuery(db);

  console.log("[READABLE_BOOK_RANKING_BACKFILL][SUMMARY]", summary);
}

main().catch((error) => {
  console.error("[READABLE_BOOK_RANKING_BACKFILL][FAILED]", error);
  process.exitCode = 1;
});
