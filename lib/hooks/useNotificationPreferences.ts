import { useQuery, useMutation, useQueryClient } from '../react-query.ts';
import { db } from '../firebase.ts';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';

/**
 * Canonical Defaults per NOTIFICATION_PREFERENCES_V1
 */
const CANONICAL_DEFAULTS = {
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
        system: true
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

    const query = useQuery({
        queryKey,
        queryFn: async () => {
            if (!uid) throw new Error("Unauthenticated");
            const ref = doc(db.raw, 'notification_preferences', uid);
            const snap = await getDoc(ref);
            
            if (snap.exists()) {
                return snap.data();
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
        mutationFn: async (updates: any) => {
            if (!uid) throw new Error("Unauthenticated");
            const ref = doc(db.raw, 'notification_preferences', uid);
            
            const existing = (query.data as any) || CANONICAL_DEFAULTS;
            const newData = {
                ...existing,
                ...updates,
                updatedAt: serverTimestamp()
            };

            await setDoc(ref, newData, { merge: true });
            return newData;
        },
        onMutate: async (updates) => {
            await queryClient.cancelQueries(queryKey);
            const previous = queryClient.getQueryData(queryKey);
            
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
            queryClient.invalidateQueries(queryKey);
        }
    });

    return {
        preferences: query.data,
        isLoading: query.isLoading,
        update: mutation.mutate,
        isUpdating: mutation.isLoading
    };
};