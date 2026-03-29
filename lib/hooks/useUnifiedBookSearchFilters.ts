import { useEffect, useState } from 'react';

const STORAGE_KEY = 'booktown.search.filters.v2';
const FILTER_EVENT = 'booktown:search-filters';

type SearchFilterState = {
  ebookOnly: boolean;
};

function readFilters(): SearchFilterState {
  if (typeof window === 'undefined') {
    return { ebookOnly: false };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ebookOnly: false };

    const parsed = JSON.parse(raw) as Partial<SearchFilterState>;
    return {
      ebookOnly: parsed.ebookOnly === true,
    };
  } catch {
    return { ebookOnly: false };
  }
}

function writeFilters(next: SearchFilterState): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Local persistence is optional.
  }

  window.dispatchEvent(new CustomEvent(FILTER_EVENT, { detail: next }));
}

export function useUnifiedBookSearchFilters() {
  const [filters, setFilters] = useState<SearchFilterState>(() => readFilters());

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      setFilters(readFilters());
    };

    const handleFiltersChanged = () => {
      setFilters(readFilters());
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(FILTER_EVENT, handleFiltersChanged as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(FILTER_EVENT, handleFiltersChanged as EventListener);
    };
  }, []);

  const setEbookOnly = (next: boolean) => {
    writeFilters({
      ebookOnly: next,
    });
  };

  return {
    ebookOnly: filters.ebookOnly,
    setEbookOnly,
    toggleEbookOnly: () => setEbookOnly(!filters.ebookOnly),
  };
}
