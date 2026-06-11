import {
  createQuoteEntityRef,
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityPlatformPrivacyTier,
  type EntityPlatformWeightClass,
  type LiteraryEntityRef,
  type UserEntityInteraction,
  type UserEntityInteractionSourceSurface,
  type UserEntityInteractionType,
} from "../../../contracts/entityPlatform";
import type { Bookmark, PostAttachment } from "../../../types/entities.ts";
import {
  toEntitySummaryFromPostAttachment,
  toLiteraryEntityRefFromBookmark,
} from "../../../types/entityPlatformCompatibility.ts";

type VisibilityInput = "public" | "followers" | "private" | "unlisted" | string | undefined;

interface BaseInteractionInput {
  readonly uid: string;
  readonly occurredAt: string;
  readonly idempotencyKey?: string;
}

export interface ReadingInteractionInput extends BaseInteractionInput {
  readonly bookId: string;
  readonly progress?: number;
  readonly sourceId?: string;
}

export interface ShelfInteractionInput extends BaseInteractionInput {
  readonly bookId: string;
  readonly shelfId: string;
  readonly visibility?: VisibilityInput;
}

export interface ReviewInteractionInput extends BaseInteractionInput {
  readonly bookId: string;
  readonly reviewId: string;
  readonly visibility?: VisibilityInput;
}

export interface QuoteInteractionInput extends BaseInteractionInput {
  readonly quoteId: string;
  readonly bookId?: string;
  readonly isPublic?: boolean;
}

export interface BookmarkInteractionInput extends BaseInteractionInput {
  readonly bookmark: Pick<Bookmark, "type" | "entityId">;
}

export interface SearchClickInteractionInput extends BaseInteractionInput {
  readonly bookId: string;
  readonly searchSessionId?: string;
  readonly resultId?: string;
  readonly clickedRank?: number;
}

export interface SocialAttachmentInteractionInput extends BaseInteractionInput {
  readonly attachment: PostAttachment;
  readonly postId: string;
  readonly visibility?: VisibilityInput;
}

function visibilityToPrivacyTier(visibility: VisibilityInput): EntityPlatformPrivacyTier {
  if (visibility === "public") return "public";
  if (visibility === "followers") return "followers";
  return "private";
}

function createInteraction(params: {
  readonly uid: string;
  readonly entityRef: LiteraryEntityRef;
  readonly interactionType: UserEntityInteractionType;
  readonly sourceSurface: UserEntityInteractionSourceSurface;
  readonly sourceSystem: string;
  readonly sourceId: string;
  readonly occurredAt: string;
  readonly privacyTier: EntityPlatformPrivacyTier;
  readonly weightClass: EntityPlatformWeightClass;
  readonly idempotencyKey?: string;
  readonly evidence?: readonly string[];
}): UserEntityInteraction {
  const interactionId = `${params.sourceSystem}:${params.uid}:${params.sourceId}:${params.interactionType}`;

  return {
    interactionId,
    uid: params.uid,
    entityRef: params.entityRef,
    interactionType: params.interactionType,
    sourceSurface: params.sourceSurface,
    provenance: {
      sourceClass: "system",
      sourceSystem: params.sourceSystem,
      sourceId: params.sourceId,
      ...(params.evidence ? { evidence: params.evidence } : {}),
    },
    privacyTier: params.privacyTier,
    lifecycleState: "recorded",
    weightClass: params.weightClass,
    occurredAt: params.occurredAt,
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
  };
}

export function toReadingInteraction(input: ReadingInteractionInput): UserEntityInteraction {
  const sourceId = input.sourceId || input.bookId;
  return createInteraction({
    uid: input.uid,
    entityRef: createWorkEntityRef(input.bookId),
    interactionType: "reading",
    sourceSurface: "reader",
    sourceSystem: "reader",
    sourceId,
    occurredAt: input.occurredAt,
    privacyTier: "private",
    weightClass: "active",
    idempotencyKey: input.idempotencyKey,
    evidence: typeof input.progress === "number" ? [`progress:${input.progress}`] : undefined,
  });
}

export function toShelfInteraction(input: ShelfInteractionInput): UserEntityInteraction {
  return createInteraction({
    uid: input.uid,
    entityRef: createWorkEntityRef(input.bookId),
    interactionType: "shelving",
    sourceSurface: "shelf",
    sourceSystem: "shelf",
    sourceId: `${input.shelfId}:${input.bookId}`,
    occurredAt: input.occurredAt,
    privacyTier: visibilityToPrivacyTier(input.visibility),
    weightClass: "durable",
    idempotencyKey: input.idempotencyKey,
  });
}

export function toReviewInteraction(input: ReviewInteractionInput): UserEntityInteraction {
  return createInteraction({
    uid: input.uid,
    entityRef: createWorkEntityRef(input.bookId),
    interactionType: "reviewing",
    sourceSurface: "book_details",
    sourceSystem: "review",
    sourceId: input.reviewId,
    occurredAt: input.occurredAt,
    privacyTier: visibilityToPrivacyTier(input.visibility),
    weightClass: "expressive",
    idempotencyKey: input.idempotencyKey,
  });
}

export function toQuoteInteraction(input: QuoteInteractionInput): UserEntityInteraction {
  const entityRef = input.bookId
    ? createWorkEntityRef(input.bookId)
    : createQuoteEntityRef(input.quoteId);

  return createInteraction({
    uid: input.uid,
    entityRef,
    interactionType: "quoting",
    sourceSurface: "quote_details",
    sourceSystem: "quote",
    sourceId: input.quoteId,
    occurredAt: input.occurredAt,
    privacyTier: input.isPublic === true ? "public" : "private",
    weightClass: "expressive",
    idempotencyKey: input.idempotencyKey,
  });
}

export function toBookmarkInteraction(
  input: BookmarkInteractionInput
): UserEntityInteraction | null {
  const entityRef = toLiteraryEntityRefFromBookmark(input.bookmark);
  if (!entityRef) return null;

  return createInteraction({
    uid: input.uid,
    entityRef,
    interactionType: "bookmarking",
    sourceSurface: "profile",
    sourceSystem: "bookmark",
    sourceId: `${input.bookmark.type}:${input.bookmark.entityId}`,
    occurredAt: input.occurredAt,
    privacyTier: "private",
    weightClass: "durable",
    idempotencyKey: input.idempotencyKey,
  });
}

export function toSearchClickInteraction(
  input: SearchClickInteractionInput
): UserEntityInteraction {
  const sourceId = input.resultId || input.bookId;
  return createInteraction({
    uid: input.uid,
    entityRef: createWorkEntityRef(input.bookId),
    interactionType: "searching",
    sourceSurface: "search",
    sourceSystem: "search_click",
    sourceId,
    occurredAt: input.occurredAt,
    privacyTier: "private",
    weightClass: "passive",
    idempotencyKey: input.idempotencyKey,
    evidence:
      typeof input.clickedRank === "number"
        ? [`clickedRank:${Math.trunc(input.clickedRank)}`]
        : undefined,
  });
}

export function toSocialAttachmentInteraction(
  input: SocialAttachmentInteractionInput
): UserEntityInteraction | null {
  const entityRef = toEntitySummaryFromPostAttachment(input.attachment)?.ref ?? null;
  if (!entityRef) return null;

  return createInteraction({
    uid: input.uid,
    entityRef,
    interactionType: "discussing",
    sourceSurface: "social_post",
    sourceSystem: "social_attachment",
    sourceId: input.postId,
    occurredAt: input.occurredAt,
    privacyTier: visibilityToPrivacyTier(input.visibility),
    weightClass: "expressive",
    idempotencyKey: input.idempotencyKey,
  });
}
