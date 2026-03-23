import React from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useOwnLongformPublications } from '../../lib/hooks/useOwnLongformPublications.ts';
import type { OwnedLongformPublicationRecord } from '../../services/db.types.ts';
import { BookIcon } from '../icons/BookIcon.tsx';
import { ClockIcon } from '../icons/ClockIcon.tsx';

interface SelectPublicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (publication: OwnedLongformPublicationRecord) => void;
}

const formatPublishedDate = (value: string, lang: 'en' | 'ar'): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return lang === 'en' ? 'Recently published' : 'نُشر حديثاً';
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const SelectPublicationModal: React.FC<SelectPublicationModalProps> = ({
  isOpen,
  onClose,
  onSelect,
}) => {
  const { lang } = useI18n();
  const {
    data: publications,
    isLoading,
    isError,
  } = useOwnLongformPublications();

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-lg">
        <BilingualText role="H1" className="!text-xl text-center mb-4">
          {lang === 'en' ? 'Attach a Publication' : 'إرفاق منشور'}
        </BilingualText>

        <div className="mt-4 max-h-[26rem] overflow-y-auto space-y-3">
          {isLoading ? (
            <div className="flex justify-center pt-8">
              <LoadingSpinner />
            </div>
          ) : null}

          {!isLoading && isError ? (
            <BilingualText className="text-center pt-8 text-red-400">
              {lang === 'en'
                ? 'Publications are temporarily unavailable.'
                : 'المنشورات غير متاحة مؤقتاً.'}
            </BilingualText>
          ) : null}

          {!isLoading && !isError && (!publications || publications.length === 0) ? (
            <BilingualText className="text-center pt-8 text-slate-500">
              {lang === 'en'
                ? 'No publications available yet.'
                : 'لا توجد منشورات متاحة بعد.'}
            </BilingualText>
          ) : null}

          {!isLoading && !isError && publications?.map((publication) => (
            <button
              key={publication.publicationId}
              type="button"
              onClick={() => onSelect(publication)}
              className="w-full rounded-2xl border border-black/5 bg-white/70 p-3 text-left transition hover:bg-black/5 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <div className="flex items-start gap-3">
                <div className="h-16 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-[#ddd1bc] dark:bg-white/10">
                  {publication.coverUrl ? (
                    <img
                      src={publication.coverUrl}
                      alt={publication.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <BookIcon className="h-5 w-5 text-[#9c8b75] dark:text-white/40" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <BilingualText className="font-semibold line-clamp-2">
                    {publication.title}
                  </BilingualText>
                  <BilingualText role="Body" className="mt-1 !text-sm text-slate-500 dark:text-white/60 line-clamp-2">
                    {publication.excerpt}
                  </BilingualText>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-white/50">
                    <span>{formatPublishedDate(publication.lastPublishedAt, lang)}</span>
                    <span className="inline-flex items-center gap-1">
                      <ClockIcon className="h-3.5 w-3.5" />
                      {publication.estimatedReadingMinutes} min
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default SelectPublicationModal;
