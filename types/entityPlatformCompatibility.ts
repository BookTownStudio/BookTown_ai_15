import {
  createAuthorEntityRef,
  createPublicationEntityRef,
  createQuoteEntityRef,
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntitySummary,
  type LiteraryEntityRef,
} from "../contracts/entityPlatform";
import type { Bookmark, DirectMessage, PostAttachment } from "./entities.ts";

type SupportedCompatEntityType = "book" | "author" | "quote" | "publication";

const readText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readIdentity = (value: unknown): string =>
  typeof value === "string" && value.trim().length > 0 ? value : "";

const isSupportedCompatEntityType = (value: unknown): value is SupportedCompatEntityType => {
  return value === "book" || value === "author" || value === "quote" || value === "publication";
};

export function toLiteraryEntityRefFromCompatIdentity(params: {
  type: unknown;
  entityId: unknown;
}): LiteraryEntityRef | null {
  const entityType = readText(params.type).toLowerCase();
  const entityId = readIdentity(params.entityId);
  if (!entityId || !isSupportedCompatEntityType(entityType)) return null;

  if (entityType === "book") return createWorkEntityRef(entityId);
  if (entityType === "author") return createAuthorEntityRef(entityId);
  if (entityType === "quote") return createQuoteEntityRef(entityId);
  return createPublicationEntityRef(entityId);
}

export function toEntitySummaryFromCompatIdentity(params: {
  type: unknown;
  entityId: unknown;
  title?: unknown;
  subtitle?: unknown;
  imageUrl?: unknown;
}): EntitySummary | null {
  const ref = toLiteraryEntityRefFromCompatIdentity(params);
  if (!ref) return null;

  const title = readText(params.title) || readText(ref.displayHint) || defaultTitleForRef(ref);
  const subtitle = readText(params.subtitle);
  const imageUrl = readText(params.imageUrl);
  return {
    ref,
    title,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    ...(subtitle ? { subtitle } : {}),
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
    navigation: "openable",
  };
}

export function toEntitySummaryFromPostAttachment(attachment: PostAttachment): EntitySummary | null {
  if ("attachmentId" in attachment) {
    const payload = attachment.payload && typeof attachment.payload === "object"
      ? attachment.payload as Record<string, unknown>
      : {};
    if (attachment.type === "BOOK_REFERENCE") {
      return toEntitySummaryFromCompatIdentity({
        type: "book",
        entityId: payload.entityId || payload.bookId,
        title: payload.title || payload.titleEn || payload.titleAr,
        subtitle: payload.author || payload.authorEn || payload.authorAr,
        imageUrl: payload.coverUrl,
      });
    }
    if (attachment.type === "QUOTE_REFERENCE") {
      return toEntitySummaryFromCompatIdentity({
        type: "quote",
        entityId: payload.entityId || payload.quoteId,
        title: payload.quoteText || payload.textEn || payload.textAr,
        subtitle: payload.source || payload.sourceEn || payload.sourceAr,
      });
    }
    return null;
  }

  if (attachment.type === "book") {
    return toEntitySummaryFromCompatIdentity({
      type: "book",
      entityId: attachment.bookId,
      title: attachment.bookTitle,
      subtitle: attachment.bookAuthor,
      imageUrl: attachment.bookCover,
    });
  }
  if (attachment.type === "author") {
    return toEntitySummaryFromCompatIdentity({
      type: "author",
      entityId: attachment.authorId,
      title: attachment.authorName,
      subtitle: attachment.authorCountry,
      imageUrl: attachment.authorPhoto,
    });
  }
  if (attachment.type === "quote") {
    return toEntitySummaryFromCompatIdentity({
      type: "quote",
      entityId: attachment.quoteId,
      title: attachment.quoteText,
    });
  }
  if (attachment.type === "publication") {
    return toEntitySummaryFromCompatIdentity({
      type: "publication",
      entityId: attachment.publicationId,
      title: attachment.title,
      subtitle: attachment.author,
      imageUrl: attachment.coverUrl,
    });
  }

  return null;
}

export function toEntitySummaryFromDirectMessageAttachment(
  attachment: DirectMessage["attachment"]
): EntitySummary | null {
  if (!attachment) return null;
  return toEntitySummaryFromCompatIdentity({
    type: attachment.type,
    entityId: attachment.entityId,
    title: attachment.title || attachment.quoteText,
    subtitle: attachment.author,
    imageUrl: attachment.coverUrl,
  });
}

export function toLiteraryEntityRefFromBookmark(bookmark: Pick<Bookmark, "type" | "entityId">): LiteraryEntityRef | null {
  return toLiteraryEntityRefFromCompatIdentity({
    type: bookmark.type,
    entityId: bookmark.entityId,
  });
}

export function toEntitySummaryFromBookmark(bookmark: Pick<Bookmark, "type" | "entityId">): EntitySummary | null {
  return toEntitySummaryFromCompatIdentity({
    type: bookmark.type,
    entityId: bookmark.entityId,
  });
}

function defaultTitleForRef(ref: LiteraryEntityRef): string {
  if (ref.entityType === "work") return "Book";
  if (ref.entityType === "author") return "Author";
  if (ref.entityType === "quote") return "Quote";
  if (ref.entityType === "publication") return "Publication";
  return ref.entityId;
}
