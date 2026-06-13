
import { useQuery } from '../react-query.ts';
import { dataService } from '../../services/dataService.ts';
import { Book } from '../../types/entities.ts';
import {
    buildAuthorBibliographyModel,
    flattenAuthorBibliographyPreview,
    type AuthorBibliographyAuthoritySource,
    type AuthorBibliographyModel,
} from "../authors/authorBibliographyAdapter.ts";

export type BibliographyAuthority = AuthorBibliographyAuthoritySource;

export interface BooksByAuthorWithAuthority {
  readonly books?: Book[];
  readonly canonicalWorks?: readonly Book[];
  readonly repairWorks?: readonly Book[];
  readonly bibliographyAuthority: BibliographyAuthority;
  readonly totalCanonicalCount?: number;
  readonly totalRepairCount?: number;
  readonly hasMore?: boolean;
}

type CatalogWithBibliographyAuthority = typeof dataService.catalog & {
  getBooksByAuthorWithAuthority?: (
    authorId: string
  ) => Promise<BooksByAuthorWithAuthority>;
};

export const useBooksByAuthor = (authorId: string | undefined) => {
    const queryResult = useQuery<AuthorBibliographyModel>({
        queryKey: ['booksByAuthor', authorId],
        queryFn: async () => {
            const catalog = dataService.catalog as CatalogWithBibliographyAuthority;
            if (catalog.getBooksByAuthorWithAuthority) {
                const result = await catalog.getBooksByAuthorWithAuthority(authorId!);
                const model = buildAuthorBibliographyModel({
                    canonicalWorks: result.canonicalWorks ?? (result.bibliographyAuthority === "canonical_author_id" ? result.books ?? [] : []),
                    repairWorks: result.repairWorks ?? (result.bibliographyAuthority === "legacy_display_name_repair" ? result.books ?? [] : []),
                });
                return {
                    ...model,
                    totalCanonicalCount: result.totalCanonicalCount ?? model.totalCanonicalCount,
                    totalRepairCount: result.totalRepairCount ?? model.totalRepairCount,
                    hasMore: result.hasMore ?? model.hasMore,
                };
            }
            const books = await dataService.catalog.getBooksByAuthor(authorId!);
            return buildAuthorBibliographyModel({ canonicalWorks: books });
        },
        enabled: !!authorId,
    });
    const bibliography = queryResult.data;
    const books = bibliography ? flattenAuthorBibliographyPreview(bibliography) : undefined;

    return {
        ...queryResult,
        data: books,
        bibliography,
        bibliographyAuthority: bibliography?.authoritySource ?? "none",
    };
};
