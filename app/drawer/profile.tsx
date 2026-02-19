import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useI18n } from '../../store/i18n.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useUserProfile } from '../../lib/hooks/useUserProfile.ts';
import { useUserStats } from '../../lib/hooks/useUserStats.ts';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import { useUserProfilePosts } from '../../lib/hooks/useUserProfilePosts.ts';
import { useUserProfileReviews } from '../../lib/hooks/useUserProfileReviews.ts';
import { useUserProfileBooks } from '../../lib/hooks/useUserProfileBooks.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import { EditIcon } from '../../components/icons/EditIcon.tsx';
import { CalendarIcon } from '../../components/icons/CalendarIcon.tsx';
import { useUpdateProfile } from '../../lib/hooks/useUpdateProfile.ts';
import { useStartConversation } from '../../lib/hooks/useMessenger.ts';
import { useFollowStatus, useFollowUser, useUnfollowUser } from '../../lib/hooks/useFollowUser.ts';
import EditProfileModal, {
  ProfileEditData,
} from '../../components/modals/EditProfileModal.tsx';
import PageShell from '../../components/layout/PageShell.tsx';
import ProfileStrengthBar from '../../components/ui/ProfileStrengthBar.tsx';
import ShelfCarousel from '../../components/content/ShelfCarousel.tsx';
import PostCard from '../../components/content/PostCard.tsx';
import ReviewCard from '../../components/content/ReviewCard.tsx';
import BookCard from '../../components/content/BookCard.tsx';

type ProfileTab = 'posts' | 'reviews' | 'shelves' | 'books';

const TABS: ProfileTab[] = ['posts', 'reviews', 'shelves', 'books'];

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
        className={`container mx-auto flex h-20 items-center px-2 ${
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

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const tabScrollPositions = useRef<Record<ProfileTab, number>>({
    posts: 0,
    reviews: 0,
    shelves: 0,
    books: 0,
  });

  const [activeTab, setActiveTab] = useState<ProfileTab>('shelves');
  const [showCompactProfileBar, setShowCompactProfileBar] = useState(false);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const paramUserId =
    currentView.type === 'immersive'
      ? currentView.params?.userId
      : undefined;

  const effectiveProfileUserId = paramUserId ?? authUser?.uid;
  const isGuestView = isGuest && !effectiveProfileUserId;
  const isOwnProfile = !!authUser && effectiveProfileUserId === authUser.uid;

  const { data: fetchedProfile, isLoading } =
    useUserProfile(effectiveProfileUserId);

  const { data: userStats } = useUserStats(effectiveProfileUserId);

  const { data: shelves, isLoading: shelvesLoading } =
    useUserShelves(effectiveProfileUserId);
  const { data: profilePosts, isLoading: profilePostsLoading } =
    useUserProfilePosts(
      effectiveProfileUserId,
      20,
      activeTab === 'posts'
    );
  const { data: profileReviews, isLoading: profileReviewsLoading } =
    useUserProfileReviews(
      effectiveProfileUserId,
      20,
      activeTab === 'reviews'
    );
  const { data: profileBooks, isLoading: profileBooksLoading } =
    useUserProfileBooks(
      effectiveProfileUserId,
      20,
      activeTab === 'books'
    );

  const profile = isGuestView ? MOCK_GUEST_PROFILE : fetchedProfile;

  const { mutate: updateProfile, isLoading: isUpdating } = useUpdateProfile();
  const { mutate: startConversation, isLoading: isStartingConversation } =
    useStartConversation();
  const { data: isFollowed } = useFollowStatus(effectiveProfileUserId);
  const { mutate: followUser, isLoading: isFollowingUser } = useFollowUser();
  const { mutate: unfollowUser, isLoading: isUnfollowingUser } = useUnfollowUser();

  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [bannerError, setBannerError] = useState(false);

  const [editData, setEditData] = useState<ProfileEditData>({
    name: '',
    bioEn: '',
    bioAr: '',
    avatarUrl: '',
    bannerUrl: '',
  });

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

  const switchTab = (tab: ProfileTab) => {
    const el = scrollRef.current;
    if (!el || tab === activeTab) {
      setActiveTab(tab);
      return;
    }

    tabScrollPositions.current[activeTab] = el.scrollTop;
    setActiveTab(tab);

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

  return (
    <>
      <PageShell scrollable ref={scrollRef}>
        <ScreenHeader onBack={() => navigate({ type: 'tab', id: 'home' })} />

        {/* HERO */}
        <div className="relative h-40">
          {profile.bannerUrl && !bannerError ? (
            <img
              src={profile.bannerUrl}
              className="h-full w-full object-cover"
              onError={() => setBannerError(true)}
              alt=""
            />
          ) : (
            <div className="h-full w-full bg-slate-200 dark:bg-slate-800" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-gray-50/95 dark:from-slate-900/95 via-transparent to-transparent" />

          <div className="absolute -bottom-14 left-4">
            <div className="h-28 w-28 rounded-full overflow-hidden border-4 border-gray-50 dark:border-slate-900">
              <img
                src={profile.avatarUrl}
                className="h-full w-full object-cover"
                alt="Avatar"
              />
            </div>
          </div>

          {isOwnProfile && (
            <div className="absolute top-4 right-4">
              <Button
                variant="icon"
                onClick={() => {
                  setEditData({
                    name: profile.name,
                    bioEn: profile.bioEn,
                    bioAr: profile.bioAr,
                    avatarUrl: profile.avatarUrl,
                    bannerUrl: profile.bannerUrl,
                  });
                  setEditModalOpen(true);
                }}
                className="bg-black/40 backdrop-blur-md border border-white/20 !text-white"
              >
                <EditIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* IDENTITY */}
        <div className="container mx-auto px-4 pt-20 pb-6 max-w-2xl">
          <BilingualText role="H1" className="!text-3xl font-semibold">
            {profile.name}
          </BilingualText>

          <BilingualText role="Caption" className="text-slate-500">
            {profile.handle}
          </BilingualText>

          <div className="flex items-center gap-2 text-slate-500 mt-1">
            <CalendarIcon className="h-4 w-4" />
            <BilingualText role="Caption">
              {lang === 'en' ? `Joined ${joinDate}` : `انضم في ${joinDate}`}
            </BilingualText>
          </div>

          <div className="mt-4 rounded-xl bg-slate-100 dark:bg-slate-800 p-4">
            <BilingualText role="Body">
              {lang === 'en' ? profile.bioEn : profile.bioAr}
            </BilingualText>
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

          {isOwnProfile && userStats?.profileCompletionScore !== undefined && (
            <div className="mt-3">
              <ProfileStrengthBar score={userStats.profileCompletionScore} />
            </div>
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
        <div className="container mx-auto px-4 h-10 flex items-center justify-center">
  <AnimatePresence mode="wait">
    {!showCompactProfileBar && (
     <motion.div
  key="stats"
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.15 }}
  className="text-xs text-slate-500 flex items-center gap-2"
>
  <span className="font-medium text-slate-700 dark:text-slate-200">
    {userStats?.booksRead ?? 0}
  </span>
  Books
  <span>·</span>
  <span className="font-medium text-slate-700 dark:text-slate-200">
    {userStats?.wordsWritten ?? 0}
  </span>
  Words
  <span>·</span>
  <span className="font-medium text-slate-700 dark:text-slate-200">
    {userStats?.followers ?? 0}
  </span>
  Followers
  <span>·</span>
  <span className="font-medium text-slate-700 dark:text-slate-200">
    {userStats?.following ?? 0}
  </span>
  Following
</motion.div>
    )}

    {showCompactProfileBar && (
      <motion.div
        key="identity"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="flex items-center gap-2 min-w-0"
      >
        <motion.img
          src={profile.avatarUrl}
          alt=""
          className="h-5 w-5 rounded-full object-cover"
        />
        <span className="text-sm font-medium truncate text-slate-900 dark:text-white">
          {profile.name}
        </span>
      </motion.div>
    )}
  </AnimatePresence>
</div>

          <div className="container mx-auto px-4 flex">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => switchTab(tab)}
                className={`relative flex-1 py-3 text-sm font-medium capitalize ${
                  activeTab === tab
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-500'
                }`}
              >
                {tab}
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
              className="container mx-auto px-4 py-10 space-y-4"
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
                ) : profileReviews && profileReviews.length > 0 ? (
                  profileReviews.map(review => (
                    <ReviewCard key={review.id} review={review} />
                  ))
                ) : (
                  <BilingualText className="text-slate-500">
                    {lang === 'en' ? 'No reviews yet.' : 'لا توجد مراجعات بعد.'}
                  </BilingualText>
                ))}

              {activeTab === 'books' &&
                (profileBooksLoading ? (
                  <LoadingSpinner />
                ) : profileBooks && profileBooks.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {profileBooks.map(book => (
                      <BookCard
                        key={book.id}
                        bookId={book.id}
                        book={book}
                        layout="list"
                      />
                    ))}
                  </div>
                ) : (
                  <BilingualText className="text-slate-500">
                    {lang === 'en' ? 'No books yet.' : 'لا توجد كتب بعد.'}
                  </BilingualText>
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </PageShell>

      {isOwnProfile && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setEditModalOpen(false)}
          profileData={editData}
          setProfileData={setEditData}
          onSave={() =>
            updateProfile(editData, {
              onSuccess: () => setEditModalOpen(false),
            })
          }
          isSaving={isUpdating}
        />
      )}
    </>
  );
};

export default ProfileScreen;
