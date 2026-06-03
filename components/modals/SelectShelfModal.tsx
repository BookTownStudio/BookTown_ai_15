import React from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import { useToggleBookOnShelf } from '../../lib/hooks/useToggleBookOnShelf.ts';
import { useBookShelfStatus } from '../../lib/hooks/useBookShelfStatus.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { BookIcon } from '../icons/BookIcon.tsx';
import { CheckIcon } from '../icons/CheckIcon.tsx';
import EmptyState from '../ui/EmptyState.tsx';
import Button from '../ui/Button.tsx';
import { Book } from '../../types/entities.ts';
import type { LibrarianRecommendationContext } from '../../types/librarian.ts';
import { getSelectableOrganizationalShelves } from '../../lib/shelves/systemShelves.ts';

interface SelectShelfModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookId: string;
  book?: Book;
  recommendationContext?: LibrarianRecommendationContext;
}

/**
 * SelectShelfModal
 * ------------------------------------------------
 * Canonical shelf-selection UI.
 *
 * 🔒 DECISION (LOCKED):
 * - Shelves are organizational only
 * - No reading state is implied or initiated here
 * - UI emits intent; domain decides side effects
 */
const SelectShelfModal: React.FC<SelectShelfModalProps> = ({
  isOpen,
  onClose,
  bookId,
  book,
  recommendationContext,
}) => {
  const { lang } = useI18n();
  const {
    data: shelves,
    isLoading,
    isError,
    error,
    refetch,
  } = useUserShelves();
  const { mutate: toggleBook, isPending: isToggling } =
    useToggleBookOnShelf();

  // Canonical membership state
  const { isOnShelf } = useBookShelfStatus(bookId);
  const selectableShelves = getSelectableOrganizationalShelves(shelves);
  const shelfLoadError =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : '';

  /**
   * Emit shelf intent only.
   * No special-casing for system shelves.
   */
  const handleSelectShelf = (shelfId: string) => {
    if (!bookId || isToggling) return;

    toggleBook(
      { shelfId, bookId, book, recommendationContext },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <BilingualText role="H1" className="!text-xl text-center mb-4">
        {lang === 'en' ? 'Add to a Shelf' : 'إضافة إلى رف'}
      </BilingualText>

      {isLoading ? (
        <div className="flex justify-center">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <EmptyState
          icon={BookIcon}
          titleEn="Shelves unavailable"
          titleAr="الرفوف غير متاحة"
          messageEn={
            shelfLoadError
              ? 'Your shelves could not be loaded. Try again.'
              : 'Your shelves could not be loaded right now.'
          }
          messageAr="تعذر تحميل رفوفك الآن. حاول مرة أخرى."
          action={
            <Button
              type="button"
              size="sm"
              onClick={() => void refetch()}
            >
              {lang === 'en' ? 'Retry' : 'إعادة المحاولة'}
            </Button>
          }
        />
      ) : selectableShelves.length === 0 ? (
        <EmptyState
          icon={BookIcon}
          titleEn="No selectable shelves"
          titleAr="لا توجد رفوف متاحة"
          messageEn="Create or repair your shelves from the Read tab, then try again."
          messageAr="أنشئ رفاً من تبويب القراءة، ثم حاول مرة أخرى."
        />
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {selectableShelves.map(shelf => {
            const isBookOnShelf = isOnShelf(shelf.id);

            return (
              <button
                key={shelf.id}
                onClick={() => handleSelectShelf(shelf.id)}
                disabled={isToggling}
                className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                <BookIcon className="h-5 w-5 text-slate-500" />

                <span className="flex-grow">
                  {lang === 'en' ? shelf.titleEn : shelf.titleAr}
                </span>

                {isBookOnShelf && (
                  <CheckIcon className="h-5 w-5 text-accent" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
};

export default SelectShelfModal;
