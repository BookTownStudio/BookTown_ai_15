
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { Bookmark } from '../../types/entities.ts';
import { queryKeys } from '../queryKeys.ts';

/**
 * useBookmarks
 * Authoritative read path for user-saved items.
 * ENFORCEMENT: Fetches canonical post/quote bookmarks from users/{uid}/bookmarks.
 */
export const useBookmarks = () => {
    const { user } = useAuth();
    const uid = user?.uid;

    return useQuery<Bookmark[]>({
        // FIX: Cast readonly queryKey tuple to mutable any[] through unknown to satisfy signature requirements.
        queryKey: queryKeys.user.bookmarks(uid) as unknown as any[],
        queryFn: async () => {
            if (!uid) return [];
            try {
                return await dataService.users.getBookmarks(uid);
            } catch (error: any) {
                console.error("[HOOK][BOOKMARKS] Authoritative fetch failed:", error);
                throw error;
            }
        },
        enabled: !!uid,
        staleTime: 1000 * 30, // 30 seconds fresh time for collection list
    });
};
