
import React, { useState, useEffect, useRef } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useToast } from '../../store/toast.tsx';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import { useProjectDetails } from '../../lib/hooks/useProjectDetails.ts';
import {
    useUpdateProject,
    useUpdateLongformPublicationVisibility,
    useUpdatePublishedBookVisibility,
} from '../../lib/hooks/useProjectMutations.ts';
import { useProjectPublicationSettings } from '../../lib/hooks/useProjectPublicationSettings.ts';
import InputField from '../../components/ui/InputField.tsx';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { UploadIcon } from '../../components/icons/UploadIcon.tsx';
import { useMediaUpload } from '../../lib/hooks/useMediaUpload.ts';
import ProjectTypeDropdown, {
    getProjectTypeOption,
    type ProjectTypeValue,
} from '../../components/write/ProjectTypeDropdown.tsx';

type PublicationVisibility = 'public' | 'private';

const ProjectEditScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();
    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;

    const { data: project, isLoading } = useProjectDetails(projectId);
    const { mutate: updateProject, isLoading: isSaving } = useUpdateProject();
    const updateLongformVisibility = useUpdateLongformPublicationVisibility();
    const updateBookVisibility = useUpdatePublishedBookVisibility();
    const { upload, isUploading } = useMediaUpload();
    const hasLinkedCanonicalPublication =
        !!project?.publishedPublicationId || !!project?.publishedBookId;
    const { data: publicationSettings } = useProjectPublicationSettings(
        projectId,
        hasLinkedCanonicalPublication
    );

    const [formData, setFormData] = useState({
        titleEn: '',
        titleAr: '',
        projectType: 'Draft' as ProjectTypeValue,
        content: '', 
        coverUrl: ''
    });

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (project) {
            setFormData({
                titleEn: project.titleEn,
                titleAr: project.titleAr,
                projectType: getProjectTypeOption(project.status || project.typeEn).value,
                content: project.content,
                coverUrl: project.coverUrl || ''
            });
        }
    }, [project]);

    const handleBack = () => {
        navigate({ type: 'tab', id: 'write' });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    const handleProjectTypeChange = (projectType: ProjectTypeValue) => {
        setFormData(prev => ({ ...prev, projectType }));
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file && projectId) {
            const url = await upload(file, 'cover', projectId);
            if (url) {
                setFormData(prev => ({ ...prev, coverUrl: url }));
            }
        }
    };

    const handleSave = () => {
        if (!projectId) return;
        const selectedType = getProjectTypeOption(formData.projectType);
        updateProject({
            projectId,
            updates: {
                titleEn: formData.titleEn,
                titleAr: formData.titleAr,
                typeEn: selectedType.labelEn,
                typeAr: selectedType.labelAr,
                status: selectedType.value,
                coverUrl: formData.coverUrl,
            }
        }, {
            onSuccess: () => handleBack()
        });
    };

    const handlePublicationVisibilityChange = (
        target: 'blog' | 'ebook',
        visibility: PublicationVisibility
    ) => {
        if (target === 'blog') {
            const publicationId = publicationSettings?.blog?.publicationId;
            if (!publicationId || updateLongformVisibility.isLoading) {
                return;
            }
            updateLongformVisibility.mutate(
                { publicationId, visibility, projectId },
                {
                    onSuccess: () => {
                        showToast(lang === 'en' ? 'Blog visibility updated.' : 'تم تحديث ظهور المدونة.');
                    },
                    onError: (error) => {
                        const message =
                            error instanceof Error && error.message.trim()
                                ? error.message
                                : (lang === 'en' ? 'Unable to update blog visibility.' : 'تعذّر تحديث ظهور المدونة.');
                        showToast(message);
                    },
                }
            );
            return;
        }

        const bookId = publicationSettings?.ebook?.bookId;
        if (!bookId || updateBookVisibility.isLoading) {
            return;
        }
        updateBookVisibility.mutate(
            { bookId, visibility, projectId },
            {
                onSuccess: () => {
                    showToast(lang === 'en' ? 'Ebook visibility updated.' : 'تم تحديث ظهور الكتاب الإلكتروني.');
                },
                onError: (error) => {
                    const message =
                        error instanceof Error && error.message.trim()
                            ? error.message
                            : (lang === 'en' ? 'Unable to update ebook visibility.' : 'تعذّر تحديث ظهور الكتاب الإلكتروني.');
                    showToast(message);
                },
            }
        );
    };

    const renderVisibilityRow = (
        target: 'blog' | 'ebook',
        label: string,
        visibility: PublicationVisibility
    ) => {
        const isUpdating =
            target === 'blog' ? updateLongformVisibility.isLoading : updateBookVisibility.isLoading;

        return (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="font-semibold text-white">{label}</div>
                    {isUpdating ? <LoadingSpinner /> : null}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {(['public', 'private'] as PublicationVisibility[]).map((option) => {
                        const isActive = visibility === option;
                        const optionLabel =
                            option === 'public'
                                ? (lang === 'en' ? 'Public' : 'عام')
                                : (lang === 'en' ? 'Private' : 'خاص');

                        return (
                            <button
                                key={option}
                                type="button"
                                disabled={isUpdating}
                                onClick={() => handlePublicationVisibilityChange(target, option)}
                                className={`rounded-xl border px-4 py-3 text-sm font-medium transition ${
                                    isActive
                                        ? 'border-sky-400 bg-sky-500/10 text-white'
                                        : 'border-white/10 bg-slate-800/70 text-slate-300 hover:border-white/20'
                                }`}
                            >
                                {optionLabel}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
    if (!project) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Project not found</div>;

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader titleEn="Edit Project Details" titleAr="تعديل تفاصيل المشروع" onBack={handleBack} />
            
            <main className="flex-grow overflow-y-auto pt-24 pb-8">
                <div className="container mx-auto px-4 md:px-8 max-w-2xl space-y-6">
                    
                    {/* Cover Image Upload */}
                    <div 
                        className="w-full aspect-video rounded-xl bg-slate-800 border-2 border-dashed border-slate-600 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700 transition-colors overflow-hidden relative group"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {formData.coverUrl ? (
                            <img src={formData.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                        ) : (
                            <>
                                <UploadIcon className="h-10 w-10 text-slate-500 mb-2" />
                                <BilingualText className="text-slate-400">
                                    {lang === 'en' ? 'Upload Cover Image' : 'تحميل صورة الغلاف'}
                                </BilingualText>
                            </>
                        )}
                        
                        <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                        
                        {isUploading && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <LoadingSpinner />
                            </div>
                        )}

                        {formData.coverUrl && !isUploading && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <BilingualText className="text-white font-bold">Change</BilingualText>
                            </div>
                        )}
                    </div>

                    <InputField 
                        id="titleEn" 
                        label={lang === 'en' ? 'Title (English)' : 'العنوان (إنجليزي)'} 
                        value={formData.titleEn} 
                        onChange={handleChange} 
                    />
                    
                    <InputField 
                        id="titleAr" 
                        label={lang === 'en' ? 'Title (Arabic)' : 'العنوان (عربي)'} 
                        value={formData.titleAr} 
                        onChange={handleChange} 
                    />

                    <ProjectTypeDropdown
                        id="projectType"
                        label={lang === 'en' ? 'Status' : 'الحالة'}
                        value={formData.projectType}
                        onChange={handleProjectTypeChange}
                    />

                    {publicationSettings?.blog || publicationSettings?.ebook ? (
                        <div className="space-y-4 rounded-2xl border border-white/5 bg-slate-800/50 p-5">
                            <BilingualText role="H1" className="!mb-0 !text-lg">
                                {lang === 'en' ? 'Visibility' : 'الظهور'}
                            </BilingualText>
                            {publicationSettings.blog
                                ? renderVisibilityRow(
                                    'blog',
                                    lang === 'en' ? 'Blog publication' : 'المنشور',
                                    publicationSettings.blog.visibility
                                )
                                : null}
                            {publicationSettings.ebook
                                ? renderVisibilityRow(
                                    'ebook',
                                    lang === 'en' ? 'Ebook publication' : 'الكتاب الإلكتروني',
                                    publicationSettings.ebook.visibility
                                )
                                : null}
                        </div>
                    ) : null}

                    <div className="pt-4">
                        <Button variant="primary" className="w-full" onClick={handleSave} disabled={isSaving || isUploading}>
                            {isSaving ? <LoadingSpinner /> : (lang === 'en' ? 'Save Changes' : 'حفظ التغييرات')}
                        </Button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ProjectEditScreen;
