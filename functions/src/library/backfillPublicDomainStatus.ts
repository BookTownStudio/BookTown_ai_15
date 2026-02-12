import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { evaluatePublicDomainStatus } from "./policy/publicDomainPolicy";
import { FieldValue } from "firebase-admin/firestore";

const db = admin.firestore();

/**
 * backfillPublicDomainStatus
 *
 * ADMIN-ONLY callable function.
 * Retroactively evaluates and persists Public Domain status
 * for externally sourced, public editions.
 *
 * Contract: Phase 2.2.1 (LOCKED)
 */
export const backfillPublicDomainStatus = onCall(
  { cors: true },
  async (request) => {
    /* -------------------------------------------------
     * AUTH & AUTHORIZATION
     * ------------------------------------------------- */
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;
    const userSnap = await db.doc(`users/${uid}`).get();

    if (!userSnap.exists || userSnap.data()?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin access required.");
    }

    /* -------------------------------------------------
     * INPUT NORMALIZATION
     * ------------------------------------------------- */
    const {
      dryRun = false,
      limit = 100,
      startAfterEditionId,
    } = (request.data || {}) as {
      dryRun?: boolean;
      limit?: number;
      startAfterEditionId?: string;
    };

    const effectiveLimit = Math.min(Math.max(limit, 1), 200);

    logger.info("[PD_BACKFILL][START]", {
      executor: uid,
      dryRun,
      limit: effectiveLimit,
      startAfterEditionId: startAfterEditionId || null,
    });

    /* -------------------------------------------------
     * QUERY SETUP
     * ------------------------------------------------- */
    let query = db
      .collection("editions")
      .where("visibility", "==", "public")
      .where("source", "in", ["googleBooks", "openLibrary"])
      .orderBy("id")
      .limit(effectiveLimit);

    if (startAfterEditionId) {
      const cursorSnap = await db
        .collection("editions")
        .doc(startAfterEditionId)
        .get();

      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const snapshot = await query.get();

    let evaluated = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;

    const batch = db.batch();
    const now = FieldValue.serverTimestamp();

    /* -------------------------------------------------
     * ITERATION
     * ------------------------------------------------- */
    for (const doc of snapshot.docs) {
      const edition = doc.data();
      evaluated++;

      try {
        // Safety: skip if missing critical fields
        if (!edition.titleEn || !edition.authorEn) {
          skipped++;
          logger.warn("[PD_BACKFILL][SKIP][MISSING_FIELDS]", {
            editionId: doc.id,
          });
          continue;
        }

        const evaluation = evaluatePublicDomainStatus({
          title: edition.titleEn,
          authors: [edition.authorEn],
          publicationYear: edition.publicationYear || null,
          source: edition.source,
          sourcePublicDomainFlag: edition.publicDomain,
          rights: edition.rights,
          language: edition.language,
        });

        const currentPD = edition.publicDomain ?? null;
        const currentReason = edition.publicDomainReason ?? null;

        const changed =
          currentPD !== evaluation.isPublicDomain ||
          currentReason !== evaluation.reason;

        if (!changed) {
          unchanged++;
          continue;
        }

        updated++;

        if (!dryRun) {
          batch.set(
            doc.ref,
            {
              publicDomain: evaluation.isPublicDomain,
              publicDomainReason: evaluation.reason,
              publicDomainEvaluatedAt: now,
              publicDomainSource: "policy_v1",
            },
            { merge: true }
          );
        }
      } catch (err) {
        skipped++;
        logger.error("[PD_BACKFILL][ERROR]", {
          editionId: doc.id,
          error: String(err),
        });
      }
    }

    /* -------------------------------------------------
     * COMMIT
     * ------------------------------------------------- */
    if (!dryRun && updated > 0) {
      await batch.commit();
    }

    const lastDoc =
      snapshot.docs.length > 0
        ? snapshot.docs[snapshot.docs.length - 1]
        : null;

    const nextCursor = lastDoc ? lastDoc.id : undefined;

    /* -------------------------------------------------
     * FINAL LOG
     * ------------------------------------------------- */
    logger.info("[PD_BACKFILL][END]", {
      evaluated,
      updated,
      unchanged,
      skipped,
      dryRun,
      nextCursor: nextCursor || null,
    });

    return {
      evaluated,
      updated,
      unchanged,
      skipped,
      dryRun,
      nextCursor,
    };
  }
);
