
import { useState, useEffect } from 'react';

const MAX_HISTORY = 7;
const STORAGE_KEY = 'booktown_search_history';
const HISTORY_EVENT = 'booktown:search-history';

export function normalizeSearchHistoryQuery(query: string): string {
    return query.trim().replace(/\s+/g, ' ').slice(0, 120);
}

export function normalizeSearchHistoryList(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const entry of value) {
        if (typeof entry !== 'string') continue;

        const query = normalizeSearchHistoryQuery(entry);
        if (!query) continue;

        const key = query.toLocaleLowerCase();
        if (seen.has(key)) continue;

        seen.add(key);
        normalized.push(query);

        if (normalized.length >= MAX_HISTORY) break;
    }

    return normalized;
}

export function mergeSearchHistoryQuery(history: string[], query: string): string[] {
    const normalizedQuery = normalizeSearchHistoryQuery(query);
    if (!normalizedQuery) return normalizeSearchHistoryList(history);

    const queryKey = normalizedQuery.toLocaleLowerCase();
    return normalizeSearchHistoryList([
        normalizedQuery,
        ...history.filter((entry) => normalizeSearchHistoryQuery(entry).toLocaleLowerCase() !== queryKey),
    ]);
}

export function readPersistedSearchHistory(): string[] {
    if (typeof window === 'undefined') return [];

    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        return stored ? normalizeSearchHistoryList(JSON.parse(stored)) : [];
    } catch (e) {
        console.error('[SEARCH_HISTORY][LOAD_FAILED]', e);
        return [];
    }
}

function publishSearchHistory(nextHistory: string[]): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(HISTORY_EVENT, { detail: nextHistory }));
}

export function writePersistedSearchHistory(nextHistory: string[]): string[] {
    const authoritativeHistory = normalizeSearchHistoryList(nextHistory);
    if (typeof window === 'undefined') return authoritativeHistory;

    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(authoritativeHistory));
    } catch (e) {
        console.error('[SEARCH_HISTORY][SAVE_FAILED]', e);
    }

    publishSearchHistory(authoritativeHistory);
    return authoritativeHistory;
}

export function addPersistedSearchHistoryQuery(query: string): string[] {
    const currentHistory = readPersistedSearchHistory();
    return writePersistedSearchHistory(mergeSearchHistoryQuery(currentHistory, query));
}

export function removePersistedSearchHistoryQuery(query: string): string[] {
    const normalizedQuery = normalizeSearchHistoryQuery(query);
    if (!normalizedQuery) return readPersistedSearchHistory();

    const queryKey = normalizedQuery.toLocaleLowerCase();
    return writePersistedSearchHistory(
        readPersistedSearchHistory().filter(
            (entry) => normalizeSearchHistoryQuery(entry).toLocaleLowerCase() !== queryKey
        )
    );
}

export function clearPersistedSearchHistory(): string[] {
    if (typeof window === 'undefined') return [];

    try {
        window.localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
        console.error('[SEARCH_HISTORY][CLEAR_FAILED]', e);
    }

    publishSearchHistory([]);
    return [];
}

export const useSearchHistory = () => {
    const [history, setHistory] = useState<string[]>([]);

    useEffect(() => {
        setHistory(readPersistedSearchHistory());

        const handleStorage = (event: StorageEvent) => {
            if (event.key && event.key !== STORAGE_KEY) return;
            setHistory(readPersistedSearchHistory());
        };

        const handleHistoryChanged = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (Array.isArray(detail)) {
                setHistory(normalizeSearchHistoryList(detail));
                return;
            }

            setHistory(readPersistedSearchHistory());
        };

        window.addEventListener('storage', handleStorage);
        window.addEventListener(HISTORY_EVENT, handleHistoryChanged as EventListener);

        return () => {
            window.removeEventListener('storage', handleStorage);
            window.removeEventListener(HISTORY_EVENT, handleHistoryChanged as EventListener);
        };
    }, []);

    const addToHistory = (query: string) => {
        setHistory(addPersistedSearchHistoryQuery(query));
    };

    const removeFromHistory = (query: string) => {
        setHistory(removePersistedSearchHistoryQuery(query));
    };

    const clearHistory = () => {
        setHistory(clearPersistedSearchHistory());
    };

    return { history, addToHistory, removeFromHistory, clearHistory };
};
