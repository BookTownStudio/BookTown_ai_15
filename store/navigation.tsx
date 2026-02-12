import React, { createContext, useState, useContext, useMemo, ReactNode, useCallback } from 'react';
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

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
    const [currentView, setCurrentView] = useState<View>({ type: 'tab', id: 'home' });
    const [isDrawerOpen, setDrawerOpen] = useState(false);
    const [resetTokens, setResetTokens] = useState(initialResetTokens);
    const [scrollToPost, setScrollToPost] = useState<string | null>(null);

    const navigate = useCallback((view: View, options?: NavigationOptions) => {
        setCurrentView(view);
        setDrawerOpen(false);
    }, []);

    const openDrawer = useCallback(() => setDrawerOpen(true), []);
    const closeDrawer = useCallback(() => setDrawerOpen(false), []);
    
    const setActiveTab = useCallback((tab: TabName) => {
        setCurrentView({ type: 'tab', id: tab });
    }, []);

    const resetTab = useCallback((tab: TabName) => {
        setResetTokens(prev => ({ ...prev, [tab]: prev[tab] + 1 }));
    }, []);

    const navigateToSocialAndHighlight = useCallback((postId: string) => {
        setScrollToPost(postId);
        setCurrentView({ type: 'tab', id: 'social' });
    }, []);

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