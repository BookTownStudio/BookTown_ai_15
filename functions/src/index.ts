import { admin } from "./firebaseAdmin";
import * as functions from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, WriteBatch } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { recomputeUserStats } from "./userStats/recomputeUserStats";

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
export const createDefaultShelves = onCall({ cors: true }, async (request) => {
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
export { ingestBook } from "./library/ingestBook";
export { deriveBookCovers } from "./library/deriveBookCovers";
export { backfillCovers } from "./library/backfillCovers";

// ------------------------------------------------------------------
// 📖 READER MEDIATION (SECURE, CANONICAL)
// ------------------------------------------------------------------
export { requestEbookReadAccess } from "./reader/requestEbookReadAccess";
export { recordReadingProgress } from "./reader/recordReadingProgress";
export { getReaderProgress } from "./reader/getReaderProgress";
export { getReaderInsights } from "./reader/getReaderInsights";
export { getOrCreateReadingSession } from "./reader/getOrCreateReadingSession";
export { requestEbookOfflineAccess } from "./reader/requestEbookOfflineAccess";

// ------------------------------------------------------------------
// Authoritative Service Exports
// ------------------------------------------------------------------

// Social
export { createSocialPost } from "./createSocialPost";
export {
  addSocialComment,
  editSocialComment,
  deleteSocialComment,
} from "./social/comments";
export { likeSocialPost, repostSocialPost } from "./social/interactions";
export { reportSocialPost } from "./social/reporting";
export {
  applyModerationAction,
  transitionModerationStage,
} from "./social/moderation";
export { incrementPostView } from "./social/analytics";

// Write
export { createWriteProject } from "./createWriteProject";
export { deleteWriteProject } from "./deleteWriteProject";

// Attachments
export { getAttachmentUrl } from "./attachments/getAttachmentUrl";
export { createEbookAttachment } from "./attachments/createEbookAttachment";

// Admin
export { backfillDerivedStats } from "./admin/backfillStats";
export { scheduledNotificationCleanup } from "./admin/cleanupNotifications";
export { scheduledAttachmentCleanup } from "./admin/cleanupAttachments";

// Triggers
export * from "./triggers/aggregationTriggers";
export * from "./triggers/notificationTriggers";
export * from "./triggers/activityTriggers";
export * from "./triggers/searchTriggers";

// REST API (CRITICAL WIRING)
export { api } from "./api";
