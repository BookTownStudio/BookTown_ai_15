#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { initializeApp: initializeAdminApp, cert, getApps } = require("firebase-admin/app");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");

const DEFAULT_PROJECT_ID = "booktown-ai";
const DEFAULT_EXECUTOR_UID = "CwRxG1Kyykaw4koGJdYcniGsEdi1";
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_DOCS = 500;
const MAX_MAX_DOCS = 5000;
const DEFAULT_MAX_PAGES = 200;
const MAX_MAX_PAGES = 20000;
const DEFAULT_PAGE_DELAY_MS = 100;
const MAX_PAGE_DELAY_MS = 10000;

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

function asPositiveInt(value, fallback, hardMax) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const normalized = Math.trunc(n);
  if (normalized <= 0) return fallback;
  return Math.min(normalized, hardMax);
}

function asNonEmptyString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message, details) {
  const payload = details ? { message, details } : { message };
  console.error("[BACKFILL][SEED_AUTHOR_SOURCE][FAIL]", JSON.stringify(payload));
  process.exit(1);
}

function normalizeBackfillResponse(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Backfill returned non-object payload.");
  }

  if (raw.success === false) {
    const code = raw.error?.code || "unknown";
    const message = raw.error?.message || "Callable reported failure.";
    throw new Error(`${code}: ${message}`);
  }

  if (raw.success === true) {
    if (!raw.data || typeof raw.data !== "object") {
      throw new Error("Callable returned malformed envelope.");
    }
    return raw.data;
  }

  return raw;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/backfillSeedAuthorSourceMetadata.cjs [options]

Options:
  --dry-run=true|false             Default: true
  --page-size=<n>                  Default: 50 (max: 100)
  --max-docs=<n>                   Default: 500 (max: 5000), per invocation
  --max-pages=<n>                  Default: 200
  --page-delay-ms=<n>              Default: 100 (max: 10000)
  --cursor=<docId>                 Optional starting cursor
  --project-id=<id>                Default: env FIREBASE_PROJECT_ID or "booktown-ai"
  --service-account=<path>         Default: env SERVICE_ACCOUNT_PATH or ../../scripts/serviceAccountKey.json
  --executor-uid=<uid>             Default: env BACKFILL_EXECUTOR_UID or repo superadmin UID
  --confirm-production=true        Required for write mode against "booktown-ai"
  --help                           Show this help
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true" || args.help === true) {
    printUsage();
    return;
  }

  const dryRun = asBool(args["dry-run"], true);
  const projectId = String(
    args["project-id"] || process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID
  ).trim();
  const serviceAccountPath = path.resolve(
    process.cwd(),
    args["service-account"] ||
      process.env.SERVICE_ACCOUNT_PATH ||
      path.join(__dirname, "../../scripts/serviceAccountKey.json")
  );
  const executorUid =
    asNonEmptyString(args["executor-uid"]) ||
    asNonEmptyString(process.env.BACKFILL_EXECUTOR_UID) ||
    DEFAULT_EXECUTOR_UID;
  const pageSize = asPositiveInt(args["page-size"], DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxDocs = asPositiveInt(args["max-docs"], DEFAULT_MAX_DOCS, MAX_MAX_DOCS);
  const maxPages = asPositiveInt(args["max-pages"], DEFAULT_MAX_PAGES, MAX_MAX_PAGES);
  const pageDelayMs = asPositiveInt(
    args["page-delay-ms"],
    DEFAULT_PAGE_DELAY_MS,
    MAX_PAGE_DELAY_MS
  );
  const confirmProduction = asBool(args["confirm-production"], false);
  let cursor = asNonEmptyString(args.cursor);

  if (!fs.existsSync(serviceAccountPath)) {
    fail("Service account file was not found.", { serviceAccountPath });
  }

  if (!dryRun && projectId === DEFAULT_PROJECT_ID && !confirmProduction) {
    fail("Production write mode requires explicit confirmation.", {
      projectId,
      requiredFlag: "--confirm-production=true",
    });
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

  console.log(
    "[BACKFILL][SEED_AUTHOR_SOURCE][START]",
    JSON.stringify({
      projectId,
      dryRun,
      pageSize,
      maxDocs,
      maxPages,
      pageDelayMs,
      startCursor: cursor,
      executorUid,
      serviceAccountPath,
    })
  );

  if (getApps().length === 0) {
    initializeAdminApp({
      credential: cert(serviceAccount),
      projectId,
    });
  }

  const adminAuth = getAdminAuth();
  const executorRecord = await adminAuth.getUser(executorUid);
  if (!executorRecord.customClaims || executorRecord.customClaims.role !== "superadmin") {
    fail("Executor UID is not a superadmin user.", {
      executorUid,
    });
  }

  const compiledCallablePath = path.join(
    __dirname,
    "../lib/library/backfillSeedAuthorSourceMetadata.js"
  );
  if (!fs.existsSync(compiledCallablePath)) {
    fail("Compiled callable not found. Run `npm run build` in /functions first.", {
      compiledCallablePath,
    });
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { backfillSeedAuthorSourceMetadata } = require(compiledCallablePath);
  if (typeof backfillSeedAuthorSourceMetadata?.run !== "function") {
    fail("Compiled callable does not expose a runnable handler.", {
      compiledCallablePath,
    });
  }

  let pages = 0;
  let hasMore = true;
  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalUnchanged = 0;
  let totalSkippedHasProviderIds = 0;

  while (hasMore && pages < maxPages) {
    pages += 1;

    const response = await backfillSeedAuthorSourceMetadata.run({
      auth: {
        uid: executorUid,
        token: {
          admin: true,
          role: "superadmin",
        },
      },
      data: {
        dryRun,
        pageSize,
        maxDocs,
        ...(cursor ? { cursorDocId: cursor } : {}),
      },
    });

    const data = normalizeBackfillResponse(response);
    totalProcessed += data.processed || 0;
    totalUpdated += data.updated || 0;
    totalUnchanged += data.unchanged || 0;
    totalSkippedHasProviderIds += data.skippedHasProviderIds || 0;

    hasMore = data.hasMore === true;
    cursor =
      typeof data.nextCursorDocId === "string" && data.nextCursorDocId
        ? data.nextCursorDocId
        : null;

    console.log(
      "[BACKFILL][SEED_AUTHOR_SOURCE][PAGE]",
      JSON.stringify({
        page: pages,
        dryRun,
        processed: data.processed || 0,
        updated: data.updated || 0,
        unchanged: data.unchanged || 0,
        skippedHasProviderIds: data.skippedHasProviderIds || 0,
        hasMore,
        nextCursorDocId: cursor,
        previewAuthorIds: Array.isArray(data.previewAuthorIds)
          ? data.previewAuthorIds.length
          : 0,
      })
    );

    if (hasMore && pageDelayMs > 0) {
      await sleep(pageDelayMs);
    }
  }

  if (hasMore && pages >= maxPages) {
    fail("Stopped before completion due to max-pages safety cap.", {
      maxPages,
      lastCursor: cursor,
    });
  }

  console.log(
    "[BACKFILL][SEED_AUTHOR_SOURCE][COMPLETE]",
    JSON.stringify({
      projectId,
      dryRun,
      pages,
      processed: totalProcessed,
      updated: totalUpdated,
      unchanged: totalUnchanged,
      skippedHasProviderIds: totalSkippedHasProviderIds,
      finalCursor: cursor,
    })
  );
}

main().catch((error) => {
  fail("Seed author source metadata backfill runner crashed.", {
    error: String(error),
  });
});
