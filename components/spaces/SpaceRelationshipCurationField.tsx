import React, { useMemo, useState } from 'react';
import BilingualText from '../ui/BilingualText.tsx';
import InputField from '../ui/InputField.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { BookIcon } from '../icons/BookIcon.tsx';
import { AuthorsIcon } from '../icons/AuthorsIcon.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useToast } from '../../store/toast.tsx';
import { useBookSearch } from '../../lib/hooks/useBookSearch.ts';
import { useSearchUserAuthors } from '../../lib/hooks/useSearchUserAuthors.ts';
import { useSpaceRelationshipSummaries } from '../../lib/hooks/useSpaceRelationshipSummaries.ts';
import { ensureCanonicalBook } from '../../lib/books/ensureCanonicalBook.ts';
import { resolveIngestionSource } from '../../lib/books/searchNavigation.ts';
import { ensureCanonicalAuthor } from '../../lib/authors/ensureCanonicalAuthor.ts';
import { Author } from '../../types/entities.ts';
import { SearchResultDTO } from '../../types/bookSearch.ts';
import SearchResultCard from '../content/SearchResultCard.tsx';

export interface CuratedSpaceRelationshipRefs {
    bookIds?: string[];
    authorIds?: string[];
}

interface SpaceRelationshipCurationFieldProps {
    value: CuratedSpaceRelationshipRefs;
    onChange: (nextValue: CuratedSpaceRelationshipRefs) => void;
    disabled?: boolean;
}

type LocalLabel = {
    labelEn: string;
    labelAr: string;
};

const normalizeIds = (ids: string[] | undefined): string[] =>
    Array.from(new Set((ids || []).map(id => id.trim()).filter(Boolean))).slice(0, 25);

const compactRefs = (bookIds: string[], authorIds: string[]): CuratedSpaceRelationshipRefs => ({
    ...(bookIds.length > 0 ? { bookIds } : {}),
    ...(authorIds.length > 0 ? { authorIds } : {}),
});

const SpaceRelationshipCurationField: React.FC<SpaceRelationshipCurationFieldProps> = ({
    value,
    onChange,
    disabled = false,
}) => {
    const { lang } = useI18n();
    const { showToast } = useToast();
    const [bookQuery, setBookQuery] = useState('');
    const [authorQuery, setAuthorQuery] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [localBookLabels, setLocalBookLabels] = useState<Record<string, LocalLabel>>({});
    const [localAuthorLabels, setLocalAuthorLabels] = useState<Record<string, LocalLabel>>({});

    const bookIds = useMemo(() => normalizeIds(value.bookIds), [value.bookIds]);
    const authorIds = useMemo(() => normalizeIds(value.authorIds), [value.authorIds]);
    const { data: summaries } = useSpaceRelationshipSummaries(bookIds, authorIds);
    const { data: bookSearch, isLoading: isSearchingBooks } = useBookSearch(bookQuery, { limit: 8 });
    const { data: authorResults = [], isLoading: isSearchingAuthors } = useSearchUserAuthors(authorQuery);

    const summaryBookById = useMemo(
        () => new Map((summaries?.books || []).map(book => [book.id, book])),
        [summaries?.books]
    );
    const summaryAuthorById = useMemo(
        () => new Map((summaries?.authors || []).map(author => [author.id, author])),
        [summaries?.authors]
    );

    const selectedBooks = bookIds.map(id => {
        const summary = summaryBookById.get(id);
        const local = localBookLabels[id];
        return {
            id,
            labelEn: summary?.labelEn || local?.labelEn || id,
            labelAr: summary?.labelAr || local?.labelAr || summary?.labelEn || local?.labelEn || id,
        };
    });

    const selectedAuthors = authorIds.map(id => {
        const summary = summaryAuthorById.get(id);
        const local = localAuthorLabels[id];
        return {
            id,
            labelEn: summary?.labelEn || local?.labelEn || id,
            labelAr: summary?.labelAr || local?.labelAr || summary?.labelEn || local?.labelEn || id,
        };
    });

    const updateBookIds = (nextBookIds: string[]) => {
        onChange(compactRefs(normalizeIds(nextBookIds), authorIds));
    };

    const updateAuthorIds = (nextAuthorIds: string[]) => {
        onChange(compactRefs(bookIds, normalizeIds(nextAuthorIds)));
    };

    const selectBook = async (result: SearchResultDTO) => {
        if (disabled || busyId) return;
        setBusyId(`book:${result.id}`);
        try {
            let bookId =
                result.resultType === 'canonical' && typeof result.bookId === 'string'
                    ? result.bookId.trim()
                    : '';

            if (!bookId) {
                const source = resolveIngestionSource(result);
                if (!source) {
                    throw new Error('BOOK_SOURCE_UNRESOLVED');
                }
                const resolved = await ensureCanonicalBook({
                    providerExternalId: result.externalId || result.id,
                    source,
                    rawBook: result.rawBook || {
                        id: result.externalId || result.id,
                        externalId: result.externalId || result.id,
                        source,
                        title: result.title,
                        titleEn: result.titleEn,
                        titleAr: result.titleAr,
                        authors: result.authors,
                        authorEn: result.authorEn,
                        authorAr: result.authorAr,
                        description: result.description,
                        descriptionEn: result.descriptionEn,
                        descriptionAr: result.descriptionAr,
                    },
                });
                bookId = resolved?.canonicalBookId || '';
            }

            if (!bookId) {
                throw new Error('BOOK_CANONICALIZATION_FAILED');
            }
            if (!bookIds.includes(bookId)) {
                setLocalBookLabels(previous => ({
                    ...previous,
                    [bookId]: {
                        labelEn: result.titleEn || result.title || bookId,
                        labelAr: result.titleAr || result.titleEn || result.title || bookId,
                    },
                }));
                updateBookIds([...bookIds, bookId]);
            }
            setBookQuery('');
        } catch (error) {
            console.error('[SpaceRelationshipCurationField][BOOK_SELECT_FAILED]', error);
            showToast(lang === 'en' ? 'Could not attach this book.' : 'تعذر ربط هذا الكتاب.');
        } finally {
            setBusyId(null);
        }
    };

    const selectAuthor = async (author: Author) => {
        if (disabled || busyId) return;
        setBusyId(`author:${author.id}`);
        try {
            const resolved = await ensureCanonicalAuthor(
                author.requiresCanonicalization && author.providerSource && author.providerExternalId
                    ? {
                        providerExternalId: author.providerExternalId,
                        source: author.providerSource,
                        rawAuthor: {
                            id: author.providerExternalId,
                            nameEn: author.nameEn,
                            nameAr: author.nameAr,
                            avatarUrl: author.avatarUrl,
                            bioEn: author.bioEn,
                            bioAr: author.bioAr,
                            lifespan: author.lifespan,
                        },
                    }
                    : {
                        authorId: author.id,
                        source: author.providerSource,
                        nameEn: author.nameEn,
                        nameAr: author.nameAr,
                        avatarUrl: author.avatarUrl,
                    }
            );
            const authorId = resolved?.canonicalAuthorId || author.id;
            if (!authorIds.includes(authorId)) {
                setLocalAuthorLabels(previous => ({
                    ...previous,
                    [authorId]: {
                        labelEn: author.nameEn || authorId,
                        labelAr: author.nameAr || author.nameEn || authorId,
                    },
                }));
                updateAuthorIds([...authorIds, authorId]);
            }
            setAuthorQuery('');
        } catch (error) {
            console.error('[SpaceRelationshipCurationField][AUTHOR_SELECT_FAILED]', error);
            showToast(lang === 'en' ? 'Could not attach this author.' : 'تعذر ربط هذا المؤلف.');
        } finally {
            setBusyId(null);
        }
    };

    const bookResults = bookSearch?.results || [];
    const showBookResults = bookQuery.trim().length >= 2 && bookResults.length > 0;
    const showAuthorResults = authorQuery.trim().length >= 2 && authorResults.length > 0;

    return (
        <div className="rounded-md border border-slate-700 p-3">
            <BilingualText role="Body" className="font-semibold mb-3">
                {lang === 'en' ? 'Literary links' : 'روابط أدبية'}
            </BilingualText>

            <div className="space-y-4">
                <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                        <BookIcon className="h-4 w-4 text-accent" />
                        <span>{lang === 'en' ? 'Books' : 'كتب'}</span>
                    </div>
                    {selectedBooks.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2">
                            {selectedBooks.map(book => (
                                <button
                                    key={book.id}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => updateBookIds(bookIds.filter(id => id !== book.id))}
                                    className="rounded-sm border border-white/10 px-2 py-1 text-xs text-white/75 hover:border-red-400 hover:text-red-200 disabled:opacity-60"
                                >
                                    {lang === 'en' ? book.labelEn : book.labelAr}
                                </button>
                            ))}
                        </div>
                    )}
                    <InputField
                        id="space-book-picker"
                        label=""
                        type="search"
                        value={bookQuery}
                        onChange={(event) => setBookQuery(event.target.value)}
                        placeholder={lang === 'en' ? 'Search books' : 'ابحث عن كتب'}
                        disabled={disabled}
                    />
                    {isSearchingBooks && <div className="flex justify-center py-3"><LoadingSpinner /></div>}
                    {showBookResults && (
                        <div className="mt-2 max-h-[28rem] space-y-2 overflow-y-auto rounded-md border border-white/10 bg-slate-900/80 p-2">
                            {bookResults.slice(0, 8).map(result => (
                                <SearchResultCard
                                    key={result.id}
                                    result={result}
                                    lang={lang}
                                    onOpen={selectBook}
                                    isBusy={busyId === `book:${result.id}`}
                                    isDisabled={disabled || (Boolean(busyId) && busyId !== `book:${result.id}`)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                        <AuthorsIcon className="h-4 w-4 text-accent" />
                        <span>{lang === 'en' ? 'Literary figures' : 'أسماء أدبية'}</span>
                    </div>
                    {selectedAuthors.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2">
                            {selectedAuthors.map(author => (
                                <button
                                    key={author.id}
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => updateAuthorIds(authorIds.filter(id => id !== author.id))}
                                    className="rounded-sm border border-white/10 px-2 py-1 text-xs text-white/75 hover:border-red-400 hover:text-red-200 disabled:opacity-60"
                                >
                                    {lang === 'en' ? author.labelEn : author.labelAr}
                                </button>
                            ))}
                        </div>
                    )}
                    <InputField
                        id="space-author-picker"
                        label=""
                        type="search"
                        value={authorQuery}
                        onChange={(event) => setAuthorQuery(event.target.value)}
                        placeholder={lang === 'en' ? 'Search authors' : 'ابحث عن مؤلفين'}
                        disabled={disabled}
                    />
                    {isSearchingAuthors && <div className="flex justify-center py-3"><LoadingSpinner /></div>}
                    {showAuthorResults && (
                        <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-white/10 bg-slate-900/80">
                            {authorResults.slice(0, 8).map(author => {
                                const name = lang === 'en' ? author.nameEn : author.nameAr || author.nameEn;
                                const subtitle = lang === 'en' ? author.lifespan || author.countryEn : author.lifespan || author.countryAr || author.countryEn;
                                const isBusy = busyId === `author:${author.id}`;
                                return (
                                    <button
                                        key={author.id}
                                        type="button"
                                        disabled={disabled || Boolean(busyId)}
                                        onClick={() => void selectAuthor(author)}
                                        className="flex w-full items-center gap-3 border-b border-white/5 px-3 py-2 text-left last:border-b-0 hover:bg-white/5 disabled:opacity-60"
                                    >
                                        <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full bg-slate-800">
                                            {author.avatarUrl && <img src={author.avatarUrl} alt="" className="h-full w-full object-cover" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-semibold text-white">{name}</div>
                                            {subtitle && <div className="truncate text-xs text-white/55">{subtitle}</div>}
                                        </div>
                                        {isBusy && <LoadingSpinner />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SpaceRelationshipCurationField;
