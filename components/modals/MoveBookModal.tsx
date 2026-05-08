// components/modals/MoveBookModal.tsx

import React from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';

import { useI18n } from '../../store/i18n.tsx';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import { useMoveBookBetweenShelves } from '../../lib/hooks/useMoveBookBetweenShelves.ts';
import { useToast } from '../../store/toast.tsx';

import { BookIcon } from '../icons/BookIcon.tsx';
import { ChevronRightIcon as ArrowRightIcon } from '../icons/ChevronRightIcon.tsx';
import { Book } from '../../types/entities.ts';
import { isCurrentlyReadingShelf } from '../../lib/shelves/systemShelves.ts';

interface MoveBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookId: string;
  book?: Book;
  fromShelfId: string;
}

const MoveBookModal: React.FC<MoveBookModalProps> = ({
  isOpen,
  onClose,
  bookId,
  book,
  fromShelfId
}) => {
  const { lang } = useI18n();
  const { showToast } = useToast();

  const { data: shelves, isLoading } = useUserShelves();
  const { mutate: moveBook, isPending: isMoving } =
    useMoveBookBetweenShelves();
  const legalDestinationShelves = React.useMemo(
    () =>
      (shelves || []).filter(
        shelf => shelf.id !== fromShelfId && !isCurrentlyReadingShelf(shelf)
      ),
    [fromShelfId, shelves]
  );

  const handleMove = (e: React.MouseEvent, toShelfId: string) => {
    // 🔒 Stop propagation to prevent triggering parent onClick (Book Details navigation)
    e.stopPropagation();
    
    if (!bookId || toShelfId === fromShelfId || isMoving) return;
    if (!book) {
      showToast(
        lang === 'en'
          ? 'Book details are unavailable. Please refresh and try again.'
          : 'تفاصيل الكتاب غير متاحة. يرجى التحديث والمحاولة مرة أخرى.'
      );
      return;
    }

    // Find target shelf for toast message
    const targetShelf = shelves?.find(s => s.id === toShelfId);
    const shelfTitle = targetShelf 
      ? (lang === 'en' ? targetShelf.titleEn : targetShelf.titleAr) 
      : '';

    moveBook(
      {
        fromShelfId,
        toShelfId,
        book
      },
      {
        onSuccess: () => {
          // 1️⃣ Close modal immediately
          onClose();

          // 2️⃣ Provide user feedback
          if (shelfTitle) {
            showToast(
              lang === 'en' 
                ? `Moved to "${shelfTitle}"` 
                : `تم النقل إلى "${shelfTitle}"`
            );
          }
          
          // 3️⃣ Scroll preservation:
          // We stay in the current context. React Query's optimistic updates 
          // handle the UI transition without a full navigation reset.
        }
      }
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="w-full max-w-md">
        <BilingualText role="H1" className="!text-xl text-center mb-4">
          {lang === 'en' ? 'Move to another shelf' : 'نقل إلى رف آخر'}
        </BilingualText>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {legalDestinationShelves.length === 0 && (
              <BilingualText role="Caption" className="text-center py-6 text-slate-500">
                {lang === 'en'
                  ? 'No eligible shelves available.'
                  : 'لا توجد رفوف صالحة للنقل.'}
              </BilingualText>
            )}

            {legalDestinationShelves.map(shelf => (
                <button
                  key={shelf.id}
                  onClick={(e) => handleMove(e, shelf.id)}
                  disabled={isMoving}
                  className="w-full flex items-center gap-3 p-3 rounded-lg text-left
                             hover:bg-black/5 dark:hover:bg-white/5
                             transition-colors disabled:opacity-50"
                >
                  <BookIcon className="h-5 w-5 text-slate-500" />

                  <span className="flex-grow">
                    {lang === 'en'
                      ? shelf.titleEn
                      : shelf.titleAr}
                  </span>

                  <ArrowRightIcon className="h-4 w-4 text-accent" />
                </button>
              ))}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default MoveBookModal;
