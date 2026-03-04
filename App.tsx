import React, { useState, useEffect, Suspense, lazy } from 'react';
import { I18nProvider } from './store/i18n.tsx';
import { NavigationProvider, useNavigation } from './store/navigation.tsx';
import { AuthProvider, useAuth } from './lib/auth.tsx';
import { ThemeProvider } from './store/theme.tsx';
import { ReadingPreferencesProvider } from './store/reading-prefs.tsx';
import GlobalErrorBoundary from './components/ui/GlobalErrorBoundary.tsx';
import OfflineBanner from './components/ui/OfflineBanner.tsx';
import EnvironmentIndicator from './components/ui/EnvironmentIndicator.tsx';
import { OfflineProvider } from './lib/offline/OfflineProvider.tsx';
import { ToastProvider } from './store/toast.tsx';
import LoadingSpinner from './components/ui/LoadingSpinner.tsx';
import SplashScreen from './components/ui/SplashScreen.tsx';
import { AttachmentViewerProvider } from './store/attachment-viewer.tsx';
import AttachmentViewerOverlay from './components/content/AttachmentViewerOverlay.tsx';
import { cn } from './lib/utils.ts';

// Lazy Load Major Screens
const HomeScreen = lazy(() => import('./app/tabs/home.tsx'));
const ReadScreen = lazy(() => import('./app/tabs/read.tsx'));
const DiscoverScreen = lazy(() => import('./app/tabs/discover.tsx'));
const WriteScreen = lazy(() => import('./app/tabs/write.tsx'));
const SocialScreen = lazy(() => import('./app/tabs/social.tsx'));
const DiscoveryStackScreen = lazy(() => import('./app/discovery/index.tsx'));

// Immersive Screens
const BookDetailsScreen = lazy(() => import('./app/book-details.tsx'));
const AuthorDetailsScreen = lazy(() => import('./app/author-details.tsx'));
const QuoteDetailsScreen = lazy(() => import('./app/quote-details.tsx'));
const PostDetailsScreen = lazy(() => import('./app/post-details.tsx'));
const PostDiscussionScreen = lazy(() => import('./app/social/post-discussion.tsx'));
const PostTextOverlayScreen = lazy(() => import('./app/social/post-text-overlay.tsx'));
const VenueDetailsScreen = lazy(() => import('./app/venue-details.tsx'));
const EditorScreen = lazy(() => import('./app/editor/[id].tsx'));
const ReaderScreen = lazy(() => import('./app/reader.tsx'));
const PostComposerScreen = lazy(() => import('./app/immersive/post-composer.tsx'));
const DiscoveryFlowScreen = lazy(() => import('./app/discovery/flow.tsx'));
const ProfileScreen = lazy(() => import('./app/drawer/profile.tsx'));
const BookmarksScreen = lazy(() => import('./app/drawer/bookmarks.tsx'));
const QuotesScreen = lazy(() => import('./app/drawer/quotes.tsx'));
const AuthorsScreen = lazy(() => import('./app/drawer/authors.tsx'));
const VenuesScreen = lazy(() => import('./app/drawer/venues.tsx'));
const SettingsScreen = lazy(() => import('./app/drawer/settings.tsx'));
const FeedbackScreen = lazy(() => import('./app/drawer/feedback.tsx'));
const AdminDashboardScreen = lazy(() => import('./app/drawer/admin.tsx'));
const BooksScreen = lazy(() => import('./app/drawer/books.tsx'));
const NotificationsFeedScreen = lazy(() => import('./app/notifications/feed.tsx'));
const ShelfDetailsScreen = lazy(() => import('./app/shelf-details.tsx'));

// Added missing lazy loaded components for ImmersiveScreens
const AgentChatScreen = lazy(() => import('./app/agent.tsx'));
const LiveSearchScreen = lazy(() => import('./app/search/live.tsx'));
const MessengerListScreen = lazy(() => import('./app/messenger/list.tsx'));
const MessengerChatScreen = lazy(() => import('./app/messenger/[id].tsx'));
const PeopleFlowScreen = lazy(() => import('./app/immersive/people-flow.tsx'));
const GoodreadsImportScreen = lazy(() => import('./app/immersive/goodreads-import.tsx'));
const DraftsScreen = lazy(() => import('./app/social/drafts.tsx'));
const ProjectEditScreen = lazy(() => import('./app/project/edit.tsx'));
const ProjectPublishScreen = lazy(() => import('./app/project/publish.tsx'));
const ProjectPreviewScreen = lazy(() => import('./app/project/preview.tsx'));
const ProjectPublishedScreen = lazy(() => import('./app/project/published.tsx'));
const EmailScreen = lazy(() => import('./app/drawer/email.tsx'));
const AdminIntelligenceScreen = lazy(() => import('./app/admin/intelligence/page.tsx'));

// Eager load critical navigation components
import BottomNavBar from './components/navigation/BottomNavBar.tsx';
import Drawer from './components/navigation/Drawer.tsx';
import LoginScreen from './app/auth/login.tsx';

const PageLoader = () => (
    <div className="h-full w-full flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <LoadingSpinner />
    </div>
);

const TabScreens: React.FC = () => {
    const { currentView } = useNavigation();
    const activeTab = currentView.type === 'tab' ? currentView.id : null;

    return (
        <div className="h-full w-full relative">
            <div className="h-full w-full">
                 <Suspense fallback={<PageLoader />}>
                    <div style={{ display: activeTab === 'home' ? 'block' : 'none', height: '100%' }}><HomeScreen /></div>
                    <div style={{ display: activeTab === 'read' ? 'block' : 'none', height: '100%' }}><ReadScreen /></div>
                    <div style={{ display: activeTab === 'discover' ? 'block' : 'none', height: '100%' }}><DiscoverScreen /></div>
                    <div style={{ display: activeTab === 'write' ? 'block' : 'none', height: '100%' }}><WriteScreen /></div>
                    <div style={{ display: activeTab === 'social' ? 'block' : 'none', height: '100%' }}><SocialScreen /></div>
                </Suspense>
            </div>
            {activeTab && <BottomNavBar activeTab={activeTab} />}
        </div>
    );
};

const ImmersiveScreens: React.FC = () => {
    const { currentView } = useNavigation();
    const { isAdmin } = useAuth();
    if (currentView.type !== 'immersive') return null;

    // Updated switch to handle all ImmersiveScreenName cases
    switch (currentView.id) {
        case 'postDiscussion': return <PostDiscussionScreen />;
        case 'postTextOverlay': return <PostTextOverlayScreen />;
        case 'postDetails': return <PostDetailsScreen />;
        case 'bookDetails': return <BookDetailsScreen />;
        case 'authorDetails': return <AuthorDetailsScreen />;
        case 'quoteDetails': return <QuoteDetailsScreen />;
        case 'venueDetails': return <VenueDetailsScreen />;
        case 'editor': return <EditorScreen />;
        case 'reader': return <ReaderScreen />;
        case 'postComposer': return <PostComposerScreen />;
        case 'discoveryFlow': return <DiscoveryFlowScreen />;
        case 'profile': return <ProfileScreen />;
        case 'bookmarks': return <BookmarksScreen />;
        case 'quotes': return <QuotesScreen />;
        case 'authors': return <AuthorsScreen />;
        case 'venues': return <VenuesScreen />;
        case 'settings': return <SettingsScreen />;
        case 'feedback': return <FeedbackScreen />;
        case 'adminDashboard': return isAdmin ? <AdminDashboardScreen /> : <PageLoader />;
        case 'books': return <BooksScreen />;
        case 'notificationsFeed': return <NotificationsFeedScreen />;
        case 'shelfDetails': return <ShelfDetailsScreen />;
        case 'agentChat': return <AgentChatScreen />;
        case 'liveSearch': return <LiveSearchScreen />;
        case 'messengerList': return <MessengerListScreen />;
        case 'messengerChat': return <MessengerChatScreen />;
        case 'peopleFlow': return <PeopleFlowScreen />;
        case 'goodreadsImport': return <GoodreadsImportScreen />;
        case 'drafts': return <DraftsScreen />;
        case 'projectEdit': return <ProjectEditScreen />;
        case 'projectPublish': return <ProjectPublishScreen />;
        case 'projectPreview': return <ProjectPreviewScreen />;
        case 'projectPublished': return <ProjectPublishedScreen />;
        case 'email': return <EmailScreen />;
        case 'adminIntelligence': return isAdmin ? <AdminIntelligenceScreen /> : <PageLoader />;
        default: return <PageLoader />;
    }
};

const StackScreens: React.FC = () => {
    const { currentView } = useNavigation();
    if (currentView.type !== 'stack') return null;

    switch (currentView.id) {
        case 'discovery': return <DiscoveryStackScreen />;
        default: return <PageLoader />;
    }
};

const AppContent: React.FC = () => {
    const { user, isLoading: isAuthLoading, isGuest, isInitialized, isAdmin } = useAuth();
    const { currentView, navigate } = useNavigation();
    
    const [showSplash, setShowSplash] = useState(true);
    const [isFading, setIsFading] = useState(false);

    useEffect(() => {
        // Only start fading when auth is ready or has failed to load (to prevent stuck black screen)
        if (!isAuthLoading) {
            const timer = setTimeout(() => {
                setIsFading(true);
                setTimeout(() => setShowSplash(false), 800);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [isAuthLoading]);

    useEffect(() => {
        if (
            !isAuthLoading &&
            currentView.type === 'immersive' &&
            (currentView.id === 'adminDashboard' || currentView.id === 'adminIntelligence') &&
            !isGuest &&
            user &&
            !isAdmin
        ) {
            navigate({ type: 'tab', id: 'home' });
        }
    }, [currentView, isAdmin, isAuthLoading, isGuest, navigate, user]);

    if (showSplash) return <SplashScreen fading={isFading} />;
    
    // Auth loading screen (Standardized dark placeholder)
    if (isAuthLoading) return <div className="h-[100dvh] w-full flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
    
    // Block feature access until identity is confirmed and readiness gate is resolved
    if (user && !isInitialized) {
        return (
            <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-slate-900 text-white p-8">
                <LoadingSpinner />
                <p className="mt-4 text-slate-400 font-medium animate-pulse">Setting up your library...</p>
            </div>
        );
    }

    if (!user && !isGuest) return <LoginScreen />;

    const isSocialTabActive = currentView.type === 'tab' && currentView.id === 'social';
    const isImmersive = currentView.type === 'immersive' || currentView.type === 'stack';

    return (
        <div className={cn(
            "h-[100dvh] w-full selection:bg-accent selection:text-white relative overflow-hidden",
            isSocialTabActive ? "bg-black" : "bg-gray-50 dark:bg-slate-900"
        )}>
            <OfflineBanner />
            <EnvironmentIndicator />
            <Drawer />
            
            <div className="h-full w-full relative">
                <div className={cn(
                    "h-full w-full transition-transform duration-300",
                    isImmersive ? "scale-[0.98] blur-sm opacity-50" : "scale-100 blur-0 opacity-100"
                )}>
                    <TabScreens />
                </div>

                <div className={cn(
                    "absolute inset-0 z-50 pointer-events-none transition-opacity duration-300",
                    isImmersive ? "opacity-100 pointer-events-auto" : "opacity-0"
                )}>
                    <Suspense fallback={<PageLoader />}>
                        <StackScreens />
                        <ImmersiveScreens />
                    </Suspense>
                </div>
            </div>
            
            <AttachmentViewerOverlay />
        </div>
    );
};

const App: React.FC = () => {
    return (
        <GlobalErrorBoundary>
            {/* ✅ QueryClientProvider is now solely managed at the root in index.tsx */}
            <I18nProvider>
                <ThemeProvider>
                    <ReadingPreferencesProvider>
                        <NavigationProvider>
                            <AuthProvider>
                                <ToastProvider>
                                    <OfflineProvider>
                                        <AttachmentViewerProvider>
                                            <AppContent />
                                        </AttachmentViewerProvider>
                                    </OfflineProvider>
                                </ToastProvider>
                            </AuthProvider>
                        </NavigationProvider>
                    </ReadingPreferencesProvider>
                </ThemeProvider>
            </I18nProvider>
        </GlobalErrorBoundary>
    );
};

export default App;
