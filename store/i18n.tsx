
import React, { createContext, useState, useContext, useMemo, ReactNode } from 'react';

type Language = 'en' | 'ar';

interface I18nContextType {
    lang: Language;
    setLang: (lang: Language) => void;
    isRTL: boolean;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

interface I18nProviderProps {
    children: ReactNode;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children }) => {
    const [lang, setLang] = useState<Language>('en');

    const isRTL = useMemo(() => lang === 'ar', [lang]);

    const value = useMemo(() => ({ lang, setLang, isRTL }), [lang, isRTL]);

    return (
        <I18nContext.Provider value={value}>
            {children}
        </I18nContext.Provider>
    );
};

export const useI18n = (): I18nContextType => {
    const context = useContext(I18nContext);
    if (context === undefined) {
        throw new Error('useI18n must be used within an I18nProvider');
    }
    return context;
};
