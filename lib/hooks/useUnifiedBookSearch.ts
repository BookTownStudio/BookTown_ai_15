import { useI18n } from '../../store/i18n.tsx';
import { useBookSearch } from './useBookSearch.ts';
import { useUnifiedBookSearchFilters } from './useUnifiedBookSearchFilters.ts';

export function useUnifiedBookSearch(query: string) {
  const { lang } = useI18n();
  const { ebookOnly, setEbookOnly, toggleEbookOnly } = useUnifiedBookSearchFilters();
  const search = useBookSearch(query, {
    ebookOnly,
    lang,
    limit: 15,
  });

  return {
    ...search,
    lang,
    ebookOnly,
    setEbookOnly,
    toggleEbookOnly,
  };
}
