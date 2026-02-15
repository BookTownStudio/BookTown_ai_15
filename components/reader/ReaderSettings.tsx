import React from 'react';
import {
    useReadingPreferences,
    FontSize,
    Theme,
    FontStyle,
} from '../../store/reading-prefs.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { cn } from '../../lib/utils.ts';
import { SunIcon } from '../icons/SunIcon.tsx';
import { MoonIcon } from '../icons/MoonIcon.tsx';

interface ReaderSettingsProps {
    onClose: () => void;
}

const ReaderSettings: React.FC<ReaderSettingsProps> = ({ onClose }) => {
    const { lang } = useI18n();
    const { fontSize, setFontSize, theme, setTheme, fontStyle, setFontStyle } = useReadingPreferences();

    const fontSizes: { id: FontSize, label: string }[] = [
        { id: 'xs', label: 'XS' },
        { id: 'sm', label: 'S' },
        { id: 'md', label: 'M' },
        { id: 'lg', label: 'L' },
        { id: 'xl', label: 'XL' },
    ];
    
    const themes: { id: Theme, labelEn: string, labelAr: string, icon?: React.FC<any>, bg: string }[] = [
        { id: 'light', labelEn: 'Light', labelAr: 'فاتح', icon: SunIcon, bg: 'bg-[#FBF6E8]' },
        { id: 'sepia', labelEn: 'Sepia', labelAr: 'بني داكن', bg: 'bg-[#F3E9D2]' },
        { id: 'dark', labelEn: 'Dark', labelAr: 'داكن', icon: MoonIcon, bg: 'bg-[#1E242C]' },
    ];
    const fontStyles: { id: FontStyle; labelEn: string; labelAr: string }[] = [
        { id: 'default', labelEn: 'Serif', labelAr: 'تقليدي' },
        { id: 'dyslexic', labelEn: 'Readable', labelAr: 'مقروء' },
    ];

    return (
        <>
            <div
                className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />
            <div
                className="fixed bottom-0 left-0 right-0 z-30 bg-reader-chrome-bg p-4 rounded-t-2xl shadow-lg animate-fade-in-up"
                style={{ animationDuration: '0.3s' }}
            >
                <div className="container mx-auto max-w-md">
                    {/* Font Size */}
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-2xl font-serif opacity-80">aA</span>
                        <div className="flex-grow flex items-center bg-black/10 dark:bg-white/10 rounded-full">
                            {fontSizes.map((size, index) => (
                                <React.Fragment key={size.id}>
                                    <button
                                        onClick={() => setFontSize(size.id)}
                                        className={cn(
                                            'w-full py-2 text-center text-sm font-semibold',
                                            fontSize === size.id ? 'text-accent' : 'opacity-70'
                                        )}
                                    >
                                        {size.label}
                                    </button>
                                    {index < fontSizes.length - 1 && <div className="h-4 w-px bg-black/10 dark:bg-white/10" />}
                                </React.Fragment>
                            ))}
                        </div>
                    </div>
                    {/* Theme */}
                    <div className="mt-4 flex items-center justify-around">
                         {themes.map(th => (
                            <button
                                key={th.id}
                                onClick={() => setTheme(th.id)}
                                className="flex flex-col items-center gap-1.5"
                            >
                                <div className={cn(
                                    'w-12 h-12 rounded-full flex items-center justify-center transition-all',
                                    th.bg,
                                    theme === th.id ? 'ring-2 ring-accent' : 'ring-1 ring-white/20'
                                )}>
                                    {th.icon && <th.icon className={cn('h-6 w-6', th.id === 'light' ? 'text-slate-700' : 'text-slate-300')} />}
                                </div>
                                <span className={cn('text-xs', theme === th.id ? 'text-accent font-semibold' : 'opacity-70')}>
                                    {lang === 'en' ? th.labelEn : th.labelAr}
                                </span>
                            </button>
                         ))}
                    </div>

                    {/* Font Style */}
                    <div className="mt-4 flex items-center gap-2 bg-black/10 dark:bg-white/10 rounded-full p-1">
                        {fontStyles.map((style) => (
                            <button
                                key={style.id}
                                onClick={() => setFontStyle(style.id)}
                                className={cn(
                                    'flex-1 py-2 text-xs font-semibold rounded-full transition-colors',
                                    fontStyle === style.id
                                        ? 'bg-accent text-white'
                                        : 'text-white/70 hover:text-white'
                                )}
                            >
                                {lang === 'en' ? style.labelEn : style.labelAr}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
};

export default ReaderSettings;
