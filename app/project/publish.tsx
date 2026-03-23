import React, { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import { useProjectDetails } from '../../lib/hooks/useProjectDetails.ts';
import {
    useCreateProjectRelease,
    usePublishProjectRelease,
} from '../../lib/hooks/useProjectMutations.ts';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import GlassCard from '../../components/ui/GlassCard.tsx';
import { CheckCircleIcon } from '../../components/icons/CheckCircleIcon.tsx';
import { EyeIcon } from '../../components/icons/EyeIcon.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { useToast } from '../../store/toast.tsx';
import { extractProjectSynopsis } from '../../lib/projects/projectSummary.ts';
import { validateReleasePreflight } from '../../lib/publishing/releasePreflight.ts';

type PublishTarget = 'blog' | 'ebook';
type PublishAction = 'idle' | 'preview' | 'publish';

function suggestTargetByWordCount(wordCount: number): PublishTarget {
    return wordCount >= 8000 ? 'ebook' : 'blog';
}

const ProjectPublishScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();
    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;
    const releaseIdFromRoute =
        currentView.type === 'immersive' && typeof currentView.params?.releaseId === 'string'
            ? currentView.params.releaseId.trim()
            : '';
    const publishTargetFromRoute =
        currentView.type === 'immersive' &&
        (currentView.params?.publishTarget === 'blog' || currentView.params?.publishTarget === 'ebook')
            ? currentView.params.publishTarget
            : undefined;

    const { data: project, isLoading } = useProjectDetails(projectId);
    const createReleaseMutation = useCreateProjectRelease();
    const publishReleaseMutation = usePublishProjectRelease();
    const [selectedTarget, setSelectedTarget] = useState<PublishTarget | null>(
        publishTargetFromRoute ?? null
    );
    const [manualSelection, setManualSelection] = useState(Boolean(publishTargetFromRoute));
    const [preflightError, setPreflightError] = useState<string | null>(null);
    const [activeAction, setActiveAction] = useState<PublishAction>('idle');

    const suggestedTarget = useMemo(
        () => suggestTargetByWordCount(project?.wordCount ?? 0),
        [project?.wordCount]
    );

    useEffect(() => {
        if (publishTargetFromRoute) {
            setSelectedTarget(publishTargetFromRoute);
            setManualSelection(true);
            return;
        }

        if (!manualSelection) {
            setSelectedTarget(suggestedTarget);
        }
    }, [manualSelection, publishTargetFromRoute, suggestedTarget]);

    const handleBack = () => navigate({ type: 'tab', id: 'write' });
    const isBusy = createReleaseMutation.isLoading || publishReleaseMutation.isLoading;
    const matchingReleaseId =
        selectedTarget && publishTargetFromRoute === selectedTarget
            ? releaseIdFromRoute
            : '';

    const persistPublishState = (params: {
        releaseId?: string;
        publishTarget?: PublishTarget;
    }) => {
        if (!projectId) return;
        navigate(
            {
                type: 'immersive',
                id: 'projectPublish',
                params: {
                    projectId,
                    ...(params.releaseId ? { releaseId: params.releaseId } : {}),
                    ...(params.publishTarget ? { publishTarget: params.publishTarget } : {}),
                },
            },
            { replace: true }
        );
    };

    const buildPreflightErrorMessage = (chapterNumber?: number) =>
        lang === 'en'
            ? (chapterNumber
                ? `Chapter ${chapterNumber} needs a heading before its text begins.`
                : 'This manuscript needs one more structural fix before it can be published.')
            : (chapterNumber
                ? `الفصل ${chapterNumber} يحتاج إلى عنوان قبل أن يبدأ النص.`
                : 'هذه المخطوطة تحتاج إلى تعديل بنيوي واحد قبل النشر.');

    const ensureReleaseForTarget = async (target: PublishTarget): Promise<string> => {
        if (!projectId || !project) {
            throw new Error(lang === 'en' ? 'Project not found.' : 'المشروع غير موجود.');
        }

        const preflight = validateReleasePreflight(project.contentDoc);
        if (!preflight.ok) {
            const message = buildPreflightErrorMessage(preflight.chapterNumber);
            setPreflightError(message);
            throw new Error(message);
        }

        setPreflightError(null);

        if (matchingReleaseId) {
            return matchingReleaseId;
        }

        const created = await createReleaseMutation.mutateAsync({
            projectId,
            publishKind: target === 'ebook' ? 'ebook_epub' : 'blog',
        });

        persistPublishState({
            releaseId: created.releaseId,
            publishTarget: target,
        });
        return created.releaseId;
    };

    const openPreview = (releaseId: string, target: PublishTarget) => {
        if (!projectId) return;
        navigate({
            type: 'immersive',
            id: 'projectPreview',
            params: {
                projectId,
                releaseId,
                previewType: target,
                from: {
                    type: 'immersive',
                    id: 'projectPublish',
                    params: {
                        projectId,
                        releaseId,
                        publishTarget: target,
                    },
                },
            },
        });
    };

    const handleTargetSelect = (target: PublishTarget) => {
        setSelectedTarget(target);
        setManualSelection(true);
        setPreflightError(null);
        persistPublishState({ publishTarget: target });
    };

    const handlePreview = async () => {
        if (!selectedTarget) {
            showToast(lang === 'en' ? 'Choose how you want to publish first.' : 'اختر طريقة النشر أولاً.');
            return;
        }

        setActiveAction('preview');
        try {
            const releaseId = await ensureReleaseForTarget(selectedTarget);
            openPreview(releaseId, selectedTarget);
        } catch (error) {
            const message = error instanceof Error ? error.message.trim() : '';
            if (message) {
                showToast(message);
            }
        } finally {
            setActiveAction('idle');
        }
    };

    const handlePublish = async () => {
        if (!selectedTarget || !projectId || !project) {
            showToast(lang === 'en' ? 'Choose how you want to publish first.' : 'اختر طريقة النشر أولاً.');
            return;
        }

        setActiveAction('publish');
        try {
            const releaseId = await ensureReleaseForTarget(selectedTarget);
            const result = await publishReleaseMutation.mutateAsync({
                releaseId,
                target: selectedTarget,
                projectId,
            });

            navigate({
                type: 'immersive',
                id: 'projectPublished',
                params: {
                    projectId,
                    releaseId,
                    publishTarget: selectedTarget,
                    title: lang === 'en' ? project.titleEn : project.titleAr,
                    ...(project.coverUrl ? { coverUrl: project.coverUrl } : {}),
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
            const message = error instanceof Error ? error.message.trim() : '';
            if (message) {
                showToast(message);
            } else {
                showToast(lang === 'en' ? 'Publishing failed.' : 'فشل النشر.');
            }
        } finally {
            setActiveAction('idle');
        }
    };

    if (isLoading) {
        return <div className="h-screen flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
    }

    if (!project) {
        return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Project not found</div>;
    }

    const synopsis = extractProjectSynopsis({
        contentDoc: project.contentDoc,
        html: project.content,
    });
    const publishButtonLabel =
        project.isPublished
            ? (lang === 'en' ? 'Publish Update' : 'نشر التحديث')
            : (lang === 'en' ? 'Publish' : 'نشر');
    const previewButtonLabel = lang === 'en' ? 'Preview' : 'معاينة';

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader titleEn="Publish Project" titleAr="نشر المشروع" onBack={handleBack} />

            <main className="flex-grow overflow-y-auto pt-24 pb-8">
                <div className="container mx-auto max-w-4xl px-4 md:px-8">
                    <GlassCard className="mb-8 !bg-white/5 !p-5">
                        <div className="flex items-start gap-4">
                            <div className="w-24 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-800 md:w-28">
                                {project.coverUrl ? (
                                    <img src={project.coverUrl} alt="Cover" className="aspect-[2/3] h-full w-full object-cover" />
                                ) : (
                                    <div className="flex aspect-[2/3] items-center justify-center text-slate-500">
                                        <BookIcon className="h-8 w-8" />
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <BilingualText role="H1" className="!mb-2 !text-3xl">
                                    {lang === 'en' ? project.titleEn : project.titleAr}
                                </BilingualText>
                                <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-slate-400">
                                    <span>{project.wordCount.toLocaleString()} {lang === 'en' ? 'words' : 'كلمة'}</span>
                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-slate-300">
                                        {project.status}
                                    </span>
                                    {project.isPublished ? (
                                        <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-emerald-200">
                                            {lang === 'en' ? 'Published' : 'منشور'}
                                        </span>
                                    ) : null}
                                </div>
                                <p className="max-w-2xl text-sm leading-7 text-white/70">
                                    {synopsis || (lang === 'en' ? 'Ready to publish when you are.' : 'جاهز للنشر متى ما كنت جاهزاً.')}
                                </p>
                            </div>
                        </div>
                    </GlassCard>

                    <div className="mb-8 rounded-xl border border-white/5 bg-slate-800/50 p-6">
                        <BilingualText role="H1" className="!mb-4 !text-lg">
                            {lang === 'en' ? 'Publish as' : 'انشر كـ'}
                        </BilingualText>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => handleTargetSelect('blog')}
                                className={`rounded-xl border p-4 text-left transition ${
                                    selectedTarget === 'blog'
                                        ? 'border-emerald-400 bg-emerald-500/10'
                                        : 'border-white/10 bg-black/20 hover:border-white/20'
                                }`}
                            >
                                <div className="mb-2 flex items-center gap-3">
                                    <CheckCircleIcon className={`h-5 w-5 ${selectedTarget === 'blog' ? 'text-emerald-300' : 'text-slate-500'}`} />
                                    <div className="font-bold text-white">Blog</div>
                                </div>
                                <div className="text-xs text-slate-400">
                                    {lang === 'en'
                                        ? 'Publish as an article inside BookTown'
                                        : 'انشره كمقال داخل بوك تاون'}
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleTargetSelect('ebook')}
                                className={`rounded-xl border p-4 text-left transition ${
                                    selectedTarget === 'ebook'
                                        ? 'border-amber-300 bg-amber-500/10'
                                        : 'border-white/10 bg-black/20 hover:border-white/20'
                                }`}
                            >
                                <div className="mb-2 flex items-center gap-3">
                                    <CheckCircleIcon className={`h-5 w-5 ${selectedTarget === 'ebook' ? 'text-amber-300' : 'text-slate-500'}`} />
                                    <div className="font-bold text-white">Ebook</div>
                                </div>
                                <div className="text-xs text-slate-400">
                                    {lang === 'en'
                                        ? 'Publish as an ebook for BookTown Reader'
                                        : 'انشره ككتاب إلكتروني لقارئ بوك تاون'}
                                </div>
                            </button>
                        </div>
                    </div>

                    {preflightError ? (
                        <div className="mb-8 rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                            {preflightError}
                        </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Button
                            variant="secondary"
                            onClick={handlePreview}
                            disabled={!selectedTarget || isBusy}
                            className="w-full !h-14 !text-lg"
                        >
                            {activeAction === 'preview' && isBusy ? (
                                <div className="flex items-center gap-2">
                                    <LoadingSpinner />
                                    <span>{lang === 'en' ? 'Opening preview...' : 'جار فتح المعاينة...'}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <EyeIcon className="h-5 w-5" />
                                    <span>{previewButtonLabel}</span>
                                </div>
                            )}
                        </Button>

                        <Button
                            variant="primary"
                            onClick={handlePublish}
                            disabled={!selectedTarget || isBusy}
                            className="w-full !h-14 !text-lg shadow-lg shadow-primary/20 transition-all"
                        >
                            {activeAction === 'publish' && isBusy ? (
                                <div className="flex items-center gap-2">
                                    <LoadingSpinner />
                                    <span>{lang === 'en' ? 'Publishing...' : 'جار النشر...'}</span>
                                </div>
                            ) : (
                                publishButtonLabel
                            )}
                        </Button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ProjectPublishScreen;
