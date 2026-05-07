import { useMutation, useQueryClient } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { dataService } from '../../services/dataService.ts';
import { User } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';
import { useToast } from '../../store/toast.tsx';
import { useI18n } from '../../store/i18n.tsx';

type UpdateProfileVariables = Partial<Pick<User, 'name' | 'handle' | 'bioEn' | 'bioAr' | 'avatarUrl' | 'bannerUrl' | 'aiConsent'>>;

export const useUpdateProfile = () => {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { showToast } = useToast();
    const { lang } = useI18n();
    const uid = user?.uid;

    return useMutation({
        mutationFn: async (updates: UpdateProfileVariables) => {
            if (!uid) throw new Error("User not authenticated");
            const sanitizedUpdates = Object.fromEntries(
                Object.entries(updates).filter(([, value]) => value !== undefined)
            ) as UpdateProfileVariables;
            if (Object.keys(sanitizedUpdates).length > 0) {
                await dataService.users.updateProfile(uid, sanitizedUpdates);
            }
            return { success: true, updatedData: sanitizedUpdates };
        },
        onMutate: async (updates) => {
            if (!uid) return;
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            await queryClient.cancelQueries({ queryKey: queryKeys.user.profile(uid) as unknown as any[] });
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            const previousProfile = queryClient.getQueryData(queryKeys.user.profile(uid) as unknown as any[]);
            
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            queryClient.setQueryData(queryKeys.user.profile(uid) as unknown as any[], (old: User) => ({
                ...old,
                ...updates
            }));
            
            return { previousProfile };
        },
        onError: (err: any, _vars, context: any) => {
            if (uid && context?.previousProfile) {
                // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
                queryClient.setQueryData(queryKeys.user.profile(uid) as unknown as any[], context.previousProfile);
            }
            const fallback = lang === 'en' ? 'Failed to update profile.' : 'فشل تحديث الملف الشخصي.';
            showToast(err?.message || fallback);
        },
        onSettled: () => {
            // FIX: Cast readonly query key to any[] to satisfy mutable parameter requirement.
            if (uid) queryClient.invalidateQueries({ queryKey: queryKeys.user.profile(uid) as unknown as any[] });
        },
    });
};
