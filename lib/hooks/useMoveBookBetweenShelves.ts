// lib/hooks/useMoveBookBetweenShelves.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { Shelf, ShelfEntry, Book } from '../../types/entities.ts';
import { moveBookBetweenShelves } from '../actions/shelfActions.ts';
import { useToast } from '../../store/toast.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useUserShelves } from './useUserShelves.ts';

export const useMoveBookBetweenShelves = () => {
  const queryClient = useQueryClient();
  const { effectiveUid } = useAuth();
  const { showToast } = useToast();
  const { lang } = useI18n();
  const { data: shelves } = useUserShelves();
  const uid = effectiveUid;

  return useMutation({
    mutationFn: async ({
      fromShelfId,
      toShelfId,
      book
    }: {
      fromShelfId: string;
      toShelfId: string;
      book: Book;
    }) => {
      if (!uid) throw new Error('User not authenticated');
      if (!book) throw new Error('BOOK_REQUIRED');

      return moveBookBetweenShelves({
        uid,
        fromShelfId,
        toShelfId,
        book
      });
    },

    /**
     * -----------------------------
     * Optimistic update
     * -----------------------------
     */
    onMutate: async ({ fromShelfId, toShelfId, book }) => {
      if (!uid) return;

      const bookId = book.id;

      await Promise.all([
        queryClient.cancelQueries({
          queryKey: queryKeys.user.shelves(uid) as unknown as any[]
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.user.shelfEntries(uid, fromShelfId) as unknown as any[]
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.user.shelfEntries(uid, toShelfId) as unknown as any[]
        })
      ]);

      const fromEntriesKey =
        queryKeys.user.shelfEntries(uid, fromShelfId) as unknown as any[];
      const toEntriesKey =
        queryKeys.user.shelfEntries(uid, toShelfId) as unknown as any[];
      const shelvesKey =
        queryKeys.user.shelves(uid) as unknown as any[];

      const previousFromEntries =
        queryClient.getQueryData(fromEntriesKey);
      const previousToEntries =
        queryClient.getQueryData(toEntriesKey);
      const previousShelves =
        queryClient.getQueryData(shelvesKey);

      // ---- Remove from source shelf ----
      queryClient.setQueryData(
        fromEntriesKey,
        (old: any[] = []) =>
          old.filter(entry => entry.bookId !== bookId)
      );

      // ---- Add to target shelf ----
      queryClient.setQueryData(
        toEntriesKey,
        (old: any[] = []) => {
          if (old.some(e => e.bookId === bookId)) return old;

          const newEntry: ShelfEntry = {
            bookId,
            addedAt: new Date().toISOString()
          };

          return [...old, { ...newEntry, book }];
        }
      );

      // ---- Update shelves metadata ----
      queryClient.setQueryData(
        shelvesKey,
        (old: Shelf[] = []) =>
          old.map(shelf => {
            if (shelf.id === fromShelfId) {
              return {
                ...shelf,
                bookCount:
                  typeof shelf.bookCount === 'number'
                    ? Math.max(0, shelf.bookCount - 1)
                    : shelf.bookCount
              };
            }

            if (shelf.id === toShelfId) {
              return {
                ...shelf,
                bookCount:
                  typeof shelf.bookCount === 'number'
                    ? shelf.bookCount + 1
                    : shelf.bookCount
              };
            }

            return shelf;
          })
      );

      return {
        previousFromEntries,
        previousToEntries,
        previousShelves
      };
    },

    onSuccess: (_, vars) => {
      const destShelf = shelves?.find(s => s.id === vars.toShelfId);
      const name = destShelf ? (lang === 'en' ? destShelf.titleEn : destShelf.titleAr) : '';
      showToast(lang === 'en' ? `Book moved to ${name}` : `تم نقل الكتاب إلى ${name}`);
    },

    /**
     * -----------------------------
     * Rollback on error
     * -----------------------------
     */
    onError: (_err, vars, context: any) => {
      if (!uid || !context) return;

      queryClient.setQueryData(
        queryKeys.user.shelfEntries(uid, vars.fromShelfId) as unknown as any[],
        context.previousFromEntries
      );

      queryClient.setQueryData(
        queryKeys.user.shelfEntries(uid, vars.toShelfId) as unknown as any[],
        context.previousToEntries
      );

      queryClient.setQueryData(
        queryKeys.user.shelves(uid) as unknown as any[],
        context.previousShelves
      );
    },

    /**
     * -----------------------------
     * Final invalidation
     * -----------------------------
     */
    onSettled: (_data, _error, vars) => {
      if (!uid) return;

      queryClient.invalidateQueries({
        queryKey: queryKeys.user.shelves(uid) as unknown as any[]
      });

      queryClient.invalidateQueries({
        queryKey:
          queryKeys.user.shelfEntries(uid, vars.fromShelfId) as unknown as any[]
      });

      queryClient.invalidateQueries({
        queryKey:
          queryKeys.user.shelfEntries(uid, vars.toShelfId) as unknown as any[]
      });
    }
  });
};