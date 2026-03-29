import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../../store/i18n.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useUserProfile } from '../../lib/hooks/useUserProfile.ts';
import { useUserStats } from '../../lib/hooks/useUserStats.ts';
import { useUserFollowList } from '../../lib/hooks/useUserFollowList.ts';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import { useUserProfilePosts } from '../../lib/hooks/useUserProfilePosts.ts';
import { useUserProfileReviews } from '../../lib/hooks/useUserProfileReviews.ts';
import { useUserProfilePublications } from '../../lib/hooks/useUserProfilePublications.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import { EditIcon } from '../../components/icons/EditIcon.tsx';
import { CalendarIcon } from '../../components/icons/CalendarIcon.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { VerticalEllipsisIcon } from '../../components/icons/VerticalEllipsisIcon.tsx';
import { useUpdateProfile } from '../../lib/hooks/useUpdateProfile.ts';
import { useStartConversation } from '../../lib/hooks/useMessenger.ts';
import { useFollowStatus, useFollowUser, useUnfollowUser } from '../../lib/hooks/useFollowUser.ts';
import {
  useUpdateLongformPublicationVisibility,
  useUpdatePublishedBookVisibility,
} from '../../lib/hooks/useProjectMutations.ts';
import EditProfileModal, {
  ProfileEditData,
} from '../../components/modals/EditProfileModal.tsx';
import ConfirmDeleteModal from '../../components/modals/ConfirmDeleteModal.tsx';
import ProfileConnectionsModal from '../../components/modals/ProfileConnectionsModal.tsx';
import PageShell from '../../components/layout/PageShell.tsx';
import ProfileStrengthBar from '../../components/ui/ProfileStrengthBar.tsx';
import ShelfCarousel from '../../components/content/ShelfCarousel.tsx';
import PostCard from '../../components/content/PostCard.tsx';
import ReviewCard from '../../components/content/ReviewCard.tsx';
import CanonicalCoverArtwork from '../../components/content/CanonicalCoverArtwork.tsx';
import type { ProfilePublicationRecord } from '../../services/db.types.ts';

type ProfileTab = 'posts' | 'reviews' | 'shelves' | 'publications';

const TABS: ProfileTab[] = ['posts', 'reviews', 'shelves', 'publications'];
const PROFILE_TAB_STORAGE_PREFIX = 'booktown_profile_tab_v1';

const isProfileTab = (value: unknown): value is ProfileTab =>
  typeof value === 'string' && TABS.includes(value as ProfileTab);

const readPersistedProfileTab = (uid?: string): ProfileTab | null => {
  if (!uid || typeof window === 'undefined') return null;
  try {
    const key = `${PROFILE_TAB_STORAGE_PREFIX}:${uid}`;
    const stored = localStorage.getItem(key);
    return isProfileTab(stored) ? stored : null;
  } catch {
    return null;
  }
};

const persistProfileTab = (uid: string | undefined, tab: ProfileTab): void => {
  if (!uid || typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${PROFILE_TAB_STORAGE_PREFIX}:${uid}`, tab);
  } catch {
    // Ignore storage write failures; tab state remains in-memory.
  }
};

const formatPublicationTypeLabel = (
  value: string,
  lang: 'en' | 'ar'
): string => {
  if (value === 'blog' || value === 'blog_longform') {
    return lang === 'en' ? 'Blog' : 'مدونة';
  }
  if (value === 'ebook') {
    return lang === 'en' ? 'Ebook' : 'كتاب إلكتروني';
  }
  return lang === 'en' ? 'Publication' : 'منشور';
};

const formatProfileTabLabel = (
  tab: ProfileTab,
  lang: 'en' | 'ar'
): string => {
  if (lang === 'ar') {
    if (tab === 'posts') return 'المنشورات';
    if (tab === 'reviews') return 'المراجعات';
    if (tab === 'shelves') return 'الرفوف';
    return 'الإصدارات';
  }

  if (tab === 'publications') {
    return 'Publications';
  }

  return tab.charAt(0).toUpperCase() + tab.slice(1);
};

/* -----------------------------------------------------
   Mock Guest Data
----------------------------------------------------- */

const MOCK_GUEST_PROFILE = {
  uid: 'guest',
  name: 'Guest User',
  handle: '@guest_explorer',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  bannerUrl:
    'https://images.unsplash.com/photo-1507842217153-e52879d2b466?q=80&w=1200&auto=format&fit=crop',
  joinDate: new Date().toISOString(),
  bioEn: 'Exploring the shelves of BookTown.',
  bioAr: 'أستكشف رفوف بوكتاون.',
  followers: 42,
  following: 15,
  booksRead: 12,
  wordsWritten: 0,
};

/* -----------------------------------------------------
   Screen Header (LOCKED)
----------------------------------------------------- */

const ScreenHeader: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { lang, isRTL } = useI18n();

  return (
    <header className="fixed top-0 left-0 right-0 z-30 pointer-events-none">
      <div
        className={`app-rail app-rail--default flex h-20 items-center px-0 ${
          isRTL ? 'flex-row-reverse' : ''
        }`}
      >
        <Button
          variant="icon"
          onClick={onBack}
          className="pointer-events-auto bg-black/30 backdrop-blur-sm !text-white"
          aria-label={lang === 'en' ? 'Back' : 'رجوع'}
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </Button>
      </div>
    </header>
  );
};

/* -----------------------------------------------------
   Profile Screen — v10
----------------------------------------------------- */

const ProfileScreen: React.FC = () => {
  const { lang } = useI18n();
  const { user: authUser, isGuest } = useAuth();
  const { currentView, navigate } = useNavigation();
  const paramUserId =
    currentView.type === 'immersive'
      ? currentView.params?.userId
      : undefined;
  const effectiveProfileUserId = paramUserId ?? authUser?.uid;
  const isGuestView = isGuest && !effectiveProfileUserId;
  const isOwnProfile = !!authUser && effectiveProfileUserId === authUser.uid;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const tabScrollPositions = useRef<Record<ProfileTab, number>>({
    posts: 0,
    reviews: 0,
    shelves: 0,
    publications: 0,
  });
  const scopedProfileRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<ProfileTab>(() =>
    readPersistedProfileTab(effectiveProfileUserId) ?? 'shelves'
  );
  const [showCompactProfileBar, setShowCompactProfileBar] = useState(false);
  const [activePublicationMenuId, setActivePublicationMenuId] = useState<string | null>(null);
  const [publicationToUnpublish, setPublicationToUnpublish] = useState<ProfilePublicationRecord | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const { data: fetchedProfile, isLoading } =
    useUserProfile(effectiveProfileUserId);

  const {
    data: userStats,
    isError: userStatsError,
  } = useUserStats(effectiveProfileUserId);

  const { data: shelves, isLoading: shelvesLoading } =
    useUserShelves(effectiveProfileUserId);
  const { data: profilePosts, isLoading: profilePostsLoading, isError: profilePostsError } =
    useUserProfilePosts(
      effectiveProfileUserId,
      20,
      activeTab === 'posts'
    );
  const {
    data: profileReviews,
    isLoading: profileReviewsLoading,
    isError: profileReviewsError,
    error: profileReviewsErrorObject,
  } =
    useUserProfileReviews(
      effectiveProfileUserId,
      20,
      activeTab === 'reviews'
    );
  const {
    data: profilePublications,
    isLoading: profilePublicationsLoading,
    isError: profilePublicationsError,
  } = useUserProfilePublications(
    effectiveProfileUserId,
    20,
    activeTab === 'publications'
  );

  const profile = isGuestView ? MOCK_GUEST_PROFILE : fetchedProfile;

  const { mutate: updateProfile, isLoading: isUpdating } = useUpdateProfile();
  const { mutate: startConversation, isLoading: isStartingConversation } =
    useStartConversation();
  const updateLongformVisibility = useUpdateLongformPublicationVisibility();
  const updateBookVisibility = useUpdatePublishedBookVisibility();
  const { data: isFollowed } = useFollowStatus(effectiveProfileUserId);
  const { mutate: followUser, isLoading: isFollowingUser } = useFollowUser();
  const { mutate: unfollowUser, isLoading: isUnfollowingUser } = useUnfollowUser();

  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [activeConnectionList, setActiveConnectionList] = useState<'followers' | 'following' | null>(null);
  const [bannerError, setBannerError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const [editData, setEditData] = useState<ProfileEditData>({
    name: '',
    bio: '',
    avatarUrl: '',
    bannerUrl: '',
  });
  const {
    data: followListUsers,
    isLoading: isFollowListLoading,
  } = useUserFollowList(effectiveProfileUserId, activeConnectionList);

  /* -----------------------------------------------------
     Scroll listener (v10 refined)
  ----------------------------------------------------- */

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const top = el.scrollTop;
      tabScrollPositions.current[activeTab] = top;
      setShowCompactProfileBar(top > 160);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => el.removeEventListener('scroll', onScroll);
  }, [activeTab]);

  useEffect(() => {
    if (!effectiveProfileUserId) return;
    if (scopedProfileRef.current === effectiveProfileUserId) return;

    scopedProfileRef.current = effectiveProfileUserId;
    const restoredTab = readPersistedProfileTab(effectiveProfileUserId) ?? 'shelves';
    setActiveTab(restoredTab);
  }, [effectiveProfileUserId]);

  useEffect(() => {
    setBannerError(false);
  }, [profile?.bannerUrl]);

  useEffect(() => {
    setAvatarError(false);
  }, [profile?.avatarUrl]);

  useEffect(() => {
    if (!activePublicationMenuId) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('[data-profile-publication-menu="true"]') ||
        target?.closest('[data-profile-publication-trigger="true"]')
      ) {
        return;
      }
      setActivePublicationMenuId(null);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActivePublicationMenuId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [activePublicationMenuId]);

  const switchTab = (tab: ProfileTab) => {
    const el = scrollRef.current;
    if (!el || tab === activeTab) {
      setActiveTab(tab);
      persistProfileTab(effectiveProfileUserId, tab);
      return;
    }

    tabScrollPositions.current[activeTab] = el.scrollTop;
    setActiveTab(tab);
    persistProfileTab(effectiveProfileUserId, tab);

    requestAnimationFrame(() => {
      el.scrollTo({
        top: tabScrollPositions.current[tab] ?? 0,
        behavior: 'auto',
      });
    });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;

    touchStartX.current = null;
    touchStartY.current = null;

    if (Math.abs(dx) < 60 || Math.abs(dy) > 60) return;

    const idx = TABS.indexOf(activeTab);
    if (dx < 0 && TABS[idx + 1]) switchTab(TABS[idx + 1]);
    if (dx > 0 && TABS[idx - 1]) switchTab(TABS[idx - 1]);
  };

  if (isLoading && !isGuestView) {
    return (
      <PageShell className="items-center justify-center">
        <LoadingSpinner />
      </PageShell>
    );
  }

  if (!profile) {
    return (
      <PageShell className="items-center justify-center">
        <BilingualText>Profile not found</BilingualText>
      </PageShell>
    );
  }

  const joinDate = new Date(profile.joinDate).toLocaleDateString(
    lang === 'ar' ? 'ar-EG' : 'en-US',
    { month: 'short', year: 'numeric' }
  );
  const profileBio = profile.bioEn || profile.bioAr;
  const profileReviewsErrorCode =
    profileReviewsErrorObject &&
    typeof profileReviewsErrorObject === 'object' &&
    'code' in profileReviewsErrorObject &&
    typeof (profileReviewsErrorObject as { code?: unknown }).code === 'string'
      ? String((profileReviewsErrorObject as { code: string }).code)
      : 'UNKNOWN';
  const statDisplay = (value: number | undefined): string =>
    userStatsError ? '--' : String(value ?? 0);
  const showProfileStrength = false;
  const fallbackAvatarUrl = `https://api.dicebear.com/8.x/lorelei/svg?seed=${effectiveProfileUserId || 'profile-user'}`;
  const resolvedAvatarUrl =
    !avatarError && profile.avatarUrl ? profile.avatarUrl : fallbackAvatarUrl;
  const profileStatItems = [
    {
      key: 'books',
      label: lang === 'en' ? 'Books' : 'الكتب',
      value: statDisplay(userStats?.booksRead),
    },
    {
      key: 'words',
      label: lang === 'en' ? 'Words' : 'الكلمات',
      value: statDisplay(userStats?.wordsWritten),
    },
    {
      key: 'followers',
      label: lang === 'en' ? 'Followers' : 'المتابعون',
      value: statDisplay(userStats?.followers),
    },
    {
      key: 'following',
      label: lang === 'en' ? 'Following' : 'يتابع',
      value: statDisplay(userStats?.following),
    },
  ];
  const connectionTitle =
    activeConnectionList === 'followers'
      ? lang === 'en'
        ? 'Followers'
        : 'المتابعون'
      : lang === 'en'
        ? 'Following'
        : 'يتابع';
  const connectionEmptyLabel =
    activeConnectionList === 'followers'
      ? lang === 'en'
        ? 'No followers yet.'
        : 'لا يوجد متابعون بعد.'
      : lang === 'en'
        ? 'Not following anyone yet.'
        : 'لا يتابع أحدًا بعد.';
  const handleOpenReviewedBook = (
    bookId: string,
    reviewId: string,
    reviewAction?: 'edit'
  ) => {
    if (!bookId) return;
    navigate({
      type: 'immersive',
      id: 'bookDetails',
      params: {
        bookId,
        reviewId,
        ...(reviewAction ? { reviewAction } : {}),
        from: currentView,
      },
    });
  };
  const handleOpenProfilePublication = (publication: {
    entityType: 'blog' | 'ebook';
    publicationId?: string;
    canonicalSlug?: string;
    bookId?: string;
  }) => {
    if (publication.entityType === 'blog' && publication.publicationId) {
      navigate({
        type: 'immersive',
        id: 'publicationReader',
        params: {
          publicationId: publication.publicationId,
          ...(publication.canonicalSlug ? { canonicalSlug: publication.canonicalSlug } : {}),
          from: currentView,
        },
      });
      return;
    }

    if (publication.entityType === 'ebook' && publication.bookId) {
      navigate({
        type: 'immersive',
        id: 'bookDetails',
        params: {
          bookId: publication.bookId,
          from: currentView,
        },
      });
    }
  };

  const handleRequestUnpublish = (publication: ProfilePublicationRecord) => {
    setActivePublicationMenuId(null);
    setPublicationToUnpublish(publication);
  };

  const handleConfirmUnpublish = () => {
    if (!publicationToUnpublish) {
      return;
    }

    if (publicationToUnpublish.entityType === 'blog' && publicationToUnpublish.publicationId) {
      updateLongformVisibility.mutate(
        {
          publicationId: publicationToUnpublish.publicationId,
          visibility: 'private',
        },
        {
          onSuccess: () => {
            setPublicationToUnpublish(null);
            showToast(lang === 'en' ? 'Publication unpublished.' : 'تم إلغاء نشر المنشور.');
          },
          onError: (error) => {
            const message =
              error instanceof Error && error.message.trim()
                ? error.message
                : (lang === 'en'
                    ? 'Unable to unpublish this publication.'
                    : 'تعذّر إلغاء نشر هذا المنشور.');
            showToast(message);
          },
        }
      );
      return;
    }

    if (publicationToUnpublish.entityType === 'ebook' && publicationToUnpublish.bookId) {
      updateBookVisibility.mutate(
        {
          bookId: publicationToUnpublish.bookId,
          visibility: 'private',
        },
        {
          onSuccess: () => {
            setPublicationToUnpublish(null);
            showToast(lang === 'en' ? 'Publication unpublished.' : 'تم إلغاء نشر المنشور.');
          },
          onError: (error) => {
            const message =
              error instanceof Error && error.message.trim()
                ? error.message
                : (lang === 'en'
                    ? 'Unable to unpublish this publication.'
                    : 'تعذّر إلغاء نشر هذا المنشور.');
            showToast(message);
          },
        }
      );
    }
  };

  const isUnpublishing =
    updateLongformVisibility.isLoading || updateBookVisibility.isLoading;

  return (
    <>
      <PageShell scrollable ref={scrollRef}>
        <ScreenHeader onBack={() => navigate({ type: 'tab', id: 'home' })} />
        <div className="pt-10 md:pt-14">
          {/* HERO */}
          <div className="app-rail app-rail--default">
            <div className="relative h-32 overflow-hidden rounded-[28px] md:h-36">
              {profile.bannerUrl && !bannerError ? (
                <img
                  src={profile.bannerUrl}
                  className="h-full w-full object-cover"
                  onError={() => setBannerError(true)}
                  alt=""
                />
              ) : (
                <div className="h-full w-full bg-[linear-gradient(135deg,#111827_0%,#172554_46%,#0f172a_100%)]" />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-gray-50/95 dark:from-slate-900/95 via-transparent to-transparent" />
            </div>
          </div>

          {/* IDENTITY */}
          <div className="app-rail app-rail--default max-w-2xl -mt-4 pb-4 relative z-10">
            <div className="flex items-start gap-4 md:gap-5">
              <div className="h-24 w-24 md:h-28 md:w-28 rounded-full overflow-hidden border-4 border-gray-50 dark:border-slate-900 bg-slate-200 dark:bg-slate-800 shadow-lg flex-shrink-0">
                <img
                  src={resolvedAvatarUrl}
                  className="h-full w-full object-cover object-center"
                  alt="Avatar"
                  onError={() => setAvatarError(true)}
                />
              </div>

              <div className="min-w-0 flex-grow pt-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <BilingualText role="H1" className="!text-3xl font-semibold leading-tight">
                      {profile.name}
                    </BilingualText>

                    <BilingualText role="Caption" className="mt-1 text-slate-500 truncate">
                      {profile.handle}
                    </BilingualText>

                    <div className="mt-2 flex items-center gap-2 text-slate-500">
                      <CalendarIcon className="h-4 w-4" />
                      <BilingualText role="Caption">
                        {lang === 'en' ? `Joined ${joinDate}` : `انضم في ${joinDate}`}
                      </BilingualText>
                    </div>
                  </div>

                  {isOwnProfile && (
                    <Button
                      variant="icon"
                      onClick={() => {
                        setEditData({
                          name: profile.name,
                          bio: profile.bioEn || profile.bioAr,
                          avatarUrl: profile.avatarUrl,
                          bannerUrl: profile.bannerUrl,
                        });
                        setEditModalOpen(true);
                      }}
                      className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/14 !text-slate-700 dark:!text-white flex-shrink-0"
                    >
                      <EditIcon className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="mt-3 max-w-xl">
                  <BilingualText role="Body" className="text-slate-600 dark:text-slate-300">
                    {profileBio || (lang === 'en' ? 'No bio yet.' : 'لا توجد نبذة بعد.')}
                  </BilingualText>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400 justify-center md:justify-start">
                  {profileStatItems.map((item, index) => (
                    <React.Fragment key={item.key}>
                      {item.key === 'followers' || item.key === 'following' ? (
                        <button
                          type="button"
                          onClick={() =>
                            setActiveConnectionList(item.key as 'followers' | 'following')
                          }
                          className="inline-flex items-center gap-2 whitespace-nowrap rounded-full transition-colors hover:text-slate-900 dark:hover:text-white"
                        >
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {item.value}
                          </span>
                          <span>{item.label}</span>
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2 whitespace-nowrap">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {item.value}
                          </span>
                          <span>{item.label}</span>
                        </span>
                      )}
                      {index < profileStatItems.length - 1 && (
                        <span className="text-slate-400 dark:text-slate-500">·</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

          {!isOwnProfile && authUser?.uid && effectiveProfileUserId && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant={isFollowed ? 'ghost' : 'primary'}
                disabled={isFollowingUser || isUnfollowingUser}
                onClick={() => {
                  if (isFollowed) {
                    unfollowUser(effectiveProfileUserId);
                    return;
                  }
                  followUser(effectiveProfileUserId);
                }}
              >
                <BilingualText>
                  {isFollowed
                    ? (lang === 'en' ? 'Following' : 'تتابعه')
                    : (lang === 'en' ? 'Follow' : 'متابعة')}
                </BilingualText>
              </Button>
              <Button
                variant="secondary"
                disabled={isStartingConversation}
                onClick={() => {
                  startConversation(effectiveProfileUserId, {
                    onSuccess: (conversationId) => {
                      navigate({
                        type: 'immersive',
                        id: 'messengerChat',
                        params: {
                          from: currentView,
                          conversationId,
                          contactName: profile.name,
                        },
                      });
                    },
                  });
                }}
              >
                <BilingualText>
                  {lang === 'en' ? 'Message' : 'راسل'}
                </BilingualText>
              </Button>
            </div>
          )}

          {showProfileStrength && isOwnProfile && userStats?.profileCompletionScore !== undefined && (
            <div className="mt-3">
              <ProfileStrengthBar score={userStats.profileCompletionScore} />
            </div>
          )}
          {userStatsError && (
            <BilingualText role="Caption" className="mt-2 text-amber-600 dark:text-amber-400">
              {lang === 'en' ? 'Profile stats unavailable.' : 'إحصاءات الملف الشخصي غير متاحة.'}
            </BilingualText>
          )}
        </div>

        {/* STICKY PROFILE BAR + TABS */}
        <motion.div
          className="sticky top-0 z-20 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur border-b border-black/10 dark:border-white/10"
          animate={{
            boxShadow: showCompactProfileBar
              ? '0 6px 18px rgba(0,0,0,0.10)'
              : '0 0 0 rgba(0,0,0,0)',
          }}
        >
          {showCompactProfileBar ? (
            <div className="app-rail app-rail--default h-9 flex items-center justify-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key="identity"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="flex items-center gap-2 min-w-0"
                >
                  <motion.img
                    src={resolvedAvatarUrl}
                    alt=""
                    className="h-5 w-5 rounded-full object-cover"
                    onError={() => setAvatarError(true)}
                  />
                  <span className="text-sm font-medium truncate text-slate-900 dark:text-white">
                    {profile.name}
                  </span>
                </motion.div>
              </AnimatePresence>
            </div>
          ) : null}

          <div className="app-rail app-rail--default flex">
            {TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => switchTab(tab)}
                    className={`relative flex-1 py-2.5 text-sm font-medium capitalize ${
                  activeTab === tab
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-500'
                }`}
              >
                {formatProfileTabLabel(tab, lang)}
                {activeTab === tab && (
                  <motion.div
                    layoutId="profile-tab-underline"
                    className="absolute bottom-0 left-1/2 h-[2px] w-8 -translate-x-1/2 rounded-full bg-accent"
                  />
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* CONTENT */}
        <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
              className="app-rail app-rail--default py-8 space-y-4"
            >
              {activeTab === 'shelves' &&
                (shelvesLoading ? (
                  <LoadingSpinner />
                ) : shelves && shelves.length > 0 ? (
                  shelves.map(shelf => (
                    <ShelfCarousel
                      key={shelf.id}
                      shelf={shelf}
                      isOpen
                      layout="carousel"
                    />
                  ))
                ) : (
                  <BilingualText className="text-slate-500">
                    {lang === 'en' ? 'No shelves yet.' : 'لا توجد رفوف بعد.'}
                  </BilingualText>
                ))}

              {activeTab === 'posts' &&
                (profilePostsLoading ? (
                  <LoadingSpinner />
                ) : profilePostsError ? (
                  <BilingualText className="text-red-500 dark:text-red-400">
                    {lang === 'en' ? 'Failed to load posts.' : 'فشل تحميل المنشورات.'}
                  </BilingualText>
                ) : profilePosts && profilePosts.length > 0 ? (
                  profilePosts.map(post => (
                    <PostCard
                      key={post.id}
                      post={post}
                      viewMode="list"
                      surface="drawer"
                    />
                  ))
                ) : (
                  <BilingualText className="text-slate-500">
                    {lang === 'en' ? 'No posts yet.' : 'لا توجد منشورات بعد.'}
                  </BilingualText>
                ))}

              {activeTab === 'reviews' &&
                (profileReviewsLoading ? (
                  <LoadingSpinner />
                ) : profileReviewsError ? (
                  <BilingualText className="text-red-500 dark:text-red-400">
                    {lang === 'en'
                      ? `Failed to load reviews (${profileReviewsErrorCode}).`
                      : `فشل تحميل المراجعات (${profileReviewsErrorCode}).`}
                  </BilingualText>
                ) : profileReviews && profileReviews.length > 0 ? (
                  profileReviews.map(review => (
                    <div key={`${review.bookId}_${review.userId}`} className="rounded-xl bg-slate-900 px-4">
                      <ReviewCard
                        review={review}
                        showBookContext
                        onOpenBook={(selectedReview) => {
                          handleOpenReviewedBook(selectedReview.bookId, selectedReview.id);
                        }}
                        onEdit={(selectedReview) => {
                          handleOpenReviewedBook(
                            selectedReview.bookId,
                            selectedReview.id,
                            'edit'
                          );
                        }}
                      />
                    </div>
                  ))
                ) : (
                  <BilingualText className="text-slate-500">
                    {lang === 'en' ? 'No reviews yet.' : 'لا توجد مراجعات بعد.'}
                  </BilingualText>
                ))}

              {activeTab === 'publications' &&
                (profilePublicationsLoading ? (
                  <LoadingSpinner />
                ) : profilePublicationsError ? (
                  <BilingualText className="text-red-500 dark:text-red-400">
                    {lang === 'en'
                      ? 'Failed to load publications.'
                      : 'فشل تحميل المنشورات.'}
                  </BilingualText>
                ) : profilePublications && profilePublications.length > 0 ? (
                  profilePublications.map(publication => (
                    <div
                      key={`${publication.entityType}:${publication.id}`}
                      className="relative flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:hover:bg-slate-800/80"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenProfilePublication(publication)}
                        className="flex min-w-0 flex-1 items-center gap-4 text-left"
                      >
                        <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-700/60">
                          <CanonicalCoverArtwork
                            title={publication.title}
                            coverUrl={publication.coverUrl}
                            coverMode={publication.coverMode}
                            fallbackCover={publication.fallbackCover}
                            variant="posterCompact"
                            imageClassName="h-full w-full object-cover"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {formatPublicationTypeLabel(publication.publicationType, lang)}
                          </div>
                          <BilingualText
                            role="H3"
                            className="mt-2 line-clamp-2 !text-lg !font-semibold"
                          >
                            {publication.title}
                          </BilingualText>
                          <div className="mt-2 text-xs text-slate-500">
                            {new Date(publication.publishedAt).toLocaleDateString(
                              lang === 'ar' ? 'ar-EG' : 'en-US',
                              { month: 'short', day: 'numeric', year: 'numeric' }
                            )}
                          </div>
                        </div>
                      </button>

                      {isOwnProfile ? (
                        <div className="relative shrink-0">
                          <button
                            type="button"
                            data-profile-publication-trigger="true"
                            onClick={(event) => {
                              event.stopPropagation();
                              setActivePublicationMenuId((current) =>
                                current === publication.id ? null : publication.id
                              );
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-black/5 hover:text-white dark:hover:bg-white/10"
                            aria-label={lang === 'en' ? 'Publication actions' : 'إجراءات المنشور'}
                            aria-expanded={activePublicationMenuId === publication.id}
                          >
                            <VerticalEllipsisIcon className="h-5 w-5" />
                          </button>

                          {activePublicationMenuId === publication.id ? (
                            <div
                              data-profile-publication-menu="true"
                              className="absolute right-0 top-10 z-20 w-44 overflow-hidden rounded-xl border border-white/10 bg-[#2A303C] p-1 shadow-xl"
                            >
                              <button
                                type="button"
                                className="w-full rounded-md px-3 py-2 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRequestUnpublish(publication);
                                }}
                              >
                                {lang === 'en' ? 'Unpublish' : 'إلغاء النشر'}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <BilingualText className="text-slate-500">
                    {lang === 'en' ? 'No publications yet.' : 'لا توجد منشورات بعد.'}
                  </BilingualText>
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      </PageShell>

      {isOwnProfile && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setEditModalOpen(false)}
          profileData={editData}
          setProfileData={setEditData}
          onSave={() =>
            updateProfile(
              {
                name: editData.name,
                bioEn: editData.bio,
                bioAr: editData.bio,
                avatarUrl: editData.avatarUrl,
                bannerUrl: editData.bannerUrl,
              },
              {
                onSuccess: () => setEditModalOpen(false),
              }
            )
          }
          isSaving={isUpdating}
        />
      )}
      <ConfirmDeleteModal
        isOpen={!!publicationToUnpublish}
        onClose={() => setPublicationToUnpublish(null)}
        onConfirm={handleConfirmUnpublish}
        isDeleting={isUnpublishing}
        itemName={publicationToUnpublish?.title || ''}
        itemType={lang === 'en' ? 'publication' : 'منشور'}
        titleText={lang === 'en' ? 'Unpublish publication?' : 'إلغاء نشر هذا المنشور؟'}
        bodyText={
          lang === 'en'
            ? 'This will remove this publication from your public profile and readers. Your writing project will remain in Write.'
            : 'سيؤدي هذا إلى إزالة هذا المنشور من ملفك العام ومن وصول القراء. وسيبقى مشروع الكتابة في قسم الكتابة.'
        }
        confirmLabel={lang === 'en' ? 'Confirm Unpublish' : 'تأكيد إلغاء النشر'}
      />
      <ProfileConnectionsModal
        isOpen={activeConnectionList !== null}
        onClose={() => setActiveConnectionList(null)}
        title={connectionTitle}
        users={followListUsers}
        isLoading={isFollowListLoading}
        emptyLabel={connectionEmptyLabel}
        onSelectUser={(selectedUser) => {
          setActiveConnectionList(null);
          navigate({
            type: 'immersive',
            id: 'profile',
            params: {
              userId: selectedUser.uid,
              from: currentView,
            },
          });
        }}
      />
    </>
  );
};

export default ProfileScreen;
