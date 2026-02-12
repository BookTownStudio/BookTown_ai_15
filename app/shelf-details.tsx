// app/shelf-details.tsx

import React from 'react';
import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import Button from '../components/ui/Button.tsx';
import BilingualText from '../components/ui/BilingualText.tsx';
import { ChevronLeftIcon } from '../components/icons/ChevronLeftIcon.tsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import { useShelfDetails } from '../lib/hooks/useShelfDetails.ts';
import { useShelfEntries } from '../lib/hooks/useUserShelves.ts';
import BookCard from '../components/content/BookCard.tsx';

const ShelfDetailsScreen: React.FC = () => {
  const { currentView, navigate, navigateToSocialAndHighlight } = useNavigation();
  const { lang } = useI18n();

  const shelfId =
    currentView.type === 'immersive'
      ? currentView.params?.shelfId
      : undefined;

  const ownerId =
    currentView.type === 'immersive'
      ? currentView.params?.ownerId
      : undefined;

  const { data: shelf, isLoading: isLoadingShelf } =
    useShelfDetails(shelfId, ownerId);

  const { data: entries, isLoading: isLoadingEntries } =
    useShelfEntries(shelfId, ownerId);

  const handleBack = () => {
    const fromView = currentView.params?.from;
    const postId = currentView.params?.postId;

    if (fromView && fromView.type === 'tab' && fromView.id === 'social' && postId) {
      navigateToSocialAndHighlight(postId);
    } else if (fromView) {
      navigate(fromView);
    } else {
      navigate({ type: 'tab', id: 'home' });
    }
  };

  const handleBookClick = (bookId: string) => {
    navigate({
      type: 'immersive',
      id: 'bookDetails',
      params: { bookId, from: currentView }
    });
  };

  const isLoading = isLoadingShelf || isLoadingEntries;

  return (
    <div className="h-screen w-full flex flex-col bg-slate-900">
      <header className="fixed top-0 left-0 right-0 z-20 bg-slate-900/50 backdrop-blur-lg border-b border-white/10">
        <div className="container mx-auto flex h-20 items-center">
          <Button
            variant="ghost"
            onClick={handleBack}
            aria-label={lang === 'en' ? 'Back' : 'رجوع'}
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </Button>

          <div className="text-center flex-grow">
            {shelf && (
              <BilingualText role="H1" className="!text-xl truncate">
                {lang === 'en' ? shelf.titleEn : shelf.titleAr}
              </BilingualText>
            )}
          </div>

          <div className="w-10" />
        </div>
      </header>

      <main className="flex-grow pt-20 pb-8 overflow-y-auto">
        <div className="container mx-auto p-4 md:p-8">
          {isLoading && (
            <div className="flex justify-center">
              <LoadingSpinner />
            </div>
          )}

          {!isLoading && !shelf && (
            <BilingualText className="text-center text-white/70">
              {lang === 'en' ? 'Shelf not found.' : 'الرف غير موجود.'}
            </BilingualText>
          )}

          {!isLoading && shelf && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {entries?.map(entry => (
                  <div
                    key={entry.bookId}
                    onClick={() => handleBookClick(entry.bookId)}
                    className="cursor-pointer"
                  >
                    <BookCard
                      bookId={entry.bookId}
                      book={entry.book}
                      shelfId={shelfId}   // 🔒 Tier-1: explicit ownership context
                      layout="grid"
                    />
                  </div>
                ))}
              </div>

              {(!entries || entries.length === 0) && (
                <BilingualText className="text-center text-white/70 py-16">
                  {lang === 'en'
                    ? 'This shelf is empty.'
                    : 'هذا الرف فارغ.'}
                </BilingualText>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ShelfDetailsScreen;