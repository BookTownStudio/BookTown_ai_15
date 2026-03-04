import React, { createContext, useState, useContext, useMemo, ReactNode, useCallback, useEffect } from 'react';
import { View, TabName, NavigationParams } from '../types/navigation.ts';

const initialResetTokens: Record<TabName, number> = {
    home: 0,
    read: 0,
    discover: 0,
    write: 0,
    social: 0,
};

export interface NavigationOptions {
    replace?: boolean;
}

interface NavigationContextType {
    currentView: View;
    navigate: (view: View, options?: NavigationOptions) => void;
    isDrawerOpen: boolean;
    openDrawer: () => void;
    closeDrawer: () => void;
    setActiveTab: (tab: TabName) => void;
    resetTab: (tab: TabName) => void;
    resetTokens: Record<TabName, number>;
    scrollToPost: string | null;
    navigateToSocialAndHighlight: (postId: string) => void;
    clearScrollToPost: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

interface NavigationProviderProps {
    children: ReactNode;
}

const decodePathSegment = (value: string): string => {
    try {
        return decodeURIComponent(value || '').trim();
    } catch {
        return (value || '').trim();
    }
};

function resolveViewFromPath(pathname: string): View {
    const normalizedPath = (pathname || '/').replace(/\/+$/, '') || '/';
    const segments = normalizedPath.split('/').filter(Boolean);

    if (segments.length >= 1 && segments[0] === 'admin') {
        if (segments.length >= 2 && segments[1] === 'intelligence') {
            return {
                type: 'immersive',
                id: 'adminIntelligence',
            };
        }
        return {
            type: 'immersive',
            id: 'adminDashboard',
        };
    }

    if (segments.length >= 2 && segments[0] === 'shelf') {
        const shelfId = decodePathSegment(segments[1]);
        if (shelfId.length > 0) {
            return {
                type: 'immersive',
                id: 'shelfDetails',
                params: { shelfId },
            };
        }
    }

    if (segments.length >= 2 && segments[0] === 'post') {
        const postId = decodePathSegment(segments[1]);
        if (postId.length > 0) {
            return {
                type: 'immersive',
                id: 'postDiscussion',
                params: { postId },
            };
        }
    }

    return { type: 'tab', id: 'home' };
}

function resolvePathFromView(view: View): string | null {
    if (view.type === 'immersive' && view.id === 'adminDashboard') {
        return '/admin';
    }

    if (view.type === 'immersive' && view.id === 'adminIntelligence') {
        return '/admin/intelligence';
    }

    if (view.type === 'immersive' && view.id === 'shelfDetails') {
        const shelfId =
            typeof view.params?.shelfId === 'string' ? view.params.shelfId.trim() : '';
        return shelfId ? `/shelf/${encodeURIComponent(shelfId)}` : '/';
    }

    if (view.type === 'immersive' && view.id === 'postDiscussion') {
        const postId =
            typeof view.params?.postId === 'string' ? view.params.postId.trim() : '';
        return postId ? `/post/${encodeURIComponent(postId)}` : '/';
    }

    return null;
}

function isRouteBackedPath(pathname: string): boolean {
    const normalizedPath = (pathname || '/').replace(/\/+$/, '') || '/';
    return normalizedPath.startsWith('/post/')
        || normalizedPath.startsWith('/shelf/')
        || normalizedPath === '/admin'
        || normalizedPath.startsWith('/admin/');
}

function sanitizeViewForHistory(view: View): View {
    if (view.type === 'tab') {
        const highlightPostId =
            typeof view.params?.highlightPostId === 'string'
                ? view.params.highlightPostId.trim()
                : '';
        return highlightPostId
            ? { type: 'tab', id: view.id, params: { highlightPostId } }
            : { type: 'tab', id: view.id };
    }

    if (view.type === 'immersive') {
        if (view.id === 'postDiscussion') {
            const postId =
                typeof view.params?.postId === 'string' ? view.params.postId.trim() : '';
            return postId
                ? { type: 'immersive', id: 'postDiscussion', params: { postId } }
                : { type: 'tab', id: 'home' };
        }

        if (view.id === 'shelfDetails') {
            const shelfId =
                typeof view.params?.shelfId === 'string' ? view.params.shelfId.trim() : '';
            return shelfId
                ? { type: 'immersive', id: 'shelfDetails', params: { shelfId } }
                : { type: 'tab', id: 'home' };
        }

        return { type: 'immersive', id: view.id };
    }

    if (view.type === 'drawer') {
        return { type: 'drawer', id: view.id };
    }

    if (view.type === 'stack') {
        return { type: 'stack', id: view.id };
    }

    return { type: 'tab', id: 'home' };
}

function readHistoryViewState(state: unknown): View | null {
    if (!state || typeof state !== 'object') return null;
    const candidate = (state as { view?: unknown }).view;
    if (!candidate || typeof candidate !== 'object') return null;

    const maybeView = candidate as { type?: string };
    if (
        maybeView.type !== 'tab' &&
        maybeView.type !== 'immersive' &&
        maybeView.type !== 'drawer' &&
        maybeView.type !== 'stack'
    ) {
        return null;
    }

    try {
        return sanitizeViewForHistory(candidate as View);
    } catch {
        return null;
    }
}

function resolveInitialViewFromPath(): View {
    if (typeof window === 'undefined') {
        return { type: 'tab', id: 'home' };
    }
    return resolveViewFromPath(window.location.pathname || '/');
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
    const [currentView, setCurrentView] = useState<View>(() => resolveInitialViewFromPath());
    const [isDrawerOpen, setDrawerOpen] = useState(false);
    const [resetTokens, setResetTokens] = useState(initialResetTokens);
    const [scrollToPost, setScrollToPost] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const bootView =
            readHistoryViewState(window.history.state) ||
            resolveViewFromPath(window.location.pathname || '/');
        setCurrentView(bootView);
        window.history.replaceState(
            { view: sanitizeViewForHistory(bootView) },
            '',
            window.location.pathname + window.location.search + window.location.hash
        );

        const onPopState = (event: PopStateEvent) => {
            const fromState =
                readHistoryViewState(event.state) ||
                resolveViewFromPath(window.location.pathname || '/');
            setCurrentView(fromState);
            setDrawerOpen(false);
            if (
                fromState.type === 'tab' &&
                fromState.id === 'social' &&
                typeof fromState.params?.highlightPostId === 'string' &&
                fromState.params.highlightPostId.trim().length > 0
            ) {
                setScrollToPost(fromState.params.highlightPostId.trim());
            }
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    const navigate = useCallback((view: View, options?: NavigationOptions) => {
        if (typeof window !== 'undefined') {
            const nextPath = resolvePathFromView(view);
            const currentPath = window.location.pathname || '/';
            const shouldResetToRoot = !nextPath && isRouteBackedPath(currentPath);

            if (nextPath || shouldResetToRoot) {
                const currentUrl = currentPath + window.location.search + window.location.hash;
                const serializedCurrent = sanitizeViewForHistory(currentView);
                const serializedNext = sanitizeViewForHistory(view);
                const finalPath = nextPath || '/';

                window.history.replaceState({ view: serializedCurrent }, '', currentUrl);
                if (options?.replace) {
                    window.history.replaceState({ view: serializedNext }, '', finalPath);
                } else {
                    window.history.pushState({ view: serializedNext }, '', finalPath);
                }
            }
        }

        setCurrentView(view);
        setDrawerOpen(false);

        if (
            view.type === 'tab' &&
            view.id === 'social' &&
            typeof view.params?.highlightPostId === 'string' &&
            view.params.highlightPostId.trim().length > 0
        ) {
            setScrollToPost(view.params.highlightPostId.trim());
        }
    }, [currentView]);

    const openDrawer = useCallback(() => setDrawerOpen(true), []);
    const closeDrawer = useCallback(() => setDrawerOpen(false), []);
    
    const setActiveTab = useCallback((tab: TabName) => {
        setCurrentView({ type: 'tab', id: tab });
    }, []);

    const resetTab = useCallback((tab: TabName) => {
        setResetTokens(prev => ({ ...prev, [tab]: prev[tab] + 1 }));
    }, []);

    const navigateToSocialAndHighlight = useCallback((postId: string) => {
        const normalizedPostId = typeof postId === 'string' ? postId.trim() : '';
        if (!normalizedPostId) return;
        setScrollToPost(normalizedPostId);
        navigate(
            {
                type: 'tab',
                id: 'social',
                params: { highlightPostId: normalizedPostId } as NavigationParams,
            },
            { replace: true }
        );
    }, [navigate]);

    const clearScrollToPost = useCallback(() => {
        setScrollToPost(null);
    }, []);

    const value = useMemo(() => ({
        currentView,
        navigate,
        isDrawerOpen,
        openDrawer,
        closeDrawer,
        setActiveTab,
        resetTab,
        resetTokens,
        scrollToPost,
        navigateToSocialAndHighlight,
        clearScrollToPost,
    }), [currentView, isDrawerOpen, resetTokens, scrollToPost, navigate, openDrawer, closeDrawer, setActiveTab, resetTab, navigateToSocialAndHighlight, clearScrollToPost]);

    return (
        <NavigationContext.Provider value={value}>
            {children}
        </NavigationContext.Provider>
    );
};

export const useNavigation = (): NavigationContextType => {
    const context = useContext(NavigationContext);
    if (context === undefined) {
        throw new Error('useNavigation must be used within a NavigationProvider');
    }
    return context;
};
