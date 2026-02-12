// lib/hooks/useToggleBookOnShelf.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth.tsx';
import { queryKeys } from '../queryKeys.ts';
import { ShelfEntry, Book, Shelf } from '../../types/entities.ts';
import { useToast } from '../../store/toast.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useUserShelves } from './useUserShelves.ts';

import {
  addBookToShelf,
  removeBookFromShelf
} from '../actions/shelfActions.ts';

/**
 * System shelf identifiers
 */
const SYSTEM_CURRENTLY_READING_SHELF_ID = 'currently-reading';

/**
 * -------------------------------------------------
 * TOGGLE BOOK ON SHELF (ADD)
 * -------------------------------------------------
 * UI hook only:
 * - optimistic updates
 * - cache reconciliation
 * - delegates ALL logic to shelfActions
 *
 * 🔒 HARD RULE (UPDATED):
 * - This hook DOES allow mutations on "currently-reading"
 * - Reading state initialization is handled in shelfActions (write-through)
 */
export const useToggleBookOnShelf = () => {
  const queryClient = useQueryClient();
  const { effectiveUid } = useAuth();
  const uid = effectiveUid;

  return useMutation({
    mutationFn: async ({
      shelfId,
      bookId,
      book
    }: {
      shelfId: string;
      bookId: string;
      book?: Book;
    }) => {
      if (!uid) throw new Error('User not authenticated');
      if (!book) throw new Error('BOOK_REQUIRED');

      // ✅ Allow ALL shelves, including "currently-reading"
      await addBookToShelf({
        uid,
        shelfId,
        book
      });

      return {
        shelfId,
        bookId,
        book
      };
    },

    /**
     * -----------------------------
     * Optimistic update
     * -----------------------------
     */
    onMutate: async ({ shelfId, bookId, book }) => {
      if (!uid) return;

      await Promise.all([
        queryClient.cancelQueries({
          queryKey: queryKeys.user.shelves(uid) as unknown as any[]
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.user.shelfEntries(uid, shelfId) as unknown as any[]
        })
      ]);

      const shelfEntriesKey =
        queryKeys.user.shelfEntries(uid, shelfId) as unknown as any[];
      const shelvesKey =
        queryKeys.user.shelves(uid) as unknown as any[];

      const previousEntries =
        queryClient.getQueryData(shelfEntriesKey);
      const previousShelves =
        queryClient.getQueryData(shelvesKey);

      const optimisticBook =
        book || {
          id: bookId,
          titleEn: 'Loading...',
          titleAr: 'جار التحميل...'
        };

      // ---- Optimistic shelf entries ----
      queryClient.setQueryData(
        shelfEntriesKey,
        (old: any[] = []) => {
          if (old.some(e => e.bookId === bookId)) return old;

          const newEntry: ShelfEntry = {
            bookId,
            addedAt: new Date().toISOString()
          };

          return [...old, { ...newEntry, book: optimisticBook }];
        }
      );

      // ---- Optimistic shelves list ----
      queryClient.setQueryData(
        shelvesKey,
        (old: Shelf[] = []) =>
          old.map(shelf => {
            if (shelf.id !== shelfId) return shelf;

            const updatedEntries = {
              ...(shelf.entries || {}),
              [bookId]: {
                bookId,
                addedAt: new Date().toISOString()
              } as ShelfEntry
            };

            return {
              ...shelf,
              entries: updatedEntries,
              bookCount:
                typeof shelf.bookCount === 'number'
                  ? shelf.bookCount + 1
                  : shelf.bookCount
            };
          })
      );

      return { previousEntries, previousShelves };
    },

    /**
     * -----------------------------
     * Rollback on failure
     * -----------------------------
     */
    onError: (_err, vars, context: any) => {
      if (!uid || !context) return;

      queryClient.setQueryData(
        queryKeys.user.shelfEntries(uid, vars.shelfId) as unknown as any[],
        context.previousEntries
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
        queryKey: queryKeys.user.shelfEntries(uid, vars.shelfId) as unknown as any[]
      });
    }
  });
};

/**
 * -------------------------------------------------
 * REMOVE BOOK FROM SHELF
 * -------------------------------------------------
 * Delegates to shelfActions, keeps optimistic UX
 *
 * NOTE (UNCHANGED):
 * - Removing from "currently-reading" removes membership
 * - Reading state archival is handled downstream (later phase)
 */
export const useRemoveBookFromShelf = () => {
  const queryClient = useQueryClient();
  const { effectiveUid } = useAuth();
  const { showToast } = useToast();
  const { lang } = useI18n();
  const { data: shelves } = useUserShelves();
  const uid = effectiveUid;

  return useMutation({
    mutationFn: ({ shelfId, bookId }: { shelfId: string; bookId: string }) => {
      if (!uid) throw new Error('User not authenticated');

      return removeBookFromShelf({
        uid,
        shelfId,
        bookId
      });
    },

    onMutate: async ({ shelfId, bookId }) => {
      if (!uid) return;

      await Promise.all([
        queryClient.cancelQueries({
          queryKey: queryKeys.user.shelves(uid) as unknown as any[]
        }),
        queryClient.cancelQueries({
          queryKey: queryKeys.user.shelfEntries(uid, shelfId) as unknown as any[]
        })
      ]);

      const shelfEntriesKey =
        queryKeys.user.shelfEntries(uid, shelfId) as unknown as any[];
      const shelvesKey =
        queryKeys.user.shelves(uid) as unknown as any[];

      const previousEntries =
        queryClient.getQueryData(shelfEntriesKey);
      const previousShelves =
        queryClient.getQueryData(shelvesKey);

      queryClient.setQueryData(
        shelfEntriesKey,
        (old: any[] = []) =>
          old.filter(entry => entry.bookId !== bookId)
      );

      queryClient.setQueryData(
        shelvesKey,
        (old: Shelf[] = []) =>
          old.map(shelf => {
            if (shelf.id !== shelfId) return shelf;

            const updatedEntries = { ...(shelf.entries || {}) };
            delete updatedEntries[bookId];

            return {
              ...shelf,
              entries: updatedEntries,
              bookCount:
                typeof shelf.bookCount === 'number'
                  ? Math.max(0, shelf.bookCount - 1)
                  : shelf.bookCount
            };
          })
      );

      return { previousEntries, previousShelves };
    },

    onSuccess: (_, vars) => {
      if (!uid) return;
      const shelf = shelves?.find(s => s.id === vars.shelfId);
      const name = shelf ? (lang === 'en' ? shelf.titleEn : shelf.titleAr) : '';
      showToast(
        lang === 'en'
          ? `Book removed from ${name}`
          : `تمت إزالة الكتاب من ${name}`
      );
    },

    onError: (_err, vars, context: any) => {
      if (!uid || !context) return;

      queryClient.setQueryData(
        queryKeys.user.shelfEntries(uid, vars.shelfId) as unknown as any[],
        context.previousEntries
      );

      queryClient.setQueryData(
        queryKeys.user.shelves(uid) as unknown as any[],
        context.previousShelves
      );
    },

    onSettled: (_data, _error, vars) => {
      if (!uid) return;

      queryClient.invalidateQueries({
        queryKey: queryKeys.user.shelves(uid) as unknown as any[]
      });

      queryClient.invalidateQueries({
        queryKey: queryKeys.user.shelfEntries(uid, vars.shelfId) as unknown as any[]
      });
    }
  });
};