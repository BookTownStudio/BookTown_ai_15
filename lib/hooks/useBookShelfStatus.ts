// lib/hooks/useBookShelfStatus.ts

import { useCallback, useMemo } from 'react';
import { useQuery } from '../react-query.ts';
import { useAuth } from '../auth.tsx';
import { callCallableEndpoint } from '../callable.ts';

const SYSTEM_CURRENTLY_READING_SHELF_ID = 'currently-reading';

export const bookShelfMembershipQueryKey = (uid?: string, bookId?: string) =>
  ['bookShelfMembership', uid || 'anon', bookId || 'none'] as const;

type BookShelfMembershipProjection = {
  uid: string;
  bookId: string;
  source: 'shelf_books';
  membershipAuthority: 'shelf_books';
  isOnAnyShelf: boolean;
  shelfIds: string[];
  shelfNames: string[];
  shelves: Array<{
    shelfId: string;
    shelfName: string;
  }>;
  hasMore: boolean;
  readingState: {
    exists: boolean;
    status_state: 'reading' | 'paused' | 'abandoned' | 'completed' | 'rereading' | null;
    updatedAt: string | null;
  };
};

const normalizeProjection = (
  value: BookShelfMembershipProjection | null | undefined
): BookShelfMembershipProjection => ({
  uid: typeof value?.uid === 'string' ? value.uid : '',
  bookId: typeof value?.bookId === 'string' ? value.bookId : '',
  source: 'shelf_books',
  membershipAuthority: 'shelf_books',
  isOnAnyShelf: value?.isOnAnyShelf === true,
  shelfIds: Array.isArray(value?.shelfIds)
    ? value.shelfIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : [],
  shelfNames: Array.isArray(value?.shelfNames)
    ? value.shelfNames.filter((name): name is string => typeof name === 'string')
    : [],
  shelves: Array.isArray(value?.shelves)
    ? value.shelves
        .map((shelf) => ({
          shelfId: typeof shelf.shelfId === 'string' ? shelf.shelfId.trim() : '',
          shelfName: typeof shelf.shelfName === 'string' ? shelf.shelfName.trim() : '',
        }))
        .filter((shelf) => shelf.shelfId.length > 0)
    : [],
  hasMore: value?.hasMore === true,
  readingState: {
    exists: value?.readingState?.exists === true,
    status_state:
      value?.readingState?.status_state === 'reading' ||
      value?.readingState?.status_state === 'paused' ||
      value?.readingState?.status_state === 'abandoned' ||
      value?.readingState?.status_state === 'completed' ||
      value?.readingState?.status_state === 'rereading'
        ? value.readingState.status_state
        : null,
    updatedAt:
      typeof value?.readingState?.updatedAt === 'string'
        ? value.readingState.updatedAt
        : null,
  },
});

export const useBookShelfStatus = (bookId?: string) => {
  const { effectiveUid, isAuthReady } = useAuth() as any;
  const uid = typeof effectiveUid === 'string' ? effectiveUid : undefined;
  const enabled = (isAuthReady ?? true) && Boolean(uid && bookId);

  const query = useQuery<BookShelfMembershipProjection>({
    queryKey: bookShelfMembershipQueryKey(uid, bookId),
    enabled,
    queryFn: async () => {
      if (!uid || !bookId) return normalizeProjection(null);
      const projection = await callCallableEndpoint<
        { uid: string; bookId: string },
        BookShelfMembershipProjection
      >('getBookShelfMembership', {
        uid,
        bookId,
      });
      return normalizeProjection(projection);
    },
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });

  const projection = query.data ?? normalizeProjection(null);
  const shelfIdSet = useMemo(
    () => new Set(projection.shelfIds),
    [projection.shelfIds]
  );
  const isCurrentlyReading = Boolean(
    projection.readingState.exists &&
      (
        projection.readingState.status_state === 'reading' ||
        projection.readingState.status_state === 'paused' ||
        projection.readingState.status_state === 'rereading'
      )
  );

  const isOnShelf = useCallback(
    (shelfId: string) => {
      if (shelfId === SYSTEM_CURRENTLY_READING_SHELF_ID) {
        return isCurrentlyReading;
      }
      return shelfIdSet.has(shelfId);
    },
    [isCurrentlyReading, shelfIdSet]
  );

  return {
    shelvesWithBook: projection.shelves.map((shelf) => ({
      id: shelf.shelfId,
      titleEn: shelf.shelfName,
      titleAr: shelf.shelfName,
      membershipAuthority: 'shelf_books' as const,
    })),
    shelfIds: projection.shelfIds,
    shelfNames: projection.shelfNames,
    membershipProjection: projection,
    isSavedOnPhysicalShelf: projection.isOnAnyShelf,
    isCurrentlyReadingFromProgress: isCurrentlyReading,
    isSaved: projection.isOnAnyShelf || isCurrentlyReading,
    isOnShelf,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
};
