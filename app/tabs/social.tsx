import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { useSocialFeeds, SocialFeedScope, SocialFeedFilter } from '../../lib/hooks/useSocialFeeds.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import PostCard from '../../components/content/PostCard.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { cn } from '../../lib/utils.ts';
import { VerticalEllipsisIcon } from '../../components/icons/VerticalEllipsisIcon.tsx';
import GlassCard from '../../components/ui/GlassCard.tsx';
import { MediaIcon } from '../../components/icons/MediaIcon.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { QuoteIcon } from '../../components/icons/QuoteIcon.tsx';
import { WriteIcon as ProjectIcon } from '../../components/icons/WriteIcon.tsx';
import { SearchIcon } from '../../components/icons/SearchIcon.tsx';
import { XCircleIcon } from '../../components/icons/XCircleIcon.tsx';
import { useSocialSearch } from '../../lib/hooks/useSocialSearch.ts';
import { useAuth } from '../../lib/auth.tsx';
import UserSearchResultCard from '../../components/content/UserSearchResultCard.tsx';
import TopicSearchResultCard from '../../components/content/TopicSearchResultCard.tsx';
import { useDebounce } from 'use-debounce';
import ErrorState from '../../components/ui/ErrorState.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import { BasketIcon as FeedIcon } from '../../components/icons/BasketIcon.tsx';
import Button from '../../components/ui/Button.tsx';
import { Post } from '../../types/entities.ts';
import { PlusIcon } from '../../components/icons/PlusIcon.tsx';

// Simple text icon for the filters
const TextIcon = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18.1H3"/>
    </svg>
);

const MAX_SOCIAL_ENTRY_FETCH_ATTEMPTS = 2;

const SocialScreen: React.FC = () => {
    const { lang } = useI18n();
    const socialRailClassName = 'app-rail social-rail--v23';
    const socialShellClassName = `${socialRailClassName} social-feed-shell`;

    const [scope, setScope] = useState<SocialFeedScope>('explore');

    const [filters, setFilters] = useState<SocialFeedFilter[]>([]);
    
    const { 
        data, 
        isLoading, 
        isError,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        refetch
    } = useSocialFeeds(scope, filters);
    
    const {
        navigate,
        currentView,
        resetTokens,
        scrollToPost,
        clearScrollToPost,
        socialPostEntry,
        clearSocialPostEntry,
    } = useNavigation();
    const mainContentRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);
    const [isMoreFiltersOpen, setMoreFiltersOpen] = useState(false);
    const moreFiltersRef = useRef<HTMLDivElement>(null);
    const [isTopBarVisible, setTopBarVisible] = useState(true);
    const topBarRevealTimerRef = useRef<number | null>(null);
    const topBarLastScrollTopRef = useRef(0);
    const topBarDownDeltaRef = useRef(0);

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery] = useDebounce(searchQuery, 300);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const socialEntryAttemptRef = useRef<{ entryId: number; fetchAttempts: number; discussionOpened: boolean; fallbackTriggered: boolean }>({
        entryId: 0,
        fetchAttempts: 0,
        discussionOpened: false,
        fallbackTriggered: false,
    });
    const { user } = useAuth();

    const {
        results: searchResults,
        isLoading: isSearching,
        isError: isSearchError,
        fetchNextPage: fetchNextSearchPage,
        hasNextPage: hasMoreSearch,
        isFetchingNextPage: isFetchingMoreSearch,
        refetch: refetchSearch
    } = useSocialSearch(debouncedQuery);

    const posts = useMemo(() => data?.pages.flatMap(page => (page as any).posts) ?? [], [data]);
    const socialAnchorPostId = useMemo(() => {
        if (currentView.type !== 'tab' || currentView.id !== 'social') return '';
        return typeof currentView.params?.anchorPostId === 'string'
            ? currentView.params.anchorPostId.trim()
            : '';
    }, [currentView]);

    useEffect(() => {
        if (isSearchOpen) {
            setTopBarVisible(true);
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isSearchOpen]);

    const handleCloseSearch = () => {
        setIsSearchOpen(false);
        setSearchQuery('');
    };

    useEffect(() => {
        if (!socialPostEntry) {
            socialEntryAttemptRef.current = {
                entryId: 0,
                fetchAttempts: 0,
                discussionOpened: false,
                fallbackTriggered: false,
            };
            return;
        }

        socialEntryAttemptRef.current = {
            entryId: socialPostEntry.entryId,
            fetchAttempts: 0,
            discussionOpened: false,
            fallbackTriggered: false,
        };
    }, [socialPostEntry]);

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
        } else {
            if (resetTokens.social > 0) {
                mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                setScope('explore');
                setFilters([]);
                setMoreFiltersOpen(false);
                handleCloseSearch();
            }
        }
    }, [resetTokens.social]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (moreFiltersRef.current && !moreFiltersRef.current.contains(event.target as Node)) {
                setMoreFiltersOpen(false);
            }
        };
        if (isMoreFiltersOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMoreFiltersOpen]);

    useEffect(() => {
        const scroller = mainContentRef.current;
        if (!scroller || isSearchOpen) {
            setTopBarVisible(true);
            return;
        }

        topBarLastScrollTopRef.current = scroller.scrollTop;

        const scheduleReveal = () => {
            if (topBarRevealTimerRef.current) {
                window.clearTimeout(topBarRevealTimerRef.current);
            }
            topBarRevealTimerRef.current = window.setTimeout(() => {
                topBarDownDeltaRef.current = 0;
                setTopBarVisible(true);
            }, 220);
        };

        const handleScroll = () => {
            const currentTop = Math.max(0, scroller.scrollTop);
            const delta = currentTop - topBarLastScrollTopRef.current;

            if (currentTop <= 16) {
                topBarDownDeltaRef.current = 0;
                setTopBarVisible(true);
                topBarLastScrollTopRef.current = currentTop;
                scheduleReveal();
                return;
            }

            if (Math.abs(delta) < 3) {
                scheduleReveal();
                return;
            }

            if (delta > 0) {
                topBarDownDeltaRef.current += delta;
                if (topBarDownDeltaRef.current >= 42) {
                    setTopBarVisible(false);
                    topBarDownDeltaRef.current = 0;
                }
            } else {
                topBarDownDeltaRef.current = 0;
                setTopBarVisible(true);
            }

            topBarLastScrollTopRef.current = currentTop;
            scheduleReveal();
        };

        scroller.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            scroller.removeEventListener('scroll', handleScroll);
            if (topBarRevealTimerRef.current) {
                window.clearTimeout(topBarRevealTimerRef.current);
                topBarRevealTimerRef.current = null;
            }
        };
    }, [isSearchOpen]);

    useEffect(() => {
        if (currentView.type !== 'tab' || currentView.id !== 'social' || !socialPostEntry) {
            return;
        }

        if (socialPostEntry.preferredScope && scope !== socialPostEntry.preferredScope) {
            setScope(socialPostEntry.preferredScope);
        }
        if (filters.length > 0) {
            setFilters([]);
        }
        if (isSearchOpen) {
            handleCloseSearch();
        }
    }, [currentView, socialPostEntry, scope, filters.length, isSearchOpen]);

    useEffect(() => {
        if (scrollToPost && mainContentRef.current && !isLoading && !isSearchOpen) {
            setTimeout(() => {
                const el = document.getElementById(`post-${scrollToPost}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    el.classList.add('flash-highlight');
                    setTimeout(() => {
                        el.classList.remove('flash-highlight');
                    }, 800);
                }
                clearScrollToPost();
            }, 100);
        }
    }, [scrollToPost, clearScrollToPost, data, isLoading, isSearchOpen]);

    useEffect(() => {
        if (currentView.type !== 'tab' || currentView.id !== 'social' || !socialPostEntry) {
            return;
        }
        if (isSearchOpen || isLoading || isFetchingNextPage) {
            return;
        }
        if (socialPostEntry.preferredScope && scope !== socialPostEntry.preferredScope) {
            return;
        }
        if (filters.length > 0) {
            return;
        }

        const targetPostId = socialPostEntry.postId.trim();
        if (!targetPostId) {
            clearSocialPostEntry();
            return;
        }

        const entryTracker = socialEntryAttemptRef.current;
        const returnView = {
            type: 'tab' as const,
            id: 'social' as const,
            params: {
                highlightPostId: targetPostId,
                anchorPostId: targetPostId,
                ...(socialPostEntry.preferredScope ? { preferredScope: socialPostEntry.preferredScope } : {}),
            },
        };
        const targetElement = document.getElementById(`post-${targetPostId}`);

        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            targetElement.classList.add('flash-highlight');
            window.setTimeout(() => {
                targetElement.classList.remove('flash-highlight');
            }, 800);

            if (socialPostEntry.openDiscussion && !entryTracker.discussionOpened) {
                entryTracker.discussionOpened = true;
                clearSocialPostEntry();
                navigate({
                    type: 'immersive',
                    id: 'postDiscussion',
                    params: {
                        postId: targetPostId,
                        from: returnView,
                    },
                });
                return;
            }

            clearSocialPostEntry();
            return;
        }

        if (hasNextPage && entryTracker.fetchAttempts < MAX_SOCIAL_ENTRY_FETCH_ATTEMPTS) {
            entryTracker.fetchAttempts += 1;
            void fetchNextPage();
            return;
        }

        if (socialPostEntry.fallbackToStandalone && !entryTracker.fallbackTriggered) {
            entryTracker.fallbackTriggered = true;
            console.warn('[SOCIAL][ENTRY_FALLBACK_TO_POST_DISCUSSION]', {
                postId: targetPostId,
                preferredScope: socialPostEntry.preferredScope ?? null,
                anchorPostId: socialAnchorPostId || null,
            });
            clearSocialPostEntry();
            navigate({
                type: 'immersive',
                id: 'postDiscussion',
                params: {
                    postId: targetPostId,
                    from: returnView,
                },
            });
            return;
        }

        clearSocialPostEntry();
    }, [
        currentView,
        socialPostEntry,
        isSearchOpen,
        isLoading,
        isFetchingNextPage,
        scope,
        filters.length,
        hasNextPage,
        fetchNextPage,
        clearSocialPostEntry,
        navigate,
        socialAnchorPostId,
    ]);

    const lastPostObserver = useRef<IntersectionObserver | null>(null);
    const lastPostElementRef = useCallback(node => {
        if (isLoading || isFetchingNextPage || isSearchOpen) return;
        if (lastPostObserver.current) lastPostObserver.current.disconnect();
        
        lastPostObserver.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasNextPage) {
                fetchNextPage();
            }
        });

        if (node) lastPostObserver.current.observe(node);
    }, [isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isSearchOpen]);

    const handleNewPost = () => {
        navigate({ type: 'immersive', id: 'postComposer', params: { from: currentView } });
    };

    const handleScopeChange = (newScope: SocialFeedScope) => {
        setScope(newScope);
        mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleFilterToggle = (filter: SocialFeedFilter) => {
        setFilters(prev => {
            const isSelected = prev.includes(filter);
            return isSelected ? prev.filter(f => f !== filter) : [...prev, filter];
        });
        setMoreFiltersOpen(false);
        mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleOpenThread = (post: Post) => {
        if (!post || !post.id) return;
        navigate({ 
            type: 'immersive', 
            id: 'postDiscussion', 
            params: { 
                postId: post.id, 
                from: {
                    type: 'tab',
                    id: 'social',
                    params: {
                        highlightPostId: post.id,
                        anchorPostId: post.id,
                        preferredScope: scope,
                    },
                }
            } 
        });
    };

    const TABS: { id: SocialFeedScope; en: string; ar: string }[] = [
        { id: 'following', en: 'Following', ar: 'متابعة' },
        { id: 'explore', en: 'Explore', ar: 'استكشف' },
        { id: 'books', en: 'Books', ar: 'الكتب' },
    ];
    
    const SECONDARY_FILTERS: { id: SocialFeedFilter; en: string; ar: string; icon: React.FC<any> }[] = [
        { id: 'media', en: 'Media', ar: 'وسائط', icon: MediaIcon },
        { id: 'text', en: 'Text', ar: 'نص', icon: TextIcon },
        { id: 'book', en: 'Books', ar: 'كتب', icon: BookIcon },
        { id: 'quote', en: 'Quotes', ar: 'اقتباسات', icon: QuoteIcon },
        { id: 'project', en: 'Projects', ar: 'مشاريع', icon: ProjectIcon },
    ];

    const renderFeedContent = () => {
        if (isLoading && posts.length === 0) {
            return <div className="h-[100dvh] w-full flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
        }

        if (isError) {
            return (
                <div className={cn(socialRailClassName, "min-h-[70dvh] flex items-start justify-center pt-24 text-center")}>
                    <div className="w-full max-w-xl">
                        <ErrorState 
                            onRetry={() => refetch()} 
                            title={lang === 'en' ? "Feed Unavailable" : "التغذية غير متوفرة"}
                        />
                    </div>
                </div>
            );
        }
        
        if (posts.length === 0) {
             return (
                <div className={cn(socialRailClassName, "min-h-[70dvh] flex flex-col items-center justify-start text-center pt-24")}>
                    <div className="w-full max-w-xl">
                        <EmptyState 
                            icon={FeedIcon}
                            titleEn={scope === 'following' ? "No posts from follows" : "Quiet in the library"}
                            titleAr={scope === 'following' ? "لا توجد منشورات ممن تتابعهم" : "هدوء في المكتبة"}
                            messageEn={scope === 'following' ? "Try following some more authors to fill your feed!" : "We couldn't find any posts matching your current filters."}
                            messageAr={scope === 'following' ? "جرب متابعة المزيد من المؤلفين لملء التغذية الخاصة بك!" : "لم نتمكن من العثور على أي منشورات تطابق الفلاتر الحالية."}
                        />
                    </div>
                </div>
            );
        }

        return (
            <div className={cn(socialShellClassName, "divide-y divide-white/[0.04]")}>
                {posts.map((post, index) => {
                    const isLastElement = posts.length === index + 1;
                    return (
                        <div 
                            ref={(node) => {
                                if (isLastElement) lastPostElementRef(node);
                            }} 
                            key={post.id} 
                            id={`post-${post.id}`} 
                            data-post-id={post.id}
                            className="w-full"
                        >
                            <PostCard 
                                post={post} 
                                viewMode="list" 
                                onOpenDiscussion={() => handleOpenThread(post)}
                            />
                        </div>
                    );
                })}
            </div>
        );
    }

    const renderSearchResults = () => {
        const hasResults =
            searchResults.users.length > 0 ||
            searchResults.topics.length > 0 ||
            searchResults.posts.length > 0;

        return (
            <div className="fixed inset-0 top-[calc(env(safe-area-inset-top)+3.25rem)] z-20 bg-black/80 backdrop-blur-xl overflow-y-auto animate-fade-in">
                <div
                    className="mx-auto w-full max-w-[42rem] px-4 py-4 space-y-6 pb-24"
                    style={{
                        paddingLeft: 'max(14px, env(safe-area-inset-left))',
                        paddingRight: 'max(14px, env(safe-area-inset-right))'
                    }}
                >
                    {isSearching && <div className="flex justify-center py-8"><LoadingSpinner /></div>}

                    {!user && debouncedQuery && (
                        <div className="text-center py-10 text-white/70">
                            <BilingualText>{lang === 'en' ? 'Sign in to search people and content.' : 'سجّل الدخول للبحث عن الأشخاص والمحتوى.'}</BilingualText>
                        </div>
                    )}

                    {isSearchError && user && (
                        <div className="py-8">
                            <ErrorState
                                onRetry={() => refetchSearch()}
                                title={lang === 'en' ? "Search Unavailable" : "البحث غير متوفر"}
                            />
                        </div>
                    )}
                    
                    {!isSearching && !isSearchError && user && !hasResults && debouncedQuery && (
                        <div className="text-center py-16 text-white/60">
                            <BilingualText>No results found.</BilingualText>
                        </div>
                    )}

                    {searchResults.users.length > 0 && (
                        <div>
                            <BilingualText role="Caption" className="uppercase tracking-wider text-accent mb-2 px-2">
                                {lang === 'en' ? 'People' : 'أشخاص'}
                            </BilingualText>
                            <div className="bg-slate-800/50 rounded-xl border border-white/10 overflow-hidden">
                                {searchResults.users.map(user => (
                                    <UserSearchResultCard key={user.uid} user={user} />
                                ))}
                            </div>
                        </div>
                    )}

                    {searchResults.topics.length > 0 && (
                        <div>
                            <BilingualText role="Caption" className="uppercase tracking-wider text-accent mb-2 px-2">
                                {lang === 'en' ? 'Topics' : 'مواضيع'}
                            </BilingualText>
                            <div className="bg-slate-800/50 rounded-xl border border-white/10 overflow-hidden">
                                {searchResults.topics.map(topic => (
                                    <TopicSearchResultCard key={topic.topic} topic={topic} />
                                ))}
                            </div>
                        </div>
                    )}

                    {searchResults.posts.length > 0 && (
                        <div>
                            <BilingualText role="Caption" className="uppercase tracking-wider text-accent mb-2 px-2">
                                {lang === 'en' ? 'Posts' : 'منشورات'}
                            </BilingualText>
                                    <div className="space-y-6">
                                        {searchResults.posts.map(post => (
                                            <PostCard 
                                                key={post.id} 
                                        post={post} 
                                        viewMode="list" 
                                        onOpenDiscussion={() => handleOpenThread(post)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {!isSearchError && hasMoreSearch && (
                        <div className="pt-2">
                            <Button
                                onClick={() => fetchNextSearchPage()}
                                disabled={isFetchingMoreSearch}
                                variant="ghost"
                                className="w-full !border !border-white/20 !text-white/90"
                            >
                                {isFetchingMoreSearch
                                    ? (lang === 'en' ? 'Loading...' : 'جاري التحميل...')
                                    : (lang === 'en' ? 'Load more results' : 'تحميل نتائج إضافية')}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            <header
                className={cn(
                    "fixed top-0 left-0 right-0 z-30 pt-[max(2px,env(safe-area-inset-top))] transition-[opacity,transform] duration-500 ease-out",
                    (isTopBarVisible || isSearchOpen)
                        ? "translate-y-0 opacity-100"
                        : "-translate-y-3 pointer-events-none opacity-0"
                )}
            >
                <div className={socialShellClassName}>
                    <div
                        className="w-full flex h-14 items-center justify-center relative"
                        style={{
                            paddingLeft: 'max(12px, env(safe-area-inset-left))',
                            paddingRight: 'max(12px, env(safe-area-inset-right))'
                        }}
                    >
                        {isSearchOpen ? (
                            <div className="w-full max-w-[42rem] flex items-center gap-2 animate-fade-in-up">
                                <div className="flex-grow relative group">
                                    <input 
                                        ref={searchInputRef}
                                        type="text" 
                                        className="w-full bg-white/10 border border-white/15 rounded-2xl py-2 pl-10 pr-11 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-accent focus:bg-white/20 transition-all backdrop-blur-md"
                                        placeholder={lang === 'en' ? "Search..." : "بحث..."}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-white/50 group-focus-within:text-accent transition-colors" />
                                    <button 
                                        onClick={handleCloseSearch} 
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                                    >
                                        <XCircleIcon className="h-4.5 w-4.5" />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center animate-fade-in-up w-full">
                                <div
                                    ref={moreFiltersRef}
                                    className="relative inline-flex max-w-full items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.06] px-1.5 py-1 backdrop-blur-sm md:bg-white/[0.07]"
                                    role="tablist"
                                >
                                    <button
                                        onClick={() => setIsSearchOpen(true)}
                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/56 transition-all hover:bg-white/[0.12] hover:text-white/80 active:scale-95"
                                        aria-label={lang === 'en' ? 'Search' : 'بحث'}
                                    >
                                        <SearchIcon className="h-3.5 w-3.5" />
                                    </button>

                                    <div className="h-4.5 w-px shrink-0 bg-white/[0.08]" aria-hidden="true" />

                                    <div className="flex items-center gap-1">
                                        {TABS.map(tab => (
                                            <button
                                                key={tab.id}
                                                onClick={() => handleScopeChange(tab.id)}
                                                className={cn(
                                                    "whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent md:px-4 md:py-1.5 md:text-[12px]",
                                                    scope === tab.id
                                                        ? 'bg-white text-slate-900 shadow'
                                                        : 'text-white/68 hover:bg-white/[0.14] hover:text-white'
                                                )}
                                                role="tab"
                                                aria-selected={scope === tab.id}
                                            >
                                                {lang === 'en' ? tab.en : tab.ar}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="h-4.5 w-px shrink-0 bg-white/[0.08]" aria-hidden="true" />

                                    <button
                                        onClick={() => setMoreFiltersOpen(prev => !prev)}
                                        className={cn(
                                            "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/62 transition-colors",
                                            filters.length > 0
                                                ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                                : 'hover:bg-white/[0.12] hover:text-white/82'
                                        )}
                                        aria-label={lang === 'en' ? 'More filters' : 'المزيد من الفلاتر'}
                                    >
                                        <VerticalEllipsisIcon className="h-3.5 w-3.5" />
                                        {filters.length > 0 && (
                                            <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent shadow-sm" />
                                        )}
                                    </button>

                                    {isMoreFiltersOpen && (
                                         <div className="absolute top-full right-0 mt-2 z-10 w-48">
                                            <GlassCard className="!p-2 !bg-slate-800 shadow-xl">
                                                <ul className="space-y-1">
                                                    {SECONDARY_FILTERS.map(filter => (
                                                        <li key={filter.id}>
                                                            <button 
                                                                onClick={() => handleFilterToggle(filter.id)} 
                                                                className={cn(
                                                                    "w-full text-left flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors",
                                                                    filters.includes(filter.id) ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10'
                                                                )}
                                                            >
                                                                <filter.icon className="h-5 w-5" />
                                                                {lang === 'en' ? filter.en : filter.ar}
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </GlassCard>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {isSearchOpen && renderSearchResults()}

            <div 
                ref={mainContentRef} 
                className={cn(
                    "social-desktop-canvas h-[100dvh] w-full bg-gradient-to-b from-[#04070d] via-[#050a12] to-black overflow-y-auto overflow-x-hidden overscroll-y-contain transition-opacity duration-300",
                    isSearchOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
                )}
                style={{
                    ['--social-top-chrome-offset' as any]: 'calc(env(safe-area-inset-top) + 64px)',
                    scrollPaddingTop: 'calc(var(--social-top-chrome-offset) + 10px)',
                    scrollPaddingBottom: 'calc(var(--bottom-nav-height, 66px) + 14px)'
                }}
            >
                <div className="px-0 pb-[calc(var(--bottom-nav-height,66px)+28px)] pt-[calc(var(--social-top-chrome-offset)+18px)]">
                    {renderFeedContent()}
                </div>
                {isFetchingNextPage && (
                    <div className="flex items-center justify-center py-10">
                        <LoadingSpinner />
                    </div>
                )}
            </div>

            <div
                className={cn(
                    "pointer-events-none fixed bottom-[calc(var(--bottom-nav-height,66px)+18px)] left-0 right-0 z-[26] transition-all duration-200",
                    isSearchOpen ? "opacity-0" : "opacity-100"
                )}
            >
                <div className="app-frame__inner">
                    <div className="app-rail social-rail--v23 flex justify-end px-0">
                        <button
                            type="button"
                            onClick={handleNewPost}
                            aria-label={lang === 'en' ? 'Write' : 'اكتب'}
                            className="pointer-events-auto inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#7cc8ff]/[0.32] bg-[#1d9bf0] text-white shadow-[0_10px_24px_rgba(8,53,92,0.28)] backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#1a8cd8] hover:text-white active:translate-y-0"
                        >
                            <PlusIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default SocialScreen;
