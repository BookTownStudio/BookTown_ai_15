import { useQuery, useMutation, useQueryClient } from '../react-query.ts';
import { db } from '../firebase.ts';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

type NotificationPreferenceChannels = {
    in_app: boolean;
    email: boolean;
    push: boolean;
};

type NotificationPreferenceCategories = {
    likes: boolean;
    comments: boolean;
    reposts: boolean;
    follows: boolean;
    mentions: boolean;
    quotes: boolean;
    system: boolean;
    messages: boolean;
};

type NotificationPreferences = {
    uid?: string;
    channels: NotificationPreferenceChannels;
    categories: NotificationPreferenceCategories;
    createdAt?: unknown;
    updatedAt?: unknown;
};

type NotificationPreferenceUpdate = Partial<
    Pick<NotificationPreferences, 'channels' | 'categories'>
>;

/**
 * Canonical Defaults per NOTIFICATION_PREFERENCES_V1
 */
const CANONICAL_DEFAULTS: Pick<NotificationPreferences, 'channels' | 'categories'> = {
    channels: {
        in_app: true,
        email: false,
        push: false
    },
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

/**
 * useNotificationPreferences
 * Authoritative UI hook for managing notification preferences.
 * CONTRACT: Writes to notification_preferences/{uid} (V1).
 */
export const useNotificationPreferences = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const uid = user?.uid;

    const queryKey = [...queryKeys.user.all(uid), 'notification_preferences', uid];

    const query = useQuery<NotificationPreferences>({
        queryKey,
        queryFn: async () => {
            if (!uid) throw new Error("Unauthenticated");
            const ref = doc(db.raw, 'notification_preferences', uid);
            const snap = await getDoc(ref);
            
            if (snap.exists()) {
                return snap.data() as NotificationPreferences;
            }
            
            return {
                ...CANONICAL_DEFAULTS,
                uid,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        },
        enabled: !!uid,
    });

    const mutation = useMutation({
        mutationFn: async (updates: NotificationPreferenceUpdate) => {
            if (!uid) throw new Error("Unauthenticated");
            const ref = doc(db.raw, 'notification_preferences', uid);
            
            const existing: NotificationPreferences = query.data || {
                ...CANONICAL_DEFAULTS,
                uid,
            };
            const newData = {
                ...existing,
                ...updates,
                updatedAt: serverTimestamp()
            };

            await setDoc(ref, newData, { merge: true });
            return newData;
        },
        onMutate: async (updates) => {
            await queryClient.cancelQueries({ queryKey: queryKey });
            const previous = queryClient.getQueryData<NotificationPreferences>(queryKey);
            
            if (previous) {
                queryClient.setQueryData(queryKey, {
                    ...previous,
                    ...updates
                });
            }
            return { previous };
        },
        onError: (err, vars, context: any) => {
            if (context?.previous) {
                queryClient.setQueryData(queryKey, context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKey });
        }
    });

    return {
        preferences: query.data,
        isLoading: query.isLoading,
        update: mutation.mutate,
        isUpdating: mutation.isPending
    };
};
