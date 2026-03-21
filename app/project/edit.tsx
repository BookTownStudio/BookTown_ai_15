
import React, { useState, useEffect, useRef } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import { useProjectDetails } from '../../lib/hooks/useProjectDetails.ts';
import { useUpdateProject } from '../../lib/hooks/useProjectMutations.ts';
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

const ProjectEditScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;

    const { data: project, isLoading } = useProjectDetails(projectId);
    const { mutate: updateProject, isLoading: isSaving } = useUpdateProject();
    const { upload, isUploading } = useMediaUpload();

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
                        label={lang === 'en' ? 'Project Type' : 'نوع المشروع'}
                        value={formData.projectType}
                        onChange={handleProjectTypeChange}
                    />

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
