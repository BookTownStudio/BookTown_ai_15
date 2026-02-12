// lib/hooks/useDuplicateShelf.ts

import { useMutation, useQueryClient } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { Shelf } from '../../types/entities.ts';
import { useToast } from '../../store/toast.tsx';
import { useI18n } from '../../store/i18n.tsx';

interface DuplicateShelfVariables {
  sourceShelf: Shelf;
  newTitleEn: string;
  newTitleAr: string;
  newCoverUrl?: string;
}

/**
 * useDuplicateShelf
 * ------------------------------------------------
 * Authoritative mutation for shelf duplication.
 *
 * logic:
 * - Accepts source shelf data.
 * - Deep clones the entries map (memberships only).
 * - Strips system markers and IDs.
 * - Creates a new user-owned shelf via dataService.
 */
export const useDuplicateShelf = () => {
  const queryClient = useQueryClient();
  const { effectiveUid } = useAuth();
  const { showToast } = useToast();
  const { lang } = useI18n();
  const uid = effectiveUid;

  return useMutation({
    mutationFn: async ({
      sourceShelf,
      newTitleEn,
      newTitleAr,
      newCoverUrl
    }: DuplicateShelfVariables) => {
      if (!uid) throw new Error('AUTH_REQUIRED');

      // 1. Deep clone entries (membership logic only)
      // We explicitly copy the map to avoid reference leakage
      const clonedEntries = sourceShelf.entries
        ? JSON.parse(JSON.stringify(sourceShelf.entries))
        : {};

      // 2. Orchestrate creation
      // dataService.shelves.createShelf handles server timestamps and isSystem=false
      return await dataService.shelves.createShelf(uid, {
        titleEn: newTitleEn,
        titleAr: newTitleAr,
        entries: clonedEntries,
        // Optional: inherit cover if not overridden
        userCoverUrl: newCoverUrl || sourceShelf.userCoverUrl
      } as any);
    },

    onSuccess: () => {
      if (uid) {
        // Invalidate the authoritative library list
        queryClient.invalidateQueries(
          queryKeys.user.shelves(uid) as unknown as any[]
        );
        showToast(lang === 'en' ? 'Shelf duplicated' : 'تم تكرار الرف');
      }
    }
  });
};