import React, { useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import { useProjectDetails } from '../../lib/hooks/useProjectDetails.ts';
import { useStageBookFiles } from '../../lib/hooks/useProjectMutations.ts';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import GlassCard from '../../components/ui/GlassCard.tsx';
import { CheckCircleIcon } from '../../components/icons/CheckCircleIcon.tsx';
import { UploadIcon } from '../../components/icons/UploadIcon.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { parseContent } from '../../lib/publishing/contentParser.ts';
import { generateEpubBlob } from '../../lib/publishing/epubGenerator.ts';
import { generatePdfBlob } from '../../lib/publishing/pdfGenerator.ts';
import { useUserProfile } from '../../lib/hooks/useUserProfile.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useToast } from '../../store/toast.tsx';

const ProjectPublishScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { user } = useAuth();
    const { showToast } = useToast();
    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;

    const { data: project, isLoading } = useProjectDetails(projectId);
    const { data: profile } = useUserProfile(user?.uid);
    const { mutate: stageFiles } = useStageBookFiles();
    
    const [step, setStep] = useState<string>('idle'); // idle, generating, uploading

    const handleBack = () => navigate({ type: 'tab', id: 'write' });

    const fetchCoverBlob = async (url: string): Promise<Blob | undefined> => {
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.blob();
        } catch (e) {
            console.warn("CORS/Fetch error for cover image. Proceeding without embedded cover.", e);
            return undefined; 
        }
    };

    const handlePublish = async () => {
        if (!project || !projectId) return;

        setStep('generating');
        
        try {
            const title = lang === 'en' ? project.titleEn : project.titleAr;
            const authorName = profile?.name || 'Anonymous';
            
            const bookContent = parseContent(project.content, title, authorName);

            const coverUrl = (project as any).coverUrl;
            let coverBlob: Blob | undefined = undefined;
            if (coverUrl) {
                coverBlob = await fetchCoverBlob(coverUrl);
            }

            const [epubBlob, pdfBlob] = await Promise.all([
                generateEpubBlob(bookContent, projectId, coverBlob),
                generatePdfBlob(bookContent, coverBlob)
            ]);

            if (!epubBlob || epubBlob.size < 100 || !pdfBlob || pdfBlob.size < 100) {
                throw new Error("Generated files are empty or invalid.");
            }

            setStep('uploading');

            stageFiles({
                projectId,
                files: {
                    epub: epubBlob,
                    pdf: pdfBlob
                }
            }, {
                onSuccess: (fileUrls) => {
                    navigate({
                        type: 'immersive',
                        id: 'projectPreview',
                        params: {
                            projectId,
                            stagedFiles: fileUrls,
                            from: currentView
                        }
                    });
                },
                onError: (error) => {
                    console.error("Staging failed:", error);
                    setStep('idle');
                    showToast(lang === 'en' ? "Failed to upload files. Please try again." : "فشل تحميل الملفات. يرجى المحاولة مرة أخرى.");
                }
            });

        } catch (error) {
            console.error("Generation failed:", error);
            setStep('idle');
            showToast(lang === 'en' ? "Failed to generate book files. Check content." : "فشل إنشاء ملفات الكتاب. تحقق من المحتوى.");
        }
    };

    if (isLoading) return <div className="h-screen flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
    if (!project) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Project not found</div>;

    // FIX: Using new RegExp to avoid "missing /" SyntaxError on literal with angle brackets
    const plainTextSummary = project.content ? project.content.replace(new RegExp('<[^>]*>?', 'gm'), '').substring(0, 150) : '';

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader titleEn="Publish Project" titleAr="نشر المشروع" onBack={handleBack} />
            
            <main className="flex-grow overflow-y-auto pt-24 pb-8">
                <div className="container mx-auto px-4 md:px-8 max-w-3xl">
                    
                    <div className="flex flex-col md:flex-row gap-8 items-start mb-8">
                        <div className="w-full md:w-48 aspect-[2/3] bg-slate-800 rounded-lg shadow-2xl flex items-center justify-center text-slate-600 border border-white/10 overflow-hidden">
                            {(project as any).coverUrl ? (
                                <img src={(project as any).coverUrl} alt="Cover" className="w-full h-full object-cover" />
                            ) : (
                                <BookIcon className="h-12 w-12 opacity-50" />
                            )}
                        </div>
                        <div className="flex-grow">
                            <BilingualText role="H1" className="!text-3xl mb-2">
                                {lang === 'en' ? project.titleEn : project.titleAr}
                            </BilingualText>
                            <BilingualText className="text-accent mb-4">
                                {lang === 'en' ? project.typeEn : project.typeAr}
                            </BilingualText>
                            <GlassCard className="!p-4 bg-white/5">
                                <BilingualText role="Caption" className="uppercase tracking-wider mb-2 text-slate-400">Synopsis</BilingualText>
                                <p className="text-white/80 italic">
                                    {plainTextSummary}...
                                </p>
                            </GlassCard>
                        </div>
                    </div>

                    <div className="bg-slate-800/50 rounded-xl p-6 mb-8 border border-white/5">
                        <BilingualText role="H1" className="!text-lg mb-4">Distribution Formats</BilingualText>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-4 bg-black/20 rounded-lg flex items-center gap-3">
                                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                                <div>
                                    <div className="font-bold text-white">EPUB</div>
                                    <div className="text-xs text-slate-400">Reflowable text for e-readers</div>
                                </div>
                            </div>
                            <div className="p-4 bg-black/20 rounded-lg flex items-center gap-3">
                                <CheckCircleIcon className="h-5 w-5 text-green-500" />
                                <div>
                                    <div className="font-bold text-white">PDF</div>
                                    <div className="text-xs text-slate-400">Print-ready layout</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <Button 
                            variant="primary" 
                            onClick={handlePublish} 
                            disabled={step !== 'idle'} 
                            className="w-full !h-14 !text-lg shadow-lg shadow-primary/20 transition-all"
                        >
                            {step === 'generating' ? (
                                <div className="flex items-center gap-2"><LoadingSpinner /> <span>Generating files...</span></div>
                            ) : step === 'uploading' ? (
                                <div className="flex items-center gap-2"><LoadingSpinner /> <span>Uploading...</span></div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <UploadIcon className="h-5 w-5" />
                                    <span>{lang === 'en' ? 'Generate & Preview' : 'إنشاء ومعاينة'}</span>
                                </div>
                            )}
                        </Button>
                        <p className="text-center text-xs text-slate-500">
                            {lang === 'en' ? 'By proceeding, you agree to our Content Guidelines.' : 'بالمتابعة، أنت توافق على إرشادات المحتوى الخاصة بنا.'}
                        </p>
                    </div>

                </div>
            </main>
        </div>
    );
};

export default ProjectPublishScreen;
