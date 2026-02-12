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
  onClear?: () => void;
}

const HomeSearchBar: React.FC<HomeSearchBarProps> = ({
  value,
  onChange,
  onMicClick,
  onCameraClick,
  onFocus,
  onClear
}) => {
  const { lang, isRTL } = useI18n();

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
          className="p-2 text-slate-400 hover:text-accent transition-colors active:scale-95"
          aria-label={lang === 'en' ? 'Voice Search' : 'بحث صوتي'}
        >
          <MicIcon className="h-6 w-6" />
        </button>

        <button
          onClick={onCameraClick}
          className="p-2 text-slate-400 hover:text-accent transition-colors active:scale-95"
          aria-label={lang === 'en' ? 'Visual Search' : 'بحث بصري'}
        >
          <CameraIcon className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
};

export default HomeSearchBar;