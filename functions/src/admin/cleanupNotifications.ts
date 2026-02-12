import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

/**
 * scheduledNotificationCleanup
 * Authoritative daily task to enforce retention policies.
 * Implements strict hard-delete semantics for expired ephemeral signals.
 */
export const scheduledNotificationCleanup = onSchedule("0 3 * * *", async (event) => {
    const now = admin.firestore.Timestamp.now().toDate();
    
    // Retention Windows
    const readRetentionDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const unreadRetentionDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    const globalSafetyDate = new Date(now.getTime() - (180 * 24 * 60 * 60 * 1000));

    logger.info("[NOTIF][CLEANUP] Scheduled cleanup started.", { 
        readExpiry: readRetentionDate.toISOString(),
        unreadExpiry: unreadRetentionDate.toISOString()
    });

    const BATCH_SIZE = 500;
    let totalDeleted = 0;

    const cleanupCriteria = [
        // 1. Read notifications older than 30 days
        db.collectionGroup('notifications')
            .where('read', '==', true)
            .where('createdAt', '<', admin.firestore.Timestamp.fromDate(readRetentionDate)),
        
        // 2. Unread notifications older than 90 days
        db.collectionGroup('notifications')
            .where('read', '==', false)
            .where('createdAt', '<', admin.firestore.Timestamp.fromDate(unreadRetentionDate)),

        // 3. Global hard-delete safety for anything older than 180 days
        db.collectionGroup('notifications')
            .where('createdAt', '<', admin.firestore.Timestamp.fromDate(globalSafetyDate))
    ];

    try {
        for (const query of cleanupCriteria) {
            const snap = await query.limit(BATCH_SIZE).get();
            
            if (!snap.empty) {
                const batch = db.batch();
                snap.docs.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                totalDeleted += snap.size;
                
                // If snap.size was at limit, we likely have more, but we stop here 
                // to respect runtime constraints and rely on tomorrow's run or subsequent loops.
                // Re-calling recursively is an option but for a daily 3 AM task, a single batch per criteria is safer.
            }
        }

        logger.info("[NOTIF][CLEANUP] Cleanup completed successfully.", { totalDeleted });
    } catch (error: any) {
        logger.error("[NOTIF][CLEANUP] Cleanup failed.", { error });
    }
});