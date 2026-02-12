

import React, { createContext, useState, useContext, useMemo, ReactNode, useEffect, useCallback } from 'react';

export type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type FontStyle = 'default' | 'dyslexic';
export type Theme = 'light' | 'dark' | 'sepia';
export type ReadingMode = 'scroll' | 'page';

type Position = { page?: number; scroll?: number };
type LastPositionMap = { [bookId: string]: Position };

interface ReadingPreferencesContextType {
    fontSize: FontSize;
    fontStyle: FontStyle;
    theme: Theme;
    readingMode: ReadingMode;
    lastPosition: LastPositionMap;
    setFontSize: (size: FontSize) => void;
    setFontStyle: (style: FontStyle) => void;
    setTheme: (theme: Theme) => void;
    setReadingMode: (mode: ReadingMode) => void;
    setLastPosition: (bookId: string, position: Position) => void;
}

const ReadingPreferencesContext = createContext<ReadingPreferencesContextType | undefined>(undefined);

interface ReadingPreferencesProviderProps {
    children: ReactNode;
}

const usePersistentState = <T,>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
    const [state, setState] = useState<T>(() => {
        try {
            const storedValue = localStorage.getItem(key);
            if (storedValue) {
                // Try to parse as JSON, but fall back to raw string if it fails.
                // This handles cases where a value might have been stored without JSON.stringify.
                try {
                    return JSON.parse(storedValue);
                } catch {
                    return storedValue as unknown as T;
                }
            }
            return defaultValue;
        } catch (error) {
            // This outer catch is for other potential localStorage errors (e.g., security restrictions)
            console.error(`Error reading localStorage key “${key}”:`, error);
            return defaultValue;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.error(`Error setting localStorage key “${key}”:`, error);
        }
    }, [key, state]);

    return [state, setState];
};


export const ReadingPreferencesProvider: React.FC<ReadingPreferencesProviderProps> = ({ children }) => {
    const [fontSize, setFontSize] = usePersistentState<FontSize>('booktown-fontsize', 'md');
    const [fontStyle, setFontStyle] = usePersistentState<FontStyle>('booktown-fontstyle', 'default');
    const [theme, setTheme] = usePersistentState<Theme>('booktown-theme', 'dark');
    const [readingMode, setReadingMode] = usePersistentState<ReadingMode>('booktown-readingmode', 'scroll');
    const [lastPosition, setLastPosition] = usePersistentState<LastPositionMap>('booktown-lastposition', {});

    const setLastPositionForBook = useCallback((bookId: string, position: Position) => {
        setLastPosition(prev => ({ ...prev, [bookId]: position }));
    }, [setLastPosition]);

    const value = useMemo(() => ({ 
        fontSize, 
        fontStyle,
        theme,
        readingMode,
        lastPosition,
        setFontSize,
        setFontStyle,
        setTheme,
        setReadingMode,
        setLastPosition: setLastPositionForBook
    }), [fontSize, fontStyle, theme, readingMode, lastPosition, setLastPositionForBook]);

    return (
        <ReadingPreferencesContext.Provider value={value}>
            {children}
        </ReadingPreferencesContext.Provider>
    );
};

export const useReadingPreferences = (): ReadingPreferencesContextType => {
    const context = useContext(ReadingPreferencesContext);
    if (context === undefined) {
        throw new Error('useReadingPreferences must be used within a ReadingPreferencesProvider');
    }
    return context;
};