// components/content/SearchResultCard.tsx

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils.ts';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { PlusIcon } from '../icons/PlusIcon.tsx';
import { CheckCircleIcon } from '../icons/CheckCircleIcon.tsx';
import { EyeIcon } from '../icons/EyeIcon.tsx';
import { ChevronRightIcon } from '../icons/ChevronRightIcon.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { SearchResultDTO } from '../../types/bookSearch.ts';

type SemanticChip = {
  key: string;
  label: string;
  className: string;
};

interface SearchResultCardProps {
  result: SearchResultDTO;
  lang: 'en' | 'ar';

  /** Canonical actions */
  onAdd?: (result: SearchResultDTO) => void;
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
  const [didAdd, setDidAdd] = useState(false);
  const addFeedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (addFeedbackTimerRef.current) {
        window.clearTimeout(addFeedbackTimerRef.current);
      }
    };
  }, []);

  const title =
    lang === 'en'
      ? result.titleEn
      : result.titleAr || result.titleEn;

  const author =
    lang === 'en'
      ? result.authorEn || ''
      : result.authorAr || result.authorEn || '';

  const canRead = result.acquired && !!onRead;
  const canAdd = typeof onAdd === 'function';
  const groupedEditionText =
    result.editionPresence === 'grouped'
      ? lang === 'en'
        ? 'Other editions available'
        : 'إصدارات أخرى متاحة'
      : '';

  const semanticChips: SemanticChip[] = [];

  if (result.workType === 'work') {
    semanticChips.push({
      key: 'canonical',
      label: lang === 'en' ? 'Canonical' : 'أساسي',
      className: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    });
  }

  if (result.workType === 'edition') {
    semanticChips.push({
      key: 'edition',
      label: lang === 'en' ? 'Edition' : 'طبعة',
      className: 'border-sky-400/25 bg-sky-400/10 text-sky-200',
    });
  }

  if (result.ebookClass === 'in_app') {
    semanticChips.push({
      key: 'ebook',
      label: lang === 'en' ? 'In-App Ebook' : 'كتاب داخل التطبيق',
      className: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    });
  }

  if (!result.acquired && result.available && result.readAccess === 'trusted_external') {
    semanticChips.push({
      key: 'available',
      label:
        lang === 'en'
          ? `Available via ${result.readProvider === 'openLibrary'
              ? 'OpenLibrary'
              : result.readProvider === 'gutenberg'
              ? 'Gutenberg'
              : result.readProvider === 'hindawi'
              ? 'Hindawi'
              : result.readProvider === 'gallica'
              ? 'Gallica'
              : 'External'}`
          : 'متاح للقراءة',
      className: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200',
    });
  }

  if (result.sourceClass === 'external_provider') {
    semanticChips.push({
      key: 'external',
      label: lang === 'en' ? 'External' : 'مصدر خارجي',
      className: 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200',
    });
  }

  if (result.languageTruth === 'mismatch') {
    semanticChips.push({
      key: 'language',
      label: lang === 'en' ? 'Other language' : 'لغة أخرى',
      className: 'border-white/15 bg-white/5 text-white/70',
    });
  }

  const handlePrimaryAction = () => {
    if (isBusy) return;

    if (mode === 'insertion') {
      onAdd?.(result);
    } else {
      onOpen?.(result);
    }
  };

  const triggerAddFeedback = () => {
    setDidAdd(true);
    if (addFeedbackTimerRef.current) {
      window.clearTimeout(addFeedbackTimerRef.current);
    }
    addFeedbackTimerRef.current = window.setTimeout(() => {
      setDidAdd(false);
    }, 900);
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

        {(semanticChips.length > 0 || groupedEditionText) && (
          <div className="mt-2 space-y-1.5">
            {semanticChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {semanticChips.map((chip) => (
                  <span
                    key={chip.key}
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                      chip.className
                    )}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}

            {groupedEditionText && (
              <BilingualText
                role="Caption"
                className="text-white/55 text-[11px] leading-tight"
              >
                {groupedEditionText}
              </BilingualText>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 justify-center items-center">
        {mode === 'discovery' && (
          <>
            {/* 👁 Ebook indicator / Read */}
            {canRead && (
              <button
                type="button"
                disabled={isBusy}
                title={lang === 'en' ? 'Read ebook' : 'اقرأ الكتاب'}
                onClick={(e) => {
                  e.stopPropagation();
                  onRead?.(result);
                }}
                className={cn(
                  'p-2 rounded-full border transition-colors',
                  'bg-white/5 border-white/10 hover:bg-white/10 cursor-pointer'
                )}
                aria-label={lang === 'en' ? 'Read ebook' : 'اقرأ الكتاب'}
              >
                <EyeIcon className="h-4 w-4 text-white/90" />
              </button>
            )}

            {/* ➕ Add */}
            {canAdd && (
              <Button
                variant="icon"
                aria-label="Add book"
                className={cn(
                  "!h-9 !w-9 transition-all",
                  didAdd && "!bg-accent/20 !border !border-accent/40"
                )}
                disabled={isBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  onAdd?.(result);
                  triggerAddFeedback();
                }}
              >
                {isBusy ? (
                  <LoadingSpinner className="!h-4 !w-4" />
                ) : didAdd ? (
                  <CheckCircleIcon className="h-5 w-5 text-accent" />
                ) : (
                  <PlusIcon className="h-5 w-5" />
                )}
              </Button>
            )}
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
