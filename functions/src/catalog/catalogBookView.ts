import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { getSignedUrl } from "../attachments/storageSignedUrl";
import { readCanonicalFallbackCover } from "../covers/canonicalFallbackCover";

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

function readExternalReadableSources(source: Record<string, unknown>) {
  if (!Array.isArray(source.externalReadableSources)) return undefined;

  const normalized = source.externalReadableSources
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return null;
      }

      const raw = entry as Record<string, unknown>;
      const provider =
        raw.provider === "openLibrary" ||
        raw.provider === "gutenberg" ||
        raw.provider === "hindawi" ||
        raw.provider === "gallica"
          ? raw.provider
          : null;
      const providerExternalId = asNonEmptyString(raw.providerExternalId, 256);
      const trust = raw.trust === "trusted" ? "trusted" : null;

      if (!provider || !providerExternalId || !trust) {
        return null;
      }

      const lendingEditionId = asNonEmptyString(raw.lendingEditionId, 256);
      const lendingIdentifier = asNonEmptyString(raw.lendingIdentifier, 256);

      return {
        provider,
        providerExternalId,
        ...(lendingEditionId ? { lendingEditionId } : {}),
        ...(lendingIdentifier ? { lendingIdentifier } : {}),
        trust,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function readReaderAuthority(source: Record<string, unknown>) {
  const raw =
    source.readerAuthority &&
    typeof source.readerAuthority === "object" &&
    !Array.isArray(source.readerAuthority)
      ? (source.readerAuthority as Record<string, unknown>)
      : null;

  if (!raw || raw.hasReadableAttachment !== true) return undefined;

  const attachmentId = asNonEmptyString(raw.attachmentId, 256);
  const authoritySource = asNonEmptyString(raw.source, 64);

  return {
    hasReadableAttachment: true,
    attachmentId: attachmentId || null,
    ...(authoritySource ? { source: authoritySource } : {}),
    ...(raw.updatedAt !== undefined ? { updatedAt: raw.updatedAt } : {}),
  };
}

function sanitizeRawBookForCatalog(source: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...source };
  delete sanitized.storagePath;
  delete sanitized.ebookStoragePath;
  delete sanitized.epubStoragePath;
  return sanitized;
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

async function resolveRenderableCoverUrl(
  bookId: string,
  book: Record<string, unknown>
): Promise<string> {
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
    logger.warn("[CATALOG][SIGNED_COVER_FALLBACK]", {
      bookId,
      internalCoverPath,
      error: String(error),
    });
    return externalCandidates[0] || "";
  }
}

export async function buildCatalogBookView(
  bookId: string,
  source: Record<string, unknown>
) {
  const semanticGraphEligible = isPublicReadableBook(source);
  const coverUrl = await resolveRenderableCoverUrl(bookId, source);
  const titleEn =
    asNonEmptyString(source.titleEn, 300) ||
    asNonEmptyString(source.title, 300) ||
    "Unknown Title";
  const titleAr = asNonEmptyString(source.titleAr, 300) || titleEn;
  const authorEn =
    asNonEmptyString(source.authorEn, 300) ||
    asNonEmptyString(source.author, 300) ||
    "Unknown Author";
  const authorAr = asNonEmptyString(source.authorAr, 300) || authorEn;
  const fallbackCover = readCanonicalFallbackCover(source.fallbackCover);
  const coverMode =
    source.coverMode === "uploaded" || source.coverMode === "fallback_metadata"
      ? source.coverMode
      : undefined;
  const providerExternalIds = asStringArray(source.providerExternalIds, 256, 32);
  const externalReadableSources = readExternalReadableSources(source);
  const readerAuthority = readReaderAuthority(source);
  const acquiredFromProvider =
    source.acquiredFromProvider === "openLibrary" ||
    source.acquiredFromProvider === "gutenberg" ||
    source.acquiredFromProvider === "hindawi" ||
    source.acquiredFromProvider === "gallica"
      ? source.acquiredFromProvider
      : undefined;

  return {
    id: bookId,
    ...(asNonEmptyString(source.source, 64)
      ? { source: asNonEmptyString(source.source, 64) }
      : {}),
    ...(asNonEmptyString(source.ownerUid, 128)
      ? { ownerUid: asNonEmptyString(source.ownerUid, 128) }
      : {}),
    authorId: asNonEmptyString(source.authorId, 256),
    ...(asNonEmptyString(source.title, 300)
      ? { title: asNonEmptyString(source.title, 300) }
      : {}),
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
      asNonEmptyString(source.descriptionEn, 5000) ||
      asNonEmptyString(source.description, 5000),
    descriptionAr: asNonEmptyString(source.descriptionAr, 5000),
    ...(asNonEmptyString(source.description, 5000)
      ? { description: asNonEmptyString(source.description, 5000) }
      : {}),
    genresEn: asStringArray(source.genresEn, 120, 30),
    genresAr: asStringArray(source.genresAr, 120, 30),
    rating: asNonNegativeNumber(source.rating),
    ratingsCount: asNonNegativeInt(source.ratingsCount),
    semanticGraphEligible,
    ...(readerAuthority ? { readerAuthority } : {}),
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
    ...(typeof source.pageCount === "number" &&
    Number.isFinite(source.pageCount) &&
    source.pageCount >= 0
      ? { pageCount: Math.trunc(source.pageCount) }
      : {}),
    ...(typeof toCreatedAtMillis(source.createdAt) === "number"
      ? { createdAt: toCreatedAtMillis(source.createdAt) }
      : {}),
    rawBook: sanitizeRawBookForCatalog(source),
    ...(asNonEmptyString(source.ebookAttachmentId, 256)
      ? { ebookAttachmentId: asNonEmptyString(source.ebookAttachmentId, 256) }
      : {}),
    ...(asNonEmptyString(source.ebookStoragePath, 2048)
      ? { ebookStoragePath: asNonEmptyString(source.ebookStoragePath, 2048) }
      : {}),
    ...(source.downloadable === true ? { downloadable: true } : {}),
    ...(providerExternalIds.length > 0 ? { providerExternalIds } : {}),
    ...(externalReadableSources ? { externalReadableSources } : {}),
    ...(acquiredFromProvider ? { acquiredFromProvider } : {}),
  };
}

export function isPublicReadableBook(book: Record<string, unknown>): boolean {
  const visibility = asNonEmptyString(book.visibility, 32) || "public";
  const rightsMode = asNonEmptyString(book.rightsMode, 32) || "public_free";
  return visibility === "public" && rightsMode !== "private";
}
