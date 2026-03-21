import { devLog } from '../../lib/logging/devLog';
import React, { useEffect, useReducer, useState, useRef, useCallback, useMemo } from 'react';
import { Editor } from '@tiptap/react';
import { useDebounce } from 'use-debounce';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useToast } from '../../store/toast.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useOffline } from '../../lib/offline/OfflineProvider.tsx';
import { useQueryClient } from '../../lib/react-query.ts';
import { queryKeys } from '../../lib/queryKeys.ts';
import { WriteRepository } from '../../services/writeRepository.ts';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import Modal from '../../components/ui/Modal.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import { BrainIcon } from '../../components/icons/BrainIcon.tsx';
import FormattingToolbar from '../../components/editor/FormattingToolbar.tsx';
import OutlinePanel, { OutlinePanelItem } from '../../components/editor/OutlinePanel.tsx';
import TiptapEditor, { EditorChangePayload, EditorOutlineItem } from '../../components/editor/TiptapEditor.tsx';
import { useProjectDetails } from '../../lib/hooks/useProjectDetails.ts';
import { useAutosaveProject } from '../../lib/hooks/useAutosaveProject.ts';
import { useCreateProject } from '../../lib/hooks/useCreateProject.ts';
import { mockAgents, mockTemplates } from '../../data/mocks.ts';
import { cn } from '../../lib/utils.ts';
import { countWordsScriptAware } from '../../lib/editor/writeDocument.ts';
import {
    writeLocalDrafts,
    WriteDraftReason,
    WriteDraftRecord,
    WriteDraftSnapshot,
} from '../../lib/editor/writeLocalDrafts.ts';
import { Project, WriteContentDoc } from '../../types/entities.ts';
import LiteraryShell from '../../components/layout/LiteraryShell.tsx';
import { allowNextMediaRequest } from '../../lib/media/MediaGuard.ts';
import {
    createBrowserSpeechSession,
    getBrowserSpeechSupportInfo,
    isBrowserSpeechRecognitionSupported,
    type BrowserSpeechDictationErrorCode,
    type BrowserSpeechSession,
    type BrowserSpeechSupportInfo,
} from '../../lib/speech/browserSpeechDictation.ts';

type EditorSnapshot = WriteDraftSnapshot;
type HistoryState = { present: EditorSnapshot };
type HistoryAction = { type: 'SET', payload: EditorSnapshot };

type AuthorityStatus = 'ephemeral' | 'materializing' | 'persistent' | 'error';
type SaveIndicator = 'local-only' | 'unsaved' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';
type DictationPhase = 'idle' | 'starting' | 'listening' | 'stopping';
type RecoveryBanner =
    | { mode: 'recovered'; draft: WriteDraftRecord }
    | { mode: 'available'; draft: WriteDraftRecord }
    | null;
type DictationAnchor = {
    from: number;
    to: number;
    nextPos: number;
    replaceSelection: boolean;
};

const EMPTY_SNAPSHOT: EditorSnapshot = {
    titleEn: '',
    titleAr: '',
    content: '<p></p>',
    contentDoc: undefined,
    wordCount: 0,
};

const historyReducer = (state: HistoryState, action: HistoryAction): HistoryState => {
    return { ...state, present: action.payload };
};

const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, ' ').trim();
const serializeDoc = (doc?: WriteContentDoc): string => JSON.stringify(doc?.content ?? []);

function buildScopeId(projectId?: string, templateId?: string): string {
    if (projectId && projectId !== 'new') {
        return projectId;
    }
    return `new:${templateId || 'blank'}`;
}

function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
    return (
        a.titleEn === b.titleEn &&
        a.titleAr === b.titleAr &&
        a.content === b.content &&
        a.wordCount === b.wordCount &&
        serializeDoc(a.contentDoc) === serializeDoc(b.contentDoc)
    );
}

function snapshotFromProject(project: Project): EditorSnapshot {
    return {
        titleEn: project.titleEn || '',
        titleAr: project.titleAr || '',
        content: project.content || '<p></p>',
        contentDoc: project.contentDoc,
        wordCount: project.wordCount || 0,
    };
}

function toDraftRecord(
    uid: string,
    scopeId: string,
    projectId: string | undefined,
    serverRevision: number | null,
    snapshot: EditorSnapshot,
    reason: WriteDraftReason
): WriteDraftRecord {
    return {
        schemaVersion: 1,
        uid,
        scopeId,
        projectId,
        serverRevision,
        savedAt: Date.now(),
        reason,
        snapshot,
    };
}

function isRevisionMismatchError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('Revision mismatch');
}

function isOfflineWriteError(error: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return true;
    }

    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return (
        message.includes('network') ||
        message.includes('offline') ||
        message.includes('unavailable') ||
        message.includes('failed to fetch')
    );
}

function getIndicatorLabel(indicator: SaveIndicator, lang: string): string {
    if (lang === 'ar') {
        if (indicator === 'local-only') return 'محلي فقط';
        if (indicator === 'unsaved') return 'غير محفوظ';
        if (indicator === 'saving') return 'جارٍ الحفظ';
        if (indicator === 'saved') return 'محفوظ';
        if (indicator === 'offline') return 'محفوظ محلياً';
        if (indicator === 'conflict') return 'تعارض';
        return 'خطأ في المزامنة';
    }

    if (indicator === 'local-only') return 'Local draft';
    if (indicator === 'unsaved') return 'Unsaved';
    if (indicator === 'saving') return 'Saving';
    if (indicator === 'saved') return 'Saved';
    if (indicator === 'offline') return 'Saved locally';
    if (indicator === 'conflict') return 'Conflict';
    return 'Sync issue';
}

function resolveDictationLanguage(editor: Editor | null, fallbackLang: string): string {
    const activeBlockLang = editor?.state.selection.$from.parent?.attrs?.lang;
    if (typeof activeBlockLang === 'string') {
        if (activeBlockLang.toLowerCase().startsWith('ar')) {
            return 'ar-SA';
        }
        if (activeBlockLang.toLowerCase().startsWith('en')) {
            return 'en-US';
        }
    }

    return fallbackLang === 'ar' ? 'ar-SA' : 'en-US';
}

function normalizeDictationTranscript(transcript: string): string {
    const normalized = transcript.replace(/\s+/g, ' ').trim();
    return normalized ? `${normalized} ` : '';
}

function getDictationStatusLabel(phase: DictationPhase, lang: string): string {
    if (lang === 'ar') {
        if (phase === 'starting') return 'بدء الإملاء';
        if (phase === 'stopping') return 'إيقاف الإملاء';
        return 'جاري الإملاء';
    }

    if (phase === 'starting') return 'Starting';
    if (phase === 'stopping') return 'Stopping';
    return 'Dictating';
}

function getDictationErrorMessage(code: BrowserSpeechDictationErrorCode, lang: string): string {
    if (lang === 'ar') {
        if (code === 'unsupported') return 'الإملاء الصوتي غير مدعوم في هذا المتصفح.';
        if (code === 'permission_denied') return 'تم رفض إذن الميكروفون.';
        if (code === 'audio_capture') return 'الميكروفون غير متاح على هذا الجهاز.';
        if (code === 'network') return 'حدث خطأ في الشبكة أثناء الإملاء.';
        if (code === 'no_speech') return 'لم يتم التقاط أي كلام. حاول مرة أخرى.';
        return 'توقف الإملاء بسبب خطأ غير متوقع.';
    }

    if (code === 'unsupported') return 'Dictation is not supported in this browser.';
    if (code === 'permission_denied') return 'Microphone permission was denied.';
    if (code === 'audio_capture') return 'No microphone is available on this device.';
    if (code === 'network') return 'A network error interrupted dictation.';
    if (code === 'no_speech') return 'No speech was detected. Try again.';
    return 'Dictation stopped because of an unexpected error.';
}

function getDictationLanguageLabel(language: string | null, lang: string): string | undefined {
    if (!language) {
        return undefined;
    }

    const isArabic = language.toLowerCase().startsWith('ar');
    if (lang === 'ar') {
        return isArabic ? 'العربية' : 'الإنجليزية';
    }

    return isArabic ? 'Arabic' : 'English';
}

function getLimitedDictationModeMessage(info: BrowserSpeechSupportInfo, lang: string): string {
    const isTabletOrPhone = info.platform === 'ipad' || info.platform === 'iphone';
    if (lang === 'ar') {
        return isTabletOrPhone
            ? 'الإملاء متاح بوضع محدود على هذا الجهاز. أبقِ اللغة الحالية ثابتة أثناء الجلسة.'
            : 'الإملاء يعمل بوضع متصفح محدود. أبقِ اللغة الحالية ثابتة أثناء الجلسة.';
    }

    return isTabletOrPhone
        ? 'Dictation is running in limited mode on this device. Keep the current language locked for this session.'
        : 'Dictation is running in limited browser mode. Keep the current language locked for this session.';
}

const EditorScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();
    const { user } = useAuth();
    const { isOffline } = useOffline();
    const queryClient = useQueryClient();

    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;
    const templateId = currentView.type === 'immersive' ? currentView.params?.templateId : undefined;
    const isNewRoute = projectId === 'new';
    const scopeId = buildScopeId(projectId, templateId);
    const uid = user?.uid;

    const [authorityStatus, setAuthorityStatus] = useState<AuthorityStatus>(isNewRoute ? 'ephemeral' : 'persistent');
    const [isSaving, setIsSaving] = useState(false);
    const [saveIssue, setSaveIssue] = useState<'none' | 'offline' | 'conflict' | 'error'>('none');
    const [isMentorOpen, setIsMentorOpen] = useState(false);
    const [hasInteractedWithTitle, setHasInteractedWithTitle] = useState(false);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [outline, setOutline] = useState<EditorOutlineItem[]>([]);
    const [recoveryBanner, setRecoveryBanner] = useState<RecoveryBanner>(null);
    const [dictationPhase, setDictationPhase] = useState<DictationPhase>('idle');
    const [dictationStartedAt, setDictationStartedAt] = useState<number | null>(null);
    const [dictationElapsedMs, setDictationElapsedMs] = useState(0);
    const [dictationSessionLanguage, setDictationSessionLanguage] = useState<string | null>(null);

    const mentor = mockAgents.find(a => a.id === 'mentor');
    const manuscriptLaneClassName = 'max-w-[780px]';

    const [state, dispatch] = useReducer(historyReducer, { present: EMPTY_SNAPSHOT });
    const { present } = state;

    const presentRef = useRef<EditorSnapshot>(present);
    const hasHydratedRef = useRef(false);
    const hasLocalEditsRef = useRef(false);
    const lastConfirmedSnapshotRef = useRef<EditorSnapshot>(EMPTY_SNAPSHOT);
    const currentRevisionRef = useRef<number | null>(null);
    const activeSavePromiseRef = useRef<Promise<boolean> | null>(null);
    const queuedSnapshotRef = useRef<{ snapshot: EditorSnapshot; expectedRevision?: number } | null>(null);
    const latestAvailableDraftRef = useRef<WriteDraftRecord | null>(null);
    const editorScrollRef = useRef<HTMLDivElement | null>(null);
    const dictationSessionRef = useRef<BrowserSpeechSession | null>(null);
    const dictationAnchorRef = useRef<DictationAnchor | null>(null);
    const dictationStopRequestedRef = useRef(false);
    const dictationLastErrorRef = useRef<BrowserSpeechDictationErrorCode | null>(null);
    const suppressDictationAnchorMappingRef = useRef(false);
    const dictationLimitedModeNoticeRef = useRef(false);

    const [debouncedContent] = useDebounce(present.content, 2000);
    const [debouncedTitleEn] = useDebounce(present.titleEn, 2000);
    const [debouncedTitleAr] = useDebounce(present.titleAr, 2000);
    const [debouncedDocSignature] = useDebounce(serializeDoc(present.contentDoc), 2000);

    const [editor, setEditor] = useState<Editor | null>(null);

    const {
        data: project,
        isLoading: isFetching,
        isError: isFetchError,
        error: fetchError,
        refetch: refetchProject,
    } = useProjectDetails(isNewRoute ? undefined : projectId);
    const { mutateAsync: autosaveAsync } = useAutosaveProject();
    const { mutate: createProject } = useCreateProject();

    useEffect(() => {
        presentRef.current = present;
    }, [present]);

    useEffect(() => {
        hasHydratedRef.current = false;
        hasLocalEditsRef.current = false;
        lastConfirmedSnapshotRef.current = EMPTY_SNAPSHOT;
        currentRevisionRef.current = null;
        latestAvailableDraftRef.current = null;
        activeSavePromiseRef.current = null;
        queuedSnapshotRef.current = null;
        setAuthorityStatus(isNewRoute ? 'ephemeral' : 'persistent');
        setIsSaving(false);
        setSaveIssue('none');
        setOutline([]);
        setRecoveryBanner(null);
        dictationSessionRef.current?.dispose();
        dictationSessionRef.current = null;
        dictationAnchorRef.current = null;
        dictationStopRequestedRef.current = false;
        dictationLastErrorRef.current = null;
        suppressDictationAnchorMappingRef.current = false;
        setDictationPhase('idle');
        setDictationStartedAt(null);
        setDictationElapsedMs(0);
        setDictationSessionLanguage(null);
        dispatch({ type: 'SET', payload: EMPTY_SNAPSHOT });
    }, [isNewRoute, scopeId]);

    useEffect(() => {
        if (dictationPhase === 'idle' || !dictationStartedAt) {
            setDictationElapsedMs(0);
            return;
        }

        const updateElapsed = () => {
            setDictationElapsedMs(Date.now() - dictationStartedAt);
        };

        updateElapsed();
        const interval = window.setInterval(updateElapsed, 1000);
        return () => window.clearInterval(interval);
    }, [dictationPhase, dictationStartedAt]);

    useEffect(() => {
        return () => {
            dictationSessionRef.current?.dispose();
            dictationSessionRef.current = null;
            dictationAnchorRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const handleTransaction = ({ transaction }: { transaction: any }) => {
            const anchor = dictationAnchorRef.current;
            if (!anchor || !transaction?.docChanged) {
                return;
            }

            if (suppressDictationAnchorMappingRef.current) {
                suppressDictationAnchorMappingRef.current = false;
                return;
            }

            anchor.from = transaction.mapping.map(anchor.from, -1);
            anchor.to = transaction.mapping.map(anchor.to, 1);
            anchor.nextPos = transaction.mapping.map(anchor.nextPos, 1);
        };

        editor.on('transaction', handleTransaction);
        return () => {
            editor.off('transaction', handleTransaction);
        };
    }, [editor]);

    useEffect(() => {
        if (!isNewRoute && projectId && projectId !== 'new') {
            void refetchProject();
        }
    }, [isNewRoute, projectId, refetchProject]);

    const hasDirtyChanges = snapshotsEqual(present, lastConfirmedSnapshotRef.current) === false;

    const indicator: SaveIndicator = (() => {
        if (authorityStatus === 'error') {
            return 'error';
        }
        if (authorityStatus === 'materializing' || isSaving) {
            return 'saving';
        }
        if (saveIssue === 'conflict') {
            return 'conflict';
        }
        if (saveIssue === 'error') {
            return 'error';
        }
        if (authorityStatus === 'ephemeral') {
            return hasLocalEditsRef.current ? 'local-only' : 'saved';
        }
        if ((saveIssue === 'offline' || isOffline) && hasDirtyChanges) {
            return 'offline';
        }
        if (hasDirtyChanges) {
            return 'unsaved';
        }
        return 'saved';
    })();

    const persistLocalDraft = useCallback((snapshot: EditorSnapshot, reason: WriteDraftReason) => {
        if (!uid) {
            return;
        }

        writeLocalDrafts.save(
            toDraftRecord(
                uid,
                scopeId,
                projectId && projectId !== 'new' ? projectId : undefined,
                currentRevisionRef.current,
                snapshot,
                reason
            )
        );
    }, [projectId, scopeId, uid]);

    const clearLocalDraft = useCallback(() => {
        if (!uid) {
            return;
        }
        writeLocalDrafts.clear(uid, scopeId);
    }, [scopeId, uid]);

    const updateProjectCaches = useCallback((nextProject: Project) => {
        if (!uid) {
            return;
        }

        queryClient.setQueryData(
            queryKeys.user.project(uid, nextProject.id) as unknown as any[],
            nextProject
        );
        queryClient.setQueryData<Project[]>(
            queryKeys.user.projects(uid) as unknown as any[],
            (old = []) => old.map(item => item.id === nextProject.id ? nextProject : item)
        );
    }, [queryClient, uid]);

    const persistSnapshot = useCallback(async (
        snapshot: EditorSnapshot,
        options?: { expectedRevision?: number; draftReason?: WriteDraftReason }
    ): Promise<boolean> => {
        if (!uid || !projectId || projectId === 'new' || authorityStatus !== 'persistent') {
            return false;
        }

        if (isOffline) {
            persistLocalDraft(snapshot, options?.draftReason || 'offline');
            setSaveIssue('offline');
            return false;
        }

        if (activeSavePromiseRef.current) {
            queuedSnapshotRef.current = {
                snapshot,
                expectedRevision: options?.expectedRevision,
            };
            return activeSavePromiseRef.current.then(async () => {
                const queued = queuedSnapshotRef.current;
                if (!queued) {
                    return true;
                }
                queuedSnapshotRef.current = null;
                return persistSnapshot(queued.snapshot, {
                    expectedRevision: queued.expectedRevision,
                    draftReason: options?.draftReason,
                });
            });
        }

        const run = async (): Promise<boolean> => {
            setIsSaving(true);
            setSaveIssue('none');

            try {
                const result = await autosaveAsync({
                    projectId,
                    expectedRevision: options?.expectedRevision ?? currentRevisionRef.current ?? 1,
                    updates: snapshot,
                });

                currentRevisionRef.current = result.revision;
                lastConfirmedSnapshotRef.current = snapshot;
                hasLocalEditsRef.current = false;
                setSaveIssue('none');
                clearLocalDraft();
                return true;
            } catch (error) {
                if (isRevisionMismatchError(error)) {
                    setSaveIssue('conflict');
                    persistLocalDraft(snapshot, options?.draftReason || 'conflict');
                    return false;
                }

                if (isOfflineWriteError(error)) {
                    setSaveIssue('offline');
                    persistLocalDraft(snapshot, options?.draftReason || 'offline');
                    return false;
                }

                console.error('[WRITE][AUTOSAVE_FAILED]', error);
                setSaveIssue('error');
                persistLocalDraft(snapshot, options?.draftReason || 'error');
                return false;
            } finally {
                setIsSaving(false);
            }
        };

        activeSavePromiseRef.current = run();
        const success = await activeSavePromiseRef.current;
        activeSavePromiseRef.current = null;

        if (success && queuedSnapshotRef.current) {
            const queued = queuedSnapshotRef.current;
            queuedSnapshotRef.current = null;
            return persistSnapshot(queued.snapshot, {
                expectedRevision: queued.expectedRevision,
                draftReason: options?.draftReason,
            });
        }

        return success;
    }, [authorityStatus, autosaveAsync, clearLocalDraft, isOffline, persistLocalDraft, projectId, uid]);

    const reconcileConflict = useCallback(async () => {
        if (!uid || !projectId || projectId === 'new') {
            return;
        }

        setIsSaving(true);
        try {
            const latestProject = await WriteRepository.getProject(uid, projectId);
            updateProjectCaches(latestProject);

            const latestSnapshot = snapshotFromProject(latestProject);
            currentRevisionRef.current = latestProject.revision ?? 1;
            lastConfirmedSnapshotRef.current = latestSnapshot;

            if (!snapshotsEqual(presentRef.current, latestSnapshot)) {
                const reconciled = await persistSnapshot(presentRef.current, {
                    expectedRevision: latestProject.revision ?? 1,
                    draftReason: 'conflict',
                });

                if (!reconciled) {
                    showToast(lang === 'en' ? 'Conflict requires another retry.' : 'يتطلب التعارض إعادة محاولة أخرى.');
                    return;
                }
            } else {
                clearLocalDraft();
                setSaveIssue('none');
            }

            showToast(lang === 'en' ? 'Conflict reconciled.' : 'تمت المصالحة.');
        } catch (error) {
            console.error('[WRITE][RECONCILE_FAILED]', error);
            setSaveIssue('error');
            persistLocalDraft(presentRef.current, 'error');
            showToast(lang === 'en' ? 'Failed to reconcile with server.' : 'فشلت المصالحة مع الخادم.');
        } finally {
            setIsSaving(false);
        }
    }, [clearLocalDraft, lang, persistLocalDraft, persistSnapshot, projectId, showToast, uid, updateProjectCaches]);

    const hydrateFromRecoveryDraft = useCallback((draft: WriteDraftRecord, mode: RecoveryBanner['mode']) => {
        latestAvailableDraftRef.current = draft;
        dispatch({ type: 'SET', payload: draft.snapshot });
        presentRef.current = draft.snapshot;
        hasLocalEditsRef.current = true;
        setRecoveryBanner({ mode, draft });
        setSaveIssue(
            draft.reason === 'offline'
                ? 'offline'
                : draft.reason === 'conflict'
                    ? 'conflict'
                    : draft.reason === 'error'
                        ? 'error'
                        : 'none'
        );
    }, []);

    useEffect(() => {
        if (hasHydratedRef.current) {
            return;
        }

        if (isNewRoute) {
            const template = templateId ? mockTemplates.find(t => t.id === templateId) : null;
            const initContent = template?.boilerplateContent || '<p></p>';
            const initTitleEn = template?.titleEn || 'Untitled Project';
            const initTitleAr = template?.titleAr || 'مشروع غير معنون';
            const baseSnapshot: EditorSnapshot = {
                content: initContent,
                contentDoc: undefined,
                wordCount: countWordsScriptAware(stripHtml(initContent)),
                titleEn: initTitleEn,
                titleAr: initTitleAr,
            };

            lastConfirmedSnapshotRef.current = baseSnapshot;

            const draft = uid ? writeLocalDrafts.load(uid, scopeId) : null;
            if (draft && !snapshotsEqual(draft.snapshot, baseSnapshot)) {
                hydrateFromRecoveryDraft(draft, 'recovered');
            } else {
                dispatch({ type: 'SET', payload: baseSnapshot });
                presentRef.current = baseSnapshot;
            }

            currentRevisionRef.current = draft?.serverRevision ?? null;
            hasHydratedRef.current = true;
            setAuthorityStatus('ephemeral');
            return;
        }

        if (project) {
            const serverSnapshot = snapshotFromProject(project);
            const serverRevision = project.revision ?? 1;
            currentRevisionRef.current = serverRevision;
            lastConfirmedSnapshotRef.current = serverSnapshot;

            const draft = uid ? writeLocalDrafts.load(uid, scopeId) : null;
            if (draft && !snapshotsEqual(draft.snapshot, serverSnapshot)) {
                if ((draft.serverRevision ?? 0) >= serverRevision) {
                    hydrateFromRecoveryDraft(draft, 'recovered');
                } else {
                    dispatch({ type: 'SET', payload: serverSnapshot });
                    presentRef.current = serverSnapshot;
                    latestAvailableDraftRef.current = draft;
                    setRecoveryBanner({ mode: 'available', draft });
                }
            } else {
                dispatch({ type: 'SET', payload: serverSnapshot });
                presentRef.current = serverSnapshot;
            }

            hasHydratedRef.current = true;
            setAuthorityStatus('persistent');
        }
    }, [hydrateFromRecoveryDraft, isNewRoute, project, scopeId, templateId, uid]);

    useEffect(() => {
        const shouldMaterialize =
            isNewRoute &&
            !isOffline &&
            hasHydratedRef.current &&
            authorityStatus === 'ephemeral' &&
            hasLocalEditsRef.current;

        if (!shouldMaterialize) {
            return;
        }

        setAuthorityStatus('materializing');
        devLog('[WRITE][PHASE_2] MATERIALIZATION_STARTED: Establishing backend authority...');

        const initialSnapshot: EditorSnapshot = { ...presentRef.current };

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
                    devLog(`[WRITE][PHASE_3] MATERIALIZATION_SUCCESS: Canonical ID verified: ${newProject.id}`);
                    lastConfirmedSnapshotRef.current = initialSnapshot;
                    currentRevisionRef.current = newProject.revision ?? 1;
                    hasLocalEditsRef.current = false;
                    setAuthorityStatus('persistent');
                    setSaveIssue('none');

                    if (uid) {
                        writeLocalDrafts.clear(uid, scopeId);
                    }

                    navigate({
                        type: 'immersive',
                        id: 'editor',
                        params: { ...currentView.params, projectId: newProject.id }
                    });
                },
                onError: (error) => {
                    console.error('[WRITE][MATERIALIZATION_FAILED]', error);
                    setAuthorityStatus('ephemeral');
                    setSaveIssue(isOfflineWriteError(error) ? 'offline' : 'error');
                    persistLocalDraft(initialSnapshot, isOffline ? 'offline' : 'error');
                    showToast(lang === 'en' ? 'Draft kept locally until sync is available.' : 'تم الاحتفاظ بالمسودة محلياً حتى تتوفر المزامنة.');
                }
            }
        );
    }, [authorityStatus, createProject, currentView.params, isNewRoute, isOffline, lang, navigate, persistLocalDraft, scopeId, showToast, uid]);

    useEffect(() => {
        const canAutosave =
            hasHydratedRef.current &&
            authorityStatus === 'persistent' &&
            projectId &&
            projectId !== 'new' &&
            !isOffline &&
            saveIssue !== 'conflict' &&
            saveIssue !== 'error';

        if (!canAutosave) {
            return;
        }

        const liveDocSignature = serializeDoc(present.contentDoc);
        const isSettled =
            debouncedContent === present.content &&
            debouncedTitleEn === present.titleEn &&
            debouncedTitleAr === present.titleAr &&
            debouncedDocSignature === liveDocSignature;

        if (!isSettled) {
            return;
        }

        const pendingSnapshot: EditorSnapshot = { ...present };

        const hasDebouncedChanges =
            pendingSnapshot.content !== lastConfirmedSnapshotRef.current.content ||
            pendingSnapshot.titleEn !== lastConfirmedSnapshotRef.current.titleEn ||
            pendingSnapshot.titleAr !== lastConfirmedSnapshotRef.current.titleAr ||
            serializeDoc(pendingSnapshot.contentDoc) !== serializeDoc(lastConfirmedSnapshotRef.current.contentDoc);

        if (!hasDebouncedChanges) {
            return;
        }

        void persistSnapshot(pendingSnapshot, { draftReason: 'unsaved' });
    }, [
        authorityStatus,
        debouncedContent,
        debouncedDocSignature,
        debouncedTitleAr,
        debouncedTitleEn,
        isOffline,
        persistSnapshot,
        present,
        projectId,
        saveIssue,
    ]);

    useEffect(() => {
        if (!uid || !hasHydratedRef.current) {
            return;
        }

        const shouldPersistLocally =
            authorityStatus === 'ephemeral'
                ? hasLocalEditsRef.current
                : hasDirtyChanges || saveIssue !== 'none' || isSaving;

        if (!shouldPersistLocally) {
            if (authorityStatus === 'persistent') {
                clearLocalDraft();
            }
            return;
        }

        const draftReason: WriteDraftReason =
            saveIssue === 'conflict'
                ? 'conflict'
                : saveIssue === 'offline'
                    ? 'offline'
                    : saveIssue === 'error'
                        ? 'error'
                        : 'unsaved';

        const timer = window.setTimeout(() => {
            persistLocalDraft(presentRef.current, draftReason);
        }, 600);

        return () => window.clearTimeout(timer);
    }, [authorityStatus, clearLocalDraft, hasDirtyChanges, isSaving, persistLocalDraft, present, saveIssue, uid]);

    const flushBeforeExit = useCallback(async (): Promise<boolean> => {
        if (!hasHydratedRef.current) {
            return true;
        }

        const snapshot = presentRef.current;

        if (authorityStatus === 'ephemeral' && hasLocalEditsRef.current) {
            persistLocalDraft(snapshot, 'exit');
            showToast(lang === 'en' ? 'Draft saved locally.' : 'تم حفظ المسودة محلياً.');
            return true;
        }

        if (authorityStatus !== 'persistent' || !projectId || projectId === 'new' || !hasDirtyChanges) {
            return true;
        }

        if (saveIssue === 'conflict') {
            persistLocalDraft(snapshot, 'conflict');
            showToast(lang === 'en' ? 'Conflict kept locally. Reopen to reconcile.' : 'تم الاحتفاظ بالتعارض محلياً. أعد الفتح للمصالحة.');
            return true;
        }

        if (isOffline) {
            persistLocalDraft(snapshot, 'offline');
            showToast(lang === 'en' ? 'Draft saved locally while offline.' : 'تم حفظ المسودة محلياً أثناء عدم الاتصال.');
            return true;
        }

        const flushed = await persistSnapshot(snapshot, { draftReason: 'exit' });
        if (!flushed) {
            showToast(lang === 'en' ? 'Could not confirm server save. Staying in editor.' : 'تعذر تأكيد الحفظ على الخادم. ستبقى في المحرر.');
            return false;
        }

        return true;
    }, [authorityStatus, hasDirtyChanges, isOffline, lang, persistLocalDraft, persistSnapshot, projectId, saveIssue, showToast]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasHydratedRef.current) {
                return;
            }

            const snapshot = presentRef.current;
            const shouldGuard =
                (authorityStatus === 'ephemeral' && hasLocalEditsRef.current) ||
                (authorityStatus === 'persistent' && hasDirtyChanges);

            if (!shouldGuard) {
                return;
            }

            if (uid) {
                persistLocalDraft(
                    snapshot,
                    saveIssue === 'conflict'
                        ? 'conflict'
                        : isOffline
                            ? 'offline'
                            : 'exit'
                );
            }

            event.preventDefault();
            event.returnValue = '';
        };

        const handlePageHide = () => {
            if (!hasHydratedRef.current || !uid) {
                return;
            }

            const shouldPersist =
                (authorityStatus === 'ephemeral' && hasLocalEditsRef.current) ||
                (authorityStatus === 'persistent' && hasDirtyChanges);

            if (!shouldPersist) {
                return;
            }

            persistLocalDraft(
                presentRef.current,
                saveIssue === 'conflict'
                    ? 'conflict'
                    : isOffline
                        ? 'offline'
                        : 'exit'
            );
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        window.addEventListener('pagehide', handlePageHide);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('pagehide', handlePageHide);
        };
    }, [authorityStatus, hasDirtyChanges, isOffline, persistLocalDraft, saveIssue, uid]);

    const handleBack = async () => {
        if (dictationPhase !== 'idle') {
            teardownDictationSession('idle');
        }

        const canExit = await flushBeforeExit();
        if (!canExit) {
            return;
        }
        navigate(currentView.params?.from || { type: 'tab', id: 'write' });
    };

    const handleEditorChange = (payload: EditorChangePayload) => {
        if (!hasHydratedRef.current) {
            return;
        }

        const nextSnapshot: EditorSnapshot = {
            ...presentRef.current,
            content: payload.html,
            contentDoc: payload.contentDoc,
            wordCount: payload.wordCount,
        };

        if (!hasLocalEditsRef.current && !snapshotsEqual(nextSnapshot, lastConfirmedSnapshotRef.current)) {
            hasLocalEditsRef.current = true;
        }

        setOutline(payload.outline);
        dispatch({ type: 'SET', payload: nextSnapshot });
    };

    const handleOutlineSelect = useCallback((item: OutlinePanelItem) => {
        if (!editor || !editorScrollRef.current) return;

        const targetPos = Math.max(1, item.pos + 1);
        editor.chain().focus().setTextSelection(targetPos).run();

        requestAnimationFrame(() => {
            const scrollContainer = editorScrollRef.current;
            if (!scrollContainer) return;

            try {
                const coords = editor.view.coordsAtPos(targetPos);
                const containerRect = scrollContainer.getBoundingClientRect();
                const topPadding = 20;
                const nextTop = scrollContainer.scrollTop + coords.top - containerRect.top - topPadding;

                scrollContainer.scrollTo({
                    top: Math.max(0, nextTop),
                    behavior: 'smooth',
                });
            } catch (error) {
                devLog('Outline navigation failed to resolve editor coordinates', error);
            }
        });
    }, [editor]);

    const structuredOutline = useMemo<OutlinePanelItem[]>(() => {
        if (!editor) {
            return [];
        }

        const items: OutlinePanelItem[] = [];
        let chapterNumber = 0;

        editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'horizontalRule') {
                chapterNumber += 1;
                items.push({
                    id: `chapter_${chapterNumber}_${pos}`,
                    kind: 'chapter',
                    label: `Chapter ${chapterNumber}`,
                    pos,
                });
                return true;
            }

            if (node.type.name !== 'heading') {
                return true;
            }

            const headline = (node.textContent || '').trim();
            if (!headline) {
                return true;
            }

            if (chapterNumber === 0) {
                chapterNumber = 1;
                items.push({
                    id: `chapter_${chapterNumber}_opening`,
                    kind: 'chapter',
                    label: `Chapter ${chapterNumber}`,
                    pos,
                });
            }

            items.push({
                id: `headline_${pos}`,
                kind: 'headline',
                label: headline,
                pos,
                dir: node.attrs.dir === 'rtl' || node.attrs.dir === 'ltr' ? node.attrs.dir : undefined,
            });

            return true;
        });

        return items;
    }, [editor, outline, present.contentDoc]);

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextSnapshot = { ...presentRef.current };
        const newTitle = e.target.value;

        if (lang === 'en') {
            nextSnapshot.titleEn = newTitle;
        } else {
            nextSnapshot.titleAr = newTitle;
        }

        if (!hasLocalEditsRef.current && !snapshotsEqual(nextSnapshot, lastConfirmedSnapshotRef.current)) {
            hasLocalEditsRef.current = true;
        }

        dispatch({ type: 'SET', payload: nextSnapshot });
    };

    const handleTitleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (isNewRoute && !hasInteractedWithTitle) {
            const value = e.target.value;
            if (value === 'Untitled Project' || value === 'مشروع غير معنون') {
                const nextSnapshot = { ...presentRef.current, titleEn: '', titleAr: '' };
                dispatch({ type: 'SET', payload: nextSnapshot });
                setHasInteractedWithTitle(true);
            }
        }
    };

    const handleRestoreLocalDraft = () => {
        const draft = latestAvailableDraftRef.current;
        if (!draft) {
            return;
        }

        hydrateFromRecoveryDraft(draft, 'recovered');
        showToast(lang === 'en' ? 'Local draft restored.' : 'تمت استعادة المسودة المحلية.');
    };

    const teardownDictationSession = useCallback((phase: DictationPhase = 'idle') => {
        dictationSessionRef.current?.dispose();
        dictationSessionRef.current = null;
        dictationAnchorRef.current = null;
        dictationStopRequestedRef.current = false;
        suppressDictationAnchorMappingRef.current = false;
        setDictationPhase(phase);
        setDictationStartedAt(null);
        setDictationElapsedMs(0);
        setDictationSessionLanguage(null);
    }, []);

    const insertDictationTranscript = useCallback((transcript: string) => {
        if (!editor) {
            return;
        }

        const chunk = normalizeDictationTranscript(transcript);
        if (!chunk) {
            return;
        }

        const anchor = dictationAnchorRef.current;
        if (!anchor) {
            return;
        }

        suppressDictationAnchorMappingRef.current = true;

        if (anchor.replaceSelection) {
            const insertFrom = Math.max(1, anchor.from);
            const insertTo = Math.max(insertFrom, anchor.to);
            const inserted = editor.commands.insertContentAt({ from: insertFrom, to: insertTo }, chunk);
            if (!inserted) {
                suppressDictationAnchorMappingRef.current = false;
                return;
            }
            anchor.replaceSelection = false;
            anchor.from = insertFrom;
            anchor.to = insertFrom + chunk.length;
            anchor.nextPos = anchor.to;
            return;
        }

        const insertAt = Math.max(1, anchor.nextPos);
        const inserted = editor.commands.insertContentAt(insertAt, chunk);
        if (!inserted) {
            suppressDictationAnchorMappingRef.current = false;
            return;
        }

        anchor.from = insertAt + chunk.length;
        anchor.to = anchor.from;
        anchor.nextPos = anchor.from;
    }, [editor]);

    const stopDictation = useCallback(() => {
        const session = dictationSessionRef.current;
        if (!session || dictationPhase === 'idle' || dictationPhase === 'stopping') {
            return;
        }

        dictationStopRequestedRef.current = true;
        setDictationPhase('stopping');
        session.stop();
    }, [dictationPhase]);

    const startDictation = useCallback(() => {
        if (!editor) {
            return;
        }

        if (dictationSessionRef.current || dictationPhase !== 'idle') {
            return;
        }

        const supportInfo = getBrowserSpeechSupportInfo();

        if (!isBrowserSpeechRecognitionSupported() || supportInfo.level === 'unsupported') {
            const code: BrowserSpeechDictationErrorCode = 'unsupported';
            dictationLastErrorRef.current = code;
            showToast(getDictationErrorMessage(code, lang));
            return;
        }

        const selection = editor.state.selection;
        dictationAnchorRef.current = {
            from: selection.from,
            to: selection.to,
            nextPos: selection.from,
            replaceSelection: selection.from !== selection.to,
        };
        dictationStopRequestedRef.current = false;
        dictationLastErrorRef.current = null;
        setDictationPhase('starting');
        setDictationStartedAt(null);
        setDictationElapsedMs(0);
        const language = resolveDictationLanguage(editor, lang);
        setDictationSessionLanguage(language);

        try {
            allowNextMediaRequest();
            devLog('[WRITE][DICTATION_SUPPORT]', supportInfo);
            if (supportInfo.level === 'limited' && !dictationLimitedModeNoticeRef.current) {
                dictationLimitedModeNoticeRef.current = true;
                showToast(getLimitedDictationModeMessage(supportInfo, lang));
            }
            const session = createBrowserSpeechSession(language, {
                onStart: () => {
                    setDictationStartedAt(Date.now());
                    setDictationPhase('listening');
                },
                onFinalTranscript: (transcript) => {
                    insertDictationTranscript(transcript);
                },
                onError: (code) => {
                    if (code === 'aborted' && dictationStopRequestedRef.current) {
                        return;
                    }
                    dictationLastErrorRef.current = code;
                    showToast(getDictationErrorMessage(code, lang));
                },
                onEnd: ({ userInitiated }) => {
                    const errorCode = dictationLastErrorRef.current;
                    const stopRequested = dictationStopRequestedRef.current;
                    teardownDictationSession('idle');
                    dictationLastErrorRef.current = null;

                    if (!userInitiated && !stopRequested && !errorCode) {
                        showToast(lang === 'en' ? 'Dictation stopped unexpectedly.' : 'توقف الإملاء بشكل غير متوقع.');
                    }
                },
            });

            dictationSessionRef.current = session;
            session.start();
        } catch (error) {
            console.error('[WRITE][DICTATION_START_FAILED]', error);
            dictationLastErrorRef.current = 'unknown';
            teardownDictationSession('idle');
            showToast(getDictationErrorMessage('unknown', lang));
        }
    }, [dictationPhase, editor, insertDictationTranscript, lang, showToast, teardownDictationSession]);

    const toggleVoice = useCallback(() => {
        if (dictationPhase === 'idle') {
            startDictation();
            return;
        }

        stopDictation();
    }, [dictationPhase, startDictation, stopDictation]);

    if (isFetchError) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900 p-8 text-center">
                <BilingualText role="H1" className="text-red-500 mb-2">Authority Conflict</BilingualText>
                <BilingualText role="Body" className="text-slate-500 mb-6">
                    {fetchError instanceof Error ? fetchError.message : 'Persistence failure.'}
                </BilingualText>
                <Button onClick={() => void handleBack()}>Return to Library</Button>
            </div>
        );
    }

    if (isFetching && !hasHydratedRef.current) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-slate-900">
                <LoadingSpinner />
            </div>
        );
    }

    return (
        <div className="h-screen w-full flex flex-col bg-white dark:bg-slate-900">
            <header className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-black/10 dark:border-white/10">
                <LiteraryShell className="flex h-16 items-center justify-between">
                    <Button variant="ghost" onClick={() => void handleBack()}>
                        <ChevronLeftIcon className="h-6 w-6" />
                    </Button>
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
                            <span
                                className={cn(
                                    indicator === 'saving' && 'text-accent animate-pulse',
                                    indicator === 'conflict' && 'text-amber-500',
                                    indicator === 'offline' && 'text-amber-500',
                                    indicator === 'error' && 'text-red-500'
                                )}
                            >
                                {getIndicatorLabel(indicator, lang)}
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setIsFocusMode(prev => !prev)}
                            className="text-xs px-3 py-1"
                        >
                            {isFocusMode ? (lang === 'en' ? 'Exit Focus' : 'إنهاء التركيز') : (lang === 'en' ? 'Focus' : 'تركيز')}
                        </Button>
                        <Button variant="ghost" onClick={() => setIsMentorOpen(true)}>
                            <BrainIcon className="h-6 w-6 text-accent" />
                        </Button>
                    </div>
                </LiteraryShell>
            </header>

            {recoveryBanner && (
                <div className="px-4 md:px-8 py-2 bg-sky-500/10 border-b border-sky-500/30 flex items-center justify-between gap-3">
                    <BilingualText className="text-sky-200 text-sm">
                        {recoveryBanner.mode === 'recovered'
                            ? (lang === 'en'
                                ? 'Recovered a newer local draft. Review and continue writing.'
                                : 'تمت استعادة مسودة محلية أحدث. راجعها وتابع الكتابة.')
                            : (lang === 'en'
                                ? 'A newer local draft is available from this device.'
                                : 'تتوفر مسودة محلية أحدث من هذا الجهاز.')}
                    </BilingualText>
                    {recoveryBanner.mode === 'available' ? (
                        <Button variant="ghost" onClick={handleRestoreLocalDraft} className="!text-sky-100 border border-sky-500/30">
                            {lang === 'en' ? 'Restore Draft' : 'استعادة المسودة'}
                        </Button>
                    ) : (
                        <Button variant="ghost" onClick={() => setRecoveryBanner(null)} className="!text-sky-100 border border-sky-500/30">
                            {lang === 'en' ? 'Dismiss' : 'إغلاق'}
                        </Button>
                    )}
                </div>
            )}

            {indicator === 'conflict' && (
                <div className="px-4 md:px-8 py-2 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between gap-3">
                    <BilingualText className="text-amber-300 text-sm">
                        {lang === 'en'
                            ? 'Revision conflict detected. Reconcile with server before further sync.'
                            : 'تم اكتشاف تعارض في المراجعة. قم بالمصالحة مع الخادم قبل متابعة المزامنة.'}
                    </BilingualText>
                    <Button variant="ghost" onClick={() => void reconcileConflict()} className="!text-amber-200 border border-amber-500/30">
                        {lang === 'en' ? 'Reconcile Now' : 'مصالحة الآن'}
                    </Button>
                </div>
            )}

            <div className="flex-grow flex flex-col relative min-h-0">
                <FormattingToolbar
                    editor={editor}
                    onToggleVoice={toggleVoice}
                    isRecording={dictationPhase !== 'idle'}
                    isVisible={!isFocusMode || dictationPhase !== 'idle'}
                    innerClassName={manuscriptLaneClassName}
                    dictationStatusLabel={getDictationStatusLabel(dictationPhase, lang)}
                    dictationElapsedMs={dictationElapsedMs}
                    dictationLanguageLabel={getDictationLanguageLabel(dictationSessionLanguage, lang)}
                />

                <div ref={editorScrollRef} className="flex-grow min-h-0 overflow-y-auto overscroll-y-contain">
                    <LiteraryShell className="relative min-h-full py-4">
                        <div className={cn('h-full', !isFocusMode && 'lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-6')}>
                            {!isFocusMode && (
                                <OutlinePanel
                                    items={structuredOutline}
                                    onSelectItem={handleOutlineSelect}
                                    titleLabel={lang === 'en' ? 'Outline' : 'المخطط'}
                                    emptyLabel={lang === 'en' ? 'Add headings to build your outline.' : 'أضف عناوين لبناء المخطط.'}
                                />
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
                        <div className="h-40 md:h-56" aria-hidden="true" />
                    </LiteraryShell>
                </div>
            </div>

            <Modal isOpen={isMentorOpen} onClose={() => setIsMentorOpen(false)}>
                <div className="flex flex-col items-center text-center p-2">
                    <div className="p-4 rounded-full bg-sky-100 dark:bg-sky-900/30 mb-4">
                        {mentor?.icon && <mentor.icon className="h-12 w-12 text-sky-500" />}
                    </div>
                    <BilingualText role="H1" className="!text-2xl mb-2">{mentor?.name}</BilingualText>
                    <BilingualText className="text-slate-600 dark:text-slate-300 mb-6">
                        {lang === 'en' ? mentor?.descriptionEn : mentor?.descriptionAr}
                    </BilingualText>
                    <Button
                        onClick={() => {
                            setIsMentorOpen(false);
                            navigate({ type: 'immersive', id: 'agentChat', params: { agentId: 'mentor', from: currentView } });
                        }}
                        className="w-full"
                    >
                        {lang === 'en' ? 'Chat with Mentor' : 'تحدث مع المرشد'}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default EditorScreen;
