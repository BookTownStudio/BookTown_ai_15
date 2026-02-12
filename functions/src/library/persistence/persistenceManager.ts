// functions/src/library/persistence/persistenceManager.ts

import { getFirestore, Timestamp } from "firebase-admin/firestore";
import {
  LibraryBook,
  LibraryEdition,
  LibraryEbook,
} from "../types/library.types";

/**
 * persistenceManager
 * --------------------------------------------------
 * Orchestrates the materialization of external search
 * results into BookTown's canonical domain.
 *
 * Enforces:
 * Book → Edition → Ebook hierarchy
 * Storage integrity contracts (A3.6)
 */

export async function materializeEdition(
  searchResult: any
): Promise<{ bookId: string; editionId: string }> {
  const db = getFirestore();

  /**
   * --------------------------------------------------
   * 1. Check if Edition already exists
   * --------------------------------------------------
   */
  const editionsRef = db.collection("editions");
  let existingEditionId: string | null = null;

  if (searchResult.isbn13) {
    const q = await editionsRef
      .where("isbn13", "==", searchResult.isbn13)
      .limit(1)
      .get();
    if (!q.empty) existingEditionId = q.docs[0].id;
  }

  if (!existingEditionId && searchResult.source === "google_books") {
    const q = await editionsRef
      .where(
        "sourceRefs.googleBooksVolumeId",
        "==",
        searchResult.editionId
      )
      .limit(1)
      .get();
    if (!q.empty) existingEditionId = q.docs[0].id;
  }

  if (!existingEditionId && searchResult.source === "open_library") {
    const q = await editionsRef
      .where(
        "sourceRefs.openLibraryEditionId",
        "==",
        searchResult.editionId
      )
      .limit(1)
      .get();
    if (!q.empty) existingEditionId = q.docs[0].id;
  }

  if (existingEditionId) {
    const doc = await editionsRef.doc(existingEditionId).get();
    return {
      bookId: doc.data()?.bookId,
      editionId: existingEditionId,
    };
  }

  /**
   * --------------------------------------------------
   * 2. Resolve or Create Book (Work-level entity)
   * --------------------------------------------------
   */
  let bookId: string | null = null;
  const booksRef = db.collection("books");

  if (searchResult.source === "open_library") {
    const q = await booksRef
      .where(
        "sourceRefs.openLibraryWorkId",
        "==",
        searchResult.bookId
      )
      .limit(1)
      .get();
    if (!q.empty) bookId = q.docs[0].id;
  }

  if (!bookId) {
    const canonicalTitle = searchResult.title.trim();
    const authors = searchResult.authors || [];

    const q = await booksRef
      .where("canonicalTitle", "==", canonicalTitle)
      .where(
        "authors",
        "array-contains-any",
        authors.length > 0 ? authors.slice(0, 1) : ["Unknown"]
      )
      .limit(1)
      .get();

    if (!q.empty) bookId = q.docs[0].id;
  }

  if (!bookId) {
    const now = Timestamp.now();

    const bookData: Omit<LibraryBook, "id"> = {
      canonicalTitle: searchResult.title,
      authors: searchResult.authors || [],
      primarySubjects: searchResult.categories || [],
      description: searchResult.description || "",
      firstPublishedYear: searchResult.publishedDate
        ? parseInt(searchResult.publishedDate.substring(0, 4))
        : null,
      sourceRefs: {
        googleBooksId:
          searchResult.source === "google_books"
            ? searchResult.bookId
            : null,
        openLibraryWorkId:
          searchResult.source === "open_library"
            ? searchResult.bookId
            : null,
      },
      createdAt: now,
      updatedAt: now,
    };

    const bookDoc = await booksRef.add(bookData);
    bookId = bookDoc.id;
  }

  /**
   * --------------------------------------------------
   * 3. Materialize Edition
   * --------------------------------------------------
   */
  const now = Timestamp.now();

  const editionData: Omit<LibraryEdition, "id"> & Record<string, any> = {
    bookId,
    language: searchResult.language || "en",
    title: searchResult.title,
    subtitle: null,
    translator: null,
    publisher: null,
    publishedDate: searchResult.publishedDate || null,
    isbn10: null,
    isbn13: searchResult.isbn13 || null,
    pageCount: searchResult.pageCount || null,
    categories: searchResult.categories || [],
    coverImages: {
      medium: searchResult.coverUrl || null,
    },
    hasEbook: searchResult.ebookAvailable || false,
    sourceRefs: {
      googleBooksVolumeId:
        searchResult.source === "google_books"
          ? searchResult.editionId
          : null,
      openLibraryEditionId:
        searchResult.source === "open_library"
          ? searchResult.editionId
          : null,
    },
    createdAt: now,
    updatedAt: now,

    // Additive compatibility fields
    titleEn: searchResult.title || "Untitled",
    authorEn:
      Array.isArray(searchResult.authors) && searchResult.authors.length > 0
        ? searchResult.authors[0]
        : "Unknown",
    description: searchResult.description || "",
    coverUrl: searchResult.coverUrl || null,
    visibility: "public",
    status: "active",
    ingestionSource: searchResult.source,
    normalized: true,
  };

  const editionDoc = await editionsRef.add(editionData);
  const editionId = editionDoc.id;

  /**
   * --------------------------------------------------
   * 4. Materialize Ebook (with Integrity Contract)
   * --------------------------------------------------
   */
  if (searchResult.ebookAvailable) {
    const ebooksRef = db.collection("ebooks");

    const ebookData: Omit<LibraryEbook, "id"> & Record<string, any> = {
      editionId,
      bookId,
      format: "epub",
      storagePath: `external/${searchResult.source}/${searchResult.editionId}`,
      source: searchResult.source,
      publicDomain: false,
      downloadable: searchResult.ebookAvailable,
      createdAt: now,

      /**
       * 🔒 A3.6 — Storage Integrity Metadata
       * These are REQUIRED, even if unresolved initially.
       */
      bytes: null,
      sha256: null,
      integrityStatus: "unverified", // unverified | verified | corrupted
      verifiedAt: null,
    };

    await ebooksRef.add(ebookData);
  }

  return { bookId, editionId };
}
