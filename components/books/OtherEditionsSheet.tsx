import React, { useMemo } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import CanonicalCoverArtwork from '../content/CanonicalCoverArtwork.tsx';
import { useBookEditions } from '../../lib/hooks/useBookEditions.ts';
import type { BookEdition, CanonicalCoverMode, CanonicalFallbackCover } from '../../types/entities.ts';
import type { ExternalReadableSourceDTO } from '../../types/bookSearch.ts';

type AcquisitionEditionRow = {
  id: string;
  coverUrl: string;
  title: string;
  format: string;
  language: string;
  provider: string;
  price: string;
  availability: string;
  actionLabel: string;
  actionUrl: string | null;
};

interface OtherEditionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  bookId?: string;
  lang: 'en' | 'ar';
  title?: string;
  author?: string;
  coverUrl?: string;
  coverMode?: CanonicalCoverMode;
  fallbackCover?: CanonicalFallbackCover;
  externalReadableSources?: ExternalReadableSourceDTO[];
}

function formatEditionProvider(value: string | null | undefined): string {
  switch (value) {
  case 'google_books':
    return 'Google Books';
  case 'open_library':
    return 'Open Library';
  case 'booktown':
    return 'BookTown';
  case 'gutenberg':
    return 'Project Gutenberg';
  case 'hindawi':
    return 'Hindawi';
  case 'gallica':
    return 'Gallica';
  case 'other':
    return 'Provider';
  default:
    return value || 'Provider';
  }
}

function formatEditionType(value: string | null | undefined): string {
  if (!value) return 'Edition';
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function editionCoverUrl(edition: BookEdition): string {
  return (
    edition.coverImages?.medium ||
    edition.coverImages?.large ||
    edition.coverImages?.small ||
    ''
  );
}

const OtherEditionsSheet: React.FC<OtherEditionsSheetProps> = ({
  isOpen,
  onClose,
  bookId,
  lang,
  title,
  author,
  coverUrl,
  coverMode,
  fallbackCover,
  externalReadableSources,
}) => {
  const { data: editions = [], isLoading } = useBookEditions(bookId);

  const rows: AcquisitionEditionRow[] = useMemo(() => {
    const editionRows = editions.map((edition) => ({
      id: `edition:${edition.editionId}`,
      coverUrl: editionCoverUrl(edition),
      title: edition.title || title || 'Edition',
      format: formatEditionType(edition.editionFormat),
      language: edition.language || 'unknown',
      provider: formatEditionProvider(edition.source),
      price: lang === 'en' ? 'Not provided' : 'غير متوفر',
      availability: edition.ebookAvailable
        ? (lang === 'en' ? 'Provider marks ebook available' : 'المزوّد يضعها ككتاب إلكتروني متاح')
        : (lang === 'en' ? 'Provider listing' : 'إدراج المزوّد'),
      actionLabel: lang === 'en' ? 'Get' : 'احصل عليه',
      actionUrl: null,
    }));

    const sourceRows =
      externalReadableSources?.map((source) => ({
        id: `provider:${source.provider}:${source.providerExternalId}`,
        coverUrl: coverUrl || '',
        title:
          source.provider === 'openLibrary'
            ? 'Open Library'
            : source.provider === 'gutenberg'
            ? 'Project Gutenberg'
            : formatEditionProvider(source.provider),
        format: 'Ebook',
        language: 'unknown',
        provider: formatEditionProvider(source.provider),
        price: lang === 'en' ? 'Not provided' : 'غير متوفر',
        availability: lang === 'en' ? 'Trusted external source' : 'مصدر خارجي موثوق',
        actionLabel: lang === 'en' ? 'Get' : 'احصل عليه',
        actionUrl: null,
      })) || [];

    return [...editionRows, ...sourceRows].slice(0, 12);
  }, [coverUrl, editions, externalReadableSources, lang, title]);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-5 pt-2 text-slate-950 dark:text-white">
        <div>
          <BilingualText role="H2" className="!text-xl !font-bold">
            {lang === 'en' ? 'Other Editions' : 'طبعات أخرى'}
          </BilingualText>
          <p className="mt-1 text-sm text-slate-500 dark:text-white/55">
            {lang === 'en' ? 'Provider and referral metadata.' : 'بيانات المزوّد والإحالة.'}
          </p>
        </div>
        <div className="space-y-2">
          {isLoading ? (
            <div className="flex min-h-32 items-center justify-center">
              <LoadingSpinner />
            </div>
          ) : rows.length > 0 ? (
            rows.map((option) => (
              <div
                key={option.id}
                className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-lg border border-black/10 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5 sm:grid-cols-[64px_minmax(0,1fr)_auto]"
              >
                <div className="aspect-[2/3] overflow-hidden rounded-md border border-black/10 bg-slate-200 dark:border-white/10 dark:bg-black/30">
                  <CanonicalCoverArtwork
                    title={option.title}
                    author={author}
                    coverUrl={option.coverUrl}
                    coverMode={option.coverUrl ? 'uploaded' : coverMode}
                    fallbackCover={fallbackCover}
                    variant="poster"
                    imageClassName="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm font-bold">{option.title}</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-white/55">
                    <span>{option.format}</span>
                    <span>{option.language}</span>
                    <span>{option.provider}</span>
                    <span>{option.price}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-white/55">{option.availability}</p>
                </div>
                <Button
                  variant="ghost"
                  disabled={!option.actionUrl}
                  onClick={() => {
                    if (option.actionUrl) window.open(option.actionUrl, '_blank', 'noopener,noreferrer');
                  }}
                  className="col-span-2 !h-9 !rounded-full border border-black/10 !px-4 !text-xs dark:border-white/10 sm:col-span-1 sm:self-center"
                >
                  {option.actionLabel}
                </Button>
              </div>
            ))
          ) : (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-white/55">
              {lang === 'en'
                ? 'No provider edition metadata is available yet.'
                : 'لا تتوفر بيانات طبعات من المزوّد بعد.'}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default OtherEditionsSheet;
