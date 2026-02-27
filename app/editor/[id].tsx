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
import TiptapEditor, { EditorChangePayload, EditorOutlineItem } from '../../components/editor/TiptapEditor.tsx';
import { useAutosaveProject } from '../../lib/hooks/useAutosaveProject.ts';
import { useCreateProject } from '../../lib/hooks/useCreateProject.ts';
import { useDebounce } from 'use-debounce';
import Modal from '../../components/ui/Modal.tsx';
import VoiceSearchModal from '../../components/modals/VoiceSearchModal.tsx';
import { mockAgents, mockTemplates } from '../../data/mocks.ts';
import { useToast } from '../../store/toast.tsx';
import { Editor } from '@tiptap/react';
import { cn } from '../../lib/utils.ts';
import { WriteContentDoc } from '../../types/entities.ts';
import { countWordsScriptAware } from '../../lib/editor/writeDocument.ts';

type EditorSnapshot = {
    titleEn: string;
    titleAr: string;
    content: string;
    contentDoc?: WriteContentDoc;
    wordCount: number;
};
type HistoryState = { present: EditorSnapshot };
type HistoryAction = { type: 'SET', payload: EditorSnapshot };

type SyncStatus = 'ephemeral' | 'materializing' | 'persistent' | 'error';

const historyReducer = (state: HistoryState, action: HistoryAction): HistoryState => {
    return { ...state, present: action.payload };
};

const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, ' ').trim();
const serializeDoc = (doc?: WriteContentDoc): string => JSON.stringify(doc?.content ?? []);

const EditorScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();

    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;
    const templateId = currentView.type === 'immersive' ? currentView.params?.templateId : undefined;

    const isNewRoute = projectId === 'new';

    const [syncStatus, setSyncStatus] = useState<SyncStatus>(isNewRoute ? 'ephemeral' : 'persistent');
    const [isSaving, setIsSaving] = useState(false);
    const [isMentorOpen, setIsMentorOpen] = useState(false);
    const [isMicModalOpen, setIsMicModalOpen] = useState(false);
    const [hasInteractedWithTitle, setHasInteractedWithTitle] = useState(false);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [outline, setOutline] = useState<EditorOutlineItem[]>([]);
    const [conflictBannerVisible, setConflictBannerVisible] = useState(false);

    const mentor = mockAgents.find(a => a.id === 'mentor');

    const [state, dispatch] = useReducer(historyReducer, {
        present: { titleEn: '', titleAr: '', content: '<p></p>', contentDoc: undefined, wordCount: 0 }
    });
    const { present } = state;

    const [debouncedContent] = useDebounce(present.content, 2000);
    const [debouncedTitleEn] = useDebounce(present.titleEn, 2000);
    const [debouncedTitleAr] = useDebounce(present.titleAr, 2000);

    const [editor, setEditor] = useState<Editor | null>(null);

    const hasHydratedRef = useRef<boolean>(false);
    const hasLocalEditsRef = useRef<boolean>(false);
    const lastSavedSnapshot = useRef<EditorSnapshot>({ titleEn: '', titleAr: '', content: '', contentDoc: undefined, wordCount: -1 });
    const saveInFlightRef = useRef<boolean>(false);
    const queuedSnapshotRef = useRef<EditorSnapshot | null>(null);
    const queuedNotifyRef = useRef<boolean>(false);
    const conflictRetryCountRef = useRef<number>(0);

    const { data: project, isLoading: isFetching, isError: isFetchError, error: fetchError } = useProjectDetails(isNewRoute ? undefined : projectId);
    const { mutate: autosave } = useAutosaveProject();
    const { mutate: createProject } = useCreateProject();

    const persistSnapshot = useCallback((snapshot: EditorSnapshot, notifyOnSuccess = false) => {
        if (!projectId || projectId === 'new' || syncStatus !== 'persistent') {
            return;
        }

        if (saveInFlightRef.current) {
            queuedSnapshotRef.current = snapshot;
            queuedNotifyRef.current = queuedNotifyRef.current || notifyOnSuccess;
            return;
        }

        saveInFlightRef.current = true;
        setIsSaving(true);

        const completeSaveCycle = () => {
            saveInFlightRef.current = false;

            const queuedSnapshot = queuedSnapshotRef.current;
            const queuedNotify = queuedNotifyRef.current;
            queuedSnapshotRef.current = null;
            queuedNotifyRef.current = false;

            if (queuedSnapshot && projectId && projectId !== 'new' && syncStatus === 'persistent') {
                persistSnapshot(queuedSnapshot, queuedNotify);
                return;
            }

            setIsSaving(false);
        };

        autosave(
            {
                projectId: projectId as string,
                updates: snapshot
            },
            {
                onSuccess: () => {
                    conflictRetryCountRef.current = 0;
                    setConflictBannerVisible(false);
                    lastSavedSnapshot.current = snapshot;
                    if (notifyOnSuccess) {
                        showToast(lang === 'en' ? 'Saved successfully.' : 'تم الحفظ بنجاح.');
                    }
                    completeSaveCycle();
                },
                onError: (err: any) => {
                    if (err?.message?.includes('Revision mismatch')) {
                        if (conflictRetryCountRef.current < 2) {
                            conflictRetryCountRef.current += 1;
                            queuedSnapshotRef.current = snapshot;
                            queuedNotifyRef.current = queuedNotifyRef.current || notifyOnSuccess;
                            showToast(lang === 'en' ? 'Save conflict detected. Retrying...' : 'تم اكتشاف تعارض في الحفظ. جارٍ إعادة المحاولة...');
                        } else {
                            conflictRetryCountRef.current = 0;
                            setConflictBannerVisible(true);
                            showToast(lang === 'en' ? 'Save conflict persists. Use Reconcile to retry.' : 'تعارض الحفظ مستمر. استخدم المصالحة لإعادة المحاولة.');
                        }
                        completeSaveCycle();
                        return;
                    }
                    if (err?.message?.includes('not found')) {
                        setSyncStatus('error');
                        showToast(lang === 'en' ? 'Critical: Project authority lost.' : 'خطأ فادح: فقدت صلاحية المشروع.');
                        completeSaveCycle();
                        return;
                    }
                    conflictRetryCountRef.current = 0;
                    showToast(lang === 'en' ? 'Save failed. Please retry.' : 'فشل الحفظ. يرجى إعادة المحاولة.');
                    completeSaveCycle();
                }
            }
        );
    }, [autosave, lang, projectId, showToast, syncStatus]);

    useEffect(() => {
        if (hasHydratedRef.current) return;

        if (isNewRoute) {
            const template = templateId ? mockTemplates.find(t => t.id === templateId) : null;
            const initContent = template?.boilerplateContent || '<p></p>';
            const initTitleEn = template?.titleEn || 'Untitled Project';
            const initTitleAr = template?.titleAr || 'مشروع غير معنون';
            const plainText = stripHtml(initContent);

            const payload = {
                content: initContent,
                contentDoc: undefined,
                wordCount: countWordsScriptAware(plainText),
                titleEn: initTitleEn,
                titleAr: initTitleAr,
            };

            dispatch({ type: 'SET', payload });
            lastSavedSnapshot.current = payload;
            hasHydratedRef.current = true;
            setSyncStatus('ephemeral');
        } else if (project) {
            const payload = {
                content: project.content,
                contentDoc: project.contentDoc,
                wordCount: project.wordCount,
                titleEn: project.titleEn || '',
                titleAr: project.titleAr || '',
            };
            dispatch({ type: 'SET', payload });
            lastSavedSnapshot.current = payload;
            hasHydratedRef.current = true;
            setSyncStatus('persistent');
        }
    }, [isNewRoute, project, templateId]);

    useEffect(() => {
        const needsMaterialization =
            isNewRoute &&
            hasHydratedRef.current &&
            syncStatus === 'ephemeral' &&
            hasLocalEditsRef.current;

        if (!needsMaterialization) return;

        setSyncStatus('materializing');
        console.log('[WRITE][PHASE_2] MATERIALIZATION_STARTED: Establishing backend authority...');

        const initialSnapshot: EditorSnapshot = { ...present };

        createProject(
            {
                ...initialSnapshot,
                typeEn: 'Draft',
                typeAr: 'مسودة',
                status: 'Draft',
                isPublished: false,
            },
            {
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
                    console.error('[WRITE][MATERIALIZATION_FAILED]', err);
                    setSyncStatus('error');
                    showToast(lang === 'en' ? 'Persistence Failure: Project remains local.' : 'فشل الحفظ: المشروع سيبقى محلياً فقط.');
                }
            }
        );
    }, [present, isNewRoute, createProject, navigate, currentView, lang, showToast, syncStatus]);

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
            debouncedTitleAr !== lastSavedSnapshot.current.titleAr ||
            serializeDoc(present.contentDoc) !== serializeDoc(lastSavedSnapshot.current.contentDoc);

        if (!hasChanges) return;

        const currentSnapshot: EditorSnapshot = {
            content: debouncedContent,
            contentDoc: present.contentDoc,
            wordCount: present.wordCount,
            titleEn: debouncedTitleEn,
            titleAr: debouncedTitleAr,
        };

        persistSnapshot(currentSnapshot, false);
    }, [debouncedContent, debouncedTitleEn, debouncedTitleAr, persistSnapshot, present.wordCount, present.contentDoc, syncStatus, projectId]);

    const handleBack = () => {
        navigate(currentView.params?.from || { type: 'tab', id: 'write' });
    };

    const handleManualSave = () => {
        if (syncStatus !== 'persistent' || !projectId || projectId === 'new') {
            showToast(lang === 'en' ? 'Project is not ready for server save yet.' : 'المشروع غير جاهز للحفظ على الخادم بعد.');
            return;
        }

        const currentSnapshot: EditorSnapshot = {
            content: present.content,
            contentDoc: present.contentDoc,
            wordCount: present.wordCount,
            titleEn: present.titleEn,
            titleAr: present.titleAr,
        };

        const hasChanges =
            currentSnapshot.content !== lastSavedSnapshot.current.content ||
            currentSnapshot.titleEn !== lastSavedSnapshot.current.titleEn ||
            currentSnapshot.titleAr !== lastSavedSnapshot.current.titleAr ||
            serializeDoc(currentSnapshot.contentDoc) !== serializeDoc(lastSavedSnapshot.current.contentDoc);

        if (!hasChanges) {
            showToast(lang === 'en' ? 'Already up to date.' : 'تم الحفظ بالفعل.');
            return;
        }

        persistSnapshot(currentSnapshot, true);
    };

    const handleEditorChange = (payload: EditorChangePayload) => {
        if (!hasHydratedRef.current) {
            return;
        }

        if (!hasLocalEditsRef.current && payload.html !== lastSavedSnapshot.current.content) {
            hasLocalEditsRef.current = true;
        }

        setOutline(payload.outline);
        dispatch({
            type: 'SET',
            payload: {
                ...present,
                content: payload.html,
                contentDoc: payload.contentDoc,
                wordCount: payload.wordCount,
            },
        });
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
                <BilingualText role="Body" className="text-slate-500 mb-6">{fetchError instanceof Error ? fetchError.message : 'Persistence failure.'}</BilingualText>
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
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setIsFocusMode((prev) => !prev)}
                            className="text-xs px-3 py-1"
                        >
                            {isFocusMode ? (lang === 'en' ? 'Exit Focus' : 'إنهاء التركيز') : (lang === 'en' ? 'Focus' : 'تركيز')}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={handleManualSave}
                            disabled={isSaving || syncStatus !== 'persistent'}
                            className="text-xs px-3 py-1"
                        >
                            {lang === 'en' ? 'Save' : 'حفظ'}
                        </Button>
                        <Button variant="ghost" onClick={() => setIsMentorOpen(true)}>
                            <BrainIcon className="h-6 w-6 text-accent" />
                        </Button>
                    </div>
                </div>
            </header>

            {conflictBannerVisible && (
                <div className="px-4 md:px-8 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between gap-3">
                    <BilingualText className="text-amber-300 text-sm">
                        {lang === 'en' ? 'Save conflict detected. Reconcile with server and retry.' : 'تم اكتشاف تعارض حفظ. قم بالمصالحة مع الخادم وأعد المحاولة.'}
                    </BilingualText>
                    <Button variant="ghost" onClick={handleManualSave} className="!text-amber-200 border border-amber-500/30">
                        {lang === 'en' ? 'Reconcile Now' : 'مصالحة الآن'}
                    </Button>
                </div>
            )}

            <div className="flex-grow flex flex-col relative min-h-0">
                <FormattingToolbar
                    editor={editor}
                    onToggleVoice={toggleVoice}
                    isRecording={false}
                    isVisible={!isFocusMode}
                />

                <div className="flex-grow container mx-auto px-4 md:px-8 py-4 relative min-h-0">
                    <div className={cn('h-full', !isFocusMode && 'lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-6')}>
                        {!isFocusMode && (
                            <aside className="hidden lg:block border border-white/10 rounded-xl bg-black/10 p-3 overflow-y-auto max-h-[calc(100vh-220px)]">
                                <BilingualText role="Caption" className="text-slate-400 uppercase tracking-wider mb-3 block">
                                    {lang === 'en' ? 'Outline' : 'المخطط'}
                                </BilingualText>
                                {outline.length === 0 ? (
                                    <BilingualText className="text-slate-500 text-sm">
                                        {lang === 'en' ? 'Add headings to build your outline.' : 'أضف عناوين لبناء المخطط.'}
                                    </BilingualText>
                                ) : (
                                    <div className="space-y-1">
                                        {outline.map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => editor?.chain().focus().setTextSelection(item.pos + 1).run()}
                                                className={cn(
                                                    'w-full text-left rounded px-2 py-1.5 text-sm hover:bg-white/10 text-slate-200',
                                                    item.level === 2 && 'pl-4 text-slate-300',
                                                    item.level === 3 && 'pl-6 text-slate-400'
                                                )}
                                                dir={item.dir}
                                            >
                                                {item.text}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </aside>
                        )}

                        <div className="min-h-0">
                            <TiptapEditor
                                content={present.content}
                                contentDoc={present.contentDoc}
                                onChange={handleEditorChange}
                                onEditorReady={setEditor}
                                isFocusMode={isFocusMode}
                                langHint={lang === 'ar' ? 'ar' : 'en'}
                            />
                        </div>
                    </div>
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
