import { onDocumentCreated, onDocumentDeleted, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";

const db = admin.firestore();

// CANONICAL V1 DEFAULTS
const CANONICAL_PREFS = {
    channels: { in_app: true, email: false, push: false },
    categories: {
        likes: true,
        comments: true,
        reposts: true,
        follows: true,
        mentions: true,
        quotes: true,
        system: true,
        messages: true
    }
};

const COLLAPSE_WINDOW_MS = 60000; // 1 minute per delivery policy

/**
 * projectActivityToNotification
 * Implementation of NOTIFICATION_DELIVERY_POLICY_V1 (LOCKED).
 */
export const projectActivityToNotification = onDocumentCreated("activity_log/{activityId}", async (event) => {
    const snap = event.data;
    if (!snap) return;
    const activity = snap.data();

    // 1. RESOLUTION & GLOBAL SUPPRESSION
    const recipientUid = activity.context.target_owner_uid;
    if (!recipientUid || recipientUid === activity.actor.uid) return;

    // 2. ELIGIBILITY MAPPING
    let category: keyof typeof CANONICAL_PREFS.categories | null = null;
    let type: string | null = null;
    let priority: 'low' | 'medium' | 'high' = 'medium';
    let entityType: string = 'post';

    switch (activity.verb) {
        case 'post_liked': category = 'likes'; type = 'like'; priority = 'low'; break;
        case 'post_commented': category = 'comments'; type = 'comment'; break;
        case 'post_reposted': category = 'reposts'; type = 'repost'; break;
        case 'user_followed': category = 'follows'; type = 'follow'; entityType = 'profile'; break;
        default: return; // Suppress non-eligible events
    }

    if (!category || !type) return;

    // 3. PREFERENCE GATE (V1)
    const prefRef = db.collection('notification_preferences').doc(recipientUid);
    const prefSnap = await prefRef.get();
    let prefs = CANONICAL_PREFS;
    
    if (prefSnap.exists) {
        const data = prefSnap.data();
        if (data?.channels && data?.categories) {
            prefs = data as typeof CANONICAL_PREFS;
        }
    } else {
        // Auto-create missing preferences with defaults
        const now = admin.firestore.Timestamp.now();
        await prefRef.set({ uid: recipientUid, createdAt: now, updatedAt: now, ...CANONICAL_PREFS });
    }

    if (!prefs.channels.in_app || !prefs.categories[category]) {
        logger.info(`[NOTIF][SUPPRESSED] Pref gate for ${recipientUid} on ${category}`);
        return;
    }

    // 4. PERSISTENCE CONTRACT V1 (With Collapse Logic)
    const dedupeId = `${recipientUid}_${type}_${activity.actor.uid}_${activity.object.entity_id}`;
    const notifRef = db.collection('notifications').doc(dedupeId);
    const unreadRef = db.collection('users').doc(recipientUid).collection('meta').doc('unread');

    const actorSnap = await db.collection('users').doc(activity.actor.uid).get();
    const actorName = actorSnap.exists ? actorSnap.data()?.name : 'Someone';

    await db.runTransaction(async (transaction) => {
        const existingSnap = await transaction.get(notifRef);
        let incrementNeeded = false;

        if (existingSnap.exists) {
            const data = existingSnap.data();
            const createdAt = data?.createdAt?.toMillis() || 0;
            const now = Date.now();

            if (now - createdAt < COLLAPSE_WINDOW_MS) {
                // COLLAPSE: same_actor_same_target_same_type
                transaction.update(notifRef, {
                    count: admin.firestore.FieldValue.increment(1),
                    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    read: false,
                    readAt: null,
                    actorId: activity.actor.uid,
                    entityType,
                    entityId: activity.object.entity_id,
                    postId: entityType === 'post' ? activity.object.entity_id : null,
                });
                if (data?.read === true) incrementNeeded = true;
            } else {
                // EXPIRED WINDOW: Refresh or New Document (V1 replacement strategy)
                incrementNeeded = true;
                transaction.set(notifRef, {
                    uid: recipientUid,
                    type,
                    priority,
                    actor: { uid: activity.actor.uid, name: actorName },
                    target: { entity_type: entityType, entity_id: activity.object.entity_id },
                    actorId: activity.actor.uid,
                    actorType: 'user',
                    entityType,
                    entityId: activity.object.entity_id,
                    postId: entityType === 'post' ? activity.object.entity_id : null,
                    sourceActivityId: event.params.activityId,
                    dedupeId,
                    message: `${actorName} interacted with your ${entityType}`,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    readAt: null,
                    read: false,
                    count: 1
                });
            }
        } else {
            // NEW NOTIFICATION
            incrementNeeded = true;
            transaction.set(notifRef, {
                uid: recipientUid,
                type,
                priority,
                actor: { uid: activity.actor.uid, name: actorName },
                target: { entity_type: entityType, entity_id: activity.object.entity_id },
                actorId: activity.actor.uid,
                actorType: 'user',
                entityType,
                entityId: activity.object.entity_id,
                postId: entityType === 'post' ? activity.object.entity_id : null,
                sourceActivityId: event.params.activityId,
                dedupeId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                readAt: null,
                read: false,
                count: 1
            });
        }

        if (incrementNeeded) {
            transaction.set(unreadRef, {
                notificationsCount: admin.firestore.FieldValue.increment(1),
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
    });
});

/**
 * onNotificationStateChanged
 * Trigger: onUpdate(notifications/{id})
 * Atomic maintenance of the derived unread counter.
 */
export const onNotificationStateChanged = onDocumentUpdated("notifications/{id}", async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;
    if (before.read === false && after.read === true) {
        const unreadRef = db.collection('users').doc(after.uid).collection('meta').doc('unread');
        await unreadRef.set({
            notificationsCount: admin.firestore.FieldValue.increment(-1),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
});

/**
 * onPostDeletedCleanupNotifications
 * Cleanup unread notifications for deleted posts to maintain counter integrity.
 */
export const onPostDeletedCleanupNotifications = onDocumentDeleted("posts/{postId}", async (event) => {
    const { postId } = event.params;
    const snap = await db.collection('notifications')
        .where('target.entity_id', '==', postId)
        .where('read', '==', false)
        .get();

    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
});
