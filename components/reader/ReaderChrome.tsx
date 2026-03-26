
import React from 'react';
import { Book } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import { useReadingPreferences } from '../../store/reading-prefs.tsx';
import { cn } from '../../lib/utils.ts';
import Button from '../ui/Button.tsx';
import { BookmarkIcon } from '../icons/BookmarkIcon.tsx';
import { ChevronLeftIcon } from '../icons/ChevronLeftIcon.tsx';
import { DownloadIcon } from '../icons/DownloadIcon.tsx';
import { HighlightIcon } from '../icons/HighlightIcon.tsx';
import { SettingsIcon } from '../icons/SettingsIcon.tsx';
import { ViewListIcon } from '../icons/ViewListIcon.tsx';
import { BookOpenIcon } from '../icons/BookOpenIcon.tsx';
import { PlayIcon } from '../icons/PlayIcon.tsx';
import { PauseIcon } from '../icons/PauseIcon.tsx';

interface ReaderChromeProps {
    isVisible: boolean;
    book: Book;
    onBack: () => void;
    progress: number;
    currentPage: number;
    totalPages: number;
    onSettingsClick: () => void;
    onListeningClick?: () => void;
    narrationState?: 'idle' | 'playing' | 'paused';
    isBookmarked?: boolean;
    onBookmarkToggle?: () => void;
    isHighlighted?: boolean;
    onHighlightToggle?: () => void;
    isOfflineAvailable?: boolean;
    isOfflineBusy?: boolean;
    onOfflineToggle?: () => void;
}

const ReaderChrome: React.FC<ReaderChromeProps> = ({
    isVisible,
    book,
    onBack,
    progress,
    currentPage,
    totalPages,
    onSettingsClick,
    onListeningClick,
    narrationState = 'idle',
    isBookmarked = false,
    onBookmarkToggle,
    isHighlighted = false,
    onHighlightToggle,
    isOfflineAvailable = false,
    isOfflineBusy = false,
    onOfflineToggle,
}) => {
    const { lang } = useI18n();
    const { readingMode, setReadingMode, theme } = useReadingPreferences();

    const bgStyles = theme === 'light' ? 'bg-white/90' : (theme === 'sepia' ? 'bg-[#F3E9D2]/90' : 'bg-slate-900/90');
    const textStyles = theme === 'light' ? 'text-slate-900' : (theme === 'sepia' ? 'text-[#433422]' : 'text-white');
    const listenLabel =
        narrationState === 'playing'
            ? (lang === 'en' ? 'Pause narration' : 'إيقاف السرد مؤقتاً')
            : narrationState === 'paused'
                ? (lang === 'en' ? 'Resume narration' : 'استئناف السرد')
                : (lang === 'en' ? 'Start narration' : 'بدء السرد');

    const chromeClass = cn(
        'fixed left-0 w-full z-20 transition-all duration-300 ease-in-out backdrop-blur-xl border-black/5 dark:border-white/5 shadow-sm',
        bgStyles, textStyles,
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 pointer-events-none'
    );

    return (
        <>
            {/* Top Bar */}
            <header className={cn(chromeClass, 'top-0 border-b', !isVisible && '-translate-y-full')}>
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                    <Button variant="ghost" onClick={onBack} className="!p-2 hover:bg-black/5 dark:hover:bg-white/10"><ChevronLeftIcon className="h-6 w-6" /></Button>
                    <div className="text-center overflow-hidden flex-grow px-4">
                        <p className="font-bold truncate text-sm leading-tight">{lang === 'en' ? book.titleEn : book.titleAr}</p>
                        <p className="text-xs opacity-60 truncate mt-0.5">{lang === 'en' ? book.authorEn : book.authorAr}</p>
                    </div>
                    <div className="flex items-center gap-1">
                        {onListeningClick && (
                            <Button variant="ghost" onClick={onListeningClick} className="!p-2 hover:bg-black/5 dark:hover:bg-white/10" aria-label={listenLabel}>
                                {narrationState === 'playing' ? (
                                    <PauseIcon className="h-5 w-5" />
                                ) : (
                                    <PlayIcon className="h-5 w-5" />
                                )}
                            </Button>
                        )}
                        {onBookmarkToggle && (
                            <Button
                                variant="ghost"
                                onClick={onBookmarkToggle}
                                className="!p-2 hover:bg-black/5 dark:hover:bg-white/10"
                                aria-label="Bookmark page"
                            >
                                <BookmarkIcon className={cn('h-5 w-5', isBookmarked && 'fill-current text-yellow-400')} />
                            </Button>
                        )}
                        {onHighlightToggle && (
                            <Button
                                variant="ghost"
                                onClick={onHighlightToggle}
                                className="!p-2 hover:bg-black/5 dark:hover:bg-white/10"
                                aria-label="Highlight page"
                            >
                                <HighlightIcon className={cn('h-5 w-5', isHighlighted && 'fill-current text-amber-400')} />
                            </Button>
                        )}
                        {onOfflineToggle && (
                            <Button
                                variant="ghost"
                                onClick={onOfflineToggle}
                                disabled={isOfflineBusy}
                                className="!p-2 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                                aria-label={isOfflineAvailable ? 'Remove offline copy' : 'Download for offline reading'}
                            >
                                <DownloadIcon className={cn('h-5 w-5', isOfflineAvailable && 'text-emerald-400')} />
                            </Button>
                        )}
                        <Button variant="ghost" onClick={onSettingsClick} className="!p-2 hover:bg-black/5 dark:hover:bg-white/10"><SettingsIcon className="h-5 w-5" /></Button>
                    </div>
                </div>
            </header>

            {/* Bottom Bar */}
            <footer className={cn(chromeClass, 'bottom-0 border-t pb-[env(safe-area-inset-bottom)]', !isVisible && 'translate-y-full')}>
                <div className="container mx-auto h-20 px-6 flex flex-col justify-center gap-2">
                    <div className="flex justify-between items-center text-xs opacity-70 font-medium">
                        <span>{readingMode === 'page' ? `${lang === 'en' ? 'Page' : 'صفحة'} ${currentPage} / ${totalPages}` : (lang === 'en' ? 'Scroll' : 'تمرير')}</span>
                        <span>{Math.round(progress)}%</span>
                    </div>

                    {/* Progress Bar Visual */}
                    <div className="w-full h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-accent transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
                    </div>

                    <div className="flex justify-center items-center mt-1 gap-4">
                         <button 
                            onClick={() => setReadingMode('scroll')} 
                            className={cn('p-2 rounded-lg transition-colors', readingMode === 'scroll' ? 'bg-black/10 dark:bg-white/10 text-accent' : 'opacity-50 hover:opacity-100')}
                            aria-label="Scroll Mode"
                         >
                            <ViewListIcon className="h-5 w-5" />
                         </button>
                         <button 
                            onClick={() => setReadingMode('page')} 
                            className={cn('p-2 rounded-lg transition-colors', readingMode === 'page' ? 'bg-black/10 dark:bg-white/10 text-accent' : 'opacity-50 hover:opacity-100')}
                            aria-label="Page Mode"
                         >
                            <BookOpenIcon className="h-5 w-5" />
                         </button>
                    </div>
                </div>
            </footer>
        </>
    );
};

export default ReaderChrome;
