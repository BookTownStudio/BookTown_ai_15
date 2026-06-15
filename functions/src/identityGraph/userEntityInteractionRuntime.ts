import { admin } from "../firebaseAdmin";
import {
  createAuthorEntityRef,
  createQuoteEntityRef,
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityPlatformPrivacyTier,
  type EntityPlatformWeightClass,
  type LiteraryEntityRef,
  type UserEntityInteraction,
  type UserEntityInteractionLifecycleState,
  type UserEntityInteractionSourceSurface,
  type UserEntityInteractionType,
} from "../contracts/shared/entityPlatform";

export const USER_ENTITY_INTERACTIONS_COLLECTION = "user_entity_interactions";

type VisibilityInput = "public" | "followers" | "private" | "unlisted" | "restricted" | string | undefined;

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
  readonly lifecycleState?: Extract<UserEntityInteractionLifecycleState, "recorded" | "withdrawn">;
}

export interface ReviewInteractionInput extends BaseInteractionInput {
  readonly bookId: string;
  readonly reviewId: string;
  readonly visibility?: VisibilityInput;
  readonly lifecycleState?: Extract<UserEntityInteractionLifecycleState, "recorded" | "withdrawn" | "deleted">;
}

export interface QuoteInteractionInput extends BaseInteractionInput {
  readonly quoteId: string;
  readonly bookId?: string;
  readonly isPublic?: boolean;
}

export interface BookmarkInteractionInput extends BaseInteractionInput {
  readonly entityType: "book" | "author" | "quote";
  readonly entityId: string;
  readonly lifecycleState?: Extract<UserEntityInteractionLifecycleState, "recorded" | "withdrawn">;
}

export interface SearchClickInteractionInput extends BaseInteractionInput {
  readonly bookId: string;
  readonly searchSessionId?: string;
  readonly resultId?: string;
  readonly clickedRank?: number;
}

export interface SocialAttachmentInteractionInput extends BaseInteractionInput {
  readonly entityType: "book" | "author" | "quote";
  readonly entityId: string;
  readonly sourceSurface: Extract<UserEntityInteractionSourceSurface, "social_post" | "message">;
  readonly sourceId: string;
  readonly visibility?: VisibilityInput;
}

export interface AuthorFollowInteractionInput extends BaseInteractionInput {
  readonly authorId: string;
  readonly lifecycleState?: Extract<UserEntityInteractionLifecycleState, "recorded" | "withdrawn">;
}

type FirestoreWriter = {
  set: (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>, options: { merge: true }) => unknown;
};

function normalizeIdPart(value: string): string {
  return value.trim().replace(/[/:]/g, "_").slice(0, 190);
}

function visibilityToPrivacyTier(visibility: VisibilityInput): EntityPlatformPrivacyTier {
  if (visibility === "public") return "public";
  if (visibility === "followers") return "followers";
  return "private";
}

function entityRefForBookmark(input: BookmarkInteractionInput): LiteraryEntityRef {
  if (input.entityType === "book") return createWorkEntityRef(input.entityId);
  if (input.entityType === "author") return createAuthorEntityRef(input.entityId);
  return createQuoteEntityRef(input.entityId);
}

function entityRefForStructuredAttachment(input: SocialAttachmentInteractionInput): LiteraryEntityRef {
  if (input.entityType === "book") return createWorkEntityRef(input.entityId);
  if (input.entityType === "author") return createAuthorEntityRef(input.entityId);
  return createQuoteEntityRef(input.entityId);
}

export function isIdentityGraphEligibleTier1Ref(ref: LiteraryEntityRef): boolean {
  if (ref.entityType !== "work" && ref.entityType !== "author" && ref.entityType !== "quote") {
    return false;
  }
  if (ref.authorityState !== "canonical" && ref.authorityState !== "enriched") {
    return false;
  }
  if (ref.mergeTarget) {
    return false;
  }
  if (ref.entityType === "work") return ref.authoritySource === "work_authority";
  if (ref.entityType === "author") return ref.authoritySource === "author_authority";
  return ref.authoritySource === "quote_authority";
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
  readonly lifecycleState?: UserEntityInteractionLifecycleState;
  readonly idempotencyKey?: string;
  readonly evidence?: readonly string[];
}): UserEntityInteraction {
  if (!isIdentityGraphEligibleTier1Ref(params.entityRef)) {
    throw new Error("Identity Graph interaction requires an active canonical Tier-1 entity ref.");
  }

  const lifecycleState = params.lifecycleState ?? "recorded";
  const lifecycleKey = lifecycleState === "recorded" ? "" : `:${lifecycleState}`;
  const interactionId = [
    normalizeIdPart(params.sourceSystem),
    normalizeIdPart(params.uid),
    normalizeIdPart(params.sourceId),
    normalizeIdPart(params.interactionType),
  ].join(":") + lifecycleKey;

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
    lifecycleState,
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
    lifecycleState: input.lifecycleState ?? "recorded",
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
    lifecycleState: input.lifecycleState ?? "recorded",
    idempotencyKey: input.idempotencyKey,
  });
}

export function toQuoteInteraction(input: QuoteInteractionInput): UserEntityInteraction {
  const entityRef = input.bookId ? createWorkEntityRef(input.bookId) : createQuoteEntityRef(input.quoteId);
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

export function toBookmarkInteraction(input: BookmarkInteractionInput): UserEntityInteraction {
  return createInteraction({
    uid: input.uid,
    entityRef: entityRefForBookmark(input),
    interactionType: "bookmarking",
    sourceSurface: "profile",
    sourceSystem: "bookmark",
    sourceId: `${input.entityType}:${input.entityId}`,
    occurredAt: input.occurredAt,
    privacyTier: "private",
    weightClass: "durable",
    lifecycleState: input.lifecycleState ?? "recorded",
    idempotencyKey: input.idempotencyKey,
  });
}

export function toSearchClickInteraction(input: SearchClickInteractionInput): UserEntityInteraction {
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

export function toSocialAttachmentInteraction(input: SocialAttachmentInteractionInput): UserEntityInteraction {
  return createInteraction({
    uid: input.uid,
    entityRef: entityRefForStructuredAttachment(input),
    interactionType: "discussing",
    sourceSurface: input.sourceSurface,
    sourceSystem: input.sourceSurface === "message" ? "dm_attachment" : "social_attachment",
    sourceId: input.sourceId,
    occurredAt: input.occurredAt,
    privacyTier: visibilityToPrivacyTier(input.visibility),
    weightClass: "expressive",
    idempotencyKey: input.idempotencyKey,
  });
}

export function toAuthorFollowInteraction(input: AuthorFollowInteractionInput): UserEntityInteraction {
  return createInteraction({
    uid: input.uid,
    entityRef: createAuthorEntityRef(input.authorId),
    interactionType: "following",
    sourceSurface: "author_details",
    sourceSystem: "author_follow",
    sourceId: input.authorId,
    occurredAt: input.occurredAt,
    privacyTier: "private",
    weightClass: "durable",
    lifecycleState: input.lifecycleState ?? "recorded",
    idempotencyKey: input.idempotencyKey,
  });
}

export function writeUserEntityInteraction(
  writer: FirestoreWriter,
  db: FirebaseFirestore.Firestore,
  interaction: UserEntityInteraction
): void {
  const ref = db.collection(USER_ENTITY_INTERACTIONS_COLLECTION).doc(interaction.interactionId);
  writer.set(
    ref,
    {
      ...interaction,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      version: 1,
    },
    { merge: true }
  );
}

export async function writeUserEntityInteractionDirect(
  db: FirebaseFirestore.Firestore,
  interaction: UserEntityInteraction
): Promise<void> {
  const ref = db.collection(USER_ENTITY_INTERACTIONS_COLLECTION).doc(interaction.interactionId);
  await ref.set(
    {
      ...interaction,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      version: 1,
    },
    { merge: true }
  );
}
