import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '../react-query.ts';
import { getFirebaseDb } from '../firebase.ts';
import {
    collection,
    query,
    orderBy,
    limit,
    doc,
    getDoc,
    updateDoc,
    getDocs,
    where,
    startAfter,
    QueryDocumentSnapshot,
    DocumentData,
    serverTimestamp,
    writeBatch
} from 'firebase/firestore';
import { useAuth } from '../auth.tsx';
import { Notification } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';
import { dataService } from '../../services/dataService.ts';

const cursorRegistry = new Map<string, QueryDocumentSnapshot<DocumentData>>();

/**
 * useInfiniteNotifications
 * Authoritative paged read path for user notifications.
 */
export const useInfiniteNotifications = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useInfiniteQuery({
        queryKey: [...queryKeys.user.notifications(uid), 'infinite'],
        queryFn: async ({ pageParam }) => {
            if (!uid) return { notifications: [], nextCursor: undefined };

            const db = getFirebaseDb();

            // Mock / fallback mode
            if (!db) {
                const list = await dataService.notifications.getNotifications(uid);
                return { notifications: list, nextCursor: undefined };
            }

            try {
                let q = query(
                    collection(db, 'search_notifications'),
                    where('uid', '==', uid),
                    orderBy('createdAt', 'desc'),
                    limit(20)
                );

                if (pageParam && cursorRegistry.has(pageParam)) {
                    const docSnap = cursorRegistry.get(pageParam);
                    if (docSnap) q = query(q, startAfter(docSnap));
                }

                const snap = await getDocs(q);

                const notifications = await Promise.all(
                    snap.docs.map(async (indexDoc) => {
                        const primarySnap = await getDoc(
                            doc(db, 'notifications', indexDoc.id)
                        );

                        if (primarySnap.exists()) {
                            const data = primarySnap.data();
                            return {
                                id: indexDoc.id,
                                ...data,
                                createdAt:
                                    data.createdAt?.toDate?.()?.toISOString() ||
                                    data.createdAt ||
                                    new Date().toISOString()
                            } as Notification;
                        }
                        return null;
                    })
                );

                const validNotifications = notifications.filter(
                    (n): n is Notification => n !== null
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
        getNextPageParam: (lastPage) => lastPage.nextCursor,
    });
};

/**
 * useUnreadNotificationsCount
 * Backend-authoritative counter.
 */
export const useUnreadNotificationsCount = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useQuery<number>({
        queryKey: [...queryKeys.user.notifications(uid), 'unread-count'],
        queryFn: async () => {
            if (!uid) return 0;

            const db = getFirebaseDb();
            if (!db) return 0;

            const ref = doc(db, 'users', uid, 'meta', 'unread');
            const snap = await getDoc(ref);

            if (snap.exists()) {
                return snap.data().notificationsCount || 0;
            }
            return 0;
        },
        enabled: !!uid,
        staleTime: 1000 * 30,
        refetchInterval: 1000 * 60,
    });
};

/**
 * useToggleNotificationRead
 * Optimistic single-item read state.
 */
export const useToggleNotificationRead = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async ({ notificationId }: { notificationId: string }) => {
            if (!uid) return;

            const db = getFirebaseDb();
            if (!db) return;

            const ref = doc(db, 'notifications', notificationId);
            const snap = await getDoc(ref);

            if (snap.exists() && snap.data().read === true) return;

            await updateDoc(ref, {
                read: true,
                readAt: serverTimestamp()
            });
        },
        onMutate: async ({ notificationId }) => {
            if (!uid) return;

            const infiniteKey = [...queryKeys.user.notifications(uid), 'infinite'];
            const countKey = [...queryKeys.user.notifications(uid), 'unread-count'];

            await queryClient.cancelQueries(infiniteKey);
            await queryClient.cancelQueries(countKey);

            const previousInfinite = queryClient.getQueryData<any>(infiniteKey);
            const previousCount = queryClient.getQueryData<number>(countKey);

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

            if (previousCount && previousCount > 0) {
                queryClient.setQueryData(countKey, previousCount - 1);
            }

            return { previousInfinite, previousCount };
        },
        onError: (_err, _vars, ctx: any) => {
            if (!uid || !ctx) return;
            queryClient.setQueryData(
                [...queryKeys.user.notifications(uid), 'infinite'],
                ctx.previousInfinite
            );
            queryClient.setQueryData(
                [...queryKeys.user.notifications(uid), 'unread-count'],
                ctx.previousCount
            );
        },
        onSettled: () => {
            if (uid) {
                queryClient.invalidateQueries(
                    queryKeys.user.notifications(uid) as unknown as any[]
                );
            }
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

            const db = getFirebaseDb();
            if (!db) return;

            const q = query(
                collection(db, 'notifications'),
                where('uid', '==', uid),
                where('read', '==', false),
                limit(100)
            );

            const snap = await getDocs(q);
            if (snap.empty) return;

            const batch = writeBatch(db);

            snap.docs.forEach(d => {
                batch.update(doc(db, 'notifications', d.id), {
                    read: true,
                    readAt: serverTimestamp()
                });
            });

            const unreadRef = doc(db, 'users', uid, 'meta', 'unread');
            batch.set(
                unreadRef,
                {
                    notificationsCount: 0,
                    lastUpdatedAt: serverTimestamp()
                },
                { merge: true }
            );

            await batch.commit();
        },
        onMutate: async () => {
            if (!uid) return;

            const infiniteKey = [...queryKeys.user.notifications(uid), 'infinite'];
            const countKey = [...queryKeys.user.notifications(uid), 'unread-count'];

            await queryClient.cancelQueries(infiniteKey);
            await queryClient.cancelQueries(countKey);

            const previousInfinite = queryClient.getQueryData<any>(infiniteKey);
            const previousCount = queryClient.getQueryData<number>(countKey);

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

            queryClient.setQueryData(countKey, 0);
            return { previousInfinite, previousCount };
        },
        onError: (_err, _vars, ctx: any) => {
            if (!uid || !ctx) return;
            queryClient.setQueryData(
                [...queryKeys.user.notifications(uid), 'infinite'],
                ctx.previousInfinite
            );
            queryClient.setQueryData(
                [...queryKeys.user.notifications(uid), 'unread-count'],
                ctx.previousCount
            );
        },
        onSettled: () => {
            if (uid) {
                queryClient.invalidateQueries(
                    queryKeys.user.notifications(uid) as unknown as any[]
                );
            }
        }
    });
};