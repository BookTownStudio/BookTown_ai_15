import { devLog } from '../../lib/logging/devLog';
import React, { useRef, useMemo, useCallback } from 'react';
import BookCard from './BookCard.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { Book, Shelf, ShelfEntry } from '../../types/entities.ts';
import { useShelfEntries } from '../../lib/hooks/useUserShelves.ts';
import { useNavigation } from '../../store/navigation.tsx';
import AddBookCard from './AddBookCard.tsx';
import ShelfHeader from './ShelfHeader.tsx';
import AddBookRow from './AddBookRow.tsx';
import { useRemoveBookFromShelf } from '../../lib/hooks/useToggleBookOnShelf.ts';
import Button from '../ui/Button.tsx';
import { TrashIcon } from '../icons/TrashIcon.tsx';

interface ShelfCarouselProps {
  shelf: Shelf;
  id?: string;
  entriesOverride?: (ShelfEntry & { book?: Book })[];
  isLoadingOverride?: boolean;
  isErrorOverride?: boolean;
  isMenuOpen?: boolean;
  onToggleMenu?: () => void;
  onAddBookRequest?: (shelfId: string) => void;
  onEditRequest?: (shelf: Shelf) => void;
  onShareRequest?: (shelf: Shelf) => void;
  onDeleteRequest?: (shelf: Shelf) => void;
  onDuplicateRequest?: (shelf: Shelf) => void;
  isOpen: boolean;
  onToggle?: () => void;
  onToggleLayout?: () => void;
  layout: 'carousel' | 'list';
  isDeletable?: boolean;
  ebookOnly?: boolean;
  entriesAreVirtual?: boolean;
}

const noop = () => {};

const ShelfCarousel: React.FC<ShelfCarouselProps> = ({
  shelf,
  id,
  entriesOverride,
  isLoadingOverride,
  isErrorOverride,
  isMenuOpen = false,
  onToggleMenu = noop,
  onAddBookRequest,
  onEditRequest,
  onShareRequest,
  onDeleteRequest,
  onDuplicateRequest,
  isOpen,
  onToggle = noop,
  onToggleLayout,
  layout,
  isDeletable = false,
  ebookOnly = false,
  entriesAreVirtual = false
}) => {
  const { lang } = useI18n();
  const { navigate, currentView } = useNavigation();

  /**
   * 🔒 AUTHORITATIVE Shelf Content Fetch
   */
  const { data: entries = [], isLoading, isError } = useShelfEntries(
    shelf.id,
    shelf.ownerId,
    { enabled: !entriesOverride }
  );
  const effectiveEntries = entriesOverride ?? entries;
  const effectiveIsLoading = isLoadingOverride ?? isLoading;
  const effectiveIsError = isErrorOverride ?? isError;

  const { mutate: removeBook, isPending: isRemoving } =
    useRemoveBookFromShelf();

  const draggedItemIndex = useRef<number | null>(null);

  /**
   * Canonical filtering logic
   */
  const filteredEntries = useMemo(() => {
    if (!ebookOnly) return effectiveEntries;
    return effectiveEntries.filter(e =>
      e.book?.readerAuthority?.hasReadableAttachment === true
    );
  }, [effectiveEntries, ebookOnly]);

  /* ------------------------
     Navigation
  ------------------------ */
  const handleBookClick = useCallback(
    (bookId: string) => {
      navigate({
        type: 'immersive',
        id: 'bookDetails',
        params: { bookId, from: currentView }
      });
    },
    [navigate, currentView]
  );

  const handleRemoveBook = useCallback(
    (e: React.MouseEvent, bookId: string) => {
      e.stopPropagation();
      removeBook({ shelfId: shelf.id, bookId });
    },
    [removeBook, shelf.id]
  );

  /* ------------------------
     Drag & drop
  ------------------------ */
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, index: number) => {
      draggedItemIndex.current = index;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => e.currentTarget.classList.add('dragging'), 0);
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, dropIndex: number) => {
      e.preventDefault();
      const draggedIndex = draggedItemIndex.current;
      if (draggedIndex === null || draggedIndex === dropIndex) return;

      const reordered = [...filteredEntries];
      const [dragged] = reordered.splice(draggedIndex, 1);
      reordered.splice(dropIndex, 0, dragged);

      devLog(
        `[Mock Save] New order for '${shelf.id}':`,
        reordered.map(e => e.bookId)
      );
    },
    [filteredEntries, shelf.id]
  );

  const handleDragEnd = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('dragging');
    draggedItemIndex.current = null;
  }, []);

  /* ------------------------
     Render list
  ------------------------ */
  const renderBookList = useMemo(() => {
    const canAddBooks = Boolean(onAddBookRequest);
    const canRemoveBooks = Boolean(onDeleteRequest);

    if (layout === 'carousel') {
      return (
        <div className="flex overflow-x-auto pt-4 pb-2 px-1 scrollbar-hide">
          {canAddBooks && (
            <AddBookCard onClick={() => onAddBookRequest!(shelf.id)} />
          )}

          {effectiveIsLoading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="w-32 h-48 bg-slate-800 animate-pulse rounded-xl mr-4 flex-shrink-0"
              />
            ))}

          {!effectiveIsLoading && effectiveIsError && (
            <div className="py-4 px-2 text-xs text-amber-400">
              {lang === 'en'
                ? 'Shelf books are temporarily unavailable.'
                : 'كتب هذا الرف غير متاحة مؤقتًا.'}
            </div>
          )}

          {filteredEntries.map((entry, index) => (
            <div
              key={entry.bookId}
              draggable
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => handleBookClick(entry.bookId)}
              className="cursor-pointer"
            >
              <BookCard
                bookId={entry.bookId}
                book={entry.book as any}
                shelfId={entriesAreVirtual ? undefined : shelf.id}
                layout="list"
                progress={entry.progress}
              />
            </div>
          ))}

          {!effectiveIsLoading && filteredEntries.length === 0 && !canAddBooks && (
            <div className="py-4 px-2 text-xs italic text-slate-500">
              {lang === 'en'
                ? 'No books on this shelf.'
                : 'لا توجد كتب في هذا الرف.'}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-2 pt-4 pb-2 px-1">
        {canAddBooks && (
          <AddBookRow onClick={() => onAddBookRequest!(shelf.id)} />
        )}

        {effectiveIsLoading &&
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`row-skeleton-${i}`}
              className="h-24 w-full bg-slate-800 animate-pulse rounded-lg"
            />
          ))}

        {!effectiveIsLoading && effectiveIsError && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-xs text-amber-300">
            {lang === 'en'
              ? 'Shelf books are temporarily unavailable.'
              : 'كتب هذا الرف غير متاحة مؤقتًا.'}
          </div>
        )}

        {filteredEntries.map((entry, index) => (
          <div key={entry.bookId} className="flex items-center gap-2 group">
            <div
              draggable
              onDragStart={e => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={e => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              onClick={() => handleBookClick(entry.bookId)}
              className="cursor-pointer flex-grow"
            >
              <BookCard
                bookId={entry.bookId}
                book={entry.book as any}
                shelfId={entriesAreVirtual ? undefined : shelf.id}
                layout="row"
                progress={entry.progress}
              />
            </div>

            {canRemoveBooks && !entriesAreVirtual && (
              <Button
                variant="icon"
                onClick={e => handleRemoveBook(e, entry.bookId)}
                disabled={isRemoving}
                className="!text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <TrashIcon className="h-5 w-5" />
              </Button>
            )}
          </div>
        ))}
      </div>
    );
  }, [
    layout,
    filteredEntries,
    effectiveIsLoading,
    effectiveIsError,
    onAddBookRequest,
    onDeleteRequest,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    handleBookClick,
    handleRemoveBook,
    isRemoving,
    lang,
    shelf.id,
    entriesAreVirtual
  ]);

  return (
    <section id={id} className="w-full">
      <ShelfHeader
        shelf={shelf}
        bookCount={filteredEntries.length}
        coverUrl={shelf.userCoverUrl}
        isOpen={isOpen}
        onToggle={onToggle}
        isMenuOpen={isMenuOpen}
        onToggleMenu={onToggleMenu}
        onAddBookRequest={
          onAddBookRequest ? () => onAddBookRequest(shelf.id) : undefined
        }
        onEditRequest={onEditRequest ? () => onEditRequest(shelf) : undefined}
        onShareRequest={
          onShareRequest ? () => onShareRequest(shelf) : undefined
        }
        onDeleteRequest={
          onDeleteRequest ? () => onDeleteRequest(shelf) : undefined
        }
        onDuplicateRequest={onDuplicateRequest}
        onToggleLayout={onToggleLayout}
        isDeletable={isDeletable}
        isLoading={effectiveIsLoading}
        books={[]}
      />

      <div
        className={`grid transition-all duration-300 ${
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">{renderBookList}</div>
      </div>
    </section>
  );
};

/* Inject styles once */
if (
  typeof document !== 'undefined' &&
  !document.getElementById('shelf-carousel-style')
) {
  const style = document.createElement('style');
  style.id = 'shelf-carousel-style';
  style.innerHTML = `
    .scrollbar-hide::-webkit-scrollbar { display: none; }
    .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
    [draggable="true"] { cursor: grab; }
    [draggable="true"]:active { cursor: grabbing; }
    .dragging { opacity: 0.4; }
  `;
  document.head.appendChild(style);
}

export default ShelfCarousel;
