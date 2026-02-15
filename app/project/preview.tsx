
import React, { useState } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useProjectDetails } from '../../lib/hooks/useProjectDetails.ts';
import { useConfirmPublish } from '../../lib/hooks/useProjectMutations.ts';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import Button from '../../components/ui/Button.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { parseContent } from '../../lib/publishing/contentParser.ts';
import { extractChapters } from '../../lib/publishing/parseChapters.ts';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { useToast } from '../../store/toast.tsx';

const ProjectPreviewScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();

    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;
    const stagedFiles = currentView.type === 'immersive' ? currentView.params?.stagedFiles : undefined;

    const { data: project, isLoading: isLoadingProject } = useProjectDetails(projectId);
    const { mutate: confirmPublish, isLoading: isPublishing } = useConfirmPublish();

    const [activeFormat, setActiveFormat] = useState<'html' | 'pdf'>('html');

    const handleBack = () => navigate({ type: 'tab', id: 'write' });
    const handleEdit = () => navigate({ type: 'immersive', id: 'editor', params: { projectId, from: currentView } });

    if (isLoadingProject) return <div className="h-screen flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
    if (!project || !stagedFiles) return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Preview unavailable</div>;

    const bookContent = parseContent(project.content, project.titleEn, 'Author'); // Parsing for preview render
    const chapters = extractChapters(bookContent);

    const handleConfirm = () => {
        if (!projectId) return;
        confirmPublish({
            projectId,
            metadata: {
                title: lang === 'en' ? project.titleEn : project.titleAr,
                description: 'Published via BookTown',
                coverUrl: project.coverUrl
            },
            files: stagedFiles
        }, {
            onSuccess: (publishedBook) => {
                showToast(lang === 'en' ? "Book published successfully!" : "تم نشر الكتاب بنجاح!");
                // Redirect to success screen
                navigate({
                    type: 'immersive',
                    id: 'projectPublished',
                    params: {
                        publishedBook
                    }
                });
            },
            onError: () => {
                showToast(lang === 'en' ? "Publishing failed." : "فشل النشر.");
            }
        });
    };

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader titleEn="Preview Book" titleAr="معاينة الكتاب" onBack={handleBack} />
            
            <main className="flex-grow overflow-hidden flex flex-col md:flex-row pt-20">
                {/* Sidebar: Metadata & Actions */}
                <div className="w-full md:w-80 flex-shrink-0 bg-slate-800/50 border-r border-white/10 overflow-y-auto p-6 flex flex-col gap-6">
                    {/* Cover */}
                    <div className="w-full aspect-[2/3] bg-slate-700 rounded-lg shadow-xl overflow-hidden relative group">
                        {project.coverUrl ? (
                            <img src={project.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex items-center justify-center h-full"><BookIcon className="h-12 w-12 text-slate-500"/></div>
                        )}
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" className="!text-white border border-white/30" onClick={() => navigate({ type: 'immersive', id: 'projectEdit', params: { projectId, from: currentView } })}>Change Cover</Button>
                        </div>
                    </div>

                    {/* Meta */}
                    <div>
                        <BilingualText role="H1" className="!text-xl leading-tight mb-1">
                            {lang === 'en' ? project.titleEn : project.titleAr}
                        </BilingualText>
                        <BilingualText className="text-accent text-sm mb-4">
                            {lang === 'en' ? project.typeEn : project.typeAr}
                        </BilingualText>
                        
                        <div className="space-y-2">
                            <div className="flex justify-between text-sm text-slate-400">
                                <span>Chapters</span>
                                <span className="text-white">{chapters.length}</span>
                            </div>
                            <div className="flex justify-between text-sm text-slate-400">
                                <span>Word Count</span>
                                <span className="text-white">{project.wordCount.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Table of Contents */}
                    <div className="flex-grow">
                        <BilingualText role="Caption" className="uppercase tracking-wider mb-2">Table of Contents</BilingualText>
                        <div className="space-y-1">
                            {chapters.map((chapter) => (
                                <div key={chapter.id} className="p-2 rounded hover:bg-white/5 text-sm text-slate-300 truncate cursor-default">
                                    {chapter.title}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="space-y-3 pt-4 border-t border-white/10">
                        <Button 
                            variant="primary" 
                            className="w-full !h-12 !text-lg !bg-green-600 hover:!bg-green-500" 
                            onClick={handleConfirm}
                            disabled={isPublishing}
                        >
                            {isPublishing ? <LoadingSpinner /> : (lang === 'en' ? 'Confirm Publish' : 'تأكيد النشر')}
                        </Button>
                        <Button variant="ghost" className="w-full" onClick={handleEdit}>
                            {lang === 'en' ? 'Return to Editor' : 'العودة للمحرر'}
                        </Button>
                    </div>
                </div>

                {/* Main Preview Area */}
                <div className="flex-grow bg-slate-900 relative flex flex-col">
                    {/* Format Toggle */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-slate-800 rounded-full p-1 border border-white/10 shadow-lg flex">
                        <button 
                            onClick={() => setActiveFormat('html')}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFormat === 'html' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            Reader View
                        </button>
                        <button 
                            onClick={() => setActiveFormat('pdf')}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeFormat === 'pdf' ? 'bg-primary text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            PDF Preview
                        </button>
                    </div>

                    <div className="flex-grow p-4 md:p-12 overflow-y-auto flex justify-center bg-[#1E242C]"> 
                        {activeFormat === 'pdf' ? (
                            <iframe 
                                src={stagedFiles.pdfUrl} 
                                className="w-full h-full max-w-4xl shadow-2xl rounded-sm bg-white"
                                title="PDF Preview"
                            />
                        ) : (
                            <div className="w-full max-w-2xl bg-[#FBF6E8] text-slate-900 p-8 md:p-16 shadow-2xl min-h-full font-serif leading-loose">
                                {/* Simulating Page 1 */}
                                <h1 className="text-4xl font-bold text-center mb-12">{bookContent.title}</h1>
                                <div className="text-lg" dangerouslySetInnerHTML={{ __html: bookContent.chapters[0]?.content || "<p>No content</p>" }} />
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ProjectPreviewScreen;
