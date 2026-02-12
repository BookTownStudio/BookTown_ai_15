
import { useState, useEffect } from 'react';

const MAX_HISTORY = 5;
const STORAGE_KEY = 'booktown_search_history';

export const useSearchHistory = () => {
    const [history, setHistory] = useState<string[]>([]);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setHistory(JSON.parse(stored));
            }
        } catch (e) {
            console.error("Failed to load search history", e);
        }
    }, []);

    const addToHistory = (query: string) => {
        if (!query.trim()) return;
        
        setHistory(prev => {
            const newHistory = [query, ...prev.filter(q => q !== query)].slice(0, MAX_HISTORY);
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newHistory));
            } catch (e) {
                console.error("Failed to save search history", e);
            }
            return newHistory;
        });
    };

    const clearHistory = () => {
        setHistory([]);
        localStorage.removeItem(STORAGE_KEY);
    };

    return { history, addToHistory, clearHistory };
};
