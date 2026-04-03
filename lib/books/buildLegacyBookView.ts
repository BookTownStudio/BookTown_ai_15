import type { Book } from "../../types/entities.ts";

type LegacyBookSeed = Partial<Book> & {
  id?: unknown;
  bookId?: unknown;
  title?: unknown;
  author?: unknown;
  categories?: unknown;
  hasEbook?: unknown;
  cover?: unknown;
};

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string");
}

function readExternalReadableSources(
  value: unknown
): Book["externalReadableSources"] | undefined {
  if (!Array.isArray(value)) return undefined;

  const normalized = value
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
      const providerExternalId = readString(raw.providerExternalId);
      const trust = raw.trust === "trusted" ? "trusted" : null;

      if (!provider || !providerExternalId || !trust) {
        return null;
      }

      const lendingEditionId = readString(raw.lendingEditionId);
      const lendingIdentifier = readString(raw.lendingIdentifier);

      return {
        provider,
        providerExternalId,
        ...(lendingEditionId ? { lendingEditionId } : {}),
        ...(lendingIdentifier ? { lendingIdentifier } : {}),
        trust,
      };
    })
    .filter(
      (
        entry
      ): entry is NonNullable<Book["externalReadableSources"]>[number] => entry !== null
    );

  return normalized.length > 0 ? normalized : undefined;
}

function readFallbackCover(value: unknown): Book["fallbackCover"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const title = readString(raw.title);
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

  const author = readString(raw.author);
  return {
    title,
    ...(author ? { author } : {}),
    theme,
  };
}

export function buildLegacyBookView(seed: LegacyBookSeed): Book {
  const id =
    readString(seed.id)
      || readString(seed.bookId)
      || "unknown_book";

  const titleAlias = readString(seed.title);
  const authorAlias = readString(seed.author);
  const categories = readStringArray(seed.categories);
  const coverRecord =
    seed.cover && typeof seed.cover === "object" && !Array.isArray(seed.cover)
      ? (seed.cover as Record<string, unknown>)
      : null;
  const fallbackCover = readFallbackCover((seed as { fallbackCover?: unknown }).fallbackCover);
  const coverMode =
    (seed as { coverMode?: unknown }).coverMode === "uploaded" ||
    (seed as { coverMode?: unknown }).coverMode === "fallback_metadata"
      ? ((seed as { coverMode: Book["coverMode"] }).coverMode)
      : undefined;

  const titleEn =
    readString(seed.titleEn)
      || titleAlias
      || "Unknown Title";

  const titleAr =
    readString(seed.titleAr)
      || titleEn;

  const authorEn =
    readString(seed.authorEn)
      || authorAlias
      || "Unknown Author";

  const authorAr =
    readString(seed.authorAr)
      || authorEn;

  return {
    id,
    authorId:
      typeof seed.authorId === "string" && seed.authorId.trim().length > 0
        ? seed.authorId.trim()
        : "",
    titleEn,
    titleAr,
    authorEn,
    authorAr,
    coverUrl:
      readString(seed.coverUrl)
        || readString(coverRecord?.medium)
        || readString(coverRecord?.large)
        || readString(coverRecord?.original)
        || readString(coverRecord?.small)
        || "",
    ...(coverMode ? { coverMode } : {}),
    ...(fallbackCover ? { fallbackCover } : {}),
    descriptionEn:
      typeof seed.descriptionEn === "string"
        ? seed.descriptionEn
        : typeof seed.description === "string"
          ? seed.description
          : "",
    descriptionAr:
      typeof seed.descriptionAr === "string" ? seed.descriptionAr : "",
    genresEn: Array.isArray(seed.genresEn) ? seed.genresEn : categories || [],
    genresAr: Array.isArray(seed.genresAr) ? seed.genresAr : [],
    rating:
      typeof seed.rating === "number" && Number.isFinite(seed.rating)
        ? seed.rating
        : 0,
    ratingsCount:
      typeof seed.ratingsCount === "number" && Number.isFinite(seed.ratingsCount)
        ? Math.max(0, Math.trunc(seed.ratingsCount))
        : 0,
    isEbookAvailable: seed.isEbookAvailable === true || seed.hasEbook === true,
    ...(titleAlias
      ? { title: titleAlias }
      : {}),
    ...(Array.isArray(seed.authors) ? { authors: seed.authors } : {}),
    ...(Array.isArray(seed.bookCovers) ? { bookCovers: seed.bookCovers } : {}),
    ...(typeof seed.description === "string" ? { description: seed.description } : {}),
    ...(typeof seed.reviewCount === "number" && Number.isFinite(seed.reviewCount)
      ? { reviewCount: Math.max(0, Math.trunc(seed.reviewCount)) }
      : {}),
    ...(typeof seed.publicationDate === "string" && seed.publicationDate.trim().length > 0
      ? { publicationDate: seed.publicationDate.trim() }
      : {}),
    ...(typeof seed.pageCount === "number" && Number.isFinite(seed.pageCount)
      ? { pageCount: Math.max(0, Math.trunc(seed.pageCount)) }
      : {}),
    ...(typeof seed.createdAt === "number" && Number.isFinite(seed.createdAt)
      ? { createdAt: seed.createdAt }
      : {}),
    ...(seed.rawBook ? { rawBook: seed.rawBook } : {}),
    ...(typeof seed.ebookAttachmentId === "string" && seed.ebookAttachmentId.trim().length > 0
      ? { ebookAttachmentId: seed.ebookAttachmentId.trim() }
      : {}),
    ...(typeof seed.ebookStoragePath === "string" && seed.ebookStoragePath.trim().length > 0
      ? { ebookStoragePath: seed.ebookStoragePath.trim() }
      : {}),
    ...(seed.downloadable === true ? { downloadable: true } : {}),
    ...(readStringArray((seed as { providerExternalIds?: unknown }).providerExternalIds)
      ? {
          providerExternalIds: readStringArray(
            (seed as { providerExternalIds?: unknown }).providerExternalIds
          ),
        }
      : {}),
    ...(readExternalReadableSources(
      (seed as { externalReadableSources?: unknown }).externalReadableSources
    )
      ? {
          externalReadableSources: readExternalReadableSources(
            (seed as { externalReadableSources?: unknown }).externalReadableSources
          ),
        }
      : {}),
    ...(((seed as { acquiredFromProvider?: unknown }).acquiredFromProvider === 'openLibrary' ||
      (seed as { acquiredFromProvider?: unknown }).acquiredFromProvider === 'gutenberg' ||
      (seed as { acquiredFromProvider?: unknown }).acquiredFromProvider === 'hindawi' ||
      (seed as { acquiredFromProvider?: unknown }).acquiredFromProvider === 'gallica')
      ? {
          acquiredFromProvider: (seed as {
            acquiredFromProvider: Book['acquiredFromProvider'];
          }).acquiredFromProvider,
        }
      : {}),
  };
}
