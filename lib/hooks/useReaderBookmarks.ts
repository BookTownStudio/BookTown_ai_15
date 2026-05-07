import { useQuery } from '../react-query.ts';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth.tsx';
import type { CanonicalAnchorV1 } from '../reader/runtime/contracts.ts';

export interface ReaderBookmark {
  bookmarkId: string;
  bookId: string;
  label: string;
  page: number | null;
  cfi: string | null;
  anchor?: CanonicalAnchorV1 | null;
  anchorManifestVersion?: number | null;
  updatedAt: number | null;
}

interface ReaderBookmarksResponse {
  bookmarks: ReaderBookmark[];
}

export function useReaderBookmarks(bookId?: string) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['readerBookmarks', user?.uid || 'anon', bookId || 'none'],
    enabled: Boolean(user?.uid && bookId),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    queryFn: async (): Promise<ReaderBookmark[]> => {
      if (!bookId) {
        throw new Error('bookId is required');
      }

      const fn = httpsCallable<{ bookId: string }, ReaderBookmarksResponse>(
        getFunctions(),
        'getReaderBookmarks'
      );
      const res = await fn({ bookId });
      const envelope = res.data as any;

      if (envelope?.success === false) {
        const code =
          typeof envelope?.error?.code === 'string' ? envelope.error.code : 'UNKNOWN';
        const message =
          typeof envelope?.error?.message === 'string'
            ? envelope.error.message
            : 'Reader bookmarks request failed.';
        throw new Error(`[${code}] ${message}`);
      }

      const payload = (envelope?.success === true ? envelope.data : envelope) as ReaderBookmarksResponse;
      return Array.isArray(payload?.bookmarks) ? payload.bookmarks : [];
    },
  });

  return {
    ...query,
    bookmarks: query.data ?? [],
  };
}
