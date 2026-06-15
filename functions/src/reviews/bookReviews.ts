import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldPath } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import {
  BOOK_REVIEW_PROJECTION_COLLECTION,
  bookReviewProjectionId,
  canonicalReviewId,
} from "../projections/reviewProjections";
import {
  toReviewInteraction,
  writeUserEntityInteraction,
} from "../identityGraph/userEntityInteractionRuntime";

const db = admin.firestore();

const REVIEW_STACK_REVISION = "review_stack_v2";
const MAX_UID_LENGTH = 128;
const MAX_BOOK_ID_LENGTH = 128;
const MAX_REVIEW_TEXT_LENGTH = 2000;
const MAX_CURSOR_LENGTH = 96;
const MAX_BOOK_REVIEW_LIMIT = 50;
const DEFAULT_BOOK_REVIEW_LIMIT = 20;
const REVIEW_QUERY_INDEX_HINT =
  "book_review_projection(bookId,visibility,updatedAtIso)";
const BOOK_REVIEW_QUERY_SHAPE =
  "book_review_projection.where(bookId==bookId,visibility==public).orderBy(updatedAtIso desc).limit(limit+1)";

type BookReviewVisibility = "public" | "private";
type BookReviewStatus = "active" | "deleted";

type ReviewBookSnapshot = {
  bookTitleEn: string;
  bookTitleAr: string;
  bookAuthorEn: string;
  bookAuthorAr: string;
  bookCoverThumbUrl: string;
  bookCoverUrl: string;
};

type BookReviewItem = {
  id: string;
  domain: "book";
  visibility: BookReviewVisibility;
  bookId: string;
  bookTitleEn: string;
  bookTitleAr: string;
  bookAuthorEn: string;
  bookAuthorAr: string;
  bookCoverThumbUrl: string;
  bookCoverUrl: string;
  userId: string;
  rating: number;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  timestamp: string;
  upvotes: number;
  downvotes: number;
  commentsCount: number;
};

type ProfileIdentity = {
  name: string;
  handle: string;
  avatarUrl: string;
};

function ensureUid(value: unknown, field = "uid"): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_UID_LENGTH) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return normalized;
}

function ensureBookId(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "bookId must be a string.");
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_BOOK_ID_LENGTH) {
    throw new HttpsError("invalid-argument", "bookId is invalid.");
  }
  return normalized;
}

function sanitizeText(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "text must be a string.");
  }
  const normalized = value.trim().slice(0, MAX_REVIEW_TEXT_LENGTH);
  if (!normalized) {
    throw new HttpsError("invalid-argument", "text must not be empty.");
  }
  return normalized;
}

function sanitizeRating(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new HttpsError("invalid-argument", "rating must be numeric.");
  }
  const intValue = Math.trunc(numeric);
  if (intValue < 1 || intValue > 5) {
    throw new HttpsError("invalid-argument", "rating must be between 1 and 5.");
  }
  return intValue;
}

function normalizeStoredRating(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Math.trunc(numeric)));
}

function sanitizeLimit(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_BOOK_REVIEW_LIMIT;
  }
  return Math.min(MAX_BOOK_REVIEW_LIMIT, Math.max(1, Math.trunc(numeric)));
}

function sanitizeCursor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_CURSOR_LENGTH);
}

function sanitizeVisibility(value: unknown): BookReviewVisibility {
  return value === "private" ? "private" : "public";
}

function sanitizeReviewTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim().slice(0, 48);
    if (normalized && !output.includes(normalized)) {
      output.push(normalized);
    }
    if (output.length >= 12) break;
  }
  return output;
}

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function normalizeUrl(value: unknown): string {
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

function normalizeProfileHandle(value: unknown, uid: string): string {
  const raw = sanitizeString(value, 120);
  if (!raw) return uid ? `@${uid.slice(0, 12)}` : "@user";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function fallbackAvatar(seed: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed || "user")}`;
}

function normalizeProfileIdentity(uid: string, data: Record<string, unknown>): ProfileIdentity {
  const name =
    sanitizeString(data.name, 120) ||
    sanitizeString(data.displayName, 120) ||
    "Unknown";
  return {
    name,
    handle: normalizeProfileHandle(data.handle ?? data.username, uid),
    avatarUrl: normalizeUrl(data.avatarUrl) || fallbackAvatar(uid || name),
  };
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size));
  }
  return output;
}

async function readProfileIdentityMap(userIds: string[]): Promise<Map<string, ProfileIdentity>> {
  const uniqueIds = Array.from(new Set(userIds.filter((value) => value.length > 0)));
  const identityMap = new Map<string, ProfileIdentity>();
  await Promise.all(
    chunk(uniqueIds, 10).map(async (uidBatch) => {
      const snap = await db
        .collection("public_profiles")
        .where(FieldPath.documentId(), "in", uidBatch)
        .get();
      snap.docs.forEach((docSnap) => {
        identityMap.set(
          docSnap.id,
          normalizeProfileIdentity(docSnap.id, (docSnap.data() ?? {}) as Record<string, unknown>)
        );
      });
    })
  );
  return identityMap;
}

function applyCurrentIdentityToReview(
  review: BookReviewItem,
  identityMap: ReadonlyMap<string, ProfileIdentity>
): BookReviewItem {
  const identity = identityMap.get(review.userId);
  if (!identity) return review;
  return {
    ...review,
    authorName: identity.name,
    authorHandle: identity.handle,
    authorAvatar: identity.avatarUrl,
  };
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
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return new Date().toISOString();
}

function normalizeBookSnapshotFromSource(source: Record<string, unknown>): ReviewBookSnapshot {
  return {
    bookTitleEn: sanitizeString(source.bookTitleEn ?? source.titleEn ?? source.title, 300),
    bookTitleAr: sanitizeString(source.bookTitleAr ?? source.titleAr, 300),
    bookAuthorEn: sanitizeString(source.bookAuthorEn ?? source.authorEn ?? source.author, 300),
    bookAuthorAr: sanitizeString(source.bookAuthorAr ?? source.authorAr, 300),
    bookCoverThumbUrl: normalizeUrl(
      source.bookCoverThumbUrl ??
        source.coverThumbUrl ??
        (source.cover as Record<string, unknown> | undefined)?.small ??
        (source.cover as Record<string, unknown> | undefined)?.thumb ??
        (source.cover as Record<string, unknown> | undefined)?.thumbnail ??
        (source.cover as Record<string, unknown> | undefined)?.medium
    ),
    bookCoverUrl: normalizeUrl(
      source.bookCoverUrl ?? source.coverUrl ?? (source.cover as Record<string, unknown> | undefined)?.medium
    ),
  };
}

function hasBookSnapshot(snapshot: ReviewBookSnapshot): boolean {
  return (
    snapshot.bookTitleEn.length > 0 ||
    snapshot.bookTitleAr.length > 0 ||
    snapshot.bookAuthorEn.length > 0 ||
    snapshot.bookAuthorAr.length > 0
  );
}

function normalizeReviewItem(
  docId: string,
  source: Record<string, unknown>,
  fallbackBookId: string
): BookReviewItem {
  const bookSnapshot = normalizeBookSnapshotFromSource(source);
  return {
    id: sanitizeString(docId, 128),
    domain: "book",
    visibility: sanitizeVisibility(source.visibility),
    bookId: sanitizeString(source.bookId, MAX_BOOK_ID_LENGTH) || fallbackBookId,
    ...bookSnapshot,
    userId: sanitizeString(source.userId, MAX_UID_LENGTH),
    rating: normalizeStoredRating(source.rating),
    text: sanitizeString(source.reviewText ?? source.text, MAX_REVIEW_TEXT_LENGTH),
    authorName: sanitizeString(source.authorName, 120),
    authorHandle: sanitizeString(source.authorHandle, 120),
    authorAvatar: normalizeUrl(source.authorAvatar),
    timestamp: toIso(source.updatedAtIso ?? source.updatedAt ?? source.createdAt),
    upvotes: Number.isFinite(Number(source.upvotes)) ? Math.max(0, Math.trunc(Number(source.upvotes))) : 0,
    downvotes:
      Number.isFinite(Number(source.downvotes)) ? Math.max(0, Math.trunc(Number(source.downvotes))) : 0,
    commentsCount:
      Number.isFinite(Number(source.commentsCount))
        ? Math.max(0, Math.trunc(Number(source.commentsCount)))
        : 0,
  };
}

export const upsertBookReview = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = ensureUid(request.auth.uid, "auth.uid");
  const bookId = ensureBookId(request.data?.bookId);
  const rating = sanitizeRating(request.data?.rating);
  const text = sanitizeText(request.data?.text);
  const reviewTags = sanitizeReviewTags(request.data?.reviewTags);
  const visibility = sanitizeVisibility(request.data?.visibility);
  const nowIso = new Date().toISOString();

  const reviewRef = db.collection("reviews").doc(canonicalReviewId(uid, bookId));

  const created = await db.runTransaction(async (tx) => {
    const existingSnap = await tx.get(reviewRef);
    const existingData = existingSnap.exists ? existingSnap.data() || {} : {};
    const createdAt = existingSnap.exists
      ? existingSnap.data()?.createdAt ?? existingSnap.data()?.createdAtIso ?? nowIso
        : nowIso;
    const isNew = !existingSnap.exists || existingData.status === "deleted";

    tx.set(
      reviewRef,
      {
        id: `${uid}_${bookId}`,
        domain: "book",
        status: "active" satisfies BookReviewStatus,
        visibility,
        uid,
        bookId,
        rating,
        reviewText: text,
        reviewTags,
        updatedAt: nowIso,
        createdAt,
      },
      { merge: true }
    );
    writeUserEntityInteraction(
      tx,
      db,
      toReviewInteraction({
        uid,
        bookId,
        reviewId: canonicalReviewId(uid, bookId),
        visibility,
        occurredAt: nowIso,
      })
    );

    return isNew;
  });

  logger.info("[REVIEWS][UPSERT_BOOK_REVIEW_OK]", {
    revision: REVIEW_STACK_REVISION,
    uid,
    bookId,
    visibility,
    created,
  });

  return {
    reviewId: uid,
    bookId,
    uid,
    visibility,
    created,
    updatedAt: nowIso,
    revision: REVIEW_STACK_REVISION,
  };
});

export const deleteBookReview = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = ensureUid(request.auth.uid, "auth.uid");
  const bookId = ensureBookId(request.data?.bookId);
  const reviewRef = db.collection("reviews").doc(canonicalReviewId(uid, bookId));
  const nowIso = new Date().toISOString();

  await db.runTransaction(async (tx) => {
    tx.set(
      reviewRef,
      {
        status: "deleted" satisfies BookReviewStatus,
        visibility: "private" satisfies BookReviewVisibility,
        updatedAt: nowIso,
      },
      { merge: true }
    );
    writeUserEntityInteraction(
      tx,
      db,
      toReviewInteraction({
        uid,
        bookId,
        reviewId: canonicalReviewId(uid, bookId),
        visibility: "private",
        lifecycleState: "deleted",
        occurredAt: nowIso,
      })
    );
  });

  logger.info("[REVIEWS][DELETE_BOOK_REVIEW_OK]", {
    revision: REVIEW_STACK_REVISION,
    uid,
    bookId,
  });

  return {
    deleted: true,
    bookId,
    uid,
    revision: REVIEW_STACK_REVISION,
  };
});

export const listBookReviews = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const viewerUid = ensureUid(request.auth.uid, "auth.uid");
  const bookId = ensureBookId(request.data?.bookId);
  const limitSize = sanitizeLimit(request.data?.limit);
  const cursor = sanitizeCursor(request.data?.cursor);

  try {
    let publicQuery = db
      .collection(BOOK_REVIEW_PROJECTION_COLLECTION)
      .where("bookId", "==", bookId)
      .where("visibility", "==", "public")
      .orderBy("updatedAtIso", "desc")
      .limit(limitSize + 1);

    if (cursor) {
      publicQuery = publicQuery.startAfter(cursor);
    }

    const publicSnap = await publicQuery.get();
    const publicItems = publicSnap.docs.map((docSnap) =>
      normalizeReviewItem(docSnap.id, docSnap.data() || {}, bookId)
    );

    const hasMore = publicItems.length > limitSize;
    const trimmedPublic = publicItems.slice(0, limitSize);
    const nextCursor =
      hasMore && trimmedPublic.length > 0
        ? sanitizeString(
            publicSnap.docs[Math.min(limitSize - 1, publicSnap.docs.length - 1)].get("updatedAtIso"),
            MAX_CURSOR_LENGTH
          )
        : undefined;

    const ownReviewSnap = await db
      .collection(BOOK_REVIEW_PROJECTION_COLLECTION)
      .doc(bookReviewProjectionId(viewerUid, bookId))
      .get();
    const ownReview =
      ownReviewSnap.exists && ownReviewSnap.data()?.status !== "deleted"
        ? normalizeReviewItem(ownReviewSnap.id, ownReviewSnap.data() || {}, bookId)
        : null;

    const merged = [...trimmedPublic];
    if (ownReview && !merged.some((item) => item.userId === viewerUid)) {
      merged.unshift(ownReview);
    }
    merged.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const identityMap = await readProfileIdentityMap(merged.map((item) => item.userId));
    const identityResolved = merged.map((item) => applyCurrentIdentityToReview(item, identityMap));

    logger.info("[REVIEWS][LIST_BOOK_REVIEWS_OK]", {
      revision: REVIEW_STACK_REVISION,
      viewerUid,
      bookId,
      limitSize,
      cursor,
      queryShape: BOOK_REVIEW_QUERY_SHAPE,
      resultCount: identityResolved.length,
      hasMore,
      nextCursor: nextCursor ?? null,
    });

    return {
      items: identityResolved,
      hasMore,
      ...(nextCursor ? { nextCursor } : {}),
      revision: REVIEW_STACK_REVISION,
    };
  } catch (error) {
    logger.error("[REVIEWS][LIST_BOOK_REVIEWS_FAILED]", {
      revision: REVIEW_STACK_REVISION,
      viewerUid,
      bookId,
      limitSize,
      cursor,
      queryShape: BOOK_REVIEW_QUERY_SHAPE,
      indexHint: REVIEW_QUERY_INDEX_HINT,
      error,
    });
    throw new HttpsError("failed-precondition", "BOOK_REVIEWS_QUERY_FAILED", {
      code: "BOOK_REVIEWS_QUERY_FAILED",
      queryShape: BOOK_REVIEW_QUERY_SHAPE,
      uid: viewerUid,
      indexHint: REVIEW_QUERY_INDEX_HINT,
      revision: REVIEW_STACK_REVISION,
    });
  }
});
