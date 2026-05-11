import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';

export interface SpaceRelationshipSummary {
    id: string;
    labelEn: string;
    labelAr: string;
    imageUrl?: string;
    subtitleEn?: string;
    subtitleAr?: string;
}

export const useSpaceRelationshipSummaries = (
    bookIds: string[],
    authorIds: string[]
) => {
    const normalizedBookIds = Array.from(new Set(bookIds.map(id => id.trim()).filter(Boolean))).slice(0, 25);
    const normalizedAuthorIds = Array.from(new Set(authorIds.map(id => id.trim()).filter(Boolean))).slice(0, 25);

    return useQuery<{
        books: SpaceRelationshipSummary[];
        authors: SpaceRelationshipSummary[];
    }>({
        queryKey: ['spaces', 'relationshipSummaries', { bookIds: normalizedBookIds, authorIds: normalizedAuthorIds }] as unknown as any[],
        queryFn: async () => {
            const [books, authors] = await Promise.all([
                Promise.all(
                    normalizedBookIds.map(async (id) => {
                        const book = await dataService.catalog.getBook(id);
                        return {
                            id,
                            labelEn: book?.titleEn || id,
                            labelAr: book?.titleAr || book?.titleEn || id,
                            imageUrl: book?.coverUrl || undefined,
                            subtitleEn: book?.authorEn || undefined,
                            subtitleAr: book?.authorAr || book?.authorEn || undefined,
                        };
                    })
                ),
                Promise.all(
                    normalizedAuthorIds.map(async (id) => {
                        const author = await dataService.catalog.getAuthor(id);
                        return {
                            id,
                            labelEn: author?.nameEn || id,
                            labelAr: author?.nameAr || author?.nameEn || id,
                            imageUrl: author?.avatarUrl || undefined,
                            subtitleEn: author?.lifespan || author?.countryEn || undefined,
                            subtitleAr: author?.lifespan || author?.countryAr || author?.countryEn || undefined,
                        };
                    })
                ),
            ]);
            return { books, authors };
        },
        enabled: normalizedBookIds.length > 0 || normalizedAuthorIds.length > 0,
        staleTime: 1000 * 60 * 10,
    });
};
