#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const MIGRATION_ID = "BT-REMAINING-AUTHOR-CLUSTER-RESOLUTION-001";

const PLAN = [
  {
    authorName: "Gabriel Garcia Marquez",
    survivorAuthorId: "6cd0e1f6-aef7-4120-b10d-71699e5f9f4c",
    survivorName: "Gabriel García Márquez",
    loserAuthorIds: [
      "0b0a628f-a706-44ab-a578-95c696f8bee3",
      "2511fa3b-7d4f-48d1-a418-1d0132c04009",
      "4d90b8d4-6ed5-4453-88e3-cb85df3ca441",
    ],
    bookRepoints: [
      {
        bookId: "73eebdf4-baea-4956-9e05-0416d9f56f56",
        title: "The Autumn of the Patriarch",
      },
      {
        bookId: "be5dae27-b6d3-4e32-92d3-8427da5f88a6",
        title: "One Hundred Years of Solitude",
      },
    ],
    identityPolicy: "DEFER_CONTAMINATED_IDENTITY_REVIEW",
  },
  {
    authorName: "Thomas Mann",
    survivorAuthorId: "dc32ee2c-3175-4568-b857-a273db1dc700",
    survivorName: "Thomas Mann",
    loserAuthorIds: ["1a46c5d1-93ef-4b1f-b846-76e86edc90c5"],
    bookRepoints: [],
    identityPolicy: "DEFER_PROVIDER_IDENTITY_REVIEW",
  },
];

const REQUIRED_BOOK_STATES = [
  {
    bookId: "a235c57d-bd8b-497c-a7bb-6474acb71ab8",
    title: "The House of the Spirits",
    authorId: "d66ab2c6-d6e7-40c8-84c6-7208921a75cb",
    authorName: "Isabel Allende",
  },
  {
    bookId: "c0892e34-b521-4963-b3fd-29a8648b8c30",
    title: "War and Peace",
    authorId: "d66e4f0f-24d8-4b89-8518-b03b1e176716",
    authorName: "Leo Tolstoy",
  },
  {
    bookId: "9b434a46-0a94-456d-884b-aa30359d85f3",
    title: "Berlin Alexanderplatz",
    authorId: "463fb613-faea-497d-aed0-0bce2c805a0b",
    authorName: "Alfred Döblin",
  },
  {
    bookId: "e63b33c9-babb-489c-9d27-145a114e439d",
    title: "The Magic Mountain",
    authorId: "dc32ee2c-3175-4568-b857-a273db1dc700",
    authorName: "Thomas Mann",
  },
];

const EXPECTED = {
  clusters: 2,
  losers: 4,
  bookRepoints: 2,
  authorIdentityRepoints: 0,
  writes: 6,
};

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
  return data.nameEn || data.displayName || data.name || data.authorName || data.canonicalName || "";
}

function readTitle(data) {
  return data.title || data.titleEn || data.canonicalTitle || "";
}

function isActiveAuthor(data) {
  const state = String(data.lifecycleState || data.authorityState || data.status || "").toLowerCase();
  return !(
    data.requiresCanonicalization === true ||
    data.mergeTargetAuthorId ||
    data.mergedIntoAuthorId ||
    data.supersededByAuthorId ||
    ["merged", "split", "superseded", "archived"].includes(state)
  );
}

function isPublicReadableBook(data) {
  return data.visibility === "public" || data.publicationState === "published" || data.isPublic === true;
}

function hasAuthorRef(data, loserSet) {
  return Object.entries(data || {}).some(([key, value]) => {
    if (typeof value === "string" && /authorid$/i.test(key)) return loserSet.has(value);
    if (Array.isArray(value) && /authorids$/i.test(key)) return value.some((item) => loserSet.has(item));
    return false;
  });
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

async function loadCollections(db) {
  const [authorsSnap, booksSnap, identitySnap, quotesSnap, interactionsSnap, graphSnap] = await Promise.all([
    db.collection("authors").get(),
    db.collection("books").get(),
    db.collection("author_identity").get(),
    db.collection("quotes").get(),
    db.collection("user_entity_interactions").get(),
    db.collection("graph_relationships").get(),
  ]);
  return {
    authors: authorsSnap.docs.map((doc) => ({ path: doc.ref.path, id: doc.id, data: doc.data() || {} })),
    books: booksSnap.docs.map((doc) => ({ path: doc.ref.path, id: doc.id, data: doc.data() || {} })),
    identities: identitySnap.docs.map((doc) => ({ path: doc.ref.path, id: doc.id, data: doc.data() || {} })),
    quotes: quotesSnap.docs.map((doc) => ({ path: doc.ref.path, id: doc.id, data: doc.data() || {} })),
    interactions: interactionsSnap.docs.map((doc) => ({ path: doc.ref.path, id: doc.id, data: doc.data() || {} })),
    graph: graphSnap.docs.map((doc) => ({ path: doc.ref.path, id: doc.id, data: doc.data() || {} })),
  };
}

function findAuthor(rows, authorId, expectedName) {
  const author = rows.authors.find((row) => row.id === authorId);
  if (!author) throw new Error(`Missing author ${authorId}.`);
  if (normalize(readName(author.data)) !== normalize(expectedName)) {
    throw new Error(`Author ${authorId} name mismatch: expected ${expectedName}, got ${readName(author.data)}.`);
  }
  return author;
}

function findBook(rows, target) {
  const book = rows.books.find((row) => row.id === target.bookId);
  if (!book) throw new Error(`Missing book ${target.bookId} (${target.title}).`);
  if (normalize(readTitle(book.data)) !== normalize(target.title)) {
    throw new Error(`Book ${target.bookId} title mismatch: expected ${target.title}, got ${readTitle(book.data)}.`);
  }
  return book;
}

function listActiveDuplicateClusters(rows) {
  const groups = new Map();
  for (const author of rows.authors.filter((row) => isActiveAuthor(row.data))) {
    const key = normalize(readName(author.data));
    if (!key) continue;
    const bucket = groups.get(key) || [];
    bucket.push(author.id);
    groups.set(key, bucket);
  }
  return Array.from(groups.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([name, ids]) => ({ name, ids: ids.sort() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function listNameLinkageGaps(rows) {
  const gaps = [];
  for (const author of rows.authors.filter((row) => isActiveAuthor(row.data))) {
    const authorName = readName(author.data);
    if (!authorName) continue;
    for (const book of rows.books) {
      if (isPublicReadableBook(book.data) && book.data.authorEn === authorName && book.data.authorId !== author.id) {
        gaps.push({
          bookId: book.id,
          title: readTitle(book.data),
          currentAuthorId: book.data.authorId || "",
          expectedAuthorId: author.id,
          expectedAuthor: authorName,
        });
      }
    }
  }
  return gaps.sort((left, right) => left.title.localeCompare(right.title));
}

function buildPlan(rows) {
  const clusterPlans = PLAN.map((target) => {
    const survivor = findAuthor(rows, target.survivorAuthorId, target.survivorName);
    if (!isActiveAuthor(survivor.data)) {
      throw new Error(`Survivor ${target.survivorAuthorId} is not active.`);
    }

    const authorDocsToMark = target.loserAuthorIds.map((loserId) => {
      const loser = findAuthor(rows, loserId, target.authorName);
      if (!isActiveAuthor(loser.data)) return null;
      return loser;
    }).filter(Boolean);

    const loserSet = new Set(target.loserAuthorIds);
    const booksToRepoint = target.bookRepoints.map((bookTarget) => {
      const book = findBook(rows, bookTarget);
      if (book.data.authorId === target.survivorAuthorId) return null;
      if (!loserSet.has(book.data.authorId)) {
        throw new Error(`Book ${bookTarget.title} points to unexpected author ${book.data.authorId}.`);
      }
      return book;
    }).filter(Boolean);

    const identityRecordsDeferred = rows.identities.filter((identity) =>
      [identity.id, identity.data.authorId, identity.data.canonicalAuthorId, identity.data.survivingAuthorId, identity.data.targetAuthorId].some((value) =>
        loserSet.has(value)
      )
    );
    const quotesToRepoint = rows.quotes.filter((quote) => loserSet.has(quote.data.authorId));
    const interactionsToRepoint = rows.interactions.filter((interaction) => hasAuthorRef(interaction.data, loserSet));
    const graphToRepoint = rows.graph.filter((relationship) => {
      const serialized = JSON.stringify(relationship.data);
      return target.loserAuthorIds.some((loserId) => serialized.includes(loserId));
    });

    return {
      ...target,
      survivorPath: survivor.path,
      authorDocsToMark,
      booksToRepoint,
      identityRecordsDeferred,
      quotesToRepoint,
      interactionsToRepoint,
      graphToRepoint,
    };
  });

  const requiredBookStates = REQUIRED_BOOK_STATES.map((target) => {
    const book = findBook(rows, target);
    if (book.data.authorId !== target.authorId) {
      throw new Error(`${target.title} expected authorId ${target.authorId}, got ${book.data.authorId || ""}.`);
    }
    return {
      bookId: book.id,
      title: readTitle(book.data),
      authorId: book.data.authorId,
      authorName: target.authorName,
    };
  });

  return {
    clusterPlans,
    requiredBookStates,
    activeDuplicateClustersBefore: listActiveDuplicateClusters(rows),
    nameLinkageGapsBefore: listNameLinkageGaps(rows),
  };
}

function summarize(plan) {
  return {
    clusters: plan.clusterPlans.length,
    losers: plan.clusterPlans.reduce((sum, cluster) => sum + cluster.authorDocsToMark.length, 0),
    bookRepoints: plan.clusterPlans.reduce((sum, cluster) => sum + cluster.booksToRepoint.length, 0),
    authorIdentityRepoints: 0,
    authorIdentityDeferred: plan.clusterPlans.reduce((sum, cluster) => sum + cluster.identityRecordsDeferred.length, 0),
    quotes: plan.clusterPlans.reduce((sum, cluster) => sum + cluster.quotesToRepoint.length, 0),
    interactions: plan.clusterPlans.reduce((sum, cluster) => sum + cluster.interactionsToRepoint.length, 0),
    graph: plan.clusterPlans.reduce((sum, cluster) => sum + cluster.graphToRepoint.length, 0),
    writes: plan.clusterPlans.reduce(
      (sum, cluster) => sum + cluster.authorDocsToMark.length + cluster.booksToRepoint.length,
      0
    ),
  };
}

function assertPlan(summary) {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (summary[key] !== expected) throw new Error(`Expected ${key}=${expected}, got ${summary[key]}.`);
  }
  if (summary.quotes || summary.interactions || summary.graph) {
    throw new Error(
      `Unexpected dependent refs detected: quotes=${summary.quotes}, interactions=${summary.interactions}, graph=${summary.graph}.`
    );
  }
}

function exportSnapshot({ projectId, execute, plan, summary, rows }) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "migration-reports", `${MIGRATION_ID}-${now}`);
  fs.mkdirSync(dir, { recursive: true });

  const touched = new Set();
  for (const cluster of plan.clusterPlans) {
    cluster.authorDocsToMark.forEach((row) => touched.add(row.path));
    cluster.booksToRepoint.forEach((row) => touched.add(row.path));
  }

  const rollbackDocs = [...rows.authors, ...rows.books]
    .filter((row) => touched.has(row.path))
    .map((row) => ({ path: row.path, id: row.id, data: row.data }));

  const report = {
    migrationId: MIGRATION_ID,
    projectId,
    mode: execute ? "execute" : "dry_run",
    exportedAt: new Date().toISOString(),
    summary,
    activeDuplicateClustersBefore: plan.activeDuplicateClustersBefore,
    nameLinkageGapsBefore: plan.nameLinkageGapsBefore,
    requiredBookStates: plan.requiredBookStates,
    clusterPlans: plan.clusterPlans.map((cluster) => ({
      authorName: cluster.authorName,
      survivorAuthorId: cluster.survivorAuthorId,
      loserAuthorIds: cluster.authorDocsToMark.map((row) => row.id),
      booksToRepoint: cluster.booksToRepoint.map((book) => ({
        path: book.path,
        title: readTitle(book.data),
        from: book.data.authorId || "",
        to: cluster.survivorAuthorId,
      })),
      identityPolicy: cluster.identityPolicy,
      identityRecordsDeferred: cluster.identityRecordsDeferred.map((identity) => ({
        path: identity.path,
        id: identity.id,
        authorId: identity.data.authorId || "",
        canonicalAuthorId: identity.data.canonicalAuthorId || "",
      })),
    })),
  };

  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, "rollback-snapshot.json"), JSON.stringify({ migrationId: MIGRATION_ID, docs: rollbackDocs }, null, 2));
  return dir;
}

async function executePlan(db, clusterPlans) {
  const batch = db.batch();
  const mergedAt = FieldValue.serverTimestamp();

  for (const cluster of clusterPlans) {
    for (const author of cluster.authorDocsToMark) {
      batch.set(
        db.doc(author.path),
        {
          lifecycleState: "merged",
          authorityState: "merged",
          status: "merged",
          canonicalAuthorId: cluster.survivorAuthorId,
          mergeTargetAuthorId: cluster.survivorAuthorId,
          mergedAt,
          updatedAt: mergedAt,
          remainingAuthorClusterResolution: {
            migrationId: MIGRATION_ID,
            survivorAuthorId: cluster.survivorAuthorId,
            identityPolicy: cluster.identityPolicy,
          },
        },
        { merge: true }
      );
    }

    for (const book of cluster.booksToRepoint) {
      batch.set(
        db.doc(book.path),
        {
          authorId: cluster.survivorAuthorId,
          updatedAt: mergedAt,
          remainingAuthorClusterResolution: {
            migrationId: MIGRATION_ID,
            previousAuthorId: book.data.authorId || "",
          },
        },
        { merge: true }
      );
    }
  }

  await batch.commit();
}

async function main() {
  const { projectId, execute } = ensureProject();
  const db = getFirestore();
  const rows = await loadCollections(db);
  const plan = buildPlan(rows);
  const summary = summarize(plan);
  assertPlan(summary);
  const reportDir = exportSnapshot({ projectId, execute, plan, summary, rows });

  console.log(JSON.stringify({
    migrationId: MIGRATION_ID,
    projectId,
    mode: execute ? "execute" : "dry_run",
    reportDir,
    summary,
    survivors: plan.clusterPlans.map((cluster) => ({
      authorName: cluster.authorName,
      survivorAuthorId: cluster.survivorAuthorId,
      identityPolicy: cluster.identityPolicy,
    })),
    requiredBookStates: plan.requiredBookStates,
  }, null, 2));

  if (!execute) {
    console.log("[DRY_RUN] No writes performed. Re-run with --execute --confirm-production to commit.");
    return;
  }

  await executePlan(db, plan.clusterPlans);
  console.log("[EXECUTE] Commit complete.");
}

main().catch((error) => {
  console.error("[REMAINING_AUTHOR_CLUSTER_RESOLUTION_FAILED]", error);
  process.exitCode = 1;
});
