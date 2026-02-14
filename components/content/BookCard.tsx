// components/content/BookCard.tsx

import React, { useState, useCallback, useMemo } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import ProgressBar from '../ui/ProgressBar.tsx';
import { useBookCatalog } from '../../lib/hooks/useBookCatalog.ts';
import { useNavigation } from '../../store/navigation.tsx';
import { EyeIcon } from '../icons/EyeIcon.tsx';
import { BasketIcon } from '../icons/BasketIcon.tsx';
import { EllipsisIcon } from '../icons/EllipsisIcon.tsx';
import { generateColorFromText, cn } from '../../lib/utils.ts';
import { Book } from '../../types/entities.ts';
import { BookCardSkeleton } from '../ui/Skeletons.tsx';
import { usePrefetch } from '../../lib/hooks/usePrefetch.ts';
import { useRemoveBookFromShelf } from '../../lib/hooks/useToggleBookOnShelf.ts';
import MoveBookModal from '../modals/MoveBookModal.tsx';

interface BookCardProps {
  bookId: string;
  book?: Book; // optional hint ONLY
  shelfId?: string;
  layout: 'grid' | 'list' | 'row';
  progress?: number;
  className?: string;
}

const BookCard: React.FC<BookCardProps> = ({
  bookId,
  book: providedBook,
  shelfId,
  layout,
  progress,
  className = ''
}) => {
  // ----------------------------------
  // Hooks (never conditional)
  // ----------------------------------

  const { lang, isRTL } = useI18n();
  const { navigate, currentView } = useNavigation();
  const { prefetchBook } = usePrefetch();
  const { mutate: removeBook } = useRemoveBookFromShelf();

  const [imageError, setImageError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);

  const {
    data: catalogBook,
    isLoading,
    isError
  } = useBookCatalog(bookId, { enabled: !!bookId && !providedBook });

  const book = catalogBook ?? providedBook ?? null;

  // ----------------------------------
  // Derived values
  // ----------------------------------

  const title = useMemo(
    () => {
      if (!book) return '';
      if (lang === 'en') {
        return book.titleEn || book.titleAr || 'Untitled';
      }
      return book.titleAr || book.titleEn || 'بدون عنوان';
    },
    [book, lang]
  );

  const author = useMemo(
    () => {
      if (!book) return '';
      if (lang === 'en') {
        return book.authorEn || book.authorAr || 'Unknown';
      }
      return book.authorAr || book.authorEn || 'غير معروف';
    },
    [book, lang]
  );

  const fallbackColorClass = useMemo(
    () => generateColorFromText(book?.titleEn || 'book'),
    [book?.titleEn]
  );

  const hasInAppEbook = !!book?.ebookAttachmentId || !!book?.isEbookAvailable;
  const hasExternalBuy = !!book?.isEbookAvailable;

  // ----------------------------------
  // Callbacks
  // ----------------------------------

  const handleAuthorClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!book?.authorId) return;

      navigate({
        type: 'immersive',
        id: 'authorDetails',
        params: { authorId: book.authorId, from: currentView }
      });
    },
    [book?.authorId, navigate, currentView]
  );

  const handleMouseEnter = useCallback(() => {
    if (bookId) prefetchBook(bookId);
  }, [bookId, prefetchBook]);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  // ----------------------------------
  // Menu actions
  // ----------------------------------

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (!shelfId) return;
    removeBook({ shelfId, bookId });
  };

  const handleMove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    setShowMoveModal(true);
  };

  // ----------------------------------
  // Cover
  // ----------------------------------

  const coverNode = useMemo(() => {
    if (!book) return null;

    return (
      <div className="relative w-full h-full overflow-hidden rounded-card shadow-md bg-slate-800">
        {imageError || !book.coverUrl ? (
          <div
            className={cn(
              'w-full h-full flex items-center justify-center p-2',
              fallbackColorClass
            )}
          >
            <p className="text-white font-bold text-[10px] leading-tight line-clamp-3">
              {title}
            </p>
          </div>
        ) : (
          <img
            src={book.coverUrl}
            alt={title}
            className="w-full h-full object-cover"
            onError={handleImageError}
            loading="lazy"
          />
        )}

        {/* Availability Badge — ALWAYS RENDERED */}
        <div
          className={cn(
            'absolute bottom-1 right-1 p-1 rounded-full backdrop-blur-sm border transition-all',
            (hasInAppEbook || hasExternalBuy)
              ? 'bg-black/60 border-white/10'
              : 'bg-black/40 border-white/10 opacity-40'
          )}
          title={
            hasInAppEbook
              ? lang === 'en'
                ? 'Read in app'
                : 'متاح للقراءة'
              : hasExternalBuy
                ? lang === 'en'
                  ? 'Available to buy'
                  : 'متوفر للشراء'
                : lang === 'en'
                  ? 'No ebook available'
                  : 'لا يوجد كتاب إلكتروني'
          }
        >
          {hasInAppEbook ? (
            <EyeIcon className="h-3 w-3 text-white" />
          ) : (
            <BasketIcon className="h-3 w-3 text-white" />
          )}
        </div>

        {/* Ellipsis menu (ONLY inside shelf) */}
        {shelfId && (
          <div className="absolute top-1 right-1 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(v => !v);
              }}
              className="p-1.5 rounded-full bg-black/60 backdrop-blur-sm hover:bg-black/80"
            >
              <EllipsisIcon className="h-3.5 w-3.5 text-white" />
            </button>

            {menuOpen && (
              <div
                className={cn(
                  'absolute mt-1 w-28 rounded-xl shadow-lg bg-slate-900 border border-white/10 overflow-hidden',
                  isRTL ? 'left-0' : 'right-0'
                )}
              >
                <button
                  onClick={handleRemove}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-white/10"
                >
                  {lang === 'en' ? 'Remove' : 'إزالة'}
                </button>
                <button
                  onClick={handleMove}
                  className="w-full px-3 py-2 text-xs text-left hover:bg-white/10"
                >
                  {lang === 'en' ? 'Move' : 'نقل'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }, [
    book,
    imageError,
    fallbackColorClass,
    title,
    handleImageError,
    menuOpen,
    lang,
    isRTL,
    shelfId,
    hasInAppEbook,
    hasExternalBuy
  ]);

  // ----------------------------------
  // Guards
  // ----------------------------------

  if (!bookId) {
    return <BookCardSkeleton layout={layout} />;
  }

  if (!book && isLoading) {
    return <BookCardSkeleton layout={layout} />;
  }

  if (isError && !book) {
    return null;
  }

  if (!book) {
    return null;
  }

  // ----------------------------------
  // Layout
  // ----------------------------------

  return (
    <>
      <div
        className={cn(
          'flex flex-col',
          layout === 'list' ? 'w-32 mr-4 flex-shrink-0' : 'w-full',
          className
        )}
        onMouseEnter={handleMouseEnter}
      >
        <div className="aspect-[2/3] w-full mb-3">{coverNode}</div>

        {progress !== undefined && (
          <div className="mb-2">
            <ProgressBar progress={progress} />
          </div>
        )}

        <BilingualText className="font-bold text-sm line-clamp-2">
          {title}
        </BilingualText>

        <button onClick={handleAuthorClick} className="text-left w-full">
          <BilingualText role="Caption" className="line-clamp-1 text-accent">
            {author}
          </BilingualText>
        </button>
      </div>

      {shelfId && showMoveModal && (
        <MoveBookModal
          isOpen={showMoveModal}
          onClose={() => setShowMoveModal(false)}
          bookId={bookId}
          book={book}
          fromShelfId={shelfId}
        />
      )}
    </>
  );
};

export default React.memo(BookCard);
