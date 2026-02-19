import { admin } from "./firebaseAdmin";
import * as functions from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, WriteBatch } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { recomputeUserStats } from "./userStats/recomputeUserStats";
import { wrapCallableV1 } from "./contracts/wrapCallableV1";
import { wrapCallableV2 } from "./contracts/wrapCallableV2";
import { wrapRestExport } from "./contracts/wrapRestExport";
import { ingestBook as ingestBookRaw } from "./library/ingestBook";
import { uploadUserBook as uploadUserBookRaw } from "./library/uploadUserBook";
import { finalizeUserUpload as finalizeUserUploadRaw } from "./library/finalizeUserUpload";
import {
  finalizeGoodreadsImport as finalizeGoodreadsImportRaw,
  processGoodreadsImportSessions,
  startGoodreadsImport as startGoodreadsImportRaw,
} from "./imports/goodreadsImport";
import { deriveBookCovers } from "./library/deriveBookCovers";
import { backfillCovers as backfillCoversRaw } from "./library/backfillCovers";
import { backfillMissingCovers as backfillMissingCoversRaw } from "./library/backfillMissingCovers";
import { backfillUserUploadCoverJobs as backfillUserUploadCoverJobsRaw } from "./library/backfillUserUploadCoverJobs";
import { processUserUploadCoverJobs } from "./library/processUserUploadCoverJobs";
import { requestEbookReadAccess as requestEbookReadAccessRaw } from "./reader/requestEbookReadAccess";
import { recordReadingProgress as recordReadingProgressRaw } from "./reader/recordReadingProgress";
import { getReaderProgress as getReaderProgressRaw } from "./reader/getReaderProgress";
import { getReaderInsights as getReaderInsightsRaw } from "./reader/getReaderInsights";
import { getOrCreateReadingSession as getOrCreateReadingSessionRaw } from "./reader/getOrCreateReadingSession";
import { requestEbookOfflineAccess as requestEbookOfflineAccessRaw } from "./reader/requestEbookOfflineAccess";
import {
  getPublicProfile as getPublicProfileRaw,
  updateOwnProfile as updateOwnProfileRaw,
  followUser as followUserRaw,
  unfollowUser as unfollowUserRaw,
  getSuggestedProfiles as getSuggestedProfilesRaw,
  listProfilePosts as listProfilePostsRaw,
  listProfileReviews as listProfileReviewsRaw,
  listProfileBooks as listProfileBooksRaw,
} from "./profile";
import { searchSocial as searchSocialRaw } from "./social/search";
import { createSocialPost as createSocialPostRaw } from "./createSocialPost";
import {
  addSocialComment as addSocialCommentRaw,
  likeSocialComment as likeSocialCommentRaw,
  editSocialComment as editSocialCommentRaw,
  deleteSocialComment as deleteSocialCommentRaw,
} from "./social/comments";
import { editSocialPost as editSocialPostRaw } from "./social/editPost";
import {
  deleteSocialPost as deleteSocialPostRaw,
  restoreSocialPost as restoreSocialPostRaw,
} from "./social/deletePost";
import { likeSocialPost as likeSocialPostRaw, repostSocialPost as repostSocialPostRaw } from "./social/interactions";
import {
  reportSocialComment as reportSocialCommentRaw,
  reportSocialPost as reportSocialPostRaw,
} from "./social/reporting";
import {
  applyModerationAction as applyModerationActionRaw,
  transitionModerationStage as transitionModerationStageRaw,
} from "./social/moderation";
import { incrementPostView as incrementPostViewRaw } from "./social/analytics";
import { createWriteProject as createWriteProjectRaw } from "./createWriteProject";
import { deleteWriteProject as deleteWriteProjectRaw } from "./deleteWriteProject";
import { updateWriteProject as updateWriteProjectRaw } from "./updateWriteProject";
import { duplicateWriteProject as duplicateWriteProjectRaw } from "./duplicateWriteProject";
import { publishWriteProject as publishWriteProjectRaw } from "./publishWriteProject";
import { createWriteProjectShareLink as createWriteProjectShareLinkRaw } from "./createWriteProjectShareLink";
import { revokeWriteProjectShareLink as revokeWriteProjectShareLinkRaw } from "./revokeWriteProjectShareLink";
import { getAttachmentUrl as getAttachmentUrlRaw } from "./attachments/getAttachmentUrl";
import { createEbookAttachment as createEbookAttachmentRaw } from "./attachments/createEbookAttachment";
import { finalizeMetadata as finalizeMetadataRaw } from "./attachments/finalizeMetadata";
import { backfillDerivedStats as backfillDerivedStatsRaw } from "./admin/backfillStats";
import { backfillReadingProgressCanonical as backfillReadingProgressCanonicalRaw } from "./admin/backfillReadingProgressCanonical";
import {
  listUserQuotes as listUserQuotesRaw,
  getQuoteById as getQuoteByIdRaw,
  createQuote as createQuoteRaw,
  saveQuoteFromReference as saveQuoteFromReferenceRaw,
  toggleQuoteBookmark as toggleQuoteBookmarkRaw,
} from "./quotes";
import {
  createDirectConversation as createDirectConversationRaw,
  listDirectConversations as listDirectConversationsRaw,
  listDirectMessages as listDirectMessagesRaw,
  sendDirectMessage as sendDirectMessageRaw,
  markDirectConversationRead as markDirectConversationReadRaw,
} from "./messaging/directMessages";
import { api as apiRaw } from "./api";
import { buildSearchFieldsFromTextParts, normalizeSearchText } from "./search/normalization";

// ------------------------------------------------------------------
// Admin SDK (initialized via firebaseAdmin module)
// ------------------------------------------------------------------
const db = admin.firestore();

/**
 * onUserCreatedBootstrap
 * AUTH_TRIGGER_ONLY bootstrap
 * Authoritative creation of user profile + default shelves
 *
 * 🔒 STABLE v1 AUTH TRIGGER (INTENTIONALLY KEPT)
 *
 * AMENDMENT (LOCKED):
 * - "currently-reading" is NO LONGER created as a physical shelf
 * - Reading state is virtual and derived from reading_progress
 */
export const onUserCreatedBootstrap = functions.auth
  .user()
  .onCreate(async (user) => {
    const uid = user.uid;
    const userRef = db.doc(`users/${uid}`);
    const email = user.email ?? "";
    const now = FieldValue.serverTimestamp();

    logger.info(`[BOOTSTRAP][START] uid=${uid}`);
    logger.info(`[BOOTSTRAP][ENV] project=${process.env.GCLOUD_PROJECT}`);

    /* -------------------------------------------------
     * PHASE 1 — PROBE WRITE (OUTSIDE TRANSACTION)
     * ------------------------------------------------- */
    try {
      await db.doc(`_bootstrap_probe/${uid}`).set({
        uid,
        firedAt: now,
        source: "auth.onCreate",
        runtime: "v1",
      });
      logger.info("[BOOTSTRAP][PROBE] Firestore write OK");
    } catch (e) {
      logger.error("[BOOTSTRAP][PROBE] Firestore write FAILED", e);
      throw e;
    }

    /* -------------------------------------------------
     * PHASE 2 — IDENTITY + SHELVES (BATCH, NOT TX)
     * ------------------------------------------------- */
    try {
      const batch: WriteBatch = db.batch();
      const bootstrapName = user.displayName ?? "New User";
      const bootstrapHandle = `@${email.split("@")[0] || "user"}`;
      const bootstrapSearchFields = buildSearchFieldsFromTextParts([
        bootstrapName,
        bootstrapHandle,
      ]);

      // User profile (idempotent)
      batch.set(
        userRef,
        {
          uid,
          email: email || null,
          name: bootstrapName,
          handle: bootstrapHandle,
          avatarUrl:
            user.photoURL ||
            `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`,
          createdAt: now,
          joinDate: now,
          lastActive: now,
          role: "user",
          status: "active",
          isSuspended: false,
          initializationVersion: 4, // 🔒 bumped due to shelf model change
        },
        { merge: true }
      );

      const bootstrapJoinDate = new Date().toISOString();
      batch.set(
        db.doc(`public_profiles/${uid}`),
        {
          uid,
          name: bootstrapName,
          handle: bootstrapHandle,
          avatarUrl:
            user.photoURL ||
            `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`,
          bannerUrl: "",
          bioEn: "",
          bioAr: "",
          joinDate: bootstrapJoinDate,
          updatedAt: bootstrapJoinDate,
          followerCount: 0,
          followingCount: 0,
          nameNormalized: normalizeSearchText(bootstrapName),
          handleNormalized: normalizeSearchText(bootstrapHandle),
          bioNormalized: "",
          searchTokens: bootstrapSearchFields.tokens,
          searchPrefixes: bootstrapSearchFields.prefixes,
        },
        { merge: true }
      );

      /**
       * 🔒 DEFAULT PHYSICAL SHELVES
       * --------------------------------
       * "currently-reading" is intentionally excluded.
       * Reading state is virtual and derived from reading_progress.
       */
      const shelfMetadata = [
        { id: "want-to-read", titleEn: "Want to Read", titleAr: "أرغب في قراءته" },
        { id: "finished", titleEn: "Finished", titleAr: "انتهيت من قراءته" },
      ];

      for (const s of shelfMetadata) {
        const shelfRef = db.collection("shelves").doc(`${uid}_${s.id}`);
        batch.set(
          shelfRef,
          {
            ...s,
            ownerId: uid,
            entries: {},
            createdAt: now,
            updatedAt: now,
            isSystem: true,
          },
          { merge: true }
        );
      }

      await batch.commit();
      
      // 🔒 Recompute for initial score (profile materialized)
      await recomputeUserStats(uid);

      logger.info(`[BOOTSTRAP][SUCCESS] User ${uid} fully materialized`);
    } catch (error) {
      logger.error(`[BOOTSTRAP][FAILURE] uid=${uid}`, error);
      throw error;
    }
  });

/**
 * createDefaultShelves
 * Explicit, callable bootstrap (deterministic + debuggable)
 *
 * AMENDMENT (LOCKED):
 * - Does NOT create "currently-reading"
 */
const createDefaultShelvesRaw = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const uid = request.auth.uid;
  const now = FieldValue.serverTimestamp();

  const shelfMetadata = [
    { id: "want-to-read", titleEn: "Want to Read", titleAr: "أرغب في قراءته" },
    { id: "finished", titleEn: "Finished", titleAr: "انتهيت من قراءته" },
  ];

  await db.doc(`_bootstrap_probe/${uid}`).set(
    {
      uid,
      action: "createDefaultShelves",
      firedAt: now,
    },
    { merge: true }
  );

  const batch = db.batch();

  for (const s of shelfMetadata) {
    const shelfRef = db.collection("shelves").doc(`${uid}_${s.id}`);
    batch.set(
      shelfRef,
      {
        ...s,
        ownerId: uid,
        entries: {},
        createdAt: now,
        updatedAt: now,
        isSystem: true,
      },
      { merge: true }
    );
  }

  await batch.commit();

  return {
    ok: true,
    created: shelfMetadata.map((s) => s.id),
  };
});

// ------------------------------------------------------------------
// 🔒 AUTHORITATIVE INGESTION (CRITICAL EXPORT)
// ------------------------------------------------------------------
export const createDefaultShelves = wrapCallableV2(
  "createDefaultShelves",
  createDefaultShelvesRaw
);
export const ingestBook = wrapCallableV2("ingestBook", ingestBookRaw);
export const uploadUserBook = wrapCallableV2(
  "uploadUserBook",
  uploadUserBookRaw
);
export const finalizeUserUpload = wrapCallableV2(
  "finalizeUserUpload",
  finalizeUserUploadRaw
);
export const startGoodreadsImport = wrapCallableV2(
  "startGoodreadsImport",
  startGoodreadsImportRaw
);
export const finalizeGoodreadsImport = wrapCallableV2(
  "finalizeGoodreadsImport",
  finalizeGoodreadsImportRaw
);
export const backfillCovers = wrapCallableV2("backfillCovers", backfillCoversRaw);
export const backfillMissingCovers = wrapCallableV2(
  "backfillMissingCovers",
  backfillMissingCoversRaw
);
export const backfillUserUploadCoverJobs = wrapCallableV2(
  "backfillUserUploadCoverJobs",
  backfillUserUploadCoverJobsRaw
);
export { processGoodreadsImportSessions };

// ------------------------------------------------------------------
// 📖 READER MEDIATION (SECURE, CANONICAL)
// ------------------------------------------------------------------
export const requestEbookReadAccess = wrapCallableV1(
  "requestEbookReadAccess",
  requestEbookReadAccessRaw as any
);
export const recordReadingProgress = wrapCallableV2(
  "recordReadingProgress",
  recordReadingProgressRaw
);
export const getReaderProgress = wrapCallableV2(
  "getReaderProgress",
  getReaderProgressRaw
);
export const getReaderInsights = wrapCallableV2(
  "getReaderInsights",
  getReaderInsightsRaw
);
export const getOrCreateReadingSession = wrapCallableV2(
  "getOrCreateReadingSession",
  getOrCreateReadingSessionRaw
);
export const requestEbookOfflineAccess = wrapCallableV2(
  "requestEbookOfflineAccess",
  requestEbookOfflineAccessRaw
);

// ------------------------------------------------------------------
// 👤 PROFILE / IDENTITY
// ------------------------------------------------------------------
export const getPublicProfile = wrapCallableV2(
  "getPublicProfile",
  getPublicProfileRaw
);
export const updateOwnProfile = wrapCallableV2(
  "updateOwnProfile",
  updateOwnProfileRaw
);
export const followUser = wrapCallableV2("followUser", followUserRaw);
export const unfollowUser = wrapCallableV2("unfollowUser", unfollowUserRaw);
export const getSuggestedProfiles = wrapCallableV2(
  "getSuggestedProfiles",
  getSuggestedProfilesRaw
);
export const listProfilePosts = wrapCallableV2(
  "listProfilePosts",
  listProfilePostsRaw
);
export const listProfileReviews = wrapCallableV2(
  "listProfileReviews",
  listProfileReviewsRaw
);
export const listProfileBooks = wrapCallableV2(
  "listProfileBooks",
  listProfileBooksRaw
);

// ------------------------------------------------------------------
// Authoritative Service Exports
// ------------------------------------------------------------------

// Social
export const createSocialPost = wrapCallableV2(
  "createSocialPost",
  createSocialPostRaw
);
export const searchSocial = wrapCallableV2(
  "searchSocial",
  searchSocialRaw
);
export const addSocialComment = wrapCallableV2(
  "addSocialComment",
  addSocialCommentRaw
);
export const likeSocialComment = wrapCallableV2(
  "likeSocialComment",
  likeSocialCommentRaw
);
export const editSocialComment = wrapCallableV2(
  "editSocialComment",
  editSocialCommentRaw
);
export const deleteSocialComment = wrapCallableV2(
  "deleteSocialComment",
  deleteSocialCommentRaw
);
export const editSocialPost = wrapCallableV2(
  "editSocialPost",
  editSocialPostRaw
);
export const deleteSocialPost = wrapCallableV2(
  "deleteSocialPost",
  deleteSocialPostRaw
);
export const restoreSocialPost = wrapCallableV2(
  "restoreSocialPost",
  restoreSocialPostRaw
);
export const likeSocialPost = wrapCallableV2(
  "likeSocialPost",
  likeSocialPostRaw
);
export const repostSocialPost = wrapCallableV2(
  "repostSocialPost",
  repostSocialPostRaw
);
export const reportSocialPost = wrapCallableV2(
  "reportSocialPost",
  reportSocialPostRaw
);
export const reportSocialComment = wrapCallableV2(
  "reportSocialComment",
  reportSocialCommentRaw
);
export const applyModerationAction = wrapCallableV2(
  "applyModerationAction",
  applyModerationActionRaw
);
export const transitionModerationStage = wrapCallableV2(
  "transitionModerationStage",
  transitionModerationStageRaw
);
export const incrementPostView = wrapCallableV2(
  "incrementPostView",
  incrementPostViewRaw
);

// Quotes
export const listUserQuotes = wrapCallableV2(
  "listUserQuotes",
  listUserQuotesRaw
);
export const getQuoteById = wrapCallableV2("getQuoteById", getQuoteByIdRaw);
export const createQuote = wrapCallableV2("createQuote", createQuoteRaw);
export const saveQuoteFromReference = wrapCallableV2(
  "saveQuoteFromReference",
  saveQuoteFromReferenceRaw
);
export const toggleQuoteBookmark = wrapCallableV2(
  "toggleQuoteBookmark",
  toggleQuoteBookmarkRaw
);

// Messaging
export const createDirectConversation = wrapCallableV2(
  "createDirectConversation",
  createDirectConversationRaw
);
export const listDirectConversations = wrapCallableV2(
  "listDirectConversations",
  listDirectConversationsRaw
);
export const listDirectMessages = wrapCallableV2(
  "listDirectMessages",
  listDirectMessagesRaw
);
export const sendDirectMessage = wrapCallableV2(
  "sendDirectMessage",
  sendDirectMessageRaw
);
export const markDirectConversationRead = wrapCallableV2(
  "markDirectConversationRead",
  markDirectConversationReadRaw
);

// Write
export const createWriteProject = wrapCallableV2(
  "createWriteProject",
  createWriteProjectRaw
);
export const deleteWriteProject = wrapCallableV2(
  "deleteWriteProject",
  deleteWriteProjectRaw
);
export const updateWriteProject = wrapCallableV2(
  "updateWriteProject",
  updateWriteProjectRaw
);
export const duplicateWriteProject = wrapCallableV2(
  "duplicateWriteProject",
  duplicateWriteProjectRaw
);
export const publishWriteProject = wrapCallableV2(
  "publishWriteProject",
  publishWriteProjectRaw
);
export const createWriteProjectShareLink = wrapCallableV2(
  "createWriteProjectShareLink",
  createWriteProjectShareLinkRaw
);
export const revokeWriteProjectShareLink = wrapCallableV2(
  "revokeWriteProjectShareLink",
  revokeWriteProjectShareLinkRaw
);

// Attachments
export const getAttachmentUrl = wrapCallableV2(
  "getAttachmentUrl",
  getAttachmentUrlRaw
);
export const createEbookAttachment = wrapCallableV2(
  "createEbookAttachment",
  createEbookAttachmentRaw
);
export const finalizeMetadata = wrapCallableV2(
  "finalizeMetadata",
  finalizeMetadataRaw
);

// Admin
export const backfillDerivedStats = wrapCallableV2(
  "backfillDerivedStats",
  backfillDerivedStatsRaw
);
export const backfillReadingProgressCanonical = wrapCallableV2(
  "backfillReadingProgressCanonical",
  backfillReadingProgressCanonicalRaw
);
export { scheduledNotificationCleanup } from "./admin/cleanupNotifications";
export { scheduledAttachmentCleanup } from "./admin/cleanupAttachments";

// Triggers
export * from "./triggers/aggregationTriggers";
export * from "./triggers/notificationTriggers";
export * from "./triggers/activityTriggers";
export * from "./triggers/searchTriggers";
export { processUserUploadCoverJobs };

// REST API (CRITICAL WIRING)
export const api = wrapRestExport(apiRaw);
