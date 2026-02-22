import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { ensureSystemMetricsInitialized } from "../analytics/initMetrics";
import { incrementGlobalMetricInTransaction } from "../analytics/metricsUtils";
import { logSystemEvent } from "../analytics/eventLogger";
import { processMetricEventIdempotently } from "../analytics/metricIdempotency";

const db = admin.firestore();
const ENVIRONMENT = process.env.APP_ENV === "staging" ? "staging" : "prod";
const APP_VERSION = process.env.APP_VERSION || "unknown";

async function safeLogSystemEvent(
    params: Parameters<typeof logSystemEvent>[0]
): Promise<void> {
    try {
        await logSystemEvent(params);
    } catch (err) {
        console.error("[EventLogger]", err);
    }
}

async function emitActivityLog(data: {
    actor: { uid: string; type: 'user' };
    verb: string;
    object: { entity_type: string; entity_id: string };
    context: { target_owner_uid: string | null; visibility: 'public' | 'private' };
    metadata?: { source: string; ui_surface: string };
}) {
    try {
        await db.collection('activity_log').add({
            ...data,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            version: "1.0"
        });
    } catch (error) {
        logger.error(`[ACTIVITY_LOG][ERROR] Failed to emit log:`, error);
    }
}

// --- TRIGGERS ---

export const onActivityPostCreated = onDocumentCreated("posts/{postId}", async (event) => {
    const data = event.data?.data();
    if (!data) return;
    await Promise.all([
        emitActivityLog({
            actor: { uid: data.authorId, type: 'user' },
            verb: 'post_created',
            object: { entity_type: 'post', entity_id: event.params.postId },
            context: { target_owner_uid: null, visibility: 'public' },
            metadata: { source: 'web', ui_surface: 'social' }
        }),
        (async () => {
            await ensureSystemMetricsInitialized();
            await processMetricEventIdempotently(event.id, async (tx) => {
                incrementGlobalMetricInTransaction(tx, "totalPosts", 1);
            });
        })(),
    ]);

    const authorId = typeof data.authorId === "string" ? data.authorId.trim() : "";
    if (authorId) {
        await safeLogSystemEvent({
            type: "post_created",
            uid: authorId,
            entityId: event.params.postId,
            dedupeKey: event.id,
            metadata: {
                source: "trigger.onActivityPostCreated",
            },
            environment: ENVIRONMENT,
            appVersion: APP_VERSION,
        });
    }
});

export const onActivityPostLiked = onDocumentCreated("users/{userId}/likes/{postId}", async (event) => {
    // Intentionally no-op: likeSocialPost callable is the single source of truth for this verb.
    return;
});

export const onActivityPostBookmarked = onDocumentCreated("users/{userId}/post_bookmarks/{postId}", async (event) => {
    const postSnap = await db.collection('posts').doc(event.params.postId).get();
    const targetOwner = postSnap.exists ? postSnap.data()?.authorId : null;

    await emitActivityLog({
        actor: { uid: event.params.userId, type: 'user' },
        verb: 'post_bookmarked',
        object: { entity_type: 'post', entity_id: event.params.postId },
        context: { target_owner_uid: targetOwner, visibility: 'private' },
        metadata: { source: 'web', ui_surface: 'detail' }
    });
});

export const onActivityPostCommented = onDocumentCreated("posts/{postId}/comments/{commentId}", async (event) => {
    // Intentionally no-op: addSocialComment callable is the single source of truth for this verb.
    return;
});

export const onActivityPostReposted = onDocumentCreated(
  { document: "users/{userId}/reposts/{postId}" },
  async (event) => {
    // Intentionally no-op: repostSocialPost callable is the single source of truth for this verb.
    return;
});

export const onActivityPostDeleted = onDocumentDeleted("posts/{postId}", async (event) => {
    const data = event.data?.data();
    if (!data) return;
    await emitActivityLog({
        actor: { uid: data.authorId, type: 'user' },
        verb: 'post_deleted',
        object: { entity_type: 'post', entity_id: event.params.postId },
        context: { target_owner_uid: null, visibility: 'public' },
        metadata: { source: 'web', ui_surface: 'social' }
    });
});

export const onActivityUserFollowed = onDocumentCreated("users/{userId}/followers/{followerId}", async (event) => {
    await emitActivityLog({
        actor: { uid: event.params.followerId, type: 'user' },
        verb: 'user_followed',
        object: { entity_type: 'user', entity_id: event.params.userId },
        context: { target_owner_uid: event.params.userId, visibility: 'public' },
        metadata: { source: 'web', ui_surface: 'profile' }
    });
});
