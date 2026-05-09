import React from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { SearchIcon } from '../icons/SearchIcon.tsx';
import { MicIcon } from '../icons/MicIcon.tsx';
import { CameraIcon } from '../icons/CameraIcon.tsx';
import { XCircleIcon } from '../icons/XCircleIcon.tsx';

interface HomeSearchBarProps {
  value: string;
  onChange: (val: string) => void;
  onMicClick: (e: React.MouseEvent) => void;
  onCameraClick: (e: React.MouseEvent) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onClear?: () => void;
  recentSearches?: string[];
  showRecentSearches?: boolean;
  onSelectRecentSearch?: (query: string) => void;
  onRemoveRecentSearch?: (query: string) => void;
}

const HomeSearchBar: React.FC<HomeSearchBarProps> = ({
  value,
  onChange,
  onMicClick,
  onCameraClick,
  onFocus,
  onBlur,
  onClear,
  recentSearches = [],
  showRecentSearches = false,
  onSelectRecentSearch,
  onRemoveRecentSearch
}) => {
  const { lang, isRTL } = useI18n();
  const shouldShowRecentSearches =
    showRecentSearches && value.trim().length === 0 && recentSearches.length > 0;

  return (
    <div className="relative w-full group">
      {/* Search Icon */}
      <div
        className={`absolute inset-y-0 ${
          isRTL ? 'right-4' : 'left-4'
        } flex items-center pointer-events-none z-10`}
      >
        <SearchIcon className="h-5 w-5 text-slate-400 group-focus-within:text-accent transition-colors" />
      </div>

      <input
        type="text"
        dir={isRTL ? 'rtl' : 'ltr'}
        placeholder={lang === 'en' ? 'Seek a book...' : 'ابحث عن كتاب...'}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`
          w-full h-14 bg-white dark:bg-slate-800 rounded-2xl
          ${isRTL ? 'pr-12 pl-28' : 'pl-12 pr-28'}
          text-slate-900 dark:text-white
          border border-slate-200 dark:border-slate-700
          outline-none focus:ring-2 focus:ring-primary/50
          transition-all shadow-sm
        `}
      />

      {/* Trailing Actions */}
      <div
        className={`absolute inset-y-0 ${
          isRTL ? 'left-2' : 'right-2'
        } flex items-center gap-1`}
      >
        {value && (
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onClear?.();
            }}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
            aria-label="Clear search"
          >
            <XCircleIcon className="h-5 w-5" />
          </button>
        )}

        <button
          onClick={onMicClick}
          type="button"
          className="p-2 text-slate-400 hover:text-accent transition-colors active:scale-95"
          aria-label={lang === 'en' ? 'Voice Search' : 'بحث صوتي'}
        >
          <MicIcon className="h-6 w-6" />
        </button>

        <button
          onClick={onCameraClick}
          type="button"
          className="p-2 text-slate-400 hover:text-accent transition-colors active:scale-95"
          aria-label={lang === 'en' ? 'Visual Search' : 'بحث بصري'}
        >
          <CameraIcon className="h-6 w-6" />
        </button>
      </div>

      {shouldShowRecentSearches && (
        <div
          className={`
            absolute top-[calc(100%+0.25rem)] z-30 overflow-hidden rounded-xl
            border border-slate-200/35 bg-white/80 backdrop-blur-md
            dark:border-white/[0.06] dark:bg-slate-900/70
            animate-fade-in
            ${isRTL ? 'right-10 left-3' : 'left-10 right-3'}
          `}
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="py-1">
            {recentSearches.map((query) => (
              <div
                key={query}
                className={`
                  group flex min-h-8 items-center gap-1.5 px-2 text-[12px]
                  text-slate-500 transition-colors hover:bg-slate-100/45 hover:text-slate-700
                  dark:text-slate-400 dark:hover:bg-white/[0.035] dark:hover:text-slate-200
                  ${isRTL ? 'flex-row-reverse text-right' : ''}
                `}
              >
                <SearchIcon className="h-3.5 w-3.5 shrink-0 text-slate-400/55 dark:text-slate-500/60" />
                <button
                  type="button"
                  className={`
                    min-w-0 flex-1 truncate py-1.5 font-serif font-normal leading-none
                    focus-visible:outline-none focus-visible:text-slate-800
                    dark:focus-visible:text-slate-100
                    ${isRTL ? 'text-right' : 'text-left'}
                  `}
                  onClick={() => onSelectRecentSearch?.(query)}
                >
                  {query}
                </button>
                <button
                  type="button"
                  className="
                    shrink-0 rounded-full p-1 text-slate-400/45 opacity-25
                    transition-[opacity,color] hover:text-slate-600 hover:opacity-80
                    focus-visible:opacity-80 focus-visible:outline-none
                    dark:text-slate-500/60 dark:hover:text-slate-200
                    md:opacity-0 md:group-hover:opacity-55
                  "
                  aria-label={lang === 'en' ? 'Remove recent search' : 'حذف البحث الأخير'}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveRecentSearch?.(query);
                  }}
                >
                  <XCircleIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeSearchBar;
