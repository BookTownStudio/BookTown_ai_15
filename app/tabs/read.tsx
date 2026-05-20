import { devLog } from '../../lib/logging/devLog';
import React, {
  useRef,
  useEffect,
  useState,
  useMemo,
  useCallback
} from 'react';
import AppNav from '../../components/navigation/AppNav.tsx';
import ShelfCarousel from '../../components/content/ShelfCarousel.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useContinueReading } from '../../lib/hooks/useContinueReading.ts';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import { useAuth } from '../../lib/auth.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import ErrorState from '../../components/ui/ErrorState.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { PlusIcon } from '../../components/icons/PlusIcon.tsx';
import AddBookModal from '../../components/modals/AddBookModal.tsx';
import CreateShelfModal from '../../components/modals/CreateShelfModal.tsx';
import EditShelfModal from '../../components/modals/EditShelfModal.tsx';
import { Shelf } from '../../types/entities.ts';
import ConfirmDeleteModal from '../../components/modals/ConfirmDeleteModal.tsx';
import { useDeleteShelf } from '../../lib/hooks/useDeleteShelf.ts';
import Button from '../../components/ui/Button.tsx';
import { useRecommendedShelves } from '../../lib/hooks/useRecommendedShelves.ts';
import PageShell from '../../components/layout/PageShell.tsx';
import LiteraryShell from '../../components/layout/LiteraryShell.tsx';
import { useUserStats } from '../../lib/hooks/useUserStats.ts';
import {
  getSystemShelfSortRank,
  isCurrentlyReadingShelf,
  isSystemShelf,
} from '../../lib/shelves/systemShelves.ts';

const VIRTUAL_CURRENTLY_READING_SHELF_ID = 'currently-reading';

const ReadScreen: React.FC = () => {
  const { lang } = useI18n();
  const { effectiveUid } = useAuth();
  const { data: shelves, isLoading, isError } = useUserShelves();
  const { data: userStats } = useUserStats();
  const { resetTokens } = useNavigation();
  const {
    items: continueReadingItems,
    isLoading: isContinueReadingLoading,
  } = useContinueReading(8);

  useRecommendedShelves();

  const mainContentRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isCreateShelfModalOpen, setCreateShelfModalOpen] = useState(false);
  const [targetShelfId, setTargetShelfId] = useState<string | null>(null);
  const [openShelves, setOpenShelves] = useState<Record<string, boolean>>({});
  const [shelfToEdit, setShelfToEdit] = useState<Shelf | null>(null);
  const [shelfToDelete, setShelfToDelete] = useState<Shelf | null>(null);
  const [shelfToDuplicate, setShelfToDuplicate] = useState<Shelf | null>(null);
  const [activeMenuShelfId, setActiveMenuShelfId] = useState<string | null>(null);

  const { mutate: deleteShelf, isPending: isDeleting } = useDeleteShelf();

  const [shelfLayouts, setShelfLayouts] = useState<
    Record<string, 'carousel' | 'list'>
  >(() => {
    try {
      return JSON.parse(
        localStorage.getItem('booktown-shelf-layouts') || '{}'
      );
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(
      'booktown-shelf-layouts',
      JSON.stringify(shelfLayouts)
    );
  }, [shelfLayouts]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (resetTokens.read > 0) {
      mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      setActiveMenuShelfId(null);
    }
  }, [resetTokens.read]);

  useEffect(() => {
    if (!shelves) return;
    setOpenShelves(prev => {
      const next: Record<string, boolean> = { ...prev };
      if (next[VIRTUAL_CURRENTLY_READING_SHELF_ID] === undefined) {
        next[VIRTUAL_CURRENTLY_READING_SHELF_ID] = true;
      }
      shelves.forEach(s => {
        if (next[s.id] === undefined) {
          next[s.id] = false;
        }
      });
      return next;
    });
  }, [shelves]);

  const handleToggleMenu = useCallback((shelfId: string) => {
    setActiveMenuShelfId(id => (id === shelfId ? null : shelfId));
  }, []);

  const handleOpenAddBookModal = useCallback((shelfId: string) => {
    setActiveMenuShelfId(null);
    setTargetShelfId(shelfId);
    setAddModalOpen(true);
  }, []);

  /**
   * 🔒 Canonical Duplicate Orchestration
   * Accepts Shelf OR shelfId defensively
   */
  const handleOpenDuplicateModal = useCallback(
    (input: Shelf | string) => {
      setActiveMenuShelfId(null);

      const shelf =
        typeof input === 'string'
          ? shelves?.find(s => s.id === input)
          : input;

      if (!shelf) {
        console.error('[DUPLICATE][ERROR] Shelf not resolved:', input);
        return;
      }

      devLog('[DUPLICATE][OPEN_MODAL]', shelf.id);

      setShelfToDuplicate(shelf);
      setCreateShelfModalOpen(true);
    },
    [shelves]
  );

  const handleConfirmDelete = useCallback(() => {
    if (!shelfToDelete) return;
    deleteShelf(shelfToDelete.id, {
      onSuccess: () => setShelfToDelete(null)
    });
  }, [shelfToDelete, deleteShelf]);

  /**
   * 🔒 Authoritative Shelf Sorting
   */
  const sortedShelves = useMemo(() => {
    if (!shelves) return [];
    return shelves
      .filter((shelf) => !isCurrentlyReadingShelf(shelf))
      .sort((a, b) => {
      const ai = getSystemShelfSortRank(a);
      const bi = getSystemShelfSortRank(b);

      if (ai !== bi) return ai - bi;
      if (isSystemShelf(a) && isSystemShelf(b)) {
        return a.titleEn.localeCompare(b.titleEn);
      }

      return a.titleEn.localeCompare(b.titleEn);
    });
  }, [shelves]);

  const virtualCurrentlyReadingShelf = useMemo<Shelf>(() => ({
    id: VIRTUAL_CURRENTLY_READING_SHELF_ID,
    ownerId: effectiveUid || '',
    titleEn: 'Currently Reading',
    titleAr: 'تقرأ الآن',
    bookIds: continueReadingItems.map(item => item.bookId),
    bookCount: continueReadingItems.length,
    isSystem: true,
    isVirtual: true,
    isDeletable: false,
    isEditable: false,
  }), [continueReadingItems, effectiveUid]);

  const virtualCurrentlyReadingEntries = useMemo(
    () =>
      continueReadingItems.map(item => ({
        bookId: item.bookId,
        addedAt: item.updatedAt
          ? item.updatedAt.toDate().toISOString()
          : new Date(0).toISOString(),
        progress: Math.round(item.progress * 100),
      })),
    [continueReadingItems]
  );

  const bookCount = userStats?.booksRead ?? 0;
  const shelfCount = userStats?.shelvesCreated ?? sortedShelves.length;

  return (
    <PageShell scrollable={false}>
      {activeMenuShelfId && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => setActiveMenuShelfId(null)}
        />
      )}

      <AppNav titleEn="BookTown" titleAr="بوكتاون" />

      <main
        ref={mainContentRef}
        className="flex-grow overflow-y-auto overflow-x-hidden overscroll-y-contain pt-20 pb-[calc(var(--bottom-nav-height,66px)+3rem)]"
      >
        <LiteraryShell>
          <header className="mb-5 flex items-center justify-between">
            <div>
              <BilingualText role="H1" className="!text-2xl md:!text-3xl font-bold">
                {lang === 'en' ? 'Your Library' : 'مكتبتك'}
              </BilingualText>
              <BilingualText role="Caption" className="mt-0.5">
                {lang === 'en'
                  ? `${bookCount} books on ${shelfCount} shelves`
                  : `${bookCount} كتابًا على ${shelfCount} رفوف`}
              </BilingualText>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCreateShelfModalOpen(true)}
              className="rounded-full !px-4"
            >
              <PlusIcon className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">
                {lang === 'en' ? 'New Shelf' : 'رف جديد'}
              </span>
            </Button>
          </header>

          <div className="space-y-6">
            <ShelfCarousel
              key={VIRTUAL_CURRENTLY_READING_SHELF_ID}
              shelf={virtualCurrentlyReadingShelf}
              entriesOverride={virtualCurrentlyReadingEntries}
              isLoadingOverride={isContinueReadingLoading}
              entriesAreVirtual
              isMenuOpen={
                activeMenuShelfId === VIRTUAL_CURRENTLY_READING_SHELF_ID
              }
              onToggleMenu={() =>
                handleToggleMenu(VIRTUAL_CURRENTLY_READING_SHELF_ID)
              }
              onAddBookRequest={handleOpenAddBookModal}
              onToggle={() =>
                setOpenShelves(prev => ({
                  ...prev,
                  [VIRTUAL_CURRENTLY_READING_SHELF_ID]:
                    !(prev[VIRTUAL_CURRENTLY_READING_SHELF_ID] ?? true)
                }))
              }
              onToggleLayout={() =>
                setShelfLayouts(prev => ({
                  ...prev,
                  [VIRTUAL_CURRENTLY_READING_SHELF_ID]:
                    prev[VIRTUAL_CURRENTLY_READING_SHELF_ID] === 'list'
                      ? 'carousel'
                      : 'list'
                }))
              }
              isOpen={openShelves[VIRTUAL_CURRENTLY_READING_SHELF_ID] ?? true}
              layout={
                shelfLayouts[VIRTUAL_CURRENTLY_READING_SHELF_ID] || 'carousel'
              }
              isDeletable={false}
            />

            {isLoading ? (
              <div className="flex justify-center py-20">
                <LoadingSpinner />
              </div>
            ) : isError ? (
              <ErrorState
                title={lang === 'en' ? 'Shelves unavailable' : 'الرفوف غير متاحة'}
                message={
                  lang === 'en'
                    ? 'Error loading shelves.'
                    : 'خطأ في تحميل الرفوف.'
                }
                className="my-12"
              />
            ) : (
              <>
              {sortedShelves.map(shelf => (
                <ShelfCarousel
                  key={shelf.id}
                  shelf={shelf}
                  isMenuOpen={activeMenuShelfId === shelf.id}
                  onToggleMenu={() => handleToggleMenu(shelf.id)}
                  onAddBookRequest={handleOpenAddBookModal}
                  onEditRequest={setShelfToEdit}
                  onShareRequest={() => {}}
                  onDeleteRequest={setShelfToDelete}
                  onDuplicateRequest={handleOpenDuplicateModal}
                  isOpen={openShelves[shelf.id] ?? false}
                  onToggle={() =>
                    setOpenShelves(prev => ({
                      ...prev,
                      [shelf.id]: !prev[shelf.id]
                    }))
                  }
                  onToggleLayout={() =>
                    setShelfLayouts(prev => ({
                      ...prev,
                      [shelf.id]:
                        prev[shelf.id] === 'list'
                          ? 'carousel'
                          : 'list'
                    }))
                  }
                  layout={shelfLayouts[shelf.id] || 'carousel'}
                  isDeletable={!isSystemShelf(shelf)}
                />
              ))}
              </>
            )}
          </div>
        </LiteraryShell>
      </main>

      <AddBookModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        targetShelfId={targetShelfId}
      />

      <CreateShelfModal
        isOpen={isCreateShelfModalOpen}
        duplicationSourceShelf={shelfToDuplicate}
        onClose={() => {
          setCreateShelfModalOpen(false);
          setShelfToDuplicate(null);
        }}
      />

      <EditShelfModal
        isOpen={!!shelfToEdit}
        onClose={() => setShelfToEdit(null)}
        shelf={shelfToEdit}
      />

      <ConfirmDeleteModal
        isOpen={!!shelfToDelete}
        onClose={() => setShelfToDelete(null)}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
        itemName={shelfToDelete?.titleEn || ''}
        itemType="shelf"
      />
    </PageShell>
  );
};

export default ReadScreen;
