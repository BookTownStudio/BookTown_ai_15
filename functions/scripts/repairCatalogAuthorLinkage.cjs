#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const MIGRATION_ID = "BT-CATALOG-AUTHOR-LINKAGE-REPAIR-001";

const VERIFIED_REPAIRS = [
  {
    bookId: "9b434a46-0a94-456d-884b-aa30359d85f3",
    title: "Berlin Alexanderplatz",
    authorName: "Alfred Döblin",
  },
  {
    bookId: "6f953c6b-61a8-4987-be35-05abf25e0b66",
    title: "The Brothers Karamazov",
    authorName: "Fyodor Dostoevsky",
  },
  {
    bookId: "33ec07ed-cd83-467d-8a71-b75f997c178e",
    title: "The Cairo Trilogy",
    authorName: "Naguib Mahfouz",
  },
  {
    bookId: "a235c57d-bd8b-497c-a7bb-6474acb71ab8",
    title: "The House of the Spirits",
    authorName: "Isabel Allende",
  },
  {
    bookId: "e63b33c9-babb-489c-9d27-145a114e439d",
    title: "The Magic Mountain",
    authorName: "Thomas Mann",
    authorId: "dc32ee2c-3175-4568-b857-a273db1dc700",
  },
  {
    bookId: "3f2115a7-5d3c-42a7-8893-904fbcd1ff05",
    title: "The Republic",
    authorName: "Plato",
  },
  {
    bookId: "c0892e34-b521-4963-b3fd-29a8648b8c30",
    title: "War and Peace",
    authorName: "Leo Tolstoy",
  },
];

const MANUAL_REVIEW_TITLES = new Set([
  "One Hundred Years of Solitude",
  "The Autumn of the Patriarch",
]);

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : "";
}

function flag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function readName(data) {
  return data.nameEn || data.displayName || data.name || data.authorName || "";
}

function readTitle(data) {
  return data.title || data.titleEn || data.canonicalTitle || "";
}

function isActiveAuthor(data) {
  const state = String(data.lifecycleState || data.authorityState || data.status || "").toLowerCase();
  return !(
    data.requiresCanonicalization === true ||
    data.mergeTargetAuthorId ||
    data.supersededByAuthorId ||
    ["merged", "split", "superseded", "archived"].includes(state)
  );
}

function isPublicReadableBook(data) {
  return data.visibility === "public" || data.publicationState === "published" || data.isPublic === true;
}

function ensureProject() {
  const projectId = arg("project-id") || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "";
  const execute = flag("execute");
  if (!projectId) throw new Error("Missing --project-id=<project id>.");
  if (execute && !flag("confirm-production")) {
    throw new Error("Refusing execution without --confirm-production.");
  }
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId });
  return { projectId, execute };
}

async function load(db) {
  const [authorsSnap, booksSnap] = await Promise.all([
    db.collection("authors").get(),
    db.collection("books").get(),
  ]);
  return {
    authors: authorsSnap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data() || {} })),
    books: booksSnap.docs.map((doc) => ({ id: doc.id, path: doc.ref.path, data: doc.data() || {} })),
  };
}

function findUniqueActiveAuthor(authors, target) {
  if (target.authorId) {
    const author = authors.find((row) => row.id === target.authorId);
    if (!author || !isActiveAuthor(author.data)) {
      throw new Error(`Expected active author ${target.authorId} for ${target.authorName}.`);
    }
    if (normalize(readName(author.data)) !== normalize(target.authorName)) {
      throw new Error(`Author ${target.authorId} name mismatch for ${target.authorName}.`);
    }
    return author;
  }

  const matches = authors.filter((author) => isActiveAuthor(author.data) && normalize(readName(author.data)) === normalize(target.authorName));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one active author for ${target.authorName}, found ${matches.length}.`);
  }
  return matches[0];
}

function findTargetBook(books, target) {
  const book = books.find((row) => row.id === target.bookId);
  if (!book) {
    throw new Error(`Expected book ${target.bookId} for ${target.title}.`);
  }
  if (normalize(readTitle(book.data)) !== normalize(target.title)) {
    throw new Error(`Book ${target.bookId} title mismatch for ${target.title}.`);
  }
  return book;
}

function listAllGaps(rows) {
  const gaps = [];
  for (const author of rows.authors.filter((row) => isActiveAuthor(row.data))) {
    const authorName = readName(author.data);
    if (!authorName) continue;
    for (const book of rows.books) {
      if (
        isPublicReadableBook(book.data) &&
        book.data.authorEn === authorName &&
        book.data.authorId !== author.id
      ) {
        gaps.push({
          bookId: book.id,
          title: readTitle(book.data),
          currentAuthorId: book.data.authorId || "",
          correctAuthorId: author.id,
          correctAuthor: authorName,
          classification: MANUAL_REVIEW_TITLES.has(readTitle(book.data)) ? "MANUAL_REVIEW" : "SAFE_REPAIR",
        });
      }
    }
  }
  gaps.sort((left, right) => left.title.localeCompare(right.title));
  return gaps;
}

function buildPlan(rows) {
  const allGaps = listAllGaps(rows);
  if (allGaps.length !== 9) {
    throw new Error(`Expected 9 linkage gaps, found ${allGaps.length}.`);
  }

  const repairs = VERIFIED_REPAIRS.map((target) => {
    const book = findTargetBook(rows.books, target);
    const author = findUniqueActiveAuthor(rows.authors, target);
    if (book.data.authorId === author.id) {
      return null;
    }
    if (normalize(book.data.authorEn) !== normalize(target.authorName)) {
      throw new Error(`Book ${target.title} has unexpected display author ${book.data.authorEn}.`);
    }
    return {
      bookId: book.id,
      path: book.path,
      title: readTitle(book.data),
      currentAuthorId: book.data.authorId || "",
      correctAuthorId: author.id,
      correctAuthor: target.authorName,
      classification: "SAFE_REPAIR",
      data: book.data,
    };
  }).filter(Boolean);

  const manualReview = allGaps.filter((gap) => gap.classification === "MANUAL_REVIEW");
  return { allGaps, repairs, manualReview };
}

function exportReport({ projectId, execute, plan }) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "migration-reports", `${MIGRATION_ID}-${now}`);
  fs.mkdirSync(dir, { recursive: true });
  const rollback = {
    migrationId: MIGRATION_ID,
    docs: plan.repairs.map((repair) => ({
      path: repair.path,
      id: repair.bookId,
      data: repair.data,
    })),
  };
  const report = {
    migrationId: MIGRATION_ID,
    projectId,
    mode: execute ? "execute" : "dry_run",
    exportedAt: new Date().toISOString(),
    allGaps: plan.allGaps.map(({ data, ...gap }) => gap),
    safeRepairs: plan.repairs.map(({ data, ...repair }) => repair),
    manualReview: plan.manualReview,
    writes: plan.repairs.length,
  };
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, "rollback-snapshot.json"), JSON.stringify(rollback, null, 2));
  return dir;
}

async function executePlan(db, repairs) {
  const batch = db.batch();
  const updatedAt = FieldValue.serverTimestamp();
  for (const repair of repairs) {
    batch.set(
      db.doc(repair.path),
      {
        authorId: repair.correctAuthorId,
        updatedAt,
        catalogAuthorLinkageRepair: {
          migrationId: MIGRATION_ID,
          previousAuthorId: repair.currentAuthorId,
          correctAuthor: repair.correctAuthor,
        },
      },
      { merge: true }
    );
  }
  await batch.commit();
}

async function main() {
  const { projectId, execute } = ensureProject();
  const db = getFirestore();
  const rows = await load(db);
  const plan = buildPlan(rows);
  const reportDir = exportReport({ projectId, execute, plan });

  console.log(JSON.stringify({
    migrationId: MIGRATION_ID,
    projectId,
    mode: execute ? "execute" : "dry_run",
    reportDir,
    gaps: plan.allGaps.length,
    safeRepairs: plan.repairs.length,
    manualReview: plan.manualReview.length,
    writes: plan.repairs.length,
    safeRepairTitles: plan.repairs.map((repair) => repair.title),
    manualReviewTitles: plan.manualReview.map((gap) => gap.title),
  }, null, 2));

  if (!execute) {
    console.log("[DRY_RUN] No writes performed. Re-run with --execute --confirm-production to commit.");
    return;
  }
  await executePlan(db, plan.repairs);
  console.log("[EXECUTE] Commit complete.");
}

main().catch((error) => {
  console.error("[CATALOG_AUTHOR_LINKAGE_REPAIR_FAILED]", error);
  process.exitCode = 1;
});
