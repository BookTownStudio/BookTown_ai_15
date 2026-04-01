import React, { createContext, useState, useContext, useMemo, ReactNode, useCallback, useEffect } from 'react';
import { View, TabName, NavigationParams } from '../types/navigation.ts';
import { buildPublicationSlugPath, extractPublicationIdFromSlugSegment } from '../lib/publications/publicationUrl.ts';

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

type SocialEntryScope = 'explore' | 'following' | 'books' | 'discover';

interface SocialPostEntryOptions {
    openDiscussion?: boolean;
    fallbackToStandalone?: boolean;
    preferredScope?: SocialEntryScope;
    replace?: boolean;
}

interface SocialPostEntryRequest {
    entryId: number;
    postId: string;
    openDiscussion: boolean;
    fallbackToStandalone: boolean;
    preferredScope?: SocialEntryScope;
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
    navigateToSocialPostEntry: (postId: string, options?: SocialPostEntryOptions) => void;
    socialPostEntry: SocialPostEntryRequest | null;
    clearSocialPostEntry: () => void;
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

const encodePathSegment = (value: string): string => encodeURIComponent(value.trim());

const normalizeSocialEntryScope = (value: unknown): SocialEntryScope | undefined => {
    if (value === 'explore' || value === 'following' || value === 'books' || value === 'discover') {
        return value;
    }

    return undefined;
};

function resolveViewFromPath(pathname: string, search = ''): View {
    const normalizedPath = (pathname || '/').replace(/\/+$/, '') || '/';
    const segments = normalizedPath.split('/').filter(Boolean);
    const searchParams = new URLSearchParams(search);

    if (normalizedPath === '/') return { type: 'tab', id: 'home' };
    if (normalizedPath === '/read') return { type: 'tab', id: 'read' };
    if (normalizedPath === '/discover') return { type: 'tab', id: 'discover' };
    if (normalizedPath === '/discover/explore') return { type: 'stack', id: 'discovery' };
    if (normalizedPath === '/write') return { type: 'tab', id: 'write' };
    if (normalizedPath === '/social') return { type: 'tab', id: 'social' };

    if (segments.length >= 1 && segments[0] === 'admin') {
        if (segments.length >= 2 && segments[1] === 'intelligence') {
            return { type: 'immersive', id: 'adminIntelligence' };
        }
        return { type: 'immersive', id: 'adminDashboard' };
    }

    if (segments.length >= 2 && segments[0] === 'books') {
        const bookId = decodePathSegment(segments[1]);
        if (bookId.length > 0) {
            return { type: 'immersive', id: 'bookDetails', params: { bookId } };
        }
    }

    if (segments.length >= 2 && segments[0] === 'authors') {
        const authorId = decodePathSegment(segments[1]);
        if (authorId.length > 0) {
            return { type: 'immersive', id: 'authorDetails', params: { authorId } };
        }
    }

    if (segments.length >= 3 && segments[0] === 'quotes') {
        const ownerId = decodePathSegment(segments[1]);
        const quoteId = decodePathSegment(segments[2]);
        if (ownerId.length > 0 && quoteId.length > 0) {
            return { type: 'immersive', id: 'quoteDetails', params: { ownerId, quoteId } };
        }
    }

    if (segments.length >= 1 && segments[0] === 'profile') {
        const userId = segments.length >= 2 ? decodePathSegment(segments[1]) : '';
        return userId.length > 0
            ? { type: 'immersive', id: 'profile', params: { userId } }
            : { type: 'immersive', id: 'profile' };
    }

    if (segments.length >= 1 && segments[0] === 'notifications') {
        return { type: 'immersive', id: 'notificationsFeed' };
    }

    if (segments.length >= 1 && segments[0] === 'messages') {
        if (segments.length >= 2) {
            const conversationId = decodePathSegment(segments[1]);
            if (conversationId.length > 0) {
                return { type: 'immersive', id: 'messengerChat', params: { conversationId } };
            }
        }
        return { type: 'immersive', id: 'messengerList' };
    }

    if (segments.length >= 2 && segments[0] === 'shelf') {
        const shelfId = decodePathSegment(segments[1]);
        if (shelfId.length > 0) {
            return { type: 'immersive', id: 'shelfDetails', params: { shelfId } };
        }
    }

    if (segments.length >= 2 && segments[0] === 'post') {
        const postId = decodePathSegment(segments[1]);
        if (postId.length > 0) {
            return { type: 'immersive', id: 'postDiscussion', params: { postId } };
        }
    }

    if (segments.length >= 2 && segments[0] === 'reader') {
        const bookId = decodePathSegment(segments[1]);
        if (bookId.length > 0) {
            return { type: 'immersive', id: 'reader', params: { bookId } };
        }
    }

    if (segments.length >= 2 && segments[0] === 'blog') {
        const publicationId = extractPublicationIdFromSlugSegment(segments[1]);
        if (publicationId.length > 0) {
            return { type: 'immersive', id: 'publicationReader', params: { publicationId } };
        }
    }

    if (segments.length >= 2 && segments[0] === 'publication') {
        const publicationId = decodePathSegment(segments[1]);
        if (publicationId.length > 0) {
            return { type: 'immersive', id: 'publicationReader', params: { publicationId } };
        }
    }

    if (segments.length >= 3 && segments[0] === 'read' && segments[1] === 'publication') {
        const publicationId = decodePathSegment(segments[2]);
        if (publicationId.length > 0) {
            return { type: 'immersive', id: 'publicationReader', params: { publicationId } };
        }
    }

    if (segments.length >= 3 && segments[0] === 'write' && segments[1] === 'editor') {
        const projectId = decodePathSegment(segments[2]);
        if (projectId.length > 0) {
            return { type: 'immersive', id: 'editor', params: { projectId } };
        }
    }

    if (segments.length >= 4 && segments[0] === 'write' && segments[1] === 'project') {
        const projectId = decodePathSegment(segments[2]);
        const mode = segments[3];

        if (projectId.length > 0 && mode === 'edit') {
            return { type: 'immersive', id: 'projectEdit', params: { projectId } };
        }
        if (projectId.length > 0 && mode === 'publish') {
            const releaseId = searchParams.get('releaseId')?.trim() ?? '';
            const targetRaw = searchParams.get('target')?.trim();
            const publishTarget =
                targetRaw === 'blog' || targetRaw === 'ebook'
                    ? targetRaw
                    : undefined;
            const visibilityRaw = searchParams.get('visibility')?.trim();
            const visibility =
                visibilityRaw === 'public' || visibilityRaw === 'private'
                    ? visibilityRaw
                    : undefined;

            return {
                type: 'immersive',
                id: 'projectPublish',
                params: {
                    projectId,
                    ...(releaseId ? { releaseId } : {}),
                    ...(publishTarget ? { publishTarget } : {}),
                    ...(visibility ? { visibility } : {}),
                },
            };
        }
        if (projectId.length > 0 && mode === 'preview') {
            const releaseId = searchParams.get('releaseId')?.trim() ?? '';
            const previewTypeRaw = searchParams.get('previewType')?.trim();
            const previewType =
                previewTypeRaw === 'blog' || previewTypeRaw === 'ebook'
                    ? previewTypeRaw
                    : undefined;
            const visibilityRaw = searchParams.get('visibility')?.trim();
            const visibility =
                visibilityRaw === 'public' || visibilityRaw === 'private'
                    ? visibilityRaw
                    : undefined;

            return {
                type: 'immersive',
                id: 'projectPreview',
                params: {
                    projectId,
                    ...(releaseId ? { releaseId } : {}),
                    ...(previewType ? { previewType } : {}),
                    ...(visibility ? { visibility } : {}),
                },
            };
        }
        if (projectId.length > 0 && mode === 'published') {
            const releaseId = searchParams.get('releaseId')?.trim() ?? '';
            const targetRaw = searchParams.get('target')?.trim();
            const publishTarget =
                targetRaw === 'blog' || targetRaw === 'ebook'
                    ? targetRaw
                    : undefined;
            const bookId = searchParams.get('bookId')?.trim() ?? '';
            const publicationId = searchParams.get('publicationId')?.trim() ?? '';
            const canonicalSlug = searchParams.get('canonicalSlug')?.trim() ?? '';
            const publicationVersionRaw = Number(searchParams.get('publicationVersion') || '');
            const publicationVersion =
                Number.isInteger(publicationVersionRaw) && publicationVersionRaw > 0
                    ? publicationVersionRaw
                    : undefined;

            return {
                type: 'immersive',
                id: 'projectPublished',
                params: {
                    projectId,
                    ...(releaseId ? { releaseId } : {}),
                    ...(publishTarget ? { publishTarget } : {}),
                    ...(bookId ? { bookId } : {}),
                    ...(publicationId ? { publicationId } : {}),
                    ...(canonicalSlug ? { canonicalSlug } : {}),
                    ...(typeof publicationVersion === 'number' ? { publicationVersion } : {}),
                },
            };
        }
    }

    return { type: 'tab', id: 'home' };
}

function resolvePathFromView(view: View): string | null {
    if (view.type === 'tab') {
        switch (view.id) {
            case 'home':
                return '/';
            case 'read':
                return '/read';
            case 'discover':
                return '/discover';
            case 'write':
                return '/write';
            case 'social':
                return '/social';
            default:
                return '/';
        }
    }

    if (view.type === 'stack' && view.id === 'discovery') {
        return '/discover/explore';
    }

    if (view.type === 'immersive') {
        switch (view.id) {
            case 'adminDashboard':
                return '/admin';
            case 'adminIntelligence':
                return '/admin/intelligence';
            case 'bookDetails': {
                const bookId = typeof view.params?.bookId === 'string' ? view.params.bookId.trim() : '';
                return bookId ? `/books/${encodePathSegment(bookId)}` : null;
            }
            case 'authorDetails': {
                const authorId = typeof view.params?.authorId === 'string' ? view.params.authorId.trim() : '';
                return authorId ? `/authors/${encodePathSegment(authorId)}` : null;
            }
            case 'quoteDetails': {
                const ownerId = typeof view.params?.ownerId === 'string' ? view.params.ownerId.trim() : '';
                const quoteId = typeof view.params?.quoteId === 'string' ? view.params.quoteId.trim() : '';
                return ownerId && quoteId
                    ? `/quotes/${encodePathSegment(ownerId)}/${encodePathSegment(quoteId)}`
                    : null;
            }
            case 'profile': {
                const userId = typeof view.params?.userId === 'string' ? view.params.userId.trim() : '';
                return userId ? `/profile/${encodePathSegment(userId)}` : '/profile';
            }
            case 'notificationsFeed':
                return '/notifications';
            case 'messengerList':
                return '/messages';
            case 'messengerChat': {
                const conversationId =
                    typeof view.params?.conversationId === 'string'
                        ? view.params.conversationId.trim()
                        : '';
                return conversationId ? `/messages/${encodePathSegment(conversationId)}` : '/messages';
            }
            case 'shelfDetails': {
                const shelfId = typeof view.params?.shelfId === 'string' ? view.params.shelfId.trim() : '';
                return shelfId ? `/shelf/${encodePathSegment(shelfId)}` : '/';
            }
            case 'postDiscussion': {
                const postId = typeof view.params?.postId === 'string' ? view.params.postId.trim() : '';
                return postId ? `/post/${encodePathSegment(postId)}` : '/';
            }
            case 'reader': {
                const bookId = typeof view.params?.bookId === 'string' ? view.params.bookId.trim() : '';
                return bookId ? `/reader/${encodePathSegment(bookId)}` : null;
            }
            case 'publicationReader': {
                const publicationId =
                    typeof view.params?.publicationId === 'string'
                        ? view.params.publicationId.trim()
                        : '';
                const title =
                    typeof view.params?.title === 'string'
                        ? view.params.title.trim()
                        : '';
                const canonicalSlug =
                    typeof view.params?.canonicalSlug === 'string'
                        ? view.params.canonicalSlug.trim()
                        : '';
                if (!publicationId) return null;
                return (title || canonicalSlug)
                    ? buildPublicationSlugPath(title, publicationId, canonicalSlug)
                    : `/read/publication/${encodePathSegment(publicationId)}`;
            }
            case 'editor': {
                const projectId = typeof view.params?.projectId === 'string' ? view.params.projectId.trim() : '';
                return projectId ? `/write/editor/${encodePathSegment(projectId)}` : null;
            }
            case 'projectEdit': {
                const projectId = typeof view.params?.projectId === 'string' ? view.params.projectId.trim() : '';
                return projectId ? `/write/project/${encodePathSegment(projectId)}/edit` : null;
            }
            case 'projectPublish': {
                const projectId = typeof view.params?.projectId === 'string' ? view.params.projectId.trim() : '';
                if (!projectId) return null;

                const releaseId =
                    typeof view.params?.releaseId === 'string' ? view.params.releaseId.trim() : '';
                const targetRaw =
                    typeof view.params?.publishTarget === 'string' ? view.params.publishTarget.trim() : '';
                const publishTarget =
                    targetRaw === 'blog' || targetRaw === 'ebook'
                        ? targetRaw
                        : '';
                const visibilityRaw =
                    typeof view.params?.visibility === 'string' ? view.params.visibility.trim() : '';
                const visibility =
                    visibilityRaw === 'public' || visibilityRaw === 'private'
                        ? visibilityRaw
                        : '';

                const query = new URLSearchParams();
                if (releaseId) query.set('releaseId', releaseId);
                if (publishTarget) query.set('target', publishTarget);
                if (visibility) query.set('visibility', visibility);

                const basePath = `/write/project/${encodePathSegment(projectId)}/publish`;
                const queryString = query.toString();
                return queryString ? `${basePath}?${queryString}` : basePath;
            }
            case 'projectPreview': {
                const projectId = typeof view.params?.projectId === 'string' ? view.params.projectId.trim() : '';
                if (!projectId) return null;

                const releaseId =
                    typeof view.params?.releaseId === 'string' ? view.params.releaseId.trim() : '';
                const previewTypeRaw =
                    typeof view.params?.previewType === 'string' ? view.params.previewType.trim() : '';
                const previewType =
                    previewTypeRaw === 'blog' || previewTypeRaw === 'ebook'
                        ? previewTypeRaw
                        : '';
                const visibilityRaw =
                    typeof view.params?.visibility === 'string' ? view.params.visibility.trim() : '';
                const visibility =
                    visibilityRaw === 'public' || visibilityRaw === 'private'
                        ? visibilityRaw
                        : '';

                const query = new URLSearchParams();
                if (releaseId) query.set('releaseId', releaseId);
                if (previewType) query.set('previewType', previewType);
                if (visibility) query.set('visibility', visibility);

                const basePath = `/write/project/${encodePathSegment(projectId)}/preview`;
                const queryString = query.toString();
                return queryString ? `${basePath}?${queryString}` : basePath;
            }
            case 'projectPublished': {
                const projectId = typeof view.params?.projectId === 'string' ? view.params.projectId.trim() : '';
                if (!projectId) return null;

                const releaseId =
                    typeof view.params?.releaseId === 'string' ? view.params.releaseId.trim() : '';
                const targetRaw =
                    typeof view.params?.publishTarget === 'string' ? view.params.publishTarget.trim() : '';
                const publishTarget =
                    targetRaw === 'blog' || targetRaw === 'ebook'
                        ? targetRaw
                        : '';
                const bookId =
                    typeof view.params?.bookId === 'string' ? view.params.bookId.trim() : '';
                const publicationId =
                    typeof view.params?.publicationId === 'string' ? view.params.publicationId.trim() : '';
                const canonicalSlug =
                    typeof view.params?.canonicalSlug === 'string' ? view.params.canonicalSlug.trim() : '';
                const publicationVersion =
                    typeof view.params?.publicationVersion === 'number' &&
                    Number.isInteger(view.params.publicationVersion) &&
                    view.params.publicationVersion > 0
                        ? view.params.publicationVersion
                        : undefined;

                const query = new URLSearchParams();
                if (releaseId) query.set('releaseId', releaseId);
                if (publishTarget) query.set('target', publishTarget);
                if (bookId) query.set('bookId', bookId);
                if (publicationId) query.set('publicationId', publicationId);
                if (canonicalSlug) query.set('canonicalSlug', canonicalSlug);
                if (typeof publicationVersion === 'number') {
                    query.set('publicationVersion', String(publicationVersion));
                }

                const basePath = `/write/project/${encodePathSegment(projectId)}/published`;
                const queryString = query.toString();
                return queryString ? `${basePath}?${queryString}` : basePath;
            }
            default:
                return null;
        }
    }

    return null;
}

function isRouteBackedPath(pathname: string): boolean {
    const normalizedPath = (pathname || '/').replace(/\/+$/, '') || '/';
    return normalizedPath === '/'
        || normalizedPath === '/read'
        || normalizedPath === '/discover'
        || normalizedPath === '/discover/explore'
        || normalizedPath === '/write'
        || normalizedPath === '/social'
        || normalizedPath.startsWith('/books/')
        || normalizedPath.startsWith('/authors/')
        || normalizedPath.startsWith('/quotes/')
        || normalizedPath === '/profile'
        || normalizedPath.startsWith('/profile/')
        || normalizedPath === '/notifications'
        || normalizedPath === '/messages'
        || normalizedPath.startsWith('/messages/')
        || normalizedPath.startsWith('/post/')
        || normalizedPath.startsWith('/shelf/')
        || normalizedPath.startsWith('/reader/')
        || normalizedPath.startsWith('/blog/')
        || normalizedPath.startsWith('/publication/')
        || normalizedPath.startsWith('/read/publication/')
        || normalizedPath.startsWith('/write/editor/')
        || normalizedPath.startsWith('/write/project/')
        || normalizedPath === '/admin'
        || normalizedPath.startsWith('/admin/');
}

function sanitizeViewForHistory(view: View): View {
    if (view.type === 'tab') {
        const highlightPostId =
            typeof view.params?.highlightPostId === 'string'
                ? view.params.highlightPostId.trim()
                : '';
        const anchorPostId =
            typeof view.params?.anchorPostId === 'string'
                ? view.params.anchorPostId.trim()
                : '';
        const preferredScope = normalizeSocialEntryScope(view.params?.preferredScope);
        const params: NavigationParams = {};

        if (highlightPostId) {
            params.highlightPostId = highlightPostId;
        }
        if (anchorPostId) {
            params.anchorPostId = anchorPostId;
        }
        if (preferredScope) {
            params.preferredScope = preferredScope;
        }

        return Object.keys(params).length > 0
            ? { type: 'tab', id: view.id, params }
            : { type: 'tab', id: view.id };
    }

    if (view.type === 'immersive') {
        switch (view.id) {
            case 'bookDetails': {
                const bookId = typeof view.params?.bookId === 'string' ? view.params.bookId.trim() : '';
                return bookId ? { type: 'immersive', id: 'bookDetails', params: { bookId } } : { type: 'tab', id: 'home' };
            }
            case 'authorDetails': {
                const authorId = typeof view.params?.authorId === 'string' ? view.params.authorId.trim() : '';
                return authorId ? { type: 'immersive', id: 'authorDetails', params: { authorId } } : { type: 'tab', id: 'home' };
            }
            case 'quoteDetails': {
                const quoteId = typeof view.params?.quoteId === 'string' ? view.params.quoteId.trim() : '';
                const ownerId = typeof view.params?.ownerId === 'string' ? view.params.ownerId.trim() : '';
                return quoteId && ownerId
                    ? { type: 'immersive', id: 'quoteDetails', params: { quoteId, ownerId } }
                    : { type: 'tab', id: 'home' };
            }
            case 'postDiscussion': {
                const postId = typeof view.params?.postId === 'string' ? view.params.postId.trim() : '';
                return postId ? { type: 'immersive', id: 'postDiscussion', params: { postId } } : { type: 'tab', id: 'home' };
            }
            case 'shelfDetails': {
                const shelfId = typeof view.params?.shelfId === 'string' ? view.params.shelfId.trim() : '';
                return shelfId ? { type: 'immersive', id: 'shelfDetails', params: { shelfId } } : { type: 'tab', id: 'home' };
            }
            case 'profile': {
                const userId = typeof view.params?.userId === 'string' ? view.params.userId.trim() : '';
                return userId ? { type: 'immersive', id: 'profile', params: { userId } } : { type: 'immersive', id: 'profile' };
            }
            case 'reader': {
                const bookId = typeof view.params?.bookId === 'string' ? view.params.bookId.trim() : '';
                return bookId ? { type: 'immersive', id: 'reader', params: { bookId } } : { type: 'tab', id: 'home' };
            }
            case 'publicationReader': {
                const publicationId =
                    typeof view.params?.publicationId === 'string'
                        ? view.params.publicationId.trim()
                        : '';
                const title =
                    typeof view.params?.title === 'string'
                        ? view.params.title.trim()
                        : '';
                const canonicalSlug =
                    typeof view.params?.canonicalSlug === 'string'
                        ? view.params.canonicalSlug.trim()
                        : '';
                return publicationId
                    ? {
                        type: 'immersive',
                        id: 'publicationReader',
                        params: {
                            publicationId,
                            ...(title ? { title } : {}),
                            ...(canonicalSlug ? { canonicalSlug } : {}),
                        },
                    }
                    : { type: 'tab', id: 'read' };
            }
            case 'editor':
            case 'projectEdit': {
                const projectId = typeof view.params?.projectId === 'string' ? view.params.projectId.trim() : '';
                return projectId ? { type: 'immersive', id: view.id, params: { projectId } } : { type: 'tab', id: 'write' };
            }
            case 'projectPublish': {
                const projectId = typeof view.params?.projectId === 'string' ? view.params.projectId.trim() : '';
                const releaseId =
                    typeof view.params?.releaseId === 'string' ? view.params.releaseId.trim() : '';
                const targetRaw =
                    typeof view.params?.publishTarget === 'string' ? view.params.publishTarget.trim() : '';
                const publishTarget =
                    targetRaw === 'blog' || targetRaw === 'ebook'
                        ? targetRaw
                        : '';
                const visibilityRaw =
                    typeof view.params?.visibility === 'string' ? view.params.visibility.trim() : '';
                const visibility =
                    visibilityRaw === 'public' || visibilityRaw === 'private'
                        ? visibilityRaw
                        : '';

                if (!projectId) {
                    return { type: 'tab', id: 'write' };
                }

                return {
                    type: 'immersive',
                    id: 'projectPublish',
                    params: {
                        projectId,
                        ...(releaseId ? { releaseId } : {}),
                        ...(publishTarget ? { publishTarget } : {}),
                        ...(visibility ? { visibility } : {}),
                    },
                };
            }
            case 'projectPreview': {
                const projectId = typeof view.params?.projectId === 'string' ? view.params.projectId.trim() : '';
                const releaseId =
                    typeof view.params?.releaseId === 'string' ? view.params.releaseId.trim() : '';
                const previewTypeRaw =
                    typeof view.params?.previewType === 'string' ? view.params.previewType.trim() : '';
                const previewType =
                    previewTypeRaw === 'blog' || previewTypeRaw === 'ebook'
                        ? previewTypeRaw
                        : '';
                const visibilityRaw =
                    typeof view.params?.visibility === 'string' ? view.params.visibility.trim() : '';
                const visibility =
                    visibilityRaw === 'public' || visibilityRaw === 'private'
                        ? visibilityRaw
                        : '';

                if (!projectId || !releaseId || !previewType) {
                    return { type: 'tab', id: 'write' };
                }

                return {
                    type: 'immersive',
                    id: 'projectPreview',
                    params: {
                        projectId,
                        releaseId,
                        previewType,
                        ...(visibility ? { visibility } : {}),
                    },
                };
            }
            case 'projectPublished': {
                const projectId = typeof view.params?.projectId === 'string' ? view.params.projectId.trim() : '';
                const releaseId =
                    typeof view.params?.releaseId === 'string' ? view.params.releaseId.trim() : '';
                const targetRaw =
                    typeof view.params?.publishTarget === 'string' ? view.params.publishTarget.trim() : '';
                const publishTarget =
                    targetRaw === 'blog' || targetRaw === 'ebook'
                        ? targetRaw
                        : '';
                const bookId =
                    typeof view.params?.bookId === 'string' ? view.params.bookId.trim() : '';
                const publicationId =
                    typeof view.params?.publicationId === 'string' ? view.params.publicationId.trim() : '';
                const title =
                    typeof view.params?.title === 'string' ? view.params.title.trim() : '';
                const coverUrl =
                    typeof view.params?.coverUrl === 'string' ? view.params.coverUrl.trim() : '';
                const publicationVersion =
                    typeof view.params?.publicationVersion === 'number' &&
                    Number.isInteger(view.params.publicationVersion) &&
                    view.params.publicationVersion > 0
                        ? view.params.publicationVersion
                        : undefined;
                const canonicalSlug =
                    typeof view.params?.canonicalSlug === 'string' ? view.params.canonicalSlug.trim() : '';

                if (!projectId || !releaseId || !publishTarget) {
                    return { type: 'tab', id: 'write' };
                }

                return {
                    type: 'immersive',
                    id: 'projectPublished',
                    params: {
                        projectId,
                        releaseId,
                        publishTarget,
                        ...(bookId ? { bookId } : {}),
                        ...(publicationId ? { publicationId } : {}),
                        ...(title ? { title } : {}),
                        ...(coverUrl ? { coverUrl } : {}),
                        ...(typeof publicationVersion === 'number' ? { publicationVersion } : {}),
                        ...(canonicalSlug ? { canonicalSlug } : {}),
                    },
                };
            }
            case 'messengerChat': {
                const conversationId =
                    typeof view.params?.conversationId === 'string'
                        ? view.params.conversationId.trim()
                        : '';
                return conversationId
                    ? { type: 'immersive', id: 'messengerChat', params: { conversationId } }
                    : { type: 'immersive', id: 'messengerList' };
            }
            default:
                return { type: 'immersive', id: view.id };
        }
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
    return resolveViewFromPath(window.location.pathname || '/', window.location.search || '');
}

export const NavigationProvider: React.FC<NavigationProviderProps> = ({ children }) => {
    const [currentView, setCurrentView] = useState<View>(() => resolveInitialViewFromPath());
    const [isDrawerOpen, setDrawerOpen] = useState(false);
    const [resetTokens, setResetTokens] = useState(initialResetTokens);
    const [scrollToPost, setScrollToPost] = useState<string | null>(null);
    const [socialPostEntry, setSocialPostEntry] = useState<SocialPostEntryRequest | null>(null);
    const socialEntryIdRef = React.useRef(0);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const bootView =
            readHistoryViewState(window.history.state) ||
            resolveViewFromPath(window.location.pathname || '/', window.location.search || '');
        const normalizedBootPath = resolvePathFromView(bootView);
        const currentUrlPath = window.location.pathname || '/';
        const initialPath =
            normalizedBootPath &&
            /\/write\/project\/[^/]+\/preview\/?$/.test(currentUrlPath) &&
            bootView.type === 'immersive' &&
            bootView.id === 'projectPublish'
                ? normalizedBootPath
                : currentUrlPath;
        setCurrentView(bootView);
        window.history.replaceState(
            { view: sanitizeViewForHistory(bootView) },
            '',
            initialPath + window.location.search + window.location.hash
        );

        const onPopState = (event: PopStateEvent) => {
            const fromState =
                readHistoryViewState(event.state) ||
                resolveViewFromPath(window.location.pathname || '/', window.location.search || '');
            setCurrentView(fromState);
            setDrawerOpen(false);
            if (
                fromState.type === 'tab' &&
                fromState.id === 'social' &&
                (
                    (typeof fromState.params?.highlightPostId === 'string' &&
                        fromState.params.highlightPostId.trim().length > 0) ||
                    (typeof fromState.params?.anchorPostId === 'string' &&
                        fromState.params.anchorPostId.trim().length > 0)
                )
            ) {
                const targetPostId =
                    typeof fromState.params?.highlightPostId === 'string' &&
                    fromState.params.highlightPostId.trim().length > 0
                        ? fromState.params.highlightPostId.trim()
                        : fromState.params.anchorPostId.trim();
                setScrollToPost(targetPostId);
            }
        };

        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    const navigate = useCallback((view: View, options?: NavigationOptions) => {
        if (typeof window !== 'undefined') {
            const nextPath = resolvePathFromView(view);
            const currentPath = window.location.pathname || '/';
            const preserveCurrentPath =
                !nextPath &&
                view.type === 'immersive' &&
                view.id === 'projectPreview';
            const shouldResetToRoot = !nextPath && !preserveCurrentPath && isRouteBackedPath(currentPath);

            if (nextPath || shouldResetToRoot || preserveCurrentPath) {
                const currentUrl = currentPath + window.location.search + window.location.hash;
                const serializedCurrent = sanitizeViewForHistory(currentView);
                const serializedNext = sanitizeViewForHistory(view);
                const finalPath = nextPath || (preserveCurrentPath ? currentUrl : '/');

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

        if (!(view.type === 'tab' && view.id === 'social')) {
            setSocialPostEntry(null);
        }

        if (
            view.type === 'tab' &&
            view.id === 'social' &&
            (
                (typeof view.params?.highlightPostId === 'string' &&
                    view.params.highlightPostId.trim().length > 0) ||
                (typeof view.params?.anchorPostId === 'string' &&
                    view.params.anchorPostId.trim().length > 0)
            )
        ) {
            const targetPostId =
                typeof view.params?.highlightPostId === 'string' &&
                view.params.highlightPostId.trim().length > 0
                    ? view.params.highlightPostId.trim()
                    : view.params.anchorPostId.trim();
            setScrollToPost(targetPostId);
        }
    }, [currentView]);

    const openDrawer = useCallback(() => setDrawerOpen(true), []);
    const closeDrawer = useCallback(() => setDrawerOpen(false), []);
    
    const setActiveTab = useCallback((tab: TabName) => {
        navigate({ type: 'tab', id: tab });
    }, [navigate]);

    const resetTab = useCallback((tab: TabName) => {
        setResetTokens(prev => ({ ...prev, [tab]: prev[tab] + 1 }));
    }, []);

    const navigateToSocialAndHighlight = useCallback((postId: string) => {
        const normalizedPostId = typeof postId === 'string' ? postId.trim() : '';
        if (!normalizedPostId) return;
        setSocialPostEntry(null);
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

    const navigateToSocialPostEntry = useCallback((postId: string, options?: SocialPostEntryOptions) => {
        const normalizedPostId = typeof postId === 'string' ? postId.trim() : '';
        if (!normalizedPostId) return;

        const preferredScope = normalizeSocialEntryScope(options?.preferredScope);
        socialEntryIdRef.current += 1;
        setSocialPostEntry({
            entryId: socialEntryIdRef.current,
            postId: normalizedPostId,
            openDiscussion: options?.openDiscussion !== false,
            fallbackToStandalone: options?.fallbackToStandalone !== false,
            ...(preferredScope ? { preferredScope } : {}),
        });

        navigate(
            {
                type: 'tab',
                id: 'social',
                params: {
                    highlightPostId: normalizedPostId,
                    anchorPostId: normalizedPostId,
                    ...(preferredScope ? { preferredScope } : {}),
                } as NavigationParams,
            },
            { replace: options?.replace === true }
        );
    }, [navigate]);

    const clearSocialPostEntry = useCallback(() => {
        setSocialPostEntry(null);
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
        navigateToSocialPostEntry,
        socialPostEntry,
        clearSocialPostEntry,
        clearScrollToPost,
    }), [currentView, isDrawerOpen, resetTokens, scrollToPost, navigate, openDrawer, closeDrawer, setActiveTab, resetTab, navigateToSocialAndHighlight, navigateToSocialPostEntry, socialPostEntry, clearSocialPostEntry, clearScrollToPost]);

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
