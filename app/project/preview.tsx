import React, { useEffect, useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import LongformReadingSurface from '../../components/content/LongformReadingSurface.tsx';
import ReleaseEbookPreviewReader from '../../components/reader/runtime/ReleaseEbookPreviewReader.tsx';
import { useProjectReleasePreview } from '../../lib/hooks/useProjectReleasePreview.ts';
import { dataService } from '../../services/dataService.ts';
import type { ProjectReleaseEbookPreviewSession } from '../../services/firebaseProjectService.ts';

const ProjectPreviewScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();

    const releaseId = currentView.type === 'immersive' ? currentView.params?.releaseId : undefined;
    const previewType = currentView.type === 'immersive' ? currentView.params?.previewType as 'blog' | 'ebook' | undefined : undefined;
    const from = currentView.type === 'immersive' ? currentView.params?.from : undefined;

    const { data: preview, isLoading } = useProjectReleasePreview(releaseId, previewType);
    const [ebookSession, setEbookSession] = useState<ProjectReleaseEbookPreviewSession | null>(null);
    const [isPreparingEbookPreview, setIsPreparingEbookPreview] = useState(false);
    const [ebookPreviewError, setEbookPreviewError] = useState<string | null>(null);

    const handleBack = () => navigate(from ?? { type: 'tab', id: 'write' });

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
                titleEn="Preview Blog"
                titleAr="معاينة المقال"
                onBack={handleBack}
            />

            <main className="flex-grow overflow-y-auto pt-20">
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
        </div>
    );
};

export default ProjectPreviewScreen;
