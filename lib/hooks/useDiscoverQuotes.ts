import { useQuery } from "../react-query.ts";
import { quoteService } from "../../services/quoteService.ts";
import type { Quote } from "../../types/entities.ts";
import { queryKeys } from "../queryKeys.ts";

interface UseDiscoverQuotesFilters {
  query?: string;
  bookId?: string;
  authorId?: string;
  limit?: number;
}

export const useDiscoverQuotes = (filters: UseDiscoverQuotesFilters = {}) => {
  const normalizedQuery =
    typeof filters.query === "string" ? filters.query.trim() : "";
  const hasDiscoveryInput = Boolean(
    normalizedQuery || filters.bookId || filters.authorId
  );

  return useQuery<Quote[]>({
    queryKey: queryKeys.catalog.quotes({
      query: normalizedQuery || null,
      bookId: filters.bookId ?? null,
      authorId: filters.authorId ?? null,
      limit: filters.limit ?? null,
    }),
    queryFn: () =>
      quoteService.searchPublicQuotes({
        ...(normalizedQuery ? { query: normalizedQuery } : {}),
        ...(filters.bookId ? { bookId: filters.bookId } : {}),
        ...(filters.authorId ? { authorId: filters.authorId } : {}),
        ...(typeof filters.limit === "number" ? { limit: filters.limit } : {}),
      }),
    enabled: hasDiscoveryInput,
  });
};
