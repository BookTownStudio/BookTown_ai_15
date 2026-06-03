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
const { FieldValue, getFirestore } = rootRequire("firebase-admin/firestore");

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "serviceAccountKey.json");
const DEFAULT_PROJECT_ID = "booktown-ai";
const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 300;
const WRITE_BATCH_LIMIT = 400;
const SAMPLE_LIMIT = 50;

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

function normalizeRightsMode(value) {
  const normalized = readString(value).toLowerCase();
  if (normalized === "private") return "private";
  if (normalized === "paid") return "paid";
  if (normalized === "premium_only") return "premium_only";
  return "public_free";
}

function normalizeVisibility(value) {
  const normalized = readString(value).toLowerCase();
  return normalized || "public";
}

function isPublicFreeBook(book) {
  return normalizeVisibility(book.visibility) === "public" &&
    normalizeRightsMode(book.rightsMode) === "public_free";
}

function resolveReaderAuthority(book) {
  return book.readerAuthority && typeof book.readerAuthority === "object" && !Array.isArray(book.readerAuthority)
    ? book.readerAuthority
    : {};
}

function resolveAttachmentId(book, edition) {
  const readerAuthority = resolveReaderAuthority(book);
  return readString(book.ebookAttachmentId) ||
    readString(readerAuthority.attachmentId) ||
    readString(edition?.ebookAttachmentId);
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

function pushSample(summary, sample) {
  if (summary.samples.length < SAMPLE_LIMIT) {
    summary.samples.push(sample);
  }
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv.slice(2)));
  const db = await initFirestore(options.projectId);
  const beforeReadNowQueryCount = await countExactReadNowQuery(db);
  const readableBookCount = await countReadableBooks(db);
  const summary = {
    projectId: options.projectId,
    dryRun: options.dryRun,
    readableBookCount,
    beforeReadNowQueryCount,
    scannedReadableBooks: 0,
    mismatchedBooks: 0,
    publicFreeAttachmentVisibilityPatches: 0,
    readerAuthorityInvalidations: 0,
    missingAttachmentInvalidations: 0,
    afterReadNowQueryCount: beforeReadNowQueryCount,
    samples: [],
  };

  console.log("[READ_NOW_READER_AUTH_REPAIR][START]", {
    projectId: options.projectId,
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    beforeReadNowQueryCount,
    readableBookCount,
    serviceAccountPath: SERVICE_ACCOUNT_PATH,
  });

  let pendingBatch = db.batch();
  let pendingWrites = 0;
  let lastDoc = null;

  async function enqueueSet(ref, patch) {
    if (options.dryRun) return;
    pendingBatch.set(ref, patch, { merge: true });
    pendingWrites += 1;
    if (pendingWrites >= WRITE_BATCH_LIMIT) {
      await pendingBatch.commit();
      pendingBatch = db.batch();
      pendingWrites = 0;
    }
  }

  while (true) {
    let query = db
      .collection("books")
      .where("readerAuthority.hasReadableAttachment", "==", true)
      .orderBy("__name__")
      .limit(options.batchSize);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const bookSnap of snapshot.docs) {
      summary.scannedReadableBooks += 1;
      lastDoc = bookSnap;
      const book = bookSnap.data() || {};
      const editionId = readString(book.editionId);
      let edition = null;
      if (editionId) {
        const editionSnap = await db.collection("editions").doc(editionId).get();
        edition = editionSnap.exists ? editionSnap.data() || {} : null;
      }

      const attachmentId = resolveAttachmentId(book, edition);
      const attachmentRef = attachmentId ? db.collection("attachments").doc(attachmentId) : null;
      const attachmentSnap = attachmentRef ? await attachmentRef.get() : null;
      const attachment = attachmentSnap?.exists ? attachmentSnap.data() || {} : null;
      const attachmentVisibility = readString(attachment?.visibility).toLowerCase();
      const attachmentIsReaderDenied =
        !attachment ||
        attachmentVisibility === "private" ||
        attachmentVisibility === "restricted";

      if (!attachmentIsReaderDenied) continue;

      summary.mismatchedBooks += 1;
      const publicFreeBook = isPublicFreeBook(book);
      const sample = {
        bookId: bookSnap.id,
        title: book.titleEn || book.title || null,
        rightsMode: book.rightsMode ?? null,
        visibility: book.visibility ?? null,
        editionId: editionId || null,
        attachmentId: attachmentId || null,
        attachmentVisibility: attachmentVisibility || null,
        action: publicFreeBook && attachment
          ? "patch_attachment_visibility_public"
          : "invalidate_reader_authority",
      };
      pushSample(summary, sample);

      if (publicFreeBook && attachment && attachmentRef) {
        summary.publicFreeAttachmentVisibilityPatches += 1;
        await enqueueSet(attachmentRef, {
          visibility: "public",
          updatedAt: FieldValue.serverTimestamp(),
        });
        continue;
      }

      if (!attachment) {
        summary.missingAttachmentInvalidations += 1;
      } else {
        summary.readerAuthorityInvalidations += 1;
      }
      await enqueueSet(bookSnap.ref, {
        readerAuthority: {
          hasReadableAttachment: false,
          attachmentId: attachmentId || null,
          source: readString(resolveReaderAuthority(book).source) || "ebook_attachment",
          invalidatedReason: attachment ? "attachment_not_public" : "attachment_missing",
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    console.log("[READ_NOW_READER_AUTH_REPAIR][BATCH]", {
      scannedReadableBooks: summary.scannedReadableBooks,
      mismatchedBooks: summary.mismatchedBooks,
      publicFreeAttachmentVisibilityPatches: summary.publicFreeAttachmentVisibilityPatches,
      readerAuthorityInvalidations: summary.readerAuthorityInvalidations,
      missingAttachmentInvalidations: summary.missingAttachmentInvalidations,
      lastProcessedBookId: lastDoc?.id ?? null,
      dryRun: options.dryRun,
    });

    if (snapshot.size < options.batchSize) break;
  }

  if (!options.dryRun && pendingWrites > 0) {
    await pendingBatch.commit();
  }

  summary.afterReadNowQueryCount = options.dryRun
    ? beforeReadNowQueryCount
    : await countExactReadNowQuery(db);

  console.log("[READ_NOW_READER_AUTH_REPAIR][SUMMARY]", summary);
}

main().catch((error) => {
  console.error("[READ_NOW_READER_AUTH_REPAIR][FAILED]", error);
  process.exitCode = 1;
});
