import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { assertActiveAuthenticatedUser } from "./shared/auth";
import { canUserReadBook } from "./rights/bookRights";
import { getSignedUrl } from "./attachments/storageSignedUrl";
import { readCanonicalFallbackCover } from "./covers/canonicalFallbackCover";

const db = admin.firestore();

function asNonEmptyString(value: unknown, maxLen = 2048): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function asStringArray(value: unknown, itemMaxLen: number, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, itemMaxLen))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function asNonNegativeInt(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.trunc(numeric);
}

function asNonNegativeNumber(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
}

function toCreatedAtMillis(value: unknown): number | undefined {
  if (
    value &&
    typeof value === "object" &&
    "toMillis" in value &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    const millis = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(millis) && millis >= 0 ? Math.trunc(millis) : undefined;
  }

  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const millis = (value as { toDate: () => Date }).toDate().getTime();
    return Number.isFinite(millis) && millis >= 0 ? Math.trunc(millis) : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }

  return undefined;
}

function resolveInternalCoverPath(book: Record<string, unknown>): string {
  const cover =
    book.cover && typeof book.cover === "object" && !Array.isArray(book.cover)
      ? (book.cover as Record<string, unknown>)
      : null;

  const candidates = [
    asNonEmptyString(cover?.medium),
    asNonEmptyString(cover?.original),
    asNonEmptyString(cover?.large),
    asNonEmptyString(cover?.small),
    asNonEmptyString(book.coverUrl),
  ];

  for (const candidate of candidates) {
    if (candidate.startsWith("books/") && candidate.includes("/covers/")) {
      return candidate;
    }
  }

  return "";
}

async function resolveRenderableCoverUrl(book: Record<string, unknown>): Promise<string> {
  const externalCandidates = [
    asNonEmptyString(
      book.cover && typeof book.cover === "object" && !Array.isArray(book.cover)
        ? (book.cover as Record<string, unknown>).medium
        : ""
    ),
    asNonEmptyString(
      book.cover && typeof book.cover === "object" && !Array.isArray(book.cover)
        ? (book.cover as Record<string, unknown>).original
        : ""
    ),
    asNonEmptyString(book.coverUrl),
  ].filter((value) => /^https?:\/\//i.test(value));

  const internalCoverPath = resolveInternalCoverPath(book);
  if (!internalCoverPath) {
    return externalCandidates[0] || "";
  }

  try {
    return await getSignedUrl({
      bucket: admin.storage().bucket().name,
      path: internalCoverPath,
      intent: "cover",
    });
  } catch (error) {
    logger.warn("[BOOK_DETAILS][SIGNED_COVER_FALLBACK]", {
      bookId: asNonEmptyString(book.id, 256),
      internalCoverPath,
      error: String(error),
    });
    return externalCandidates[0] || "";
  }
}

function mapAccessibleBook(
  bookId: string,
  source: Record<string, unknown>,
  coverUrl: string
) {
  const titleEn = asNonEmptyString(source.titleEn, 300) || asNonEmptyString(source.title, 300) || "Unknown Title";
  const titleAr = asNonEmptyString(source.titleAr, 300) || titleEn;
  const authorEn = asNonEmptyString(source.authorEn, 300) || asNonEmptyString(source.author, 300) || "Unknown Author";
  const authorAr = asNonEmptyString(source.authorAr, 300) || authorEn;
  const fallbackCover = readCanonicalFallbackCover(source.fallbackCover);
  const coverMode =
    source.coverMode === "uploaded" || source.coverMode === "fallback_metadata"
      ? source.coverMode
      : undefined;

  return {
    id: bookId,
    authorId: asNonEmptyString(source.authorId, 256),
    ...(asNonEmptyString(source.title, 300) ? { title: asNonEmptyString(source.title, 300) } : {}),
    titleEn,
    titleAr,
    authorEn,
    authorAr,
    ...(asStringArray(source.authors, 300, 12).length > 0
      ? { authors: asStringArray(source.authors, 300, 12) }
      : {}),
    ...(asStringArray(source.bookCovers, 2048, 8).length > 0
      ? { bookCovers: asStringArray(source.bookCovers, 2048, 8) }
      : {}),
    coverUrl,
    ...(coverMode ? { coverMode } : {}),
    ...(fallbackCover ? { fallbackCover } : {}),
    descriptionEn:
      asNonEmptyString(source.descriptionEn, 5000) || asNonEmptyString(source.description, 5000),
    descriptionAr: asNonEmptyString(source.descriptionAr, 5000),
    ...(asNonEmptyString(source.description, 5000)
      ? { description: asNonEmptyString(source.description, 5000) }
      : {}),
    genresEn: asStringArray(source.genresEn, 120, 30),
    genresAr: asStringArray(source.genresAr, 120, 30),
    rating: asNonNegativeNumber(source.rating),
    ratingsCount: asNonNegativeInt(source.ratingsCount),
    ...(typeof source.reviewCount !== "undefined"
      ? { reviewCount: asNonNegativeInt(source.reviewCount) }
      : {}),
    isEbookAvailable:
      source.isEbookAvailable === true ||
      source.hasEbook === true ||
      asNonEmptyString(source.ebookAttachmentId, 256).length > 0,
    ...(asNonEmptyString(source.publicationDate, 64)
      ? { publicationDate: asNonEmptyString(source.publicationDate, 64) }
      : {}),
    ...(typeof source.pageCount === "number" && Number.isFinite(source.pageCount) && source.pageCount >= 0
      ? { pageCount: Math.trunc(source.pageCount) }
      : {}),
    ...(typeof toCreatedAtMillis(source.createdAt) === "number"
      ? { createdAt: toCreatedAtMillis(source.createdAt) }
      : {}),
    rawBook: source,
    ...(asNonEmptyString(source.ebookAttachmentId, 256)
      ? { ebookAttachmentId: asNonEmptyString(source.ebookAttachmentId, 256) }
      : {}),
  };
}

export const getAccessibleBook = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const bookId = asNonEmptyString((request.data as { bookId?: unknown } | undefined)?.bookId, 256);

  if (!bookId) {
    throw new HttpsError("invalid-argument", "A valid bookId is required.");
  }

  const bookSnap = await db.collection("books").doc(bookId).get();
  if (!bookSnap.exists) {
    throw new HttpsError("not-found", "Book not found.");
  }

  const book = (bookSnap.data() ?? {}) as Record<string, unknown>;
  if (!canUserReadBook(book, caller.uid)) {
    throw new HttpsError("permission-denied", "Book access denied.");
  }

  const coverUrl = await resolveRenderableCoverUrl({
    ...book,
    id: bookId,
  });

  logger.info("[BOOK_DETAILS][ACCESSIBLE_BOOK_LOADED]", {
    requestedBy: caller.uid,
    bookId,
    visibility: asNonEmptyString(book.visibility, 32) || "public",
    rightsMode: asNonEmptyString(book.rightsMode, 32) || "public_free",
    coverResolved: coverUrl.length > 0,
  });

  return mapAccessibleBook(bookId, book, coverUrl);
});
