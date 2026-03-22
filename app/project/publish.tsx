import React, { useEffect, useState } from 'react';
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
    const [confirmingPublish, setConfirmingPublish] = useState(false);
    const [preflightError, setPreflightError] = useState<string | null>(null);

    useEffect(() => {
        if (publishTargetFromRoute) {
            setSelectedTarget(publishTargetFromRoute);
        }
    }, [publishTargetFromRoute]);

    const handleBack = () => navigate({ type: 'tab', id: 'write' });
    const isBusy = createReleaseMutation.isLoading || publishReleaseMutation.isLoading;
    const preparedReleaseId = releaseIdFromRoute;
    const preparedTarget = publishTargetFromRoute;
    const hasPreparedRelease =
        !!preparedReleaseId &&
        !!selectedTarget &&
        preparedTarget === selectedTarget;

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

    const handleTargetSelect = (target: PublishTarget) => {
        setSelectedTarget(target);
        setConfirmingPublish(false);
        setPreflightError(null);

        if (preparedReleaseId && preparedTarget !== target) {
            persistPublishState({ publishTarget: target });
            return;
        }

        if (!preparedReleaseId && publishTargetFromRoute !== target) {
            persistPublishState({ publishTarget: target });
        }
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

    const handlePreview = async () => {
        if (!projectId || !project || !selectedTarget) {
            showToast(lang === 'en' ? 'Select a publish target first.' : 'اختر نوع النشر أولاً.');
            return;
        }

        const preflight = validateReleasePreflight(project.contentDoc);
        if (!preflight.ok) {
            const localizedMessage =
                lang === 'en'
                    ? preflight.message
                    : preflight.chapterNumber
                        ? `الفصل ${preflight.chapterNumber} يفتقد عنواناً مباشراً بعد الفاصل البنيوي.`
                        : 'هذا المخطوط يفتقد محتوى المحرر البنيوي ولا يمكن تجهيزه للنشر.';
            setPreflightError(localizedMessage);
            showToast(localizedMessage);
            return;
        }

        setPreflightError(null);

        if (hasPreparedRelease && preparedReleaseId) {
            openPreview(preparedReleaseId, selectedTarget);
            return;
        }

        try {
            const created = await createReleaseMutation.mutateAsync({
                projectId,
                publishKind: selectedTarget === 'ebook' ? 'ebook_epub' : 'blog',
            });

            persistPublishState({
                releaseId: created.releaseId,
                publishTarget: selectedTarget,
            });
            openPreview(created.releaseId, selectedTarget);
        } catch (error) {
            const message = error instanceof Error ? error.message : '';
            showToast(
                message || (
                    lang === 'en'
                        ? 'Failed to prepare the preview release.'
                        : 'فشل تجهيز نسخة المعاينة.'
                )
            );
        }
    };

    const handlePublish = async () => {
        if (!projectId || !project || !selectedTarget || !hasPreparedRelease || !preparedReleaseId) {
            showToast(
                lang === 'en'
                    ? 'Preview this release before publishing.'
                    : 'قم بمعاينة هذه النسخة قبل النشر.'
            );
            return;
        }

        try {
            const result = await publishReleaseMutation.mutateAsync({
                releaseId: preparedReleaseId,
                target: selectedTarget,
                projectId,
            });

            navigate({
                type: 'immersive',
                id: 'projectPublished',
                params: {
                    projectId,
                    releaseId: preparedReleaseId,
                    publishTarget: selectedTarget,
                    title: lang === 'en' ? project.titleEn : project.titleAr,
                    ...(project.coverUrl ? { coverUrl: project.coverUrl } : {}),
                    ...(result.target === 'ebook'
                        ? { bookId: result.bookId }
                        : { publicationId: result.publicationId }),
                },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : '';
            showToast(
                message || (
                    lang === 'en'
                        ? 'Publishing failed.'
                        : 'فشل النشر.'
                )
            );
        } finally {
            setConfirmingPublish(false);
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

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader titleEn="Publish Project" titleAr="نشر المشروع" onBack={handleBack} />

            <main className="flex-grow overflow-y-auto pt-24 pb-8">
                <div className="container mx-auto max-w-3xl px-4 md:px-8">
                    <div className="mb-8 flex flex-col items-start gap-8 md:flex-row">
                        <div className="w-full overflow-hidden rounded-lg border border-white/10 bg-slate-800 text-slate-600 shadow-2xl md:w-48 md:aspect-[2/3]">
                            {project.coverUrl ? (
                                <img src={project.coverUrl} alt="Cover" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex aspect-[2/3] items-center justify-center">
                                    <BookIcon className="h-12 w-12 opacity-50" />
                                </div>
                            )}
                        </div>
                        <div className="flex-grow">
                            <BilingualText role="H1" className="!mb-2 !text-3xl">
                                {lang === 'en' ? project.titleEn : project.titleAr}
                            </BilingualText>
                            <BilingualText className="mb-4 text-accent">
                                {lang === 'en' ? project.typeEn : project.typeAr}
                            </BilingualText>
                            <GlassCard className="!bg-white/5 !p-4">
                                <BilingualText role="Caption" className="mb-2 uppercase tracking-wider text-slate-400">
                                    Synopsis
                                </BilingualText>
                                <p className="italic text-white/80">
                                    {synopsis || (lang === 'en' ? 'No synopsis available yet.' : 'لا يوجد ملخص متاح بعد.')}
                                </p>
                            </GlassCard>
                        </div>
                    </div>

                    <div className="mb-8 rounded-xl border border-white/5 bg-slate-800/50 p-6">
                        <BilingualText role="H1" className="!mb-4 !text-lg">
                            {lang === 'en' ? 'Publish Target' : 'نوع النشر'}
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
                                        ? 'Internal BookTown longform publication'
                                        : 'منشور طويل داخل منظومة بوكتاون'}
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
                                    <div className="font-bold text-white">Ebook (EPUB)</div>
                                </div>
                                <div className="text-xs text-slate-400">
                                    {lang === 'en'
                                        ? 'Native BookTown ebook with reader-ready attachment'
                                        : 'كتاب إلكتروني أصلي داخل بوكتاون وجاهز للقارئ'}
                                </div>
                            </button>
                        </div>
                    </div>

                    <GlassCard className="mb-8 !bg-white/5 !p-5">
                        <BilingualText role="Caption" className="mb-3 uppercase tracking-wider text-slate-400">
                            {lang === 'en' ? 'Selected Release' : 'النسخة المحددة'}
                        </BilingualText>
                        {hasPreparedRelease ? (
                            <div className="space-y-2 text-sm text-white/80">
                                <div>
                                    {lang === 'en' ? 'Release ID:' : 'معرف النسخة:'}{' '}
                                    <span className="font-mono text-white">{preparedReleaseId}</span>
                                </div>
                                <div>
                                    {lang === 'en' ? 'Target:' : 'الوجهة:'}{' '}
                                    <span className="text-white">{selectedTarget === 'ebook' ? 'Ebook' : 'Blog'}</span>
                                </div>
                                <div className="text-xs text-slate-400">
                                    {lang === 'en'
                                        ? 'Only this prepared release can be published from this screen.'
                                        : 'يمكن نشر هذه النسخة الجاهزة فقط من هذه الشاشة.'}
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-slate-400">
                                {lang === 'en'
                                    ? 'No preview release is prepared yet. Select a target and create a preview first.'
                                    : 'لا توجد نسخة معاينة جاهزة بعد. اختر نوع النشر وأنشئ المعاينة أولاً.'}
                            </p>
                        )}
                    </GlassCard>

                    {preflightError ? (
                        <div className="mb-8 rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                            {preflightError}
                        </div>
                    ) : null}

                    <div className="flex flex-col gap-4">
                        <Button
                            variant="secondary"
                            onClick={handlePreview}
                            disabled={!selectedTarget || isBusy}
                            className="w-full !h-14 !text-lg"
                        >
                            {createReleaseMutation.isLoading ? (
                                <div className="flex items-center gap-2">
                                    <LoadingSpinner />
                                    <span>{lang === 'en' ? 'Preparing release...' : 'جار تجهيز النسخة...'}</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <EyeIcon className="h-5 w-5" />
                                    <span>
                                        {hasPreparedRelease
                                            ? (lang === 'en' ? 'Open Preview' : 'فتح المعاينة')
                                            : (lang === 'en' ? 'Create Preview Release' : 'إنشاء نسخة المعاينة')}
                                    </span>
                                </div>
                            )}
                        </Button>

                        {!confirmingPublish ? (
                            <Button
                                variant="primary"
                                onClick={() => setConfirmingPublish(true)}
                                disabled={!hasPreparedRelease || isBusy}
                                className="w-full !h-14 !text-lg shadow-lg shadow-primary/20 transition-all"
                            >
                                {publishReleaseMutation.isLoading ? (
                                    <div className="flex items-center gap-2">
                                        <LoadingSpinner />
                                        <span>{lang === 'en' ? 'Publishing...' : 'جار النشر...'}</span>
                                    </div>
                                ) : (
                                    lang === 'en' ? 'Publish This Release' : 'نشر هذه النسخة'
                                )}
                            </Button>
                        ) : (
                            <GlassCard className="border border-amber-300/20 !bg-amber-500/10 !p-5">
                                <div className="mb-4 text-sm text-white">
                                    {lang === 'en'
                                        ? `Confirm publishing release ${preparedReleaseId} as ${selectedTarget === 'ebook' ? 'ebook' : 'blog'}.`
                                        : `أكد نشر النسخة ${preparedReleaseId} كـ ${selectedTarget === 'ebook' ? 'كتاب إلكتروني' : 'مدونة'}.`}
                                </div>
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <Button
                                        variant="primary"
                                        onClick={handlePublish}
                                        disabled={isBusy}
                                        className="flex-1"
                                    >
                                        {publishReleaseMutation.isLoading
                                            ? (lang === 'en' ? 'Publishing...' : 'جار النشر...')
                                            : (lang === 'en' ? 'Confirm Publish' : 'تأكيد النشر')}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        onClick={() => setConfirmingPublish(false)}
                                        disabled={isBusy}
                                        className="flex-1"
                                    >
                                        {lang === 'en' ? 'Cancel' : 'إلغاء'}
                                    </Button>
                                </div>
                            </GlassCard>
                        )}

                        <p className="text-center text-xs text-slate-500">
                            {lang === 'en'
                                ? 'Preview stays separate. Publishing only uses the selected release shown above.'
                                : 'المعاينة تبقى منفصلة. النشر يستخدم فقط النسخة المحددة أعلاه.'}
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ProjectPublishScreen;
