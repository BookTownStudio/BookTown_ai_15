// functions/src/triggers/aggregationTriggers.ts

import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentUpdated,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { admin } from "../firebaseAdmin";
import { ensureSystemMetricsInitialized } from "../analytics/initMetrics";
import { incrementGlobalMetricInTransaction } from "../analytics/metricsUtils";
import { logSystemEvent } from "../analytics/eventLogger";
import { processMetricEventIdempotently } from "../analytics/metricIdempotency";
import {
  emitIntelligenceSignalSafe,
} from "../intelligence/profileBuilder";
import {
  BOOK_REVIEW_PROJECTION_COLLECTION,
  REVIEW_PROJECTION_VERSION,
  SOCIAL_REVIEW_PROJECTION_COLLECTION,
  USER_REVIEW_PROJECTION_COLLECTION,
  bookReviewProjectionId,
  socialReviewProjectionId,
  userReviewProjectionId,
} from "../projections/reviewProjections";
import { recordOperationalMetric } from "../operations/operationalMetrics";

const db = admin.firestore();
const ENVIRONMENT = process.env.APP_ENV === "staging" ? "staging" : "prod";
const APP_VERSION = process.env.APP_VERSION || "unknown";
const REVIEW_AGGREGATE_EVENT_LEDGER_COLLECTION = "review_aggregate_event_ledger";

async function safeLogSystemEvent(
  params: Parameters<typeof logSystemEvent>[0]
): Promise<void> {
  try {
    await logSystemEvent(params);
  } catch (err) {
    console.error("[EventLogger]", err);
  }
}

/**
 * updateStatCounter
 * Authoritative atomic counter update.
 * Dual-writes nested counters.{field} (legacy read path in read.ts) and flat
 * {field}Count (canonical field consumed by syncPostStatsToSearchIndex).
 *
 * Idempotency: the counter write is bundled into a processMetricEventIdempotently
 * transaction keyed by eventId (the Cloud Firestore trigger event ID).
 * At-least-once trigger re-delivery with the same eventId will find the ledger
 * doc already present and skip the increment — preventing double-counting.
 */
async function updateStatCounter(
  collection: string,
  docId: string,
  field: string,
  delta: number,
  eventId: string
) {
  const ref = db.collection(collection).doc(docId);
  const postRef = collection === "post_stats" ? db.collection("posts").doc(docId) : null;
  await processMetricEventIdempotently(eventId, async (tx) => {
    tx.set(
      ref,
      {
        counters: {
          [field]: admin.firestore.FieldValue.increment(delta),
        },
        [`${field}Count`]: admin.firestore.FieldValue.increment(delta),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    if (postRef) {
      tx.set(
        postRef,
        {
          counters: {
            [field]: admin.firestore.FieldValue.increment(delta),
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}

/**
 * ---------------------------------------------------------
 * LIBRARY CANONICAL SET (Authoritative)
 * ---------------------------------------------------------
 * Goal:
 * - Maintain canonical per-user book membership in user_library_books
 * - Emit signals for downstream intelligence/profile workers
 *
 * Approach (Tier-1 stable):
 * - Maintain a per-user canonical set: user_library_books/{uid}_{bookId}
 * - Sources:
 *   - Shelf membership (shelf_books collection)
 *   - Reading progress existence (reading_progress)
 */

/** Internal helper: canonical library book doc id */
function libraryBookDocId(uid: string, bookId: string) {
  return `${uid}_${bookId}`;
}

type RecommendationOrigin = {
  source: "librarian";
  suggestionSessionId: string;
  suggestionId: string;
  rankPosition: number;
  mode: string;
};

function sanitizeRecommendationOrigin(value: unknown): RecommendationOrigin | null {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!raw) return null;
  const source = raw.source === "librarian" ? "librarian" : null;
  const suggestionSessionId =
    typeof raw.suggestionSessionId === "string"
      ? raw.suggestionSessionId.trim().slice(0, 96)
      : "";
  const suggestionId =
    typeof raw.suggestionId === "string"
      ? raw.suggestionId.trim().slice(0, 96)
      : "";
  const rankPositionRaw = Number(raw.rankPosition);
  const rankPosition =
    Number.isFinite(rankPositionRaw) && rankPositionRaw > 0
      ? Math.trunc(rankPositionRaw)
      : 0;
  const mode =
    typeof raw.mode === "string" ? raw.mode.trim().slice(0, 40) : "";
  if (!source || !suggestionSessionId || !suggestionId || !rankPosition || !mode) {
    return null;
  }
  return {
    source,
    suggestionSessionId,
    suggestionId,
    rankPosition,
    mode,
  };
}

/**
 * Internal helper: apply library-book source changes transactionally.
 */
async function applyLibraryBookDelta(params: {
  uid: string;
  bookId: string;
  addShelfId?: string;
  removeShelfId?: string;
  setHasProgress?: boolean;
  recommendationOrigin?: RecommendationOrigin | null;
}) {
  const { uid, bookId, addShelfId, removeShelfId, setHasProgress, recommendationOrigin } = params;

  const libRef = db
    .collection("user_library_books")
    .doc(libraryBookDocId(uid, bookId));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(libRef);
    const existed = snap.exists;

    const before = snap.exists ? (snap.data() as any) : null;
    const beforeShelfIds: string[] = Array.isArray(before?.shelfIds)
      ? before.shelfIds
      : [];
    const beforeHasProgress = Boolean(before?.hasProgress);
    const beforeRecommendationOrigin = sanitizeRecommendationOrigin(
      before?.recommendationOrigin
    );

    const nextShelfIds = new Set(beforeShelfIds);
    if (addShelfId) nextShelfIds.add(addShelfId);
    if (removeShelfId) nextShelfIds.delete(removeShelfId);

    const nextHasProgress =
      typeof setHasProgress === "boolean"
        ? setHasProgress
        : beforeHasProgress;
    const nextRecommendationOrigin =
      addShelfId && recommendationOrigin ? recommendationOrigin : beforeRecommendationOrigin;

    const isEmpty = nextShelfIds.size === 0 && nextHasProgress === false;

    if (existed && isEmpty) {
      tx.delete(libRef);
      return;
    }

    if (!isEmpty) {
      tx.set(
        libRef,
        {
          uid,
          bookId,
          shelfIds: Array.from(nextShelfIds),
          hasProgress: nextHasProgress,
          ...(nextRecommendationOrigin
            ? { recommendationOrigin: nextRecommendationOrigin }
            : {}),
          updatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}

// ------------------------------------------------------------------
// --- POST INTERACTION TRIGGERS ---
// ------------------------------------------------------------------

export const onPostLikeCreated = onDocumentCreated(
  "users/{userId}/likes/{postId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "likes",
      1,
      event.id
    );
    await emitIntelligenceSignalSafe({
      uid: event.params.userId,
      signalType: "post_liked",
      signalFamily: "engagement",
      payload: {
        postId: event.params.postId,
        delta: 1,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.userId}/likes/${event.params.postId}`,
    });
  }
);

export const onPostLikeDeleted = onDocumentDeleted(
  "users/{userId}/likes/{postId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "likes",
      -1,
      event.id
    );
    await emitIntelligenceSignalSafe({
      uid: event.params.userId,
      signalType: "post_unliked",
      signalFamily: "engagement",
      payload: {
        postId: event.params.postId,
        delta: -1,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.userId}/likes/${event.params.postId}`,
    });
  }
);

export const onPostRepostCreated = onDocumentCreated(
  "users/{userId}/reposts/{postId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "reposts",
      1,
      event.id
    );
    await emitIntelligenceSignalSafe({
      uid: event.params.userId,
      signalType: "post_reposted",
      signalFamily: "engagement",
      payload: {
        postId: event.params.postId,
        delta: 1,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.userId}/reposts/${event.params.postId}`,
    });
  }
);

export const onPostRepostDeleted = onDocumentDeleted(
  "users/{userId}/reposts/{postId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "reposts",
      -1,
      event.id
    );
    await emitIntelligenceSignalSafe({
      uid: event.params.userId,
      signalType: "post_unreposted",
      signalFamily: "engagement",
      payload: {
        postId: event.params.postId,
        delta: -1,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.userId}/reposts/${event.params.postId}`,
    });
  }
);

export const onPostCommentCreated = onDocumentCreated(
  "posts/{postId}/comments/{commentId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "comments",
      1,
      event.id
    );
    const commentData = event.data?.data() as Record<string, unknown> | undefined;
    const uid =
      typeof commentData?.userId === "string" && commentData.userId.trim().length > 0
        ? commentData.userId.trim()
        : typeof commentData?.authorId === "string" && commentData.authorId.trim().length > 0
        ? commentData.authorId.trim()
        : "";
    if (uid) {
      await emitIntelligenceSignalSafe({
        uid,
        signalType: "post_commented",
        signalFamily: "engagement",
        payload: {
          postId: event.params.postId,
          commentId: event.params.commentId,
          delta: 1,
        },
        sourceEventId: event.id,
        sourcePath: `posts/${event.params.postId}/comments/${event.params.commentId}`,
      });
    }
  }
);

export const onPostCommentDeleted = onDocumentDeleted(
  "posts/{postId}/comments/{commentId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "comments",
      -1,
      event.id
    );
    const commentData = event.data?.data() as Record<string, unknown> | undefined;
    const uid =
      typeof commentData?.userId === "string" && commentData.userId.trim().length > 0
        ? commentData.userId.trim()
        : typeof commentData?.authorId === "string" && commentData.authorId.trim().length > 0
        ? commentData.authorId.trim()
        : "";
    if (uid) {
      await emitIntelligenceSignalSafe({
        uid,
        signalType: "post_comment_deleted",
        signalFamily: "engagement",
        payload: {
          postId: event.params.postId,
          commentId: event.params.commentId,
          delta: -1,
        },
        sourceEventId: event.id,
        sourcePath: `posts/${event.params.postId}/comments/${event.params.commentId}`,
      });
    }
  }
);

export const onPostBookmarkCreated = onDocumentCreated(
  "users/{userId}/bookmarks/{entityId}",
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (data?.type !== "post") return;

    await updateStatCounter(
      "post_stats",
      event.params.entityId,
      "bookmarks",
      1,
      event.id
    );
    await emitIntelligenceSignalSafe({
      uid: event.params.userId,
      signalType: "post_bookmarked",
      signalFamily: "engagement",
      payload: {
        entityId: event.params.entityId,
        delta: 1,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.userId}/bookmarks/${event.params.entityId}`,
    });
  }
);

export const onPostBookmarkDeleted = onDocumentDeleted(
  "users/{userId}/bookmarks/{entityId}",
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (data?.type !== "post") return;

    await updateStatCounter(
      "post_stats",
      event.params.entityId,
      "bookmarks",
      -1,
      event.id
    );
    await emitIntelligenceSignalSafe({
      uid: event.params.userId,
      signalType: "post_unbookmarked",
      signalFamily: "engagement",
      payload: {
        entityId: event.params.entityId,
        delta: -1,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.userId}/bookmarks/${event.params.entityId}`,
    });
  }
);

// ------------------------------------------------------------------
// --- USER & CATALOG TRIGGERS ---
// ------------------------------------------------------------------

export const onUserFollowCreated = onDocumentCreated(
  "users/{userId}/followers/{followerId}",
  async (event) => {
    await db.collection("public_profiles").doc(event.params.userId).set(
      {
        followerCount: admin.firestore.FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    await db.collection("public_profiles").doc(event.params.followerId).set(
      {
        followingCount: admin.firestore.FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await emitIntelligenceSignalSafe({
      uid: event.params.userId,
      signalType: "follow_received",
      signalFamily: "engagement",
      payload: {
        followerUid: event.params.followerId,
        deltaFollowers: 1,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.userId}/followers/${event.params.followerId}`,
    });
    await emitIntelligenceSignalSafe({
      uid: event.params.followerId,
      signalType: "follow_initiated",
      signalFamily: "engagement",
      payload: {
        targetUid: event.params.userId,
        deltaFollowing: 1,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.userId}/followers/${event.params.followerId}`,
    });

    await ensureSystemMetricsInitialized();
    await processMetricEventIdempotently(event.id, async (tx) => {
      incrementGlobalMetricInTransaction(tx, "totalFollows", 1);
    });
    await safeLogSystemEvent({
      type: "follow_created",
      uid: event.params.followerId,
      entityId: event.params.userId,
      dedupeKey: event.id,
      metadata: {
        source: "trigger.onUserFollowCreated",
      },
      environment: ENVIRONMENT,
      appVersion: APP_VERSION,
    });
  }
);

export const onUserFollowDeleted = onDocumentDeleted(
  "users/{userId}/followers/{followerId}",
  async (event) => {
    await db.collection("public_profiles").doc(event.params.userId).set(
      {
        followerCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    await db.collection("public_profiles").doc(event.params.followerId).set(
      {
        followingCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await emitIntelligenceSignalSafe({
      uid: event.params.userId,
      signalType: "follow_removed",
      signalFamily: "engagement",
      payload: {
        followerUid: event.params.followerId,
        deltaFollowers: -1,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.userId}/followers/${event.params.followerId}`,
    });
    await emitIntelligenceSignalSafe({
      uid: event.params.followerId,
      signalType: "unfollow_initiated",
      signalFamily: "engagement",
      payload: {
        targetUid: event.params.userId,
        deltaFollowing: -1,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.userId}/followers/${event.params.followerId}`,
    });
  }
);


function normalizeReviewRating(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Math.trunc(numeric)));
}

function normalizeReviewVisibility(value: unknown): "public" | "private" {
  return value === "private" ? "private" : "public";
}

function normalizeReviewStatus(value: unknown): "active" | "deleted" {
  return value === "deleted" ? "deleted" : "active";
}

export function applyPublicReviewCounterDelta(params: {
  currentReviews: number;
  beforePublic: boolean;
  afterPublic: boolean;
}): number {
  const { currentReviews, beforePublic, afterPublic } = params;
  if (!beforePublic && afterPublic) {
    return currentReviews + 1;
  }
  if (beforePublic && !afterPublic) {
    return Math.max(0, currentReviews - 1);
  }
  return currentReviews;
}

export function applyPublicRatingCounterDelta(params: {
  currentRatingsCount: number;
  currentRatingSum: number;
  beforePublic: boolean;
  afterPublic: boolean;
  beforeRating: number;
  afterRating: number;
}): { ratingsCount: number; ratingSum: number; averageRating: number } {
  const {
    currentRatingsCount,
    currentRatingSum,
    beforePublic,
    afterPublic,
    beforeRating,
    afterRating,
  } = params;

  let nextRatingsCount = currentRatingsCount;
  let nextRatingSum = currentRatingSum;

  if (!beforePublic && afterPublic) {
    nextRatingsCount += 1;
    nextRatingSum += afterRating;
  } else if (beforePublic && !afterPublic) {
    nextRatingsCount = Math.max(0, nextRatingsCount - 1);
    nextRatingSum = Math.max(0, nextRatingSum - beforeRating);
  } else if (beforePublic && afterPublic) {
    nextRatingSum = Math.max(0, nextRatingSum + (afterRating - beforeRating));
  }

  const averageRating =
    nextRatingsCount > 0 ? Number((nextRatingSum / nextRatingsCount).toFixed(4)) : 0;

  return {
    ratingsCount: nextRatingsCount,
    ratingSum: nextRatingSum,
    averageRating,
  };
}

function normalizeLedgerId(value: string): string {
  return value
    .trim()
    .replace(/[^A-Za-z0-9_.:-]+/g, "_")
    .slice(0, 500);
}

export function buildReviewAggregateOperationId(params: {
  eventId?: string;
  reviewId: string;
  bookId: string;
  beforeExists: boolean;
  afterExists: boolean;
  beforeActive: boolean;
  afterActive: boolean;
  beforeRating: number;
  afterRating: number;
}): string {
  const eventId = typeof params.eventId === "string" ? params.eventId.trim() : "";
  if (eventId) {
    return normalizeLedgerId(`review_aggregate:${eventId}`);
  }

  return normalizeLedgerId([
    "review_aggregate",
    params.reviewId,
    params.bookId,
    params.beforeExists ? "before_exists" : "before_missing",
    params.afterExists ? "after_exists" : "after_missing",
    params.beforeActive ? "before_public" : "before_nonpublic",
    params.afterActive ? "after_public" : "after_nonpublic",
    `before_rating_${params.beforeRating}`,
    `after_rating_${params.afterRating}`,
  ].join(":"));
}

async function applyReviewAggregateMutationIdempotently(params: {
  operationId: string;
  reviewId: string;
  bookId: string;
  beforeActive: boolean;
  afterActive: boolean;
  beforeRating: number;
  afterRating: number;
}): Promise<boolean> {
  const statsRef = db.collection("book_stats").doc(params.bookId);
  const ledgerRef = db
    .collection(REVIEW_AGGREGATE_EVENT_LEDGER_COLLECTION)
    .doc(params.operationId);
  let processed = false;

  await db.runTransaction(async (tx) => {
    const ledgerSnap = await tx.get(ledgerRef);
    if (ledgerSnap.exists) {
      return;
    }

    const statsSnap = await tx.get(statsRef);
    const counters = statsSnap.exists ? (statsSnap.data()?.counters || {}) : {};
    const currentReviews =
      typeof counters.reviews === "number"
        ? Math.max(0, Math.trunc(counters.reviews))
        : 0;
    const currentRatingsCount =
      typeof counters.ratingsCount === "number"
        ? Math.max(0, Math.trunc(counters.ratingsCount))
        : 0;
    const currentRatingSum =
      typeof counters.ratingSum === "number" && Number.isFinite(counters.ratingSum)
        ? counters.ratingSum
        : 0;
    const nextReviews = applyPublicReviewCounterDelta({
      currentReviews,
      beforePublic: params.beforeActive,
      afterPublic: params.afterActive,
    });
    const nextRatingCounters = applyPublicRatingCounterDelta({
      currentRatingsCount,
      currentRatingSum,
      beforePublic: params.beforeActive,
      afterPublic: params.afterActive,
      beforeRating: params.beforeRating,
      afterRating: params.afterRating,
    });

    tx.create(ledgerRef, {
      operationId: params.operationId,
      reviewId: params.reviewId,
      bookId: params.bookId,
      beforeActive: params.beforeActive,
      afterActive: params.afterActive,
      beforeRating: params.beforeRating,
      afterRating: params.afterRating,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.set(
      statsRef,
      {
        counters: {
          ...counters,
          reviews: nextReviews,
          ratingsCount: nextRatingCounters.ratingsCount,
          ratingSum: nextRatingCounters.ratingSum,
          averageRating: nextRatingCounters.averageRating,
        },
        reviews: nextReviews,
        ratingsCount: nextRatingCounters.ratingsCount,
        averageRating: nextRatingCounters.averageRating,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastReviewAggregateOperationId: params.operationId,
      },
      { merge: true }
    );
    processed = true;
  });

  return processed;
}

function toIso(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return new Date().toISOString();
}

type ProjectionBookSnapshot = {
  bookTitleEn: string;
  bookTitleAr: string;
  bookAuthorEn: string;
  bookAuthorAr: string;
  bookCoverThumbUrl: string;
  bookCoverUrl: string;
};

function sanitizeProjectionString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function sanitizeProjectionUrl(value: unknown): string {
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

function normalizeProjectionBookSnapshot(
  source: Record<string, unknown>
): ProjectionBookSnapshot {
  return {
    bookTitleEn: sanitizeProjectionString(source.bookTitleEn ?? source.titleEn ?? source.title, 300),
    bookTitleAr: sanitizeProjectionString(source.bookTitleAr ?? source.titleAr, 300),
    bookAuthorEn: sanitizeProjectionString(source.bookAuthorEn ?? source.authorEn ?? source.author, 300),
    bookAuthorAr: sanitizeProjectionString(source.bookAuthorAr ?? source.authorAr, 300),
    bookCoverThumbUrl: sanitizeProjectionUrl(
      source.bookCoverThumbUrl ??
        source.coverThumbUrl ??
        (source.cover as Record<string, unknown> | undefined)?.small ??
        (source.cover as Record<string, unknown> | undefined)?.thumb ??
        (source.cover as Record<string, unknown> | undefined)?.thumbnail ??
        (source.cover as Record<string, unknown> | undefined)?.medium
    ),
    bookCoverUrl: sanitizeProjectionUrl(
      source.bookCoverUrl ?? source.coverUrl ?? (source.cover as Record<string, unknown> | undefined)?.medium
    ),
  };
}

function isProjectionBookSnapshotMissing(snapshot: ProjectionBookSnapshot): boolean {
  return (
    snapshot.bookTitleEn.length === 0 &&
    snapshot.bookTitleAr.length === 0 &&
    snapshot.bookAuthorEn.length === 0 &&
    snapshot.bookAuthorAr.length === 0
  );
}

async function resolveProjectionBookSnapshot(
  bookId: string,
  source: Record<string, unknown>
): Promise<ProjectionBookSnapshot> {
  const fromReview = normalizeProjectionBookSnapshot(source);
  if (!isProjectionBookSnapshotMissing(fromReview)) {
    return fromReview;
  }

  const bookSnap = await db.collection("books").doc(bookId).get();
  if (!bookSnap.exists) {
    return fromReview;
  }

  return normalizeProjectionBookSnapshot((bookSnap.data() || {}) as Record<string, unknown>);
}

async function resolveProjectionAuthorIdentity(uid: string): Promise<{
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
}> {
  const publicSnap = await db.collection("public_profiles").doc(uid).get();
  if (publicSnap.exists) {
    const data = publicSnap.data() || {};
    const name = sanitizeProjectionString(data.name, 120) || "Anonymous";
    const handle = sanitizeProjectionString(data.handle, 120).replace(/^@/, "");
    return {
      authorName: name,
      authorHandle: handle || uid.slice(0, 12),
      authorAvatar: sanitizeProjectionUrl(data.avatarUrl),
    };
  }

  const userSnap = await db.collection("users").doc(uid).get();
  const data = userSnap.exists ? userSnap.data() || {} : {};
  const name =
    sanitizeProjectionString(data.name, 120) ||
    sanitizeProjectionString(data.displayName, 120) ||
    "Anonymous";
  const handle = sanitizeProjectionString(data.handle, 120).replace(/^@/, "");
  return {
    authorName: name,
    authorHandle: handle || uid.slice(0, 12),
    authorAvatar: sanitizeProjectionUrl(data.avatarUrl),
  };
}

export const onBookReviewWritten = onDocumentWritten(
  "reviews/{reviewId}",
  async (event) => {
    const before = event.data?.before?.data() as Record<string, unknown> | undefined;
    const after = event.data?.after?.data() as Record<string, unknown> | undefined;
    const reviewId = event.params.reviewId;
    const beforeExists = !!before;
    const afterExists = !!after;
    const beforeBookId =
      typeof before?.bookId === "string" && before.bookId.trim().length > 0
        ? before.bookId.trim()
        : null;
    const afterBookId =
      typeof after?.bookId === "string" && after.bookId.trim().length > 0
        ? after.bookId.trim()
        : null;
    const bookId = afterBookId || beforeBookId;
    if (!bookId) return;

    const beforeRating = normalizeReviewRating(before?.rating);
    const afterRating = normalizeReviewRating(after?.rating);
    const beforeActive =
      beforeExists &&
      normalizeReviewStatus(before?.status) === "active" &&
      normalizeReviewVisibility(before?.visibility) === "public";
    const afterActive =
      afterExists &&
      normalizeReviewStatus(after?.status) === "active" &&
      normalizeReviewVisibility(after?.visibility) === "public";
    const beforeUserId =
      typeof before?.uid === "string" && before.uid.trim().length > 0
        ? before.uid.trim()
        : typeof before?.userId === "string" && before.userId.trim().length > 0
          ? before.userId.trim()
          : null;
    const afterUserId =
      typeof after?.uid === "string" && after.uid.trim().length > 0
        ? after.uid.trim()
        : typeof after?.userId === "string" && after.userId.trim().length > 0
          ? after.userId.trim()
          : null;

    const aggregateOperationId = buildReviewAggregateOperationId({
      eventId: event.id,
      reviewId,
      bookId,
      beforeExists,
      afterExists,
      beforeActive,
      afterActive,
      beforeRating,
      afterRating,
    });
    const aggregateProcessed = await applyReviewAggregateMutationIdempotently({
      operationId: aggregateOperationId,
      reviewId,
      bookId,
      beforeActive,
      afterActive,
      beforeRating,
      afterRating,
    });
    if (!aggregateProcessed) {
      await recordOperationalMetric({
        name: "review_aggregate_retry",
        value: 1,
        unit: "count",
        dimensions: {
          bookId,
          operationId: aggregateOperationId,
        },
      });
      console.warn("[REVIEWS][AGGREGATE_DUPLICATE_SKIPPED]", {
        reviewId,
        bookId,
        operationId: aggregateOperationId,
        sourceEventId: event.id,
      });
    }

    if (afterExists && afterUserId && normalizeReviewStatus(after?.status) === "active") {
      const bookSnapshot = await resolveProjectionBookSnapshot(
        bookId,
        (after || {}) as Record<string, unknown>
      );
      const authorIdentity = await resolveProjectionAuthorIdentity(afterUserId);
      const afterRecommendationOrigin = sanitizeRecommendationOrigin(after?.recommendationOrigin);
      const projection = {
        id: reviewId,
        domain: "book",
        projectionVersion: REVIEW_PROJECTION_VERSION,
        visibility: normalizeReviewVisibility(after?.visibility),
        uid: afterUserId,
        userId: afterUserId,
        bookId,
        ...bookSnapshot,
        rating: afterRating,
        text:
          typeof after?.reviewText === "string"
            ? after.reviewText.slice(0, 2000)
            : typeof after?.text === "string"
              ? after.text.slice(0, 2000)
              : "",
        ...authorIdentity,
        upvotes: 0,
        downvotes: 0,
        commentsCount: 0,
        updatedAt: after?.updatedAt ?? after?.updatedAtIso ?? toIso(new Date()),
        updatedAtIso: toIso(after?.updatedAtIso ?? after?.updatedAt),
        createdAt: after?.createdAt ?? after?.updatedAt ?? toIso(new Date()),
        createdAtIso: toIso(after?.createdAtIso ?? after?.createdAt),
        sourcePath: `reviews/${reviewId}`,
        ...(afterRecommendationOrigin
          ? { recommendationOrigin: afterRecommendationOrigin }
          : {}),
      };
      await Promise.all([
        db.collection(USER_REVIEW_PROJECTION_COLLECTION).doc(userReviewProjectionId(afterUserId, bookId)).set(
          { ...projection, projectionSurface: "user" },
          { merge: true }
        ),
        db.collection(BOOK_REVIEW_PROJECTION_COLLECTION).doc(bookReviewProjectionId(afterUserId, bookId)).set(
          { ...projection, projectionSurface: "book" },
          { merge: true }
        ),
        db.collection(SOCIAL_REVIEW_PROJECTION_COLLECTION).doc(socialReviewProjectionId(afterUserId, bookId)).set(
          { ...projection, projectionSurface: "social" },
          { merge: true }
        ),
      ]);
    }

    const projectionUid = afterUserId || beforeUserId;
    if ((!afterExists || normalizeReviewStatus(after?.status) !== "active") && projectionUid) {
      await Promise.all([
        db.collection(USER_REVIEW_PROJECTION_COLLECTION).doc(userReviewProjectionId(projectionUid, bookId)).delete(),
        db.collection(BOOK_REVIEW_PROJECTION_COLLECTION).doc(bookReviewProjectionId(projectionUid, bookId)).delete(),
        db.collection(SOCIAL_REVIEW_PROJECTION_COLLECTION).doc(socialReviewProjectionId(projectionUid, bookId)).delete(),
      ]);
    }

    const changedUid = afterUserId || beforeUserId;
    if (changedUid) {
      const recommendationOrigin =
        sanitizeRecommendationOrigin(after?.recommendationOrigin) ??
        sanitizeRecommendationOrigin(before?.recommendationOrigin);
      await emitIntelligenceSignalSafe({
        uid: changedUid,
        signalType:
          !beforeActive && afterActive
            ? "review_created"
            : beforeActive && !afterActive
              ? "review_deleted"
              : "review_updated",
        signalFamily: "engagement",
        payload: {
          bookId,
          reviewId,
          beforeExists,
          afterExists,
          beforeRating,
          afterRating,
          ...(recommendationOrigin ? { recommendationOrigin } : {}),
        },
        sourceEventId: event.id,
        sourcePath: `reviews/${reviewId}`,
      });
    }

    if (!beforeActive && afterActive) {
      await ensureSystemMetricsInitialized();
      await processMetricEventIdempotently(event.id, async (tx) => {
        incrementGlobalMetricInTransaction(tx, "totalReviews", 1);
      });
      if (afterUserId) {
        await safeLogSystemEvent({
          type: "review_created",
          uid: afterUserId,
          entityId: reviewId,
          dedupeKey: event.id,
          metadata: {
            source: "trigger.onReviewWritten",
            bookId,
          },
          environment: ENVIRONMENT,
          appVersion: APP_VERSION,
        });
      }
    }
  }
);

export const onLegacyBookReviewWritten = onDocumentWritten(
  "books/{bookId}/reviews/{reviewId}",
  async (event) => {
    const before = event.data?.before?.data() as Record<string, unknown> | undefined;
    const after = event.data?.after?.data() as Record<string, unknown> | undefined;
    const bookId = event.params.bookId;
    const reviewId = event.params.reviewId;

    const beforeExists = !!before;
    const afterExists = !!after;
    const beforeRating = normalizeReviewRating(before?.rating);
    const afterRating = normalizeReviewRating(after?.rating);
    const beforePublic = beforeExists && normalizeReviewVisibility(before?.visibility) === "public";
    const afterPublic = afterExists && normalizeReviewVisibility(after?.visibility) === "public";
    const beforeUserId =
      typeof before?.userId === "string" && before.userId.trim().length > 0
        ? before.userId.trim()
        : null;
    const afterUserId =
      typeof after?.userId === "string" && after.userId.trim().length > 0
        ? after.userId.trim()
        : null;

    const statsRef = db.collection("book_stats").doc(bookId);
    await db.runTransaction(async (tx) => {
      const statsSnap = await tx.get(statsRef);
      const counters = statsSnap.exists ? (statsSnap.data()?.counters || {}) : {};
      const currentReviews =
        typeof counters.reviews === "number"
          ? Math.max(0, Math.trunc(counters.reviews))
          : 0;

      const nextReviews = applyPublicReviewCounterDelta({
        currentReviews,
        beforePublic,
        afterPublic,
      });

      tx.set(
        statsRef,
        {
          counters: {
            ...counters,
            reviews: nextReviews,
          },
          reviews: nextReviews,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    if (afterExists && afterUserId) {
      const bookSnapshot = await resolveProjectionBookSnapshot(
        bookId,
        (after || {}) as Record<string, unknown>
      );
      const afterRecommendationOrigin = sanitizeRecommendationOrigin(after?.recommendationOrigin);
      const projectionRef = db
        .collection("user_reviews")
        .doc(`${afterUserId}_${bookId}`);
      await projectionRef.set(
        {
          id: reviewId,
          domain: "book",
          visibility: normalizeReviewVisibility(after?.visibility),
          uid: afterUserId,
          userId: afterUserId,
          bookId,
          ...bookSnapshot,
          rating: afterRating,
          text: typeof after?.text === "string" ? after.text.slice(0, 2000) : "",
          authorName:
            typeof after?.authorName === "string" ? after.authorName.slice(0, 120) : "",
          authorHandle:
            typeof after?.authorHandle === "string" ? after.authorHandle.slice(0, 120) : "",
          authorAvatar:
            typeof after?.authorAvatar === "string" ? after.authorAvatar.slice(0, 2048) : "",
          upvotes:
            typeof after?.upvotes === "number" && Number.isFinite(after.upvotes)
              ? Math.max(0, Math.trunc(after.upvotes))
              : 0,
          downvotes:
            typeof after?.downvotes === "number" && Number.isFinite(after.downvotes)
              ? Math.max(0, Math.trunc(after.downvotes))
              : 0,
          commentsCount:
            typeof after?.commentsCount === "number" && Number.isFinite(after.commentsCount)
              ? Math.max(0, Math.trunc(after.commentsCount))
              : 0,
          updatedAt: after?.updatedAt ?? after?.updatedAtIso ?? toIso(new Date()),
          updatedAtIso: toIso(after?.updatedAtIso ?? after?.updatedAt),
          createdAt: after?.createdAt ?? after?.updatedAt ?? toIso(new Date()),
          createdAtIso: toIso(after?.createdAtIso ?? after?.createdAt),
          sourcePath: `books/${bookId}/reviews/${reviewId}`,
          ...(afterRecommendationOrigin
            ? { recommendationOrigin: afterRecommendationOrigin }
            : {}),
        },
        { merge: true }
      );
    }

    if (!afterExists && beforeUserId) {
      await db.collection("user_reviews").doc(`${beforeUserId}_${bookId}`).delete();
    }

    const changedUid = afterUserId || beforeUserId;
    if (changedUid) {
      const recommendationOrigin =
        sanitizeRecommendationOrigin(after?.recommendationOrigin) ??
        sanitizeRecommendationOrigin(before?.recommendationOrigin);
      await emitIntelligenceSignalSafe({
        uid: changedUid,
        signalType:
          !beforeExists && afterExists
            ? "review_created"
            : beforeExists && !afterExists
            ? "review_deleted"
            : "review_updated",
        signalFamily: "engagement",
        payload: {
          bookId,
          reviewId,
          beforeExists,
          afterExists,
          beforeRating,
          afterRating,
          ...(recommendationOrigin ? { recommendationOrigin } : {}),
        },
        sourceEventId: event.id,
        sourcePath: `books/${bookId}/reviews/${reviewId}`,
      });
    }

    if (!beforeExists && afterExists) {
      await ensureSystemMetricsInitialized();
      await processMetricEventIdempotently(event.id, async (tx) => {
        incrementGlobalMetricInTransaction(tx, "totalReviews", 1);
      });
      if (afterUserId) {
        await safeLogSystemEvent({
          type: "review_created",
          uid: afterUserId,
          entityId: reviewId,
          dedupeKey: event.id,
          metadata: {
            source: "trigger.onBookReviewWritten",
            bookId,
          },
          environment: ENVIRONMENT,
          appVersion: APP_VERSION,
        });
      }
    }
  }
);

export const onBookRatingWritten = onDocumentWritten(
  "books/{bookId}/ratings/{userId}",
  async (event) => {
    const before = event.data?.before?.data() as Record<string, unknown> | undefined;
    const after = event.data?.after?.data() as Record<string, unknown> | undefined;
    const bookId = event.params.bookId;

    const beforeExists = !!before;
    const afterExists = !!after;
    const beforeRating = normalizeReviewRating(before?.rating);
    const afterRating = normalizeReviewRating(after?.rating);
    const beforePublic = beforeExists && normalizeReviewVisibility(before?.visibility) === "public";
    const afterPublic = afterExists && normalizeReviewVisibility(after?.visibility) === "public";

    const statsRef = db.collection("book_stats").doc(bookId);
    await db.runTransaction(async (tx) => {
      const statsSnap = await tx.get(statsRef);
      const counters = statsSnap.exists ? (statsSnap.data()?.counters || {}) : {};
      const currentRatingsCount =
        typeof counters.ratingsCount === "number"
          ? Math.max(0, Math.trunc(counters.ratingsCount))
          : 0;
      const currentRatingSum =
        typeof counters.ratingSum === "number" && Number.isFinite(counters.ratingSum)
          ? counters.ratingSum
          : 0;

      const nextCounters = applyPublicRatingCounterDelta({
        currentRatingsCount,
        currentRatingSum,
        beforePublic,
        afterPublic,
        beforeRating,
        afterRating,
      });

      tx.set(
        statsRef,
        {
          counters: {
            ...counters,
            ratingsCount: nextCounters.ratingsCount,
            ratingSum: nextCounters.ratingSum,
            averageRating: nextCounters.averageRating,
          },
          ratingsCount: nextCounters.ratingsCount,
          averageRating: nextCounters.averageRating,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  }
);

export const onSystemUserCreated = onDocumentCreated(
  "users/{uid}",
  async (event) => {
    await emitIntelligenceSignalSafe({
      uid: event.params.uid,
      signalType: "user_created",
      signalFamily: "behavior",
      payload: {
        uid: event.params.uid,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.uid}`,
    });

    await ensureSystemMetricsInitialized();
    await processMetricEventIdempotently(event.id, async (tx) => {
      incrementGlobalMetricInTransaction(tx, "totalUsers", 1);
    });
    await safeLogSystemEvent({
      type: "user_created",
      uid: event.params.uid,
      entityId: event.params.uid,
      dedupeKey: event.id,
      metadata: {
        source: "trigger.onSystemUserCreated",
      },
      environment: ENVIRONMENT,
      appVersion: APP_VERSION,
    });
  }
);

export const onUserQuoteCreated = onDocumentCreated(
  "users/{uid}/quotes/{quoteId}",
  async (event) => {
    await emitIntelligenceSignalSafe({
      uid: event.params.uid,
      signalType: "quote_created",
      signalFamily: "engagement",
      payload: {
        quoteId: event.params.quoteId,
      },
      sourceEventId: event.id,
      sourcePath: `users/${event.params.uid}/quotes/${event.params.quoteId}`,
    });

    await ensureSystemMetricsInitialized();
    await processMetricEventIdempotently(event.id, async (tx) => {
      incrementGlobalMetricInTransaction(tx, "totalQuotes", 1);
    });
    await safeLogSystemEvent({
      type: "quote_created",
      uid: event.params.uid,
      entityId: event.params.quoteId,
      dedupeKey: event.id,
      metadata: {
        source: "trigger.onUserQuoteCreated",
      },
      environment: ENVIRONMENT,
      appVersion: APP_VERSION,
    });
  }
);

export const onDeletionRequestCreatedMetrics = onDocumentCreated(
  "deletion_requests/{requestId}",
  async (event) => {
    await ensureSystemMetricsInitialized();
    await processMetricEventIdempotently(event.id, async (tx) => {
      incrementGlobalMetricInTransaction(tx, "totalDeletionRequests", 1);
    });
    const data = event.data?.data() as Record<string, unknown> | undefined;
    const actorUid =
      typeof data?.raisedByUid === "string" && data.raisedByUid.trim().length > 0
        ? data.raisedByUid.trim()
        : "";
    if (actorUid) {
      await safeLogSystemEvent({
        type: "deletion_request_created",
        uid: actorUid,
        entityId: event.params.requestId,
        dedupeKey: event.id,
        metadata: {
          source: "trigger.onDeletionRequestCreatedMetrics",
        },
        environment: ENVIRONMENT,
        appVersion: APP_VERSION,
      });
    }
  }
);

export const onDeletionRequestExecutedMetrics = onDocumentUpdated(
  "deletion_requests/{requestId}",
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    const beforeStatus =
      typeof before?.status === "string" ? before.status.toLowerCase() : "";
    const afterStatus =
      typeof after?.status === "string" ? after.status.toLowerCase() : "";

    if (beforeStatus !== "executed" && afterStatus === "executed") {
      await ensureSystemMetricsInitialized();
      await processMetricEventIdempotently(event.id, async (tx) => {
        incrementGlobalMetricInTransaction(tx, "executedDeletions", 1);
      });
      const actorUid =
        typeof after?.reviewedByUid === "string" && after.reviewedByUid.trim().length > 0
          ? after.reviewedByUid.trim()
          : typeof after?.raisedByUid === "string" && after.raisedByUid.trim().length > 0
            ? after.raisedByUid.trim()
            : "";
      if (actorUid) {
        await safeLogSystemEvent({
          type: "deletion_executed",
          uid: actorUid,
          entityId: event.params.requestId,
          dedupeKey: event.id,
          metadata: {
            source: "trigger.onDeletionRequestExecutedMetrics",
          },
          environment: ENVIRONMENT,
          appVersion: APP_VERSION,
        });
      }
    }
  }
);

export const onEventRsvpCreated = onDocumentCreated(
  "events/{eventId}/rsvps/{userId}",
  async (event) => {
    await updateStatCounter(
      "event_stats",
      event.params.eventId,
      "rsvps",
      1,
      event.id
    );
    await emitIntelligenceSignalSafe({
      uid: event.params.userId,
      signalType: "event_rsvp_created",
      signalFamily: "engagement",
      payload: {
        eventId: event.params.eventId,
      },
      sourceEventId: event.id,
      sourcePath: `events/${event.params.eventId}/rsvps/${event.params.userId}`,
    });
  }
);

// ------------------------------------------------------------------
// ✅ TOP-LEVEL SHELVES AUTHORITY
// shelves/{uid}_{shelfId}
// ------------------------------------------------------------------

export const onTopLevelShelfCreated = onDocumentCreated(
  "shelves/{shelfDocId}",
  async (event) => {
    const data = event.data?.data() as any;
    const ownerId = data?.ownerId;
    const isVirtual = Boolean(data?.isVirtual);
    if (!ownerId || isVirtual) return;

    await emitIntelligenceSignalSafe({
      uid: ownerId,
      signalType: "shelf_created",
      signalFamily: "behavior",
      payload: {
        shelfId: data?.id || event.params.shelfDocId,
        isVirtual,
        deltaShelves: 1,
      },
      sourceEventId: event.id,
      sourcePath: `shelves/${event.params.shelfDocId}`,
    });
  }
);

export const onTopLevelShelfDeleted = onDocumentDeleted(
  "shelves/{shelfDocId}",
  async (event) => {
    const data = event.data?.data() as any;
    const ownerId = data?.ownerId;
    const isVirtual = Boolean(data?.isVirtual);
    if (!ownerId || isVirtual) return;

    await emitIntelligenceSignalSafe({
      uid: ownerId,
      signalType: "shelf_deleted",
      signalFamily: "behavior",
      payload: {
        shelfId: data?.id || event.params.shelfDocId,
        isVirtual,
        deltaShelves: -1,
      },
      sourceEventId: event.id,
      sourcePath: `shelves/${event.params.shelfDocId}`,
    });
  }
);

// ------------------------------------------------------------------
// ✅ SHELF_BOOKS WRITES → CANONICAL LIBRARY SET
// ------------------------------------------------------------------

export const onShelfEntriesWritten = onDocumentWritten(
  "shelf_books/{docId}",
  async (event) => {
    const before = event.data?.before?.data() as any;
    const after = event.data?.after?.data() as any;

    const snap = after || before;
    if (!snap) return;

    const ownerId = snap?.ownerId;
    const shelfId = snap?.shelfId;
    const bookId = snap?.bookId;
    const isVirtual = Boolean(snap?.isVirtual);
    if (!ownerId || !shelfId || !bookId || isVirtual) return;

    const isCreate = !before && !!after;
    const isDelete = !!before && !after;
    if (!isCreate && !isDelete) return;

    if (isCreate) {
      const recommendationOrigin = sanitizeRecommendationOrigin(
        after?.recommendationOrigin ?? null
      );
      await applyLibraryBookDelta({
        uid: ownerId,
        bookId,
        addShelfId: shelfId,
        recommendationOrigin,
      });

      await emitIntelligenceSignalSafe({
        uid: ownerId,
        signalType: "shelf_entries_changed",
        signalFamily: "reading",
        payload: {
          shelfId,
          addedCount: 1,
          removedCount: 0,
          addedBookIds: [bookId],
          removedBookIds: [],
          ...(recommendationOrigin
            ? { addedRecommendationOrigins: [{ bookId, recommendationOrigin }] }
            : {}),
        },
        sourceEventId: event.id,
        sourcePath: `shelf_books/${event.params.docId}`,
      });
    }

    if (isDelete) {
      await applyLibraryBookDelta({
        uid: ownerId,
        bookId,
        removeShelfId: shelfId,
      });

      await emitIntelligenceSignalSafe({
        uid: ownerId,
        signalType: "shelf_entries_changed",
        signalFamily: "reading",
        payload: {
          shelfId,
          addedCount: 0,
          removedCount: 1,
          addedBookIds: [],
          removedBookIds: [bookId],
        },
        sourceEventId: event.id,
        sourcePath: `shelf_books/${event.params.docId}`,
      });
    }
  }
);

// ------------------------------------------------------------------
// ✅ READING PROGRESS → CANONICAL LIBRARY SET
// ------------------------------------------------------------------

export const onReadingProgressWritten = onDocumentWritten(
  "reading_progress/{progressId}",
  async (event) => {
    const after = event.data?.after?.data() as any;
    if (!after) return;

    const uid = after?.uid || after?.userId;
    const bookId = after?.bookId;
    if (!uid || !bookId) return;

    await applyLibraryBookDelta({
      uid,
      bookId,
      setHasProgress: true,
    });
    const recommendationOrigin = sanitizeRecommendationOrigin(after?.recommendationOrigin);
    await emitIntelligenceSignalSafe({
      uid,
      signalType: "reading_progress_written",
      signalFamily: "reading",
      payload: {
        progressId: event.params.progressId,
        bookId,
        progress: typeof after?.progress === "number" ? after.progress : null,
        statusState: typeof after?.status_state === "string" ? after.status_state : null,
        ...(recommendationOrigin ? { recommendationOrigin } : {}),
      },
      sourceEventId: event.id,
      sourcePath: `reading_progress/${event.params.progressId}`,
    });
  }
);
