import { getDownloadURL, ref as storageRef } from "firebase/storage";
import type { FirebaseError } from "firebase/app";
import {
  collection,
  deleteDoc,
  doc,
  endAt,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAt,
  where,
} from "firebase/firestore";

import {
  getFirebaseDb,
  getFirebaseStorage,
} from "../firebase.ts";
import { firestoreAdapter } from "../infrastructure/firebase/firestoreAdapter.ts";
import { ensureCanonicalAuthor } from "../authors/ensureCanonicalAuthor.ts";
import { ensureCanonicalBook } from "../books/ensureCanonicalBook.ts";
import type { Author, Book, Review } from "../../types/entities.ts";
import type { BookStats } from "../../services/db.types.ts";
import type { LibrarianRecommendationContext } from "../../types/librarian.ts";

const AUTHOR_SEARCH_LIMIT = 24;
const AUTHOR_BOOKS_LIMIT = 60;
const RELATED_BOOKS_LIMIT = 12;
const TRENDING_BOOKS_LIMIT = 20;
const INTERNAL_BOOK_COVER_PATH_RE = /^books\/[^/]+\/covers\/[^?#]+$/i;
const missingInternalCoverPathCache = new Set<string>();
const loggedMissingInternalCoverPathCache = new Set<string>();
const resolvedInternalCoverUrlCache = new Map<string, string>();

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

function resolveDeterministicErrorCode(
  transportCode: string,
  details: unknown
): string {
  if (details && typeof details === "object") {
    const detailsCode = (details as { code?: unknown }).code;
    if (typeof detailsCode === "string" && detailsCode.trim().length > 0) {
      return detailsCode.trim();
    }
  }
  return transportCode;
}

function getDbOrThrow() {
  try {
    return getFirebaseDb();
  } catch {
    throw new Error("FIRESTORE_NOT_AVAILABLE");
  }
}

function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAuthorId(authorName: string): string {
  const normalized = normalizeSearchText(authorName).replace(/\s+/g, "_");
  if (!normalized) return "author_unknown";
  return `author_${normalized}`;
}

function mapBook(data: any, id: string): Book {
  return {
    id,
    titleEn: data.titleEn || data.title || "",
    titleAr: data.titleAr || "",
    authorId: data.authorId || buildAuthorId(data.authorEn || data.author || ""),
    authorEn: data.authorEn || data.author || "",
    authorAr: data.authorAr || "",
    descriptionEn: data.descriptionEn || data.description || "",
    descriptionAr: data.descriptionAr || "",
    coverUrl: data.coverUrl || data?.cover?.medium || data?.cover?.original || "",
    publicationDate: data.publicationDate || null,
    pageCount: data.pageCount || null,
    rating: data.rating || 0,
    ratingsCount: data.ratingsCount || 0,
    isEbookAvailable: Boolean(data.isEbookAvailable || data.hasEbook),
    ebookAttachmentId:
      typeof data.ebookAttachmentId === "string" && data.ebookAttachmentId.trim().length > 0
        ? data.ebookAttachmentId.trim()
        : undefined,
    genresEn: Array.isArray(data.categories) ? data.categories : data.genresEn || [],
    genresAr: Array.isArray(data.genresAr) ? data.genresAr : [],
  };
}

function mapAuthor(data: any, id: string): Author {
  const nameEn = data.nameEn || data.authorEn || data.name || "";
  const nameAr = data.nameAr || data.authorAr || nameEn;

  return {
    id,
    nameEn,
    nameAr,
    avatarUrl: data.avatarUrl || "",
    bioEn: data.bioEn || "",
    bioAr: data.bioAr || "",
    lifespan: data.lifespan || "",
    countryEn: data.countryEn || "",
    countryAr: data.countryAr || "",
    languageEn: data.languageEn || "",
    languageAr: data.languageAr || "",
    signatureQuoteEn: data.signatureQuoteEn,
    signatureQuoteAr: data.signatureQuoteAr,
  };
}

function mapReview(data: any, id: string): Review {
  const normalizedTimestamp =
    typeof data.timestamp === "string" && data.timestamp.trim().length > 0
      ? data.timestamp
      : typeof data.updatedAtIso === "string" && data.updatedAtIso.trim().length > 0
      ? data.updatedAtIso
      : typeof data.updatedAt === "string" && data.updatedAt.trim().length > 0
      ? data.updatedAt
      : data.updatedAt?.toDate?.()?.toISOString() ||
        data.createdAt?.toDate?.()?.toISOString() ||
        new Date().toISOString();

  return {
    id,
    domain: "book",
    visibility: data.visibility === "private" ? "private" : "public",
    bookId: data.bookId,
    bookTitleEn: typeof data.bookTitleEn === "string" ? data.bookTitleEn : "",
    bookTitleAr: typeof data.bookTitleAr === "string" ? data.bookTitleAr : "",
    bookAuthorEn: typeof data.bookAuthorEn === "string" ? data.bookAuthorEn : "",
    bookAuthorAr: typeof data.bookAuthorAr === "string" ? data.bookAuthorAr : "",
    bookCoverThumbUrl: typeof data.bookCoverThumbUrl === "string" ? data.bookCoverThumbUrl : "",
    bookCoverUrl: typeof data.bookCoverUrl === "string" ? data.bookCoverUrl : "",
    userId: data.userId || data.uid || "",
    rating: Number.isFinite(Number(data.rating)) ? Math.trunc(Number(data.rating)) : 1,
    text: typeof data.text === "string" ? data.text : "",
    authorName: data.authorName || "",
    authorHandle: data.authorHandle || "",
    authorAvatar: data.authorAvatar || "",
    timestamp: normalizedTimestamp,
    upvotes: Number.isFinite(Number(data.upvotes)) ? Math.max(0, Math.trunc(Number(data.upvotes))) : 0,
    downvotes:
      Number.isFinite(Number(data.downvotes)) ? Math.max(0, Math.trunc(Number(data.downvotes))) : 0,
    commentsCount:
      Number.isFinite(Number(data.commentsCount))
        ? Math.max(0, Math.trunc(Number(data.commentsCount)))
        : 0,
  };
}

function extractCallableData<T>(endpoint: string, payload: unknown): T {
  if (!payload || typeof payload !== "object") {
    throw new Error(`[${endpoint}] Invalid callable response envelope.`);
  }

  const envelope = payload as Partial<SuccessEnvelope<T>> &
    Partial<FailureEnvelope> & {
      success?: boolean;
    };

  if (envelope.success === false && envelope.error) {
    const transportCode =
      typeof envelope.error.code === "string"
        ? envelope.error.code
        : "UNKNOWN";
    const code = resolveDeterministicErrorCode(
      transportCode,
      envelope.error.details
    );
    const message =
      typeof envelope.error.message === "string"
        ? envelope.error.message
        : "Callable request failed.";
    const error = new Error(`[${code}] ${message}`) as Error & {
      code?: string;
      transportCode?: string;
      details?: unknown;
      endpoint?: string;
    };
    error.code = code;
    error.transportCode = transportCode;
    error.details = envelope.error.details;
    error.endpoint = endpoint;
    throw error;
  }

  if (envelope.success !== true || !("data" in envelope)) {
    throw new Error(`[${endpoint}] Missing success envelope data.`);
  }

  return envelope.data as T;
}

async function callEndpoint<TRequest, TResponse>(
  endpoint: string,
  request: TRequest
): Promise<TResponse> {
  const fn = httpsCallable<TRequest, SuccessEnvelope<TResponse> | FailureEnvelope>(
    getFirebaseFunctions(),
    endpoint
  );
  const result = await fn(request);
  return extractCallableData<TResponse>(endpoint, result.data);
}

function extractInternalBookCoverPath(candidate: string): string {
  const normalized = candidate.trim();
  if (!normalized) {
    return "";
  }

  if (INTERNAL_BOOK_COVER_PATH_RE.test(normalized)) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);

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
}

function normalizeExternalCoverUrl(candidate: string): string {
  const normalized = candidate.trim();
  if (!normalized) {
    return "";
  }

  if (extractInternalBookCoverPath(normalized)) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString();
  } catch {
    return "";
  }
}

async function resolveCoverUrl(book: any): Promise<string> {
  const orderedCandidates = [
    typeof book?.cover?.medium === "string" ? book.cover.medium : "",
    typeof book?.cover?.original === "string" ? book.cover.original : "",
    typeof book?.cover?.large === "string" ? book.cover.large : "",
    typeof book?.cover?.small === "string" ? book.cover.small : "",
    typeof book?.coverUrl === "string" ? book.coverUrl : "",
  ]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (orderedCandidates.length === 0) {
    return "";
  }

  let preferredCandidate = orderedCandidates[0];
  for (const candidate of orderedCandidates) {
    if (extractInternalBookCoverPath(candidate)) {
      preferredCandidate = candidate;
      break;
    }
  }

  const fallbackExternalUrl =
    orderedCandidates
      .map((candidate) => normalizeExternalCoverUrl(candidate))
      .find((candidate) => candidate.length > 0) || "";

  const internalCoverPath = extractInternalBookCoverPath(preferredCandidate);
  if (!internalCoverPath) {
    return fallbackExternalUrl;
  }

  if (resolvedInternalCoverUrlCache.has(internalCoverPath)) {
    return resolvedInternalCoverUrlCache.get(internalCoverPath) || fallbackExternalUrl;
  }

  if (missingInternalCoverPathCache.has(internalCoverPath)) {
    return fallbackExternalUrl;
  }

  try {
    const storage = getFirebaseStorage();
    const signedUrl = await getDownloadURL(storageRef(storage, internalCoverPath));
    resolvedInternalCoverUrlCache.set(internalCoverPath, signedUrl);
    return signedUrl;
  } catch (error) {
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code || "")
        : "";

    if (errorCode === "storage/object-not-found") {
      missingInternalCoverPathCache.add(internalCoverPath);
      if (!loggedMissingInternalCoverPathCache.has(internalCoverPath)) {
        loggedMissingInternalCoverPathCache.add(internalCoverPath);
        console.warn("[CATALOG][COVER_MISSING_FALLBACK]", {
          internalCoverPath,
          fallback: fallbackExternalUrl || "placeholder",
        });
      }
      return fallbackExternalUrl;
    }

    console.error("[CATALOG][COVER_RESOLVE_FAILED]", {
      internalCoverPath,
      errorCode,
      error: String(error),
    });
    return fallbackExternalUrl;
  }
}

export const firebaseCatalogService = {
  async getBook(bookId: string): Promise<Book> {
    if (!bookId) {
      throw new Error("BOOK_ID_MISSING");
    }

    try {
      const book = await firestoreAdapter.getDoc<any>(`books/${bookId}`);
      if (!book) {
        throw new Error("BOOK_NOT_READY");
      }

      const mapped = mapBook(book, bookId);
      const resolvedCoverUrl = await resolveCoverUrl(book);
      return { ...mapped, coverUrl: resolvedCoverUrl };
    } catch (err: any) {
      const fbErr = err as FirebaseError;
      if (
        err?.message === "BOOK_NOT_READY" ||
        fbErr?.code === "permission-denied" ||
        fbErr?.code === "unavailable" ||
        fbErr?.code === "not-found"
      ) {
        throw new Error("BOOK_NOT_READY");
      }
      throw err;
    }
  },

  async createBook(book: Book): Promise<void> {
    void book;
    throw new Error("CATALOG_WRITE_PATH_DISABLED: Use backend callable ingestion paths only.");
  },

  async ingestBook(params: {
    providerExternalId?: string;
    bookId?: string;
    source: "googleBooks" | "openLibrary";
    rawBook: any;
  }) {
    const providerExternalId =
      typeof params.providerExternalId === "string" && params.providerExternalId.trim().length > 0
        ? params.providerExternalId
        : params.bookId || "";

    return ensureCanonicalBook({
      providerExternalId,
      source: params.source,
      rawBook: params.rawBook,
    });
  },

  async ingestAuthor(params: {
    providerExternalId?: string;
    authorId?: string;
    source: "openLibrary" | "wikidata";
    rawAuthor: any;
  }) {
    const providerExternalId =
      typeof params.providerExternalId === "string" && params.providerExternalId.trim().length > 0
        ? params.providerExternalId
        : params.authorId || "";

    return ensureCanonicalAuthor({
      providerExternalId,
      source: params.source,
      rawAuthor: params.rawAuthor,
    });
  },

  async searchBooks(queryText: string): Promise<Book[]> {
    const qText = normalizeSearchText(queryText || "");
    if (!qText || qText.length < 2) return [];

    const db = getDbOrThrow();
    const booksRef = collection(db, "books");

    const prefixQuery = query(
      booksRef,
      orderBy("titleEnNormalized"),
      startAt(qText),
      endAt(`${qText}\uf8ff`),
      limit(30)
    );

    const snap = await getDocs(prefixQuery);
    return snap.docs.map((d) => mapBook(d.data(), d.id));
  },

  async getRelatedBooks(bookId: string): Promise<Book[]> {
    const book = await this.getBook(bookId);
    if (!book?.authorId) return [];

    const byAuthor = await this.getBooksByAuthor(book.authorId);
    return byAuthor
      .filter((candidate) => candidate.id !== bookId)
      .slice(0, RELATED_BOOKS_LIMIT);
  },

  async getTrendingBooks(): Promise<Book[]> {
    const db = getDbOrThrow();
    const q = query(
      collection(db, "books"),
      orderBy("rating", "desc"),
      limit(TRENDING_BOOKS_LIMIT)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => mapBook(d.data(), d.id));
  },

  async getBooksByAuthor(authorId: string): Promise<Book[]> {
    if (!authorId) return [];

    const db = getDbOrThrow();
    const byAuthorId = query(
      collection(db, "books"),
      where("authorId", "==", authorId),
      limit(AUTHOR_BOOKS_LIMIT)
    );
    let snap = await getDocs(byAuthorId);

    if (snap.empty) {
      const authorSnap = await getDoc(doc(db, "authors", authorId));
      const fallbackNameEn = authorSnap.exists()
        ? String(authorSnap.data()?.nameEn || "").trim()
        : "";

      if (fallbackNameEn) {
        const byAuthorName = query(
          collection(db, "books"),
          where("authorEn", "==", fallbackNameEn),
          limit(AUTHOR_BOOKS_LIMIT)
        );
        snap = await getDocs(byAuthorName);
      }
    }

    const books = snap.docs.map((d) => mapBook(d.data(), d.id));
    books.sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      return a.titleEn.localeCompare(b.titleEn);
    });

    return books;
  },

  async getBookStats(bookId: string): Promise<BookStats> {
    return this.getStats(bookId);
  },

  async getStats(bookId: string): Promise<BookStats> {
    if (!bookId) {
      throw new Error("BOOK_ID_MISSING");
    }

    const db = getDbOrThrow();
    const snap = await getDoc(doc(db, "book_stats", bookId));
    if (!snap.exists()) {
      return {
        bookmarks: 0,
        reviews: 0,
        ratingsCount: 0,
        averageRating: 0,
      };
    }

    const data = snap.data();
    return {
      bookmarks: data.bookmarks || 0,
      reviews: data.reviews || 0,
      ratingsCount: data.ratingsCount || 0,
      averageRating: data.averageRating || 0,
    };
  },

  async getAuthor(authorId: string): Promise<Author | null> {
    if (!authorId) {
      throw new Error("AUTHOR_ID_MISSING");
    }

    const db = getDbOrThrow();
    const snap = await getDoc(doc(db, "authors", authorId));
    if (!snap.exists()) return null;
    return mapAuthor(snap.data(), snap.id);
  },

  async createAuthor(author: Author): Promise<void> {
    void author;
    throw new Error("CATALOG_WRITE_PATH_DISABLED: Use backend callable ingestion paths only.");
  },

  async searchAuthors(queryText: string): Promise<Author[]> {
    const db = getDbOrThrow();
    const authorsRef = collection(db, "authors");
    const qText = normalizeSearchText(queryText || "");

    let docs = [];

    if (!qText) {
      const topAuthors = await getDocs(
        query(authorsRef, orderBy("popularityScore", "desc"), limit(AUTHOR_SEARCH_LIMIT))
      );
      docs = topAuthors.docs;
    } else {
      const byPrefixSnap = await getDocs(
        query(
          authorsRef,
          where("searchPrefixes", "array-contains", qText),
          limit(AUTHOR_SEARCH_LIMIT)
        )
      );
      docs = byPrefixSnap.docs;

      if (docs.length === 0) {
        const byNameSnap = await getDocs(
          query(
            authorsRef,
            orderBy("nameEnNormalized"),
            startAt(qText),
            endAt(`${qText}\uf8ff`),
            limit(AUTHOR_SEARCH_LIMIT)
          )
        );
        docs = byNameSnap.docs;
      }
    }

    const authors = docs.map((d) => mapAuthor(d.data(), d.id));
    authors.sort((a, b) => a.nameEn.localeCompare(b.nameEn));
    return authors;
  },

  async followAuthor(uid: string, authorId: string): Promise<void> {
    if (!uid) throw new Error("UID_MISSING");
    if (!authorId) throw new Error("AUTHOR_ID_MISSING");

    const db = getDbOrThrow();
    const authorRef = doc(db, "authors", authorId);
    const followRef = doc(db, "users", uid, "follows_authors", authorId);

    await runTransaction(db, async (tx) => {
      const authorSnap = await tx.get(authorRef);
      if (!authorSnap.exists()) {
        throw new Error("AUTHOR_NOT_FOUND");
      }

      const followSnap = await tx.get(followRef);
      if (followSnap.exists()) return;

      tx.set(followRef, {
        uid,
        authorId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.set(
        authorRef,
        {
          followersCount: increment(1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  },

  async unfollowAuthor(uid: string, authorId: string): Promise<void> {
    if (!uid) throw new Error("UID_MISSING");
    if (!authorId) throw new Error("AUTHOR_ID_MISSING");

    const db = getDbOrThrow();
    const authorRef = doc(db, "authors", authorId);
    const followRef = doc(db, "users", uid, "follows_authors", authorId);

    await runTransaction(db, async (tx) => {
      const followSnap = await tx.get(followRef);
      if (!followSnap.exists()) return;

      tx.delete(followRef);
      tx.set(
        authorRef,
        {
          followersCount: increment(-1),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });
  },

  async isAuthorFollowed(uid: string, authorId: string): Promise<boolean> {
    if (!uid || !authorId) return false;
    const db = getDbOrThrow();
    const snap = await getDoc(doc(db, "users", uid, "follows_authors", authorId));
    return snap.exists();
  },

  async getReviews(bookId: string): Promise<Review[]> {
    const page = await this.getReviewsPage(bookId, { limit: 20 });
    return page.items;
  },

  async getReviewsPage(
    bookId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ items: Review[]; hasMore: boolean; nextCursor?: string; revision?: string }> {
    if (!bookId) return { items: [], hasMore: false };
    const normalizedBookId = String(bookId).trim();
    if (!normalizedBookId) return { items: [], hasMore: false };
    const boundedLimit = Math.min(50, Math.max(1, Math.trunc(options?.limit || 20)));
    const cursor =
      typeof options?.cursor === "string" && options.cursor.trim()
        ? options.cursor.trim().slice(0, 96)
        : undefined;

    const response = await callEndpoint<
      { bookId: string; limit: number; cursor?: string },
      {
        items: Record<string, unknown>[];
        hasMore: boolean;
        nextCursor?: string;
        revision?: string;
      }
    >("listBookReviews", {
      bookId: normalizedBookId,
      limit: boundedLimit,
      ...(cursor ? { cursor } : {}),
    });

    const items = response.items.map((item) =>
      mapReview(item, String(item.id || ""))
    );

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
  },

  async addReview(
    uid: string,
    review: {
      bookId: string;
      rating: number;
      text: string;
      visibility?: "public" | "private";
      recommendationContext?: LibrarianRecommendationContext;
    }
  ): Promise<void> {
    const { bookId, rating, text, visibility, recommendationContext } = review;
    if (!uid || !bookId) {
      throw new Error("INVALID_REVIEW_IDENTITY");
    }
    if (rating < 1 || rating > 5) {
      throw new Error("INVALID_REVIEW_RATING");
    }

    const normalizedRecommendationContext = normalizeRecommendationContext(recommendationContext);

    await callEndpoint<
      {
        bookId: string;
        rating: number;
        text: string;
        visibility?: "public" | "private";
        recommendationContext?: LibrarianRecommendationContext;
      },
      {
        reviewId: string;
        bookId: string;
        uid: string;
        visibility: "public" | "private";
        created: boolean;
        updatedAt: string;
        revision: string;
      }
    >("upsertBookReview", {
      bookId,
      rating,
      text,
      ...(visibility ? { visibility } : {}),
      ...(normalizedRecommendationContext
        ? { recommendationContext: normalizedRecommendationContext }
        : {}),
    });
  },

  async deleteReview(uid: string, bookId: string): Promise<void> {
    if (!uid || !bookId) {
      throw new Error("INVALID_REVIEW_IDENTITY");
    }
    await callEndpoint<
      { bookId: string },
      { deleted: boolean; bookId: string; uid: string; revision: string }
    >("deleteBookReview", { bookId });
  },

  async getRecommendations(_uid: string): Promise<string[]> {
    const trending = await this.getTrendingBooks();
    return trending.map((b) => b.id);
  },
};
