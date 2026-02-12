
import React, { useEffect, useReducer, useState, useRef, useCallback } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import { useProjectDetails } from '../../lib/hooks/useProjectDetails.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { BrainIcon } from '../../components/icons/BrainIcon.tsx';
import FormattingToolbar from '../../components/editor/FormattingToolbar.tsx';
import TiptapEditor from '../../components/editor/TiptapEditor.tsx';
import { useAutosaveProject } from '../../lib/hooks/useAutosaveProject.ts';
import { useCreateProject } from '../../lib/hooks/useCreateProject.ts';
import { useDebounce } from 'use-debounce';
import Modal from '../../components/ui/Modal.tsx';
import VoiceSearchModal from '../../components/modals/VoiceSearchModal.tsx';
import { mockAgents, mockTemplates } from '../../data/mocks.ts';
import { useToast } from '../../store/toast.tsx';
import { Editor } from '@tiptap/react';

type EditorSnapshot = { titleEn: string; titleAr: string; content: string; wordCount: number };
type HistoryState = { present: EditorSnapshot };
type HistoryAction = { type: 'SET', payload: EditorSnapshot };

type SyncStatus = 'ephemeral' | 'materializing' | 'persistent' | 'error';

const historyReducer = (state: HistoryState, action: HistoryAction): HistoryState => {
    return { ...state, present: action.payload };
};

const countWords = (text: string) => {
    const plainText = text.replace(/<[^>]*>/g, ' ');
    return plainText.trim().split(/\s+/).filter(Boolean).length;
};

const EditorScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();
    
    // Route Params
    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;
    const templateId = currentView.type === 'immersive' ? currentView.params?.templateId : undefined;
    
    const isNewRoute = projectId === 'new';

    // Authority State
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(isNewRoute ? 'ephemeral' : 'persistent');
    const [isSaving, setIsSaving] = useState(false);
    const [isMentorOpen, setIsMentorOpen] = useState(false);
    const [isMicModalOpen, setIsMicModalOpen] = useState(false);
    const [hasInteractedWithTitle, setHasInteractedWithTitle] = useState(false);

    const mentor = mockAgents.find(a => a.id === 'mentor');

    // Content State
    const [state, dispatch] = useReducer(historyReducer, {
        present: { titleEn: '', titleAr: '', content: '', wordCount: 0 }
    });
    const { present } = state;

    // Debouncing for Autosave triggers
    const [debouncedContent] = useDebounce(present.content, 2000); 
    const [debouncedTitleEn] = useDebounce(present.titleEn, 2000);
    const [debouncedTitleAr] = useDebounce(present.titleAr, 2000);

    const [editor, setEditor] = useState<Editor | null>(null);
    
    // --- Phase-based Lifecycle Guards ---
    const hasHydratedRef = useRef<boolean>(false); 
    const hasLocalEditsRef = useRef<boolean>(false); 
    const lastSavedSnapshot = useRef<EditorSnapshot>({ titleEn: '', titleAr: '', content: '', wordCount: -1 });

    // Data Hooks
    const { data: project, isLoading: isFetching, isError: isFetchError, error: fetchError } = useProjectDetails(isNewRoute ? undefined : projectId);
    const { mutate: autosave } = useAutosaveProject();
    const { mutate: createProject } = useCreateProject();

    // 1. Initial Phase: HYDRATION
    useEffect(() => {
        if (hasHydratedRef.current) return;

        if (isNewRoute) {
            const template = templateId ? mockTemplates.find(t => t.id === templateId) : null;
            const initContent = template?.boilerplateContent || '';
            const initTitleEn = template?.titleEn || 'Untitled Project';
            const initTitleAr = template?.titleAr || 'مشروع غير معنون';
            
            const payload = { 
                content: initContent, 
                wordCount: countWords(initContent), 
                titleEn: initTitleEn, 
                titleAr: initTitleAr 
            };

            dispatch({ type: 'SET', payload });
            lastSavedSnapshot.current = payload;
            hasHydratedRef.current = true;
            setSyncStatus('ephemeral');
        } else if (project) {
            const payload = { 
                content: project.content, 
                wordCount: project.wordCount, 
                titleEn: project.titleEn || '', 
                titleAr: project.titleAr || '' 
            };
            dispatch({ type: 'SET', payload });
            lastSavedSnapshot.current = payload;
            hasHydratedRef.current = true;
            setSyncStatus('persistent');
        }
    }, [isNewRoute, project, templateId]);

    // 2. Transition Phase: MATERIALIZATION
    useEffect(() => {
        const needsMaterialization = 
            isNewRoute && 
            hasHydratedRef.current && 
            syncStatus === 'ephemeral' && 
            hasLocalEditsRef.current;

        if (!needsMaterialization) return;

        setSyncStatus('materializing');
        console.log("[WRITE][PHASE_2] MATERIALIZATION_STARTED: Establishing backend authority...");
        
        const initialSnapshot: EditorSnapshot = { ...present };

        createProject({
            ...initialSnapshot,
            typeEn: 'Draft',
            typeAr: 'مسودة',
            status: 'Draft',
            isPublished: false,
        }, {
            onSuccess: (newProject) => {
                console.log(`[WRITE][PHASE_3] MATERIALIZATION_SUCCESS: Canonical ID verified: ${newProject.id}`);
                lastSavedSnapshot.current = initialSnapshot;
                setSyncStatus('persistent');
                
                navigate({ 
                    type: 'immersive', 
                    id: 'editor', 
                    params: { ...currentView.params, projectId: newProject.id } 
                });
            },
            onError: (err) => {
                console.error("[WRITE][MATERIALIZATION_FAILED]", err);
                setSyncStatus('error');
                showToast(lang === 'en' ? 'Persistence Failure: Project remains local.' : 'فشل الحفظ: المشروع سيبقى محلياً فقط.');
            }
        });
    }, [present, isNewRoute, createProject, navigate, currentView, lang, showToast, syncStatus]);

    // 3. Persistent Phase: AUTOSAVE LOOP
    useEffect(() => {
        const canAutosave = 
            hasHydratedRef.current && 
            syncStatus === 'persistent' && 
            projectId && 
            projectId !== 'new';

        if (!canAutosave) return;

        const hasChanges = 
            debouncedContent !== lastSavedSnapshot.current.content ||
            debouncedTitleEn !== lastSavedSnapshot.current.titleEn ||
            debouncedTitleAr !== lastSavedSnapshot.current.titleAr;
        
        if (!hasChanges) return;

        const currentSnapshot: EditorSnapshot = {
            content: debouncedContent,
            wordCount: present.wordCount,
            titleEn: debouncedTitleEn,
            titleAr: debouncedTitleAr
        };

        setIsSaving(true);
        autosave({ 
            projectId: projectId as string, 
            updates: currentSnapshot 
        }, {
            onSuccess: () => {
                setIsSaving(false);
                lastSavedSnapshot.current = currentSnapshot;
            },
            onError: (err: any) => {
                setIsSaving(false);
                if (err?.message?.includes("not found")) {
                    setSyncStatus('error');
                    showToast(lang === 'en' ? 'Critical: Project authority lost.' : 'خطأ فادح: فقدت صلاحية المشروع.');
                }
            }
        });
    }, [debouncedContent, debouncedTitleEn, debouncedTitleAr, projectId, autosave, present.wordCount, lang, showToast, syncStatus]);

    // --- Handlers ---
    const handleBack = () => {
        navigate(currentView.params?.from || { type: 'tab', id: 'write' });
    };

    const handleEditorChange = (newHtml: string) => {
        if (!hasLocalEditsRef.current && newHtml !== lastSavedSnapshot.current.content) {
            hasLocalEditsRef.current = true;
        }
        dispatch({ type: 'SET', payload: { ...present, content: newHtml, wordCount: countWords(newHtml) } });
    };

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        const newState = { ...present };
        
        if (lang === 'en') {
            if (!hasLocalEditsRef.current && newTitle !== lastSavedSnapshot.current.titleEn) hasLocalEditsRef.current = true;
            newState.titleEn = newTitle;
        } else {
            if (!hasLocalEditsRef.current && newTitle !== lastSavedSnapshot.current.titleAr) hasLocalEditsRef.current = true;
            newState.titleAr = newTitle;
        }
        dispatch({ type: 'SET', payload: newState });
    };

    const handleTitleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (isNewRoute && !hasInteractedWithTitle) {
            const val = e.target.value;
            if (val === 'Untitled Project' || val === 'مشروع غير معنون') {
                const newState = { ...present, titleEn: '', titleAr: '' };
                dispatch({ type: 'SET', payload: newState });
                setHasInteractedWithTitle(true);
            }
        }
    };

    const toggleVoice = () => setIsMicModalOpen(true);
    const handleVoiceResult = (text: string) => {
        if (text && editor) editor.commands.insertContent(text + ' ');
        setIsMicModalOpen(false);
    };

    if (isFetchError) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 p-8 text-center">
                <BilingualText role="H1" className="text-red-500 mb-2">Authority Conflict</BilingualText>
                <BilingualText role="Body" className="text-slate-500 mb-6">{fetchError instanceof Error ? fetchError.message : "Persistence failure."}</BilingualText>
                <Button onClick={handleBack}>Return to Library</Button>
            </div>
        );
    }

    if (isFetching && !hasHydratedRef.current) {
        return <div className="h-screen w-full flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
    }

    return (
        <div className="h-screen w-full flex flex-col bg-white dark:bg-slate-900">
            <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-black/10 dark:border-white/10">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-8">
                    <Button variant="ghost" onClick={handleBack}><ChevronLeftIcon className="h-6 w-6" /></Button>
                    <div className="text-center flex-grow mx-4 flex flex-col items-center">
                        <input 
                            type="text"
                            value={lang === 'en' ? present.titleEn : present.titleAr}
                            onChange={handleTitleChange}
                            onFocus={handleTitleFocus}
                            className="bg-transparent text-center font-semibold text-slate-800 dark:text-white focus:outline-none focus:border-b-2 border-accent/50 px-2 w-full max-w-md transition-all"
                            placeholder={lang === 'en' ? 'Untitled Project' : 'مشروع غير معنون'}
                        />
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{present.wordCount} {lang === 'en' ? 'words' : 'كلمة'}</span>
                            {isSaving ? <span className="text-accent animate-pulse">Syncing...</span> : syncStatus === 'persistent' ? <span>Saved</span> : <span className="text-amber-500">Draft</span>}
                        </div>
                    </div>
                    <Button variant="ghost" onClick={() => setIsMentorOpen(true)}><BrainIcon className="h-6 w-6 text-accent" /></Button>
                </div>
            </header>

            <div className="flex-grow flex flex-col relative">
                <FormattingToolbar 
                    editor={editor} 
                    onToggleVoice={toggleVoice} 
                    isRecording={false} 
                    isVisible={true} 
                />

                <div className="flex-grow container mx-auto px-4 md:px-8 py-4 relative">
                    <TiptapEditor 
                        content={present.content}
                        onChange={handleEditorChange}
                        onEditorReady={setEditor}
                    />
                </div>
            </div>

            <Modal isOpen={isMentorOpen} onClose={() => setIsMentorOpen(false)}>
                <div className="flex flex-col items-center text-center p-2">
                    <div className="p-4 rounded-full bg-sky-100 dark:bg-sky-900/30 mb-4">{mentor?.icon && <mentor.icon className="h-12 w-12 text-sky-500" />}</div>
                    <BilingualText role="H1" className="!text-2xl mb-2">{mentor?.name}</BilingualText>
                    <BilingualText className="text-slate-600 dark:text-slate-300 mb-6">{lang === 'en' ? mentor?.descriptionEn : mentor?.descriptionAr}</BilingualText>
                    <Button onClick={() => { setIsMentorOpen(false); navigate({ type: 'immersive', id: 'agentChat', params: { agentId: 'mentor', from: currentView } }); }} className="w-full">
                        {lang === 'en' ? 'Chat with Mentor' : 'تحدث مع المرشد'}
                    </Button>
                </div>
            </Modal>
            
            {isMicModalOpen && (
                <VoiceSearchModal isOpen={isMicModalOpen} onClose={() => setIsMicModalOpen(false)} onResult={handleVoiceResult} />
            )}
        </div>
    );
};

export default EditorScreen;
