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
import { deriveBookCovers } from "./library/deriveBookCovers";
import { backfillCovers as backfillCoversRaw } from "./library/backfillCovers";
import { requestEbookReadAccess as requestEbookReadAccessRaw } from "./reader/requestEbookReadAccess";
import { recordReadingProgress as recordReadingProgressRaw } from "./reader/recordReadingProgress";
import { getReaderProgress as getReaderProgressRaw } from "./reader/getReaderProgress";
import { getReaderInsights as getReaderInsightsRaw } from "./reader/getReaderInsights";
import { getOrCreateReadingSession as getOrCreateReadingSessionRaw } from "./reader/getOrCreateReadingSession";
import { requestEbookOfflineAccess as requestEbookOfflineAccessRaw } from "./reader/requestEbookOfflineAccess";
import { createSocialPost as createSocialPostRaw } from "./createSocialPost";
import {
  addSocialComment as addSocialCommentRaw,
  editSocialComment as editSocialCommentRaw,
  deleteSocialComment as deleteSocialCommentRaw,
} from "./social/comments";
import { editSocialPost as editSocialPostRaw } from "./social/editPost";
import { likeSocialPost as likeSocialPostRaw, repostSocialPost as repostSocialPostRaw } from "./social/interactions";
import { reportSocialPost as reportSocialPostRaw } from "./social/reporting";
import {
  applyModerationAction as applyModerationActionRaw,
  transitionModerationStage as transitionModerationStageRaw,
} from "./social/moderation";
import { incrementPostView as incrementPostViewRaw } from "./social/analytics";
import { createWriteProject as createWriteProjectRaw } from "./createWriteProject";
import { deleteWriteProject as deleteWriteProjectRaw } from "./deleteWriteProject";
import { getAttachmentUrl as getAttachmentUrlRaw } from "./attachments/getAttachmentUrl";
import { createEbookAttachment as createEbookAttachmentRaw } from "./attachments/createEbookAttachment";
import { finalizeMetadata as finalizeMetadataRaw } from "./attachments/finalizeMetadata";
import { backfillDerivedStats as backfillDerivedStatsRaw } from "./admin/backfillStats";
import { api as apiRaw } from "./api";

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

      // User profile (idempotent)
      batch.set(
        userRef,
        {
          uid,
          email: email || null,
          name: user.displayName ?? "New User",
          handle: `@${email.split("@")[0] || "user"}`,
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
export const backfillCovers = wrapCallableV2("backfillCovers", backfillCoversRaw);

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
// Authoritative Service Exports
// ------------------------------------------------------------------

// Social
export const createSocialPost = wrapCallableV2(
  "createSocialPost",
  createSocialPostRaw
);
export const addSocialComment = wrapCallableV2(
  "addSocialComment",
  addSocialCommentRaw
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

// Write
export const createWriteProject = wrapCallableV2(
  "createWriteProject",
  createWriteProjectRaw
);
export const deleteWriteProject = wrapCallableV2(
  "deleteWriteProject",
  deleteWriteProjectRaw
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
export { scheduledNotificationCleanup } from "./admin/cleanupNotifications";
export { scheduledAttachmentCleanup } from "./admin/cleanupAttachments";

// Triggers
export * from "./triggers/aggregationTriggers";
export * from "./triggers/notificationTriggers";
export * from "./triggers/activityTriggers";
export * from "./triggers/searchTriggers";

// REST API (CRITICAL WIRING)
export const api = wrapRestExport(apiRaw);
