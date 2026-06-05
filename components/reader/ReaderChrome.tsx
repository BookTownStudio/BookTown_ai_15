
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
import { BookIcon } from '../icons/BookIcon.tsx';
import { PlayIcon } from '../icons/PlayIcon.tsx';
import { PauseIcon } from '../icons/PauseIcon.tsx';

interface ReaderChromeProps {
    isVisible: boolean;
    book: Book;
    onBack: () => void;
    onBookDetailsClick?: () => void;
    progress: number;
    currentPage: number;
    totalPages: number;
    progressContextLabel?: string | null;
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
    onPreviousPage?: () => void;
    onNextPage?: () => void;
}

const ReaderChrome: React.FC<ReaderChromeProps> = ({
    isVisible,
    book,
    onBack,
    onBookDetailsClick,
    progress,
    currentPage,
    totalPages,
    progressContextLabel,
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
    onPreviousPage,
    onNextPage,
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
        'fixed left-0 w-full z-20 transition-[opacity,transform] duration-[180ms] ease-out will-change-transform backdrop-blur-xl border-black/5 dark:border-white/5 shadow-sm',
        bgStyles, textStyles,
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 pointer-events-none'
    );
    const actionButtonClass = '!p-0 h-11 min-w-0 flex-1 flex-col gap-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10';
    const actionLabelClass = 'text-[10px] leading-none font-medium opacity-70';

    return (
        <>
            {/* Top Bar */}
            <header className={cn(chromeClass, 'top-0 border-b', !isVisible && '-translate-y-full')}>
                <div className="container mx-auto flex h-24 flex-col justify-center gap-2 px-4 pb-2 pt-3">
                    <div className="relative min-w-0 px-10 text-center">
                        <Button
                            variant="ghost"
                            onClick={onBack}
                            className="absolute left-0 top-1/2 !p-2 -translate-y-1/2 hover:bg-black/5 dark:hover:bg-white/10"
                            aria-label={lang === 'en' ? 'Back' : 'عودة'}
                        >
                            <ChevronLeftIcon className="h-5 w-5" />
                        </Button>
                        <p className="truncate text-[13px] leading-tight">
                            <span className="font-semibold">{lang === 'en' ? book.titleEn : book.titleAr}</span>
                            <span className="px-1.5 opacity-45">—</span>
                            <span className="font-normal opacity-75">{lang === 'en' ? book.authorEn : book.authorAr}</span>
                        </p>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-1">
                        {onBookDetailsClick && (
                            <Button
                                variant="ghost"
                                onClick={onBookDetailsClick}
                                className={actionButtonClass}
                                aria-label={lang === 'en' ? 'Open book details' : 'افتح تفاصيل الكتاب'}
                                title={lang === 'en' ? 'Book details' : 'تفاصيل الكتاب'}
                            >
                                <BookIcon className="h-5 w-5" />
                                <span className={actionLabelClass}>{lang === 'en' ? 'Comment' : 'تعليق'}</span>
                            </Button>
                        )}
                        {onListeningClick && (
                            <Button variant="ghost" onClick={onListeningClick} className={actionButtonClass} aria-label={listenLabel}>
                                {narrationState === 'playing' ? (
                                    <PauseIcon className="h-5 w-5" />
                                ) : (
                                    <PlayIcon className="h-5 w-5" />
                                )}
                                <span className={actionLabelClass}>{lang === 'en' ? 'Narration' : 'السرد'}</span>
                            </Button>
                        )}
                        {onBookmarkToggle && (
                            <Button
                                variant="ghost"
                                onClick={onBookmarkToggle}
                                className={actionButtonClass}
                                aria-label="Bookmark page"
                            >
                                <BookmarkIcon className={cn('h-5 w-5', isBookmarked && 'fill-current text-yellow-400')} />
                                <span className={actionLabelClass}>{lang === 'en' ? 'Bookmark' : 'إشارة'}</span>
                            </Button>
                        )}
                        {onHighlightToggle && (
                            <Button
                                variant="ghost"
                                onClick={onHighlightToggle}
                                className={actionButtonClass}
                                aria-label="Highlight page"
                            >
                                <HighlightIcon className={cn('h-5 w-5', isHighlighted && 'fill-current text-amber-400')} />
                                <span className={actionLabelClass}>{lang === 'en' ? 'Annotate' : 'تمييز'}</span>
                            </Button>
                        )}
                        {onOfflineToggle && (
                            <Button
                                variant="ghost"
                                onClick={onOfflineToggle}
                                disabled={isOfflineBusy}
                                className={cn(actionButtonClass, 'disabled:opacity-50')}
                                aria-label={isOfflineAvailable ? 'Remove offline copy' : 'Download for offline reading'}
                            >
                                <DownloadIcon className={cn('h-5 w-5', isOfflineAvailable && 'text-emerald-400')} />
                                <span className={actionLabelClass}>{lang === 'en' ? 'Download' : 'تنزيل'}</span>
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            onClick={onSettingsClick}
                            className={actionButtonClass}
                            aria-label={lang === 'en' ? 'Reader settings' : 'إعدادات القارئ'}
                        >
                            <SettingsIcon className="h-5 w-5" />
                            <span className={actionLabelClass}>{lang === 'en' ? 'Settings' : 'إعدادات'}</span>
                        </Button>
                    </div>
                </div>
            </header>

            {/* Bottom Bar */}
            <footer className={cn(chromeClass, 'bottom-0 border-t pb-[env(safe-area-inset-bottom)]', !isVisible && 'translate-y-full')}>
                <div className="container mx-auto h-20 px-6 flex flex-col justify-center gap-1.5">
                    {progressContextLabel && (
                        <p className="truncate text-[11px] font-medium leading-tight opacity-60">
                            {progressContextLabel}
                        </p>
                    )}
                    <div className="flex justify-between items-center text-xs opacity-70 font-medium">
                        <span>
                            {readingMode === 'page'
                                ? `${lang === 'en' ? 'Page' : 'صفحة'} ${currentPage} / ${totalPages}`
                                : (lang === 'en' ? 'Scroll' : 'تمرير')}
                        </span>
                        <span>{Math.round(progress)}%</span>
                    </div>

                    {/* Progress Bar Visual */}
                    <div className="w-full h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-accent transition-[width] duration-[180ms] ease-out" style={{ width: `${progress}%` }} />
                    </div>

                    <div
                        className={cn(
                            'mt-1 grid gap-2 text-xs font-semibold',
                            readingMode === 'page' ? 'grid-cols-[2.5rem_1fr_2.5rem]' : 'grid-cols-1'
                        )}
                    >
                        {readingMode === 'page' && (
                            <button
                                type="button"
                                onClick={onPreviousPage}
                                disabled={!onPreviousPage}
                                className="flex h-9 items-center justify-center rounded-md border border-black/10 bg-black/5 text-base transition-colors hover:bg-black/10 disabled:opacity-35 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                                aria-label={lang === 'en' ? 'Previous page' : 'الصفحة السابقة'}
                            >
                                ‹
                            </button>
                        )}
                        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-black/10 bg-black/5 dark:border-white/10 dark:bg-white/5">
                         <button 
                            onClick={() => setReadingMode('scroll')} 
                            className={cn('flex items-center justify-center gap-1.5 px-3 py-2 transition-colors', readingMode === 'scroll' ? 'bg-black/10 dark:bg-white/10 text-accent' : 'opacity-60 hover:opacity-100')}
                            aria-label="Scroll Mode"
                         >
                            <ViewListIcon className="h-5 w-5" />
                            <span>{lang === 'en' ? 'Scroll' : 'تمرير'}</span>
                         </button>
                         <button 
                            onClick={() => setReadingMode('page')} 
                            className={cn('flex items-center justify-center gap-1.5 px-3 py-2 transition-colors', readingMode === 'page' ? 'bg-black/10 dark:bg-white/10 text-accent' : 'opacity-60 hover:opacity-100')}
                            aria-label="Page Mode"
                         >
                            <BookOpenIcon className="h-5 w-5" />
                            <span>{lang === 'en' ? 'Pages' : 'صفحات'}</span>
                         </button>
                        </div>
                        {readingMode === 'page' && (
                            <button
                                type="button"
                                onClick={onNextPage}
                                disabled={!onNextPage}
                                className="flex h-9 items-center justify-center rounded-md border border-black/10 bg-black/5 text-base transition-colors hover:bg-black/10 disabled:opacity-35 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                                aria-label={lang === 'en' ? 'Next page' : 'الصفحة التالية'}
                            >
                                ›
                            </button>
                        )}
                    </div>
                </div>
            </footer>
        </>
    );
};

export default ReaderChrome;
