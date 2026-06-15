#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

const APPROVED = {
  clusters: 88,
  losers: 96,
  books: 14,
  authorIdentity: 143,
  writes: 253,
  excludedClusters: new Set(["gabriel garcia marquez", "thomas mann"]),
};

const MIGRATION_ID = "BT-AUTHOR-MERGE-EXECUTION-001";

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

function isCanonicalish(data) {
  const state = String(data.lifecycleState || data.authorityState || data.status || "").toLowerCase();
  return !(
    data.requiresCanonicalization === true ||
    data.mergeTargetAuthorId ||
    data.mergedIntoAuthorId ||
    data.supersededByAuthorId ||
    ["merged", "split", "superseded", "archived"].includes(state)
  );
}

function scoreMember(member) {
  const knownBirth = member.canonicalKey && !member.canonicalKey.endsWith("::unknown") ? 50 : 0;
  const authority = member.identityRecords.filter((row) => row.id.startsWith("authority:")).length * 25;
  const wikidata = member.identityRecords.filter((row) => row.id.includes("wikidata")).length * 20;
  return member.books.length * 100 + member.identityRecords.length * 10 + knownBirth + authority + wikidata;
}

function hasAuthorRef(data, loserSet) {
  return Object.entries(data || {}).some(([key, value]) => {
    if (typeof value === "string" && /authorid$/i.test(key)) return loserSet.has(value);
    if (Array.isArray(value) && /authorids$/i.test(key)) return value.some((item) => loserSet.has(item));
    return false;
  });
}

function patchAuthorIdentity(data, loserSet, survivorAuthorId) {
  const patch = {};
  for (const field of ["authorId", "canonicalAuthorId", "survivingAuthorId", "targetAuthorId"]) {
    if (loserSet.has(data[field])) patch[field] = survivorAuthorId;
  }
  return patch;
}

function ensureProject() {
  const projectId = arg("project-id") || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "";
  const execute = flag("execute");
  if (!projectId) throw new Error("Missing --project-id=<project id>.");
  if (execute && !flag("confirm-production")) {
    throw new Error("Refusing execution without --confirm-production.");
  }
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId });
  }
  return { projectId, execute };
}

async function loadCollections(db) {
  const [
    authorsSnap,
    booksSnap,
    identitySnap,
    quotesSnap,
    interactionsSnap,
    graphSnap,
  ] = await Promise.all([
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

function buildPlan(rows) {
  const groups = new Map();
  for (const author of rows.authors.filter((row) => isCanonicalish(row.data))) {
    const key = normalize(readName(author.data));
    if (!key) continue;
    const bucket = groups.get(key) || [];
    bucket.push(author);
    groups.set(key, bucket);
  }

  const contaminatedPresent = [];
  const plans = [];

  for (const [authorName, authors] of groups.entries()) {
    if (authors.length < 2) continue;
    if (APPROVED.excludedClusters.has(authorName)) {
      contaminatedPresent.push(authorName);
      continue;
    }

    const members = authors.map((author) => {
      const identityRecords = rows.identities.filter((identity) =>
        [identity.id, identity.data.authorId, identity.data.canonicalAuthorId, identity.data.survivingAuthorId, identity.data.targetAuthorId].includes(author.id)
      );
      const books = rows.books.filter((book) => book.data.authorId === author.id);
      return {
        id: author.id,
        path: author.path,
        canonicalKey: String(author.data.canonicalKey || ""),
        books,
        identityRecords,
        score: 0,
      };
    });

    members.forEach((member) => {
      member.score = scoreMember(member);
    });
    members.sort(
      (left, right) =>
        right.score - left.score ||
        right.books.length - left.books.length ||
        right.identityRecords.length - left.identityRecords.length ||
        left.id.localeCompare(right.id)
    );

    const survivor = members[0];
    const loserIds = members.slice(1).map((member) => member.id);
    const loserSet = new Set(loserIds);
    if (!survivor?.id || loserIds.length === 0) {
      throw new Error(`Invalid merge plan for ${authorName}.`);
    }

    const booksToRepoint = rows.books.filter((book) => loserSet.has(book.data.authorId));
    const identityRecordsToRepoint = rows.identities.filter((identity) =>
      [identity.id, identity.data.authorId, identity.data.canonicalAuthorId, identity.data.survivingAuthorId, identity.data.targetAuthorId].some((value) =>
        loserSet.has(value)
      )
    );
    const quotesToRepoint = rows.quotes.filter((quote) => loserSet.has(quote.data.authorId));
    const interactionsToRepoint = rows.interactions.filter((interaction) => hasAuthorRef(interaction.data, loserSet));
    const graphToRepoint = rows.graph.filter((relationship) => {
      const serialized = JSON.stringify(relationship.data);
      return Array.from(loserSet).some((loserId) => serialized.includes(loserId));
    });

    plans.push({
      authorName,
      survivorAuthorId: survivor.id,
      loserAuthorIds: loserIds,
      authorDocsToMark: members.slice(1).map((member) => ({ path: member.path, id: member.id })),
      booksToRepoint,
      identityRecordsToRepoint,
      quotesToRepoint,
      interactionsToRepoint,
      graphToRepoint,
    });
  }

  plans.sort((left, right) => left.authorName.localeCompare(right.authorName));
  return { plans, contaminatedPresent };
}

function summarize(plans) {
  return {
    clusters: plans.length,
    losers: plans.reduce((sum, plan) => sum + plan.loserAuthorIds.length, 0),
    books: plans.reduce((sum, plan) => sum + plan.booksToRepoint.length, 0),
    authorIdentity: plans.reduce((sum, plan) => sum + plan.identityRecordsToRepoint.length, 0),
    quotes: plans.reduce((sum, plan) => sum + plan.quotesToRepoint.length, 0),
    interactions: plans.reduce((sum, plan) => sum + plan.interactionsToRepoint.length, 0),
    graph: plans.reduce((sum, plan) => sum + plan.graphToRepoint.length, 0),
    writes: plans.reduce(
      (sum, plan) =>
        sum + plan.authorDocsToMark.length + plan.booksToRepoint.length + plan.identityRecordsToRepoint.length,
      0
    ),
  };
}

function assertPlan(summary, contaminatedPresent) {
  if (contaminatedPresent.length !== APPROVED.excludedClusters.size) {
    throw new Error(`Expected contaminated clusters to remain excluded; found ${contaminatedPresent.join(", ") || "none"}.`);
  }
  if (summary.clusters !== APPROVED.clusters) throw new Error(`Expected ${APPROVED.clusters} clusters, got ${summary.clusters}.`);
  if (summary.losers !== APPROVED.losers) throw new Error(`Expected ${APPROVED.losers} losers, got ${summary.losers}.`);
  if (summary.books !== APPROVED.books) throw new Error(`Expected ${APPROVED.books} book repoints, got ${summary.books}.`);
  if (summary.authorIdentity !== APPROVED.authorIdentity) {
    throw new Error(`Expected ${APPROVED.authorIdentity} author_identity repoints, got ${summary.authorIdentity}.`);
  }
  if (summary.writes !== APPROVED.writes) throw new Error(`Expected ${APPROVED.writes} writes, got ${summary.writes}.`);
  if (summary.quotes || summary.interactions || summary.graph) {
    throw new Error(
      `Unexpected dependent refs detected: quotes=${summary.quotes}, interactions=${summary.interactions}, graph=${summary.graph}.`
    );
  }
}

function exportSnapshot({ projectId, execute, plans, summary, rows }) {
  const now = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "migration-reports", `${MIGRATION_ID}-${now}`);
  fs.mkdirSync(dir, { recursive: true });

  const touched = new Set();
  for (const plan of plans) {
    plan.authorDocsToMark.forEach((row) => touched.add(row.path));
    plan.booksToRepoint.forEach((row) => touched.add(row.path));
    plan.identityRecordsToRepoint.forEach((row) => touched.add(row.path));
  }

  const allRows = [...rows.authors, ...rows.books, ...rows.identities];
  const docs = allRows
    .filter((row) => touched.has(row.path))
    .map((row) => ({ path: row.path, id: row.id, data: row.data }));

  const report = {
    migrationId: MIGRATION_ID,
    projectId,
    mode: execute ? "execute" : "dry_run",
    exportedAt: new Date().toISOString(),
    summary,
    clusterPlans: plans.map((plan) => ({
      authorName: plan.authorName,
      survivorAuthorId: plan.survivorAuthorId,
      loserAuthorIds: plan.loserAuthorIds,
      booksToRepoint: plan.booksToRepoint.map((book) => ({
        path: book.path,
        title: book.data.title || book.data.titleEn || "",
        from: book.data.authorId,
        to: plan.survivorAuthorId,
      })),
      identityRecordsToRepoint: plan.identityRecordsToRepoint.map((identity) => identity.path),
    })),
  };

  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(dir, "rollback-snapshot.json"), JSON.stringify({ migrationId: MIGRATION_ID, docs }, null, 2));
  return dir;
}

async function executePlan(db, plans) {
  const batch = db.batch();
  const mergedAt = FieldValue.serverTimestamp();

  for (const plan of plans) {
    const loserSet = new Set(plan.loserAuthorIds);
    for (const row of plan.authorDocsToMark) {
      batch.set(
        db.doc(row.path),
        {
          lifecycleState: "merged",
          authorityState: "merged",
          status: "merged",
          canonicalAuthorId: plan.survivorAuthorId,
          mergeTargetAuthorId: plan.survivorAuthorId,
          mergedAt,
          updatedAt: mergedAt,
          authorityMergeMigration: {
            migrationId: MIGRATION_ID,
            survivorAuthorId: plan.survivorAuthorId,
          },
        },
        { merge: true }
      );
    }

    for (const book of plan.booksToRepoint) {
      batch.set(
        db.doc(book.path),
        {
          authorId: plan.survivorAuthorId,
          updatedAt: mergedAt,
          authorityMergeMigration: {
            migrationId: MIGRATION_ID,
            previousAuthorId: book.data.authorId,
          },
        },
        { merge: true }
      );
    }

    for (const identity of plan.identityRecordsToRepoint) {
      batch.set(
        db.doc(identity.path),
        {
          ...patchAuthorIdentity(identity.data, loserSet, plan.survivorAuthorId),
          updatedAt: mergedAt,
          authorityMergeMigration: {
            migrationId: MIGRATION_ID,
            survivorAuthorId: plan.survivorAuthorId,
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
  const { plans, contaminatedPresent } = buildPlan(rows);
  const summary = summarize(plans);
  assertPlan(summary, contaminatedPresent);
  const reportDir = exportSnapshot({ projectId, execute, plans, summary, rows });

  console.log(JSON.stringify({
    migrationId: MIGRATION_ID,
    projectId,
    mode: execute ? "execute" : "dry_run",
    reportDir,
    summary,
    contaminatedExcluded: contaminatedPresent,
  }, null, 2));

  if (!execute) {
    console.log("[DRY_RUN] No writes performed. Re-run with --execute --confirm-production to commit.");
    return;
  }

  await executePlan(db, plans);
  console.log("[EXECUTE] Commit complete.");
}

main().catch((error) => {
  console.error("[AUTHOR_MERGE_EXECUTION_FAILED]", error);
  process.exitCode = 1;
});
