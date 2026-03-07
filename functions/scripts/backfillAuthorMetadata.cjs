#!/usr/bin/env node

/**
 * backfillAuthorMetadata runner
 * -----------------------------
 * Calls the compiled callable implementation directly in bounded loop mode.
 * This keeps the operational path aligned with server business logic while
 * avoiding transport/auth drift.
 *
 * Safety defaults:
 * - dry-run enabled by default
 * - bounded page size + docs per invocation
 * - bounded max pages
 * - production writes require explicit confirmation
 * - checkpoint persisted after every page for resumability
 *
 * Optional env:
 * - FIREBASE_PROJECT_ID
 * - SERVICE_ACCOUNT_PATH
 */

const fs = require("fs");
const path = require("path");

const { initializeApp: initializeAdminApp, cert, getApps } = require("firebase-admin/app");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");

const DEFAULT_PROJECT_ID = "booktown-ai";
const DEFAULT_EXECUTOR_UID = "CwRxG1Kyykaw4koGJdYcniGsEdi1";
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_DOCS = 100;
const MAX_MAX_DOCS = 2_000;
const DEFAULT_MAX_PAGES = 200;
const MAX_MAX_PAGES = 20_000;
const DEFAULT_PAGE_DELAY_MS = 250;
const MAX_PAGE_DELAY_MS = 10_000;

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

    const key = withoutPrefix.slice(0, eqIndex);
    const value = withoutPrefix.slice(eqIndex + 1);
    out[key] = value;
  }
  return out;
}

function asBool(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
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
  console.error("[BACKFILL][AUTHOR_METADATA][FAIL]", JSON.stringify(payload));
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

function getDefaultCheckpointPath(projectId) {
  return path.join(__dirname, `.backfillAuthorMetadata.${projectId}.checkpoint.json`);
}

function readCheckpoint(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
  } catch (error) {
    fail("Checkpoint file exists but could not be parsed.", {
      checkpointPath,
      error: String(error),
    });
  }
}

function writeCheckpoint(checkpointPath, payload) {
  fs.writeFileSync(checkpointPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function printUsage() {
  console.log(`
Usage:
  node scripts/backfillAuthorMetadata.cjs [options]

Options:
  --dry-run=true|false             Default: true
  --page-size=<n>                  Default: 25 (max: 100)
  --max-docs=<n>                   Default: 100 (max: 2000), per invocation
  --max-pages=<n>                  Default: 200, loop safety cap
  --page-delay-ms=<n>              Default: 250 (max: 10000)
  --cursor=<docId>                 Optional starting cursor
  --resume=true|false              Default: true, resume from checkpoint if present
  --checkpoint-file=<path>         Optional custom checkpoint path
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
  const pageSize = asPositiveInt(args["page-size"], DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const maxDocs = asPositiveInt(args["max-docs"], DEFAULT_MAX_DOCS, MAX_MAX_DOCS);
  const maxPages = asPositiveInt(args["max-pages"], DEFAULT_MAX_PAGES, MAX_MAX_PAGES);
  const pageDelayMs = asPositiveInt(
    args["page-delay-ms"],
    DEFAULT_PAGE_DELAY_MS,
    MAX_PAGE_DELAY_MS
  );
  const resume = asBool(args.resume, true);
  const confirmProduction = asBool(args["confirm-production"], false);
  const executorUid =
    asNonEmptyString(args["executor-uid"]) ||
    asNonEmptyString(process.env.BACKFILL_EXECUTOR_UID) ||
    DEFAULT_EXECUTOR_UID;
  const checkpointPath = path.resolve(
    process.cwd(),
    args["checkpoint-file"] || getDefaultCheckpointPath(projectId)
  );

  if (!fs.existsSync(serviceAccountPath)) {
    fail("Service account file was not found.", { serviceAccountPath });
  }

  if (!dryRun && projectId === DEFAULT_PROJECT_ID && !confirmProduction) {
    fail("Production write mode requires explicit confirmation.", {
      projectId,
      requiredFlag: "--confirm-production=true",
    });
  }

  const checkpoint = resume ? readCheckpoint(checkpointPath) : null;
  let cursor =
    asNonEmptyString(args.cursor) ||
    asNonEmptyString(checkpoint?.nextCursorDocId) ||
    null;

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

  console.log(
    "[BACKFILL][AUTHOR_METADATA][START]",
    JSON.stringify({
      projectId,
      mode: "direct",
      dryRun,
      pageSize,
      maxDocs,
      maxPages,
      pageDelayMs,
      startCursor: cursor,
      checkpointPath,
      resumedFromCheckpoint: Boolean(checkpoint && !args.cursor && resume),
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
  await adminAuth.createCustomToken(`admin-author-backfill-${Date.now()}`, {
    admin: true,
    role: "superadmin",
  });
  const executorRecord = await adminAuth.getUser(executorUid);
  if (!executorRecord.customClaims || executorRecord.customClaims.role !== "superadmin") {
    fail("Executor UID is not a superadmin user.", {
      executorUid,
    });
  }

  const compiledCallablePath = path.join(__dirname, "../lib/library/backfillAuthorMetadata.js");
  if (!fs.existsSync(compiledCallablePath)) {
    fail("Compiled callable not found. Run `npm run build` in /functions first.", {
      compiledCallablePath,
    });
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { backfillAuthorMetadata } = require(compiledCallablePath);
  if (typeof backfillAuthorMetadata?.run !== "function") {
    fail("Compiled callable does not expose a runnable handler.", {
      compiledCallablePath,
    });
  }

  let pages = 0;
  let hasMore = true;
  let totalProcessed = 0;
  let totalEnriched = 0;
  let totalUnchanged = 0;
  let totalSkippedNoSource = 0;
  let totalSkippedProviderFetch = 0;
  let lastCursor = cursor;

  while (hasMore && pages < maxPages) {
    pages += 1;

    const payload = {
      dryRun,
      pageSize,
      maxDocs,
      ...(cursor ? { cursorDocId: cursor } : {}),
    };

    const response = await backfillAuthorMetadata.run({
      auth: {
        uid: executorUid,
        token: {
          admin: true,
          role: "superadmin",
        },
      },
      data: payload,
    });

    const data = normalizeBackfillResponse(response);
    totalProcessed += data.processed || 0;
    totalEnriched += data.enriched || 0;
    totalUnchanged += data.unchanged || 0;
    totalSkippedNoSource += data.skippedNoSource || 0;
    totalSkippedProviderFetch += data.skippedProviderFetch || 0;

    hasMore = data.hasMore === true;
    cursor =
      typeof data.nextCursorDocId === "string" && data.nextCursorDocId
        ? data.nextCursorDocId
        : null;
    if (cursor) {
      lastCursor = cursor;
    }

    const checkpointPayload = {
      projectId,
      dryRun,
      pagesCompleted: pages,
      nextCursorDocId: cursor,
      hasMore,
      totals: {
        processed: totalProcessed,
        enriched: totalEnriched,
        unchanged: totalUnchanged,
        skippedNoSource: totalSkippedNoSource,
        skippedProviderFetch: totalSkippedProviderFetch,
      },
      updatedAt: new Date().toISOString(),
    };
    writeCheckpoint(checkpointPath, checkpointPayload);

    console.log(
      "[BACKFILL][AUTHOR_METADATA][PAGE]",
      JSON.stringify({
        page: pages,
        dryRun,
        processed: data.processed || 0,
        enriched: data.enriched || 0,
        unchanged: data.unchanged || 0,
        skippedNoSource: data.skippedNoSource || 0,
        skippedProviderFetch: data.skippedProviderFetch || 0,
        hasMore,
        nextCursorDocId: cursor,
        previews: Array.isArray(data.previews) ? data.previews.length : 0,
      })
    );

    if (hasMore && pageDelayMs > 0) {
      await sleep(pageDelayMs);
    }
  }

  if (hasMore && pages >= maxPages) {
    fail("Stopped before completion due to max-pages safety cap.", {
      maxPages,
      lastCursor,
      checkpointPath,
    });
  }

  console.log(
    "[BACKFILL][AUTHOR_METADATA][COMPLETE]",
    JSON.stringify({
      projectId,
      dryRun,
      pages,
      processed: totalProcessed,
      enriched: totalEnriched,
      unchanged: totalUnchanged,
      skippedNoSource: totalSkippedNoSource,
      skippedProviderFetch: totalSkippedProviderFetch,
      finalCursor: lastCursor,
      checkpointPath,
    })
  );
}

main().catch((error) => {
  fail("Author metadata backfill runner crashed.", {
    error: String(error),
  });
});
