import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();
const storage = admin.storage();

/**
 * scheduledAttachmentCleanup
 * Authoritative task to enforce ATTACHMENT_LIFECYCLE_V1 cleanup rules.
 * Runs every hour to prune TEMP_UPLOADED (>30m) and ORPHANED (>24h) files.
 */
export const scheduledAttachmentCleanup = onSchedule("0 * * * *", async (event) => {
    const now = Date.now();
    const tempExpiry = admin.firestore.Timestamp.fromMillis(now - (30 * 60 * 1000));
    const orphanExpiry = admin.firestore.Timestamp.fromMillis(now - (24 * 60 * 60 * 1000));

    logger.info("[LIFECYCLE][CLEANUP] Starting attachment pruning task.");

    const buckets = [
        // 1. Expired Temp Uploads
        db.collection('attachments')
            .where('state', '==', 'TEMP_UPLOADED')
            .where('lastUpdatedAt', '<', tempExpiry),
        
        // 2. Expired Orphans
        db.collection('attachments')
            .where('state', '==', 'ORPHANED')
            .where('lastUpdatedAt', '<', orphanExpiry)
    ];

    let totalPruned = 0;

    for (const query of buckets) {
        const snap = await query.limit(100).get();
        if (snap.empty) continue;

        for (const attachmentDoc of snap.docs) {
            const data = attachmentDoc.data();
            const uid = data.uploader.uid;
            const size = data.size || 0;

            try {
                // A. Delete Storage Binary
                const file = storage.bucket().file(data.storagePath);
                await file.delete({ ignoreNotFound: true });

                // B. Atomic Document Delete & Quota Reclaim
                await db.runTransaction(async (tx) => {
                    tx.delete(attachmentDoc.ref);
                    tx.set(db.collection("user_stats").doc(uid), {
                        storageUsageBytes: admin.firestore.FieldValue.increment(-size)
                    }, { merge: true });
                });

                totalPruned++;
            } catch (err) {
                logger.error(`[LIFECYCLE][ERROR] Failed to prune attachment ${attachmentDoc.id}:`, err);
            }
        }
    }

    logger.info(`[LIFECYCLE][CLEANUP] Pruned ${totalPruned} expired attachments.`);
});