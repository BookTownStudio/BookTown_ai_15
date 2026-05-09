import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

interface HomeSearchContextValue {
  query: string;
  isSearchActive: boolean;
  scrollTop: number;
  setQuery: (query: string) => void;
  setSearchActive: (active: boolean) => void;
  setScrollTop: (scrollTop: number) => void;
  clearSearch: () => void;
}

const HomeSearchContext = createContext<HomeSearchContextValue | undefined>(undefined);

export const HomeSearchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [query, setQueryState] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [scrollTop, setScrollTopState] = useState(0);

  const setQuery = useCallback((nextQuery: string) => {
    setQueryState(nextQuery);
    setIsSearchActive(nextQuery.trim().length > 0);
  }, []);

  const setSearchActive = useCallback((active: boolean) => {
    setIsSearchActive(active);
  }, []);

  const setScrollTop = useCallback((nextScrollTop: number) => {
    if (!Number.isFinite(nextScrollTop)) return;
    setScrollTopState(Math.max(0, Math.trunc(nextScrollTop)));
  }, []);

  const clearSearch = useCallback(() => {
    setQueryState('');
    setIsSearchActive(false);
  }, []);

  const value = useMemo(
    () => ({
      query,
      isSearchActive,
      scrollTop,
      setQuery,
      setSearchActive,
      setScrollTop,
      clearSearch,
    }),
    [clearSearch, isSearchActive, query, scrollTop, setQuery, setSearchActive, setScrollTop]
  );

  return (
    <HomeSearchContext.Provider value={value}>
      {children}
    </HomeSearchContext.Provider>
  );
};

export function useHomeSearchState(): HomeSearchContextValue {
  const context = useContext(HomeSearchContext);
  if (!context) {
    throw new Error('useHomeSearchState must be used within HomeSearchProvider');
  }
  return context;
}
