import { z } from "zod";
import { errorCodeSchema } from "./errorCodes";

const contractErrorSchema = z
  .object({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z.unknown().optional(),
  })
  .strict();

const failureEnvelopeSchema = z
  .object({
    success: z.literal(false),
    error: contractErrorSchema,
  })
  .strict();

const successEnvelope = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z
    .object({
      success: z.literal(true),
      data: dataSchema,
    })
    .strict();

const postVisibilitySchema = z.enum([
  "public",
  "followers",
  "private",
  "restricted",
]);

const reviewVisibilitySchema = z.enum(["public", "private"]);
const reviewDomainSchema = z.literal("book");
const recommendationOriginSchema = z
  .object({
    source: z.literal("librarian"),
    suggestionSessionId: z.string().min(1).max(96),
    suggestionId: z.string().min(1).max(96),
    rankPosition: z.number().int().min(1).max(5),
    mode: z
      .enum([
        "Reinforcement",
        "AdjacentExpansion",
        "StructuredContrast",
        "HighConfidencePrecision",
        "ReReadingReflection",
      ]),
  })
  .strict();

const renderSurfaceSchema = z.enum([
  "home",
  "feed",
  "drawer",
  "read",
  "write",
]);

const moderationActionSchema = z.enum([
  "dismiss",
  "hide",
  "restrict",
  "soft_delete",
  "hard_delete",
]);

const moderationStageSchema = z.enum([
  "under_review",
  "action_taken",
  "dismissed",
]);

const attachmentAnalyticsEventSchema = z.enum([
  "attachment_created",
  "attachment_uploaded",
  "attachment_rendered",
  "attachment_opened",
  "attachment_downloaded",
  "attachment_deleted",
  "attachment_failed",
]);

const socialAttachmentSchema = z
  .object({
    attachmentId: z.string().min(1),
    type: z.string().min(1),
  })
  .strict();

const primaryStructuredEntityTypeSchema = z.enum([
  "book",
  "author",
  "quote",
  "shelf",
  "venue",
  "publication",
]);

const createStructuredAttachmentSchema = z
  .object({
    type: primaryStructuredEntityTypeSchema,
    entityId: z.string().min(1),
    entityOwnerId: z.string().min(1).optional(),
  })
  .strict();

const createSocialPostAttachmentSchema = z.union([
  socialAttachmentSchema,
  createStructuredAttachmentSchema,
]);

const socialAttachmentParentTypeSchema = z.enum([
  "posts",
  "projects",
  "drafts",
]);

const socialUploadAttachmentTypeSchema = z.enum([
  "IMAGE",
  "DOCUMENT",
]);

const readerInsightsDataSchema = z
  .object({
    currentlyReading: z.array(
      z
        .object({
          bookId: z.string().min(1),
          progress: z.number().min(0).max(1),
          lastPosition: z.unknown().nullable(),
          lastActiveAt: z.unknown().optional(),
        })
        .strict()
    ),
    finishedCount: z.number().int().nonnegative(),
    totalReadingTimeSeconds: z.number().int().nonnegative(),
    currentStreakDays: z.number().int().nonnegative(),
    longestStreakDays: z.number().int().nonnegative(),
  })
  .strict();

const canonicalAnchorV1Schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("epub_point"),
      manifestVersion: z.number().int().positive(),
      locationId: z.string().min(1),
      spineItemId: z.string().min(1),
      cfi: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("epub_range"),
      manifestVersion: z.number().int().positive(),
      startLocationId: z.string().min(1),
      endLocationId: z.string().min(1),
      spineItemId: z.string().min(1),
      startCfi: z.string().min(1),
      endCfi: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("pdf_point"),
      manifestVersion: z.number().int().positive(),
      locationId: z.string().min(1),
      pageIndex: z.number().int().nonnegative(),
      textOffset: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("pdf_range"),
      manifestVersion: z.number().int().positive(),
      startLocationId: z.string().min(1),
      endLocationId: z.string().min(1),
      pageIndex: z.number().int().nonnegative(),
      startOffset: z.number().int().nonnegative(),
      endOffset: z.number().int().nonnegative(),
      quote: z.string(),
      prefix: z.string(),
      suffix: z.string(),
    })
    .strict(),
]);

const searchBookSchema = z
  .object({
    id: z.string().min(1),
    editionId: z.string().min(1),
    bookId: z.string().min(1),
    externalId: z.string(),
    source: z.enum(["booktown", "googleBooks", "openLibrary"]),
    resultType: z.enum(["canonical", "external"]),
    title: z.string().min(1),
    titleEn: z.string().min(1),
    titleAr: z.string(),
    authors: z.array(z.string().min(1)).min(1),
    authorEn: z.string().min(1),
    authorAr: z.string(),
    description: z.string(),
    descriptionEn: z.string(),
    descriptionAr: z.string(),
    coverUrl: z.string(),
    language: z.string().min(2).max(8),
    hasEbook: z.boolean(),
    downloadable: z.boolean(),
    isEbookAvailable: z.boolean(),
    confidence: z.number().min(0).max(1),
    rank: z.number().int().nonnegative(),
    rawBook: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

// Canonical quote contract:
// - `id` is the authoritative canonical quote identity used by new reads/writes.
// - `canonicalQuoteId` remains transitional compatibility metadata.
// - `legacyQuoteId` remains transitional only for mirror-backed compatibility flows.
// - `ownerId` is metadata, not quote identity.
const quoteSchema = z
  .object({
    id: z.string().min(1),
    canonicalQuoteId: z.string().min(1).optional(),
    legacyQuoteId: z.string().min(1).optional(),
    ownerId: z.string().min(1),
    textEn: z.string().min(1),
    textAr: z.string().min(1),
    sourceEn: z.string().min(1),
    sourceAr: z.string().min(1),
    bookId: z.string().min(1).optional(),
    authorId: z.string().min(1).optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    provenance: z
      .object({
        sourceType: z.enum(["book", "author", "manual"]),
        verificationStatus: z.enum([
          "unverified",
          "canonical_linked",
          "saved_reference",
        ]),
        sourceBookId: z.string().min(1).optional(),
        sourceAuthorId: z.string().min(1).optional(),
        savedFromOwnerId: z.string().min(1).optional(),
        savedFromQuoteId: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const publicProfileSchema = z
  .object({
    uid: z.string().min(1),
    name: z.string().min(1).max(80),
    handle: z.string().min(2).max(40),
    avatarUrl: z.string().max(2048),
    bannerUrl: z.string().max(2048),
    bioEn: z.string().max(500),
    bioAr: z.string().max(500),
    joinDate: z.string().min(1),
    updatedAt: z.string().min(1),
    followers: z.number().int().nonnegative(),
    following: z.number().int().nonnegative(),
  })
  .strict();

const shelfVisibilitySchema = z.enum(["public", "unlisted", "private"]);

const shelfCopiedFromSchema = z
  .object({
    shelfId: z.string().min(1),
    ownerId: z.string().min(1),
    createdAt: z.string().min(1).optional(),
    copiedAt: z.string().min(1).optional(),
  })
  .strict();

const shelfSchema = z
  .object({
    id: z.string().min(1),
    ownerId: z.string().min(1),
    titleEn: z.string().min(1).max(120),
    titleAr: z.string().min(1).max(120),
    descriptionEn: z.string().max(280).optional(),
    descriptionAr: z.string().max(280).optional(),
    entries: z.record(z.string(), z.record(z.string(), z.unknown())),
    orderedBookIds: z.array(z.string().min(1)).optional(),
    userCoverUrl: z.string().min(1).nullable().optional(),
    visibility: shelfVisibilitySchema,
    bookCount: z.number().int().nonnegative(),
    isSystem: z.boolean(),
    copiedFrom: shelfCopiedFromSchema.optional(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();

const userStatsSchema = z
  .object({
    followers: z.number().int().nonnegative(),
    following: z.number().int().nonnegative(),
    postsPublished: z.number().int().nonnegative(),
    shelvesCreated: z.number().int().nonnegative(),
    quotesAuthored: z.number().int().nonnegative(),
    posts: z.number().int().nonnegative(),
    reviews: z.number().int().nonnegative(),
    booksRead: z.number().int().nonnegative(),
    booksPublished: z.number().int().nonnegative(),
    wordsWritten: z.number().int().nonnegative(),
    profileCompletionScore: z.number().int().nonnegative().optional(),
  })
  .strict();

const profileAttachmentRefSchema = z
  .object({
    attachmentId: z.string().min(1),
    entityId: z.string().min(1).optional(),
    entityOwnerId: z.string().min(1).optional(),
    type: z.string().min(1),
    role: z.string().min(1),
    renderHint: z.string().min(1),
  })
  .strict();

const hydratedSocialEntitySchema = z
  .object({
    type: primaryStructuredEntityTypeSchema,
    id: z.string().min(1),
    ownerId: z.string().min(1).optional(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();

const profilePostSchema = z
  .object({
    id: z.string().min(1),
    authorId: z.string().min(1),
    authorName: z.string().min(1),
    authorHandle: z.string().min(2),
    authorAvatar: z.string().max(2048),
    content: z
      .object({
        text: z.string().nullable(),
        attachments: z.array(profileAttachmentRefSchema),
      })
      .strict(),
    visibility: postVisibilitySchema,
    status: z.literal("published"),
    counters: z
      .object({
        likes: z.number().int().nonnegative(),
        comments: z.number().int().nonnegative(),
        reposts: z.number().int().nonnegative(),
        bookmarks: z.number().int().nonnegative(),
      })
      .strict(),
    timestamps: z
      .object({
        createdAt: z.string().min(1),
        updatedAt: z.string().nullable(),
        publishedAt: z.string().nullable(),
      })
      .strict(),
    flags: z
      .object({
        edited: z.boolean(),
        hasAttachments: z.boolean(),
      })
      .strict(),
    primaryEntityType: primaryStructuredEntityTypeSchema.nullable().optional(),
    primaryEntityId: z.string().min(1).nullable().optional(),
    hydratedEntity: hydratedSocialEntitySchema.nullable().optional(),
  })
  .strict();

const profileReviewSchema = z
  .object({
    id: z.string().min(1),
    domain: reviewDomainSchema,
    visibility: reviewVisibilitySchema,
    bookId: z.string().min(1),
    bookTitleEn: z.string().max(300).optional(),
    bookTitleAr: z.string().max(300).optional(),
    bookAuthorEn: z.string().max(300).optional(),
    bookAuthorAr: z.string().max(300).optional(),
    bookCoverThumbUrl: z.string().max(2048).optional(),
    bookCoverUrl: z.string().max(2048).optional(),
    userId: z.string().min(1),
    rating: z.number().int().min(1).max(5),
    text: z.string().max(2000),
    authorName: z.string().max(120),
    authorHandle: z.string().max(120),
    authorAvatar: z.string().max(2048),
    timestamp: z.string().min(1),
    upvotes: z.number().int().nonnegative(),
    downvotes: z.number().int().nonnegative(),
    commentsCount: z.number().int().nonnegative(),
  })
  .strict();

const bookReviewSchema = profileReviewSchema;

const profileBookSchema = z
  .object({
    id: z.string().min(1),
    authorId: z.string().min(1),
    titleEn: z.string().max(300),
    titleAr: z.string().max(300),
    authorEn: z.string().max(300),
    authorAr: z.string().max(300),
    descriptionEn: z.string().max(5000),
    descriptionAr: z.string().max(5000),
    coverUrl: z.string().max(2048),
    rating: z.number().nonnegative(),
    ratingsCount: z.number().int().nonnegative(),
    isEbookAvailable: z.boolean(),
    genresEn: z.array(z.string().max(120)).max(30),
    genresAr: z.array(z.string().max(120)).max(30),
    publicationDate: z.string().max(64).nullable(),
    pageCount: z.number().int().nonnegative().nullable(),
    ebookAttachmentId: z.string().max(256).optional(),
  })
  .strict();

const profilePublicationSchema = z
  .object({
    id: z.string().min(1),
    entityType: z.enum(["blog", "ebook"]),
    title: z.string().min(1).max(300),
    publicationType: z.string().min(1).max(64),
    publishedAt: z.string().min(1),
    coverUrl: z.string().max(2048).optional(),
    canonicalSlug: z.string().min(1).max(160).optional(),
    publicationId: z.string().min(1).max(128).optional(),
    bookId: z.string().min(1).max(128).optional(),
  })
  .strict();

const socialSearchTypeSchema = z.enum(["users", "posts", "topics"]);

const socialSearchAttachmentRefSchema = z
  .object({
    attachmentId: z.string().min(1),
    entityId: z.string().min(1).optional(),
    entityOwnerId: z.string().min(1).optional(),
    type: z.string().min(1),
    role: z.string().min(1),
    renderHint: z.string().min(1),
  })
  .strict();

const socialSearchUserSchema = z
  .object({
    uid: z.string().min(1),
    name: z.string().min(1).max(80),
    handle: z.string().min(2).max(40),
    avatarUrl: z.string().max(2048),
    bannerUrl: z.string().max(2048),
    bioEn: z.string().max(500),
    bioAr: z.string().max(500),
    joinDate: z.string().min(1),
    updatedAt: z.string().min(1),
    followers: z.number().int().nonnegative(),
    following: z.number().int().nonnegative(),
    score: z.number(),
    rankReasons: z.array(z.string().min(1)).max(6),
  })
  .strict();

const socialSearchPostSchema = z
  .object({
    id: z.string().min(1),
    authorId: z.string().min(1),
    authorName: z.string().min(1),
    authorHandle: z.string().min(2),
    authorAvatar: z.string().max(2048),
    content: z
      .object({
        text: z.string().nullable(),
        attachments: z.array(socialSearchAttachmentRefSchema),
      })
      .strict(),
    visibility: z.literal("public"),
    status: z.literal("published"),
    counters: z
      .object({
        likes: z.number().int().nonnegative(),
        comments: z.number().int().nonnegative(),
        reposts: z.number().int().nonnegative(),
        bookmarks: z.number().int().nonnegative(),
      })
      .strict(),
    timestamps: z
      .object({
        createdAt: z.string().min(1),
        updatedAt: z.string().nullable(),
        publishedAt: z.string().nullable(),
        deletedAt: z.string().nullable().optional(),
      })
      .strict(),
    flags: z
      .object({
        edited: z.boolean(),
        hasAttachments: z.boolean(),
      })
      .strict(),
    primaryEntityType: primaryStructuredEntityTypeSchema.nullable().optional(),
    primaryEntityId: z.string().min(1).nullable().optional(),
    hydratedEntity: hydratedSocialEntitySchema.nullable().optional(),
    score: z.number(),
    rankReasons: z.array(z.string().min(1)).max(6),
  })
  .strict();

const socialCommentSchema = z
  .object({
    id: z.string().min(1),
    authorId: z.string().min(1),
    authorName: z.string().min(1),
    authorHandle: z.string().min(2),
    authorAvatar: z.string().max(2048),
    text: z.string().min(1),
    createdAt: z.string().min(1),
    parentId: z.string().nullable(),
    likesCount: z.number().int().nonnegative(),
    liked: z.boolean(),
  })
  .strict();

const socialSearchTopicSchema = z
  .object({
    topic: z.string().min(1),
    postCount: z.number().int().nonnegative(),
    score: z.number(),
  })
  .strict();

const profileUpdatePayloadSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    bioEn: z.string().max(500).optional(),
    bioAr: z.string().max(500).optional(),
    avatarUrl: z.string().max(2048).optional(),
    bannerUrl: z.string().max(2048).optional(),
    aiConsent: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one profile field must be provided.",
  });

const writeProjectStatusSchema = z.enum([
  "Idea",
  "Draft",
  "Revision",
  "Final",
]);

const writeProjectWorkTypeSchema = z.enum([
  "book",
  "article",
  "journal",
]);

const writeMarkSchema = z
  .object({
    type: z.enum(["bold", "italic", "underline"]),
  })
  .strict();

const writeContentNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "paragraph",
        "heading",
        "blockquote",
        "bulletList",
        "orderedList",
        "listItem",
        "horizontalRule",
        "text",
      ]),
      attrs: z
        .object({
          level: z.number().int().min(1).max(3).optional(),
          lang: z.string().min(2).max(12).optional(),
          dir: z.enum(["ltr", "rtl"]).optional(),
          langManual: z.boolean().optional(),
          journalEntryDate: z.string().min(1).max(64).optional(),
        })
        .strict()
        .optional(),
      text: z.string().max(20_000).optional(),
      marks: z.array(writeMarkSchema).max(8).optional(),
      content: z.array(writeContentNodeSchema).max(2000).optional(),
    })
    .strict()
);

const writeContentDocSchema = z
  .object({
    version: z.literal(1),
    type: z.literal("doc"),
    content: z.array(writeContentNodeSchema).max(5000),
    plainText: z.string().max(2_000_000).optional(),
  })
  .strict();

const normalizedManuscriptBlockSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      type: z.enum([
        "paragraph",
        "heading",
        "blockquote",
        "bulletList",
        "orderedList",
        "listItem",
        "text",
      ]),
      attrs: z
        .object({
          level: z.number().int().min(1).max(3).optional(),
          lang: z.string().min(2).max(12).optional(),
          dir: z.enum(["ltr", "rtl"]).optional(),
          langManual: z.boolean().optional(),
        })
        .strict()
        .optional(),
      text: z.string().max(20_000).optional(),
      marks: z
        .array(
          z
            .object({
              type: z.enum(["bold", "italic", "underline"]),
            })
            .strict()
        )
        .max(8)
        .optional(),
      content: z.array(normalizedManuscriptBlockSchema).max(2000).optional(),
    })
    .strict()
);

const normalizedManuscriptSchema = z
  .object({
    units: z
      .array(
        z
          .object({
            index: z.number().int().positive(),
            title: z.string().min(1).max(240),
            type: z.enum(["chapter", "section"]),
            content: z.array(normalizedManuscriptBlockSchema).max(5000),
          })
          .strict()
      )
      .min(1)
      .max(1000),
  })
  .strict();

const writeProjectUpdatesSchema = z
  .object({
    titleEn: z.string().min(1).max(180).optional(),
    titleAr: z.string().min(1).max(180).optional(),
    content: z.string().max(2_000_000).optional(),
    contentDoc: writeContentDocSchema.optional(),
    wordCount: z.number().int().nonnegative().optional(),
    status: writeProjectStatusSchema.optional(),
    workType: writeProjectWorkTypeSchema.optional(),
    typeEn: z.string().min(1).max(80).optional(),
    typeAr: z.string().min(1).max(80).optional(),
    coverUrl: z.string().url().max(2048).optional(),
    lastCursorBlockId: z.string().min(1).max(64).optional(),
    lastCursorOffset: z.number().int().nonnegative().optional(),
    lastCursorSavedAt: z.string().min(1).max(128).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one writable field must be provided.",
  });

const canonicalCoverModeSchema = z.enum(["uploaded", "fallback_metadata"]);

const canonicalFallbackCoverSchema = z
  .object({
    title: z.string().min(1).max(180),
    author: z.string().min(1).max(180).optional(),
    theme: z.enum(["ink", "emerald", "gold", "plum"]),
  })
  .strict();

const directConversationSchema = z
  .object({
    id: z.string().min(1),
    contactId: z.string().min(1),
    contactName: z.string().min(1).max(120),
    contactAvatar: z.string().max(2048),
    lastMessage: z.string().max(2000),
    timestamp: z.string().min(1),
    unreadCount: z.number().int().nonnegative(),
  })
  .strict();

// DM quote attachments use canonical `entityId`.
// `quoteOwnerId` is optional compatibility metadata only.
const directMessageSchema = z
  .object({
    id: z.string().min(1),
    senderId: z.string().min(1),
    text: z.string().max(2000),
    attachment: z
      .object({
        type: z.enum(["book", "publication", "quote"]),
        entityId: z.string().min(1),
        title: z.string().max(300).optional(),
        author: z.string().max(300).optional(),
        coverUrl: z.string().max(2048).optional(),
        canonicalSlug: z.string().min(1).max(160).optional(),
        quoteOwnerId: z.string().min(1).max(128).optional(),
        quoteText: z.string().max(600).optional(),
      })
      .strict()
      .optional(),
    timestamp: z.string().min(1),
    readByPeer: z.boolean().optional(),
    seenAt: z.string().min(1).optional(),
  })
  .strict();

const defineContract = <Req extends z.ZodTypeAny, Data extends z.ZodTypeAny>(
  requestSchema: Req,
  dataSchema: Data,
  transport: "httpsCallable" | "rest",
  meta: {
    method?: "GET" | "POST";
    route?: string;
    callSites: readonly string[];
  }
) => ({
  transport,
  method: meta.method,
  route: meta.route,
  callSites: meta.callSites,
  requestSchema,
  responseSchema: successEnvelope(dataSchema),
  errorSchema: failureEnvelopeSchema,
});

export const apiContracts = {
  callable: {
    createDefaultShelves: defineContract(
      z.unknown(),
      z
        .object({
          ok: z.boolean(),
          created: z.array(z.string()),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    listUserShelves: defineContract(
      z
        .object({
          uid: z.string().min(1),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .strict(),
      z
        .object({
          items: z.array(shelfSchema),
          hasMore: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseDbService.ts", "lib/hooks/useUserShelves.ts"],
      }
    ),

    getShelf: defineContract(
      z
        .object({
          shelfId: z.string().min(1),
        })
        .strict(),
      shelfSchema,
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useShelfDetails.ts",
        ],
      }
    ),

    createShelf: defineContract(
      z
        .object({
          titleEn: z.string().min(1).max(120),
          titleAr: z.string().min(1).max(120),
          visibility: shelfVisibilitySchema.optional(),
        })
        .strict(),
      shelfSchema,
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useCreateShelf.ts",
        ],
      }
    ),

    updateShelf: defineContract(
      z
        .object({
          shelfId: z.string().min(1),
          updates: z
            .object({
              titleEn: z.string().min(1).max(120).optional(),
              titleAr: z.string().min(1).max(120).optional(),
              descriptionEn: z.string().max(280).optional(),
              descriptionAr: z.string().max(280).optional(),
              userCoverUrl: z.string().max(2048).nullable().optional(),
              visibility: shelfVisibilitySchema.optional(),
            })
            .strict(),
        })
        .strict(),
      z
        .object({
          shelfId: z.string().min(1),
          updated: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useUpdateShelf.ts",
          "lib/actions/shelfActions.ts",
        ],
      }
    ),

    deleteShelf: defineContract(
      z
        .object({
          shelfId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          shelfId: z.string().min(1),
          deleted: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useDeleteShelf.ts",
          "lib/actions/shelfActions.ts",
        ],
      }
    ),

    duplicateShelf: defineContract(
      z
        .object({
          sourceShelfId: z.string().min(1),
          titleEn: z.string().min(1).max(120).optional(),
          titleAr: z.string().min(1).max(120).optional(),
        })
        .strict(),
      shelfSchema,
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useDuplicateShelf.ts",
          "app/shelf-details.tsx",
        ],
      }
    ),

    addBookToShelf: defineContract(
      z
        .object({
          shelfId: z.string().min(1),
          bookId: z.string().min(1),
          snapshot: z
            .object({
              titleEn: z.string().nullable().optional(),
              titleAr: z.string().nullable().optional(),
              coverUrl: z.string().nullable().optional(),
            })
            .strict()
            .optional(),
          recommendationContext: recommendationOriginSchema.optional(),
        })
        .strict(),
      z
        .object({
          ok: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseDbService.ts"],
      }
    ),

    removeBookFromShelf: defineContract(
      z
        .object({
          shelfId: z.string().min(1),
          bookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          ok: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseDbService.ts"],
      }
    ),

    createDirectConversation: defineContract(
      z
        .object({
          peerUid: z.string().min(1),
        })
        .strict(),
      z
        .object({
          conversationId: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useMessenger.ts", "app/drawer/profile.tsx"],
      }
    ),

    listDirectConversations: defineContract(
      z
        .object({
          limit: z.number().int().positive().max(50).optional(),
        })
        .strict()
        .optional(),
      z
        .object({
          conversations: z.array(directConversationSchema),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useMessenger.ts", "services/firebaseDbService.ts"],
      }
    ),

    listDirectMessages: defineContract(
      z
        .object({
          conversationId: z.string().min(1),
          limit: z.number().int().positive().max(200).optional(),
        })
        .strict(),
      z
        .object({
          messages: z.array(directMessageSchema),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useMessenger.ts", "services/firebaseDbService.ts"],
      }
    ),

    sendDirectMessage: defineContract(
      z
        .object({
          conversationId: z.string().min(1),
          text: z.string().max(2000).optional(),
          attachment: z
            .object({
              type: z.enum(["book", "publication", "quote"]),
              entityId: z.string().min(1),
            })
            .strict()
            .optional(),
          idempotencyKey: z
            .string()
            .regex(/^[A-Za-z0-9_-]{8,96}$/),
        })
        .strict(),
      z
        .object({
          conversationId: z.string().min(1),
          messageId: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useMessenger.ts", "services/firebaseDbService.ts"],
      }
    ),

    markDirectConversationRead: defineContract(
      z
        .object({
          conversationId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          conversationId: z.string().min(1),
          unreadCount: z.number().int().nonnegative(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useMessenger.ts", "app/messenger/[id].tsx"],
      }
    ),

    getPublicProfile: defineContract(
      z
        .object({
          uid: z.string().min(1),
        })
        .strict(),
      publicProfileSchema,
      "httpsCallable",
      {
        callSites: ["services/firebaseDbService.ts"],
      }
    ),

    getProfileStats: defineContract(
      z
        .object({
          uid: z.string().min(1),
        })
        .strict(),
      userStatsSchema,
      "httpsCallable",
      {
        callSites: ["services/firebaseDbService.ts", "lib/hooks/useUserStats.ts"],
      }
    ),

    updateOwnProfile: defineContract(
      z
        .object({
          updates: profileUpdatePayloadSchema,
        })
        .strict(),
      z
        .object({
          updated: z.boolean(),
          changedFields: z.array(z.string().min(1)),
          updatedAt: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseDbService.ts"],
      }
    ),

    followUser: defineContract(
      z
        .object({
          targetUid: z.string().min(1),
        })
        .strict(),
      z
        .object({
          targetUid: z.string().min(1),
          following: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseDbService.ts"],
      }
    ),

    unfollowUser: defineContract(
      z
        .object({
          targetUid: z.string().min(1),
        })
        .strict(),
      z
        .object({
          targetUid: z.string().min(1),
          following: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseDbService.ts"],
      }
    ),

    getSuggestedProfiles: defineContract(
      z
        .object({
          limit: z.number().int().min(1).max(30).optional(),
        })
        .strict()
        .optional(),
      z.array(publicProfileSchema),
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useSuggestedProfiles.ts",
        ],
      }
    ),

    searchSocial: defineContract(
      z
        .object({
          query: z.string().min(2).max(64),
          cursor: z.string().min(1).max(1024).optional(),
          limit: z.number().int().min(1).max(20).optional(),
          types: z.array(socialSearchTypeSchema).min(1).max(3).optional(),
        })
        .strict(),
      z
        .object({
          rankingVersion: z.literal("social_v1"),
          queryHash: z.string().length(64),
          users: z.array(socialSearchUserSchema),
          posts: z.array(socialSearchPostSchema),
          topics: z.array(socialSearchTopicSchema),
          hasMore: z.boolean(),
          nextCursor: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useSocialSearch.ts",
        ],
      }
    ),

    listProfilePosts: defineContract(
      z
        .object({
          uid: z.string().min(1),
          limit: z.number().int().min(1).max(30).optional(),
        })
        .strict(),
      z
        .object({
          items: z.array(profilePostSchema),
          hasMore: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useUserProfilePosts.ts",
        ],
      }
    ),

    listProfileReviews: defineContract(
      z
        .object({
          uid: z.string().min(1),
          limit: z.number().int().min(1).max(30).optional(),
          cursor: z.string().min(1).max(96).optional(),
        })
        .strict(),
      z
        .object({
          items: z.array(profileReviewSchema),
          hasMore: z.boolean(),
          nextCursor: z.string().min(1).max(96).optional(),
          revision: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useUserProfileReviews.ts",
        ],
      }
    ),

    runReviewStackReleaseGate: defineContract(
      z
        .object({
          uid: z.string().min(1).optional(),
          expectedRevision: z.string().min(1).max(64).optional(),
        })
        .strict()
        .optional(),
      z
        .object({
          revision: z.string().min(1),
          smokeUid: z.string().min(1),
          smokeCount: z.number().int().nonnegative(),
          requiredIndexes: z.string().min(1),
          queryDiagnostics: z.array(
            z
              .object({
                name: z.string().min(1),
                status: z.enum(["pass", "fail"]),
                queryShape: z.string().min(1),
                indexHint: z.string().min(1),
                errorCode: z.string().min(1).optional(),
                errorMessage: z.string().min(1).optional(),
              })
              .strict()
          ),
          passed: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    listBookReviews: defineContract(
      z
        .object({
          bookId: z.string().min(1),
          limit: z.number().int().min(1).max(50).optional(),
          cursor: z.string().min(1).max(96).optional(),
        })
        .strict(),
      z
        .object({
          items: z.array(bookReviewSchema),
          hasMore: z.boolean(),
          nextCursor: z.string().min(1).max(96).optional(),
          revision: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "lib/services/firebaseCatalogService.ts",
          "lib/hooks/useBookReviews.ts",
        ],
      }
    ),

    upsertBookReview: defineContract(
      z
        .object({
          bookId: z.string().min(1),
          rating: z.number().int().min(1).max(5),
          text: z.string().min(1).max(2000),
          visibility: reviewVisibilitySchema.optional(),
          recommendationContext: recommendationOriginSchema.optional(),
        })
        .strict(),
      z
        .object({
          reviewId: z.string().min(1),
          bookId: z.string().min(1),
          uid: z.string().min(1),
          visibility: reviewVisibilitySchema,
          created: z.boolean(),
          updatedAt: z.string().min(1),
          revision: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "lib/services/firebaseCatalogService.ts",
          "lib/hooks/useSubmitReview.ts",
        ],
      }
    ),

    deleteBookReview: defineContract(
      z
        .object({
          bookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          deleted: z.boolean(),
          bookId: z.string().min(1),
          uid: z.string().min(1),
          revision: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "lib/services/firebaseCatalogService.ts",
          "lib/hooks/useDeleteReview.ts",
        ],
      }
    ),

    listProfileBooks: defineContract(
      z
        .object({
          uid: z.string().min(1),
          limit: z.number().int().min(1).max(30).optional(),
        })
        .strict(),
      z
        .object({
          items: z.array(profileBookSchema),
          hasMore: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useUserProfileBooks.ts",
        ],
      }
    ),

    listProfilePublications: defineContract(
      z
        .object({
          uid: z.string().min(1),
          limit: z.number().int().min(1).max(30).optional(),
        })
        .strict(),
      z
        .object({
          items: z.array(profilePublicationSchema),
          hasMore: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "services/firebaseDbService.ts",
          "lib/hooks/useUserProfilePublications.ts",
        ],
      }
    ),

    ingestAuthor: defineContract(
      z
        .object({
          providerExternalId: z.string().min(1).optional(),
          authorId: z.string().min(1).optional(),
          source: z.enum(["openLibrary", "wikidata"]),
          rawAuthor: z.record(z.string(), z.unknown()),
        })
        .strict()
        .refine(
          (value) =>
            (typeof value.providerExternalId === "string" &&
              value.providerExternalId.trim().length > 0) ||
            (typeof value.authorId === "string" && value.authorId.trim().length > 0),
          {
            message: "providerExternalId_or_authorId_required",
          }
        ),
      z
        .object({
          canonicalAuthorId: z.string().min(1),
          authorId: z.string().min(1),
          canonicalKey: z.string().min(1),
          status: z.string().min(1),
          providerExternalId: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/authors/ensureCanonicalAuthor.ts"],
      }
    ),

    discoverAuthors: defineContract(
      z
        .object({
          query: z.string().min(1).max(120),
          limit: z.number().int().positive().max(12).optional(),
        })
        .strict(),
      z
        .object({
          authors: z.array(
            z
              .object({
                id: z.string().min(1),
                nameEn: z.string().min(1),
                nameAr: z.string().min(1),
                avatarUrl: z.string(),
                bioEn: z.string(),
                bioAr: z.string(),
                lifespan: z.string(),
                countryEn: z.string(),
                countryAr: z.string(),
                languageEn: z.string(),
                languageAr: z.string(),
                providerSource: z.enum(["openLibrary", "wikidata"]).optional(),
                providerExternalId: z.string().min(1).optional(),
                requiresCanonicalization: z.boolean().optional(),
              })
              .strict()
          ),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "lib/services/firebaseCatalogService.ts",
          "lib/hooks/useSearchUserAuthors.ts",
        ],
      }
    ),

    backfillAuthorMetadata: defineContract(
      z
        .object({
          dryRun: z.boolean().optional(),
          pageSize: z.number().int().positive().max(100).optional(),
          maxDocs: z.number().int().positive().max(2000).optional(),
          cursorDocId: z.string().min(1).optional(),
        })
        .strict(),
      z
        .object({
          dryRun: z.boolean(),
          processed: z.number().int().nonnegative(),
          enriched: z.number().int().nonnegative(),
          unchanged: z.number().int().nonnegative(),
          skippedNoSource: z.number().int().nonnegative(),
          skippedProviderFetch: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursorDocId: z.string().min(1).optional(),
          previews: z.array(
            z
              .object({
                authorId: z.string().min(1),
                source: z.enum(["openLibrary", "wikidata", "googleBooks"]),
                providerExternalId: z.string().min(1),
                changedFields: z.array(z.string().min(1)),
              })
              .strict()
          ),
          updatedAuthorIds: z.array(z.string().min(1)).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    backfillSeedAuthorSourceMetadata: defineContract(
      z
        .object({
          dryRun: z.boolean().optional(),
          pageSize: z.number().int().positive().max(100).optional(),
          maxDocs: z.number().int().positive().max(5000).optional(),
          cursorDocId: z.string().min(1).optional(),
        })
        .strict(),
      z
        .object({
          dryRun: z.boolean(),
          processed: z.number().int().nonnegative(),
          updated: z.number().int().nonnegative(),
          unchanged: z.number().int().nonnegative(),
          skippedHasProviderIds: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursorDocId: z.string().min(1).optional(),
          previewAuthorIds: z.array(z.string().min(1)),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    ingestBook: defineContract(
      z
        .object({
          providerExternalId: z.string().min(1).optional(),
          bookId: z.string().min(1).optional(),
          source: z.enum(["googleBooks", "openLibrary"]),
          rawBook: z.record(z.string(), z.unknown()),
        })
        .strict()
        .refine(
          (value) =>
            (typeof value.providerExternalId === "string" &&
              value.providerExternalId.trim().length > 0) ||
            (typeof value.bookId === "string" && value.bookId.trim().length > 0),
          {
            message: "providerExternalId_or_bookId_required",
          }
        ),
      z
        .object({
          canonicalBookId: z.string().min(1),
          bookId: z.string().min(1),
          editionId: z.string().min(1).optional(),
          status: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "lib/books/ensureCanonicalBook.ts",
        ],
      }
    ),

    uploadUserBook: defineContract(
      z
        .object({
          shelfId: z.string().min(1),
          fileName: z.string().min(1),
          fileType: z.enum(["epub", "pdf"]),
          fileSize: z
            .number()
            .finite()
            .positive()
            .max(25 * 1024 * 1024),
        })
        .strict(),
      z
        .object({
          bookId: z.string().min(1),
          shelfId: z.string().min(1),
          storagePath: z.string().min(1),
          coverState: z.literal("PENDING"),
          status: z.literal("UPLOADED"),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["components/modals/AddBookModal.tsx"],
      }
    ),

    finalizeUserUpload: defineContract(
      z
        .object({
          bookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          bookId: z.string().min(1),
          status: z.literal("QUEUED"),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/bookUploadService.ts"],
      }
    ),

    startGoodreadsImport: defineContract(
      z
        .object({
          fileName: z.string().min(1).max(255),
          fileSize: z.number().finite().positive().max(25 * 1024 * 1024),
          mimeType: z.string().min(1).max(120).optional(),
          sourceKind: z.enum(["AUTO", "CSV", "DSAR_JSON"]).optional(),
          contentSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
          idempotencyKey: z
            .string()
            .min(8)
            .max(96)
            .regex(/^[A-Za-z0-9_-]+$/),
        })
        .strict(),
      z
        .object({
          importId: z.string().min(1),
          status: z.enum(["UPLOADING"]),
          uploadUrl: z.string().url(),
          uploadMethod: z.literal("PUT"),
          uploadHeaders: z.record(z.string()),
          expiresAt: z.string().min(1),
          existingSession: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseDbService.ts"],
      }
    ),

    finalizeGoodreadsImport: defineContract(
      z
        .object({
          importId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          importId: z.string().min(1),
          status: z.literal("QUEUED"),
          detectedSourceKind: z.enum(["CSV", "DSAR_JSON"]),
          parserVersion: z.literal("gr_import_v2"),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseDbService.ts"],
      }
    ),

    backfillCovers: defineContract(
      z.unknown(),
      z.unknown(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    backfillMissingCovers: defineContract(
      z
        .object({
          dryRun: z.boolean().optional(),
          limit: z.number().int().positive().max(200).optional(),
          startAfterBookId: z.string().min(1).optional(),
        })
        .strict()
        .optional(),
      z
        .object({
          dryRun: z.boolean(),
          scanned: z.number().int().nonnegative(),
          targeted: z.number().int().nonnegative(),
          healthy: z.number().int().nonnegative(),
          skipped: z.number().int().nonnegative(),
          failed: z.number().int().nonnegative(),
          restoredBooks: z.number().int().nonnegative(),
          restoredOriginals: z.number().int().nonnegative(),
          restoredDerived: z.number().int().nonnegative(),
          nextCursor: z.string().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    backfillUserUploadCoverJobs: defineContract(
      z
        .object({
          dryRun: z.boolean().optional(),
          force: z.boolean().optional(),
          limit: z.number().int().positive().max(500).optional(),
          startAfterBookId: z.string().min(1).optional(),
        })
        .strict()
        .optional(),
      z
        .object({
          dryRun: z.boolean(),
          force: z.boolean(),
          scanned: z.number().int().nonnegative(),
          queued: z.number().int().nonnegative(),
          skippedReady: z.number().int().nonnegative(),
          skippedMissingStoragePath: z.number().int().nonnegative(),
          failed: z.number().int().nonnegative(),
          nextCursor: z.string().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    finalizeMetadata: defineContract(
      z
        .object({
          attachmentId: z.string().min(1),
          parentType: z.string().min(1),
          parentId: z.string().min(1),
          purpose: z.string().min(1),
          format: z.string().min(1),
          storagePath: z.string().min(1),
        })
        .strict(),
      z
        .object({
          ok: z.boolean(),
          attachmentId: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseUploadService.ts"],
      }
    ),

    requestEbookOfflineAccess: defineContract(
      z
        .object({
          bookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          bookId: z.string().min(1),
          format: z.enum(["pdf", "epub", "unknown"]),
          signedUrl: z.string().url(),
          expiresAt: z.number().int().positive(),
          checksum: z.string().nullable(),
          maxBytes: z.number().int().positive().nullable(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["app/lib/offline/offlineManager.ts"],
      }
    ),

    requestEbookReadAccess: defineContract(
      z
        .object({
          bookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          signedUrl: z.string().url(),
          expiresAt: z.number().int().positive().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useEbookReaderAccess.ts"],
      }
    ),

    getReaderInsights: defineContract(
      z.union([
        z.undefined(),
        z
          .object({
            bookId: z.string().min(1),
          })
          .strict(),
      ]),
      readerInsightsDataSchema,
      "httpsCallable",
      {
        callSites: ["app/lib/hooks/useReaderInsights.ts"],
      }
    ),

    getOrCreateReadingSession: defineContract(
      z
        .object({
          bookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          signedUrl: z.string().url(),
          resumePage: z.number().int().nonnegative(),
          format: z.enum(["pdf", "epub", "unknown"]),
          resumeAnchor: canonicalAnchorV1Schema.nullable().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["app/reader.tsx"],
      }
    ),

    getReaderManifest: defineContract(
      z
        .object({
          bookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          bookId: z.string().min(1),
          version: z.number().int().positive(),
          pipelineVersion: z.string().min(1),
          format: z.enum(["pdf", "epub", "unknown"]),
          estimatedPageCount: z.number().int().positive().nullable(),
          locationMap: z
            .object({
              version: z.literal("v1"),
              mode: z.enum(["page", "logical"]),
              checkpointUnit: z.enum(["page", "spine_item"]),
              status: z.enum(["pending", "ready"]).optional(),
              docPath: z.string().min(1).optional(),
              anchorSchema: z.literal("canonical_anchor_v1").optional(),
            })
            .strict(),
          searchIndex: z
            .object({
              status: z.enum(["pending", "ready"]),
              docPath: z.string().min(1),
            })
            .strict(),
          highlightAnchors: z
            .object({
              status: z.enum(["pending", "ready"]),
              docPath: z.string().min(1),
            })
            .strict(),
          generatedAtMs: z.number().int().positive(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useReaderManifest.ts"],
      }
    ),

    getAttachmentUrl: defineContract(
      z
        .object({
          attachmentId: z.string().min(1),
          surface: renderSurfaceSchema,
        })
        .strict(),
      z
        .object({
          url: z.string().url(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useAttachmentUrl.ts"],
      }
    ),

    getUploadToken: defineContract(
      z
        .object({
          parentType: socialAttachmentParentTypeSchema,
          parentId: z.string().min(1),
          type: socialUploadAttachmentTypeSchema,
          fileName: z.string().min(1),
          contentType: z.string().min(1),
          size: z.number().int().positive(),
        })
        .strict(),
      z
        .object({
          token: z.string().min(1),
          attachmentId: z.string().min(1),
          uploadUrl: z.string().url(),
          storagePath: z.string().min(1),
          fileName: z.string().min(1),
          purpose: z.string().min(1),
          format: z.string().min(1),
          type: socialUploadAttachmentTypeSchema,
          expiresAt: z.number().int().positive(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseUploadService.ts"],
      }
    ),

    editSocialPost: defineContract(
      z
        .object({
          postId: z.string().min(1),
          text: z.string().min(1).optional(),
          visibility: postVisibilitySchema.optional(),
          attachments: z.array(socialAttachmentSchema).optional(),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useEditPost.ts"],
      }
    ),

    incrementPostView: defineContract(
      z
        .object({
          postId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["components/content/PostCard.tsx"],
      }
    ),

    createSocialPost: defineContract(
      z
        .object({
          content: z
            .object({
              text: z.string().max(5000).optional(),
              attachments: z.array(createSocialPostAttachmentSchema).optional(),
            })
            .strict(),
          attachments: z.array(createSocialPostAttachmentSchema).optional(),
          visibility: postVisibilitySchema.optional(),
          publishToken: z.string().min(1),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
          postId: z.string().min(1),
          isDuplicate: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useCreatePost.ts"],
      }
    ),

    listSocialFeed: defineContract(
      z
        .object({
          scope: z.enum(["explore", "following", "books", "discover"]),
          filters: z
            .array(z.enum(["media", "text", "book", "quote", "project"]))
            .max(5)
            .optional(),
          cursor: z.string().min(1).optional(),
        })
        .strict(),
      z
        .object({
          posts: z.array(profilePostSchema),
          nextCursor: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useSocialFeeds.ts", "services/firebaseDbService.ts"],
      }
    ),

    getSocialPost: defineContract(
      z
        .object({
          postId: z.string().min(1),
        })
        .strict(),
      profilePostSchema,
      "httpsCallable",
      {
        callSites: ["app/social/post-discussion.tsx", "services/firebaseDbService.ts"],
      }
    ),

    listSocialComments: defineContract(
      z
        .object({
          postId: z.string().min(1),
          cursor: z.string().min(1).optional(),
        })
        .strict(),
      z
        .object({
          comments: z.array(socialCommentSchema),
          hasMore: z.boolean(),
          nextCursor: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useThreadComments.ts", "services/firebaseDbService.ts"],
      }
    ),

    restoreSocialPost: defineContract(
      z
        .object({
          postId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useRestorePost.ts"],
      }
    ),

    addSocialComment: defineContract(
      z
        .object({
          postId: z.string().min(1),
          text: z.string().min(1),
          parentId: z.string().min(1).optional(),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
          commentId: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useThreadComments.ts"],
      }
    ),

    likeSocialComment: defineContract(
      z
        .object({
          postId: z.string().min(1),
          commentId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
          liked: z.boolean().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useThreadComments.ts"],
      }
    ),

    deleteSocialComment: defineContract(
      z
        .object({
          postId: z.string().min(1),
          commentId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useThreadComments.ts"],
      }
    ),

    editSocialComment: defineContract(
      z
        .object({
          postId: z.string().min(1),
          commentId: z.string().min(1),
          text: z.string().min(1),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useThreadComments.ts"],
      }
    ),

    transitionModerationStage: defineContract(
      z
        .object({
          reportId: z.string().min(1),
          nextStage: moderationStageSchema,
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useModeration.ts"],
      }
    ),

    applyModerationAction: defineContract(
      z
        .object({
          postId: z.string().min(1),
          action: moderationActionSchema,
          reportId: z.string().min(1).optional(),
          note: z.string().optional(),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useModeration.ts"],
      }
    ),

    likeSocialPost: defineContract(
      z
        .object({
          postId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
          liked: z.boolean().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/usePostInteractions.ts"],
      }
    ),

    repostSocialPost: defineContract(
      z
        .object({
          postId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
          reposted: z.boolean().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/usePostInteractions.ts"],
      }
    ),

    reportSocialPost: defineContract(
      z
        .object({
          postId: z.string().min(1),
          reason: z.string().min(1),
          details: z.string().optional(),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
          alreadyReported: z.boolean().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useReportPost.ts"],
      }
    ),

    reportSocialComment: defineContract(
      z
        .object({
          postId: z.string().min(1),
          commentId: z.string().min(1),
          reason: z.string().min(1),
          note: z.string().optional(),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
          alreadyReported: z.boolean().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useCommentActions.ts"],
      }
    ),

    deleteSocialPost: defineContract(
      z
        .object({
          postId: z.string().min(1),
          type: z.enum(["soft", "hard"]).optional(),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
          mode: z.enum(["soft", "hard"]).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useDeletePost.ts"],
      }
    ),

    listUserQuotes: defineContract(
      z
        .object({
          ownerId: z.string().min(1).optional(),
          limit: z.number().int().positive().max(100).optional(),
          cursor: z.string().min(1).optional(),
          bookId: z.string().min(1).optional(),
          authorId: z.string().min(1).optional(),
          query: z.string().max(120).optional(),
        })
        .strict(),
      z
        .object({
          quotes: z.array(quoteSchema),
          nextCursor: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/quoteService.ts", "lib/hooks/useQuotes.ts"],
      }
    ),

    searchPublicQuotes: defineContract(
      z
        .object({
          limit: z.number().int().positive().max(50).optional(),
          bookId: z.string().min(1).optional(),
          authorId: z.string().min(1).optional(),
          query: z.string().max(120).optional(),
        })
        .strict(),
      z
        .object({
          quotes: z.array(quoteSchema),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/quoteService.ts", "lib/hooks/useDiscoverQuotes.ts"],
      }
    ),

    // Canonical quote read contract:
    // - `quoteId` is the canonical quote identity.
    // - `ownerId` remains optional only for legacy mirror fallback compatibility.
    getQuoteById: defineContract(
      z
        .object({
          quoteId: z.string().min(1),
          ownerId: z.string().min(1).optional(),
        })
        .strict(),
      quoteSchema,
      "httpsCallable",
      {
        callSites: [
          "services/quoteService.ts",
          "lib/hooks/useQuoteDetails.ts",
        ],
      }
    ),

    createQuote: defineContract(
      z
        .object({
          textEn: z.string().min(1).max(2000),
          textAr: z.string().min(1).max(2000),
          sourceEn: z.string().min(1).max(240),
          sourceAr: z.string().min(1).max(240),
          bookId: z.string().min(1).optional(),
          authorId: z.string().min(1).optional(),
          isPublic: z.boolean().optional(),
        })
        .strict(),
      quoteSchema,
      "httpsCallable",
      {
        callSites: ["services/quoteService.ts"],
      }
    ),

    saveQuoteFromReference: defineContract(
      z
        .object({
          sourceOwnerId: z.string().min(1),
          sourceQuoteId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          quote: quoteSchema,
          alreadySaved: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/quoteService.ts", "lib/hooks/useSaveQuote.ts"],
      }
    ),

    // Canonical quote bookmark contract:
    // - `quoteId` is the canonical quote identity.
    // - `quoteOwnerId` remains optional metadata for legacy fallback compatibility only.
    toggleQuoteBookmark: defineContract(
      z
        .object({
          quoteId: z.string().min(1),
          quoteOwnerId: z.string().min(1).optional(),
          active: z.boolean(),
        })
        .strict(),
      z
        .object({
          bookmarked: z.boolean(),
          bookmarkId: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/quoteService.ts", "lib/hooks/useSaveQuote.ts"],
      }
    ),

    createWriteProject: defineContract(
      z
        .object({
          project: z
            .object({
              titleEn: z.string().min(1).max(180).optional(),
              titleAr: z.string().min(1).max(180).optional(),
              content: z.string().max(2_000_000).optional(),
              contentDoc: writeContentDocSchema.optional(),
              wordCount: z.number().int().nonnegative().optional(),
              status: writeProjectStatusSchema.optional(),
              workType: writeProjectWorkTypeSchema.optional(),
              typeEn: z.string().min(1).max(80).optional(),
              typeAr: z.string().min(1).max(80).optional(),
              lastCursorBlockId: z.string().min(1).max(64).optional(),
              lastCursorOffset: z.number().int().nonnegative().optional(),
              lastCursorSavedAt: z.string().min(1).max(128).optional(),
            })
            .strict(),
        })
        .strict(),
      z
        .object({
          id: z.string().min(1),
          canonicalId: z.string().min(1),
          path: z.string().min(1),
          ownerId: z.string().min(1),
          uid: z.string().min(1),
          title: z.string().min(1),
          titleEn: z.string().min(1),
          titleAr: z.string().min(1),
          content: z.string(),
          contentDoc: writeContentDocSchema.optional(),
          wordCount: z.number().int().nonnegative(),
          status: writeProjectStatusSchema,
          workType: writeProjectWorkTypeSchema,
          typeEn: z.string().min(1),
          typeAr: z.string().min(1),
          isPublished: z.boolean(),
          revision: z.number().int().positive(),
          source: z.string().min(1),
          version: z.number().int().positive(),
          createdAt: z.string().min(1),
          updatedAt: z.string().min(1),
          lastCursorBlockId: z.string().min(1).max(64).optional(),
          lastCursorOffset: z.number().int().nonnegative().optional(),
          lastCursorSavedAt: z.string().min(1).max(128).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseProjectService.ts"],
      }
    ),

    deleteWriteProject: defineContract(
      z
        .object({
          projectId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseProjectService.ts"],
      }
    ),

    updateWriteProject: defineContract(
      z
        .object({
          projectId: z.string().min(1),
          expectedRevision: z.number().int().positive(),
          updates: writeProjectUpdatesSchema,
        })
        .strict(),
      z
        .object({
          projectId: z.string().min(1),
          revision: z.number().int().positive(),
          updatedAt: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseProjectService.ts"],
      }
    ),

    duplicateWriteProject: defineContract(
      z
        .object({
          projectId: z.string().min(1),
          operationId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          id: z.string().min(1),
          canonicalId: z.string().min(1),
          path: z.string().min(1),
          ownerId: z.string().min(1),
          uid: z.string().min(1),
          title: z.string().min(1),
          titleEn: z.string().min(1),
          titleAr: z.string().min(1),
          content: z.string(),
          contentDoc: writeContentDocSchema.optional(),
          wordCount: z.number().int().nonnegative(),
          status: writeProjectStatusSchema,
          workType: writeProjectWorkTypeSchema,
          typeEn: z.string().min(1),
          typeAr: z.string().min(1),
          coverUrl: z.string().url().max(2048).optional(),
          isPublished: z.boolean(),
          revision: z.number().int().positive(),
          source: z.string().min(1),
          version: z.number().int().positive(),
          createdAt: z.string().min(1),
          updatedAt: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseProjectService.ts"],
      }
    ),

    publishWriteProject: defineContract(
      z
        .object({
          projectId: z.string().min(1),
          operationId: z.string().min(1),
          metadata: z
            .object({
              title: z.string().min(1).max(180),
              description: z.string().max(4000),
              coverUrl: z.string().url().max(2048).optional(),
            })
            .strict(),
          files: z
            .object({
              epubUrl: z.string().url().max(4096),
              pdfUrl: z.string().url().max(4096),
            })
            .strict(),
        })
        .strict(),
      z
        .object({
          id: z.string().min(1),
          projectId: z.string().min(1),
          authorId: z.string().min(1),
          authorName: z.string().min(1),
          title: z.string().min(1),
          description: z.string(),
          coverUrl: z.string().url().max(2048).optional(),
          epubUrl: z.string().url().max(4096).optional(),
          pdfUrl: z.string().url().max(4096).optional(),
          publishedAt: z.string().min(1),
          formats: z.array(z.enum(["epub", "pdf"])).min(1),
          pageCount: z.number().int().nonnegative(),
          versionNumber: z.number().int().positive().optional(),
          bookId: z.string().min(1),
          editionId: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseProjectService.ts"],
      }
    ),

    createProjectRelease: defineContract(
      z
        .object({
          projectId: z.string().min(1),
          publishKind: z.enum(["ebook_epub", "blog"]),
        })
        .strict(),
      z
        .object({
          releaseId: z.string().min(1),
          version: z.number().int().positive(),
          normalizedContent: normalizedManuscriptSchema,
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    generateProjectReleaseEpub: defineContract(
      z
        .object({
          releaseId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          releaseId: z.string().min(1),
          projectId: z.string().min(1),
          epubStoragePath: z.string().min(1),
          attachmentId: z.string().min(1),
          binaryStatus: z.literal("ready"),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    bridgeReleaseToCanonicalBook: defineContract(
      z
        .object({
          releaseId: z.string().min(1),
          visibility: z.enum(["public", "private"]),
        })
        .strict(),
      z
        .object({
          bookId: z.string().min(1),
          editionId: z.string().min(1),
          attachmentId: z.string().min(1),
          currentReleaseId: z.string().min(1),
          publicationVersion: z.number().int().positive(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    updatePublishedBookRights: defineContract(
      z
        .object({
          bookId: z.string().min(1),
          rightsMode: z.enum(["public_free", "private", "paid", "premium_only"]),
        })
        .strict(),
      z
        .object({
          bookId: z.string().min(1),
          rightsMode: z.enum(["public_free", "private", "paid", "premium_only"]),
          visibility: z.enum(["public", "private"]),
          attachmentVisibility: z.enum(["public", "restricted", "private"]),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    getProjectPublicationSettings: defineContract(
      z
        .object({
          projectId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          projectId: z.string().min(1),
          blog: z
            .object({
              publicationId: z.string().min(1),
              visibility: z.enum(["public", "private"]),
            })
            .strict()
            .optional(),
          ebook: z
            .object({
              bookId: z.string().min(1),
              visibility: z.enum(["public", "private"]),
            })
            .strict()
            .optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    updateLongformPublicationVisibility: defineContract(
      z
        .object({
          publicationId: z.string().min(1),
          visibility: z.enum(["public", "private"]),
        })
        .strict(),
      z
        .object({
          publicationId: z.string().min(1),
          visibility: z.enum(["public", "private"]),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    updatePublishedBookVisibility: defineContract(
      z
        .object({
          bookId: z.string().min(1),
          visibility: z.enum(["public", "private"]),
        })
        .strict(),
      z
        .object({
          bookId: z.string().min(1),
          visibility: z.enum(["public", "private"]),
          attachmentVisibility: z.enum(["public", "restricted", "private"]),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    bridgeReleaseToLongformPublication: defineContract(
      z
        .object({
          releaseId: z.string().min(1),
          visibility: z.enum(["public", "private"]),
        })
        .strict(),
      z
        .object({
          publicationId: z.string().min(1),
          projectId: z.string().min(1),
          currentReleaseId: z.string().min(1),
          publicationVersion: z.number().int().positive(),
          canonicalSlug: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    getProjectReleasePreview: defineContract(
      z
        .object({
          releaseId: z.string().min(1),
          previewType: z.enum(["blog", "ebook"]),
        })
        .strict(),
      z
        .object({
          releaseId: z.string().min(1),
          previewType: z.enum(["blog", "ebook"]),
          title: z.string().min(1),
          language: z.string().min(1),
          coverUrl: z.string().max(2048).optional(),
          excerpt: z.string(),
          wordCount: z.number().int().nonnegative(),
          estimatedReadingMinutes: z.number().int().positive(),
          normalizedContent: normalizedManuscriptSchema,
          frontmatter: z
            .object({
              author: z.string().min(1),
              language: z.string().min(1),
              unitCount: z.number().int().positive(),
            })
            .strict(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    getProjectReleaseEbookPreviewSession: defineContract(
      z
        .object({
          releaseId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          signedUrl: z.string().url().min(1),
          format: z.literal("epub"),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["app/project/preview.tsx"],
      }
    ),

    getLongformPublication: defineContract(
      z
        .object({
          publicationId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          publicationId: z.string().min(1),
          title: z.string().min(1),
          author: z.string().min(1),
          coverUrl: z.string().max(2048).optional(),
          coverMode: canonicalCoverModeSchema.optional(),
          fallbackCover: canonicalFallbackCoverSchema.optional(),
          excerpt: z.string(),
          estimatedReadingMinutes: z.number().int().positive(),
          normalizedContent: normalizedManuscriptSchema,
          ownerUid: z.string().min(1),
          language: z.string().min(1),
          canonicalSlug: z.string().min(1).optional(),
          datePublished: z.string().min(1).optional(),
          dateModified: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["app/publication-reader.tsx"],
      }
    ),

    listOwnLongformPublications: defineContract(
      z.object({}).strict(),
      z
        .object({
          publications: z.array(
            z
              .object({
                publicationId: z.string().min(1),
                title: z.string().min(1),
                excerpt: z.string(),
                estimatedReadingMinutes: z.number().int().positive(),
                lastPublishedAt: z.string().min(1),
                publicationType: z.string().min(1),
                canonicalSlug: z.string().min(1).optional(),
                coverUrl: z.string().max(2048).optional(),
                coverMode: canonicalCoverModeSchema.optional(),
                fallbackCover: canonicalFallbackCoverSchema.optional(),
              })
              .strict()
          ),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["app/tabs/write.tsx"],
      }
    ),

    createWriteProjectShareLink: defineContract(
      z
        .object({
          projectId: z.string().min(1),
          origin: z.string().url().max(2048).optional(),
        })
        .strict(),
      z
        .object({
          projectId: z.string().min(1),
          token: z.string().min(1),
          shareUrl: z.string().url().max(4096),
          isRevoked: z.boolean(),
          createdAt: z.string().min(1),
          updatedAt: z.string().min(1),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseProjectService.ts", "app/tabs/write.tsx"],
      }
    ),

    revokeWriteProjectShareLink: defineContract(
      z
        .object({
          projectId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          projectId: z.string().min(1),
          revoked: z.boolean(),
          revokedAt: z.string().nullable(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["services/firebaseProjectService.ts"],
      }
    ),

    getReaderProgress: defineContract(
      z
        .object({
          bookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          exists: z.boolean(),
          bookId: z.string().min(1),
          progress: z.number().min(0).max(1),
          lastPosition: z.unknown().nullable(),
          lastAnchor: canonicalAnchorV1Schema.nullable().optional(),
          anchorManifestVersion: z.number().int().positive().nullable().optional(),
          updatedAt: z.unknown().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useReaderProgress.ts"],
      }
    ),

    getReaderBookmarks: defineContract(
      z
        .object({
          bookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          bookmarks: z.array(
            z
              .object({
                bookmarkId: z.string().min(1),
                bookId: z.string().min(1),
                label: z.string(),
                page: z.number().int().positive().nullable(),
                cfi: z.string().nullable(),
                anchor: canonicalAnchorV1Schema.nullable().optional(),
                anchorManifestVersion: z.number().int().positive().nullable().optional(),
                updatedAt: z.number().int().nonnegative().nullable(),
              })
              .strict()
          ),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useReaderBookmarks.ts"],
      }
    ),

    getReaderHighlights: defineContract(
      z
        .object({
          bookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          highlights: z.array(
            z
              .object({
                highlightId: z.string().min(1),
                bookId: z.string().min(1),
                quote: z.string(),
                note: z.string(),
                color: z.string().min(1),
                page: z.number().int().positive().nullable(),
                cfi: z.string().nullable(),
                anchor: canonicalAnchorV1Schema.nullable().optional(),
                anchorManifestVersion: z.number().int().positive().nullable().optional(),
                updatedAt: z.number().int().nonnegative().nullable(),
              })
              .strict()
          ),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useReaderHighlights.ts"],
      }
    ),

    recordReadingProgress: defineContract(
      z
        .object({
          bookId: z.string().min(1),
          currentPage: z.number().int().nonnegative(),
          totalPages: z.number().int().positive(),
          percentage: z.number().min(0).max(1),
          lastPosition: z.unknown().optional(),
          lastAnchor: canonicalAnchorV1Schema.optional(),
          status_state: z.enum(["reading", "paused", "completed"]).optional(),
          recommendationContext: recommendationOriginSchema.optional(),
        })
        .strict(),
      z
        .object({
          ok: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useReaderProgress.ts"],
      }
    ),

    syncReaderOperations: defineContract(
      z
        .object({
          operations: z
            .array(
              z
                .object({
                  opId: z.string().min(1).max(128),
                  idempotencyKey: z.string().min(1).max(128),
                  type: z.enum([
                    "upsert_progress",
                    "upsert_highlight",
                    "delete_highlight",
                    "upsert_bookmark",
                    "delete_bookmark",
                  ]),
                  bookId: z.string().min(1),
                  clientTimestampMs: z.number().int().positive(),
                  payload: z.record(z.unknown()).optional(),
                })
                .strict()
            )
            .min(1)
            .max(100),
        })
        .strict(),
      z
        .object({
          accepted: z.number().int().nonnegative(),
          applied: z.number().int().nonnegative(),
          deduped: z.number().int().nonnegative(),
          rejected: z.number().int().nonnegative(),
          errors: z.array(
            z
              .object({
                opId: z.string().min(1),
                code: z.string().min(1),
                message: z.string().min(1),
              })
              .strict()
          ),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/reader/offline/useReaderSync.ts"],
      }
    ),

    logAttachmentEvents: defineContract(
      z
        .object({
          events: z.array(
            z
              .object({
                event: attachmentAnalyticsEventSchema,
                attachmentId: z.string().min(1),
                attachmentType: z.string().min(1),
                surface: renderSurfaceSchema,
                ownerUid: z.string().min(1).optional(),
                fileSizeBytes: z.number().int().nonnegative().optional(),
                renderMode: z.string().optional(),
              })
              .strict()
          ),
        })
        .strict(),
      z
        .object({
          success: z.boolean(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/media/AttachmentAnalytics.ts"],
      }
    ),

    createEbookAttachment: defineContract(
      z.unknown(),
      z.unknown(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    backfillDerivedStats: defineContract(
      z.unknown(),
      z.unknown(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    backfillReadingProgressCanonical: defineContract(
      z.union([
        z.undefined(),
        z
          .object({
            dryRun: z.boolean().optional(),
            pageSize: z.number().int().positive().max(400).optional(),
            maxDocs: z.number().int().positive().max(50000).optional(),
            cursorDocId: z.string().min(1).optional(),
          })
          .strict(),
      ]),
      z
        .object({
          ok: z.boolean(),
          dryRun: z.boolean(),
          pageSize: z.number().int().positive(),
          maxDocs: z.number().int().positive(),
          processed: z.number().int().nonnegative(),
          mutated: z.number().int().nonnegative(),
          unchanged: z.number().int().nonnegative(),
          skippedInvalid: z.number().int().nonnegative(),
          commits: z.number().int().nonnegative(),
          hasMore: z.boolean(),
          nextCursorDocId: z.string().nullable(),
          adjustments: z
            .object({
              uidFilled: z.number().int().nonnegative(),
              userIdFilled: z.number().int().nonnegative(),
              uidUserIdNormalized: z.number().int().nonnegative(),
              bookIdFilled: z.number().int().nonnegative(),
              statusNormalized: z.number().int().nonnegative(),
              progressNormalized: z.number().int().nonnegative(),
              updatedAtFilled: z.number().int().nonnegative(),
              lastPositionBackfilled: z.number().int().nonnegative(),
            })
            .strict(),
          invalidDocIds: z.array(z.string()),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),
  },

  rest: {
    searchBooks: defineContract(
      z
        .object({
          q: z.string().min(2),
          ebookOnly: z.boolean().optional(),
          lang: z.string().min(2).max(8).optional(),
          cursor: z.string().min(1).optional(),
          limit: z.number().int().min(1).max(30).optional(),
        })
        .strict(),
      z
        .object({
          results: z.array(searchBookSchema),
          nextCursor: z.string().nullable(),
          hasMore: z.boolean(),
          cursorUsed: z.boolean(),
        })
        .strict(),
      "rest",
      {
        method: "GET",
        route: "/api/search/books",
        callSites: ["services/bookSearchService.ts"],
      }
    ),

    aiChat: defineContract(
      z
        .object({
          model: z.string().min(1),
          messages: z.array(z.unknown()),
          systemInstruction: z.string().optional(),
          config: z
            .object({
              responseMimeType: z.string().optional(),
              responseSchema: z.unknown().optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
      z
        .object({
          text: z.string().min(1),
        })
        .strict(),
      "rest",
      {
        method: "POST",
        route: "/api/ai/chat",
        callSites: ["services/realAgentService.ts"],
      }
    ),

    aiLibrarian: defineContract(
      z
        .object({
          normalizedQuery: z.string().min(1).max(280),
          intent: z
            .enum([
              "Reinforcement",
              "AdjacentExpansion",
              "StructuredContrast",
              "HighConfidencePrecision",
              "ReReadingReflection",
            ])
            .optional(),
        })
        .strict(),
      z
        .object({
          recommendations: z
            .array(
              z
                .object({
                  bookId: z.string(),
                  title: z.string().min(1),
                  author: z.string().min(1),
                  short_reason: z.string().min(1).max(240),
                  source: z.literal("librarian").optional(),
                  suggestionSessionId: z.string().min(1).max(96).optional(),
                  suggestionId: z.string().min(1).max(96).optional(),
                  rankPosition: z.number().int().min(1).max(5).optional(),
                  mode: z
                    .enum([
                      "Reinforcement",
                      "AdjacentExpansion",
                      "StructuredContrast",
                      "HighConfidencePrecision",
                      "ReReadingReflection",
                    ])
                    .optional(),
                })
                .strict()
            )
            .max(5),
          fromCache: z.boolean(),
          remainingQuota: z.number(),
          normalizedQuery: z.string().min(1).max(280),
        })
        .strict(),
      "rest",
      {
        method: "POST",
        route: "/api/ai/librarian",
        callSites: ["services/realAgentService.ts"],
      }
    ),

    aiSummarize: defineContract(
      z
        .object({
          text: z.string().min(1),
          format: z.enum(["short", "bullets", "detailed"]).optional(),
        })
        .strict(),
      z
        .object({
          text: z.string().min(1),
        })
        .strict(),
      "rest",
      {
        method: "POST",
        route: "/api/ai/summarize",
        callSites: ["services/realAgentService.ts"],
      }
    ),
  },
} as const;

export type ApiContractsRegistry = typeof apiContracts;
export { contractErrorSchema, failureEnvelopeSchema, successEnvelope };
