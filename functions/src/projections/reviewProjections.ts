export const REVIEW_PROJECTION_VERSION = "review_projection_v1";
export const BOOK_REVIEW_PROJECTION_COLLECTION = "book_review_projection";
export const SOCIAL_REVIEW_PROJECTION_COLLECTION = "social_review_projection";
export const USER_REVIEW_PROJECTION_COLLECTION = "user_reviews";

type ReviewVisibility = "public" | "private";
type ReviewStatus = "active" | "deleted";

type RecommendationOrigin = {
  source: "librarian";
  suggestionSessionId: string;
  suggestionId: string;
  rankPosition: number;
  mode: string;
};

type ReviewBookSnapshot = {
  bookTitleEn: string;
  bookTitleAr: string;
  bookAuthorEn: string;
  bookAuthorAr: string;
  bookCoverThumbUrl: string;
  bookCoverUrl: string;
};

export type ReviewProjectionPayload = {
  id: string;
  domain: "book";
  projectionVersion: typeof REVIEW_PROJECTION_VERSION;
  visibility: ReviewVisibility;
  uid: string;
  userId: string;
  bookId: string;
  bookTitleEn: string;
  bookTitleAr: string;
  bookAuthorEn: string;
  bookAuthorAr: string;
  bookCoverThumbUrl: string;
  bookCoverUrl: string;
  rating: number;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  upvotes: number;
  downvotes: number;
  commentsCount: number;
  updatedAt: unknown;
  updatedAtIso: string;
  createdAt: unknown;
  createdAtIso: string;
  sourcePath: string;
  recommendationOrigin?: RecommendationOrigin;
};

export function canonicalReviewId(uid: string, bookId: string): string {
  return `${uid}_${bookId}`;
}

export function userReviewProjectionId(uid: string, bookId: string): string {
  return canonicalReviewId(uid, bookId);
}

export function bookReviewProjectionId(uid: string, bookId: string): string {
  return canonicalReviewId(uid, bookId);
}

export function socialReviewProjectionId(uid: string, bookId: string): string {
  return canonicalReviewId(uid, bookId);
}

function readString(value: unknown, maxLen: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function readUrl(value: unknown): string {
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

function normalizeReviewRating(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Math.trunc(numeric)));
}

function normalizeReviewVisibility(value: unknown): ReviewVisibility {
  return value === "private" ? "private" : "public";
}

function normalizeReviewStatus(value: unknown): ReviewStatus {
  return value === "deleted" ? "deleted" : "active";
}

function normalizeBookSnapshot(source: Record<string, unknown>): ReviewBookSnapshot {
  const cover = source.cover as Record<string, unknown> | undefined;
  return {
    bookTitleEn: readString(source.bookTitleEn ?? source.titleEn ?? source.title, 300),
    bookTitleAr: readString(source.bookTitleAr ?? source.titleAr, 300),
    bookAuthorEn: readString(source.bookAuthorEn ?? source.authorEn ?? source.author, 300),
    bookAuthorAr: readString(source.bookAuthorAr ?? source.authorAr, 300),
    bookCoverThumbUrl: readUrl(
      source.bookCoverThumbUrl ??
        source.coverThumbUrl ??
        cover?.small ??
        cover?.thumb ??
        cover?.thumbnail ??
        cover?.medium
    ),
    bookCoverUrl: readUrl(source.bookCoverUrl ?? source.coverUrl ?? cover?.medium),
  };
}

function isBookSnapshotMissing(snapshot: ReviewBookSnapshot): boolean {
  return (
    snapshot.bookTitleEn.length === 0 &&
    snapshot.bookTitleAr.length === 0 &&
    snapshot.bookAuthorEn.length === 0 &&
    snapshot.bookAuthorAr.length === 0
  );
}

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
  const mode = typeof raw.mode === "string" ? raw.mode.trim().slice(0, 40) : "";
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

async function resolveBookSnapshot(
  db: FirebaseFirestore.Firestore,
  bookId: string,
  source: Record<string, unknown>
): Promise<ReviewBookSnapshot> {
  const fromReview = normalizeBookSnapshot(source);
  if (!isBookSnapshotMissing(fromReview)) return fromReview;

  const bookSnap = await db.collection("books").doc(bookId).get();
  if (!bookSnap.exists) return fromReview;
  return normalizeBookSnapshot((bookSnap.data() || {}) as Record<string, unknown>);
}

async function resolveAuthorIdentity(
  db: FirebaseFirestore.Firestore,
  uid: string
): Promise<{
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
}> {
  const publicSnap = await db.collection("public_profiles").doc(uid).get();
  if (publicSnap.exists) {
    const data = publicSnap.data() || {};
    const name = readString(data.name, 120) || "Anonymous";
    const handle = readString(data.handle, 120).replace(/^@/, "");
    return {
      authorName: name,
      authorHandle: handle || uid.slice(0, 12),
      authorAvatar: readUrl(data.avatarUrl),
    };
  }

  const userSnap = await db.collection("users").doc(uid).get();
  const data = userSnap.exists ? userSnap.data() || {} : {};
  const name = readString(data.name, 120) || readString(data.displayName, 120) || "Anonymous";
  const handle = readString(data.handle, 120).replace(/^@/, "");
  return {
    authorName: name,
    authorHandle: handle || uid.slice(0, 12),
    authorAvatar: readUrl(data.avatarUrl),
  };
}

export async function buildReviewProjectionPayload(
  db: FirebaseFirestore.Firestore,
  reviewId: string,
  source: Record<string, unknown>
): Promise<ReviewProjectionPayload | null> {
  const bookId = readString(source.bookId, 128);
  const uid = readString(source.uid, 128) || readString(source.userId, 128);
  if (!bookId || !uid || normalizeReviewStatus(source.status) !== "active") {
    return null;
  }

  const bookSnapshot = await resolveBookSnapshot(db, bookId, source);
  const authorIdentity = await resolveAuthorIdentity(db, uid);
  const recommendationOrigin = sanitizeRecommendationOrigin(source.recommendationOrigin);

  return {
    id: reviewId,
    domain: "book",
    projectionVersion: REVIEW_PROJECTION_VERSION,
    visibility: normalizeReviewVisibility(source.visibility),
    uid,
    userId: uid,
    bookId,
    ...bookSnapshot,
    rating: normalizeReviewRating(source.rating),
    text: readString(source.reviewText ?? source.text, 2000),
    ...authorIdentity,
    upvotes: 0,
    downvotes: 0,
    commentsCount: 0,
    updatedAt: source.updatedAt ?? source.updatedAtIso ?? toIso(new Date()),
    updatedAtIso: toIso(source.updatedAtIso ?? source.updatedAt),
    createdAt: source.createdAt ?? source.updatedAt ?? toIso(new Date()),
    createdAtIso: toIso(source.createdAtIso ?? source.createdAt),
    sourcePath: `reviews/${reviewId}`,
    ...(recommendationOrigin ? { recommendationOrigin } : {}),
  };
}
