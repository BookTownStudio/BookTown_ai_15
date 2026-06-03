import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '../react-query.ts';
import type { InfiniteData } from '@tanstack/react-query';
import { getFirebaseDb } from '../firebase.ts';
import {
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    where,
    startAfter,
    QueryDocumentSnapshot,
    DocumentData,
} from 'firebase/firestore';
import { useAuth } from '../auth.tsx';
import { Notification } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';
import { dataService } from '../../services/dataService.ts';
import { callCallableEndpoint } from '../callable.ts';
import { invalidateNotificationConvergence } from '../socialCacheReconciliation.ts';

const cursorRegistry = new Map<string, QueryDocumentSnapshot<DocumentData>>();

type NotificationsPage = {
    notifications: Notification[];
    nextCursor?: string;
};

type NotificationSummary = {
    unreadCount: number;
    latestNotificationAt: string | null;
    lastReadAt: string | null;
};

const toIsoDate = (value: any): string => {
    if (typeof value === 'string' && value.trim()) return value;
    if (value?.toDate) return value.toDate().toISOString();
    return new Date().toISOString();
};

const mapNotification = (id: string, data: Record<string, any>): Notification => {
    const actorUid =
        (typeof data.actorId === 'string' && data.actorId) ||
        (typeof data.actor?.uid === 'string' ? data.actor.uid : '');
    const actorType =
        (typeof data.actorType === 'string' && data.actorType === 'system')
            ? 'system'
            : 'user';
    const entityTypeRaw =
        (typeof data.entityType === 'string' && data.entityType) ||
        (typeof data.target?.entity_type === 'string' ? data.target.entity_type : 'post');
    const entityType =
        entityTypeRaw === 'post' ||
        entityTypeRaw === 'book' ||
        entityTypeRaw === 'quote' ||
        entityTypeRaw === 'shelf' ||
        entityTypeRaw === 'profile' ||
        entityTypeRaw === 'conversation'
            ? entityTypeRaw
            : 'post';
    const entityId =
        (typeof data.entityId === 'string' && data.entityId) ||
        (typeof data.target?.entity_id === 'string' ? data.target.entity_id : '');
    const typeRaw = typeof data.type === 'string' ? data.type : 'system';
    const type =
        typeRaw === 'like' ||
        typeRaw === 'comment' ||
        typeRaw === 'repost' ||
        typeRaw === 'follow' ||
        typeRaw === 'mention' ||
        typeRaw === 'system' ||
        typeRaw === 'dm'
            ? typeRaw
            : 'system';
    const priorityRaw = typeof data.priority === 'string' ? data.priority : 'medium';
    const priority =
        priorityRaw === 'low' || priorityRaw === 'medium' || priorityRaw === 'high'
            ? priorityRaw
            : 'medium';

    return {
        id,
        uid: typeof data.uid === 'string' ? data.uid : '',
        type,
        priority,
        actor: {
            uid: actorUid,
            name: typeof data.actor?.name === 'string' ? data.actor.name : undefined,
        },
        target: {
            entity_type: entityType,
            entity_id: entityId,
        },
        actorId: actorUid,
        actorType,
        entityType,
        entityId,
        postId:
            typeof data.postId === 'string'
                ? data.postId
                : entityType === 'post'
                    ? entityId
                    : null,
        message: typeof data.message === 'string' ? data.message : '',
        createdAt: toIsoDate(data.createdAt),
        readAt: data.readAt || null,
        read: data.read === true,
        sourceActivityId: typeof data.sourceActivityId === 'string' ? data.sourceActivityId : '',
        dedupeId: typeof data.dedupeId === 'string' ? data.dedupeId : id,
        count: typeof data.count === 'number' ? data.count : undefined,
    };
};

/**
 * useInfiniteNotifications
 * Authoritative paged read path for user notifications.
 */
export const useInfiniteNotifications = () => {
    const { user, isAuthReady } = useAuth();
    const uid = user?.uid;
    const enabled = !!uid && isAuthReady;

    return useInfiniteQuery<
        NotificationsPage,
        Error,
        InfiniteData<NotificationsPage, string | undefined>,
        readonly unknown[],
        string | undefined
    >({
        queryKey: [...queryKeys.user.notifications(uid), 'infinite'],
        queryFn: async ({ pageParam }): Promise<NotificationsPage> => {
            if (!enabled || !uid) return { notifications: [], nextCursor: undefined };

            const db = getFirebaseDb();

            // Mock / fallback mode
            if (!db) {
                const list = await dataService.notifications.getNotifications(uid);
                return { notifications: list, nextCursor: undefined };
            }

            try {
                let q = query(
                    collection(db, 'notifications'),
                    where('uid', '==', uid),
                    orderBy('createdAt', 'desc'),
                    limit(20)
                );

                if (pageParam && cursorRegistry.has(pageParam)) {
                    const docSnap = cursorRegistry.get(pageParam);
                    if (docSnap) q = query(q, startAfter(docSnap));
                }

                const snap = await getDocs(q);
                const validNotifications = snap.docs.map((notificationDoc) =>
                    mapNotification(
                        notificationDoc.id,
                        notificationDoc.data() as Record<string, any>
                    )
                );

                const lastDoc = snap.docs[snap.docs.length - 1];
                let nextCursor: string | undefined;

                if (lastDoc) {
                    nextCursor = lastDoc.id;
                    cursorRegistry.set(nextCursor, lastDoc);
                }

                return { notifications: validNotifications, nextCursor };
            } catch (error) {
                console.error('[NOTIFICATIONS][INDEX_ERROR]', error);
                throw error;
            }
        },
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled,
    });
};

/**
 * useUnreadNotificationsCount
 * Backend-authoritative counter.
 */
export const useNotificationSummary = () => {
    const { user, isAuthReady } = useAuth();
    const uid = user?.uid;
    const enabled = !!uid && isAuthReady;

    return useQuery<NotificationSummary>({
        queryKey: [...queryKeys.user.notifications(uid), 'summary'],
        queryFn: async () => {
            if (!enabled || !uid) {
                return { unreadCount: 0, latestNotificationAt: null, lastReadAt: null };
            }
            return callCallableEndpoint<Record<string, never>, NotificationSummary>(
                'getNotificationSummary',
                {}
            );
        },
        enabled,
        staleTime: 1000 * 30,
    });
};

export const useUnreadNotificationsCount = () => {
    const summary = useNotificationSummary();
    return {
        ...summary,
        data: summary.data?.unreadCount ?? 0,
    };
};

/**
 * useToggleNotificationRead
 * Server-reconciled single-item read state.
 */
export const useToggleNotificationRead = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async ({ notificationId }: { notificationId: string }) => {
            if (!uid) return;
            await callCallableEndpoint<
                { notificationId: string },
                { notificationId: string; updated: boolean }
            >('markNotificationRead', { notificationId });
        },
        onMutate: async ({ notificationId }) => {
            if (!uid) return;

            const infiniteKey = [...queryKeys.user.notifications(uid), 'infinite'];

            await queryClient.cancelQueries({ queryKey: infiniteKey });

            const previousInfinite = queryClient.getQueryData<any>(infiniteKey);

            if (previousInfinite) {
                queryClient.setQueryData(infiniteKey, (old: any) => ({
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        notifications: page.notifications.map((n: Notification) =>
                            n.id === notificationId
                                ? { ...n, read: true, readAt: new Date().toISOString() }
                                : n
                        )
                    }))
                }));
            }

            return { previousInfinite };
        },
        onError: (_err, _vars, ctx: any) => {
            if (!uid || !ctx) return;
            queryClient.setQueryData(
                [...queryKeys.user.notifications(uid), 'infinite'],
                ctx.previousInfinite
            );
        },
        onSettled: async () => {
            await invalidateNotificationConvergence(queryClient, uid);
        }
    });
};

/**
 * useMarkAllAsRead
 * Bulk read operation.
 */
export const useMarkAllAsRead = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async () => {
            if (!uid) return;
            await callCallableEndpoint<
                Record<string, never>,
                { updatedCount: number; complete: boolean }
            >('markAllNotificationsRead', {});
        },
        onMutate: async () => {
            if (!uid) return;

            const infiniteKey = [...queryKeys.user.notifications(uid), 'infinite'];

            await queryClient.cancelQueries({ queryKey: infiniteKey });

            const previousInfinite = queryClient.getQueryData<any>(infiniteKey);

            if (previousInfinite) {
                queryClient.setQueryData(infiniteKey, (old: any) => ({
                    ...old,
                    pages: old.pages.map((page: any) => ({
                        ...page,
                        notifications: page.notifications.map((n: Notification) => ({
                            ...n,
                            read: true,
                            readAt: new Date().toISOString()
                        }))
                    }))
                }));
            }

            return { previousInfinite };
        },
        onError: (_err, _vars, ctx: any) => {
            if (!uid || !ctx) return;
            queryClient.setQueryData(
                [...queryKeys.user.notifications(uid), 'infinite'],
                ctx.previousInfinite
            );
        },
        onSettled: async () => {
            await invalidateNotificationConvergence(queryClient, uid);
        }
    });
};
