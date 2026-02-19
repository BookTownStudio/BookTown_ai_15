#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DEFAULT_EXPECTED_REVISION = "review_stack_v2";
const PROFILE_QUERY_SHAPE_OWNER =
  "user_reviews.where(uid==targetUid).where(domain==book).orderBy(updatedAtIso desc).limit(limit+1)";
const PROFILE_QUERY_SHAPE_PUBLIC =
  "user_reviews.where(uid==targetUid).where(domain==book).where(visibility==public).orderBy(updatedAtIso desc).limit(limit+1)";
const PROFILE_INDEX_HINT =
  "user_reviews(uid,domain,visibility,updatedAtIso) and user_reviews(uid,domain,updatedAtIso)";
const BOOK_REVIEW_QUERY_SHAPE =
  "books/{bookId}/reviews.where(visibility==public).orderBy(updatedAtIso desc).limit(limit+1)";
const BOOK_REVIEW_INDEX_HINT =
  "books/*/reviews(visibility,updatedAtIso)";

function parseArgs(argv) {
  const parsed = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [rawKey, rawValue] = arg.slice(2).split("=");
    if (!rawKey) continue;
    parsed[rawKey] = rawValue ?? "";
  }
  return parsed;
}

function normalizeFieldShape(indexFields) {
  return indexFields
    .map((field) => `${field.fieldPath}:${field.order || field.arrayConfig || ""}`)
    .join("|");
}

function hasIndex(indexes, collectionGroup, fields) {
  const expectedShape = normalizeFieldShape(fields);
  return indexes.some((indexEntry) => {
    if (indexEntry.collectionGroup !== collectionGroup) return false;
    if (indexEntry.queryScope !== "COLLECTION") return false;
    if (!Array.isArray(indexEntry.fields)) return false;
    return normalizeFieldShape(indexEntry.fields) === expectedShape;
  });
}

function extractRevision(sourceText) {
  const match = sourceText.match(/const REVIEW_STACK_REVISION = "([^"]+)";/);
  return match ? match[1] : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const smokeUid = (args.uid || process.env.REVIEW_SMOKE_UID || "").trim();
  const expectedRevision = (
    args.expectedRevision ||
    process.env.REVIEW_STACK_EXPECTED_REVISION ||
    DEFAULT_EXPECTED_REVISION
  ).trim();

  if (!smokeUid) {
    throw new Error(
      "Missing smoke UID. Pass --uid=<firebase_uid> or set REVIEW_SMOKE_UID."
    );
  }

  const profilePath = path.resolve(__dirname, "../src/profile/index.ts");
  const functionsIndexPath = path.resolve(__dirname, "../src/index.ts");
  const firestoreIndexesPath = path.resolve(__dirname, "../../firestore.indexes.json");

  const profileSource = fs.readFileSync(profilePath, "utf8");
  const functionsIndexSource = fs.readFileSync(functionsIndexPath, "utf8");
  const indexJson = JSON.parse(fs.readFileSync(firestoreIndexesPath, "utf8"));
  const indexes = Array.isArray(indexJson.indexes) ? indexJson.indexes : [];

  const actualRevision = extractRevision(profileSource);
  if (!actualRevision) {
    throw new Error("Unable to resolve REVIEW_STACK_REVISION from profile/index.ts.");
  }

  if (actualRevision !== expectedRevision) {
    throw new Error(
      `Revision mismatch. expected=${expectedRevision} actual=${actualRevision}`
    );
  }

  const hasListProfileReviewsExport =
    /export const listProfileReviews\s*=\s*wrapCallableV2\(\s*"listProfileReviews"/m.test(
      functionsIndexSource
    );
  const hasReleaseGateExport =
    /export const runReviewStackReleaseGate\s*=\s*wrapCallableV2\(\s*"runReviewStackReleaseGate"/m.test(
      functionsIndexSource
    );
  const hasCallableExport = hasListProfileReviewsExport && hasReleaseGateExport;
  if (!hasCallableExport) {
    throw new Error(
      "Callable wrappers missing in functions/src/index.ts for listProfileReviews/runReviewStackReleaseGate."
    );
  }

  const requiredIndexes = [
    {
      collectionGroup: "user_reviews",
      fields: [
        { fieldPath: "uid", order: "ASCENDING" },
        { fieldPath: "domain", order: "ASCENDING" },
        { fieldPath: "updatedAtIso", order: "DESCENDING" },
      ],
      hint: PROFILE_INDEX_HINT,
    },
    {
      collectionGroup: "user_reviews",
      fields: [
        { fieldPath: "uid", order: "ASCENDING" },
        { fieldPath: "domain", order: "ASCENDING" },
        { fieldPath: "visibility", order: "ASCENDING" },
        { fieldPath: "updatedAtIso", order: "DESCENDING" },
      ],
      hint: PROFILE_INDEX_HINT,
    },
    {
      collectionGroup: "reviews",
      fields: [
        { fieldPath: "visibility", order: "ASCENDING" },
        { fieldPath: "updatedAtIso", order: "DESCENDING" },
      ],
      hint: BOOK_REVIEW_INDEX_HINT,
    },
  ];

  for (const required of requiredIndexes) {
    if (!hasIndex(indexes, required.collectionGroup, required.fields)) {
      throw new Error(
        `Missing required index for ${required.collectionGroup}. hint=${required.hint}`
      );
    }
  }

  if (admin.apps.length === 0) {
    admin.initializeApp();
  }
  const db = admin.firestore();

  const ownerQuery = db
    .collection("user_reviews")
    .where("uid", "==", smokeUid)
    .where("domain", "==", "book")
    .orderBy("updatedAtIso", "desc")
    .limit(1);

  const publicQuery = db
    .collection("user_reviews")
    .where("uid", "==", smokeUid)
    .where("domain", "==", "book")
    .where("visibility", "==", "public")
    .orderBy("updatedAtIso", "desc")
    .limit(1);

  const smokeQuery = db
    .collection("user_reviews")
    .where("uid", "==", smokeUid)
    .where("domain", "==", "book")
    .orderBy("updatedAtIso", "desc")
    .limit(5);

  const [ownerSnap, publicSnap, smokeSnap] = await Promise.all([
    ownerQuery.get(),
    publicQuery.get(),
    smokeQuery.get(),
  ]);

  const report = {
    revision: actualRevision,
    smokeUid,
    queryDiagnostics: [
      {
        name: "profile_owner_query",
        status: "pass",
        queryShape: PROFILE_QUERY_SHAPE_OWNER,
        indexHint: PROFILE_INDEX_HINT,
        count: ownerSnap.size,
      },
      {
        name: "profile_public_query",
        status: "pass",
        queryShape: PROFILE_QUERY_SHAPE_PUBLIC,
        indexHint: PROFILE_INDEX_HINT,
        count: publicSnap.size,
      },
      {
        name: "book_reviews_public_query_shape",
        status: "pass",
        queryShape: BOOK_REVIEW_QUERY_SHAPE,
        indexHint: BOOK_REVIEW_INDEX_HINT,
      },
    ],
    smokeCount: smokeSnap.size,
    passed: true,
  };

  console.log("[REVIEW_STACK][RELEASE_GATE][PASS]", JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[REVIEW_STACK][RELEASE_GATE][FAIL]", message);
  process.exit(1);
});
