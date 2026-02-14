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

const searchBookSchema = z
  .object({
    id: z.string().min(1).optional(),
    bookId: z.string().min(1).optional(),
    titleEn: z.string().optional(),
    titleAr: z.string().optional(),
    authorEn: z.string().optional(),
    authorAr: z.string().optional(),
    descriptionEn: z.string().optional(),
    descriptionAr: z.string().optional(),
    coverUrl: z.string().optional(),
    source: z.string().optional(),
    editionId: z.string().optional(),
    isEbookAvailable: z.boolean().optional(),
  })
  .passthrough()
  .refine(
    (v) =>
      (typeof v.id === "string" && v.id.length > 0) ||
      (typeof v.editionId === "string" && v.editionId.length > 0) ||
      (typeof v.bookId === "string" && v.bookId.length > 0),
    {
      message: "At least one identifier (id, editionId, or bookId) is required.",
    }
  );

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

    ingestBook: defineContract(
      z
        .object({
          bookId: z.string().min(1),
          source: z.enum(["googleBooks", "openLibrary"]),
          rawBook: z.record(z.string(), z.unknown()),
        })
        .strict(),
      z
        .object({
          bookId: z.string().min(1),
          editionId: z.string().min(1).optional(),
          status: z.string().min(1).optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: [
          "services/bookIngestionService.ts",
          "lib/services/firebaseCatalogService.ts",
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
          status: z.literal("UPLOADED"),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["components/modals/AddBookModal.tsx"],
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
          ebookId: z.string().min(1),
        })
        .strict(),
      z
        .object({
          ebookId: z.string().min(1),
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
        callSites: [
          "app/lib/hooks/app/useEbookReaderAccess.ts",
          "lib/hooks/useEbookReaderAccess.ts",
        ],
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
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["app/reader.tsx"],
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
      z.unknown(),
      z.unknown(),
      "httpsCallable",
      {
        callSites: [],
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

    createWriteProject: defineContract(
      z.unknown(),
      z.unknown(),
      "httpsCallable",
      {
        callSites: [],
      }
    ),

    deleteWriteProject: defineContract(
      z.unknown(),
      z.unknown(),
      "httpsCallable",
      {
        callSites: [],
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
          updatedAt: z.unknown().optional(),
        })
        .strict(),
      "httpsCallable",
      {
        callSites: ["lib/hooks/useReaderProgress.ts"],
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
  },

  rest: {
    searchBooks: defineContract(
      z
        .object({
          q: z.string().min(2),
          ebookOnly: z.boolean().optional(),
          lang: z.string().min(2).max(8).optional(),
        })
        .strict(),
      z
        .object({
          results: z.array(searchBookSchema),
        })
        .strict(),
      "rest",
      {
        method: "GET",
        route: "/api/search/books",
        callSites: ["services/federatedSearch.ts"],
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
