import { getDownloadURL, ref as storageRef } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
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
  setDoc,
  startAt,
  where,
} from "firebase/firestore";

import {
  getFirebaseDb,
  getFirebaseFunctions,
  getFirebaseStorage,
} from "../firebase.ts";
import { firestoreAdapter } from "../infrastructure/firebase/firestoreAdapter.ts";
import type { Author, Book, Review } from "../../types/entities.ts";
import type { BookStats } from "../../services/db.types.ts";

const AUTHOR_SEARCH_LIMIT = 24;
const AUTHOR_BOOKS_LIMIT = 60;
const RELATED_BOOKS_LIMIT = 12;
const TRENDING_BOOKS_LIMIT = 20;

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

function buildSearchPrefixes(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];

  const prefixes = new Set<string>();
  for (let i = 1; i <= normalized.length; i += 1) {
    prefixes.add(normalized.slice(0, i));
  }

  const tokens = normalized.split(" ").filter(Boolean);
  for (const token of tokens) {
    for (let i = 1; i <= token.length; i += 1) {
      prefixes.add(token.slice(0, i));
    }
  }

  return Array.from(prefixes).slice(0, 80);
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
  return {
    id,
    bookId: data.bookId,
    userId: data.userId,
    rating: data.rating,
    text: data.text,
    authorName: data.authorName || "",
    authorHandle: data.authorHandle || "",
    authorAvatar: data.authorAvatar || "",
    timestamp:
      data.updatedAt?.toDate?.()?.toISOString() ||
      data.createdAt?.toDate?.()?.toISOString() ||
      new Date().toISOString(),
    upvotes: data.upvotes || 0,
    downvotes: data.downvotes || 0,
    commentsCount: data.commentsCount || 0,
  };
}

async function resolveCoverUrl(book: any): Promise<string> {
  const candidate =
    book?.cover?.medium ||
    book?.cover?.original ||
    book?.coverUrl ||
    "";

  if (typeof candidate !== "string" || candidate.length === 0) {
    return "";
  }

  if (!candidate.startsWith("books/")) {
    return candidate;
  }

  try {
    const storage = getFirebaseStorage();
    return await getDownloadURL(storageRef(storage, candidate));
  } catch {
    return typeof book.coverUrl === "string" ? book.coverUrl : "";
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
    if (!book?.id) {
      throw new Error("BOOK_ID_MISSING");
    }

    const db = getDbOrThrow();
    const bookRef = doc(db, "books", book.id);
    const existing = await getDoc(bookRef);
    const existingCreatedAt = existing.exists() ? existing.data()?.createdAt : null;

    const now = serverTimestamp();
    await setDoc(
      bookRef,
      {
        ...book,
        authorId: book.authorId || buildAuthorId(book.authorEn || book.authorAr || ""),
        titleEnNormalized: normalizeSearchText(book.titleEn || ""),
        updatedAt: now,
        createdAt: existingCreatedAt || now,
      },
      { merge: true }
    );
  },

  async ingestBook(params: {
    bookId: string;
    source: "googleBooks" | "openLibrary";
    rawBook: any;
  }) {
    const functions = getFirebaseFunctions();
    const ingestFn = httpsCallable(functions, "ingestBook");
    const result = await ingestFn(params);
    return result.data;
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

        // Opportunistically normalize legacy books for future indexed reads.
        await Promise.all(
          snap.docs.map((bookDoc) =>
            setDoc(
              doc(db, "books", bookDoc.id),
              { authorId, updatedAt: serverTimestamp() },
              { merge: true }
            )
          )
        );
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
    if (!author?.id) {
      throw new Error("AUTHOR_ID_MISSING");
    }

    const db = getDbOrThrow();
    const authorRef = doc(db, "authors", author.id);
    const existing = await getDoc(authorRef);
    const existingData = existing.exists() ? existing.data() : null;
    const existingCreatedAt = existingData?.createdAt || null;
    const normalizedNameEn = normalizeSearchText(author.nameEn || "");
    const normalizedNameAr = normalizeSearchText(author.nameAr || "");
    const searchPrefixes = Array.from(
      new Set([
        ...buildSearchPrefixes(author.nameEn || ""),
        ...buildSearchPrefixes(author.nameAr || ""),
      ])
    );

    await setDoc(
      authorRef,
      {
        ...author,
        nameEnNormalized: normalizedNameEn,
        nameArNormalized: normalizedNameAr,
        searchPrefixes,
        popularityScore: existingData?.popularityScore || 0,
        followersCount: existingData?.followersCount || 0,
        updatedAt: serverTimestamp(),
        createdAt: existingCreatedAt || serverTimestamp(),
      },
      { merge: true }
    );
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
    if (!bookId) return [];
    const db = getDbOrThrow();
    const reviewsQuery = query(
      collection(db, "books", bookId, "reviews"),
      orderBy("updatedAt", "desc"),
      limit(100)
    );
    const snap = await getDocs(reviewsQuery);
    return snap.docs.map((d) => mapReview(d.data(), d.id));
  },

  async addReview(
    uid: string,
    review: {
      bookId: string;
      rating: number;
      text: string;
      authorName: string;
      authorHandle?: string;
      authorAvatar?: string | null;
    }
  ): Promise<void> {
    const {
      bookId,
      rating,
      text,
      authorName,
      authorHandle,
      authorAvatar,
    } = review;

    if (!uid || !bookId) {
      throw new Error("INVALID_REVIEW_IDENTITY");
    }
    if (rating < 1 || rating > 5) {
      throw new Error("INVALID_REVIEW_RATING");
    }

    const db = getDbOrThrow();
    const reviewRef = doc(db, "books", bookId, "reviews", uid);
    await setDoc(
      reviewRef,
      {
        bookId,
        userId: uid,
        rating,
        text,
        authorName,
        authorHandle: authorHandle || null,
        authorAvatar: authorAvatar || null,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  },

  async deleteReview(uid: string, bookId: string): Promise<void> {
    if (!uid || !bookId) {
      throw new Error("INVALID_REVIEW_IDENTITY");
    }

    const db = getDbOrThrow();
    await deleteDoc(doc(db, "books", bookId, "reviews", uid));
  },

  async getRecommendations(_uid: string): Promise<string[]> {
    const trending = await this.getTrendingBooks();
    return trending.map((b) => b.id);
  },
};
