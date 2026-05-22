// components/modals/MoveBookModal.tsx

import React from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';

import { useI18n } from '../../store/i18n.tsx';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import { useMoveBookBetweenShelves } from '../../lib/hooks/useMoveBookBetweenShelves.ts';
import { useToast } from '../../store/toast.tsx';
import { useQueryClient } from '../../lib/react-query.ts';
import { useAuth } from '../../lib/auth.tsx';
import { queryKeys } from '../../lib/queryKeys.ts';

import { BookIcon } from '../icons/BookIcon.tsx';
import { ChevronRightIcon as ArrowRightIcon } from '../icons/ChevronRightIcon.tsx';
import { Book } from '../../types/entities.ts';
import {
  getSelectableOrganizationalShelves,
  isCurrentlyReadingShelf,
} from '../../lib/shelves/systemShelves.ts';
import { enterReadingState } from '../../lib/actions/enterReadingState.ts';
import { removeBookFromShelf } from '../../lib/actions/shelfActions.ts';

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
  const queryClient = useQueryClient();
  const { effectiveUid } = useAuth();
  const [isInitializingContinuity, setIsInitializingContinuity] = React.useState(false);

  const { data: shelves, isLoading } = useUserShelves();
  const { mutate: moveBook, isPending: isMoving } =
    useMoveBookBetweenShelves();
  const legalDestinationShelves = React.useMemo(
    () => {
      const currentlyReadingDestination = {
        id: 'currently-reading',
        titleEn: 'Currently Reading',
        titleAr: 'تقرأ الآن',
        isSystem: true,
      };

      return [
        currentlyReadingDestination,
        ...getSelectableOrganizationalShelves(shelves).filter(
          shelf => shelf.id !== fromShelfId
        ),
      ];
    },
    [fromShelfId, shelves]
  );

  const handleMove = async (e: React.MouseEvent, toShelfId: string) => {
    // 🔒 Stop propagation to prevent triggering parent onClick (Book Details navigation)
    e.stopPropagation();
    
    if (
      !bookId ||
      toShelfId === fromShelfId ||
      isMoving ||
      isInitializingContinuity
    ) return;

    const targetShelf = legalDestinationShelves.find(s => s.id === toShelfId);
    const isMovingToCurrentlyReading =
      toShelfId === 'currently-reading' || isCurrentlyReadingShelf(targetShelf);
    const shelfTitle = targetShelf
      ? (lang === 'en' ? targetShelf.titleEn : targetShelf.titleAr)
      : '';

    if (isMovingToCurrentlyReading) {
      if (!effectiveUid) {
        showToast(
          lang === 'en'
            ? 'Sign in to update Currently Reading.'
            : 'سجّل الدخول لتحديث تقرأ الآن.'
        );
        return;
      }

      try {
        setIsInitializingContinuity(true);
        await enterReadingState({
          bookId,
          progress: 0,
          targetState: 'reading',
        });
        await removeBookFromShelf({
          uid: effectiveUid,
          shelfId: fromShelfId,
          bookId,
        });
        await queryClient.invalidateQueries({ queryKey: ['currentlyReading'] });
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.user.shelves(effectiveUid) as unknown as any[],
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.user.shelfEntries(effectiveUid, fromShelfId) as unknown as any[],
          }),
        ]);
        onClose();
        showToast(
          lang === 'en'
            ? 'Moved to "Currently Reading"'
            : 'تم النقل إلى "تقرأ الآن"'
        );
      } catch (error) {
        console.error('[MOVE_BOOK][CURRENTLY_READING_FAILED]', error);
        showToast(
          lang === 'en'
            ? 'Unable to move this book to Currently Reading.'
            : 'تعذر نقل هذا الكتاب إلى تقرأ الآن.'
        );
      } finally {
        setIsInitializingContinuity(false);
      }
      return;
    }

    if (!book) {
      showToast(
        lang === 'en'
          ? 'Book details are unavailable. Please refresh and try again.'
          : 'تفاصيل الكتاب غير متاحة. يرجى التحديث والمحاولة مرة أخرى.'
      );
      return;
    }

    // Find target shelf for toast message
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
                  disabled={isMoving || isInitializingContinuity}
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
