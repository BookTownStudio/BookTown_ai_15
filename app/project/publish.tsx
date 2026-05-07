import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import { useProjectDetails } from '../../lib/hooks/useProjectDetails.ts';
import {
    useCreateProjectRelease,
    usePublishProjectRelease,
    useUpdateProject,
} from '../../lib/hooks/useProjectMutations.ts';
import { useProjectPublicationSettings } from '../../lib/hooks/useProjectPublicationSettings.ts';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { CheckCircleIcon } from '../../components/icons/CheckCircleIcon.tsx';
import { EyeIcon } from '../../components/icons/EyeIcon.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { EditIcon } from '../../components/icons/EditIcon.tsx';
import { UploadIcon } from '../../components/icons/UploadIcon.tsx';
import { useToast } from '../../store/toast.tsx';
import { validateReleasePreflight } from '../../lib/publishing/releasePreflight.ts';
import { useMediaUpload } from '../../lib/hooks/useMediaUpload.ts';

type PublishTarget = 'blog' | 'ebook';
type PublicationVisibility = 'public' | 'private';
type PublishAction = 'idle' | 'preview' | 'publish';
const PUBLISH_SUCCESS_CELEBRATION_STORAGE_KEY = 'booktown:publish-success-pending';

function normalizePublicationVisibility(value: unknown): PublicationVisibility | undefined {
    return value === 'private' || value === 'public' ? value : undefined;
}

function suggestTargetByWordCount(wordCount: number): PublishTarget {
    return wordCount >= 8000 ? 'ebook' : 'blog';
}

function detectRepublishTarget(project: ReturnType<typeof useProjectDetails>['data']): PublishTarget | null {
    if (!project?.isPublished) {
        return null;
    }

    const hasBlogPublication =
        typeof project.publishedPublicationId === 'string' && project.publishedPublicationId.trim().length > 0;
    const hasEbookPublication =
        typeof project.publishedBookId === 'string' && project.publishedBookId.trim().length > 0;

    if (project.lastPublishedTarget === 'ebook' && hasEbookPublication) {
        return 'ebook';
    }

    if (project.lastPublishedTarget === 'blog' && hasBlogPublication) {
        return 'blog';
    }

    if (hasEbookPublication && !hasBlogPublication) {
        return 'ebook';
    }

    if (hasBlogPublication && !hasEbookPublication) {
        return 'blog';
    }

    return null;
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
    const publishVisibilityFromRoute =
        currentView.type === 'immersive'
            ? normalizePublicationVisibility(currentView.params?.visibility)
            : undefined;

    const { data: project, isLoading } = useProjectDetails(projectId);
    const hasLinkedCanonicalPublication =
        !!project?.publishedBookId || !!project?.publishedPublicationId;
    const { data: publicationSettings } = useProjectPublicationSettings(
        projectId,
        hasLinkedCanonicalPublication
    );
    const createReleaseMutation = useCreateProjectRelease();
    const publishReleaseMutation = usePublishProjectRelease();
    const updateProjectMutation = useUpdateProject();
    const { upload, isUploading: isCoverUploading } = useMediaUpload();
    const [selectedTarget, setSelectedTarget] = useState<PublishTarget | null>(
        publishTargetFromRoute ?? null
    );
    const [manualSelection, setManualSelection] = useState(Boolean(publishTargetFromRoute));
    const [selectedVisibilityByTarget, setSelectedVisibilityByTarget] = useState<Record<PublishTarget, PublicationVisibility>>({
        blog: publishVisibilityFromRoute && publishTargetFromRoute === 'blog' ? publishVisibilityFromRoute : 'public',
        ebook: publishVisibilityFromRoute && publishTargetFromRoute === 'ebook' ? publishVisibilityFromRoute : 'public',
    });
    const [manualVisibilitySelection, setManualVisibilitySelection] = useState<Record<PublishTarget, boolean>>({
        blog: publishTargetFromRoute === 'blog' && Boolean(publishVisibilityFromRoute),
        ebook: publishTargetFromRoute === 'ebook' && Boolean(publishVisibilityFromRoute),
    });
    const [preflightError, setPreflightError] = useState<string | null>(null);
    const [activeAction, setActiveAction] = useState<PublishAction>('idle');
    const coverInputRef = useRef<HTMLInputElement>(null);

    const suggestedTarget = useMemo(
        () => suggestTargetByWordCount(project?.wordCount ?? 0),
        [project?.wordCount]
    );
    const republishTarget = useMemo(() => detectRepublishTarget(project), [project]);

    useEffect(() => {
        if (publishTargetFromRoute) {
            setSelectedTarget(publishTargetFromRoute);
            setManualSelection(true);
            return;
        }

        if (!manualSelection) {
            setSelectedTarget(republishTarget ?? suggestedTarget);
        }
    }, [manualSelection, publishTargetFromRoute, republishTarget, suggestedTarget]);

    useEffect(() => {
        setSelectedVisibilityByTarget((previous) => {
            const next = { ...previous };

            if (!manualVisibilitySelection.blog && publicationSettings?.blog?.visibility) {
                next.blog = publicationSettings.blog.visibility;
            } else if (!manualVisibilitySelection.blog && !project?.publishedPublicationId) {
                next.blog = 'public';
            }

            if (!manualVisibilitySelection.ebook && publicationSettings?.ebook?.visibility) {
                next.ebook = publicationSettings.ebook.visibility;
            } else if (!manualVisibilitySelection.ebook && !project?.publishedBookId) {
                next.ebook = 'public';
            }

            if (
                publishTargetFromRoute &&
                publishVisibilityFromRoute &&
                !manualVisibilitySelection[publishTargetFromRoute]
            ) {
                next[publishTargetFromRoute] = publishVisibilityFromRoute;
            }

            return next;
        });
    }, [
        manualVisibilitySelection,
        project?.publishedBookId,
        project?.publishedPublicationId,
        publicationSettings?.blog?.visibility,
        publicationSettings?.ebook?.visibility,
        publishTargetFromRoute,
        publishVisibilityFromRoute,
    ]);

    const handleBack = () => navigate({ type: 'tab', id: 'write' });
    const isBusy = createReleaseMutation.isPending || publishReleaseMutation.isPending;
    const isCoverMutating = isCoverUploading || updateProjectMutation.isPending;
    const matchingReleaseId =
        selectedTarget && publishTargetFromRoute === selectedTarget
            ? releaseIdFromRoute
            : '';

    const persistPublishState = (params: {
        releaseId?: string;
        publishTarget?: PublishTarget;
        visibility?: PublicationVisibility;
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
                    ...(params.visibility ? { visibility: params.visibility } : {}),
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
            visibility: selectedVisibilityByTarget[target],
        });
        return created.releaseId;
    };

    const openPreview = (releaseId: string, target: PublishTarget) => {
        if (!projectId) return;
        const visibility = selectedVisibilityByTarget[target];
        navigate({
            type: 'immersive',
            id: 'projectPreview',
            params: {
                projectId,
                releaseId,
                previewType: target,
                visibility,
                from: {
                    type: 'immersive',
                    id: 'projectPublish',
                    params: {
                        projectId,
                        releaseId,
                        publishTarget: target,
                        visibility,
                    },
                },
            },
        });
    };

    const handleTargetSelect = (target: PublishTarget) => {
        setSelectedTarget(target);
        setManualSelection(true);
        setPreflightError(null);
        persistPublishState({
            publishTarget: target,
            visibility: selectedVisibilityByTarget[target],
        });
    };

    const handleVisibilityChange = (target: PublishTarget, visibility: PublicationVisibility) => {
        setSelectedVisibilityByTarget((previous) => ({
            ...previous,
            [target]: visibility,
        }));
        setManualVisibilitySelection((previous) => ({
            ...previous,
            [target]: true,
        }));

        if (selectedTarget === target) {
            persistPublishState({
                releaseId: matchingReleaseId || undefined,
                publishTarget: target,
                visibility,
            });
        }
    };

    const handleCoverPickerOpen = () => {
        if (!projectId || isCoverMutating) {
            return;
        }
        coverInputRef.current?.click();
    };

    const handleCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file || !projectId) {
            return;
        }

        try {
            const url = await upload(file, 'cover', projectId);
            if (!url) {
                return;
            }

            await updateProjectMutation.mutateAsync({
                projectId,
                updates: {
                    coverUrl: url,
                },
            });
        } catch (error) {
            const message =
                error instanceof Error && error.message.trim()
                    ? error.message.trim()
                    : (lang === 'en' ? 'Unable to update cover.' : 'تعذّر تحديث الغلاف.');
            showToast(message);
        }
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
                visibility: selectedVisibilityByTarget[selectedTarget],
            });

            if (typeof window !== 'undefined') {
                const celebrationToken = crypto.randomUUID();
                window.sessionStorage.setItem(
                    PUBLISH_SUCCESS_CELEBRATION_STORAGE_KEY,
                    JSON.stringify({
                        token: celebrationToken,
                        projectId,
                        releaseId,
                        publishTarget: selectedTarget,
                        publicationVersion: result.publicationVersion,
                    })
                );
            }

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

    const publishButtonLabel =
        project.isPublished
            ? (lang === 'en' ? 'Publish Update' : 'نشر التحديث')
            : (lang === 'en' ? 'Publish' : 'نشر');
    const previewButtonLabel = lang === 'en' ? 'Preview' : 'معاينة';
    const selectedVisibility = selectedTarget ? selectedVisibilityByTarget[selectedTarget] : 'public';

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader titleEn="Publish Project" titleAr="نشر المشروع" onBack={handleBack} />

            <main className="flex-grow overflow-y-auto pt-24 pb-40">
                <div className="container mx-auto max-w-4xl px-4 md:px-8">
                    <div className="mb-4 rounded-2xl border border-white/5 bg-slate-800/50 p-4">
                        <div className="flex items-start gap-4">
                            <button
                                type="button"
                                onClick={handleCoverPickerOpen}
                                disabled={isCoverMutating || !projectId}
                                className="group relative w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-slate-800 text-left transition hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-80 md:w-24"
                                aria-label={lang === 'en' ? 'Add or replace cover' : 'إضافة أو استبدال الغلاف'}
                            >
                                {project.coverUrl ? (
                                    <>
                                        <img src={project.coverUrl} alt="Cover" className="aspect-[2/3] h-full w-full object-cover" />
                                        <div className="pointer-events-none absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg transition group-hover:bg-black/65">
                                            {isCoverMutating ? (
                                                <LoadingSpinner />
                                            ) : (
                                                <EditIcon className="h-3.5 w-3.5" />
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex aspect-[2/3] h-full w-full flex-col items-center justify-center gap-2 px-2 text-center text-slate-400">
                                        {isCoverMutating ? (
                                            <LoadingSpinner />
                                        ) : (
                                            <>
                                                <BookIcon className="h-7 w-7 text-slate-500" />
                                                <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-200">
                                                    <UploadIcon className="h-3 w-3" />
                                                    <span>{lang === 'en' ? 'Add Cover' : 'أضف غلافاً'}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                                <input
                                    ref={coverInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleCoverUpload}
                                    className="hidden"
                                />
                            </button>
                            <div className="min-w-0 flex-1">
                                <BilingualText role="H1" className="!mb-2 !text-2xl">
                                    {lang === 'en' ? project.titleEn : project.titleAr}
                                </BilingualText>
                                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
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
                            </div>
                        </div>
                    </div>

                    <div className="mb-4 rounded-2xl border border-white/5 bg-slate-800/50 p-5">
                        <BilingualText role="H1" className="!mb-4 !text-lg">
                            {lang === 'en' ? 'Publish as' : 'انشر كـ'}
                        </BilingualText>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => handleTargetSelect('blog')}
                                className={`rounded-xl border px-4 py-3 text-left transition ${
                                    selectedTarget === 'blog'
                                        ? 'border-emerald-400 bg-emerald-500/10'
                                        : 'border-white/10 bg-black/20 hover:border-white/20'
                                }`}
                            >
                                <div className="mb-1.5 flex items-center gap-3">
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
                                className={`rounded-xl border px-4 py-3 text-left transition ${
                                    selectedTarget === 'ebook'
                                        ? 'border-amber-300 bg-amber-500/10'
                                        : 'border-white/10 bg-black/20 hover:border-white/20'
                                }`}
                            >
                                <div className="mb-1.5 flex items-center gap-3">
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

                    <div className="mb-5 rounded-2xl border border-white/5 bg-slate-800/50 px-4 py-3.5">
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <div className="text-sm font-semibold text-white">
                                    {lang === 'en' ? 'Visibility' : 'الظهور'}
                                </div>
                                <div className="mt-1 text-xs text-slate-400">
                                    {lang === 'en'
                                        ? 'Who can open this publication'
                                        : 'من يمكنه فتح هذا المنشور'}
                                </div>
                            </div>
                            <div className={`flex items-center gap-3 ${!selectedTarget ? 'opacity-60' : ''}`}>
                                <span className="text-sm font-medium text-white">
                                    {selectedVisibility === 'public'
                                        ? (lang === 'en' ? 'Public' : 'عام')
                                        : (lang === 'en' ? 'Private' : 'خاص')}
                                </span>
                                <label htmlFor="publish-visibility-toggle" className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        id="publish-visibility-toggle"
                                        type="checkbox"
                                        className="sr-only peer"
                                        checked={selectedVisibility === 'public'}
                                        disabled={!selectedTarget}
                                        onChange={(event) => {
                                            if (!selectedTarget) return;
                                            handleVisibilityChange(
                                                selectedTarget,
                                                event.target.checked ? 'public' : 'private'
                                            );
                                        }}
                                    />
                                    <div className="h-6 w-11 rounded-full bg-slate-600 transition-colors peer peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 peer-checked:bg-primary after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
                                </label>
                            </div>
                        </div>
                    </div>

                    {preflightError ? (
                        <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-4 text-sm text-red-100">
                            {preflightError}
                        </div>
                    ) : null}
                </div>
            </main>

            <div className="border-t border-white/5 bg-slate-900/95 px-4 pb-6 pt-3 backdrop-blur md:px-8">
                <div className="container mx-auto max-w-4xl">
                    <Button
                        variant="ghost"
                        onClick={handlePreview}
                        disabled={!selectedTarget || isBusy}
                        className="mb-3 w-full !justify-center !text-slate-200 hover:!bg-white/5 hover:!text-white"
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
        </div>
    );
};

export default ProjectPublishScreen;
