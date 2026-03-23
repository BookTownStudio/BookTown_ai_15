import React, { useEffect, useMemo, useRef, useState } from 'react';
import ScreenHeader from '../components/navigation/ScreenHeader.tsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';
import ErrorState from '../components/ui/ErrorState.tsx';
import { BookIcon } from '../components/icons/BookIcon.tsx';
import LongformReadingSurface from '../components/content/LongformReadingSurface.tsx';
import { useNavigation } from '../store/navigation.tsx';
import { useLongformPublication } from '../lib/hooks/useLongformPublication.ts';
import { useOwnLongformPublications } from '../lib/hooks/useOwnLongformPublications.ts';
import { useAuth } from '../lib/auth.tsx';
import { useToast } from '../store/toast.tsx';
import { buildPublicationSlugPath } from '../lib/publications/publicationUrl.ts';
import { usePublicationMetadata } from '../lib/publications/usePublicationMetadata.ts';

const PublicationReaderScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { user } = useAuth();
    const { showToast } = useToast();
    const publicationId =
        currentView.type === 'immersive' && typeof currentView.params?.publicationId === 'string'
            ? currentView.params.publicationId
            : '';
    const from = currentView.type === 'immersive' ? currentView.params?.from : undefined;
    const scrollContainerRef = useRef<HTMLElement | null>(null);
    const [scrollProgress, setScrollProgress] = useState(0);

    const {
        data: publication,
        isLoading,
        isError,
        error,
        refetch,
    } = useLongformPublication(publicationId);
    const { data: ownPublications } = useOwnLongformPublications();

    usePublicationMetadata(
        publication
            ? {
                publicationId: publication.publicationId,
                title: publication.title,
                author: publication.author,
                excerpt: publication.excerpt,
                coverUrl: publication.coverUrl,
                canonicalSlug: publication.canonicalSlug,
                datePublished: publication.datePublished,
                dateModified: publication.dateModified,
                normalizedContent: publication.normalizedContent,
            }
            : null
    );

    const handleBack = () => navigate(from ?? { type: 'tab', id: 'read' });

    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const updateProgress = () => {
            const totalScrollable = container.scrollHeight - container.clientHeight;
            if (totalScrollable <= 0) {
                setScrollProgress(0);
                return;
            }

            setScrollProgress(Math.min(1, Math.max(0, container.scrollTop / totalScrollable)));
        };

        updateProgress();
        container.addEventListener('scroll', updateProgress, { passive: true });
        return () => container.removeEventListener('scroll', updateProgress);
    }, [publicationId, publication?.normalizedContent]);

    const relatedItems = useMemo(() => {
        if (!publication || !user?.uid || publication.ownerUid !== user.uid || !ownPublications) {
            return [];
        }

        return ownPublications
            .filter((item) => item.publicationId !== publication.publicationId)
            .slice(0, 3)
            .map((item) => ({
                publicationId: item.publicationId,
                title: item.title,
                canonicalSlug: item.canonicalSlug,
                excerpt: item.excerpt,
                estimatedReadingMinutes: item.estimatedReadingMinutes,
            }));
    }, [ownPublications, publication, user?.uid]);

    const handleShare = async () => {
        if (!publication) return;

        const shareUrl = typeof window !== 'undefined'
            ? `${window.location.origin}${buildPublicationSlugPath(
                publication.title,
                publication.publicationId,
                publication.canonicalSlug
            )}`
            : buildPublicationSlugPath(
                publication.title,
                publication.publicationId,
                publication.canonicalSlug
            );

        const shareData = {
            title: publication.title,
            text: publication.excerpt,
            url: shareUrl,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
                return;
            } catch (shareError: any) {
                if (shareError?.name === 'AbortError') {
                    return;
                }
            }
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showToast('Link copied.');
            return;
        }

        showToast(shareUrl);
    };

    const handleAuthorPress = () => {
        if (!publication?.ownerUid) return;
        navigate({
            type: 'immersive',
            id: 'profile',
            params: {
                userId: publication.ownerUid,
                from: currentView,
            },
        });
    };

    const handleOpenRelated = (
        nextPublicationId: string,
        title: string,
        canonicalSlug?: string
    ) => {
        navigate({
            type: 'immersive',
            id: 'publicationReader',
            params: {
                publicationId: nextPublicationId,
                title,
                ...(canonicalSlug ? { canonicalSlug } : {}),
                from: currentView,
            },
        });
    };

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#14181f]">
                <LoadingSpinner />
            </div>
        );
    }

    if (!publicationId || (!publication && !isLoading && !isError)) {
        return (
            <div className="h-screen flex flex-col bg-[#14181f]">
                <ScreenHeader titleEn="Publication" titleAr="المنشور" onBack={handleBack} />
                <main className="flex flex-1 items-center justify-center px-6 pt-20">
                    <EmptyState
                        icon={BookIcon}
                        titleEn="Publication not found"
                        titleAr="المنشور غير موجود"
                        messageEn="This publication is unavailable."
                        messageAr="هذا المنشور غير متاح."
                    />
                </main>
            </div>
        );
    }

    if (isError || !publication) {
        const errorMessage = String((error as Error | undefined)?.message || '').toLowerCase();
        const isNotFound = errorMessage.includes('not found') || errorMessage.includes('not-found');

        return (
            <div className="h-screen flex flex-col bg-[#14181f]">
                <ScreenHeader titleEn="Publication" titleAr="المنشور" onBack={handleBack} />
                <main className="flex flex-1 items-center justify-center px-6 pt-20">
                    {isNotFound ? (
                        <EmptyState
                            icon={BookIcon}
                            titleEn="Publication not found"
                            titleAr="المنشور غير موجود"
                            messageEn="This publication is unavailable."
                            messageAr="هذا المنشور غير متاح."
                        />
                    ) : (
                        <ErrorState
                            title="Unable to load publication"
                            message={String((error as Error | undefined)?.message || 'Please try again.')}
                            onRetry={() => void refetch()}
                            className="max-w-md"
                        />
                    )}
                </main>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-[#14181f]">
            <ScreenHeader titleEn="Publication" titleAr="المنشور" onBack={handleBack} />
            <div className="fixed left-0 right-0 top-[72px] z-20 h-[2px] bg-white/6">
                <div
                    className="h-full bg-[linear-gradient(90deg,_#d6b48b_0%,_#f2ddbf_100%)] transition-[width] duration-100"
                    style={{ width: `${scrollProgress * 100}%` }}
                />
            </div>

            <main ref={scrollContainerRef} className="flex-1 overflow-y-auto pt-20">
                <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(196,165,121,0.12),_transparent_42%),linear-gradient(180deg,_#14181f_0%,_#11151b_100%)] px-4 py-8 md:px-8 md:py-10">
                    <LongformReadingSurface
                        title={publication.title}
                        author={publication.author}
                        coverUrl={publication.coverUrl}
                        excerpt={publication.excerpt}
                        estimatedReadingMinutes={publication.estimatedReadingMinutes}
                        normalizedContent={publication.normalizedContent}
                        onShare={handleShare}
                        shareLabel="Share"
                        authorInteractive={Boolean(publication.ownerUid)}
                        onAuthorPress={handleAuthorPress}
                        relatedItems={relatedItems}
                        onRelatedSelect={handleOpenRelated}
                    />
                </div>
            </main>
        </div>
    );
};

export default PublicationReaderScreen;
