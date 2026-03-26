import { devInfo } from '../lib/logging/devLog';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  collectionGroup,
  getDocs,
  query,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  where,
  startAfter,
  documentId,
  QueryDocumentSnapshot,
  DocumentData,
  serverTimestamp,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { httpsCallable } from "firebase/functions";

import {
  getFirebaseDb,
  getFirebaseFunctions,
  getFirebaseStorage,
} from "../lib/firebase.ts";

import {
  PostStats,
  UserStats,
  BookStats,
  ShelfStats,
  AgentTurnPersistenceInput,
  ProfilePublicationRecord,
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
import type { LibrarianRecommendationContext } from "../types/librarian.ts";

import { normalizeNotification, normalizePost } from "../lib/data-validation.ts";
import { FirebaseUploadService } from "./firebaseUploadService.ts";
import { firebaseProjectService } from "./firebaseProjectService.ts";
import { buildLegacyBookView } from "../lib/books/buildLegacyBookView.ts";

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
const FOLLOWING_FEED_PAGE_SIZE = 20;
const FOLLOWING_FEED_IN_BATCH_SIZE = 10;
const FEED_HYDRATION_MAX_POSTS = 20;
const INTERNAL_BOOK_COVER_PATH_RE = /^books\/[^/]+\/covers\/[^?#]+$/i;
const missingInternalBookCoverPathCache = new Set<string>();
const loggedMissingInternalBookCoverPathCache = new Set<string>();

function normalizeRecommendationContext(
  context?: LibrarianRecommendationContext
): LibrarianRecommendationContext | null {
  if (!context || context.source !== "librarian") return null;
  const suggestionSessionId =
    typeof context.suggestionSessionId === "string"
      ? context.suggestionSessionId.trim().slice(0, 96)
      : "";
  const suggestionId =
    typeof context.suggestionId === "string"
      ? context.suggestionId.trim().slice(0, 96)
      : "";
  const rankPositionRaw = Number(context.rankPosition);
  const rankPosition =
    Number.isFinite(rankPositionRaw) && rankPositionRaw > 0
      ? Math.trunc(rankPositionRaw)
      : 0;
  const mode =
    typeof context.mode === "string" ? context.mode.trim().slice(0, 40) : "";

  if (!suggestionSessionId || !suggestionId || !rankPosition || !mode) {
    return null;
  }

  return {
    source: "librarian",
    suggestionSessionId,
    suggestionId,
    rankPosition,
    mode: mode as LibrarianRecommendationContext["mode"],
  };
}

type FollowingFeedCursor = {
  v: 1;
  scope: "following";
  createdAtMs: number;
  postId: string;
};

type PrimaryStructuredEntityType =
  | "book"
  | "author"
  | "quote"
  | "shelf"
  | "venue"
  | "publication";

type FeedPostContext = {
  post: Post;
  raw: Record<string, unknown>;
};

type HydratedFeedEntity = {
  type: PrimaryStructuredEntityType;
  id: string;
  data: Record<string, unknown>;
  ownerId?: string;
};

const base64UrlEncode = (raw: string): string => {
  const encoded = btoa(raw);
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlDecode = (raw: string): string => {
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const paddingNeeded = normalized.length % 4;
  const padded =
    paddingNeeded === 0
      ? normalized
      : `${normalized}${"=".repeat(4 - paddingNeeded)}`;
  return atob(padded);
};

const encodeFollowingFeedCursor = (cursor: FollowingFeedCursor): string =>
  base64UrlEncode(JSON.stringify(cursor));

const decodeFollowingFeedCursor = (
  raw: string | undefined
): FollowingFeedCursor | null => {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(raw.trim())) as Partial<FollowingFeedCursor>;
    if (
      parsed.v !== 1 ||
      parsed.scope !== "following" ||
      typeof parsed.createdAtMs !== "number" ||
      !Number.isFinite(parsed.createdAtMs) ||
      parsed.createdAtMs <= 0 ||
      typeof parsed.postId !== "string" ||
      parsed.postId.trim().length === 0
    ) {
      return null;
    }

    return {
      v: 1,
      scope: "following",
      createdAtMs: Math.trunc(parsed.createdAtMs),
      postId: parsed.postId.trim(),
    };
  } catch {
    return null;
  }
};

const extractInternalBookCoverPath = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  const candidate = value.trim();
  if (!candidate) {
    return "";
  }

  if (INTERNAL_BOOK_COVER_PATH_RE.test(candidate)) {
    return candidate;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:") {
      return "";
    }

    if (parsed.hostname === "storage.googleapis.com") {
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (segments.length >= 4 && segments[1] === "books") {
        const path = segments.slice(1).join("/");
        return INTERNAL_BOOK_COVER_PATH_RE.test(path) ? path : "";
      }
      if (segments.length >= 3 && segments[0] === "books") {
        const path = segments.join("/");
        return INTERNAL_BOOK_COVER_PATH_RE.test(path) ? path : "";
      }
      return "";
    }

    if (parsed.hostname === "firebasestorage.googleapis.com") {
      const marker = "/o/";
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex === -1) {
        return "";
      }
      const encodedObjectPath = parsed.pathname.slice(markerIndex + marker.length);
      const objectPath = decodeURIComponent(encodedObjectPath);
      return INTERNAL_BOOK_COVER_PATH_RE.test(objectPath) ? objectPath : "";
    }
  } catch {
    return "";
  }

  return "";
};

const normalizeExternalCoverUrl = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  const candidate = value.trim();
  if (!candidate) {
    return "";
  }

  if (extractInternalBookCoverPath(candidate)) {
    return "";
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
};

const resolveInternalBookCoverUrl = async (
  value: unknown,
  fallbackExternalUrl?: string
): Promise<string> => {
  const internalPath = extractInternalBookCoverPath(value);
  const normalizedFallbackExternalUrl = normalizeExternalCoverUrl(
    fallbackExternalUrl
  );

  if (!internalPath) {
    return normalizeExternalCoverUrl(value) || normalizedFallbackExternalUrl;
  }

  if (missingInternalBookCoverPathCache.has(internalPath)) {
    return normalizedFallbackExternalUrl;
  }

  try {
    const storage = getFirebaseStorage();
    return await getDownloadURL(storageRef(storage, internalPath));
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "")
        : "";

    if (errorCode === "storage/object-not-found") {
      missingInternalBookCoverPathCache.add(internalPath);
      if (!loggedMissingInternalBookCoverPathCache.has(internalPath)) {
        loggedMissingInternalBookCoverPathCache.add(internalPath);
        console.warn("[SOCIAL][COVER_MISSING_FALLBACK]", {
          internalPath,
          fallback: normalizedFallbackExternalUrl || "placeholder",
        });
      }
      return normalizedFallbackExternalUrl;
    }

    console.error("[SOCIAL][COVER_RESOLVE_FAILED]", {
      internalPath,
      errorCode,
      error: String(error),
    });
    return normalizedFallbackExternalUrl;
  }
};

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

const normalizeFallbackCover = (
  value: unknown
): Book["fallbackCover"] | ProfilePublicationRecord["fallbackCover"] | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const title = normalizeOptionalString(raw.title, 180);
  const theme =
    raw.theme === "ink" ||
    raw.theme === "emerald" ||
    raw.theme === "gold" ||
    raw.theme === "plum"
      ? raw.theme
      : undefined;

  if (!title || !theme) {
    return undefined;
  }

  const author = normalizeOptionalString(raw.author, 180);
  return {
    title,
    ...(author ? { author } : {}),
    theme,
  };
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
  return buildLegacyBookView({
    id,
    authorId: normalizeString(source.authorId, 128) || "author_unknown",
    titleEn: normalizeString(source.titleEn, 300),
    titleAr: normalizeString(source.titleAr, 300),
    authorEn: normalizeString(source.authorEn, 300),
    authorAr: normalizeString(source.authorAr, 300),
    descriptionEn: normalizeString(source.descriptionEn, 5000),
    descriptionAr: normalizeString(source.descriptionAr, 5000),
    coverUrl: normalizeString(source.coverUrl, 2048),
    ...(source.coverMode === "uploaded" || source.coverMode === "fallback_metadata"
      ? { coverMode: source.coverMode }
      : {}),
    ...(normalizeFallbackCover(source.fallbackCover)
      ? { fallbackCover: normalizeFallbackCover(source.fallbackCover) }
      : {}),
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
  });
};

const toProfilePublication = (
  source: Record<string, unknown>
): ProfilePublicationRecord | null => {
  const entityType =
    typeof source.entityType === "string" && source.entityType.trim() === "ebook"
      ? "ebook"
      : typeof source.entityType === "string" && source.entityType.trim() === "blog"
        ? "blog"
        : null;
  const id = normalizeString(source.id, 128);
  const title = normalizeString(source.title, 300);
  const publicationType = normalizeString(source.publicationType, 64);
  const publishedAt = toIsoString(source.publishedAt);

  if (!entityType || !id || !title || !publicationType || !publishedAt) {
    return null;
  }

  return {
    id,
    entityType,
    title,
    publicationType,
    publishedAt,
    ...(normalizeString(source.coverUrl, 2048)
      ? { coverUrl: normalizeString(source.coverUrl, 2048) }
      : {}),
    ...(source.coverMode === "uploaded" || source.coverMode === "fallback_metadata"
      ? { coverMode: source.coverMode }
      : {}),
    ...(normalizeFallbackCover(source.fallbackCover)
      ? { fallbackCover: normalizeFallbackCover(source.fallbackCover) }
      : {}),
    ...(normalizeString(source.canonicalSlug, 160)
      ? { canonicalSlug: normalizeString(source.canonicalSlug, 160) }
      : {}),
    ...(normalizeString(source.publicationId, 128)
      ? { publicationId: normalizeString(source.publicationId, 128) }
      : {}),
    ...(normalizeString(source.bookId, 128)
      ? { bookId: normalizeString(source.bookId, 128) }
      : {}),
  };
};

const toShelf = (source: Record<string, unknown>): Shelf => {
  const entriesSource =
    source.entries && typeof source.entries === "object" && !Array.isArray(source.entries)
      ? (source.entries as Record<string, unknown>)
      : {};
  const entries: Shelf["entries"] = Object.fromEntries(
    Object.entries(entriesSource)
      .filter(([bookId, entry]) => {
        return (
          normalizeString(bookId, 128).length > 0 &&
          !!entry &&
          typeof entry === "object" &&
          !Array.isArray(entry)
        );
      })
      .map(([bookId, entry]) => [bookId, entry as ShelfEntry])
  );
  const orderedBookIds = Array.isArray(source.orderedBookIds)
    ? source.orderedBookIds
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim().slice(0, 128))
    : undefined;
  const visibilityRaw = normalizeString(source.visibility, 32).toLowerCase();
  const visibility =
    visibilityRaw === "public" || visibilityRaw === "unlisted" || visibilityRaw === "private"
      ? (visibilityRaw as Shelf["visibility"])
      : "public";
  const copiedFromSource =
    source.copiedFrom && typeof source.copiedFrom === "object" && !Array.isArray(source.copiedFrom)
      ? (source.copiedFrom as Record<string, unknown>)
      : null;

  return {
    id: ensureNonEmptyString(normalizeString(source.id, 190), "id", 190),
    ownerId: ensureNonEmptyString(normalizeString(source.ownerId, 128), "ownerId", 128),
    titleEn: normalizeString(source.titleEn, 120) || "Shelf",
    titleAr: normalizeString(source.titleAr, 120) || normalizeString(source.titleEn, 120) || "Shelf",
    descriptionEn: normalizeString(source.descriptionEn, 280),
    descriptionAr: normalizeString(source.descriptionAr, 280),
    entries,
    ...(orderedBookIds && orderedBookIds.length > 0 ? { orderedBookIds } : {}),
    ...(normalizeString(source.userCoverUrl, 2048)
      ? { userCoverUrl: normalizeString(source.userCoverUrl, 2048) }
      : {}),
    visibility,
    bookCount: toNonNegativeInt(source.bookCount ?? Object.keys(entries).length),
    createdAt: toIsoString(source.createdAt),
    updatedAt: toIsoString(source.updatedAt),
    isSystem: source.isSystem === true,
    ...(copiedFromSource
      ? {
          copiedFrom: {
            shelfId: normalizeString(copiedFromSource.shelfId, 190),
            ownerId: normalizeString(copiedFromSource.ownerId, 128),
            ...(copiedFromSource.createdAt
              ? { createdAt: toIsoString(copiedFromSource.createdAt) }
              : {}),
            ...(copiedFromSource.copiedAt
              ? { copiedAt: toIsoString(copiedFromSource.copiedAt) }
              : {}),
          },
        }
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

  async getProfilePublications(
    uid: string,
    limitSize = 20
  ): Promise<ProfilePublicationRecord[]> {
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const boundedLimit = Math.min(30, Math.max(1, toNonNegativeInt(limitSize) || 20));
    const response = await callEndpoint<
      { uid: string; limit: number },
      { items: Record<string, unknown>[]; hasMore: boolean }
    >("listProfilePublications", { uid: normalizedUid, limit: boundedLimit });

    return response.items
      .map((item) => {
        try {
          return toProfilePublication(item);
        } catch {
          return null;
        }
      })
      .filter((publication): publication is ProfilePublicationRecord => publication !== null);
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
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const data = await callEndpoint<{ uid: string }, Record<string, unknown>>(
      "getProfileStats",
      { uid: normalizedUid }
    );
    return {
      followers: toNonNegativeInt(data.followers),
      following: toNonNegativeInt(data.following),
      posts: toNonNegativeInt(data.posts),
      reviews: toNonNegativeInt(data.reviews),
      booksRead: toNonNegativeInt(data.booksRead),
      booksPublished: toNonNegativeInt(data.booksPublished),
      wordsWritten: toNonNegativeInt(data.wordsWritten),
      postsPublished: toNonNegativeInt(data.postsPublished),
      shelvesCreated: toNonNegativeInt(data.shelvesCreated),
      quotesAuthored: toNonNegativeInt(data.quotesAuthored),
      ...(typeof data.profileCompletionScore === "number" &&
      Number.isFinite(data.profileCompletionScore)
        ? { profileCompletionScore: Math.max(0, Math.trunc(data.profileCompletionScore)) }
        : {}),
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

  async appendAgentTurn(
    uid: string,
    sessionId: string,
    turn: AgentTurnPersistenceInput
  ): Promise<void> {
    const normalizedSessionId = ensureNonEmptyString(sessionId, "sessionId", 128);
    const agentId = ensureNonEmptyString(turn.agentId, "turn.agentId", 64);
    const title = normalizeOptionalString(turn.title, 180);
    const lastMessage = normalizeOptionalString(turn.lastMessage, 500);
    const timestamp = normalizeOptionalString(turn.timestamp, 64) ?? new Date().toISOString();
    const userTimestamp =
      normalizeOptionalString(turn.userMessage?.timestamp, 64) ?? new Date().toISOString();
    const modelTimestamp =
      normalizeOptionalString(turn.modelMessage?.timestamp, 64) ?? new Date().toISOString();
    const contextWindowSize =
      typeof turn.contextWindowSize === "number" &&
      Number.isInteger(turn.contextWindowSize) &&
      turn.contextWindowSize >= 0
        ? turn.contextWindowSize
        : undefined;

    const mutateAgentSession = httpsCallable<
      {
        sessionId: string;
        mutation: {
          type: "append_turn";
          session: {
            agentId: string;
            title?: string;
            lastMessage?: string;
            timestamp?: string;
            isPinned?: boolean;
          };
          turn: {
            userMessage: {
              text: string;
              timestamp: string;
            };
            modelMessage: {
              text: string;
              timestamp: string;
            };
            contextWindowSize?: number;
          };
        };
      },
      { ok: boolean }
    >(getFirebaseFunctions(), "mutateAgentSession");

    await mutateAgentSession({
      sessionId: normalizedSessionId,
      mutation: {
        type: "append_turn",
        session: stripUndefined({
          agentId,
          title: title || "Conversation",
          lastMessage,
          timestamp,
          isPinned: turn.isPinned === true,
        }),
        turn: stripUndefined({
          userMessage: {
            text: ensureNonEmptyString(turn.userMessage.text, "turn.userMessage.text", 10_000),
            timestamp: userTimestamp,
          },
          modelMessage: {
            text: ensureNonEmptyString(turn.modelMessage.text, "turn.modelMessage.text", 10_000),
            timestamp: modelTimestamp,
          },
          contextWindowSize,
        }),
      },
    });
  }

  async saveAgentMessage(
    uid: string,
    sessionId: string,
    message: Omit<ChatMessage, "id">
  ): Promise<void> {
    const normalizedSessionId = ensureNonEmptyString(sessionId, "sessionId", 128);
    const mutateAgentSession = httpsCallable<
      {
        sessionId: string;
        mutation: {
          type: "append_message";
          message: {
            role: "user" | "model";
            text: string;
            timestamp: string;
          };
        };
      },
      { ok: boolean }
    >(getFirebaseFunctions(), "mutateAgentSession");

    await mutateAgentSession({
      sessionId: normalizedSessionId,
      mutation: {
        type: "append_message",
        message: {
          role: message.role === "model" ? "model" : "user",
          text: ensureNonEmptyString(message.text, "text", 10_000),
          timestamp:
            typeof message.timestamp === "string" && message.timestamp.trim()
              ? message.timestamp
              : new Date().toISOString(),
        },
      },
    });
  }

  async updateAgentSession(
    uid: string,
    sessionId: string,
    data: Partial<AgentSession>
  ): Promise<void> {
    const normalizedSessionId = ensureNonEmptyString(sessionId, "sessionId", 128);
    const agentId = normalizeOptionalString(data.agentId, 64);
    const title = normalizeOptionalString(data.title, 180);
    const lastMessage = normalizeOptionalString(data.lastMessage, 500);
    const timestamp = normalizeOptionalString(data.timestamp, 64) ?? new Date().toISOString();

    const mutateAgentSession = httpsCallable<
      {
        sessionId: string;
        mutation: {
          type: "upsert_session";
          session: {
            agentId?: string;
            title?: string;
            lastMessage?: string;
            timestamp?: string;
            isPinned?: boolean;
          };
        };
      },
      { ok: boolean }
    >(getFirebaseFunctions(), "mutateAgentSession");

    await mutateAgentSession({
      sessionId: normalizedSessionId,
      mutation: {
        type: "upsert_session",
        session: stripUndefined({
          agentId,
          title: title || "Conversation",
          lastMessage,
          timestamp,
          isPinned: data.isPinned === true,
        }),
      },
    });
  }

  async createAgentSession(uid: string, session: AgentSession): Promise<void> {
    const normalizedSessionId = ensureNonEmptyString(session.id, "session.id", 128);
    const agentId = ensureNonEmptyString(session.agentId, "session.agentId", 64);
    const title = normalizeOptionalString(session.title, 180) || "Conversation";
    const lastMessage = normalizeOptionalString(session.lastMessage, 500) || "";
    const timestamp = normalizeOptionalString(session.timestamp, 64) || new Date().toISOString();

    const mutateAgentSession = httpsCallable<
      {
        sessionId: string;
        mutation: {
          type: "upsert_session";
          session: {
            agentId: string;
            title: string;
            lastMessage: string;
            timestamp: string;
            isPinned: boolean;
          };
        };
      },
      { ok: boolean }
    >(getFirebaseFunctions(), "mutateAgentSession");

    await mutateAgentSession({
      sessionId: normalizedSessionId,
      mutation: {
        type: "upsert_session",
        session: {
          agentId,
          title,
          lastMessage,
          timestamp,
          isPinned: session.isPinned === true,
        },
      },
    });
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
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const response = await callEndpoint<
      { uid: string; limit: number },
      { items: Record<string, unknown>[]; hasMore: boolean }
    >("listUserShelves", { uid: normalizedUid, limit: 100 });
    return response.items
      .map((item) => {
        try {
          return toShelf(item);
        } catch {
          return null;
        }
      })
      .filter((shelf): shelf is Shelf => shelf !== null);
  }

  async getShelf(ownerId: string, shelfId: string): Promise<Shelf> {
    ensureNonEmptyString(ownerId, "ownerId", 128);
    const normalizedShelfId = ensureNonEmptyString(shelfId, "shelfId", 190);
    const result = await callEndpoint<{ shelfId: string }, Record<string, unknown>>(
      "getShelf",
      { shelfId: normalizedShelfId }
    );
    return toShelf(result);
  }

  async createShelf(
    uid: string,
    data: {
      titleEn: string;
      titleAr: string;
      entries?: Record<string, any>;
      visibility?: Shelf["visibility"];
    }
  ): Promise<Shelf> {
    ensureNonEmptyString(uid, "uid", 128);
    const result = await callEndpoint<
      { titleEn: string; titleAr: string; visibility?: Shelf["visibility"] },
      Record<string, unknown>
    >("createShelf", {
      titleEn: ensureNonEmptyString(data.titleEn, "titleEn", 120),
      titleAr: ensureNonEmptyString(data.titleAr, "titleAr", 120),
      visibility: data.visibility ?? "public",
    });
    return toShelf(result);
  }

  async duplicateShelf(
    uid: string,
    sourceShelfId: string,
    options?: { titleEn?: string; titleAr?: string }
  ): Promise<Shelf> {
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedSourceShelfId = ensureNonEmptyString(
      sourceShelfId,
      "sourceShelfId",
      190
    );
    const titleEn =
      typeof options?.titleEn === "string" && options.titleEn.trim().length > 0
        ? options.titleEn.trim().slice(0, 120)
        : undefined;
    const titleAr =
      typeof options?.titleAr === "string" && options.titleAr.trim().length > 0
        ? options.titleAr.trim().slice(0, 120)
        : undefined;

    const duplicated = await callEndpoint<
      { sourceShelfId: string; titleEn?: string; titleAr?: string },
      Record<string, unknown>
    >("duplicateShelf", {
      sourceShelfId: normalizedSourceShelfId,
      ...(titleEn ? { titleEn } : {}),
      ...(titleAr ? { titleAr } : {}),
    });

    const duplicatedShelfId =
      typeof duplicated.id === "string" ? duplicated.id.trim() : "";
    if (!duplicatedShelfId) {
      throw new Error("[duplicateShelf] Invalid response payload.");
    }

    const duplicatedOwnerId =
      typeof duplicated.ownerId === "string" ? duplicated.ownerId.trim() : "";
    if (duplicatedOwnerId && duplicatedOwnerId !== normalizedUid) {
      throw new Error("FAILED_PRECONDITION: duplicateShelf owner mismatch.");
    }

    return toShelf({
      ...duplicated,
      id: duplicatedShelfId,
      ownerId: duplicatedOwnerId || normalizedUid,
    });
  }

  async updateShelf(uid: string, shelfId: string, updates: Partial<Shelf>): Promise<void> {
    ensureNonEmptyString(uid, "uid", 128);
    const normalizedShelfId = ensureNonEmptyString(shelfId, "shelfId", 190);
    const safeUpdates = stripUndefined({
      ...(typeof updates.titleEn === "string"
        ? { titleEn: updates.titleEn.trim().slice(0, 120) }
        : {}),
      ...(typeof updates.titleAr === "string"
        ? { titleAr: updates.titleAr.trim().slice(0, 120) }
        : {}),
      ...(typeof updates.descriptionEn === "string"
        ? { descriptionEn: updates.descriptionEn.trim().slice(0, 280) }
        : {}),
      ...(typeof updates.descriptionAr === "string"
        ? { descriptionAr: updates.descriptionAr.trim().slice(0, 280) }
        : {}),
      ...(typeof updates.userCoverUrl === "string" || updates.userCoverUrl === null
        ? { userCoverUrl: updates.userCoverUrl ?? null }
        : {}),
      ...(updates.visibility ? { visibility: updates.visibility } : {}),
    });

    await callEndpoint<
      { shelfId: string; updates: Record<string, unknown> },
      { shelfId: string; updated: boolean }
    >("updateShelf", {
      shelfId: normalizedShelfId,
      updates: safeUpdates,
    });
  }

  async deleteShelf(uid: string, shelfId: string): Promise<void> {
    ensureNonEmptyString(uid, "uid", 128);
    const normalizedShelfId = ensureNonEmptyString(shelfId, "shelfId", 190);
    await callEndpoint<{ shelfId: string }, { shelfId: string; deleted: boolean }>(
      "deleteShelf",
      { shelfId: normalizedShelfId }
    );
  }

  async getShelfEntries(
    uid: string,
    shelfId: string,
    options?: { resolveBooks?: boolean; limit?: number }
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
    const boundedLimit =
      typeof options?.limit === "number" && Number.isFinite(options.limit)
        ? Math.max(1, Math.min(200, Math.trunc(options.limit)))
        : rawEntries.length;
    const boundedEntries = rawEntries.slice(0, boundedLimit);

    if (options?.resolveBooks === false) {
      return boundedEntries;
    }

    const resolvedBooks = await firebaseCatalogService.getBooksByIds(
      boundedEntries.map((entry) => entry.bookId)
    );

    const buildFallbackShelfBook = (entry: any): Book | null => {
      if (!entry || typeof entry !== "object") return null;

      const snapshot =
        entry.snapshot && typeof entry.snapshot === "object" && !Array.isArray(entry.snapshot)
          ? entry.snapshot
          : null;

      const titleEn =
        normalizeString(snapshot?.titleEn, 300)
        || normalizeString(entry.titleEn, 300)
        || normalizeString(entry.title, 300);
      const titleAr =
        normalizeString(snapshot?.titleAr, 300)
        || normalizeString(entry.titleAr, 300)
        || titleEn;
      const authorEn =
        normalizeString(snapshot?.authorEn, 300)
        || normalizeString(snapshot?.bookAuthorEn, 300)
        || normalizeString(entry.authorEn, 300)
        || normalizeString(entry.bookAuthorEn, 300)
        || normalizeString(entry.authorName, 300)
        || normalizeString(entry.author, 300);
      const authorAr =
        normalizeString(snapshot?.authorAr, 300)
        || normalizeString(snapshot?.bookAuthorAr, 300)
        || normalizeString(entry.authorAr, 300)
        || normalizeString(entry.bookAuthorAr, 300)
        || authorEn;
      const coverUrl =
        normalizeString(snapshot?.coverUrl, 2048)
        || normalizeString(entry.coverUrl, 2048);
      const hasRenderableFallback =
        titleEn.length > 0 || titleAr.length > 0 || authorEn.length > 0 || coverUrl.length > 0;

      if (!hasRenderableFallback) {
        return null;
      }

      return buildLegacyBookView({
        id: entry.bookId,
        titleEn,
        titleAr,
        title: normalizeString(entry.title, 300) || undefined,
        authorId: normalizeString(entry.authorId, 128),
        authorEn,
        authorAr,
        author: normalizeString(entry.author, 300) || normalizeString(entry.authorName, 300) || undefined,
        coverUrl,
        descriptionEn: normalizeString(entry.descriptionEn, 5000) || normalizeString(entry.description, 5000),
        descriptionAr: normalizeString(entry.descriptionAr, 5000),
        genresEn: Array.isArray(entry.genresEn)
          ? entry.genresEn.filter((item: unknown): item is string => typeof item === "string")
          : [],
        genresAr: Array.isArray(entry.genresAr)
          ? entry.genresAr.filter((item: unknown): item is string => typeof item === "string")
          : [],
        categories: Array.isArray(entry.categories)
          ? entry.categories.filter((item: unknown): item is string => typeof item === "string")
          : undefined,
        rating:
          typeof entry.rating === "number" && Number.isFinite(entry.rating)
            ? Math.max(0, entry.rating)
            : 0,
        ratingsCount:
          typeof entry.ratingsCount === "number" && Number.isFinite(entry.ratingsCount)
            ? Math.max(0, Math.trunc(entry.ratingsCount))
            : 0,
        isEbookAvailable: entry.isEbookAvailable === true || entry.hasEbook === true,
      });
    };

    const hydrated = boundedEntries.map((entry) => {
      const resolvedBook = resolvedBooks.get(entry.bookId);
      if (resolvedBook) {
        return { ...entry, book: resolvedBook };
      }

      const fallbackBook = buildFallbackShelfBook(entry);
      if (fallbackBook) {
        return {
          ...entry,
          book: fallbackBook
        };
      }

      console.warn("[SHELF][HYDRATION_FAILED]", entry.bookId, "BOOK_NOT_READY");
      return { ...entry, book: null };
    });

    return hydrated;
  }

  async addBookToShelf(
    uid: string,
    shelfId: string,
    bookId: string,
    book?: Book,
    recommendationContext?: LibrarianRecommendationContext
  ): Promise<void> {
    const snapshot = book ? {
      titleEn: book.titleEn || null,
      titleAr: book.titleAr || null,
      coverUrl: book.coverUrl || null,
    } : null;

    const recommendationOrigin = normalizeRecommendationContext(recommendationContext);
    await callEndpoint<
      {
        shelfId: string;
        bookId: string;
        snapshot: {
          titleEn: string | null;
          titleAr: string | null;
          coverUrl: string | null;
        } | null;
        recommendationContext?: LibrarianRecommendationContext;
      },
      { ok: boolean }
    >("addBookToShelf", {
      shelfId,
      bookId,
      snapshot,
      ...(recommendationOrigin
        ? { recommendationContext: recommendationOrigin }
        : {}),
    });
  }

  async removeBookFromShelf(uid: string, shelfId: string, bookId: string): Promise<void> {
    await callEndpoint<
      { shelfId: string; bookId: string },
      { ok: boolean }
    >("removeBookFromShelf", {
      shelfId,
      bookId,
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
      text:
        typeof message.text === "string" && message.text.trim().length <= 2000
          ? message.text.trim()
          : "",
      ...(message.attachment &&
      typeof message.attachment === "object" &&
      (message.attachment.type === "book" ||
        message.attachment.type === "publication" ||
        message.attachment.type === "quote") &&
      typeof message.attachment.entityId === "string" &&
      message.attachment.entityId.trim()
        ? {
            attachment: {
              type: message.attachment.type,
              entityId: message.attachment.entityId.trim(),
              ...(typeof message.attachment.title === "string" &&
              message.attachment.title.trim()
                ? { title: message.attachment.title.trim() }
                : {}),
              ...(typeof message.attachment.author === "string" &&
              message.attachment.author.trim()
                ? { author: message.attachment.author.trim() }
                : {}),
              ...(typeof message.attachment.coverUrl === "string" &&
              message.attachment.coverUrl.trim()
                ? { coverUrl: message.attachment.coverUrl.trim() }
                : {}),
              ...(typeof message.attachment.canonicalSlug === "string" &&
              message.attachment.canonicalSlug.trim()
                ? { canonicalSlug: message.attachment.canonicalSlug.trim() }
                : {}),
              ...(typeof message.attachment.quoteOwnerId === "string" &&
              message.attachment.quoteOwnerId.trim()
                ? { quoteOwnerId: message.attachment.quoteOwnerId.trim() }
                : {}),
              ...(typeof message.attachment.quoteText === "string" &&
              message.attachment.quoteText.trim()
                ? { quoteText: message.attachment.quoteText.trim() }
                : {}),
            },
          }
        : {}),
      timestamp: toIsoString(message.timestamp),
      ...(typeof message.readByPeer === "boolean"
        ? { readByPeer: message.readByPeer }
        : {}),
      ...(typeof message.seenAt === "string" && message.seenAt.trim()
        ? { seenAt: toIsoString(message.seenAt) }
        : {}),
    }));
  }

  async sendMessage(
    uid: string,
    conversationId: string,
    text: string,
    idempotencyKey: string,
    attachment?: { type: "book" | "publication" | "quote"; entityId: string }
  ): Promise<{ conversationId: string; messageId: string }> {
    ensureNonEmptyString(uid, "uid", 128);
    const normalizedConversationId = ensureNonEmptyString(
      conversationId,
      "conversationId",
      190
    );
    const normalizedText =
      typeof text === "string" && text.trim().length <= 2000 ? text.trim() : "";
    const normalizedIdempotencyKey = ensureNonEmptyString(
      idempotencyKey,
      "idempotencyKey",
      96
    );
    const normalizedAttachment =
      attachment &&
      (attachment.type === "book" ||
        attachment.type === "publication" ||
        attachment.type === "quote") &&
      typeof attachment.entityId === "string" &&
      attachment.entityId.trim().length > 0
        ? {
            type: attachment.type,
            entityId: attachment.entityId.trim(),
          }
        : undefined;
    if (!normalizedText && !normalizedAttachment) {
      throw new Error("INVALID_ARGUMENT: text or attachment is required.");
    }

    const data = await callEndpoint<
      {
        conversationId: string;
        text?: string;
        attachment?: { type: "book" | "publication" | "quote"; entityId: string };
        idempotencyKey: string;
      },
      { conversationId: string; messageId: string }
    >("sendDirectMessage", {
      conversationId: normalizedConversationId,
      ...(normalizedText ? { text: normalizedText } : {}),
      ...(normalizedAttachment ? { attachment: normalizedAttachment } : {}),
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
    "publication",
  ]);

  private static readonly STRUCTURED_ENTITY_ID_KEYS: Record<string, string[]> = {
    book: ["entityId", "bookId"],
    author: ["entityId", "authorId"],
    quote: ["entityId", "quoteId"],
    shelf: ["entityId", "shelfId"],
    venue: ["entityId", "venueId"],
    publication: ["entityId", "publicationId"],
  };

  private isGuestIdentity(uid: string): boolean {
    const normalized = (uid || "").trim().toLowerCase();
    return normalized.length === 0 || normalized === "guest" || normalized === "anonymous";
  }

  private normalizeCreatePostAttachment(attachment: any):
    | { attachmentId: string; type: string }
    | { type: "book" | "author" | "quote" | "shelf" | "venue" | "publication"; entityId: string; entityOwnerId?: string } {
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
      ];

      const entityId = idKeys
        .map((key) => (typeof attachment[key] === "string" ? attachment[key].trim() : ""))
        .find((value) => value.length > 0);
      const structuredAttachmentId =
        typeof attachment.attachmentId === "string" ? attachment.attachmentId.trim() : "";

      if (!entityId && structuredAttachmentId) {
        throw new Error(
          `INVALID_ARGUMENT: Structured attachment "${normalizedType}" must include entityId (attachmentId is not accepted).`
        );
      }

      if (!entityId) {
        throw new Error(
          `INVALID_ARGUMENT: Structured attachment "${normalizedType}" requires entityId.`
        );
      }

      if (structuredAttachmentId && structuredAttachmentId === entityId) {
        throw new Error(
          `INVALID_ARGUMENT: Structured attachment "${normalizedType}" has invalid id mapping (entityId cannot equal attachmentId).`
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
        type: normalizedType as "book" | "author" | "quote" | "shelf" | "venue" | "publication",
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

  private static chunkAuthorIds(authorIds: readonly string[]): string[][] {
    const chunks: string[][] = [];
    for (let i = 0; i < authorIds.length; i += FOLLOWING_FEED_IN_BATCH_SIZE) {
      chunks.push(authorIds.slice(i, i + FOLLOWING_FEED_IN_BATCH_SIZE));
    }
    return chunks;
  }

  private static readonly ENTITY_BATCH_QUERY_SIZE = 10;

  private normalizePrimaryEntityType(value: unknown): PrimaryStructuredEntityType | null {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (
      FirebaseSocialService.STRUCTURED_ENTITY_TYPES.has(
        normalized as PrimaryStructuredEntityType
      )
    ) {
      return normalized as PrimaryStructuredEntityType;
    }

    return null;
  }

  private extractPrimaryEntityRef(
    raw: Record<string, unknown>,
    post: Post
  ): { type: PrimaryStructuredEntityType; id: string } | null {
    const typeFromFields = this.normalizePrimaryEntityType(raw.primaryEntityType);
    const idFromFields =
      typeof raw.primaryEntityId === "string" ? raw.primaryEntityId.trim() : "";
    const refs = Array.isArray(post.content?.attachments)
      ? post.content.attachments
      : [];

    if (typeFromFields && idFromFields) {
      for (const ref of refs) {
        const refType = this.normalizePrimaryEntityType(
          (ref as { type?: unknown }).type
        );
        if (refType !== typeFromFields) {
          continue;
        }
        const refEntityId =
          typeof (ref as { entityId?: unknown }).entityId === "string"
            ? (ref as { entityId: string }).entityId.trim()
            : "";
        const refAttachmentId =
          typeof (ref as { attachmentId?: unknown }).attachmentId === "string"
            ? (ref as { attachmentId: string }).attachmentId.trim()
            : "";
        const fieldLooksLikeAttachmentId =
          idFromFields.startsWith("att_") ||
          (refAttachmentId.length > 0 && idFromFields === refAttachmentId);

        if (refEntityId && fieldLooksLikeAttachmentId) {
          return {
            type: typeFromFields,
            id: refEntityId,
          };
        }
      }

      return {
        type: typeFromFields,
        id: idFromFields,
      };
    }

    for (const ref of refs) {
      const type = this.normalizePrimaryEntityType(
        (ref as { type?: unknown }).type
      );
      const entityId =
        typeof (ref as { entityId?: unknown }).entityId === "string"
          ? (ref as { entityId: string }).entityId.trim()
          : "";
      const id =
        typeof (ref as { attachmentId?: unknown }).attachmentId === "string"
          ? (ref as { attachmentId: string }).attachmentId.trim()
          : "";
      if (type && entityId) {
        return { type, id: entityId };
      }
      if (type && id) {
        return { type, id };
      }
    }

    return null;
  }

  private static chunkEntityIds(entityIds: readonly string[]): string[][] {
    const chunks: string[][] = [];
    for (
      let i = 0;
      i < entityIds.length;
      i += FirebaseSocialService.ENTITY_BATCH_QUERY_SIZE
    ) {
      chunks.push(
        entityIds.slice(i, i + FirebaseSocialService.ENTITY_BATCH_QUERY_SIZE)
      );
    }
    return chunks;
  }

  private async fetchCollectionDocsByIds(
    db: ReturnType<typeof getDb>,
    collectionName: string,
    ids: string[]
  ): Promise<Map<string, Record<string, unknown>>> {
    const result = new Map<string, Record<string, unknown>>();
    const uniqueIds = Array.from(
      new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))
    );
    if (uniqueIds.length === 0) {
      return result;
    }

    const chunks = FirebaseSocialService.chunkEntityIds(uniqueIds);
    const snapshots = await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, collectionName),
            where(documentId(), "in", chunk)
          )
        )
      )
    );

    for (const snap of snapshots) {
      for (const docSnap of snap.docs) {
        result.set(docSnap.id, docSnap.data() as Record<string, unknown>);
      }
    }

    return result;
  }

  private async fetchQuoteDocsByIds(
    db: ReturnType<typeof getDb>,
    ids: string[]
  ): Promise<Map<string, { data: Record<string, unknown>; ownerId?: string; canonicalQuoteId?: string }>> {
    const result = new Map<string, { data: Record<string, unknown>; ownerId?: string; canonicalQuoteId?: string }>();
    const uniqueIds = Array.from(
      new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))
    );
    if (uniqueIds.length === 0) {
      return result;
    }

    const chunks = FirebaseSocialService.chunkEntityIds(uniqueIds);
    const snapshots = await Promise.all(
      chunks.map((chunk) =>
        getDocs(
          query(
            collection(db, "quotes"),
            where(documentId(), "in", chunk)
          )
        )
      )
    );

    for (const snap of snapshots) {
      for (const docSnap of snap.docs) {
        if (result.has(docSnap.id)) {
          continue;
        }
        result.set(docSnap.id, {
          data: docSnap.data() as Record<string, unknown>,
          ...(typeof docSnap.data().ownerId === "string" && docSnap.data().ownerId.trim()
            ? { ownerId: docSnap.data().ownerId.trim() }
            : {}),
          canonicalQuoteId: docSnap.id,
        });
      }
    }

    const unresolvedLegacyIds = uniqueIds.filter((id) => !result.has(id));
    if (unresolvedLegacyIds.length === 0) {
      return result;
    }

    const legacyChunks = FirebaseSocialService.chunkEntityIds(unresolvedLegacyIds);
    const legacySnapshots = await Promise.all(
      legacyChunks.map((chunk) =>
        getDocs(
          query(
            collectionGroup(db, "quotes"),
            where(documentId(), "in", chunk)
          )
        )
      )
    );

    for (const snap of legacySnapshots) {
      for (const docSnap of snap.docs) {
        if (result.has(docSnap.id)) {
          continue;
        }
        const data = docSnap.data() as Record<string, unknown>;
        const canonicalQuoteId =
          typeof data.canonicalQuoteId === "string" && data.canonicalQuoteId.trim()
            ? data.canonicalQuoteId.trim()
            : "";
        if (!canonicalQuoteId) {
          continue;
        }
        const ownerId = docSnap.ref.parent?.parent?.id;
        result.set(docSnap.id, {
          data,
          ...(ownerId ? { ownerId } : {}),
          canonicalQuoteId,
        });
      }
    }

    return result;
  }

  private async hydrateFeedPrimaryEntities(
    db: ReturnType<typeof getDb>,
    contexts: FeedPostContext[]
  ): Promise<Post[]> {
    if (!db || contexts.length === 0) {
      return contexts.map((context) => context.post);
    }

    const hydrationStartedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const boundedContexts =
      contexts.length > FEED_HYDRATION_MAX_POSTS
        ? contexts.slice(0, FEED_HYDRATION_MAX_POSTS)
        : contexts;

    const idsByType: Record<PrimaryStructuredEntityType, Set<string>> = {
      book: new Set(),
      author: new Set(),
      quote: new Set(),
      shelf: new Set(),
      venue: new Set(),
      publication: new Set(),
    };
    const primaryByPostId = new Map<string, { type: PrimaryStructuredEntityType; id: string; ownerId?: string }>();

    for (const context of boundedContexts) {
      const primary = this.extractPrimaryEntityRef(context.raw, context.post);
      if (!primary) {
        continue;
      }
      if (primary.type === "quote") {
        const quoteOwnerId =
          (Array.isArray(context.post.content?.attachments)
            ? context.post.content.attachments.find((attachment) => {
                const type =
                  typeof attachment?.type === "string"
                    ? attachment.type.trim().toLowerCase()
                    : "";
                const entityId =
                  typeof (attachment as { entityId?: unknown }).entityId === "string"
                    ? (attachment as { entityId: string }).entityId.trim()
                    : "";
                const attachmentId =
                  typeof attachment?.attachmentId === "string"
                    ? attachment.attachmentId.trim()
                    : "";
                return (
                  type === "quote" &&
                  (entityId === primary.id || attachmentId === primary.id)
                );
              })
            : null
          ) as { entityOwnerId?: string } | null;

        const ownerId =
          typeof quoteOwnerId?.entityOwnerId === "string" && quoteOwnerId.entityOwnerId.trim()
            ? quoteOwnerId.entityOwnerId.trim()
            : context.post.authorId;

        primaryByPostId.set(context.post.id, {
          ...primary,
          ...(ownerId ? { ownerId } : {}),
        });
      } else {
        primaryByPostId.set(context.post.id, primary);
      }
      idsByType[primary.type].add(primary.id);
    }

    if (primaryByPostId.size === 0) {
      const hydrationEndedAt =
        typeof performance !== "undefined" && typeof performance.now === "function"
          ? performance.now()
          : Date.now();
      devInfo("[SOCIAL][FEED_HYDRATION_MS]", {
        ms: Math.max(0, Math.round(hydrationEndedAt - hydrationStartedAt)),
        posts: boundedContexts.length,
        uniqueBooks: 0,
        uniqueAuthors: 0,
        uniqueQuotes: 0,
        uniqueShelves: 0,
        uniqueVenues: 0,
        uniquePublications: 0,
      });
      return boundedContexts.map((context) => context.post);
    }

    const [books, authors, quotes, shelves, venues, publications] = await Promise.all([
      this.fetchCollectionDocsByIds(db, "books", Array.from(idsByType.book)),
      this.fetchCollectionDocsByIds(db, "authors", Array.from(idsByType.author)),
      this.fetchQuoteDocsByIds(db, Array.from(idsByType.quote)),
      this.fetchCollectionDocsByIds(db, "shelves", Array.from(idsByType.shelf)),
      this.fetchCollectionDocsByIds(db, "venues", Array.from(idsByType.venue)),
      this.fetchCollectionDocsByIds(db, "longform_publications", Array.from(idsByType.publication)),
    ]);

    const resolvedBookCoverMap = new Map<string, string>();
    await Promise.all(
      Array.from(books.entries()).map(async ([id, data]) => {
        const coverRecord =
          data.cover && typeof data.cover === "object"
            ? (data.cover as Record<string, unknown>)
            : null;

        const orderedCoverCandidates = [
          typeof data.coverUrl === "string" ? data.coverUrl.trim() : "",
          coverRecord && typeof coverRecord.medium === "string"
            ? coverRecord.medium.trim()
            : "",
          coverRecord && typeof coverRecord.original === "string"
            ? coverRecord.original.trim()
            : "",
          coverRecord && typeof coverRecord.large === "string"
            ? coverRecord.large.trim()
            : "",
          coverRecord && typeof coverRecord.small === "string"
            ? coverRecord.small.trim()
            : "",
        ].filter((candidate) => candidate.length > 0);

        if (orderedCoverCandidates.length === 0) {
          return;
        }

        let preferredCoverCandidate = orderedCoverCandidates[0];
        for (const candidate of orderedCoverCandidates) {
          if (extractInternalBookCoverPath(candidate)) {
            preferredCoverCandidate = candidate;
            break;
          }
        }

        const fallbackExternalCoverUrl =
          orderedCoverCandidates
            .map((candidate) => normalizeExternalCoverUrl(candidate))
            .find((candidate) => candidate.length > 0) || "";

        const resolvedCoverUrl = await resolveInternalBookCoverUrl(
          preferredCoverCandidate,
          fallbackExternalCoverUrl
        );

        if (resolvedCoverUrl !== preferredCoverCandidate) {
          resolvedBookCoverMap.set(id, resolvedCoverUrl);
        }
      })
    );

    const entityMap = new Map<string, HydratedFeedEntity>();
    for (const [id, data] of books) {
      const hasResolvedCover = resolvedBookCoverMap.has(id);
      const resolvedCoverUrl = hasResolvedCover
        ? resolvedBookCoverMap.get(id) ?? ""
        : "";
      const hydratedBookData = hasResolvedCover
        ? ({
            ...data,
            coverUrl: resolvedCoverUrl,
          } as Record<string, unknown>)
        : data;
      entityMap.set(`book:${id}`, { type: "book", id, data: hydratedBookData });
    }
    for (const [id, data] of authors) {
      entityMap.set(`author:${id}`, { type: "author", id, data });
    }
    for (const [id, payload] of quotes) {
      const effectiveQuoteId = payload.canonicalQuoteId || id;
      const hydratedQuote = {
        type: "quote",
        id: effectiveQuoteId,
        data: payload.data,
        ...(payload.ownerId ? { ownerId: payload.ownerId } : {}),
      } satisfies HydratedFeedEntity;
      entityMap.set(`quote:${id}`, hydratedQuote);
      if (payload.ownerId) {
        entityMap.set(`quote:${payload.ownerId}:${id}`, hydratedQuote);
      }
    }
    for (const [id, data] of shelves) {
      entityMap.set(`shelf:${id}`, { type: "shelf", id, data });
    }
    for (const [id, data] of venues) {
      entityMap.set(`venue:${id}`, { type: "venue", id, data });
    }
    for (const [id, data] of publications) {
      entityMap.set(`publication:${id}`, { type: "publication", id, data });
    }

    const hydratedPosts = boundedContexts.map((context) => {
      const primary = primaryByPostId.get(context.post.id);
      if (!primary) {
        return context.post;
      }

      const hydrated =
        primary.type === "quote"
          ? entityMap.get(`quote:${primary.id}`) ||
            (primary.ownerId ? entityMap.get(`quote:${primary.ownerId}:${primary.id}`) : undefined)
          : entityMap.get(`${primary.type}:${primary.id}`);
      const enriched = {
        ...context.post,
        primaryEntityType: primary.type,
        primaryEntityId:
          primary.type === "quote" && hydrated?.id ? hydrated.id : primary.id,
        hydratedEntity: hydrated
          ? {
              type: hydrated.type,
              id: hydrated.id,
              data: hydrated.data,
              ...(hydrated.ownerId ? { ownerId: hydrated.ownerId } : {}),
            }
          : null,
      } as Post;

      return enriched;
    });

    const hydrationEndedAt =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    devInfo("[SOCIAL][FEED_HYDRATION_MS]", {
      ms: Math.max(0, Math.round(hydrationEndedAt - hydrationStartedAt)),
      posts: boundedContexts.length,
      uniqueBooks: idsByType.book.size,
      uniqueAuthors: idsByType.author.size,
      uniqueQuotes: idsByType.quote.size,
      uniqueShelves: idsByType.shelf.size,
      uniqueVenues: idsByType.venue.size,
      uniquePublications: idsByType.publication.size,
    });

    return hydratedPosts;
  }

  private decodeFollowingCursorFromLegacySnapshot(
    cursorId: string | undefined
  ): FollowingFeedCursor | null {
    if (!cursorId || !cursorRegistry.has(cursorId)) {
      return null;
    }

    const legacySnap = cursorRegistry.get(cursorId);
    if (!legacySnap?.exists()) {
      return null;
    }

    const legacyData = legacySnap.data() as Record<string, unknown> | undefined;
    const createdAtIso = toIsoString(
      legacyData?.createdAt ??
      (legacyData?.timestamps as { createdAt?: unknown } | undefined)?.createdAt
    );
    const createdAtMs = Date.parse(createdAtIso);
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) {
      return null;
    }

    return {
      v: 1,
      scope: "following",
      createdAtMs: Math.trunc(createdAtMs),
      postId: legacySnap.id,
    };
  }

  private async getFollowingFeedPage(
    db: ReturnType<typeof getDb>,
    uid: string,
    filters: string[],
    cursorId?: string
  ): Promise<{ posts: Post[]; nextCursor?: string }> {
    const followingAuthorIds = Array.from(
      await this.getFollowingAuthorIds(uid)
    ).filter((authorId) => authorId.length > 0);

    if (followingAuthorIds.length === 0) {
      return { posts: [] };
    }

    const decodedCursor =
      decodeFollowingFeedCursor(cursorId) ??
      this.decodeFollowingCursorFromLegacySnapshot(cursorId);

    const postsRef = collection(db, "posts");
    const authorChunks = FirebaseSocialService.chunkAuthorIds(followingAuthorIds);
    const perBatchLimit = Math.max(
      2,
      Math.ceil((FOLLOWING_FEED_PAGE_SIZE * 2) / Math.max(1, authorChunks.length))
    );

    const batchQueries = authorChunks.map(async (authorBatch) => {
      let q = query(
        postsRef,
        where("authorId", "in", authorBatch),
        where("status", "==", "published"),
        orderBy("timestamps.createdAt", "desc"),
        orderBy(documentId(), "desc"),
        limit(perBatchLimit)
      );

      if (decodedCursor) {
        q = query(
          q,
          startAfter(new Date(decodedCursor.createdAtMs), decodedCursor.postId)
        );
      }

      const snap = await getDocs(q);
      return snap;
    });

    const batchSnapshots = await Promise.all(batchQueries);
    const candidates: FeedPostContext[] = [];

    for (const snap of batchSnapshots) {
      for (const docSnap of snap.docs) {
        const raw = docSnap.data() as Record<string, unknown>;
        const post = normalizePost({ ...raw, id: docSnap.id });
        if (post.status !== "published") continue;
        if (post.visibility !== "public" && post.visibility !== "followers") continue;
        if (!this.matchesFeedFilters(post, filters)) continue;
        candidates.push({ post, raw });
      }
    }

    const dedupedById = new Map<string, FeedPostContext>();
    for (const candidate of candidates) {
      if (!dedupedById.has(candidate.post.id)) {
        dedupedById.set(candidate.post.id, candidate);
      }
    }

    const sorted = Array.from(dedupedById.values()).sort((a, b) => {
      const aMs = Date.parse(a.post.timestamps?.createdAt || "");
      const bMs = Date.parse(b.post.timestamps?.createdAt || "");
      const safeAMs = Number.isFinite(aMs) ? aMs : 0;
      const safeBMs = Number.isFinite(bMs) ? bMs : 0;
      if (safeBMs !== safeAMs) {
        return safeBMs - safeAMs;
      }
      return b.post.id.localeCompare(a.post.id);
    });

    const pageContexts = sorted.slice(0, FOLLOWING_FEED_PAGE_SIZE);
    const posts = await this.hydrateFeedPrimaryEntities(db, pageContexts);
    const hasMore =
      sorted.length > FOLLOWING_FEED_PAGE_SIZE ||
      batchSnapshots.some((snap) => snap.docs.length === perBatchLimit);

    if (!hasMore || pageContexts.length === 0) {
      return { posts };
    }

    const last = pageContexts[pageContexts.length - 1].post;
    const createdAtMs = Date.parse(last.timestamps?.createdAt || "");
    if (!Number.isFinite(createdAtMs) || createdAtMs <= 0) {
      return { posts };
    }

    return {
      posts,
      nextCursor: encodeFollowingFeedCursor({
        v: 1,
        scope: "following",
        createdAtMs: Math.trunc(createdAtMs),
        postId: last.id,
      }),
    };
  }

  async getFeed(
    uid: string,
    scope: string,
    filters: string[] = [],
    cursorId?: string
  ): Promise<{ posts: Post[]; nextCursor?: string }> {
    normalizeString(uid, 128);
    const normalizedScope = normalizeString(scope, 32).toLowerCase() || "explore";
    const normalizedFilters = Array.isArray(filters)
      ? filters
          .map((value) => normalizeString(value, 32).toLowerCase())
          .filter((value): value is string => value.length > 0)
      : [];

    const result = await callEndpoint<
      { scope: string; filters: string[]; cursor?: string },
      { posts: Post[]; nextCursor?: string }
    >("listSocialFeed", {
      scope: normalizedScope,
      filters: normalizedFilters,
      ...(typeof cursorId === "string" && cursorId.trim()
        ? { cursor: cursorId.trim() }
        : {}),
    });

    return {
      posts: Array.isArray(result.posts)
        ? result.posts.map((post) => normalizePost(post))
        : [],
      ...(typeof result.nextCursor === "string" && result.nextCursor.trim()
        ? { nextCursor: result.nextCursor.trim() }
        : {}),
    };
  }

  async getComments(
    postId: string,
    cursorId?: string
  ): Promise<{ comments: ThreadComment[]; hasMore: boolean; nextCursor?: string }> {
    const normalizedPostId = ensureNonEmptyString(postId, "postId", 128);
    const result = await callEndpoint<
      { postId: string; cursor?: string },
      { comments: ThreadComment[]; hasMore: boolean; nextCursor?: string }
    >("listSocialComments", {
      postId: normalizedPostId,
      ...(typeof cursorId === "string" && cursorId.trim()
        ? { cursor: cursorId.trim() }
        : {}),
    });

    return {
      comments: Array.isArray(result.comments)
        ? result.comments.map((comment) => ({
            id: normalizeString(comment.id, 128),
            authorId: normalizeString(comment.authorId, 128),
            authorName: normalizeString(comment.authorName, 120) || "Unknown",
            authorHandle: normalizeString(comment.authorHandle, 120) || "@user",
            authorAvatar: normalizeString(comment.authorAvatar, 2048),
            text: normalizeString(comment.text, 4000),
            createdAt: toIsoString(comment.createdAt),
            parentId:
              typeof comment.parentId === "string" && comment.parentId.trim()
                ? comment.parentId.trim()
                : null,
            likesCount: toNonNegativeInt(comment.likesCount),
            liked: comment.liked === true,
          }))
        : [],
      hasMore: result.hasMore === true,
      ...(typeof result.nextCursor === "string" && result.nextCursor.trim()
        ? { nextCursor: result.nextCursor.trim() }
        : {}),
    };
  }

  async getPost(postId: string): Promise<Post> {
    const normalizedPostId = ensureNonEmptyString(postId, "postId", 128);
    const result = await callEndpoint<{ postId: string }, Post>(
      "getSocialPost",
      { postId: normalizedPostId }
    );
    return normalizePost(result);
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

    const rawAttachments = Array.isArray(post?.attachments) ? post.attachments : [];
    const structuredInputCount = rawAttachments.filter((attachment: any) => {
      const type =
        typeof attachment?.type === "string" ? attachment.type.trim().toLowerCase() : "";
      return FirebaseSocialService.STRUCTURED_ENTITY_TYPES.has(
        type as "book" | "author" | "quote" | "shelf" | "venue" | "publication"
      );
    }).length;

    const mappedAttachments = rawAttachments.length > 0
      ? rawAttachments.map((attachment: any) =>
          this.normalizeCreatePostAttachment(attachment)
        )
      : [];
    const structuredMappedCount = mappedAttachments.filter(
      (attachment) => "entityId" in attachment
    ).length;

    if (structuredInputCount > 0 && structuredMappedCount === 0) {
      console.error("[SOCIAL][STRUCTURED_ATTACHMENT_DROPPED]", {
        uid: normalizedUid,
        structuredInputCount,
      });
      throw new Error(
        "FAILED_PRECONDITION: Structured attachment dropped during createPost normalization."
      );
    }

    if (structuredMappedCount > 1) {
      throw new Error(
        "INVALID_ARGUMENT: Exactly one structured attachment is allowed per post."
      );
    }

    const result = await callEndpoint<
      {
        content: {
          text?: string;
          attachments?: Array<
            { attachmentId: string; type: string } |
            { type: "book" | "author" | "quote" | "shelf" | "venue" | "publication"; entityId: string; entityOwnerId?: string }
          >;
        };
        attachments: Array<
          { attachmentId: string; type: string } |
          { type: "book" | "author" | "quote" | "shelf" | "venue" | "publication"; entityId: string; entityOwnerId?: string }
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
