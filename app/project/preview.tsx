import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import LongformReadingSurface from '../../components/content/LongformReadingSurface.tsx';
import ReleaseEbookPreviewReader from '../../components/reader/runtime/ReleaseEbookPreviewReader.tsx';
import { useProjectReleasePreview } from '../../lib/hooks/useProjectReleasePreview.ts';
import { usePublishProjectRelease } from '../../lib/hooks/useProjectMutations.ts';
import { dataService } from '../../services/dataService.ts';
import type { ProjectReleaseEbookPreviewSession } from '../../services/firebaseProjectService.ts';
import Button from '../../components/ui/Button.tsx';
import { useToast } from '../../store/toast.tsx';

const PUBLISH_SUCCESS_CELEBRATION_STORAGE_KEY = 'booktown:publish-success-pending';

const ProjectPreviewScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();

    const projectId =
        currentView.type === 'immersive' && typeof currentView.params?.projectId === 'string'
            ? currentView.params.projectId
            : '';
    const releaseId =
        currentView.type === 'immersive' && typeof currentView.params?.releaseId === 'string'
            ? currentView.params.releaseId
            : '';
    const previewType =
        currentView.type === 'immersive' && (currentView.params?.previewType === 'blog' || currentView.params?.previewType === 'ebook')
            ? currentView.params.previewType
            : undefined;
    const from = currentView.type === 'immersive' ? currentView.params?.from : undefined;

    const { data: preview, isLoading } = useProjectReleasePreview(releaseId, previewType);
    const publishReleaseMutation = usePublishProjectRelease();
    const [ebookSession, setEbookSession] = useState<ProjectReleaseEbookPreviewSession | null>(null);
    const [isPreparingEbookPreview, setIsPreparingEbookPreview] = useState(false);
    const [ebookPreviewError, setEbookPreviewError] = useState<string | null>(null);

    const handleBack = () => navigate(from ?? { type: 'tab', id: 'write' });
    const isPublishing = publishReleaseMutation.isLoading;

    const publishedRouteParams = useMemo(
        () => ({
            projectId,
            releaseId,
            ...(preview?.title ? { title: preview.title } : {}),
            ...(preview?.coverUrl ? { coverUrl: preview.coverUrl } : {}),
        }),
        [preview?.coverUrl, preview?.title, projectId, releaseId]
    );

    useEffect(() => {
        if (previewType !== 'ebook' || !releaseId) {
            setEbookSession(null);
            setIsPreparingEbookPreview(false);
            setEbookPreviewError(null);
            return;
        }

        let active = true;
        setEbookSession(null);
        setIsPreparingEbookPreview(true);
        setEbookPreviewError(null);

        void (async () => {
            try {
                await dataService.projects.generateProjectReleaseEpub(releaseId);
                const session = await dataService.projects.getProjectReleaseEbookPreviewSession(releaseId);
                if (!active) return;
                setEbookSession(session);
            } catch (error) {
                if (!active) return;
                const message =
                    error instanceof Error && error.message.trim()
                        ? error.message
                        : (lang === 'en'
                            ? 'Unable to prepare the ebook preview.'
                            : 'تعذّر تجهيز معاينة الكتاب الإلكتروني.');
                setEbookPreviewError(message);
            } finally {
                if (active) {
                    setIsPreparingEbookPreview(false);
                }
            }
        })();

        return () => {
            active = false;
        };
    }, [lang, previewType, releaseId]);

    const handlePublish = async () => {
        if (!projectId || !releaseId || !previewType) {
            showToast(lang === 'en' ? 'Preview is unavailable.' : 'المعاينة غير متاحة.');
            return;
        }

        try {
            const result = await publishReleaseMutation.mutateAsync({
                releaseId,
                target: previewType,
                projectId,
            });

            if (typeof window !== 'undefined') {
                const celebrationToken = crypto.randomUUID();
                window.sessionStorage.setItem(
                    PUBLISH_SUCCESS_CELEBRATION_STORAGE_KEY,
                    JSON.stringify({
                        token: celebrationToken,
                        projectId,
                        releaseId,
                        publishTarget: previewType,
                        publicationVersion: result.publicationVersion,
                    })
                );
            }

            navigate({
                type: 'immersive',
                id: 'projectPublished',
                params: {
                    ...publishedRouteParams,
                    publishTarget: previewType,
                    publicationVersion: result.publicationVersion,
                    ...(result.target === 'ebook'
                        ? { bookId: result.bookId }
                        : {
                            publicationId: result.publicationId,
                            canonicalSlug: result.canonicalSlug,
                        }),
                },
            });
        } catch (error) {
            const message =
                error instanceof Error && error.message.trim()
                    ? error.message
                    : (lang === 'en' ? 'Publishing failed.' : 'فشل النشر.');
            showToast(message);
        }
    };

    const publishCta = (
        <Button
            variant="primary"
            onClick={handlePublish}
            disabled={isPublishing}
            className="w-full !h-12 shadow-lg shadow-primary/20"
        >
            {isPublishing
                ? (lang === 'en' ? 'Publishing...' : 'جار النشر...')
                : (lang === 'en' ? 'Publish' : 'نشر')}
        </Button>
    );

    if (previewType === 'ebook') {
        if (ebookPreviewError) {
            return (
                <div className="h-screen w-full flex flex-col items-center justify-center bg-black px-6 text-center text-white">
                    <p className="mb-6 max-w-md text-sm text-white/70">{ebookPreviewError}</p>
                    <button
                        onClick={handleBack}
                        className="rounded-full bg-white/10 px-6 py-2 transition hover:bg-white/20"
                    >
                        {lang === 'en' ? 'Back' : 'عودة'}
                    </button>
                </div>
            );
        }

        if (isLoading || isPreparingEbookPreview || !preview || !ebookSession) {
            return (
                <div className="h-screen w-full flex items-center justify-center bg-black">
                    <LoadingSpinner />
                </div>
            );
        }

        return (
            <ReleaseEbookPreviewReader
                title={preview.title}
                author={preview.frontmatter.author}
                signedUrl={ebookSession.signedUrl}
                onBack={handleBack}
                previewLabel={lang === 'en' ? 'Preview' : 'معاينة'}
                footerSlot={publishCta}
            />
        );
    }

    if (isLoading) {
        return <div className="h-screen flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
    }

    if (!preview || !previewType) {
        return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Preview unavailable</div>;
    }

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader
                titleEn="Preview"
                titleAr="معاينة"
                onBack={handleBack}
            />

            <main className="flex-grow overflow-y-auto pt-20 pb-24">
                <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(196,165,121,0.12),_transparent_42%),linear-gradient(180deg,_#14181f_0%,_#11151b_100%)] px-4 py-8 md:px-8 md:py-10">
                    <div className="mx-auto max-w-3xl">
                        <div className="mb-4">
                            <span className="inline-flex rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300">
                                {lang === 'en' ? 'Preview' : 'معاينة'}
                            </span>
                        </div>
                        <LongformReadingSurface
                            title={preview.title}
                            author={preview.frontmatter.author}
                            coverUrl={preview.coverUrl}
                            excerpt={preview.excerpt}
                            estimatedReadingMinutes={preview.estimatedReadingMinutes}
                            normalizedContent={preview.normalizedContent}
                        />
                    </div>
                </div>
            </main>

            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
                <div className="pointer-events-auto mx-auto max-w-md">
                    {publishCta}
                </div>
            </div>
        </div>
    );
};

export default ProjectPreviewScreen;
