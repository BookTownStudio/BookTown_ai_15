import type { AttachmentRef, AttachmentTypeV1, AttachmentV1, PostAttachment } from "./entities.ts";

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
