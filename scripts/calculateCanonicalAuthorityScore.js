#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const admin = require("../functions/node_modules/firebase-admin");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --------------------------------
// CONFIG
// --------------------------------

const DEFAULT_PROJECT_ID = "booktown-ai";
const DEFAULT_PAGE_SIZE = 250;
const MAX_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 20000;
const BATCH_LIMIT = 450;

// --------------------------------
// TIER POINTS
// --------------------------------

const TIER_POINTS = new Map([
  ["tier1", 70],
  ["1", 70],
  ["tier2", 35],
  ["2", 35],
  ["tier3", 10],
  ["3", 10],
]);

// --------------------------------
// COMPLETENESS FIELDS (TYPE-AWARE)
// --------------------------------

const STANDARD_COMPLETENESS_FIELDS = [
  "title",
  "author",
  "publicationYear",
  "description",
  "cover",
  "originalLanguage",
];

const RELIGIOUS_COMPLETENESS_FIELDS = [
  "title",
  "canonicalFingerprint",
  "canonicalTradition",
  "originalLanguage",
  "contributors",
];

const PHILOSOPHICAL_COMPLETENESS_FIELDS = [
  "title",
  "author",
  "publicationYear",
  "originalLanguage",
  "description",
];

// --------------------------------
// HELPERS
// --------------------------------

function parseArgs(argv) {
  const out = {};
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const withoutPrefix = raw.slice(2);
    const eqIndex = withoutPrefix.indexOf("=");
    if (eqIndex < 0) {
      out[withoutPrefix] = "true";
      continue;
    }
    out[withoutPrefix.slice(0, eqIndex)] = withoutPrefix.slice(eqIndex + 1);
  }
  return out;
}

function asBool(value, fallback) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes"].includes(normalized)) return true;
  if (["false", "0", "no"].includes(normalized)) return false;
  return fallback;
}

function asPositiveInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, max);
}

function hasValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function canonicalTierPoints(value) {
  if (!hasValue(value)) return 0;
  const normalized = String(value).trim().toLowerCase().replace(/\s+/g, "");
  return TIER_POINTS.get(normalized) || 0;
}

// --------------------------------
// COMPLETENESS SCORE (FIXED)
// --------------------------------

function calculateCompletenessScore(book) {
  let fields;

  if (book.canonicalType === "religious") {
    fields = RELIGIOUS_COMPLETENESS_FIELDS;
  } else if (book.canonicalType === "philosophical") {
    fields = PHILOSOPHICAL_COMPLETENESS_FIELDS;
  } else {
    fields = STANDARD_COMPLETENESS_FIELDS;
  }

  return fields.reduce(
    (sum, field) => sum + (hasValue(book[field]) ? 5 : 0),
    0
  );
}

// --------------------------------
// MAIN SCORE FUNCTION (RESTORED)
// --------------------------------

function calculateCanonicalAuthorityScore(book) {
  const tierScore = canonicalTierPoints(book.canonicalTier);
  const completenessScore = calculateCompletenessScore(book);
  const fingerprintScore = hasValue(book.canonicalFingerprint) ? 5 : 0;
  const duplicateAssumptionScore = 5;

  return {
    score: tierScore + completenessScore + fingerprintScore + duplicateAssumptionScore,
    components: {
      tierScore,
      completenessScore,
      fingerprintScore,
      duplicateAssumptionScore,
    },
  };
}

// --------------------------------
// ERROR HANDLING
// --------------------------------

function fail(message, details) {
  console.error(
    "[CANONICAL_AUTHORITY_SCORE][FAIL]",
    JSON.stringify(details ? { message, details } : { message })
  );
  process.exit(1);
}

function printUsage() {
  console.log(`
Usage:
  node scripts/calculateCanonicalAuthorityScore.js [options]
`);
}

// --------------------------------
// BATCH WRITES
// --------------------------------

async function commitBatch(db, writes, dryRun) {
  if (dryRun || writes.length === 0) return;
  const batch = db.batch();
  for (const write of writes) {
    batch.update(write.ref, write.patch);
  }
  await batch.commit();
}

// --------------------------------
// MAIN
// --------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const dryRun = asBool(args["dry-run"], true);
  const recompute = asBool(args.recompute, false);
  const confirm = asBool(args.confirm, false);
  const pageSize = asPositiveInt(args["page-size"], DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxPages = asPositiveInt(args["max-pages"], DEFAULT_MAX_PAGES, DEFAULT_MAX_PAGES);

  const projectId = String(
    args["project-id"] || process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID
  ).trim();

  const serviceAccountPath = path.resolve(
    process.cwd(),
    args["service-account"] ||
      process.env.SERVICE_ACCOUNT_PATH ||
      path.join(__dirname, "serviceAccountKey.json")
  );

  if (!dryRun && !confirm) {
    fail("Write mode requires --confirm=true");
  }

  if (!fs.existsSync(serviceAccountPath)) {
    fail("Missing service account", { serviceAccountPath });
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId,
    });
  }

  const db = admin.firestore();
  const documentId = admin.firestore.FieldPath.documentId();

  let cursor = null;
  let page = 0;

  const totals = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    skippedExisting: 0,
  };

  console.log("[CANONICAL_AUTHORITY_SCORE][START]");

  while (page < maxPages) {
    page++;

    let query = db.collection("books").orderBy(documentId).limit(pageSize);
    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();
    if (snap.empty) break;

    const writes = [];

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      totals.scanned++;

      const result = calculateCanonicalAuthorityScore(data);

      if (data.canonicalAuthorityScore === result.score) {
        totals.unchanged++;
        continue;
      }

      totals.updated++;

      writes.push({
        ref: doc.ref,
        patch: {
          canonicalAuthorityScore: result.score,
          canonicalAuthorityScoreUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
      });

      console.log("[UPDATE]", {
        title: data.title,
        nextScore: result.score,
      });

      if (writes.length >= BATCH_LIMIT) {
        await commitBatch(db, writes.splice(0, writes.length), dryRun);
      }
    }

    await commitBatch(db, writes, dryRun);

    cursor = snap.docs[snap.docs.length - 1].id;
  }

  console.log("[COMPLETE]", totals);
}

// --------------------------------
// RUN
// --------------------------------

main().finally(async () => {
  if (admin.apps.length) {
    await admin.app().delete();
  }
});