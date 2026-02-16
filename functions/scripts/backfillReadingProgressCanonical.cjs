#!/usr/bin/env node

/**
 * backfillReadingProgressCanonical runner
 * --------------------------------------
 * Calls the compiled callable implementation directly in paginated loop mode.
 * This executes the same backend logic without transport/auth protocol drift.
 *
 * Safety defaults:
 * - dry-run enabled by default
 * - bounded page size + docs per invocation
 * - bounded max pages
 *
 * Optional env:
 * - FIREBASE_PROJECT_ID (default: booktown-ai)
 * - SERVICE_ACCOUNT_PATH (default: ../../scripts/serviceAccountKey.json)
 */

const fs = require("fs");
const path = require("path");

const { initializeApp: initializeAdminApp, cert } = require("firebase-admin/app");
const { getAuth: getAdminAuth } = require("firebase-admin/auth");

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

function fail(message, details) {
  const payload = details ? { message, details } : { message };
  console.error("[BACKFILL][READING_PROGRESS][FAIL]", JSON.stringify(payload));
  process.exit(1);
}

function normalizeBackfillResponse(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Backfill returned non-object payload.");
  }

  // Wrapped envelope shape
  if (raw.success === false) {
    const code = raw.error?.code || "unknown";
    const message = raw.error?.message || "Callable reported failure.";
    throw new Error(`${code}: ${message}`);
  }

  if (raw.success === true) {
    if (typeof raw.data !== "object" || raw.data == null) {
      throw new Error("Callable returned malformed envelope.");
    }
    return raw.data;
  }

  // Raw callable response shape
  return raw;
}

function printUsage() {
  console.log(`
Usage:
  node scripts/backfillReadingProgressCanonical.cjs [options]

Options:
  --dry-run=true|false      Default: true
  --page-size=<n>           Default: 250 (max: 400)
  --max-docs=<n>            Default: 5000 (max: 50000), per invocation
  --max-pages=<n>           Default: 1000, loop safety cap
  --cursor=<docId>          Optional starting cursor
  --project-id=<id>         Default: env FIREBASE_PROJECT_ID or "booktown-ai"
  --service-account=<path>  Default: env SERVICE_ACCOUNT_PATH or ../../scripts/serviceAccountKey.json
  --help                    Show this help
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === "true" || args.help === true) {
    printUsage();
    return;
  }

  const projectId = args["project-id"] || process.env.FIREBASE_PROJECT_ID || "booktown-ai";

  const serviceAccountPath = path.resolve(
    process.cwd(),
    args["service-account"] ||
      process.env.SERVICE_ACCOUNT_PATH ||
      path.join(__dirname, "../../scripts/serviceAccountKey.json")
  );

  const dryRun = asBool(args["dry-run"], true);
  const pageSize = asPositiveInt(args["page-size"], 250, 400);
  const maxDocs = asPositiveInt(args["max-docs"], 5000, 50000);
  const maxPages = asPositiveInt(args["max-pages"], 1000, 20000);
  let cursor = args.cursor || null;

  if (!fs.existsSync(serviceAccountPath)) {
    fail("Service account file was not found.", {
      serviceAccountPath,
    });
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

  console.log(
    "[BACKFILL][READING_PROGRESS][START]",
    JSON.stringify({
      projectId,
      mode: "direct",
      dryRun,
      pageSize,
      maxDocs,
      maxPages,
      startCursor: cursor,
      serviceAccountPath,
    })
  );

  initializeAdminApp({
    credential: cert(serviceAccount),
    projectId,
  });

  // Hard guard: fail fast if service account cannot issue admin tokens in this project.
  // This validates we are pointed at the intended Firebase project before mutating data.
  const adminAuth = getAdminAuth();
  await adminAuth.createCustomToken(`admin-backfill-${Date.now()}`, {
    admin: true,
    role: "superadmin",
  });

  const compiledCallablePath = path.join(
    __dirname,
    "../lib/admin/backfillReadingProgressCanonical.js"
  );

  if (!fs.existsSync(compiledCallablePath)) {
    fail("Compiled callable not found. Run `npm run build` in /functions first.", {
      compiledCallablePath,
    });
  }

  // eslint-disable-next-line global-require, import/no-dynamic-require
  const { backfillReadingProgressCanonical } = require(compiledCallablePath);
  if (typeof backfillReadingProgressCanonical?.run !== "function") {
    fail("Compiled callable does not expose a runnable handler.", {
      compiledCallablePath,
    });
  }

  let pages = 0;
  let totalProcessed = 0;
  let totalMutated = 0;
  let totalUnchanged = 0;
  let totalSkippedInvalid = 0;
  let totalCommits = 0;
  let hasMore = true;
  let lastCursor = cursor;
  const adjustmentTotals = {
    uidFilled: 0,
    userIdFilled: 0,
    uidUserIdNormalized: 0,
    bookIdFilled: 0,
    statusNormalized: 0,
    progressNormalized: 0,
    updatedAtFilled: 0,
    lastPositionBackfilled: 0,
  };

  while (hasMore && pages < maxPages) {
    pages += 1;

    const payload = {
      dryRun,
      pageSize,
      maxDocs,
      ...(cursor ? { cursorDocId: cursor } : {}),
    };

    const response = await backfillReadingProgressCanonical.run({
      auth: {
        uid: "admin-backfill-script",
        token: {
          admin: true,
          role: "superadmin",
        },
      },
      data: payload,
    });
    const data = normalizeBackfillResponse(response);

    totalProcessed += data.processed || 0;
    totalMutated += data.mutated || 0;
    totalUnchanged += data.unchanged || 0;
    totalSkippedInvalid += data.skippedInvalid || 0;
    totalCommits += data.commits || 0;

    for (const key of Object.keys(adjustmentTotals)) {
      adjustmentTotals[key] += data.adjustments?.[key] || 0;
    }

    hasMore = data.hasMore === true;
    cursor = typeof data.nextCursorDocId === "string" && data.nextCursorDocId ? data.nextCursorDocId : null;
    if (cursor) {
      lastCursor = cursor;
    }

    console.log(
      "[BACKFILL][READING_PROGRESS][PAGE]",
      JSON.stringify({
        page: pages,
        processed: data.processed,
        mutated: data.mutated,
        unchanged: data.unchanged,
        skippedInvalid: data.skippedInvalid,
        commits: data.commits,
        hasMore: data.hasMore,
        nextCursorDocId: data.nextCursorDocId,
        adjustments: data.adjustments,
        invalidSample: Array.isArray(data.invalidDocIds) ? data.invalidDocIds.slice(0, 5) : [],
      })
    );
  }

  const stoppedByPageCap = hasMore && pages >= maxPages;

  console.log(
    "[BACKFILL][READING_PROGRESS][SUMMARY]",
    JSON.stringify({
      pages,
      dryRun,
      pageSize,
      maxDocsPerInvocation: maxDocs,
      totalProcessed,
      totalMutated,
      totalUnchanged,
      totalSkippedInvalid,
      totalCommits,
      hasMore,
      stoppedByPageCap,
      lastCursor,
      adjustmentTotals,
    })
  );

  if (stoppedByPageCap) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  fail("Unhandled exception while running backfill.", {
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});
