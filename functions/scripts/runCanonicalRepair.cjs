#!/usr/bin/env node

/**
 * Canonical null metadata repair runner
 * -------------------------------------
 * Scans canonical books with missing literaryForm or description and executes
 * the compiled server repair logic directly with Firebase Admin SDK.
 * No HTTP callable transport and no provider calls are used.
 *
 * Optional env:
 * - FIREBASE_PROJECT_ID (default: booktown-ai)
 * - SERVICE_ACCOUNT_PATH (default: ../../scripts/serviceAccountKey.json)
 */

const fs = require("fs");
const path = require("path");

const { initializeApp: initializeAdminApp, cert, getApps } = require("firebase-admin/app");
const { FieldPath, getFirestore } = require("firebase-admin/firestore");

const DEFAULT_PROJECT_ID = "booktown-ai";
const DEFAULT_PAGE_SIZE = 250;
const MAX_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 20_000;

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

function asNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function missing(value) {
  return !asNonEmptyString(value);
}

function normalizedDescription(data) {
  const raw =
    asNonEmptyString(data.description) ||
    asNonEmptyString(data.descriptionEn) ||
    asNonEmptyString(data.abstractDescription);
  const stripped =
    raw.includes("<") && raw.includes(">")
      ? raw.replace(/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?\s*\/?>/gu, " ")
      : raw;
  return stripped.replace(/\s+/gu, " ").trim();
}

function providerSourcedDescription(data) {
  const source = asNonEmptyString(data.descriptionSource) || asNonEmptyString(data.source);
  return [
    "googleBooks",
    "openLibrary",
    "worldcat",
    "loc",
    "gutenberg",
    "hindawi",
    "gallica",
  ].includes(source);
}

function pollutedLongDescription(data) {
  const description = normalizedDescription(data);
  if (description.length < 280) return false;
  if (providerSourcedDescription(data)) return true;
  return /\b(wikipedia|free encyclopedia|source citation|catalog(?:ue)? record|publisher metadata|bibliograph(?:y|ic)|external links?|isbn|this edition|student edition|classroom|quoted archive notes?)\b/iu.test(
    description
  );
}

function describeRepairFields(data) {
  return {
    literaryForm: data.literaryForm ?? null,
    description: data.description ?? null,
    descriptionEn: data.descriptionEn ?? null,
    abstractDescription: data.abstractDescription ?? null,
  };
}

function describeIdentityFields(id, data) {
  return {
    bookId: id,
    canonicalBookId: data.canonicalBookId ?? null,
    canonicalKey: data.canonicalKey ?? null,
    authorCanonicalKey: data.authorCanonicalKey ?? null,
    title: data.title ?? null,
    author: data.author ?? null,
  };
}

function fail(message, details) {
  console.error(
    "[CANONICAL_REPAIR][FAIL]",
    JSON.stringify(details ? { message, details } : { message })
  );
  process.exit(1);
}

function printUsage() {
  console.log(`
Usage:
  node scripts/runCanonicalRepair.cjs --confirm=true [options]

Options:
  --confirm=true             Required. This script mutates Firestore.
  --page-size=<n>            Default: 250 (max: 500)
  --max-pages=<n>            Default: 20000, scan safety cap
  --project-id=<id>          Default: env FIREBASE_PROJECT_ID or "booktown-ai"
  --service-account=<path>   Default: env SERVICE_ACCOUNT_PATH or ../../scripts/serviceAccountKey.json
  --help                     Show this help
`);
}

async function readCanonicalPage(db, pageSize, cursorDocId) {
  let query = db
    .collection("books")
    .where("authorityStatus", "==", "canonical")
    .orderBy(FieldPath.documentId())
    .limit(pageSize);
  if (cursorDocId) {
    query = query.startAfter(cursorDocId);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => ({
    bookId: doc.id,
    data: doc.data() || {},
  }));
}

function selectMissingMetadataCandidates(page) {
  return page.filter(
    ({ data }) =>
      !asNonEmptyString(data.mergedInto) &&
      (missing(data.literaryForm) || missing(data.description) || pollutedLongDescription(data))
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true" || args.help === true) {
    printUsage();
    return;
  }

  if (!asBool(args.confirm, false)) {
    fail("Explicit confirmation is required before mutating Firestore.", {
      requiredFlag: "--confirm=true",
    });
  }

  const pageSize = asPositiveInt(args["page-size"], DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxPages = asPositiveInt(args["max-pages"], DEFAULT_MAX_PAGES, DEFAULT_MAX_PAGES);
  const projectId = String(
    args["project-id"] || process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID
  ).trim();
  const serviceAccountPath = path.resolve(
    process.cwd(),
    args["service-account"] ||
      process.env.SERVICE_ACCOUNT_PATH ||
      path.join(__dirname, "../../scripts/serviceAccountKey.json")
  );
  const compiledRepairPath = path.join(__dirname, "../lib/admin/literaryAuthority.js");

  if (!fs.existsSync(serviceAccountPath)) {
    fail("Service account file was not found.", { serviceAccountPath });
  }
  if (!fs.existsSync(compiledRepairPath)) {
    fail("Compiled repair module not found. Run `npm run build` in /functions first.", {
      compiledRepairPath,
    });
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
  if (getApps().length === 0) {
    initializeAdminApp({
      credential: cert(serviceAccount),
      projectId,
    });
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { runCanonicalNullSeedMetadataRepair } = require(compiledRepairPath);
  if (typeof runCanonicalNullSeedMetadataRepair !== "function") {
    fail("Compiled repair module does not expose runCanonicalNullSeedMetadataRepair.", {
      compiledRepairPath,
    });
  }

  const db = getFirestore();
  console.log(
    "[CANONICAL_REPAIR][START]",
    JSON.stringify({
      projectId,
      mode: "direct_all_missing",
      pageSize,
      maxPages,
      serviceAccountPath,
    })
  );

  let cursorDocId = null;
  let page = 0;
  const totals = {
    processedCount: 0,
    candidateCount: 0,
    repairedCount: 0,
    unchangedCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };

  while (page < maxPages) {
    page += 1;
    const beforePage = await readCanonicalPage(db, pageSize, cursorDocId);
    if (beforePage.length === 0) {
      break;
    }

    const beforeByBookId = new Map(beforePage.map((entry) => [entry.bookId, entry.data]));
    const candidates = selectMissingMetadataCandidates(beforePage);
    for (const candidate of candidates) {
      console.log(
        "[CANONICAL_REPAIR][BEFORE]",
        JSON.stringify({
          page,
          identity: describeIdentityFields(candidate.bookId, candidate.data),
          fields: describeRepairFields(candidate.data),
        })
      );
    }

    const result = await runCanonicalNullSeedMetadataRepair({
      pageSize,
      maxDocs: pageSize,
      ...(cursorDocId ? { cursorDocId } : {}),
    });

    totals.processedCount += result.summary.processedCount || 0;
    totals.candidateCount += result.summary.candidateCount || 0;
    totals.repairedCount += result.summary.repairedCount || 0;
    totals.unchangedCount += result.summary.unchangedCount || 0;
    totals.skippedCount += result.summary.skippedCount || 0;
    totals.failedCount += result.summary.failedCount || 0;

    for (const row of result.rows) {
      const afterSnap = await db.collection("books").doc(row.bookId).get();
      if (!afterSnap.exists) {
        fail("Canonical row disappeared after repair.", { row });
      }
      const before = beforeByBookId.get(row.bookId) || {};
      const after = afterSnap.data() || {};
      console.log(
        "[CANONICAL_REPAIR][AFTER]",
        JSON.stringify({
          page,
          status: row.status,
          updatedFields: row.updatedFields || [],
          message: row.message || null,
          identity: describeIdentityFields(row.bookId, after),
          before: describeRepairFields(before),
          after: describeRepairFields(after),
        })
      );
    }

    console.log(
      "[CANONICAL_REPAIR][PAGE]",
      JSON.stringify({
        page,
        summary: result.summary,
      })
    );

    if (result.rows.some((row) => row.status === "failed")) {
      fail("Repair page returned failed rows.", { page, rows: result.rows });
    }

    if (!result.summary.hasMore || !result.summary.nextCursorDocId) {
      break;
    }
    cursorDocId = result.summary.nextCursorDocId;
  }

  if (page >= maxPages) {
    fail("Stopped before completion due to max-pages safety cap.", {
      maxPages,
      cursorDocId,
      totals,
    });
  }

  console.log(
    "[CANONICAL_REPAIR][COMPLETE]",
    JSON.stringify({
      projectId,
      pages: page,
      totals,
    })
  );
}

main().catch((error) => {
  fail("Canonical repair runner crashed.", {
    error: error instanceof Error ? error.stack || error.message : String(error),
  });
});
