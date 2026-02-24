import React, { useMemo } from 'react';
import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import { useAuth } from '../lib/auth.tsx';
import { useToast } from '../store/toast.tsx';
import Button from '../components/ui/Button.tsx';
import BilingualText from '../components/ui/BilingualText.tsx';
import { ChevronLeftIcon } from '../components/icons/ChevronLeftIcon.tsx';
import { ShareIcon } from '../components/icons/ShareIcon.tsx';
import { PlusIcon } from '../components/icons/PlusIcon.tsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import { useShelfDetails } from '../lib/hooks/useShelfDetails.ts';
import { useShelfEntries } from '../lib/hooks/useUserShelves.ts';
import { useDuplicateShelf } from '../lib/hooks/useDuplicateShelf.ts';
import { useUserProfile } from '../lib/hooks/useUserProfile.ts';

const ShelfDetailsScreen: React.FC = () => {
  const { currentView, navigate, navigateToSocialAndHighlight } = useNavigation();
  const { lang } = useI18n();
  const { user } = useAuth();
  const { showToast } = useToast();

  const shelfId =
    currentView.type === 'immersive'
      ? currentView.params?.shelfId
      : undefined;

  const ownerId =
    currentView.type === 'immersive'
      ? currentView.params?.ownerId
      : undefined;

  const { data: shelf, isLoading: isLoadingShelf } = useShelfDetails(shelfId, ownerId);
  const { data: entries = [], isLoading: isLoadingEntries } = useShelfEntries(shelfId, ownerId, {
    resolveBooks: true,
    limit: 120,
  });
  const sourceOwnerId =
    (typeof shelf?.ownerId === 'string' && shelf.ownerId.trim().length > 0
      ? shelf.ownerId
      : ownerId) || undefined;
  const { data: creatorProfile } = useUserProfile(sourceOwnerId);
  const { mutate: duplicateShelf, isLoading: isDuplicating } = useDuplicateShelf();

  const visibilityBadge = useMemo(() => {
    const rawVisibility =
      shelf && typeof (shelf as { visibility?: unknown }).visibility === 'string'
        ? ((shelf as { visibility: string }).visibility || '').trim().toLowerCase()
        : '';
    if (!rawVisibility) return null;
    if (rawVisibility !== 'public' && rawVisibility !== 'unlisted' && rawVisibility !== 'private') {
      return null;
    }
    return rawVisibility;
  }, [shelf]);

  const orderedEntries = useMemo(() => {
    if (!entries || entries.length === 0) return [];

    const byBookId = new Map(entries.map((entry) => [entry.bookId, entry]));
    const orderedIds =
      shelf && Array.isArray((shelf as { orderedBookIds?: unknown }).orderedBookIds)
        ? ((shelf as { orderedBookIds: unknown[] }).orderedBookIds
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value.length > 0))
        : [];

    const ordered: typeof entries = [];
    const seen = new Set<string>();

    for (const id of orderedIds) {
      const entry = byBookId.get(id);
      if (!entry) continue;
      ordered.push(entry);
      seen.add(id);
    }

    const rest = entries
      .filter((entry) => !seen.has(entry.bookId))
      .sort((a, b) => {
        const aAddedAt = typeof a.addedAt === 'string' ? a.addedAt : '';
        const bAddedAt = typeof b.addedAt === 'string' ? b.addedAt : '';
        if (aAddedAt && bAddedAt) {
          return aAddedAt.localeCompare(bAddedAt);
        }
        return a.bookId.localeCompare(b.bookId);
      });

    return [...ordered, ...rest];
  }, [entries, shelf]);

  const handleBack = () => {
    const fromView = currentView.params?.from;
    const postId = currentView.params?.postId;

    if (fromView && fromView.type === 'tab' && fromView.id === 'social' && postId) {
      navigateToSocialAndHighlight(postId);
      return;
    }
    if (fromView) {
      navigate(fromView);
      return;
    }
    navigate({ type: 'tab', id: 'home' });
  };

  const handleBookClick = (bookId: string) => {
    navigate({
      type: 'immersive',
      id: 'bookDetails',
      params: { bookId, from: currentView },
    });
  };

  const handleDuplicate = () => {
    if (!shelf) return;
    const baseEn = (shelf.titleEn || shelf.titleAr || 'Shelf').trim();
    const baseAr = (shelf.titleAr || shelf.titleEn || 'Shelf').trim();
    duplicateShelf(
      {
        sourceShelf: shelf,
        newTitleEn: `${baseEn} (Copy)`,
        newTitleAr: `${baseAr} (Copy)`,
      },
      {
        onSuccess: () => {
          showToast(lang === 'en' ? 'Added to your shelves.' : 'تمت الإضافة إلى رفوفك.');
          navigate({ type: 'tab', id: 'read' });
        },
        onError: (error: any) => {
          const message =
            typeof error?.message === 'string' && error.message.trim().length > 0
              ? error.message
              : lang === 'en'
                ? 'Unable to duplicate this shelf.'
                : 'تعذر تكرار هذا الرف.';
          showToast(message);
        },
      }
    );
  };

  const handleShare = async () => {
    if (!shelfId) return;
    const shareUrl = `${window.location.origin}/shelf/${encodeURIComponent(shelfId)}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: lang === 'en' ? shelf?.titleEn || 'Shelf' : shelf?.titleAr || shelf?.titleEn || 'رف',
          url: shareUrl,
        });
        return;
      } catch {
        // Continue to clipboard fallback.
      }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast(lang === 'en' ? 'Link copied.' : 'تم نسخ الرابط.');
    } catch {
      showToast(lang === 'en' ? 'Unable to copy link.' : 'تعذر نسخ الرابط.');
    }
  };

  const isLoading = isLoadingShelf || isLoadingEntries;
  const creatorName =
    creatorProfile?.name ||
    (sourceOwnerId === user?.uid
      ? lang === 'en'
        ? 'You'
        : 'أنت'
      : lang === 'en'
        ? 'Unknown creator'
        : 'منشئ غير معروف');
  const creatorAvatar =
    creatorProfile?.avatarUrl ||
    `https://api.dicebear.com/8.x/lorelei/svg?seed=${sourceOwnerId || 'shelf'}`;

  return (
    <div className="h-screen w-full flex flex-col bg-slate-900 text-white">
      <header className="sticky top-0 z-20 bg-slate-900/90 backdrop-blur border-b border-white/10">
        <div className="container mx-auto px-4 h-16 flex items-center gap-2">
          <Button variant="ghost" onClick={handleBack} aria-label={lang === 'en' ? 'Back' : 'رجوع'}>
            <ChevronLeftIcon className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <BilingualText role="H1" className="!text-base truncate">
              {lang === 'en' ? shelf?.titleEn || 'Shelf' : shelf?.titleAr || shelf?.titleEn || 'رف'}
            </BilingualText>
          </div>
        </div>
      </header>

      <main className="flex-grow overflow-y-auto">
        <div className="container mx-auto px-4 py-5 space-y-5">
          {isLoading && (
            <div className="py-10 flex justify-center">
              <LoadingSpinner />
            </div>
          )}

          {!isLoading && !shelf && (
            <BilingualText className="text-center text-white/70 py-12">
              {lang === 'en' ? 'Shelf not found.' : 'الرف غير موجود.'}
            </BilingualText>
          )}

          {!isLoading && shelf && (
            <>
              <section className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <BilingualText role="H1" className="!text-2xl truncate">
                      {lang === 'en' ? shelf.titleEn : shelf.titleAr || shelf.titleEn}
                    </BilingualText>
                    <div className="mt-2 flex items-center gap-2 min-w-0">
                      <img src={creatorAvatar} alt={creatorName} className="h-7 w-7 rounded-full object-cover" />
                      <BilingualText className="text-sm text-white/80 truncate">{creatorName}</BilingualText>
                      {visibilityBadge && (
                        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border border-white/15 text-white/60">
                          {visibilityBadge}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-white/60">
                  {lang === 'en' ? 'Books' : 'الكتب'}: {orderedEntries.length}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={handleDuplicate}
                    disabled={isDuplicating}
                    className="!h-9 !px-4"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    {lang === 'en' ? 'Add to My Shelves' : 'أضف إلى رفوفي'}
                  </Button>
                  <Button variant="ghost" onClick={handleShare} className="!h-9 !px-4 border border-white/10">
                    <ShareIcon className="h-4 w-4 mr-2" />
                    {lang === 'en' ? 'Share' : 'مشاركة'}
                  </Button>
                </div>
              </section>

              <section className="space-y-2">
                {orderedEntries.length === 0 ? (
                  <BilingualText className="text-center text-white/70 py-12">
                    {lang === 'en' ? 'This shelf is empty.' : 'هذا الرف فارغ.'}
                  </BilingualText>
                ) : (
                  orderedEntries.map((entry, index) => {
                    const book = entry.book;
                    const title =
                      (lang === 'en'
                        ? book?.titleEn
                        : (book?.titleAr || book?.titleEn)) ||
                      (typeof (entry as any)?.snapshot?.titleEn === 'string'
                        ? (entry as any).snapshot.titleEn
                        : (lang === 'en' ? `Book ${index + 1}` : `كتاب ${index + 1}`));
                    const author =
                      (lang === 'en'
                        ? book?.authorEn
                        : (book?.authorAr || book?.authorEn)) || '';
                    const coverUrl =
                      book?.coverUrl ||
                      (typeof (entry as any)?.snapshot?.coverUrl === 'string'
                        ? (entry as any).snapshot.coverUrl
                        : '');

                    return (
                      <button
                        type="button"
                        key={entry.bookId}
                        onClick={() => handleBookClick(entry.bookId)}
                        className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors p-3 flex items-center gap-3"
                      >
                        {coverUrl ? (
                          <img src={coverUrl} alt={title} className="h-14 w-10 rounded object-cover bg-white/10" />
                        ) : (
                          <div className="h-14 w-10 rounded bg-white/10" />
                        )}
                        <div className="min-w-0">
                          <BilingualText className="font-semibold truncate">{title}</BilingualText>
                          <BilingualText role="Caption" className="!text-[11px] text-white/60 truncate">
                            {author}
                          </BilingualText>
                        </div>
                      </button>
                    );
                  })
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ShelfDetailsScreen;
