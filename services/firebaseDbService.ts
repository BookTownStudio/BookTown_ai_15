import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  where,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

import { getFirebaseDb, getFirebaseFunctions } from "../lib/firebase.ts";

import {
  PostStats,
  UserStats,
  BookStats,
  ShelfStats,
} from "./db.types.ts";

import {
  User,
  Post,
  PostDraft,
  Notification,
  ThreadComment,
  RecommendedShelf,
  Shelf,
  Book,
  Venue,
  Event,
  VenueReview,
  Review,
  Bookmark,
  AgentSession,
  ChatMessage,
  Feedback,
  Conversation,
  DirectMessage,
} from "../types/entities.ts";

import { normalizeNotification, normalizePost } from "../lib/data-validation.ts";
import { FirebaseUploadService } from "./firebaseUploadService.ts";
import { firebaseProjectService } from "./firebaseProjectService.ts";

/**
 * 🔒 AUTHORITATIVE Firebase Catalog Service
 * Reads canonical editions from Firestore
 * FIREBASE MODE — Production-grade, no mock leakage
 */
import { firebaseCatalogService } from "../lib/services/firebaseCatalogService.ts";

const getDb = () => {
  const db = getFirebaseDb();
  if (!db) return null as any;
  return db;
};

const cursorRegistry = new Map<string, QueryDocumentSnapshot<DocumentData>>();

const MAX_VENUE_SEARCH_RESULTS = 25;
const MAX_REVIEW_LENGTH = 1000;
const MAX_VENUE_FIELD_LENGTH = 240;
const MAX_DM_LIST_LIMIT = 200;

type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

type FailureEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type CallableDomainError = Error & {
  endpoint: string;
  code: string;
  transportCode?: string;
  details?: unknown;
  queryShape?: string;
  indexHint?: string;
  uid?: string;
};

const resolveDeterministicErrorCode = (
  fallbackCode: string,
  details: unknown
): string => {
  if (details && typeof details === "object") {
    const detailsCode = (details as { code?: unknown }).code;
    if (typeof detailsCode === "string" && detailsCode.trim().length > 0) {
      return detailsCode.trim();
    }
  }
  return fallbackCode;
};

const createCallableError = (params: {
  endpoint: string;
  code: string;
  message: string;
  details?: unknown;
}): CallableDomainError => {
  const resolvedCode = resolveDeterministicErrorCode(params.code, params.details);
  const error = new Error(`[${resolvedCode}] ${params.message}`) as CallableDomainError;
  error.name = "CallableDomainError";
  error.endpoint = params.endpoint;
  error.code = resolvedCode;
  error.transportCode = params.code;
  error.details = params.details;
  if (params.details && typeof params.details === "object") {
    const meta = params.details as Record<string, unknown>;
    if (typeof meta.queryShape === "string") {
      error.queryShape = meta.queryShape;
    }
    if (typeof meta.indexHint === "string") {
      error.indexHint = meta.indexHint;
    }
    if (typeof meta.uid === "string") {
      error.uid = meta.uid;
    }
  }
  return error;
};

const extractCallableData = <T>(endpoint: string, payload: unknown): T => {
  if (!payload || typeof payload !== "object") {
    throw createCallableError({
      endpoint,
      code: "INVALID_RESPONSE_SCHEMA",
      message: "Invalid callable response envelope.",
    });
  }

  const envelope = payload as Partial<SuccessEnvelope<T>> &
    Partial<FailureEnvelope> & {
      success?: boolean;
    };

  if (envelope.success === false && envelope.error) {
    const code =
      typeof envelope.error.code === "string"
        ? envelope.error.code
        : "UNKNOWN";
    const message =
      typeof envelope.error.message === "string"
        ? envelope.error.message
        : "Callable request failed.";
    throw createCallableError({
      endpoint,
      code,
      message,
      details: envelope.error.details,
    });
  }

  if (envelope.success !== true || !("data" in envelope)) {
    throw createCallableError({
      endpoint,
      code: "INVALID_RESPONSE_SCHEMA",
      message: "Missing success envelope data.",
    });
  }

  return envelope.data as T;
};

const callEndpoint = async <Req, Res>(
  endpoint: string,
  payload: Req
): Promise<Res> => {
  const fn = httpsCallable<Req, SuccessEnvelope<Res> | FailureEnvelope>(
    getFirebaseFunctions(),
    endpoint
  );
  const result = await fn(payload);
  return extractCallableData<Res>(endpoint, result.data);
};

const toIsoString = (value: any): string => {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
};

const normalizeString = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const ensureNonEmptyString = (
  value: unknown,
  fieldName: string,
  maxLength = MAX_VENUE_FIELD_LENGTH
): string => {
  const normalized = normalizeString(value, maxLength);
  if (!normalized) {
    throw new Error(`INVALID_ARGUMENT: ${fieldName} is required.`);
  }
  return normalized;
};

const normalizeOptionalString = (
  value: unknown,
  maxLength = MAX_VENUE_FIELD_LENGTH
): string | undefined => {
  const normalized = normalizeString(value, maxLength);
  return normalized || undefined;
};

const normalizeIsoDate = (value: unknown, fieldName: string): string => {
  const input = ensureNonEmptyString(value, fieldName, 64);
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`INVALID_ARGUMENT: ${fieldName} must be a valid datetime.`);
  }
  return parsed.toISOString();
};

const ensureHttpsUrl = (value: unknown, fieldName: string): string => {
  const input = ensureNonEmptyString(value, fieldName, 1024);
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`INVALID_ARGUMENT: ${fieldName} must be a valid URL.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`INVALID_ARGUMENT: ${fieldName} must use http/https.`);
  }
  return parsed.toString();
};

const stripUndefined = <T extends Record<string, any>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;

const WEEKDAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

const TIME_24H_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const sanitizeOpeningSchedule = (
  value: unknown,
  strict = true
): Venue["openingSchedule"] | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const result: NonNullable<Venue["openingSchedule"]> = {
    mon: { closed: true, open: null, close: null },
    tue: { closed: true, open: null, close: null },
    wed: { closed: true, open: null, close: null },
    thu: { closed: true, open: null, close: null },
    fri: { closed: true, open: null, close: null },
    sat: { closed: true, open: null, close: null },
    sun: { closed: true, open: null, close: null },
  };

  for (const day of WEEKDAY_KEYS) {
    const dayValue = source[day];
    if (!dayValue || typeof dayValue !== "object") continue;
    const dayRecord = dayValue as Record<string, unknown>;
    const closed = dayRecord.closed === true;
    const open = normalizeOptionalString(dayRecord.open, 5) ?? null;
    const close = normalizeOptionalString(dayRecord.close, 5) ?? null;

    if (!closed) {
      if (!open || !close || !TIME_24H_PATTERN.test(open) || !TIME_24H_PATTERN.test(close)) {
        if (strict) {
          throw new Error(`INVALID_ARGUMENT: openingSchedule.${day} must include valid open/close HH:MM.`);
        }
        result[day] = { closed: true, open: null, close: null };
        continue;
      }
    }

    result[day] = {
      closed,
      open: closed ? null : open,
      close: closed ? null : close,
    };
  }

  return result;
};

const sanitizeVenueLocation = (
  value: unknown
): Venue["location"] | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const latitudeRaw = source.latitude;
  const longitudeRaw = source.longitude;

  if (typeof latitudeRaw !== "number" || !Number.isFinite(latitudeRaw)) {
    throw new Error("INVALID_ARGUMENT: location.latitude must be a finite number.");
  }
  if (typeof longitudeRaw !== "number" || !Number.isFinite(longitudeRaw)) {
    throw new Error("INVALID_ARGUMENT: location.longitude must be a finite number.");
  }
  if (latitudeRaw < -90 || latitudeRaw > 90) {
    throw new Error("INVALID_ARGUMENT: location.latitude out of range.");
  }
  if (longitudeRaw < -180 || longitudeRaw > 180) {
    throw new Error("INVALID_ARGUMENT: location.longitude out of range.");
  }

  return stripUndefined({
    latitude: Number(latitudeRaw.toFixed(7)),
    longitude: Number(longitudeRaw.toFixed(7)),
    placeId: normalizeOptionalString(source.placeId, 128),
    city: normalizeOptionalString(source.city, 120),
    country: normalizeOptionalString(source.country, 120),
  });
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const computeFileSha256Hex = async (file: File): Promise<string | undefined> => {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return undefined;
    const buffer = await file.arrayBuffer();
    const digest = await subtle.digest("SHA-256", buffer);
    const bytes = new Uint8Array(digest);
    return Array.from(bytes)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
};

const toNonNegativeInt = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  return 0;
};

const toProfileUser = (uid: string, source: Record<string, unknown>): User => {
  const normalizedUid = normalizeString(uid, 128);
  const normalizedName = normalizeString(source.name, 80) || "New User";
  const normalizedHandle = normalizeString(source.handle, 40) || `@${normalizedUid.slice(0, 12)}`;
  const normalizedAvatar =
    normalizeString(source.avatarUrl, 2048) ||
    `https://api.dicebear.com/8.x/lorelei/svg?seed=${normalizedUid}`;

  return {
    uid: normalizedUid,
    email: normalizeString(source.email, 320),
    name: normalizedName,
    displayName: normalizedName,
    handle: normalizedHandle.startsWith("@")
      ? normalizedHandle
      : `@${normalizedHandle}`,
    avatarUrl: normalizedAvatar,
    bannerUrl: normalizeString(source.bannerUrl, 2048),
    joinDate: toIsoString(source.joinDate || source.createdAt),
    bioEn: normalizeString(source.bioEn, 500),
    bioAr: normalizeString(source.bioAr, 500),
    bio: normalizeString(source.bioEn, 500),
    followers: toNonNegativeInt(source.followers ?? source.followerCount),
    followerCount: toNonNegativeInt(source.followers ?? source.followerCount),
    following: toNonNegativeInt(source.following ?? source.followingCount),
    followingCount: toNonNegativeInt(source.following ?? source.followingCount),
    lastActive: toIsoString(source.lastActive || source.updatedAt || source.createdAt),
    booksRead: toNonNegativeInt(source.booksRead),
    quotesSaved: toNonNegativeInt(source.quotesSaved),
    shelvesCount: toNonNegativeInt(source.shelvesCount),
    wordsWritten: toNonNegativeInt(source.wordsWritten),
    aiConsent:
      typeof source.aiConsent === "boolean" ? source.aiConsent : undefined,
    reportsCount: toNonNegativeInt(source.reportsCount),
    isSuspended: source.isSuspended === true,
  };
};

const toProfileReview = (source: Record<string, unknown>): Review => {
  const bookId = ensureNonEmptyString(
    normalizeString(source.bookId, 128),
    "bookId",
    128
  );
  const userId = ensureNonEmptyString(
    normalizeString(source.userId, 128),
    "userId",
    128
  );

  return {
    id: ensureNonEmptyString(normalizeString(source.id, 128), "id", 128),
    bookId,
    bookTitleEn: normalizeString(source.bookTitleEn, 300),
    bookTitleAr: normalizeString(source.bookTitleAr, 300),
    bookAuthorEn: normalizeString(source.bookAuthorEn, 300),
    bookAuthorAr: normalizeString(source.bookAuthorAr, 300),
    bookCoverThumbUrl: normalizeString(source.bookCoverThumbUrl, 2048),
    bookCoverUrl: normalizeString(source.bookCoverUrl, 2048),
    userId,
    rating: Math.min(5, Math.max(1, toNonNegativeInt(source.rating) || 1)),
    text: normalizeString(source.text, 2000),
    authorName: normalizeString(source.authorName, 120),
    authorHandle: normalizeString(source.authorHandle, 120),
    authorAvatar: normalizeString(source.authorAvatar, 2048),
    timestamp: toIsoString(source.timestamp),
    upvotes: toNonNegativeInt(source.upvotes),
    downvotes: toNonNegativeInt(source.downvotes),
    commentsCount: toNonNegativeInt(source.commentsCount),
  };
};

const toProfileBook = (source: Record<string, unknown>): Book => {
  const id = ensureNonEmptyString(normalizeString(source.id, 128), "id", 128);
  const titleEn = normalizeString(source.titleEn, 300);
  const titleAr = normalizeString(source.titleAr, 300);
  const authorEn = normalizeString(source.authorEn, 300);
  const authorAr = normalizeString(source.authorAr, 300);

  return {
    id,
    authorId: normalizeString(source.authorId, 128) || "author_unknown",
    titleEn,
    titleAr,
    authorEn,
    authorAr,
    descriptionEn: normalizeString(source.descriptionEn, 5000),
    descriptionAr: normalizeString(source.descriptionAr, 5000),
    coverUrl: normalizeString(source.coverUrl, 2048),
    rating:
      typeof source.rating === "number" && Number.isFinite(source.rating)
        ? Math.max(0, source.rating)
        : 0,
    ratingsCount: toNonNegativeInt(source.ratingsCount),
    isEbookAvailable: source.isEbookAvailable === true,
    genresEn: Array.isArray(source.genresEn)
      ? source.genresEn.filter((item): item is string => typeof item === "string")
      : [],
    genresAr: Array.isArray(source.genresAr)
      ? source.genresAr.filter((item): item is string => typeof item === "string")
      : [],
    publicationDate: normalizeString(source.publicationDate, 64),
    pageCount: toNonNegativeInt(source.pageCount) || undefined,
    ...(typeof source.ebookAttachmentId === "string" &&
    source.ebookAttachmentId.trim().length > 0
      ? { ebookAttachmentId: source.ebookAttachmentId.trim() }
      : {}),
  };
};

/* =========================
   USERS
========================= */
class FirebaseUserService {
  async getProfile(uid: string): Promise<User> {
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const profile = await callEndpoint<{ uid: string }, Record<string, unknown>>(
      "getPublicProfile",
      { uid: normalizedUid }
    );
    return toProfileUser(normalizedUid, profile);
  }

  async createProfile(uid: string, user: User): Promise<void> {
    const db = getDb();
    if (!db) return;
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    await setDoc(doc(db, "users", normalizedUid), user, { merge: true });
    await setDoc(
      doc(db, "public_profiles", normalizedUid),
      {
        uid: normalizedUid,
        name: normalizeString(user.name, 80) || "New User",
        handle: normalizeString(user.handle, 40) || `@${normalizedUid.slice(0, 12)}`,
        avatarUrl:
          normalizeString(user.avatarUrl, 2048) ||
          `https://api.dicebear.com/8.x/lorelei/svg?seed=${normalizedUid}`,
        bannerUrl: normalizeString(user.bannerUrl, 2048),
        bioEn: normalizeString(user.bioEn, 500),
        bioAr: normalizeString(user.bioAr, 500),
        joinDate: toIsoString(user.joinDate),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  async updateProfile(uid: string, data: Partial<User>): Promise<void> {
    ensureNonEmptyString(uid, "uid", 128);

    const allowedKeys = new Set([
      "name",
      "bioEn",
      "bioAr",
      "avatarUrl",
      "bannerUrl",
      "aiConsent",
    ]);

    const updates = Object.fromEntries(
      Object.entries(data).filter(
        ([key, value]) => allowedKeys.has(key) && value !== undefined
      )
    );

    if (Object.keys(updates).length === 0) {
      return;
    }

    await callEndpoint<
      { updates: Record<string, unknown> },
      { updated: boolean; changedFields: string[]; updatedAt: string }
    >("updateOwnProfile", { updates });
  }

  async getSuggestedProfiles(uid: string): Promise<User[]> {
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const profiles = await callEndpoint<
      { limit: number },
      Record<string, unknown>[]
    >("getSuggestedProfiles", { limit: 20 });

    return profiles
      .map((profile) => ({
        uid: normalizeString(profile.uid, 128),
        profile,
      }))
      .filter(
        (entry) => entry.uid.length > 0 && entry.uid !== normalizedUid
      )
      .map((entry) => toProfileUser(entry.uid, entry.profile));
  }

  async getProfilePosts(uid: string, limitSize = 20): Promise<Post[]> {
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const boundedLimit = Math.min(30, Math.max(1, toNonNegativeInt(limitSize) || 20));
    const response = await callEndpoint<
      { uid: string; limit: number },
      { items: Record<string, unknown>[]; hasMore: boolean }
    >("listProfilePosts", { uid: normalizedUid, limit: boundedLimit });

    return response.items.map((item) =>
      normalizePost({
        ...item,
        id: normalizeString(item.id, 128),
      })
    );
  }

  async getProfileReviews(uid: string, limitSize = 20): Promise<Review[]> {
    const page = await this.getProfileReviewsPage(uid, { limit: limitSize });
    return page.items;
  }

  async getProfileReviewsPage(
    uid: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ items: Review[]; hasMore: boolean; nextCursor?: string; revision?: string }> {
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const boundedLimit = Math.min(
      30,
      Math.max(1, toNonNegativeInt(options?.limit) || 20)
    );
    const cursor =
      typeof options?.cursor === "string" && options.cursor.trim()
        ? options.cursor.trim().slice(0, 96)
        : undefined;
    try {
      const response = await callEndpoint<
        { uid: string; limit: number; cursor?: string },
        {
          items: Record<string, unknown>[];
          hasMore: boolean;
          nextCursor?: string;
          revision?: string;
        }
      >("listProfileReviews", {
        uid: normalizedUid,
        limit: boundedLimit,
        ...(cursor ? { cursor } : {}),
      });

      const items = response.items
        .map((item) => {
          try {
            return toProfileReview(item);
          } catch {
            return null;
          }
        })
        .filter((review): review is Review => review !== null);

      return {
        items,
        hasMore: response.hasMore === true,
        ...(typeof response.nextCursor === "string" &&
        response.nextCursor.trim().length > 0
          ? { nextCursor: response.nextCursor.trim().slice(0, 96) }
          : {}),
        ...(typeof response.revision === "string" &&
        response.revision.trim().length > 0
          ? { revision: response.revision.trim().slice(0, 64) }
          : {}),
      };
    } catch (callableError) {
      const errorCode =
        callableError &&
        typeof callableError === "object" &&
        "code" in callableError &&
        typeof (callableError as { code?: unknown }).code === "string"
          ? String((callableError as { code: string }).code)
          : "UNKNOWN";
      const queryShape =
        callableError &&
        typeof callableError === "object" &&
        "queryShape" in callableError &&
        typeof (callableError as { queryShape?: unknown }).queryShape === "string"
          ? String((callableError as { queryShape: string }).queryShape)
          : "callable:listProfileReviews(uid,limit)";
      const indexHint =
        callableError &&
        typeof callableError === "object" &&
        "indexHint" in callableError &&
        typeof (callableError as { indexHint?: unknown }).indexHint === "string"
          ? String((callableError as { indexHint: string }).indexHint)
          : "firestore.indexes.json: collectionGroup=reviews";

      console.error("[ProfileReviews][FAIL_FAST]", {
        endpoint: "listProfileReviews",
        code: errorCode,
        uid: normalizedUid,
        cursor: cursor ?? null,
        queryShape,
        indexHint,
      });
      throw callableError;
    }
  }

  async getProfileBooks(uid: string, limitSize = 20): Promise<Book[]> {
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const boundedLimit = Math.min(30, Math.max(1, toNonNegativeInt(limitSize) || 20));
    const response = await callEndpoint<
      { uid: string; limit: number },
      { items: Record<string, unknown>[]; hasMore: boolean }
    >("listProfileBooks", { uid: normalizedUid, limit: boundedLimit });

    return response.items
      .map((item) => {
        try {
          return toProfileBook(item);
        } catch {
          return null;
        }
      })
      .filter((book): book is Book => book !== null);
  }

  async followUser(followerId: string, targetId: string): Promise<void> {
    const normalizedFollowerId = ensureNonEmptyString(
      followerId,
      "followerId",
      128
    );
    const normalizedTargetId = ensureNonEmptyString(targetId, "targetId", 128);

    if (normalizedFollowerId === normalizedTargetId) {
      throw new Error("INVALID_ARGUMENT: Cannot follow yourself.");
    }

    await callEndpoint<
      { targetUid: string },
      { targetUid: string; following: boolean }
    >("followUser", { targetUid: normalizedTargetId });
  }

  async unfollowUser(followerId: string, targetId: string): Promise<void> {
    const normalizedFollowerId = ensureNonEmptyString(
      followerId,
      "followerId",
      128
    );
    const normalizedTargetId = ensureNonEmptyString(targetId, "targetId", 128);

    if (normalizedFollowerId === normalizedTargetId) {
      throw new Error("INVALID_ARGUMENT: Cannot unfollow yourself.");
    }

    await callEndpoint<
      { targetUid: string },
      { targetUid: string; following: boolean }
    >("unfollowUser", { targetUid: normalizedTargetId });
  }

  async getStats(uid: string): Promise<UserStats> {
    const db = getDb();
    if (!db) {
      return {
        followers: 0,
        following: 0,
        posts: 0,
        reviews: 0,
        booksRead: 0,
        booksPublished: 0,
        wordsWritten: 0,
        postsPublished: 0,
        shelvesCreated: 0,
        quotesAuthored: 0,
      };
    }

    const snap = await getDoc(doc(db, "user_stats", uid));

    if (!snap.exists()) {
      return {
        followers: 0,
        following: 0,
        posts: 0,
        reviews: 0,
        booksRead: 0,
        booksPublished: 0,
        wordsWritten: 0,
        postsPublished: 0,
        shelvesCreated: 0,
        quotesAuthored: 0,
      };
    }

    const data = snap.data() as Partial<UserStats> & {
      counters?: Record<string, unknown>;
    };
    const counters = data.counters || {};

    return {
      followers: toNonNegativeInt(data.followers ?? counters.followers),
      following: toNonNegativeInt(data.following ?? counters.following),
      posts: data.posts || 0,
      reviews: data.reviews || 0,
      booksRead: toNonNegativeInt(data.booksRead ?? counters.totalBooks),
      booksPublished: data.booksPublished || 0,
      wordsWritten: data.wordsWritten || 0,
      postsPublished: data.postsPublished || 0,
      shelvesCreated: toNonNegativeInt(data.shelvesCreated ?? counters.totalShelves),
      quotesAuthored: data.quotesAuthored || 0,
      profileCompletionScore: data.profileCompletionScore,
    };
  }

  async getBookmarks(uid: string): Promise<Bookmark[]> {
    const db = getDb();
    if (!db) return [];

    const bookmarkCollections = [
      "post_bookmarks",
      "venue_bookmarks",
      "event_bookmarks",
      "bookmarks",
    ] as const;

    const snaps = await Promise.all(
      bookmarkCollections.map((subCollection) =>
        getDocs(
          query(
            collection(db, "users", uid, subCollection),
            orderBy("timestamp", "desc"),
            limit(200)
          )
        )
      )
    );

    return snaps
      .flatMap((snap) => snap.docs)
      .map((bookmarkDoc) => {
        const data = bookmarkDoc.data() as Record<string, unknown>;
        const typeValue = typeof data.type === "string" ? data.type : null;
        const entityIdValue =
          typeof data.entityId === "string" && data.entityId.trim()
            ? data.entityId.trim()
            : null;

        if (!typeValue || !entityIdValue) {
          return null;
        }

        return {
          id: bookmarkDoc.id,
          type: typeValue as Bookmark["type"],
          entityId: entityIdValue,
          timestamp: toIsoString(data.timestamp),
          ...(typeof data.quoteOwnerId === "string" && data.quoteOwnerId.trim()
            ? { quoteOwnerId: data.quoteOwnerId.trim() }
            : {}),
        } satisfies Bookmark;
      })
      .filter((bookmark): bookmark is Bookmark => bookmark !== null)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 200);
  }

  async getAgentSessions(uid: string): Promise<AgentSession[]> {
    const db = getDb();
    if (!db) return [];

    const sessionsQuery = query(
      collection(db, "users", uid, "agent_sessions"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const snap = await getDocs(sessionsQuery);

    return snap.docs
      .map((sessionDoc) => {
        const data = sessionDoc.data() as Record<string, unknown>;
        if (typeof data.agentId !== "string" || !data.agentId.trim()) return null;
        return {
          id: sessionDoc.id,
          agentId: data.agentId.trim(),
          title:
            typeof data.title === "string" && data.title.trim()
              ? data.title.trim()
              : "Conversation",
          lastMessage:
            typeof data.lastMessage === "string" ? data.lastMessage : "",
          timestamp: toIsoString(data.timestamp),
          ...(data.isPinned === true ? { isPinned: true } : {}),
        } satisfies AgentSession;
      })
      .filter((session): session is AgentSession => session !== null);
  }

  async getChatHistory(uid: string, sessionId: string): Promise<ChatMessage[]> {
    const db = getDb();
    if (!db) return [];

    const normalizedSessionId = ensureNonEmptyString(sessionId, "sessionId", 128);
    const historyQuery = query(
      collection(db, "users", uid, "agent_sessions", normalizedSessionId, "messages"),
      orderBy("timestamp", "asc"),
      limit(500)
    );
    const snap = await getDocs(historyQuery);

    return snap.docs
      .map((messageDoc) => {
        const data = messageDoc.data() as Record<string, unknown>;
        if (data.role !== "user" && data.role !== "model") return null;
        if (typeof data.text !== "string" || !data.text.trim()) return null;

        return {
          id: messageDoc.id,
          role: data.role,
          text: data.text,
          timestamp: toIsoString(data.timestamp),
        } satisfies ChatMessage;
      })
      .filter((message): message is ChatMessage => message !== null);
  }

  async saveAgentMessage(
    uid: string,
    sessionId: string,
    message: Omit<ChatMessage, "id">
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    const normalizedSessionId = ensureNonEmptyString(sessionId, "sessionId", 128);
    const role = message.role === "model" ? "model" : "user";
    const text = ensureNonEmptyString(message.text, "text", 10_000);
    const timestamp =
      typeof message.timestamp === "string" && message.timestamp.trim()
        ? message.timestamp
        : new Date().toISOString();

    const messageRef = doc(
      collection(db, "users", uid, "agent_sessions", normalizedSessionId, "messages")
    );

    await setDoc(messageRef, {
      role,
      text,
      timestamp,
      createdAt: serverTimestamp(),
    });
  }

  async updateAgentSession(
    uid: string,
    sessionId: string,
    data: Partial<AgentSession>
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    const normalizedSessionId = ensureNonEmptyString(sessionId, "sessionId", 128);
    const agentId = normalizeOptionalString(data.agentId, 64);
    const title = normalizeOptionalString(data.title, 180);
    const lastMessage = normalizeOptionalString(data.lastMessage, 500);
    const timestamp = normalizeOptionalString(data.timestamp, 64) ?? new Date().toISOString();

    await setDoc(
      doc(db, "users", uid, "agent_sessions", normalizedSessionId),
      stripUndefined({
        agentId,
        title: title || "Conversation",
        lastMessage,
        timestamp,
        isPinned: data.isPinned === true,
        updatedAt: serverTimestamp(),
      }),
      { merge: true }
    );
  }

  async createAgentSession(uid: string, session: AgentSession): Promise<void> {
    const db = getDb();
    if (!db) return;

    const normalizedSessionId = ensureNonEmptyString(session.id, "session.id", 128);
    const agentId = ensureNonEmptyString(session.agentId, "session.agentId", 64);
    const title = normalizeOptionalString(session.title, 180) || "Conversation";
    const lastMessage = normalizeOptionalString(session.lastMessage, 500) || "";
    const timestamp = normalizeOptionalString(session.timestamp, 64) || new Date().toISOString();

    await setDoc(
      doc(db, "users", uid, "agent_sessions", normalizedSessionId),
      {
        agentId,
        title,
        lastMessage,
        timestamp,
        isPinned: session.isPinned === true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  async importGoodreadsData(
    uid: string,
    file: File
  ): Promise<{ booksImported: number; shelvesCreated: number; reviewsImported: number }> {
    const db = getDb();
    if (!db) {
      throw new Error("FIREBASE_NOT_INITIALIZED");
    }

    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const fileName = ensureNonEmptyString(file?.name || "", "file.name", 255);
    const fileSize =
      typeof file?.size === "number" && Number.isFinite(file.size)
        ? Math.trunc(file.size)
        : 0;
    if (fileSize <= 0) {
      throw new Error("INVALID_ARGUMENT: file must be non-empty.");
    }

    const idempotencyKey = `gr_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 12)}`.replace(/[^A-Za-z0-9_-]/g, "_");
    const contentSha256 = await computeFileSha256Hex(file);

    const startResponse = await callEndpoint<
      {
        fileName: string;
        fileSize: number;
        mimeType?: string;
        sourceKind?: "AUTO" | "CSV" | "DSAR_JSON";
        contentSha256?: string;
        idempotencyKey: string;
      },
      {
        importId: string;
        status: "UPLOADING";
        uploadUrl: string;
        uploadMethod: "PUT";
        uploadHeaders: Record<string, string>;
        expiresAt: string;
      }
    >("startGoodreadsImport", {
      fileName,
      fileSize,
      mimeType: typeof file.type === "string" ? file.type : "",
      sourceKind: "AUTO",
      contentSha256,
      idempotencyKey,
    });

    const uploadResponse = await fetch(startResponse.uploadUrl, {
      method: startResponse.uploadMethod,
      headers: startResponse.uploadHeaders,
      body: file,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `GOODREADS_UPLOAD_FAILED: ${uploadResponse.status} ${uploadResponse.statusText}`
      );
    }

    const finalizeResponse = await callEndpoint<
      { importId: string },
      {
        importId: string;
        status: "QUEUED";
        detectedSourceKind: "CSV" | "DSAR_JSON";
        parserVersion: "gr_import_v2";
      }
    >("finalizeGoodreadsImport", {
      importId: startResponse.importId,
    });

    const timeoutMs = 5 * 60 * 1000;
    const pollIntervalMs = 1500;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const sessionSnap = await getDoc(
        doc(db, "imports", normalizedUid, "sessions", finalizeResponse.importId)
      );

      if (!sessionSnap.exists()) {
        await sleep(pollIntervalMs);
        continue;
      }

      const data = sessionSnap.data() as Record<string, unknown>;
      const status = normalizeString(data.status, 32);

      if (status === "FAILED") {
        const failure =
          data.failure && typeof data.failure === "object"
            ? (data.failure as Record<string, unknown>)
            : null;
        const message =
          normalizeString(failure?.message, 300) ||
          "Goodreads import failed.";
        throw new Error(`GOODREADS_IMPORT_FAILED: ${message}`);
      }

      if (status === "COMPLETE") {
        const summary =
          data.summary && typeof data.summary === "object"
            ? (data.summary as Record<string, unknown>)
            : {};
        const progress =
          data.progress && typeof data.progress === "object"
            ? (data.progress as Record<string, unknown>)
            : {};

        const booksImported =
          toNonNegativeInt(summary.booksImported) ||
          toNonNegativeInt(progress.succeeded);
        const shelvesCreated = toNonNegativeInt(summary.shelvesCreated);
        const reviewsImported = toNonNegativeInt(summary.reviewsImported);

        return {
          booksImported,
          shelvesCreated,
          reviewsImported,
        };
      }

      await sleep(pollIntervalMs);
    }

    throw new Error("DEADLINE_EXCEEDED: Goodreads import is still processing.");
  }

  async submitFeedback(
    uid: string,
    feedback: Omit<Feedback, "id" | "userId" | "timestamp">
  ): Promise<void> {
    const db = getDb();
    if (!db) return;

    const text = ensureNonEmptyString(feedback.text, "feedback.text", 4000);
    const type = feedback.type === "praise-general" ? "praise-general" : "action-required";
    const email = normalizeOptionalString(feedback.email, 320);

    const feedbackRef = doc(collection(db, "feedback"));
    await setDoc(feedbackRef, {
      userId: uid,
      text,
      type,
      email: email || null,
      timestamp: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/* =========================
   SHELVES
========================= */
class FirebaseShelfService {
  async getUserShelves(uid: string): Promise<Shelf[]> {
    const db = getDb();
    if (!db) return [];
    const q = query(
      collection(db, "shelves"),
      where("ownerId", "==", uid),
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id })) as Shelf[];
  }

  async getShelf(ownerId: string, shelfId: string): Promise<Shelf> {
    const db = getDb();
    if (!db) throw new Error("Firebase not initialized");
    const snap = await getDoc(doc(db, "shelves", shelfId));
    if (!snap.exists()) throw new Error("Shelf not found");
    return { ...snap.data(), id: snap.id } as Shelf;
  }

  async createShelf(
    uid: string,
    data: { titleEn: string; titleAr: string; entries?: Record<string, any> }
  ): Promise<Shelf> {
    const db = getDb();
    if (!db) throw new Error("Firebase not initialized");

    const shelfRef = doc(collection(db, "shelves"));
    const shelfData = {
      ownerId: uid,
      titleEn: data.titleEn,
      titleAr: data.titleAr,
      entries: data.entries || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isSystem: false,
    };

    await setDoc(shelfRef, shelfData);
    return { id: shelfRef.id, ...shelfData } as unknown as Shelf;
  }

  async updateShelf(uid: string, shelfId: string, updates: Partial<Shelf>): Promise<void> {
    const db = getDb();
    if (!db) return;
    const shelfRef = doc(db, "shelves", shelfId);
    await updateDoc(shelfRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  }

  async deleteShelf(uid: string, shelfId: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    await deleteDoc(doc(db, "shelves", shelfId));
  }

  async getShelfEntries(
    uid: string,
    shelfId: string,
    options?: { resolveBooks?: boolean }
  ): Promise<any[]> {
    const db = getDb();
    if (!db) return [];

    const shelfRef = doc(db, "shelves", shelfId);
    const snap = await getDoc(shelfRef);
    if (!snap.exists()) return [];

    const data = snap.data() as any;
    const canonicalEntries =
      data?.entries && typeof data.entries === 'object'
        ? data.entries
        : {};

    // Backward-compatibility: older upload flow wrote keys like "entries.<bookId>"
    // as top-level fields. Merge them into the effective entries map for rendering.
    const legacyEntries: Record<string, any> = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (!key.startsWith('entries.')) continue;
      if (!value || typeof value !== 'object') continue;

      const legacyBookId = key.slice('entries.'.length).trim();
      if (!legacyBookId) continue;

      legacyEntries[legacyBookId] = value;
    }

    const entries = {
      ...legacyEntries,
      ...canonicalEntries,
    };

    const rawEntries = Object.entries(entries).map(([bookId, entry]: any) => ({
      bookId,
      ...(entry || {}),
    }));

    if (options?.resolveBooks === false) {
      return rawEntries;
    }

    const hydrated = await Promise.all(
      rawEntries.map(async (entry) => {
        try {
          const book = await firebaseCatalogService.getBook(entry.bookId);
          return { ...entry, book };
        } catch (err) {
          if (entry.snapshot) {
            return {
              ...entry,
              book: {
                id: entry.bookId,
                titleEn: entry.snapshot.titleEn,
                titleAr: entry.snapshot.titleAr,
                authorId: '',
                authorEn: '',
                authorAr: '',
                coverUrl: entry.snapshot.coverUrl || '',
                descriptionEn: '',
                descriptionAr: '',
                genresEn: [],
                genresAr: [],
                rating: 0,
                ratingsCount: 0,
                isEbookAvailable: false
              }
            };
          }

          console.warn("[SHELF][HYDRATION_FAILED]", entry.bookId, err);
          return { ...entry, book: null };
        }
      })
    );

    return hydrated;
  }

  async addBookToShelf(uid: string, shelfId: string, bookId: string, book?: Book): Promise<void> {
    const db = getDb();
    if (!db) return;

    const shelfRef = doc(db, "shelves", shelfId);

    const snapshot = book ? {
      titleEn: book.titleEn || null,
      titleAr: book.titleAr || null,
      coverUrl: book.coverUrl || null,
    } : null;

    await updateDoc(shelfRef, {
      [`entries.${bookId}`]: {
        bookId,
        addedAt: new Date().toISOString(),
        snapshot,
      },
      updatedAt: serverTimestamp()
    });
  }

  async removeBookFromShelf(uid: string, shelfId: string, bookId: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    const shelfRef = doc(db, "shelves", shelfId);
    await updateDoc(shelfRef, {
      [`entries.${bookId}`]: deleteField(),
      updatedAt: serverTimestamp()
    });
  }

  async followShelf(uid: string, shelfId: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    const followRef = doc(db, "shelves", shelfId, "followers", uid);
    await setDoc(followRef, {
      uid,
      followedAt: serverTimestamp()
    });
  }

  async getStats(shelfId: string): Promise<ShelfStats> {
    const db = getDb();
    if (!db) return { followers: 0, posts: 0 };
    const snap = await getDoc(doc(db, "shelf_stats", shelfId));
    if (snap.exists()) {
      const data = snap.data();
      return {
        followers: data.followers || 0,
        posts: data.posts || 0
      };
    }
    return { followers: 0, posts: 0 };
  }

  async getRecommendedShelves(): Promise<RecommendedShelf[]> {
    return [];
  }
}

/* =========================
   VENUES
========================= */
class FirebaseVenueService {
  private requireDb() {
    const db = getDb();
    if (!db) throw new Error("Firebase not initialized");
    return db;
  }

  private async resolveEntity(venueId: string): Promise<{
    collectionName: "venues" | "events";
    data: any;
  }> {
    const db = this.requireDb();
    const normalizedId = ensureNonEmptyString(venueId, "venueId", 128);

    const venueRef = doc(db, "venues", normalizedId);
    const venueSnap = await getDoc(venueRef);
    if (venueSnap.exists()) {
      return { collectionName: "venues", data: { id: venueSnap.id, ...venueSnap.data() } };
    }

    const eventRef = doc(db, "events", normalizedId);
    const eventSnap = await getDoc(eventRef);
    if (eventSnap.exists()) {
      return { collectionName: "events", data: { id: eventSnap.id, ...eventSnap.data() } };
    }

    throw new Error("NOT_FOUND: Venue or event not found.");
  }

  private mapVenue(data: any): Venue {
    const rawLocation =
      data && typeof data.location === "object" ? (data.location as Record<string, unknown>) : undefined;
    const latitude =
      typeof rawLocation?.latitude === "number" && Number.isFinite(rawLocation.latitude)
        ? rawLocation.latitude
        : undefined;
    const longitude =
      typeof rawLocation?.longitude === "number" && Number.isFinite(rawLocation.longitude)
        ? rawLocation.longitude
        : undefined;

    return {
      id: data.id,
      ownerId: data.ownerId,
      name: data.name,
      type: data.type,
      address: data.address,
      imageUrl: data.imageUrl,
      descriptionEn: data.descriptionEn || "",
      descriptionAr: data.descriptionAr || "",
      openingHours: data.openingHours || "",
      rating: typeof data.rating === "number" ? data.rating : undefined,
      ratingsCount: typeof data.ratingsCount === "number" ? data.ratingsCount : undefined,
      websiteUrl: data.websiteUrl || undefined,
      phone: data.phone || undefined,
      openingSchedule: sanitizeOpeningSchedule(data.openingSchedule, false),
      location:
        latitude !== undefined && longitude !== undefined
          ? stripUndefined({
              latitude,
              longitude,
              placeId: normalizeOptionalString(rawLocation?.placeId, 128),
              city: normalizeOptionalString(rawLocation?.city, 120),
              country: normalizeOptionalString(rawLocation?.country, 120),
            })
          : undefined,
    };
  }

  private mapEvent(data: any): Event {
    return {
      id: data.id,
      ownerId: data.ownerId,
      titleEn: data.titleEn,
      titleAr: data.titleAr,
      type: data.type,
      dateTime: data.dateTime,
      imageUrl: data.imageUrl,
      privacy: data.privacy === "private" ? "private" : "public",
      duration: data.duration || undefined,
      isOnline: Boolean(data.isOnline),
      locationId: normalizeOptionalString(data.locationId, 128),
      venueName: data.venueName || undefined,
      link: data.link || undefined,
    };
  }

  async searchVenues(queryText: string): Promise<(Venue | Event)[]> {
    const db = this.requireDb();
    const normalizedQuery = normalizeString(queryText, 120).toLowerCase();

    const venuesRef = collection(db, "venues");
    const eventsRef = collection(db, "events");

    const venuesQuery = normalizedQuery.length >= 2
      ? query(
          venuesRef,
          where("nameLower", ">=", normalizedQuery),
          where("nameLower", "<=", `${normalizedQuery}\uf8ff`),
          orderBy("nameLower"),
          limit(MAX_VENUE_SEARCH_RESULTS)
        )
      : query(venuesRef, orderBy("updatedAt", "desc"), limit(MAX_VENUE_SEARCH_RESULTS));

    const eventsQuery = normalizedQuery.length >= 2
      ? query(
          eventsRef,
          where("titleLower", ">=", normalizedQuery),
          where("titleLower", "<=", `${normalizedQuery}\uf8ff`),
          orderBy("titleLower"),
          limit(MAX_VENUE_SEARCH_RESULTS)
        )
      : query(eventsRef, orderBy("dateTime", "asc"), limit(MAX_VENUE_SEARCH_RESULTS));

    const [venuesSnap, eventsSnap] = await Promise.all([
      getDocs(venuesQuery),
      getDocs(eventsQuery),
    ]);

    const venues = venuesSnap.docs.map((snap) =>
      this.mapVenue({ id: snap.id, ...snap.data() })
    );
    const events = eventsSnap.docs.map((snap) =>
      this.mapEvent({ id: snap.id, ...snap.data() })
    );

    return [...venues, ...events];
  }

  async getVenue(venueId: string): Promise<Venue | Event> {
    const entity = await this.resolveEntity(venueId);
    if (entity.collectionName === "venues") {
      return this.mapVenue(entity.data);
    }
    return this.mapEvent(entity.data);
  }

  async getVenueReviews(venueId: string): Promise<VenueReview[]> {
    const db = this.requireDb();
    const entity = await this.resolveEntity(venueId);
    const reviewsRef = collection(db, entity.collectionName, venueId, "reviews");
    const reviewsQuery = query(reviewsRef, orderBy("timestamp", "desc"), limit(100));
    const reviewsSnap = await getDocs(reviewsQuery);

    return reviewsSnap.docs.map((snap) => {
      const data = snap.data() as any;
      return {
        id: snap.id,
        venueId,
        userId: data.userId,
        rating: data.rating,
        text: data.text || "",
        authorName: data.authorName || "Unknown",
        authorHandle: data.authorHandle || "@unknown",
        authorAvatar: data.authorAvatar || "",
        timestamp: toIsoString(data.timestamp),
        upvotes: data.upvotes || 0,
        downvotes: data.downvotes || 0,
        commentsCount: data.commentsCount || 0,
      };
    });
  }

  async submitVenueReview(
    uid: string,
    venueId: string,
    rating: number,
    text: string
  ): Promise<void> {
    const db = this.requireDb();
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedVenueId = ensureNonEmptyString(venueId, "venueId", 128);
    const normalizedText = normalizeString(text, MAX_REVIEW_LENGTH);
    const normalizedRating = Number(rating);

    if (!Number.isFinite(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      throw new Error("INVALID_ARGUMENT: rating must be between 1 and 5.");
    }

    const entity = await this.resolveEntity(normalizedVenueId);
    const userSnap = await getDoc(doc(db, "users", normalizedUid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    const reviewRef = doc(collection(db, entity.collectionName, normalizedVenueId, "reviews"));
    await setDoc(reviewRef, {
      venueId: normalizedVenueId,
      userId: normalizedUid,
      rating: Math.round(normalizedRating),
      text: normalizedText,
      authorName: normalizeString(userData?.name || userData?.displayName || "Unknown", 120),
      authorHandle: normalizeString(userData?.handle || "@unknown", 120),
      authorAvatar: normalizeOptionalString(userData?.avatarUrl, 1024) || "",
      upvotes: 0,
      downvotes: 0,
      commentsCount: 0,
      timestamp: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async createVenue(
    uid: string,
    data: Omit<Venue, "id" | "ownerId"> | Omit<Event, "id" | "ownerId">
  ): Promise<void> {
    const db = this.requireDb();
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);

    if ("dateTime" in data) {
      const titleEn = ensureNonEmptyString(data.titleEn, "titleEn");
      const titleAr = normalizeOptionalString(data.titleAr) || titleEn;
      const type = ensureNonEmptyString(data.type, "type");
      const dateTime = normalizeIsoDate(data.dateTime, "dateTime");
      const imageUrl = ensureHttpsUrl(data.imageUrl, "imageUrl");
      const isOnline = Boolean(data.isOnline);
      const locationId = isOnline ? undefined : normalizeOptionalString(data.locationId, 128);
      let venueName = isOnline ? undefined : normalizeOptionalString(data.venueName, 120);
      if (!isOnline && locationId) {
        const locationSnap = await getDoc(doc(db, "venues", locationId));
        if (!locationSnap.exists()) {
          throw new Error("INVALID_ARGUMENT: locationId must reference an existing location.");
        }
        if (!venueName) {
          venueName = ensureNonEmptyString(locationSnap.data()?.name, "venueName");
        }
      }
      if (!isOnline && !venueName) {
        throw new Error("INVALID_ARGUMENT: venueName or locationId is required for offline events.");
      }
      const link = isOnline ? ensureHttpsUrl(data.link, "link") : undefined;

      const eventRef = doc(collection(db, "events"));
      await setDoc(eventRef, stripUndefined({
        ownerId: normalizedUid,
        titleEn,
        titleAr,
        titleLower: titleEn.toLowerCase(),
        type,
        typeLower: type.toLowerCase(),
        dateTime,
        imageUrl,
        privacy: data.privacy === "private" ? "private" : "public",
        duration: normalizeOptionalString(data.duration),
        isOnline,
        locationId,
        venueName,
        link,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
      return;
    }

    const name = ensureNonEmptyString(data.name, "name");
    const type = ensureNonEmptyString(data.type, "type");
    const address = ensureNonEmptyString(data.address, "address");
    const imageUrl = ensureHttpsUrl(data.imageUrl, "imageUrl");
    const openingSchedule = sanitizeOpeningSchedule(data.openingSchedule);
    const location = sanitizeVenueLocation(data.location);

    const venueRef = doc(collection(db, "venues"));
    await setDoc(venueRef, stripUndefined({
      ownerId: normalizedUid,
      name,
      nameLower: name.toLowerCase(),
      type,
      typeLower: type.toLowerCase(),
      address,
      imageUrl,
      openingHours: normalizeOptionalString(data.openingHours),
      openingSchedule,
      location,
      descriptionEn: normalizeOptionalString(data.descriptionEn, 2000) || "",
      descriptionAr: normalizeOptionalString(data.descriptionAr, 2000) || "",
      rating: 0,
      ratingsCount: 0,
      websiteUrl: normalizeOptionalString(data.websiteUrl, 1024),
      phone: normalizeOptionalString(data.phone, 64),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  }

  async updateVenue(uid: string, venueId: string, data: Venue | Event): Promise<void> {
    const db = this.requireDb();
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedVenueId = ensureNonEmptyString(venueId, "venueId", 128);
    const entity = await this.resolveEntity(normalizedVenueId);

    if (entity.data.ownerId !== normalizedUid) {
      throw new Error("PERMISSION_DENIED: Only the owner can update this item.");
    }

    if (entity.collectionName === "events") {
      const eventData = data as Event;
      const titleEn = ensureNonEmptyString(eventData.titleEn, "titleEn");
      const titleAr = normalizeOptionalString(eventData.titleAr) || titleEn;
      const type = ensureNonEmptyString(eventData.type, "type");
      const dateTime = normalizeIsoDate(eventData.dateTime, "dateTime");
      const imageUrl = ensureHttpsUrl(eventData.imageUrl, "imageUrl");
      const isOnline = Boolean(eventData.isOnline);
      const locationId = isOnline ? undefined : normalizeOptionalString(eventData.locationId, 128);
      let venueName = isOnline ? undefined : normalizeOptionalString(eventData.venueName, 120);
      if (!isOnline && locationId) {
        const locationSnap = await getDoc(doc(db, "venues", locationId));
        if (!locationSnap.exists()) {
          throw new Error("INVALID_ARGUMENT: locationId must reference an existing location.");
        }
        if (!venueName) {
          venueName = ensureNonEmptyString(locationSnap.data()?.name, "venueName");
        }
      }
      if (!isOnline && !venueName) {
        throw new Error("INVALID_ARGUMENT: venueName or locationId is required for offline events.");
      }

      await updateDoc(doc(db, "events", normalizedVenueId), stripUndefined({
        titleEn,
        titleAr,
        titleLower: titleEn.toLowerCase(),
        type,
        typeLower: type.toLowerCase(),
        dateTime,
        imageUrl,
        privacy: eventData.privacy === "private" ? "private" : "public",
        duration: normalizeOptionalString(eventData.duration),
        isOnline,
        locationId,
        venueName,
        link: isOnline ? ensureHttpsUrl(eventData.link, "link") : undefined,
        updatedAt: serverTimestamp(),
      }));
      return;
    }

    const venueData = data as Venue;
    const name = ensureNonEmptyString(venueData.name, "name");
    const type = ensureNonEmptyString(venueData.type, "type");
    const address = ensureNonEmptyString(venueData.address, "address");
    const imageUrl = ensureHttpsUrl(venueData.imageUrl, "imageUrl");
    const openingSchedule = sanitizeOpeningSchedule(venueData.openingSchedule);
    const location = sanitizeVenueLocation(venueData.location);

    await updateDoc(doc(db, "venues", normalizedVenueId), stripUndefined({
      name,
      nameLower: name.toLowerCase(),
      type,
      typeLower: type.toLowerCase(),
      address,
      imageUrl,
      openingHours: normalizeOptionalString(venueData.openingHours),
      openingSchedule,
      location,
      descriptionEn: normalizeOptionalString(venueData.descriptionEn, 2000) || "",
      descriptionAr: normalizeOptionalString(venueData.descriptionAr, 2000) || "",
      websiteUrl: normalizeOptionalString(venueData.websiteUrl, 1024),
      phone: normalizeOptionalString(venueData.phone, 64),
      updatedAt: serverTimestamp(),
    }));
  }

  async saveVenue(uid: string, venueId: string): Promise<void> {
    const db = this.requireDb();
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedVenueId = ensureNonEmptyString(venueId, "venueId", 128);
    const entity = await this.resolveEntity(normalizedVenueId);
    const bookmarkType = entity.collectionName === "events" ? "event" : "venue";
    const bookmarkCollection =
      bookmarkType === "event" ? "event_bookmarks" : "venue_bookmarks";

    await setDoc(
      doc(db, "users", normalizedUid, bookmarkCollection, normalizedVenueId),
      {
        type: bookmarkType,
        entityId: normalizedVenueId,
        timestamp: serverTimestamp(),
        version: 1,
      },
      { merge: true }
    );
  }
}

/* =========================
   MESSAGING
========================= */
class FirebaseMessagingService {
  async createConversation(uid: string, peerUid: string): Promise<string> {
    ensureNonEmptyString(uid, "uid", 128);
    const normalizedPeerUid = ensureNonEmptyString(peerUid, "peerUid", 128);

    const data = await callEndpoint<
      { peerUid: string },
      { conversationId: string }
    >("createDirectConversation", {
      peerUid: normalizedPeerUid,
    });

    if (!data?.conversationId || typeof data.conversationId !== "string") {
      throw new Error("[createDirectConversation] Missing conversationId.");
    }

    return data.conversationId;
  }

  async getConversations(uid: string): Promise<Conversation[]> {
    ensureNonEmptyString(uid, "uid", 128);
    const data = await callEndpoint<
      { limit: number },
      { conversations: Conversation[] }
    >("listDirectConversations", {
      limit: 50,
    });

    if (!Array.isArray(data.conversations)) {
      throw new Error("[listDirectConversations] Invalid conversations payload.");
    }

    return data.conversations.map((conversation) => ({
      id: ensureNonEmptyString(conversation.id, "conversation.id", 128),
      contactId: ensureNonEmptyString(conversation.contactId, "conversation.contactId", 128),
      contactName: ensureNonEmptyString(conversation.contactName, "conversation.contactName", 120),
      contactAvatar:
        typeof conversation.contactAvatar === "string"
          ? conversation.contactAvatar
          : "",
      lastMessage:
        typeof conversation.lastMessage === "string"
          ? conversation.lastMessage
          : "",
      timestamp: toIsoString(conversation.timestamp),
      unreadCount:
        typeof conversation.unreadCount === "number" && conversation.unreadCount > 0
          ? Math.floor(conversation.unreadCount)
          : 0,
    }));
  }

  async getChatHistory(conversationId: string): Promise<DirectMessage[]> {
    const normalizedConversationId = ensureNonEmptyString(
      conversationId,
      "conversationId",
      190
    );

    const data = await callEndpoint<
      { conversationId: string; limit: number },
      { messages: DirectMessage[] }
    >("listDirectMessages", {
      conversationId: normalizedConversationId,
      limit: MAX_DM_LIST_LIMIT,
    });

    if (!Array.isArray(data.messages)) {
      throw new Error("[listDirectMessages] Invalid messages payload.");
    }

    return data.messages.map((message) => ({
      id: ensureNonEmptyString(message.id, "message.id", 128),
      senderId: ensureNonEmptyString(message.senderId, "message.senderId", 128),
      text: ensureNonEmptyString(message.text, "message.text", 2000),
      timestamp: toIsoString(message.timestamp),
      ...(typeof message.readByPeer === "boolean"
        ? { readByPeer: message.readByPeer }
        : {}),
    }));
  }

  async sendMessage(
    uid: string,
    conversationId: string,
    text: string,
    idempotencyKey: string
  ): Promise<{ conversationId: string; messageId: string }> {
    ensureNonEmptyString(uid, "uid", 128);
    const normalizedConversationId = ensureNonEmptyString(
      conversationId,
      "conversationId",
      190
    );
    const normalizedText = ensureNonEmptyString(text, "text", 2000);
    const normalizedIdempotencyKey = ensureNonEmptyString(
      idempotencyKey,
      "idempotencyKey",
      96
    );

    const data = await callEndpoint<
      { conversationId: string; text: string; idempotencyKey: string },
      { conversationId: string; messageId: string }
    >("sendDirectMessage", {
      conversationId: normalizedConversationId,
      text: normalizedText,
      idempotencyKey: normalizedIdempotencyKey,
    });

    if (!data?.conversationId || typeof data.conversationId !== "string") {
      throw new Error("[sendDirectMessage] Missing conversationId.");
    }
    if (!data?.messageId || typeof data.messageId !== "string") {
      throw new Error("[sendDirectMessage] Missing messageId.");
    }

    return {
      conversationId: data.conversationId,
      messageId: data.messageId,
    };
  }

  async markConversationRead(uid: string, conversationId: string): Promise<void> {
    ensureNonEmptyString(uid, "uid", 128);
    const normalizedConversationId = ensureNonEmptyString(
      conversationId,
      "conversationId",
      190
    );

    await callEndpoint<{ conversationId: string }, { conversationId: string; unreadCount: number }>(
      "markDirectConversationRead",
      {
        conversationId: normalizedConversationId,
      }
    );
  }
}

/* =========================
   SOCIAL
========================= */
class FirebaseSocialService {
  private static readonly STRUCTURED_ENTITY_TYPES = new Set([
    "book",
    "author",
    "quote",
    "shelf",
    "venue",
  ]);

  private static readonly STRUCTURED_ENTITY_ID_KEYS: Record<string, string[]> = {
    book: ["entityId", "bookId", "attachmentId", "id"],
    author: ["entityId", "authorId", "attachmentId", "id"],
    quote: ["entityId", "quoteId", "attachmentId", "id"],
    shelf: ["entityId", "shelfId", "attachmentId", "id"],
    venue: ["entityId", "venueId", "attachmentId", "id"],
  };

  private isGuestIdentity(uid: string): boolean {
    const normalized = (uid || "").trim().toLowerCase();
    return normalized.length === 0 || normalized === "guest" || normalized === "anonymous";
  }

  private normalizeCreatePostAttachment(attachment: any):
    | { attachmentId: string; type: string }
    | { type: "book" | "author" | "quote" | "shelf" | "venue"; entityId: string; entityOwnerId?: string } {
    if (!attachment || typeof attachment !== "object") {
      throw new Error("INVALID_ARGUMENT: Malformed attachment payload.");
    }

    const typeRaw =
      typeof attachment.type === "string" && attachment.type.trim()
        ? attachment.type.trim()
        : "IMAGE";
    const normalizedType = typeRaw.toLowerCase();

    if (FirebaseSocialService.STRUCTURED_ENTITY_TYPES.has(normalizedType)) {
      const idKeys = FirebaseSocialService.STRUCTURED_ENTITY_ID_KEYS[normalizedType] || [
        "entityId",
        "attachmentId",
        "id",
      ];

      const entityId = idKeys
        .map((key) => (typeof attachment[key] === "string" ? attachment[key].trim() : ""))
        .find((value) => value.length > 0);

      if (!entityId) {
        throw new Error(
          `INVALID_ARGUMENT: Structured attachment "${normalizedType}" requires entityId.`
        );
      }

      const entityOwnerIdCandidates = [
        attachment.entityOwnerId,
        attachment.quoteOwnerId,
        attachment.ownerId,
      ];
      const entityOwnerId = entityOwnerIdCandidates
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .find((value) => value.length > 0);

      return {
        type: normalizedType as "book" | "author" | "quote" | "shelf" | "venue",
        entityId,
        ...(entityOwnerId ? { entityOwnerId } : {}),
      };
    }

    const attachmentIdRaw =
      typeof attachment.attachmentId === "string"
        ? attachment.attachmentId
        : typeof attachment.id === "string"
          ? attachment.id
          : "";
    const attachmentId = attachmentIdRaw.trim();
    if (!attachmentId) {
      throw new Error("INVALID_ARGUMENT: Media attachments must include attachmentId.");
    }

    return {
      attachmentId,
      type: typeRaw,
    };
  }

  private matchesFeedFilters(post: Post, filters: string[]): boolean {
    if (!Array.isArray(filters) || filters.length === 0) {
      return true;
    }

    const normalizedFilters = filters.map((filter) => (filter || "").toLowerCase());
    const text = (post.content?.text || "").trim();
    const attachments = Array.isArray(post.content?.attachments)
      ? post.content.attachments
      : [];
    const attachmentTypes = new Set(
      attachments.map((attachment) => String(attachment?.type || "").toLowerCase())
    );

    return normalizedFilters.every((filter) => {
      if (filter === "text") return text.length > 0;
      if (filter === "media") return attachments.length > 0;
      if (filter === "book") return attachmentTypes.has("book_reference") || attachmentTypes.has("book");
      if (filter === "quote") return attachmentTypes.has("quote_reference") || attachmentTypes.has("quote");
      if (filter === "project") return attachmentTypes.has("project");
      return true;
    });
  }

  private async getFollowingAuthorIds(uid: string): Promise<Set<string>> {
    const db = getDb();
    const ids = new Set<string>();
    if (!db) return ids;

    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    ids.add(normalizedUid);

    const followSnap = await getDocs(
      query(
        collection(db, "users", normalizedUid, "following"),
        orderBy("createdAt", "desc"),
        limit(500)
      )
    );

    for (const followDoc of followSnap.docs) {
      ids.add(followDoc.id);
      const data = followDoc.data() as Record<string, unknown>;
      if (typeof data.targetUid === "string" && data.targetUid.trim()) {
        ids.add(data.targetUid.trim());
      }
      if (typeof data.uid === "string" && data.uid.trim()) {
        ids.add(data.uid.trim());
      }
    }

    return ids;
  }

  async getFeed(
    uid: string,
    scope: string,
    filters: string[] = [],
    cursorId?: string
  ): Promise<{ posts: Post[]; nextCursor?: string }> {
    const db = getDb();
    if (!db) return { posts: [], nextCursor: undefined };

    const PAGE_SIZE = 20;
    const normalizedUid = normalizeString(uid, 128);

    try {
      const postsRef = collection(db, "posts");
      const normScope = (scope || "explore").toLowerCase();
      const isGuest = this.isGuestIdentity(normalizedUid);
      const followingAuthorIds =
        normScope === "following" && !isGuest
          ? await this.getFollowingAuthorIds(normalizedUid)
          : null;

      let baseConstraints: any[] = [
        where("status", "==", "published"),
        where("isDeleted", "!=", true),
      ];

      if (normScope === "explore" || normScope === "discover") {
        baseConstraints.push(where("visibility", "==", "public"));
      } else if (normScope === "following") {
        if (isGuest) {
          baseConstraints.push(where("visibility", "==", "public"));
        } else {
          baseConstraints.push(where("visibility", "in", ["public", "followers"]));
        }
      } else if (normScope === "books") {
        baseConstraints.push(where("visibility", "==", "public"));
        baseConstraints.push(where("flags.hasAttachments", "==", true));
      }

      let q = query(
        postsRef,
        ...baseConstraints,
        orderBy("isDeleted"),
        orderBy("timestamps.createdAt", "desc"),
        orderBy("__name__", "desc"),
        limit(PAGE_SIZE)
      );

      if (cursorId && cursorRegistry.has(cursorId)) {
        const docSnap = cursorRegistry.get(cursorId);
        if (docSnap) q = query(q, startAfter(docSnap));
      }

      const snap = await getDocs(q);
      const normalizedPosts = snap.docs.map((docRef) =>
        normalizePost({ ...docRef.data(), id: docRef.id })
      );
      const posts = normalizedPosts
        .filter((post) => {
          if (followingAuthorIds && !followingAuthorIds.has(post.authorId)) {
            return false;
          }
          return this.matchesFeedFilters(post, filters);
        })
        .slice(0, PAGE_SIZE);

      const lastDoc = snap.docs[snap.docs.length - 1];
      let nextCursor: string | undefined;
      if (lastDoc && snap.docs.length === PAGE_SIZE) {
        nextCursor = lastDoc.id;
        cursorRegistry.set(nextCursor, lastDoc);
      }

      return { posts, nextCursor };
    } catch (error) {
      console.error("[SOCIAL][FEED_EXECUTION_ERROR]", error);
      throw error;
    }
  }

  async getComments(
    postId: string,
    cursorId?: string
  ): Promise<{ comments: ThreadComment[]; hasMore: boolean; nextCursor?: string }> {
    const db = getDb();
    if (!db) return { comments: [], hasMore: false };
    const normalizedPostId = ensureNonEmptyString(postId, "postId", 128);

    const PAGE_SIZE = 20;

    const commentsRef = collection(db, "posts", normalizedPostId, "comments");
    let q = query(
      commentsRef,
      where("status", "==", "published"),
      orderBy("timestamp", "asc"),
      limit(PAGE_SIZE)
    );

    if (cursorId && cursorRegistry.has(cursorId)) {
      const docSnap = cursorRegistry.get(cursorId);
      if (docSnap) q = query(q, startAfter(docSnap));
    }

    const snap = await getDocs(q);
    const comments = snap.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        authorId: data.authorId,
        authorName: data.authorName,
        authorHandle: data.authorHandle,
        authorAvatar: data.authorAvatar,
        text: data.text,
        createdAt:
          data.timestamp?.toDate?.()?.toISOString() ||
          new Date().toISOString(),
        parentId: data.parentId || null,
        likesCount: data.likesCount || 0,
        liked: false,
      } as ThreadComment;
    });

    const lastDoc = snap.docs[snap.docs.length - 1];
    const nextCursor = lastDoc?.id;
    if (lastDoc && nextCursor) {
      cursorRegistry.set(nextCursor, lastDoc);
    }

    return {
      comments,
      hasMore: snap.docs.length === PAGE_SIZE,
      nextCursor,
    };
  }

  async getPost(postId: string): Promise<Post> {
    const db = getDb();
    if (!db) {
      throw new Error("Firebase not initialized");
    }

    const normalizedPostId = ensureNonEmptyString(postId, "postId", 128);
    const snap = await getDoc(doc(db, "posts", normalizedPostId));
    if (!snap.exists()) {
      throw new Error("NOT_FOUND: Post not found.");
    }

    return normalizePost({ ...snap.data(), id: snap.id });
  }

  async getPostStats(postId: string): Promise<PostStats> {
    const db = getDb();
    if (!db) {
      return {
        likesCount: 0,
        bookmarksCount: 0,
        repostsCount: 0,
        commentsCount: 0,
      };
    }

    const normalizedPostId = ensureNonEmptyString(postId, "postId", 128);
    const snap = await getDoc(doc(db, "post_stats", normalizedPostId));
    if (!snap.exists()) {
      return {
        likesCount: 0,
        bookmarksCount: 0,
        repostsCount: 0,
        commentsCount: 0,
      };
    }

    const data = snap.data() as Record<string, unknown>;
    const counters =
      data.counters && typeof data.counters === "object"
        ? (data.counters as Record<string, unknown>)
        : {};

    return {
      likesCount: toNonNegativeInt(data.likesCount ?? counters.likes),
      bookmarksCount: toNonNegativeInt(
        data.bookmarksCount ?? counters.bookmarks
      ),
      repostsCount: toNonNegativeInt(data.repostsCount ?? counters.reposts),
      commentsCount: toNonNegativeInt(data.commentsCount ?? counters.comments),
    };
  }

  async createPost(uid: string, post: any): Promise<Post> {
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const text =
      typeof post?.content?.text === "string" ? post.content.text.trim() : "";
    const visibility =
      post?.visibility === "public" ||
      post?.visibility === "followers" ||
      post?.visibility === "private" ||
      post?.visibility === "restricted"
        ? post.visibility
        : "public";
    const publishToken =
      typeof post?.publishToken === "string" ? post.publishToken.trim() : "";

    if (!publishToken) {
      throw new Error("INVALID_ARGUMENT: publishToken is required.");
    }

    const mappedAttachments = Array.isArray(post?.attachments)
      ? post.attachments.map((attachment: any) =>
          this.normalizeCreatePostAttachment(attachment)
        )
      : [];

    const result = await callEndpoint<
      {
        content: {
          text?: string;
          attachments?: Array<
            { attachmentId: string; type: string } |
            { type: "book" | "author" | "quote" | "shelf" | "venue"; entityId: string; entityOwnerId?: string }
          >;
        };
        attachments: Array<
          { attachmentId: string; type: string } |
          { type: "book" | "author" | "quote" | "shelf" | "venue"; entityId: string; entityOwnerId?: string }
        >;
        visibility: string;
        publishToken: string;
      },
      { success: boolean; postId: string; isDuplicate: boolean }
    >("createSocialPost", {
      content: {
        ...(text ? { text } : {}),
        ...(mappedAttachments.length > 0 ? { attachments: mappedAttachments } : {}),
      },
      attachments: mappedAttachments,
      visibility,
      publishToken,
    });

    if (!result?.success || typeof result.postId !== "string" || !result.postId.trim()) {
      throw new Error("[createSocialPost] Invalid response payload.");
    }

    const createdPost = await this.getPost(result.postId.trim());
    if (createdPost.authorId !== normalizedUid) {
      throw new Error("FAILED_PRECONDITION: Created post author mismatch.");
    }
    return createdPost;
  }

  async likePost(uid: string, postId: string): Promise<void> {
    ensureNonEmptyString(uid, "uid", 128);
    const normalizedPostId = ensureNonEmptyString(postId, "postId", 128);
    await callEndpoint<{ postId: string }, { success: boolean; liked?: boolean }>(
      "likeSocialPost",
      { postId: normalizedPostId }
    );
  }

  async unlikePost(uid: string, postId: string): Promise<void> {
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedPostId = ensureNonEmptyString(postId, "postId", 128);
    const isLiked = await this.hasUserLikedPost(normalizedUid, normalizedPostId);
    if (isLiked) {
      await this.likePost(normalizedUid, normalizedPostId);
    }
  }

  async repostPost(uid: string, postId: string): Promise<void> {
    ensureNonEmptyString(uid, "uid", 128);
    const normalizedPostId = ensureNonEmptyString(postId, "postId", 128);
    await callEndpoint<{ postId: string }, { success: boolean; reposted?: boolean }>(
      "repostSocialPost",
      { postId: normalizedPostId }
    );
  }

  async unrepostPost(uid: string, postId: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedPostId = ensureNonEmptyString(postId, "postId", 128);
    const repostSnap = await getDoc(
      doc(db, "users", normalizedUid, "reposts", normalizedPostId)
    );
    if (repostSnap.exists()) {
      await this.repostPost(normalizedUid, normalizedPostId);
    }
  }

  async hasUserLikedPost(uid: string, postId: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedPostId = ensureNonEmptyString(postId, "postId", 128);
    const snap = await getDoc(
      doc(db, "users", normalizedUid, "likes", normalizedPostId)
    );
    return snap.exists();
  }

  async getDrafts(uid: string): Promise<PostDraft[]> {
    const db = getDb();
    if (!db) return [];
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);

    const draftSnap = await getDocs(
      query(
        collection(db, "users", normalizedUid, "drafts"),
        orderBy("updatedAt", "desc"),
        limit(100)
      )
    );

    return draftSnap.docs.map((draftDoc) => {
      const data = draftDoc.data() as Record<string, unknown>;
      return {
        id: draftDoc.id,
        userId: normalizedUid,
        content: normalizeString(data.content, 5000),
        attachment: (data.attachment as any) || undefined,
        updatedAt: toIsoString(data.updatedAt),
      };
    });
  }

  async getDraft(uid: string, draftId: string): Promise<PostDraft> {
    const db = getDb();
    if (!db) throw new Error("Firebase not initialized");
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedDraftId = ensureNonEmptyString(draftId, "draftId", 128);
    const snap = await getDoc(
      doc(db, "users", normalizedUid, "drafts", normalizedDraftId)
    );
    if (!snap.exists()) {
      throw new Error("NOT_FOUND: Draft not found.");
    }
    const data = snap.data() as Record<string, unknown>;
    return {
      id: snap.id,
      userId: normalizedUid,
      content: normalizeString(data.content, 5000),
      attachment: (data.attachment as any) || undefined,
      updatedAt: toIsoString(data.updatedAt),
    };
  }

  async saveDraft(uid: string, draft: Omit<PostDraft, "updatedAt">): Promise<PostDraft> {
    const db = getDb();
    if (!db) throw new Error("Firebase not initialized");
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const nowIso = new Date().toISOString();
    const draftId =
      typeof draft?.id === "string" && draft.id.trim()
        ? draft.id.trim()
        : doc(collection(db, "users", normalizedUid, "drafts")).id;
    const content = normalizeString(draft?.content, 5000);

    await setDoc(
      doc(db, "users", normalizedUid, "drafts", draftId),
      {
        userId: normalizedUid,
        content,
        attachment: draft?.attachment || null,
        updatedAt: nowIso,
        createdAt: nowIso,
      },
      { merge: true }
    );

    return {
      id: draftId,
      userId: normalizedUid,
      content,
      attachment: draft?.attachment,
      updatedAt: nowIso,
    };
  }

  async deleteDraft(uid: string, draftId: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedDraftId = ensureNonEmptyString(draftId, "draftId", 128);
    await deleteDoc(doc(db, "users", normalizedUid, "drafts", normalizedDraftId));
  }

  async search(
    queryText: string,
    cursor?: string,
    limitSize = 20
  ): Promise<{
    posts: Post[];
    users: User[];
    topics: Array<{ topic: string; postCount: number; score: number }>;
    hasMore: boolean;
    nextCursor?: string;
    rankingVersion: string;
    queryHash: string;
  }> {
    const normalizedQuery = normalizeString(queryText, 64).toLowerCase();
    if (normalizedQuery.length < 2) {
      return {
        posts: [],
        users: [],
        topics: [],
        hasMore: false,
        rankingVersion: "social_v1",
        queryHash: "",
      };
    }

    const payload = await callEndpoint<
      {
        query: string;
        cursor?: string;
        limit?: number;
        types?: Array<"users" | "posts" | "topics">;
      },
      {
        rankingVersion: string;
        queryHash: string;
        users: Record<string, unknown>[];
        posts: Record<string, unknown>[];
        topics: Array<{ topic: string; postCount: number; score: number }>;
        hasMore: boolean;
        nextCursor?: string;
      }
    >("searchSocial", {
      query: normalizedQuery,
      ...(cursor ? { cursor } : {}),
      limit: Math.max(1, Math.min(20, Math.trunc(limitSize || 20))),
      types: ["users", "posts", "topics"],
    });

    const posts = payload.posts.map((post) =>
      normalizePost({ ...(post as Record<string, unknown>), id: post.id })
    );
    const users = payload.users.map((profile) =>
      toProfileUser(
        normalizeString(profile.uid, 128),
        profile as Record<string, unknown>
      )
    );
    const topics = Array.isArray(payload.topics)
      ? payload.topics
          .filter(
            (entry) =>
              entry &&
              typeof entry.topic === "string" &&
              entry.topic.trim().length > 0
          )
          .map((entry) => ({
            topic: normalizeString(entry.topic, 80),
            postCount: toNonNegativeInt(entry.postCount),
            score:
              typeof entry.score === "number" && Number.isFinite(entry.score)
                ? entry.score
                : 0,
          }))
      : [];

    return {
      posts,
      users,
      topics,
      hasMore: payload.hasMore === true,
      ...(payload.nextCursor ? { nextCursor: payload.nextCursor } : {}),
      rankingVersion: payload.rankingVersion || "social_v1",
      queryHash: payload.queryHash || "",
    };
  }

  async addReaction(uid: string, entityId: string, reaction: string): Promise<void> {
    const normalizedReaction = normalizeString(reaction, 32).toLowerCase();
    if (normalizedReaction !== "like") {
      throw new Error("INVALID_ARGUMENT: Unsupported reaction type.");
    }
    await this.likePost(uid, entityId);
  }
}

class FirebaseNotificationService {
  async getNotifications(uid: string): Promise<Notification[]> {
    const db = getDb();
    if (!db) return [];

    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const snap = await getDocs(
      query(
        collection(db, "notifications"),
        where("uid", "==", normalizedUid),
        orderBy("createdAt", "desc"),
        limit(100)
      )
    );

    return snap.docs.map((notificationDoc) =>
      normalizeNotification({ id: notificationDoc.id, ...notificationDoc.data() })
    );
  }

  async markAllAsRead(uid: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const unreadSnap = await getDocs(
      query(
        collection(db, "notifications"),
        where("uid", "==", normalizedUid),
        where("read", "==", false),
        limit(100)
      )
    );

    await Promise.all(
      unreadSnap.docs.map((notificationDoc) =>
        updateDoc(notificationDoc.ref, {
          read: true,
          readAt: serverTimestamp(),
        })
      )
    );
  }
}

/* =========================
   FIREBASE DB SERVICE
========================= */
export const firebaseDbService: any = {
  users: new FirebaseUserService(),
  projects: firebaseProjectService,
  social: new FirebaseSocialService(),
  shelves: new FirebaseShelfService(),
  venues: new FirebaseVenueService(),
  messaging: new FirebaseMessagingService(),
  notifications: new FirebaseNotificationService(),
  upload: new FirebaseUploadService(),

  /**
   * 🔒 Catalog is now FIRST-CLASS
   * No fallback. No proxy masking.
   */
  catalog: firebaseCatalogService,
};
