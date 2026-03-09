import { useQuery } from '@tanstack/react-query';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../auth.tsx';

export interface ReaderHighlight {
  highlightId: string;
  bookId: string;
  quote: string;
  note: string;
  color: string;
  page: number | null;
  cfi: string | null;
  updatedAt: number | null;
}

interface ReaderHighlightsResponse {
  highlights: ReaderHighlight[];
}

export function useReaderHighlights(bookId?: string) {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ['readerHighlights', user?.uid || 'anon', bookId || 'none'],
    enabled: Boolean(user?.uid && bookId),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 10,
    queryFn: async (): Promise<ReaderHighlight[]> => {
      if (!bookId) {
        throw new Error('bookId is required');
      }

      const fn = httpsCallable<{ bookId: string }, ReaderHighlightsResponse>(
        getFunctions(),
        'getReaderHighlights'
      );
      const res = await fn({ bookId });
      const envelope = res.data as any;

      if (envelope?.success === false) {
        const code =
          typeof envelope?.error?.code === 'string' ? envelope.error.code : 'UNKNOWN';
        const message =
          typeof envelope?.error?.message === 'string'
            ? envelope.error.message
            : 'Reader highlights request failed.';
        throw new Error(`[${code}] ${message}`);
      }

      const payload = (envelope?.success === true ? envelope.data : envelope) as ReaderHighlightsResponse;
      return Array.isArray(payload?.highlights) ? payload.highlights : [];
    },
  });

  return {
    ...query,
    highlights: query.data ?? [],
  };
}
