
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Author } from '../../types/entities.ts';
import { queryKeys } from "../queryKeys.ts";

export const useAuthorDetails = (authorId: string | undefined) => {
    const normalizedAuthorId = typeof authorId === "string" ? authorId.trim() : "";

    return useQuery<Author | null>({
        queryKey: queryKeys.catalog.author(normalizedAuthorId || undefined) as unknown as any[],
        queryFn: () => dataService.catalog.getAuthor(normalizedAuthorId),
        enabled: normalizedAuthorId.length > 0,
    });
};
