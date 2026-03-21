
import React, { useState, useRef, useCallback, useEffect } from 'react';
import AppNav from '../../components/navigation/AppNav.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { PlusIcon } from '../../components/icons/PlusIcon.tsx';
import { useUserProjects } from '../../lib/hooks/useUserProjects.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import ProjectCard from '../../components/content/ProjectCard.tsx';
import TemplateCard from '../../components/content/TemplateCard.tsx';
import FloatingActionPanel from '../../components/ui/FloatingActionPanel.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { TemplatesIcon } from '../../components/icons/TemplatesIcon.tsx';
import Button from '../../components/ui/Button.tsx';
import { useCreateProjectShareLink, useDeleteProject, useDuplicateProject, useUpdateProject } from '../../lib/hooks/useProjectMutations.ts';
import ConfirmDeleteModal from '../../components/modals/ConfirmDeleteModal.tsx';
import { Project } from '../../types/entities.ts';
import { useToast } from '../../store/toast.tsx';
import LiteraryShell from '../../components/layout/LiteraryShell.tsx';
import { useCreateProject } from '../../lib/hooks/useCreateProject.ts';
import { createBlankProjectSeed, createProjectSeedFromTemplate, writeTemplates } from '../../lib/templates/writeTemplates.ts';

interface TemplatesPanelTriggerProps {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
    pendingCreationKey: string | null;
    onSelectTemplate: (templateId: string) => void;
}

const TemplatesPanelTrigger: React.FC<TemplatesPanelTriggerProps> = ({
    isOpen,
    onOpen,
    onClose,
    pendingCreationKey,
    onSelectTemplate,
}) => {
    const { lang } = useI18n();
    const [currentPage, setCurrentPage] = useState(0);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const chunk = <T,>(items: T[], size: number): T[][] =>
        Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
            items.slice(index * size, index * size + size)
        );

    const templatePages = chunk(writeTemplates, 4);

    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) {
            return;
        }

        const { scrollLeft, clientWidth } = scrollContainerRef.current;
        const nextPage = Math.round(scrollLeft / clientWidth);
        if (nextPage !== currentPage) {
            setCurrentPage(nextPage);
        }
    }, [currentPage]);

    useEffect(() => {
        if (!isOpen) {
            setCurrentPage(0);
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTo({ left: 0, behavior: 'instant' as ScrollBehavior });
            }
        }
    }, [isOpen]);

    return (
        <>
            <div
                className="fixed bottom-[72px] left-0 right-0 z-20 flex justify-center pointer-events-none"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <button
                    onClick={onOpen}
                    className="flex items-center gap-2 rounded-full border border-black/5 bg-gray-100/80 px-6 py-3 text-slate-800 shadow-xl shadow-primary/10 backdrop-blur-md transition-all duration-300 ease-in-out hover:-translate-y-1 hover:scale-105 hover:shadow-2xl hover:shadow-primary/20 active:scale-100 pointer-events-auto dark:border-white/10 dark:bg-slate-800/80 dark:text-white dark:shadow-black/40"
                    aria-label={lang === 'en' ? 'Open Templates' : 'فتح القوالب'}
                >
                    <TemplatesIcon className="h-5 w-5 text-accent" />
                    <BilingualText className="font-bold text-lg">
                        {lang === 'en' ? 'Templates' : 'القوالب'}
                    </BilingualText>
                </button>
            </div>

            <FloatingActionPanel isOpen={isOpen} onClose={onClose}>
                <div>
                    <div
                        ref={scrollContainerRef}
                        onScroll={handleScroll}
                        className="flex overflow-x-auto snap-x snap-mandatory gap-0"
                    >
                        {templatePages.map((page, pageIndex) => (
                            <div
                                key={pageIndex}
                                className="w-full flex-shrink-0 snap-start grid grid-cols-2 gap-4 p-1"
                            >
                                {page.map((template) => (
                                    <div
                                        key={template.id}
                                        className={template.id === 'article-blog' ? 'col-span-2' : ''}
                                    >
                                        <TemplateCard
                                            title={lang === 'en' ? template.titleEn : template.titleAr}
                                            description={lang === 'en' ? template.descriptionEn : template.descriptionAr}
                                            icon={template.icon}
                                            featured={template.id === 'article-blog'}
                                            disabled={pendingCreationKey !== null}
                                            onClick={() => {
                                                onClose();
                                                onSelectTemplate(template.id);
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    {templatePages.length > 1 ? (
                        <div className="mt-4 flex items-center justify-center gap-2">
                            {templatePages.map((_, index) => (
                                <div
                                    key={index}
                                    className={`h-2 w-2 rounded-full transition-colors ${currentPage === index ? 'bg-accent' : 'bg-slate-500/50'}`}
                                />
                            ))}
                        </div>
                    ) : null}
                </div>
            </FloatingActionPanel>
        </>
    );
};

const WriteScreen: React.FC = () => {
    const { lang } = useI18n();
    const { showToast } = useToast();
    const { data: projects, isLoading, isError, error } = useUserProjects();
    const { navigate, currentView, resetTokens } = useNavigation();
    const isInitialMount = useRef(true);
    const [isPanelOpen, setPanelOpen] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
    const [activeMenuProjectId, setActiveMenuProjectId] = useState<string | null>(null);
    const [activeMenuDirection, setActiveMenuDirection] = useState<'up' | 'down'>('down');
    const [pendingDuplicateProjectId, setPendingDuplicateProjectId] = useState<string | null>(null);
    const [pendingCreationKey, setPendingCreationKey] = useState<string | null>(null);
    const menuTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    const { mutate: deleteProject, isLoading: isDeleting } = useDeleteProject();
    const { mutate: duplicateProject } = useDuplicateProject();
    const { mutate: updateProject } = useUpdateProject();
    const { mutate: createShareLink } = useCreateProjectShareLink();
    const { mutate: createProject } = useCreateProject();

    const closeActiveMenu = useCallback((options?: { restoreFocus?: boolean }) => {
        const activeId = activeMenuProjectId;
        setActiveMenuProjectId(null);

        if (options?.restoreFocus && activeId) {
            requestAnimationFrame(() => {
                menuTriggerRefs.current[activeId]?.focus();
            });
        }
    }, [activeMenuProjectId]);

    const computeMenuDirection = useCallback((projectId: string) => {
        const trigger = menuTriggerRefs.current[projectId];
        if (!trigger || typeof window === 'undefined') {
            return 'down';
        }

        const triggerRect = trigger.getBoundingClientRect();
        const estimatedMenuHeight = 248;
        const viewportMargin = 16;
        const spaceBelow = window.innerHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;

        if (spaceBelow < estimatedMenuHeight + viewportMargin && spaceAbove > spaceBelow) {
            return 'up';
        }

        return 'down';
    }, []);

    // When the user navigates away from the write tab, close any open project menus.
    useEffect(() => {
        if (currentView.type !== 'tab' || currentView.id !== 'write') {
            if (activeMenuProjectId) {
                closeActiveMenu();
            }
        }
    }, [closeActiveMenu, currentView, activeMenuProjectId]);

    // Tab Reset Effect
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
        } else {
            // A non-zero token indicates a reset has been triggered.
            if (resetTokens.write > 0) {
                setPanelOpen(false);
                closeActiveMenu();
            }
        }
    }, [closeActiveMenu, resetTokens.write]);

    useEffect(() => {
        if (!activeMenuProjectId) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeActiveMenu({ restoreFocus: true });
            }
        };

        const syncDirection = () => {
            setActiveMenuDirection(computeMenuDirection(activeMenuProjectId));
        };

        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', syncDirection);
        window.addEventListener('scroll', syncDirection, true);
        syncDirection();

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', syncDirection);
            window.removeEventListener('scroll', syncDirection, true);
        };
    }, [activeMenuProjectId, closeActiveMenu, computeMenuDirection]);

    const registerMenuTrigger = useCallback((projectId: string, node: HTMLButtonElement | null) => {
        if (node) {
            menuTriggerRefs.current[projectId] = node;
            return;
        }

        delete menuTriggerRefs.current[projectId];
    }, []);

    const handleToggleMenu = (projectId: string) => {
        setActiveMenuProjectId(currentId => {
            if (currentId === projectId) {
                return null;
            }

            setActiveMenuDirection(computeMenuDirection(projectId));
            return projectId;
        });
    };

    const handleCreateProject = useCallback((creationKey: string, projectSeed: Omit<Project, 'id' | 'updatedAt' | 'createdAt'>) => {
        if (pendingCreationKey) {
            return;
        }

        setPendingCreationKey(creationKey);
        createProject(projectSeed, {
            onSuccess: (createdProject) => {
                setPendingCreationKey(null);
                navigate({ type: 'immersive', id: 'editor', params: { projectId: createdProject.id, from: currentView } });
            },
            onError: (creationError) => {
                console.error('[WRITE][CREATE_PROJECT_FAILED]', creationError);
                setPendingCreationKey(null);
                showToast(lang === 'en' ? 'Failed to create project.' : 'فشل إنشاء المشروع.');
            },
        });
    }, [createProject, currentView, lang, navigate, pendingCreationKey, showToast]);

    const handleNewProject = () => {
        handleCreateProject('blank', createBlankProjectSeed('book', lang === 'ar' ? 'ar' : 'en'));
    };

    const handleTemplateSelect = (templateId: string) => {
        handleCreateProject(templateId, createProjectSeedFromTemplate(templateId, lang === 'ar' ? 'ar' : 'en'));
    };

    // Updated: Navigate to Metadata Editor
    const handleEdit = (project: Project) => {
        closeActiveMenu();
        navigate({ type: 'immersive', id: 'projectEdit', params: { projectId: project.id, from: currentView } });
    };
    
    // Updated: Open actual Editor when clicking the card itself
    const handleOpenEditor = (project: Project) => {
        navigate({ type: 'immersive', id: 'editor', params: { projectId: project.id, from: currentView } });
    };

    const handleDelete = (project: Project) => {
        closeActiveMenu();
        setProjectToDelete(project);
    };
    
    const handleConfirmDelete = () => {
        if (projectToDelete) {
            deleteProject(projectToDelete.id, {
                onSuccess: () => setProjectToDelete(null),
            });
        }
    };

    const handleShare = (project: Project) => {
        closeActiveMenu();
        createShareLink(project.id, {
            onSuccess: async (share) => {
                const shareData = {
                    title: lang === 'en' ? project.titleEn : project.titleAr,
                    text: lang === 'en' ? 'Check out my story on BookTown.' : 'اطلع على قصتي في بوك تاون.',
                    url: share.shareUrl,
                };

                if (navigator.share) {
                    try {
                        await navigator.share(shareData);
                        return;
                    } catch (err: any) {
                        if (err?.name === 'AbortError') {
                            return;
                        }
                    }
                }

                try {
                    await navigator.clipboard.writeText(share.shareUrl);
                    showToast(lang === 'en' ? 'Share link copied.' : 'تم نسخ رابط المشاركة.');
                } catch {
                    showToast(lang === 'en' ? 'Share link ready.' : 'رابط المشاركة جاهز.');
                }
            },
            onError: () => {
                showToast(lang === 'en' ? 'Failed to create share link.' : 'فشل إنشاء رابط المشاركة.');
            }
        });
    };

    // Updated: Navigate to Publish Screen
    const handlePublish = (project: Project) => {
        closeActiveMenu();
        if (project.isPublished) {
            showToast(lang === 'en' ? 'This project is already published.' : 'تم نشر هذا المشروع بالفعل.');
            return;
        }
        navigate({ type: 'immersive', id: 'projectPublish', params: { projectId: project.id, from: currentView } });
    };

    const handleDuplicate = (projectId: string) => {
        if (pendingDuplicateProjectId === projectId) {
            return;
        }

        closeActiveMenu();
        setPendingDuplicateProjectId(projectId);
        duplicateProject(projectId, {
            onSettled: () => {
                setPendingDuplicateProjectId(currentId => (currentId === projectId ? null : currentId));
            },
        });
    };

    const handleStatusChange = (project: Project, newStatus: Project['status']) => {
        updateProject({
            projectId: project.id,
            updates: { status: newStatus }
        });
    };

    const renderContent = () => {
        if (isLoading) {
            return <div className="flex-grow flex items-center justify-center pt-16"><LoadingSpinner /></div>;
        }

        if (isError) {
            return (
                <div className="flex-grow flex flex-col items-center justify-center pt-16 text-center">
                    <BilingualText role="H1" className="!text-2xl text-red-500">
                        {lang === 'en' ? 'Projects Unavailable' : 'المشاريع غير متاحة'}
                    </BilingualText>
                    <BilingualText className="mt-2 text-slate-500 dark:text-white/60">
                        {error instanceof Error ? error.message : (lang === 'en' ? 'Failed to load projects.' : 'فشل تحميل المشاريع.')}
                    </BilingualText>
                </div>
            );
        }

        // Rule: STATE_INITIALIZATION_SAFETY
        const writeProjects = projects ?? [];

        if (writeProjects.length === 0) {
            return (
                <div className="flex-grow flex flex-col items-center justify-center pt-16 text-center text-slate-500 dark:text-white/60">
                    <BilingualText role="H1" className="!text-2xl">
                        {lang === 'en' ? 'Your canvas is empty.' : 'لوحتك فارغة.'}
                    </BilingualText>
                    <BilingualText className="mt-2">
                        {lang === 'en' ? 'Start a new book or pick a guided template below.' : 'ابدأ كتاباً جديداً أو اختر قالباً موجهاً في الأسفل.'}
                    </BilingualText>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {writeProjects.map(project => (
                    <ProjectCard 
                        key={project.id}
                        project={project}
                        isMenuOpen={activeMenuProjectId === project.id}
                        menuDirection={activeMenuProjectId === project.id ? activeMenuDirection : 'down'}
                        onToggleMenu={() => handleToggleMenu(project.id)}
                        onEdit={() => handleEdit(project)}
                        onDelete={() => handleDelete(project)}
                        onDuplicate={() => handleDuplicate(project.id)}
                        onShare={() => handleShare(project)}
                        onPublish={() => handlePublish(project)}
                        onStatusChange={(status) => handleStatusChange(project, status)}
                        onPress={() => handleOpenEditor(project)}
                        isDuplicatePending={pendingDuplicateProjectId === project.id}
                        onMenuTriggerRef={(node) => registerMenuTrigger(project.id, node)}
                    />
                ))}
            </div>
        );
    }

    return (
        <>
            <div className="h-screen flex flex-col">
                {activeMenuProjectId && (
                    <div
                        className="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            closeActiveMenu({ restoreFocus: true });
                        }}
                    />
                )}
                <AppNav titleEn="Write" titleAr="اكتب" />
                <main className="flex-grow overflow-y-auto pt-20 pb-32">
                    <LiteraryShell className="py-6">
                        <div className="flex justify-between items-center mb-8">
                            <BilingualText role="H1" className="!text-3xl !font-bold">
                                {lang === 'en' ? 'Your Projects' : 'مشاريعك'}
                            </BilingualText>
                            <Button 
                                variant="primary" 
                                size="icon"
                                onClick={handleNewProject} 
                                disabled={pendingCreationKey !== null}
                                className="!rounded-lg h-12 w-12 shadow-lg"
                                aria-label={lang === 'en' ? 'New Project' : 'مشروع جديد'}
                            >
                                {pendingCreationKey === 'blank' ? <LoadingSpinner /> : <PlusIcon className="h-6 w-6" />}
                            </Button>
                        </div>
                        
                        <div className="mb-6">
                            {renderContent()}
                        </div>
                    </LiteraryShell>
                </main>
                <TemplatesPanelTrigger
                    isOpen={isPanelOpen}
                    onOpen={() => setPanelOpen(true)}
                    onClose={() => setPanelOpen(false)}
                    pendingCreationKey={pendingCreationKey}
                    onSelectTemplate={handleTemplateSelect}
                />
            </div>
            <ConfirmDeleteModal
                isOpen={!!projectToDelete}
                onClose={() => setProjectToDelete(null)}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
                itemName={projectToDelete ? (lang === 'en' ? projectToDelete.titleEn : projectToDelete.titleAr) : ''}
                itemType={lang === 'en' ? 'project' : 'مشروع'}
            />
        </>
    );
};

export default WriteScreen;
