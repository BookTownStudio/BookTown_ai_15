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
import InteractionRail from '../../components/content/InteractionRail.tsx';
import ErrorState from '../../components/ui/ErrorState.tsx';
import EmptyState from '../../components/ui/EmptyState.tsx';
import { BasketIcon as FeedIcon } from '../../components/icons/BasketIcon.tsx';
import Button from '../../components/ui/Button.tsx';
import { Post } from '../../types/entities.ts';

// Simple text icon for the filters
const TextIcon = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <path d="M17 6.1H3"/><path d="M21 12.1H3"/><path d="M15.1 18.1H3"/>
    </svg>
);

const TAB_STORAGE_KEY = 'booktown_social_tab_v3';

const SocialScreen: React.FC = () => {
    const { lang } = useI18n();
    
    const [scope, setScope] = useState<SocialFeedScope>(() => {
        const stored = localStorage.getItem(TAB_STORAGE_KEY);
        if (stored === 'following' || stored === 'explore' || stored === 'books') {
            return stored as SocialFeedScope;
        }
        return 'explore';
    });

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
    
    const { navigate, currentView, resetTokens, scrollToPost, clearScrollToPost } = useNavigation();
    const mainContentRef = useRef<HTMLDivElement>(null);
    const isInitialMount = useRef(true);
    const [isMoreFiltersOpen, setMoreFiltersOpen] = useState(false);
    const moreFiltersRef = useRef<HTMLDivElement>(null);

    const [activePostId, setActivePostId] = useState<string | null>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery] = useDebounce(searchQuery, 300);
    const searchInputRef = useRef<HTMLInputElement>(null);
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
    const activePost = useMemo(() => posts.find(p => p.id === activePostId), [posts, activePostId]);

    useEffect(() => {
        if (!activePostId && posts.length > 0) {
            setActivePostId(posts[0].id);
        }
    }, [posts, activePostId]);

    useEffect(() => {
        if (observerRef.current) observerRef.current.disconnect();

        observerRef.current = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const id = entry.target.getAttribute('data-post-id');
                        if (id) setActivePostId(id);
                    }
                });
            },
            { threshold: 0.6 }
        );

        return () => observerRef.current?.disconnect();
    }, [posts]);

    const registerPostElement = useCallback((node: HTMLElement | null) => {
        if (node) observerRef.current?.observe(node);
    }, []);

    useEffect(() => {
        if (isSearchOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 100);
        }
    }, [isSearchOpen]);

    const handleCloseSearch = () => {
        setIsSearchOpen(false);
        setSearchQuery('');
    };

    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
        } else {
            if (resetTokens.social > 0) {
                mainContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                setScope('explore');
                localStorage.setItem(TAB_STORAGE_KEY, 'explore');
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
        localStorage.setItem(TAB_STORAGE_KEY, newScope);
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

    /**
     * handleOpenThread
     * Implementation of POST_DISCUSSION_NAVIGATION_V1 Contract.
     * TRIGGER: comment_icon click from InteractionRail.
     * MANDATORY_PARAMS: postId, prefetchedPost, from (current view).
     */
    const handleOpenThread = (post: Post) => {
        if (!post || !post.id) return;

        // NAVIGATION_CONTRACT ENFORCEMENT: 
        // 1. type: immersive
        // 2. id: postDiscussion
        // 3. from: must be current view for scroll restoration
        navigate({ 
            type: 'immersive', 
            id: 'postDiscussion', 
            params: { 
                postId: post.id, 
                prefetchedPost: post,
                from: currentView
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
            return <div className="h-screen w-full flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
        }

        if (isError) {
            return (
                <div className="h-screen w-full flex items-center justify-center bg-slate-900 p-8">
                    <ErrorState 
                        onRetry={() => refetch()} 
                        title={lang === 'en' ? "Feed Unavailable" : "التغذية غير متوفرة"}
                    />
                </div>
            );
        }
        
        if (posts.length === 0) {
             return (
                <div className="h-screen w-full flex flex-col items-center justify-center text-center p-8 bg-black">
                    <EmptyState 
                        icon={FeedIcon}
                        titleEn={scope === 'following' ? "No posts from follows" : "Quiet in the library"}
                        titleAr={scope === 'following' ? "لا توجد منشورات ممن تتابعهم" : "هدوء في المكتبة"}
                        messageEn={scope === 'following' ? "Try following some more authors to fill your feed!" : "We couldn't find any posts matching your current filters."}
                        messageAr={scope === 'following' ? "جرب متابعة المزيد من المؤلفين لملء التغذية الخاصة بك!" : "لم نتمكن من العثور على أي منشورات تطابق الفلاتر الحالية."}
                    />
                </div>
            );
        }

        return (
            <>
                {posts.map((post, index) => {
                    const isLastElement = posts.length === index + 1;
                    return (
                        <div 
                            ref={(node) => {
                                registerPostElement(node);
                                if (isLastElement) lastPostElementRef(node);
                            }} 
                            key={post.id} 
                            id={`post-${post.id}`} 
                            data-post-id={post.id}
                            className="h-screen w-full flex-shrink-0 snap-start"
                        >
                            <PostCard 
                                post={post} 
                                viewMode="flow" 
                                onOpenDiscussion={() => handleOpenThread(post)}
                            />
                        </div>
                    );
                })}
            </>
        );
    }

    const renderSearchResults = () => {
        const hasResults =
            searchResults.users.length > 0 ||
            searchResults.topics.length > 0 ||
            searchResults.posts.length > 0;

        return (
            <div className="fixed inset-0 top-24 z-20 bg-black/80 backdrop-blur-xl overflow-y-auto animate-fade-in">
                <div className="container mx-auto max-w-md px-4 py-4 space-y-6 pb-24">
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
                            <div className="space-y-4">
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
            <header className="fixed top-0 left-0 right-0 z-30 backdrop-blur-md transition-all duration-300">
                <div className="container mx-auto flex h-24 items-end justify-center px-4 pb-4 relative">
                    {isSearchOpen ? (
                        <div className="w-full max-w-md flex items-center gap-3 animate-fade-in-up">
                            <div className="flex-grow relative group">
                                <input 
                                    ref={searchInputRef}
                                    type="text" 
                                    className="w-full bg-white/10 border border-white/20 rounded-2xl py-2.5 pl-11 pr-12 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-accent focus:bg-white/20 transition-all backdrop-blur-md"
                                    placeholder={lang === 'en' ? "Search..." : "بحث..."}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-white/50 group-focus-within:text-accent transition-colors" />
                                <button 
                                    onClick={handleCloseSearch} 
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                                >
                                    <XCircleIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3 animate-fade-in-up w-full">
                            <div className="flex items-center gap-3 mt-8">
                                <button 
                                    onClick={() => setIsSearchOpen(true)}
                                    className="p-2.5 rounded-full bg-white/10 text-white/70 hover:text-white hover:bg-white/20 transition-all backdrop-blur-md border border-white/10 active:scale-95"
                                >
                                    <SearchIcon className="h-5 w-5" />
                                </button>

                                <div ref={moreFiltersRef} className="relative bg-white/10 p-1 rounded-full flex items-center space-x-1 backdrop-blur-md" role="tablist">
                                    {TABS.map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => handleScopeChange(tab.id)}
                                            className={cn(
                                                "whitespace-nowrap rounded-full py-2 px-5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-accent",
                                                scope === tab.id
                                                    ? 'bg-white text-slate-900 shadow'
                                                    : 'text-white/70 hover:bg-white/20 hover:text-white'
                                            )}
                                            role="tab"
                                            aria-selected={scope === tab.id}
                                        >
                                            {lang === 'en' ? tab.en : tab.ar}
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setMoreFiltersOpen(prev => !prev)}
                                        className={cn(
                                            "rounded-full p-2 text-sm font-medium transition-colors relative",
                                            filters.length > 0
                                                ? 'bg-accent/20 text-accent ring-1 ring-accent/30'
                                                : 'text-white/70 hover:bg-white/20 hover:text-white'
                                        )}
                                    >
                                        <VerticalEllipsisIcon className="h-5 w-5" />
                                        {filters.length > 0 && (
                                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-accent rounded-full animate-pulse shadow-sm" />
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
                        </div>
                    )}
                </div>
            </header>

            {isSearchOpen && renderSearchResults()}

            {!isSearchOpen && (
                <InteractionRail 
                    post={activePost || null} 
                    onOpenDiscussion={() => activePost && handleOpenThread(activePost)} 
                    onNewPost={handleNewPost}
                />
            )}

            <div 
                ref={mainContentRef} 
                className={cn(
                    "h-screen w-full bg-black overflow-y-scroll snap-y snap-mandatory scrollbar-hide transition-opacity duration-300",
                    isSearchOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
                )}
            >
                {renderFeedContent()}
                {isFetchingNextPage && (
                    <div className="h-screen w-full flex-shrink-0 snap-start flex items-center justify-center">
                        <LoadingSpinner />
                    </div>
                )}
            </div>

            <style>{`
                .snap-y { scroll-snap-type: y; }
                .snap-mandatory { scroll-snap-stop: always; scroll-snap-type: y mandatory; }
                .snap-start { scroll-snap-align: start; }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </>
    );
};

export default SocialScreen;
