#!/usr/bin/env node
"use strict";

const admin = require("firebase-admin");
const { FieldPath } = require("firebase-admin/firestore");

const DEFAULT_BATCH_SIZE = 300;
const MAX_BATCH_SIZE = 450;

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const [rawKey, rawValue] = token.slice(2).split("=");
    if (!rawKey) continue;
    args[rawKey] = rawValue === undefined ? "true" : rawValue;
  }
  return args;
}

function parseIntOption(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function toIso(value) {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value && typeof value.toDate === "function") {
    const parsed = value.toDate();
    if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return new Date().toISOString();
}

function normalizeString(value, maxLen) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function normalizeUrl(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString().slice(0, 2048);
  } catch {
    return "";
  }
}

function normalizeRating(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(5, Math.trunc(numeric)));
}

function normalizeCounter(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

function parseBool(value) {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function normalizeBookSnapshotFromSource(source) {
  const coverObject = source && typeof source.cover === "object" ? source.cover : {};
  return {
    bookTitleEn: normalizeString(source.bookTitleEn || source.titleEn || source.title, 300),
    bookTitleAr: normalizeString(source.bookTitleAr || source.titleAr, 300),
    bookAuthorEn: normalizeString(source.bookAuthorEn || source.authorEn || source.author, 300),
    bookAuthorAr: normalizeString(source.bookAuthorAr || source.authorAr, 300),
    bookCoverThumbUrl: normalizeUrl(
      source.bookCoverThumbUrl ||
        source.coverThumbUrl ||
        coverObject.small ||
        coverObject.thumb ||
        coverObject.thumbnail ||
        coverObject.medium
    ),
    bookCoverUrl: normalizeUrl(source.bookCoverUrl || source.coverUrl || coverObject.medium || coverObject.original),
  };
}

function isBookSnapshotMissing(snapshot) {
  return (
    snapshot.bookTitleEn.length === 0 &&
    snapshot.bookTitleAr.length === 0 &&
    snapshot.bookAuthorEn.length === 0 &&
    snapshot.bookAuthorAr.length === 0
  );
}

async function projectionFromReviewDoc(reviewDoc, db, bookSnapshotCache) {
  const parentDoc = reviewDoc.ref.parent.parent;
  const grandCollectionId = parentDoc && parentDoc.parent ? parentDoc.parent.id : null;
  if (grandCollectionId !== "books") {
    return null;
  }

  const source = reviewDoc.data() || {};
  const bookId = normalizeString(parentDoc.id, 128);
  const uid = normalizeString(source.userId || source.uid || reviewDoc.id, 128);
  if (!bookId || !uid) return null;

  const updatedAtIso = toIso(
    source.updatedAtIso || source.updatedAt || source.timestamp || source.createdAt
  );
  const createdAtIso = toIso(source.createdAtIso || source.createdAt || updatedAtIso);
  const visibility = source.visibility === "private" ? "private" : "public";
  let bookSnapshot = normalizeBookSnapshotFromSource(source);
  if (isBookSnapshotMissing(bookSnapshot)) {
    const cached = bookSnapshotCache.get(bookId);
    if (cached) {
      bookSnapshot = cached;
    } else {
      const bookSnap = await db.collection("books").doc(bookId).get();
      if (bookSnap.exists) {
        bookSnapshot = normalizeBookSnapshotFromSource(bookSnap.data() || {});
      }
      bookSnapshotCache.set(bookId, bookSnapshot);
    }
  }

  return {
    projectionId: `${uid}_${bookId}`,
    updatedAtIso,
    payload: {
      id: normalizeString(reviewDoc.id, 128),
      domain: "book",
      visibility,
      uid,
      userId: uid,
      bookId,
      ...bookSnapshot,
      rating: normalizeRating(source.rating),
      text: normalizeString(source.text, 2000),
      authorName: normalizeString(source.authorName, 120),
      authorHandle: normalizeString(source.authorHandle, 120),
      authorAvatar: normalizeString(source.authorAvatar, 2048),
      upvotes: normalizeCounter(source.upvotes),
      downvotes: normalizeCounter(source.downvotes),
      commentsCount: normalizeCounter(source.commentsCount),
      updatedAt: source.updatedAt || source.updatedAtIso || updatedAtIso,
      updatedAtIso,
      createdAt: source.createdAt || source.updatedAt || createdAtIso,
      createdAtIso,
      sourcePath: reviewDoc.ref.path,
      projectionBackfilledAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = parseBool(args.dryRun || "false");
  const uidFilter = normalizeString(args.uid || "", 128) || null;
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    parseIntOption(args.batchSize, DEFAULT_BATCH_SIZE)
  );
  const maxDocs = args.maxDocs ? parseIntOption(args.maxDocs, Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;

  if (admin.apps.length === 0) {
    admin.initializeApp();
  }

  const db = admin.firestore();

  let scanned = 0;
  let eligible = 0;
  let materialized = 0;
  let skipped = 0;
  let cursor = null;
  let pages = 0;

  const startedAt = new Date().toISOString();
  console.log("[USER_REVIEWS_BACKFILL] START", JSON.stringify({
    startedAt,
    dryRun,
    uidFilter: uidFilter || null,
    batchSize,
    maxDocs,
  }));

  const processDocs = async (docs) => {
    scanned += docs.length;

    const bookSnapshotCache = new Map();
    const pageTargets = new Map();
    for (const reviewDoc of docs) {
      const projection = await projectionFromReviewDoc(reviewDoc, db, bookSnapshotCache);
      if (!projection) {
        skipped += 1;
        continue;
      }
      eligible += 1;

      const existing = pageTargets.get(projection.projectionId);
      if (!existing || existing.updatedAtIso < projection.updatedAtIso) {
        pageTargets.set(projection.projectionId, projection);
      }
    }

    if (!dryRun && pageTargets.size > 0) {
      const batch = db.batch();
      for (const target of pageTargets.values()) {
        const projectionRef = db.collection("user_reviews").doc(target.projectionId);
        batch.set(projectionRef, target.payload, { merge: true });
      }
      await batch.commit();
      materialized += pageTargets.size;
      return;
    }

    materialized += pageTargets.size;
  };

  const collectUserReviewDocsByBookScan = async (uid) => {
    const bookRefs = await db.collection("books").listDocuments();
    const docs = [];
    const concurrency = 40;

    for (let i = 0; i < bookRefs.length; i += concurrency) {
      const chunk = bookRefs.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async (bookRef) => {
          const reviewSnap = await bookRef.collection("reviews").doc(uid).get();
          return reviewSnap.exists ? reviewSnap : null;
        })
      );
      for (const snap of chunkResults) {
        if (snap) docs.push(snap);
      }

      if (((i / concurrency) + 1) % 20 === 0) {
        console.log("[USER_REVIEWS_BACKFILL] UID_SCAN_PROGRESS", JSON.stringify({
          uid,
          scannedBooks: Math.min(i + concurrency, bookRefs.length),
          totalBooks: bookRefs.length,
          matchedReviews: docs.length,
        }));
      }
    }

    return docs;
  };

  // UID-targeted mode avoids composite index needs on doc-id pagination.
  if (uidFilter) {
    let uidDocs = [];
    try {
      const uidSnap = await db
        .collectionGroup("reviews")
        .where("userId", "==", uidFilter)
        .get();
      uidDocs = uidSnap.docs;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("FAILED_PRECONDITION")) {
        throw error;
      }
      console.log("[USER_REVIEWS_BACKFILL] UID_QUERY_FALLBACK", JSON.stringify({
        uid: uidFilter,
        reason: "collectionGroup_userId_requires_index",
      }));
      uidDocs = await collectUserReviewDocsByBookScan(uidFilter);
    }

    pages = 1;
    await processDocs(uidDocs.slice(0, maxDocs));

    const completedAtUid = new Date().toISOString();
    console.log("[USER_REVIEWS_BACKFILL] COMPLETE", JSON.stringify({
      startedAt,
      completedAt: completedAtUid,
      dryRun,
      uidFilter: uidFilter || null,
      scanned,
      eligible,
      materialized,
      skipped,
      pages,
    }));
    return;
  }

  while (scanned < maxDocs) {
    let query = db
      .collectionGroup("reviews")
      .orderBy(FieldPath.documentId())
      .limit(Math.min(batchSize, maxDocs - scanned));

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snap = await query.get();
    if (snap.empty) break;

    pages += 1;
    cursor = snap.docs[snap.docs.length - 1];
    await processDocs(snap.docs);

    if (pages % 10 === 0) {
      console.log("[USER_REVIEWS_BACKFILL] PROGRESS", JSON.stringify({
        pages,
        scanned,
        eligible,
        materialized,
        skipped,
      }));
    }

    if (snap.size < Math.min(batchSize, maxDocs - scanned)) {
      break;
    }
  }

  const completedAt = new Date().toISOString();
  console.log("[USER_REVIEWS_BACKFILL] COMPLETE", JSON.stringify({
    startedAt,
    completedAt,
    dryRun,
    uidFilter: uidFilter || null,
    scanned,
    eligible,
    materialized,
    skipped,
    pages,
  }));
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[USER_REVIEWS_BACKFILL] FAILED", message);
  process.exit(1);
});
