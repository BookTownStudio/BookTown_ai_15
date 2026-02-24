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
      const duplicated = await dataService.shelves.duplicateShelf(uid, sourceShelf.id, {
        titleEn: newTitleEn,
        titleAr: newTitleAr,
      });

      if (newCoverUrl && newCoverUrl.trim()) {
        await dataService.shelves.updateShelf(uid, duplicated.id, {
          userCoverUrl: newCoverUrl.trim(),
        } as Partial<Shelf>);
        return {
          ...duplicated,
          userCoverUrl: newCoverUrl.trim(),
        };
      }

      return duplicated;
    },

    onSuccess: (duplicatedShelf, variables) => {
      if (uid) {
        console.debug('[SOCIAL][SHELF_DUPLICATED]', {
          sourceShelfId: variables.sourceShelf.id,
          sourceOwnerId: variables.sourceShelf.ownerId,
          newShelfId: duplicatedShelf.id,
          duplicatorUid: uid,
          timestamp: new Date().toISOString(),
        });
        // Invalidate the authoritative library list
        queryClient.invalidateQueries(
          queryKeys.user.shelves(uid) as unknown as any[]
        );
        showToast(lang === 'en' ? 'Shelf duplicated' : 'تم تكرار الرف');
      }
    }
  });
};
