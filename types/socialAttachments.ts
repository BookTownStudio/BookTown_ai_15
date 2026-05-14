import type {
  AttachmentRef,
  AttachmentTypeV1,
  AttachmentV1,
  HydratedSocialEntity,
  PostAttachment,
} from "./entities.ts";

export type StructuredPostAttachmentType =
  | "book"
  | "author"
  | "quote"
  | "shelf"
  | "venue"
  | "publication";

export type StructuredPostCreateAttachmentDTO = {
  type: StructuredPostAttachmentType;
  entityId: string;
  entityOwnerId?: string;
};

export type MediaPostCreateAttachmentDTO = {
  attachmentId: string;
  type: string;
};

export type PostCreateAttachmentDTO =
  | StructuredPostCreateAttachmentDTO
  | MediaPostCreateAttachmentDTO;

export interface PostCreateDTO {
  content: { text: string };
  attachments: PostCreateAttachmentDTO[];
  visibility?: "public" | "followers" | "private" | "restricted";
  publishToken: string;
}

const readText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

export const normalizeAttachmentTypeV1 = (value: unknown): AttachmentTypeV1 => {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (
    normalized === "IMAGE" ||
    normalized === "AUDIO" ||
    normalized === "VIDEO" ||
    normalized === "DOCUMENT" ||
    normalized === "LINK" ||
    normalized === "BOOK_REFERENCE" ||
    normalized === "QUOTE_REFERENCE"
  ) {
    return normalized;
  }
  return "DOCUMENT";
};

export function buildAttachmentV1RuntimeRef(params: {
  attachmentId: string;
  type: unknown;
  createdAt?: unknown;
  uploaderUid?: unknown;
}): AttachmentV1 {
  const attachmentId = readText(params.attachmentId);
  const type = normalizeAttachmentTypeV1(params.type);
  return {
    attachmentId,
    type,
    metadata: {
      attachmentId,
      type,
      mimeType: "application/octet-stream",
      size: 0,
      createdAt: readText(params.createdAt),
      uploader: { uid: readText(params.uploaderUid) },
      storagePath: "",
    },
    payload: {},
    immutable: true,
  };
}

export function buildRuntimeAttachmentFromRef(
  ref: AttachmentRef,
  context: { createdAt?: unknown; uploaderUid?: unknown } = {}
): AttachmentV1 | null {
  const attachmentId = readText(ref.attachmentId);
  if (!attachmentId) return null;
  return buildAttachmentV1RuntimeRef({
    attachmentId,
    type: ref.type,
    createdAt: context.createdAt,
    uploaderUid: context.uploaderUid,
  });
}

export function buildStructuredPostCreateAttachment(
  type: StructuredPostAttachmentType,
  entityId: string,
  entityOwnerId?: string
): StructuredPostCreateAttachmentDTO {
  const normalizedEntityId = entityId.trim();
  if (!normalizedEntityId) {
    throw new Error("Structured post attachment requires entityId.");
  }

  const normalizedOwnerId = entityOwnerId?.trim();
  return {
    type,
    entityId: normalizedEntityId,
    ...(normalizedOwnerId ? { entityOwnerId: normalizedOwnerId } : {}),
  };
}

export function buildBookPostAttachment(params: {
  bookId: string;
  title?: unknown;
  titleEn?: unknown;
  titleAr?: unknown;
  author?: unknown;
  authorEn?: unknown;
  authorAr?: unknown;
  coverUrl?: unknown;
  rating?: unknown;
}): Extract<PostAttachment, { type: "book" }> {
  const bookId = readText(params.bookId);
  return {
    type: "book",
    bookId,
    bookTitle: readText(params.titleEn) || readText(params.title) || readText(params.titleAr) || "Book",
    bookAuthor: readText(params.authorEn) || readText(params.author) || readText(params.authorAr),
    bookCover: readText(params.coverUrl),
    bookRating: readNumber(params.rating),
  };
}

export function buildAuthorPostAttachment(params: {
  authorId: string;
  name?: unknown;
  nameEn?: unknown;
  nameAr?: unknown;
  avatarUrl?: unknown;
  authorPhoto?: unknown;
  country?: unknown;
  countryEn?: unknown;
  countryAr?: unknown;
  signatureQuote?: unknown;
}): Extract<PostAttachment, { type: "author" }> {
  return {
    type: "author",
    authorId: readText(params.authorId),
    authorName: readText(params.nameEn) || readText(params.name) || readText(params.nameAr) || "Author",
    authorPhoto: readText(params.avatarUrl) || readText(params.authorPhoto),
    ...(readText(params.countryEn) || readText(params.country) || readText(params.countryAr)
      ? { authorCountry: readText(params.countryEn) || readText(params.country) || readText(params.countryAr) }
      : {}),
    ...(readText(params.signatureQuote) ? { signatureQuote: readText(params.signatureQuote) } : {}),
  };
}

export function buildShelfPostAttachment(params: {
  shelfId: string;
  ownerId?: unknown;
  title?: unknown;
  titleEn?: unknown;
  titleAr?: unknown;
  bookCount?: unknown;
  covers?: unknown;
}): Extract<PostAttachment, { type: "shelf" }> {
  const covers = Array.isArray(params.covers)
    ? params.covers.filter((cover): cover is string => typeof cover === "string" && cover.trim().length > 0)
    : [];

  return {
    type: "shelf",
    shelfId: readText(params.shelfId),
    ownerId: readText(params.ownerId),
    shelfName: readText(params.titleEn) || readText(params.title) || readText(params.titleAr) || "Shelf",
    bookCount: Math.max(0, Math.trunc(readNumber(params.bookCount))),
    covers,
  };
}

export function buildQuotePostAttachment(params: {
  quoteId: string;
  quoteOwnerId?: unknown;
  quoteText?: unknown;
}): Extract<PostAttachment, { type: "quote" }> {
  return {
    type: "quote",
    quoteId: readText(params.quoteId),
    ...(readText(params.quoteOwnerId) ? { quoteOwnerId: readText(params.quoteOwnerId) } : {}),
    ...(readText(params.quoteText) ? { quoteText: readText(params.quoteText) } : {}),
  };
}

export function buildPublicationPostAttachment(params: {
  publicationId: string;
  title?: unknown;
  coverUrl?: unknown;
  author?: unknown;
  canonicalSlug?: unknown;
}): Extract<PostAttachment, { type: "publication" }> {
  return {
    type: "publication",
    publicationId: readText(params.publicationId),
    ...(readText(params.title) ? { title: readText(params.title) } : {}),
    ...(readText(params.coverUrl) ? { coverUrl: readText(params.coverUrl) } : {}),
    ...(readText(params.author) ? { author: readText(params.author) } : {}),
    ...(readText(params.canonicalSlug) ? { canonicalSlug: readText(params.canonicalSlug) } : {}),
  };
}

const structuredTypes = new Set<StructuredPostAttachmentType>([
  "book",
  "author",
  "quote",
  "shelf",
  "venue",
  "publication",
]);

function normalizeStructuredAttachmentType(value: unknown): StructuredPostAttachmentType | null {
  const normalized = readText(value).toLowerCase();
  return structuredTypes.has(normalized as StructuredPostAttachmentType)
    ? (normalized as StructuredPostAttachmentType)
    : null;
}

const readCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : null;

function resolveShelfBookCount(data: Record<string, unknown>): number {
  const direct =
    readCount(data.bookCount) ??
    readCount(data.itemsCount) ??
    readCount(data.totalBooks) ??
    readCount((data.counters as Record<string, unknown> | undefined)?.totalBooks);
  if (direct !== null) return direct;

  if (data.entries && typeof data.entries === "object") {
    return Object.keys(data.entries as Record<string, unknown>).length;
  }

  if (Array.isArray(data.bookIds)) {
    return data.bookIds.filter((id) => readText(id).length > 0).length;
  }

  return Array.isArray(data.books) ? data.books.length : 0;
}

function resolveShelfCovers(data: Record<string, unknown>): string[] {
  const direct = Array.isArray(data.covers)
    ? data.covers.filter((cover): cover is string => readText(cover).length > 0)
    : [];
  if (direct.length > 0) return direct.slice(0, 4);

  const entries = data.entries && typeof data.entries === "object"
    ? Object.values(data.entries as Record<string, unknown>)
    : [];

  const covers: string[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const entryObj = entry as Record<string, unknown>;
    const snapshot = entryObj.snapshot && typeof entryObj.snapshot === "object"
      ? (entryObj.snapshot as Record<string, unknown>)
      : {};
    const cover = readText(snapshot.coverUrl) || readText(entryObj.coverUrl);
    if (!cover) continue;
    covers.push(cover);
    if (covers.length >= 4) break;
  }
  return covers;
}

function attachmentIdentity(attachment: PostAttachment): string {
  if ("attachmentId" in attachment) return readText(attachment.attachmentId);
  if (attachment.type === "book") return readText(attachment.bookId);
  if (attachment.type === "author") return readText(attachment.authorId);
  if (attachment.type === "quote") return readText(attachment.quoteId);
  if (attachment.type === "shelf") return readText(attachment.shelfId);
  if (attachment.type === "venue") return readText(attachment.venueId);
  if (attachment.type === "publication") return readText(attachment.publicationId);
  if (attachment.type === "post") return readText(attachment.postId);
  if (attachment.type === "user") return readText(attachment.userId);
  return "";
}

function buildStructuredRuntimeAttachment(params: {
  ref: AttachmentRef;
  entityId: string;
  authorId?: unknown;
  hydratedEntity?: HydratedSocialEntity | null;
}): PostAttachment | null {
  const refType = normalizeStructuredAttachmentType(params.ref.type);
  if (!refType || !params.entityId) return null;

  const hydrated = params.hydratedEntity;
  const hydratedType = normalizeStructuredAttachmentType(hydrated?.type);
  const hydratedId = readText(hydrated?.id);
  if (!hydrated || hydratedType !== refType || hydratedId !== params.entityId) {
    return null;
  }

  const data = hydrated.data && typeof hydrated.data === "object" ? hydrated.data : {};

  if (refType === "book") {
    return buildBookPostAttachment({
      bookId: params.entityId,
      titleEn: data.titleEn,
      titleAr: data.titleAr,
      authorEn: data.authorEn,
      authorAr: data.authorAr,
      coverUrl: data.coverUrl,
      rating: data.rating,
    });
  }

  if (refType === "author") {
    return buildAuthorPostAttachment({
      authorId: params.entityId,
      nameEn: data.nameEn,
      nameAr: data.nameAr,
      avatarUrl: data.avatarUrl,
      countryEn: data.countryEn,
      countryAr: data.countryAr,
    });
  }

  if (refType === "quote") {
    return buildQuotePostAttachment({
      quoteId: params.entityId,
      quoteOwnerId: hydrated.ownerId || data.ownerId || params.ref.entityOwnerId || params.authorId,
      quoteText: data.textEn || data.textAr,
    });
  }

  if (refType === "shelf") {
    return buildShelfPostAttachment({
      shelfId: params.entityId,
      ownerId: data.ownerId || params.ref.entityOwnerId || params.authorId,
      titleEn: data.titleEn,
      titleAr: data.titleAr,
      bookCount: resolveShelfBookCount(data),
      covers: resolveShelfCovers(data),
    });
  }

  if (refType === "venue") {
    return { type: "venue", venueId: params.entityId };
  }

  return buildPublicationPostAttachment({
    publicationId: params.entityId,
    title: data.title,
    coverUrl: data.coverUrl,
    author: data.authorDisplayName || data.author,
    canonicalSlug: data.canonicalSlug,
  });
}

export function resolveCanonicalPostAttachments(post: {
  authorId?: unknown;
  createdAt?: unknown;
  timestamps?: { createdAt?: unknown } | null;
  primaryEntityType?: unknown;
  primaryEntityId?: unknown;
  hydratedEntity?: HydratedSocialEntity | null;
  content?: { attachments?: AttachmentRef[] | null } | null;
  attachments?: PostAttachment[];
}): PostAttachment[] {
  const refs = Array.isArray(post.content?.attachments) ? post.content!.attachments! : [];
  if (refs.length === 0) return [];

  const hydratedAttachments = Array.isArray(post.attachments) ? post.attachments : [];
  const hydratedEntity = post.hydratedEntity ?? null;
  const primaryType = normalizeStructuredAttachmentType(post.primaryEntityType);
  const primaryId = readText(post.primaryEntityId);
  const createdAt = post.timestamps?.createdAt ?? post.createdAt;

  return refs
    .map((ref): PostAttachment | null => {
      const attachmentId = readText(ref.attachmentId);
      const refType = normalizeStructuredAttachmentType(ref.type);
      const entityId = readText(ref.entityId) || (primaryType === refType ? primaryId : "") || attachmentId;

      const existing = hydratedAttachments.find((attachment) => {
        const identity = attachmentIdentity(attachment);
        return identity && (identity === attachmentId || identity === entityId);
      });
      if (existing) return existing;

      if (refType) {
        return buildStructuredRuntimeAttachment({
          ref,
          entityId,
          authorId: post.authorId,
          hydratedEntity,
        });
      }

      return buildRuntimeAttachmentFromRef(ref, {
        createdAt,
        uploaderUid: post.authorId,
      });
    })
    .filter((attachment): attachment is PostAttachment => attachment !== null);
}

export function toPostCreateAttachmentDTO(
  attachment: PostAttachment
): PostCreateAttachmentDTO {
  if ("attachmentId" in attachment) {
    const media = attachment as AttachmentV1;
    return {
      attachmentId: media.attachmentId,
      type: media.type,
    };
  }

  switch (attachment.type) {
    case "book":
      return buildStructuredPostCreateAttachment("book", attachment.bookId);
    case "author":
      return buildStructuredPostCreateAttachment("author", attachment.authorId);
    case "quote":
      return buildStructuredPostCreateAttachment("quote", attachment.quoteId, attachment.quoteOwnerId);
    case "shelf":
      return buildStructuredPostCreateAttachment("shelf", attachment.shelfId, attachment.ownerId);
    case "venue":
      return buildStructuredPostCreateAttachment("venue", attachment.venueId);
    case "publication":
      return buildStructuredPostCreateAttachment("publication", attachment.publicationId);
    default:
      throw new Error(`Unsupported post attachment type: ${attachment.type}`);
  }
}
