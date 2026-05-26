import type { HomeConsoleBookItem } from '../../lib/hooks/useHomeDiscoveryConsole.ts';
import type {
  CanonicalCoverMode,
  CanonicalFallbackCover,
} from '../../types/entities.ts';

export type BookCardData = {
  id: string;
  authorId?: string;
  titleEn: string;
  titleAr: string;
  authorEn: string;
  authorAr: string;
  coverUrl: string;
  coverMode?: CanonicalCoverMode;
  fallbackCover?: CanonicalFallbackCover;
  reason?: string;
};

export const BookCardDataAdapter = {
  fromHomeConsoleItem(item: HomeConsoleBookItem): BookCardData {
    return {
      id: item.bookId,
      titleEn: item.title,
      titleAr: item.title,
      authorEn: item.author,
      authorAr: item.author,
      coverUrl: item.coverUrl,
      fallbackCover: {
        title: item.title,
        author: item.author,
        theme: 'ink',
      },
      ...(item.reason ? { reason: item.reason } : {}),
    };
  },
};
