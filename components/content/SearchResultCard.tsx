// components/content/SearchResultCard.tsx

import React from 'react';
import { cn } from '../../lib/utils.ts';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { PlusIcon } from '../icons/PlusIcon.tsx';
import { EyeIcon } from '../icons/EyeIcon.tsx';
import { ChevronRightIcon } from '../icons/ChevronRightIcon.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';

export interface SearchResultDTO {
  externalId: string;
  source: 'googleBooks' | 'openLibrary';
  titleEn: string;
  titleAr?: string;
  authorEn?: string;
  authorAr?: string;
  coverUrl?: string;
  isEbookAvailable?: boolean;
  rawBook?: any;
}

interface SearchResultCardProps {
  result: SearchResultDTO;
  lang: 'en' | 'ar';

  /** Canonical actions */
  onAdd: (result: SearchResultDTO) => void;
  onOpen?: (result: SearchResultDTO) => void;
  onRead?: (result: SearchResultDTO) => void;

  /** UX mode */
  mode?: 'discovery' | 'insertion';

  isBusy?: boolean;
  className?: string;
}

/**
 * 🔒 SearchResultCard — Discovery & Insertion Safe
 *
 * DISCOVERY mode (default):
 * - Card click → open details
 * - Eye → read ebook (if available)
 * - Plus → add to BookTown
 *
 * INSERTION mode:
 * - Card click → add directly to target shelf
 * - Chevron → open details
 * - No eye / no plus clutter
 *
 * Guarantees:
 * - Stable DOM
 * - No hooks
 * - No upstream coupling
 */
const SearchResultCard: React.FC<SearchResultCardProps> = ({
  result,
  lang,
  onAdd,
  onOpen,
  onRead,
  mode = 'discovery',
  isBusy = false,
  className = ''
}) => {
  const title =
    lang === 'en'
      ? result.titleEn
      : result.titleAr || result.titleEn;

  const author =
    lang === 'en'
      ? result.authorEn || ''
      : result.authorAr || result.authorEn || '';

  const ebookAvailable = !!result.isEbookAvailable;

  const handlePrimaryAction = () => {
    if (isBusy) return;

    if (mode === 'insertion') {
      onAdd(result);
    } else {
      onOpen?.(result);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handlePrimaryAction}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handlePrimaryAction();
        }
      }}
      className={cn(
        'flex gap-3 p-3 rounded-xl cursor-pointer',
        'bg-slate-800/60 border border-white/10',
        'hover:bg-slate-800 transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-accent',
        className
      )}
    >
      {/* Cover */}
      <div className="w-14 h-20 flex-shrink-0 bg-slate-700 rounded-md overflow-hidden">
        {result.coverUrl ? (
          <img
            src={result.coverUrl}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/40 text-xs text-center p-1">
            {title}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="flex-grow min-w-0">
        <BilingualText className="font-semibold text-sm leading-tight line-clamp-2">
          {title}
        </BilingualText>

        {author && (
          <BilingualText
            role="Caption"
            className="text-white/70 mt-0.5 line-clamp-1"
          >
            {author}
          </BilingualText>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 justify-center items-center">
        {mode === 'discovery' && (
          <>
            {/* 👁 Ebook indicator / Read */}
            <button
              type="button"
              disabled={!ebookAvailable || !onRead || isBusy}
              title={
                ebookAvailable
                  ? (lang === 'en' ? 'Read ebook' : 'اقرأ الكتاب')
                  : (lang === 'en'
                      ? 'No ebook available'
                      : 'لا يوجد كتاب إلكتروني')
              }
              onClick={(e) => {
                e.stopPropagation();
                if (ebookAvailable && onRead) {
                  onRead(result);
                }
              }}
              className={cn(
                'p-2 rounded-full border transition-colors',
                'bg-white/5 border-white/10',
                ebookAvailable && onRead
                  ? 'hover:bg-white/10 cursor-pointer'
                  : 'opacity-30 cursor-default'
              )}
              aria-disabled={!ebookAvailable || !onRead}
            >
              <EyeIcon
                className={cn(
                  'h-4 w-4',
                  ebookAvailable ? 'text-white/90' : 'text-white/70'
                )}
              />
            </button>

            {/* ➕ Add */}
            <Button
              variant="icon"
              aria-label="Add book"
              className="!h-9 !w-9"
              disabled={isBusy}
              onClick={(e) => {
                e.stopPropagation();
                onAdd(result);
              }}
            >
              {isBusy ? (
                <LoadingSpinner className="!h-4 !w-4" />
              ) : (
                <PlusIcon className="h-5 w-5" />
              )}
            </Button>
          </>
        )}

        {mode === 'insertion' && onOpen && (
          <button
            type="button"
            aria-label={
              lang === 'en' ? 'View details' : 'عرض التفاصيل'
            }
            onClick={(e) => {
              e.stopPropagation();
              onOpen(result);
            }}
            className={cn(
              'p-2 rounded-full border transition-colors',
              'bg-white/5 border-white/10 hover:bg-white/10'
            )}
          >
            <ChevronRightIcon className="h-4 w-4 text-white/90" />
          </button>
        )}
      </div>
    </div>
  );
};

export default SearchResultCard;
