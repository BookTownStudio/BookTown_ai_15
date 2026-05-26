// components/content/SearchResultCard.tsx

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/utils.ts';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { PlusIcon } from '../icons/PlusIcon.tsx';
import { CheckCircleIcon } from '../icons/CheckCircleIcon.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { SearchResultDTO } from '../../types/bookSearch.ts';
import { useBookCatalog } from '../../lib/hooks/useBookCatalog.ts';
import { useReaderProgress } from '../../lib/hooks/useReaderProgress.ts';
import OtherEditionsSheet from '../books/OtherEditionsSheet.tsx';

type SemanticChip = {
  key: string;
  label: string;
  className: string;
  kind?: 'tradition' | 'form' | 'subform';
  value?: string;
};

type PrimarySearchAction = 'continue' | 'read' | 'get';

export interface SearchResultCardProps {
  result: SearchResultDTO;
  lang: 'en' | 'ar';

  /** Canonical actions */
  onAdd?: (result: SearchResultDTO) => void;
  onOpen?: (result: SearchResultDTO) => void;
  onRead?: (result: SearchResultDTO) => void;
  onSemanticChipClick?: (chip: {
    kind: 'tradition' | 'form' | 'subform';
    value: string;
    result: SearchResultDTO;
  }) => void;

  isBusy?: boolean;
  isDisabled?: boolean;
  actionSlot?: React.ReactNode;
  className?: string;
}

/**
 * 🔒 SearchResultCard — Discovery & Insertion Safe
 *
 * - Card click → open details
 * - Primary action consumes readerAuthority / reading_progress projections
 * - Plus → explicit add mutation
 * - actionSlot → context-specific action chrome without forking layout
 *
 * Guarantees:
 * - Stable DOM
 * - No upstream coupling
 */
const SearchResultCard: React.FC<SearchResultCardProps> = ({
  result,
  lang,
  onAdd,
  onOpen,
  onRead,
  onSemanticChipClick,
  isBusy = false,
  isDisabled = false,
  actionSlot,
  className = ''
}) => {
  const [didAdd, setDidAdd] = useState(false);
  const [isEditionsSheetOpen, setIsEditionsSheetOpen] = useState(false);
  const addFeedbackTimerRef = useRef<number | null>(null);
  const { data: catalogBook } = useBookCatalog(result.bookId, {
    enabled: Boolean(result.bookId && result.resultType === 'canonical'),
  });
  const { progress: readerProgress } = useReaderProgress(result.bookId);

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

  const canAdd = typeof onAdd === 'function';
  const hasActiveReadingProgress = Boolean(
    readerProgress?.exists &&
      (
        readerProgress.status_state === 'reading' ||
        readerProgress.status_state === 'paused' ||
        readerProgress.status_state === 'rereading'
      )
  );
  const hasReadableAttachment = catalogBook?.readerAuthority?.hasReadableAttachment === true;
  const primaryAction: PrimarySearchAction = hasActiveReadingProgress
    ? 'continue'
    : hasReadableAttachment
    ? 'read'
    : 'get';
  const primaryActionLabel =
    primaryAction === 'continue'
      ? (lang === 'en' ? 'Continue' : 'تابع')
      : primaryAction === 'read'
      ? (lang === 'en' ? 'Read' : 'اقرأ')
      : (lang === 'en' ? 'Get' : 'احصل عليه');
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

  if (hasReadableAttachment) {
    semanticChips.push({
      key: 'booktown-readable',
      label: lang === 'en' ? 'Available in BookTown' : 'متاح في بوكتاون',
      className: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
    });
  }

  if (result.externalReadableSources && result.externalReadableSources.length > 0) {
    semanticChips.push({
      key: 'external-readable',
      label: lang === 'en' ? 'External ebook' : 'كتاب خارجي',
      className: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200',
    });
  }

  if (result.workType === 'edition' || result.editionPresence === 'edition') {
    semanticChips.push({
      key: 'physical',
      label: lang === 'en' ? 'Physical' : 'ورقي',
      className: 'border-white/15 bg-white/5 text-white/70',
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

  const formatSemanticLabel = (value: string): string =>
    value
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const semanticDiscoveryChipCandidates: Array<SemanticChip | null> = [
    result.canonicalTradition
      ? {
          key: 'semantic-tradition',
          label: formatSemanticLabel(result.canonicalTradition),
          className: 'border-amber-300/25 bg-amber-300/10 text-amber-100',
          kind: 'tradition' as const,
          value: result.canonicalTradition,
        }
      : null,
    result.form && result.form !== 'unknown'
      ? {
          key: 'semantic-form',
          label: formatSemanticLabel(result.form),
          className: 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100',
          kind: 'form' as const,
          value: result.form,
        }
      : null,
    result.subForm && result.subForm !== result.form
      ? {
          key: 'semantic-subform',
          label: formatSemanticLabel(result.subForm),
          className: 'border-emerald-300/25 bg-emerald-300/10 text-emerald-100',
          kind: 'subform' as const,
          value: result.subForm,
        }
      : null,
  ];

  const semanticDiscoveryChips = semanticDiscoveryChipCandidates
    .filter((chip): chip is SemanticChip => chip !== null)
    .slice(0, 2);

  const visibleChips = [...semanticDiscoveryChips, ...semanticChips];

  const handlePrimaryAction = () => {
    if (isBusy || isDisabled) return;
    onOpen?.(result);
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

  const handleSearchPrimaryAction = (event: React.MouseEvent) => {
    event.stopPropagation();
    if (isBusy || isDisabled) return;

    if (primaryAction === 'continue' || primaryAction === 'read') {
      onRead?.(result);
      return;
    }

    setIsEditionsSheetOpen(true);
  };

  return (
    <>
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
          'flex gap-3 p-3 rounded-xl',
          'bg-slate-800/60 border border-white/10',
          'hover:bg-slate-800 transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-accent',
          isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
          className
        )}
        aria-disabled={isDisabled}
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

          <BilingualText role="Caption" className="mt-1 text-white/45 text-[11px] leading-tight">
            {[result.language, result.workType].filter(Boolean).join(' · ')}
          </BilingualText>

          {(visibleChips.length > 0 || groupedEditionText) && (
            <div className="mt-2 space-y-1.5">
              {visibleChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {visibleChips.map((chip) => {
                    const chipClassName = cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                      chip.kind && onSemanticChipClick && 'cursor-pointer hover:bg-white/10',
                      chip.className
                    );

                    return chip.kind && chip.value && onSemanticChipClick ? (
                      <button
                        key={chip.key}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSemanticChipClick({
                            kind: chip.kind,
                            value: chip.value,
                            result,
                          });
                        }}
                        className={chipClassName}
                      >
                        {chip.label}
                      </button>
                    ) : (
                      <span key={chip.key} className={chipClassName}>
                        {chip.label}
                      </span>
                    );
                  })}
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
          <Button
            variant="ghost"
            disabled={isBusy || isDisabled}
            onClick={handleSearchPrimaryAction}
            className="!h-9 !rounded-full border border-white/10 !px-4 !text-xs"
          >
            {primaryActionLabel}
          </Button>

          {actionSlot ? (
            <div onClick={(e) => e.stopPropagation()}>{actionSlot}</div>
          ) : null}

          {!actionSlot && canAdd && (
            <Button
              variant="icon"
              aria-label={lang === 'en' ? 'Add book' : 'إضافة كتاب'}
              title={lang === 'en' ? 'Add book' : 'إضافة كتاب'}
              className={cn(
                "!h-10 !w-10 !min-h-10 !min-w-10",
                "!rounded-full !border !border-accent/45",
                "!bg-accent/20 !text-accent shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_20px_rgba(0,0,0,0.22)]",
                "transition-all hover:!bg-accent/30 hover:!border-accent/70",
                "active:scale-95 focus-visible:!ring-2 focus-visible:!ring-accent focus-visible:!ring-offset-2 focus-visible:!ring-offset-slate-950",
                didAdd && "!bg-accent/30 !border-accent/80"
              )}
              disabled={isBusy || isDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (isDisabled) return;
                onAdd?.(result);
                triggerAddFeedback();
              }}
            >
              {isBusy ? (
                <LoadingSpinner className="!h-4 !w-4" />
              ) : didAdd ? (
                <CheckCircleIcon className="h-5 w-5 text-accent" />
              ) : (
                <PlusIcon className="h-8 w-8" />
              )}
            </Button>
          )}
        </div>
      </div>
      <OtherEditionsSheet
        isOpen={isEditionsSheetOpen}
        onClose={() => setIsEditionsSheetOpen(false)}
        bookId={result.bookId}
        lang={lang}
        title={title}
        author={author}
        coverUrl={result.coverUrl}
        coverMode="uploaded"
        externalReadableSources={result.externalReadableSources}
      />
    </>
  );
};

export default SearchResultCard;
