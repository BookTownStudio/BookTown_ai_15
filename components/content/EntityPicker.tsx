import React, { useEffect, useState } from 'react';

import { useI18n } from '../../store/i18n.tsx';
import { useToast } from '../../store/toast.tsx';
import {
  buildAuthorPostAttachment,
  buildBookPostAttachment,
  buildQuotePostAttachment,
  buildShelfPostAttachment,
} from '../../types/socialAttachments.ts';
import type { PostAttachment } from '../../types/entities.ts';
import type { Quote } from '../../types/entities.ts';
import { QuoteCardDataAdapter } from './QuoteCardDataAdapter.ts';

import AttachAuthorModal from '../modals/AttachAuthorModal.tsx';
import AttachQuoteModal from '../modals/AttachQuoteModal.tsx';
import AttachShelfModal from '../modals/AttachShelfModal.tsx';
import AttachVenueModal from '../modals/AttachVenueModal.tsx';
import SelectBookModal from '../modals/SelectBookModal.tsx';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { BookIcon, QuoteIcon, MediaIcon, ShelvesIcon, AuthorsIcon, MapPinIcon } from '../icons';

export type EntityPickerEntityType = 'book' | 'author' | 'shelf' | 'quote' | 'media' | 'venue';

interface EntityPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (attachment: PostAttachment) => void;
  enabledTypes?: EntityPickerEntityType[];
  initialType?: EntityPickerEntityType | null;
  onMediaRequested?: () => void;
  includeEvents?: boolean;
}

const DEFAULT_TYPES: EntityPickerEntityType[] = ['book', 'author', 'shelf', 'quote', 'media', 'venue'];

const LABELS: Record<EntityPickerEntityType, { en: string; ar: string; icon: React.FC<React.SVGProps<SVGSVGElement>> }> = {
  book: { en: 'Book', ar: 'كتاب', icon: BookIcon },
  author: { en: 'Author', ar: 'مؤلف', icon: AuthorsIcon },
  shelf: { en: 'Shelf', ar: 'رف', icon: ShelvesIcon },
  quote: { en: 'Quote', ar: 'اقتباس', icon: QuoteIcon },
  media: { en: 'Media', ar: 'وسائط', icon: MediaIcon },
  venue: { en: 'Venue', ar: 'مكان', icon: MapPinIcon },
};

const EntityPicker: React.FC<EntityPickerProps> = ({
  isOpen,
  onClose,
  onSelect,
  enabledTypes = DEFAULT_TYPES,
  initialType = null,
  onMediaRequested,
  includeEvents = true,
}) => {
  const { lang } = useI18n();
  const { showToast } = useToast();
  const [activeType, setActiveType] = useState<EntityPickerEntityType | null>(initialType);

  useEffect(() => {
    if (isOpen) {
      setActiveType(initialType);
    }
  }, [initialType, isOpen]);

  const closeNested = () => setActiveType(null);
  const complete = (attachment: PostAttachment) => {
    onSelect(attachment);
    closeNested();
    onClose();
  };

  const handleQuoteSelect = (quote: Quote) => {
    const card = QuoteCardDataAdapter.fromQuote(quote);
    const canonicalQuoteId = card.canonicalQuoteId || card.id;
    if (!canonicalQuoteId) {
      showToast(lang === 'en' ? 'This quote is unavailable right now.' : 'هذا الاقتباس غير متاح حالياً.');
      return;
    }
    complete(buildQuotePostAttachment({
      quoteId: canonicalQuoteId,
      quoteOwnerId: card.ownerId,
      quoteText: (lang === 'en' ? card.textEn : card.textAr) || card.textEn || card.textAr,
    }));
  };

  const visibleTypes = enabledTypes.filter((type) => type !== 'media' || !!onMediaRequested);

  return (
    <>
      <Modal isOpen={isOpen && !activeType} onClose={onClose}>
        <div className="space-y-3">
          <BilingualText role="H1" className="!text-xl text-center mb-2">
            {lang === 'en' ? 'Share from BookTown' : 'شارك من بوكتاون'}
          </BilingualText>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visibleTypes.map((type) => {
              const meta = LABELS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => type === 'media' ? onMediaRequested?.() : setActiveType(type)}
                  className="flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-xl border border-black/5 bg-white/70 px-3 py-3 text-center transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                  <meta.icon className="h-5 w-5 text-accent" />
                  <span className="text-xs font-medium">{lang === 'en' ? meta.en : meta.ar}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>

      <SelectBookModal
        isOpen={isOpen && activeType === 'book'}
        onClose={closeNested}
        onBookSelect={(book) => complete(buildBookPostAttachment({
          bookId: book.id,
          titleEn: book.titleEn,
          titleAr: book.titleAr,
          authorEn: book.authorEn,
          authorAr: book.authorAr,
          coverUrl: book.coverUrl,
          rating: book.rating,
        }))}
        selectionMode="selectCanonical"
      />
      <AttachAuthorModal
        isOpen={isOpen && activeType === 'author'}
        onClose={closeNested}
        onSelect={(author) => complete(buildAuthorPostAttachment({
          authorId: author.id,
          nameEn: author.nameEn,
          nameAr: author.nameAr,
          avatarUrl: author.avatarUrl,
          countryEn: author.countryEn,
          countryAr: author.countryAr,
          signatureQuote: author.signatureQuoteEn || author.signatureQuoteAr,
        }))}
      />
      <AttachShelfModal
        isOpen={isOpen && activeType === 'shelf'}
        onClose={closeNested}
        onSelect={(shelf) => complete(buildShelfPostAttachment({
          shelfId: shelf.id,
          ownerId: shelf.ownerId,
          titleEn: shelf.titleEn,
          titleAr: shelf.titleAr,
          bookCount: shelf.bookCount ?? (Array.isArray(shelf.bookIds) ? shelf.bookIds.length : 0),
        }))}
      />
      <AttachQuoteModal
        isOpen={isOpen && activeType === 'quote'}
        onClose={closeNested}
        onSelect={handleQuoteSelect}
      />
      <AttachVenueModal
        isOpen={isOpen && activeType === 'venue'}
        onClose={closeNested}
        includeEvents={includeEvents}
        onSelect={(item) => complete({ type: 'venue', venueId: item.id })}
      />
    </>
  );
};

export default EntityPicker;
