import { devLog } from '../../lib/logging/devLog';
import React, { useEffect, useReducer, useState, useRef, useCallback, useMemo } from 'react';
import { type Editor } from '@tiptap/react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useToast } from '../../store/toast.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useOffline } from '../../lib/offline/OfflineProvider.tsx';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import Modal from '../../components/ui/Modal.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import { BrainIcon } from '../../components/icons/BrainIcon.tsx';
import { ViewListIcon } from '../../components/icons/ViewListIcon.tsx';
import { XIcon } from '../../components/icons/XIcon.tsx';
import FormattingToolbar from '../../components/editor/FormattingToolbar.tsx';
import OutlinePanel, { OutlinePanelItem } from '../../components/editor/OutlinePanel.tsx';
import TiptapEditor, { EditorChangePayload } from '../../components/editor/TiptapEditor.tsx';
import CollaborativeCursorLayer from '../../components/editor/CollaborativeCursorLayer.tsx';
import { useProjectDetails } from '../../lib/hooks/useProjectDetails.ts';
import { useAutosaveProject } from '../../lib/hooks/useAutosaveProject.ts';
import { useCreateProject } from '../../lib/hooks/useCreateProject.ts';
import { cn } from '../../lib/utils.ts';
import { countWordsScriptAware } from '../../lib/editor/writeDocument.ts';
import {
    captureCursorMemory,
    type CursorMemoryPayload,
} from '../../lib/editor/cursorMemory.ts';
import {
    JOURNAL_TEMPLATE_ID,
} from '../../lib/editor/journalMode.ts';
import { Project } from '../../types/entities.ts';
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
import { createBlankProjectSeed, createProjectSeedFromTemplate, getWriteTemplate } from '../../lib/templates/writeTemplates.ts';
import { writeEditorTelemetry } from '../../lib/editor/writeEditorTelemetry.ts';
import { useWriteRenderDiagnostics } from '../../lib/editor/useWriteRenderDiagnostics.ts';
import {
    type AuthorityStatus,
    type EditorSnapshot,
    EMPTY_SNAPSHOT,
    type RecoveryBanner,
    type SaveIndicator,
    buildScopeId,
    getPerfNow,
    getProjectCursorMemory,
    isOfflineWriteError,
    serializeDoc,
    snapshotsEqual,
    stripHtml,
} from '../../lib/editor/editorRuntimeTypes.ts';
import { useEditorOutlineIndexer } from '../../lib/editor/editorOutlineIndexer.ts';
import { useEditorMentorBridge } from '../../lib/editor/useEditorMentorBridge.ts';
import { useEditorRecoveryController } from '../../lib/editor/useEditorRecoveryController.ts';
import { useEditorPersistenceController } from '../../lib/editor/useEditorPersistenceController.ts';
import {
    type DictationAnchor,
    useEditorRuntimeController,
} from '../../lib/editor/useEditorRuntimeController.ts';
import { useChunkedManuscriptController } from '../../lib/editor/useChunkedManuscriptController.ts';
import { useDynamicRuntimeWindowController } from '../../lib/editor/useDynamicRuntimeWindowController.ts';
import { useWriteCollaborationRuntime } from '../../lib/editor/useWriteCollaborationRuntime.ts';
import type { WriteProjectOperationAckInput } from '../../lib/editor/writeOperationalTypes.ts';

const DevWritePerformanceOverlay = import.meta.env.DEV
    ? React.lazy(() => import('../../components/editor/WritePerformanceOverlay.tsx'))
    : null;

type HistoryState = { present: EditorSnapshot };
type HistoryAction = { type: 'SET', payload: EditorSnapshot };

type DictationPhase = 'idle' | 'starting' | 'listening' | 'stopping';

const historyReducer = (state: HistoryState, action: HistoryAction): HistoryState => {
    return { ...state, present: action.payload };
};

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

function isJournalMode(params: {
    isNewRoute: boolean;
    templateId?: string;
    project?: Project;
}): boolean {
    if (params.isNewRoute) {
        return params.templateId === JOURNAL_TEMPLATE_ID;
    }

    return params.project?.workType === 'journal';
}

const EditorScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();
    const { user } = useAuth();
    const { isOffline } = useOffline();

    const projectId = currentView.type === 'immersive' ? currentView.params?.projectId : undefined;
    const templateId = currentView.type === 'immersive' ? currentView.params?.templateId : undefined;
    const isNewRoute = projectId === 'new';
    const scopeId = buildScopeId(projectId, templateId);
    const uid = user?.uid;

    const [authorityStatus, setAuthorityStatus] = useState<AuthorityStatus>(isNewRoute ? 'ephemeral' : 'persistent');
    const [hasInteractedWithTitle, setHasInteractedWithTitle] = useState(false);
    const [isFocusMode, setIsFocusMode] = useState(false);
    const [isMobileOutlineOpen, setIsMobileOutlineOpen] = useState(false);
    const [recoveryBanner, setRecoveryBanner] = useState<RecoveryBanner>(null);
    const [dictationPhase, setDictationPhase] = useState<DictationPhase>('idle');
    const [dictationStartedAt, setDictationStartedAt] = useState<number | null>(null);
    const [dictationElapsedMs, setDictationElapsedMs] = useState(0);
    const [dictationSessionLanguage, setDictationSessionLanguage] = useState<string | null>(null);

    const manuscriptLaneClassName = 'max-w-[780px]';

    const [state, dispatch] = useReducer(historyReducer, { present: EMPTY_SNAPSHOT });
    const { present } = state;

    const presentRef = useRef<EditorSnapshot>(present);
    const hasHydratedRef = useRef(false);
    const hasLocalEditsRef = useRef(false);
    const routeMountedAtRef = useRef(getPerfNow());
    const lastLocalEditAtRef = useRef<number | null>(null);
    const lastConfirmedSnapshotRef = useRef<EditorSnapshot>(EMPTY_SNAPSHOT);
    const currentRevisionRef = useRef<number | null>(null);
    const lastPersistedCursorRef = useRef<CursorMemoryPayload | null>(null);
    const dictationSessionRef = useRef<BrowserSpeechSession | null>(null);
    const dictationAnchorRef = useRef<DictationAnchor | null>(null);
    const dictationStopRequestedRef = useRef(false);
    const dictationLastErrorRef = useRef<BrowserSpeechDictationErrorCode | null>(null);
    const suppressDictationAnchorMappingRef = useRef(false);
    const dictationLimitedModeNoticeRef = useRef(false);
    const persistCursorMemoryRef = useRef<(() => Promise<boolean>) | null>(null);

    const {
        data: project,
        isLoading: isFetching,
        isError: isFetchError,
        error: fetchError,
        refetch: refetchProject,
    } = useProjectDetails(isNewRoute ? undefined : projectId);
    const { mutateAsync: autosaveAsync } = useAutosaveProject();
    const { mutate: createProject } = useCreateProject();
    const journalModeActive = useMemo(
        () => isJournalMode({ isNewRoute, templateId, project }),
        [isNewRoute, project, templateId]
    );

    const setSnapshot = useCallback((snapshot: EditorSnapshot) => {
        dispatch({ type: 'SET', payload: snapshot });
    }, []);

    const {
        latestAvailableDraftRef,
        persistLocalDraft,
        clearLocalDraft,
        loadLocalDraft,
        hydrateFromRecoveryDraft,
        resetRecoveryController,
    } = useEditorRecoveryController({
        uid,
        scopeId,
        projectId,
        currentRevisionRef,
        presentRef,
        hasLocalEditsRef,
        setSnapshot,
        setRecoveryBanner,
    });
    const {
        loadProjectSnapshot,
        shiftRuntimeWindow,
        migrateLegacySnapshot,
        saveSnapshot: saveChunkedSnapshot,
    } = useChunkedManuscriptController({
        uid,
        projectId,
    });
    const saveManuscriptSnapshot = useCallback(async (
        snapshot: EditorSnapshot,
        revision: number,
        operation?: WriteProjectOperationAckInput
    ) => {
        const metadata = await saveChunkedSnapshot(snapshot, revision, operation);
        return metadata
            ? {
                activeSectionId: metadata.activeSectionId,
                manuscriptStorage: metadata,
            }
            : null;
    }, [saveChunkedSnapshot]);

    const {
        editor,
        setEditor,
        editorScrollRef,
        handleOutlineSelect: selectOutlineItem,
        resetRuntimeController,
    } = useEditorRuntimeController({
        project,
        lang,
        authorityStatus,
        journalModeActive,
        hasHydratedRef,
        presentRef,
        lastPersistedCursorRef,
        dictationAnchorRef,
        suppressDictationAnchorMappingRef,
        persistCursorMemoryRef,
    });

    useDynamicRuntimeWindowController({
        project,
        editor,
        scrollRef: editorScrollRef,
        hasHydratedRef,
        hasLocalEditsRef,
        presentRef,
        lastConfirmedSnapshotRef,
        shiftRuntimeWindow,
        setSnapshot,
    });

    const collaborationRuntime = useWriteCollaborationRuntime({
        uid,
        projectId,
        authorityStatus,
        isOffline,
        editor,
        scrollElement: editorScrollRef.current,
        hasHydratedRef,
        hasLocalEditsRef,
        presentRef,
        lastConfirmedSnapshotRef,
        currentRevisionRef,
        setSnapshot,
        displayName: user?.displayName || user?.email || undefined,
    });

    const {
        isSaving,
        saveIssue,
        setSaveIssue,
        indicator,
        persistCursorMemory,
        reconcileConflict,
        flushBeforeExit,
        resetPersistenceController,
    } = useEditorPersistenceController({
        uid,
        projectId,
        lang,
        isOffline,
        authorityStatus,
        editor,
        present,
        autosaveAsync,
        saveManuscriptSnapshot,
        loadManuscriptSnapshot: loadProjectSnapshot,
        persistLocalDraft,
        clearLocalDraft,
        onLocalOperationCommitted: collaborationRuntime.publishLocalOperation,
        showToast,
        hasHydratedRef,
        hasLocalEditsRef,
        presentRef,
        lastConfirmedSnapshotRef,
        currentRevisionRef,
        lastPersistedCursorRef,
        lastLocalEditAtRef,
    });

    const { mentor, isMentorOpen, openMentor, closeMentor, startMentorChat } = useEditorMentorBridge({
        currentView,
        navigate,
    });

    useEffect(() => {
        persistCursorMemoryRef.current = persistCursorMemory;
    }, [persistCursorMemory]);

    useWriteRenderDiagnostics('EditorScreen', {
        authorityStatus,
        isSaving,
        saveIssue,
        isMentorOpen,
        isFocusMode,
        isMobileOutlineOpen,
        dictationPhase,
        recoveryMode: recoveryBanner?.mode ?? 'none',
        contentLength: present.content.length,
        contentDocNodeCount: present.contentDoc?.content?.length ?? 0,
        wordCount: present.wordCount,
        projectId,
        isOffline,
    });

    useEffect(() => {
        presentRef.current = present;
    }, [present]);

    useEffect(() => {
        writeEditorTelemetry.log('lifecycle', 'editor_route_mounted', {
            projectId,
            isNewRoute,
            templateId,
        });
        return () => {
            writeEditorTelemetry.timing('editor.routeLifetime', getPerfNow() - routeMountedAtRef.current, {
                projectId,
                isNewRoute,
            });
            writeEditorTelemetry.log('lifecycle', 'editor_route_unmounted', {
                projectId,
                isNewRoute,
            });
        };
    }, []);

    useEffect(() => {
        writeEditorTelemetry.log('lifecycle', 'editor_route_reset', {
            scopeId,
            isNewRoute,
        }, 'debug');
        hasHydratedRef.current = false;
        hasLocalEditsRef.current = false;
        lastLocalEditAtRef.current = null;
        lastConfirmedSnapshotRef.current = EMPTY_SNAPSHOT;
        currentRevisionRef.current = null;
        resetRecoveryController();
        resetRuntimeController();
        resetPersistenceController();
        setAuthorityStatus(isNewRoute ? 'ephemeral' : 'persistent');
        setIsMobileOutlineOpen(false);
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
        setSnapshot(EMPTY_SNAPSHOT);
    }, [isNewRoute, resetPersistenceController, resetRecoveryController, resetRuntimeController, scopeId, setSnapshot]);

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
        if (!isMobileOutlineOpen) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setIsMobileOutlineOpen(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isMobileOutlineOpen]);

    useEffect(() => {
        if (!isNewRoute && projectId && projectId !== 'new') {
            void refetchProject();
        }
    }, [isNewRoute, projectId, refetchProject]);

    useEffect(() => {
        if (hasHydratedRef.current) {
            return;
        }

        if (!isNewRoute && !project) {
            return;
        }

        let cancelled = false;
        const finishHydration = writeEditorTelemetry.startTimer('editor.hydration', {
            scopeId,
            isNewRoute,
            hasProject: Boolean(project),
        });

        if (isNewRoute) {
            const template = getWriteTemplate(templateId);
            const starter = template
                ? createProjectSeedFromTemplate(template.id, lang === 'ar' ? 'ar' : 'en')
                : createBlankProjectSeed('book', lang === 'ar' ? 'ar' : 'en');
            const baseSnapshot: EditorSnapshot = {
                content: starter.content,
                contentDoc: starter.contentDoc,
                wordCount: starter.wordCount ?? countWordsScriptAware(stripHtml(starter.content)),
                titleEn: starter.titleEn,
                titleAr: starter.titleAr,
            };

            lastConfirmedSnapshotRef.current = baseSnapshot;

            const draft = loadLocalDraft();
            if (draft && !snapshotsEqual(draft.snapshot, baseSnapshot)) {
                setSaveIssue(hydrateFromRecoveryDraft(draft, 'recovered'));
            } else {
                setSnapshot(baseSnapshot);
                presentRef.current = baseSnapshot;
            }

            currentRevisionRef.current = draft?.serverRevision ?? null;
            lastPersistedCursorRef.current = null;
            hasHydratedRef.current = true;
            setAuthorityStatus('ephemeral');
            finishHydration();
            writeEditorTelemetry.log('hydration', 'new_project_hydrated', {
                scopeId,
                recoveredDraft: Boolean(draft),
            });
            return;
        }

        if (project) {
            void (async () => {
            const loaded = await loadProjectSnapshot(project);
            if (cancelled) {
                finishHydration();
                return;
            }
            const serverSnapshot = loaded.snapshot;
            const serverRevision = project.revision ?? 1;
            currentRevisionRef.current = serverRevision;
            lastConfirmedSnapshotRef.current = serverSnapshot;
            lastPersistedCursorRef.current = getProjectCursorMemory(project);

            const draft = loadLocalDraft();
            if (draft && !snapshotsEqual(draft.snapshot, serverSnapshot)) {
                if ((draft.serverRevision ?? 0) >= serverRevision) {
                    setSaveIssue(hydrateFromRecoveryDraft(draft, 'recovered'));
                } else {
                    setSnapshot(serverSnapshot);
                    presentRef.current = serverSnapshot;
                    latestAvailableDraftRef.current = draft;
                    setRecoveryBanner({ mode: 'available', draft });
                }
            } else {
                setSnapshot(serverSnapshot);
                presentRef.current = serverSnapshot;
            }

            hasHydratedRef.current = true;
            setAuthorityStatus('persistent');
            finishHydration();
            writeEditorTelemetry.log('hydration', 'project_hydrated', {
                projectId,
                revision: serverRevision,
                manuscriptSource: loaded.source,
                recoveredDraft: Boolean(draft && (draft.serverRevision ?? 0) >= serverRevision),
                availableDraft: Boolean(draft && (draft.serverRevision ?? 0) < serverRevision),
            });
            if (loaded.source === 'legacy') {
                void migrateLegacySnapshot(serverSnapshot, serverRevision);
            }
            })();
        }

        return () => {
            cancelled = true;
        };
    }, [hydrateFromRecoveryDraft, isNewRoute, lang, loadLocalDraft, loadProjectSnapshot, migrateLegacySnapshot, project, projectId, scopeId, setSaveIssue, setSnapshot, templateId]);

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
        writeEditorTelemetry.log('lifecycle', 'materialization_started', {
            scopeId,
            templateId,
        });

        const initialSnapshot: EditorSnapshot = { ...presentRef.current };
        const initialCursorMemory = editor ? captureCursorMemory(editor) : null;

        createProject(
            {
                ...initialSnapshot,
                workType: templateId ? (getWriteTemplate(templateId)?.workType ?? 'book') : 'book',
                typeEn: 'Draft',
                typeAr: 'مسودة',
                status: 'Draft',
                ...(initialCursorMemory ?? {}),
            },
            {
                onSuccess: (newProject) => {
                    devLog(`[WRITE][PHASE_3] MATERIALIZATION_SUCCESS: Canonical ID verified: ${newProject.id}`);
                    writeEditorTelemetry.log('lifecycle', 'materialization_success', {
                        projectId: newProject.id,
                        revision: newProject.revision ?? 1,
                    });
                    lastConfirmedSnapshotRef.current = initialSnapshot;
                    currentRevisionRef.current = newProject.revision ?? 1;
                    lastPersistedCursorRef.current = initialCursorMemory;
                    hasLocalEditsRef.current = false;
                    setAuthorityStatus('persistent');
                    setSaveIssue('none');

                    clearLocalDraft();

                    navigate({
                        type: 'immersive',
                        id: 'editor',
                        params: { ...currentView.params, projectId: newProject.id }
                    });
                },
                onError: (error) => {
                    console.error('[WRITE][MATERIALIZATION_FAILED]', error);
                    writeEditorTelemetry.log('lifecycle', 'materialization_failed', {
                        error: error instanceof Error ? error.message : String(error),
                    }, 'warn');
                    setAuthorityStatus('ephemeral');
                    setSaveIssue(isOfflineWriteError(error) ? 'offline' : 'error');
                    persistLocalDraft(initialSnapshot, isOffline ? 'offline' : 'error');
                    showToast(lang === 'en' ? 'Draft kept locally until sync is available.' : 'تم الاحتفاظ بالمسودة محلياً حتى تتوفر المزامنة.');
                }
            }
        );
    }, [authorityStatus, clearLocalDraft, createProject, currentView.params, editor, isNewRoute, isOffline, lang, navigate, persistLocalDraft, scopeId, showToast, templateId]);

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
        const finish = writeEditorTelemetry.startTimer('editor.parentChangeHandling');
        if (!hasHydratedRef.current) {
            finish();
            return;
        }

        lastLocalEditAtRef.current = getPerfNow();
        const nextSnapshot: EditorSnapshot = {
            ...presentRef.current,
            content: payload.html,
            contentDoc: payload.contentDoc,
            wordCount: presentRef.current.isPartialManuscript
                ? presentRef.current.wordCount
                : payload.wordCount,
            affectedChunkIds: payload.affectedChunkIds,
            affectedAnchorIds: payload.affectedAnchorIds,
        };

        if (!hasLocalEditsRef.current && !snapshotsEqual(nextSnapshot, lastConfirmedSnapshotRef.current)) {
            hasLocalEditsRef.current = true;
        }

        setSnapshot(nextSnapshot);
        writeEditorTelemetry.recordSnapshotSizes({
            html: nextSnapshot.content,
            plainText: payload.plainText,
            contentDoc: nextSnapshot.contentDoc,
            label: 'editor.parentSnapshot',
        });
        finish();
    };

    const outlineItems = useEditorOutlineIndexer(
        editor,
        `${serializeDoc(present.contentDoc)}\n${present.content}`
    );

    const handleOutlineSelect = useCallback((item: OutlinePanelItem) => {
        selectOutlineItem(item);
        setIsMobileOutlineOpen(false);
    }, [selectOutlineItem]);

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const nextSnapshot = { ...presentRef.current };
        const newTitle = e.target.value;

        if (lang === 'en') {
            nextSnapshot.titleEn = newTitle;
        } else {
            nextSnapshot.titleAr = newTitle;
        }

        lastLocalEditAtRef.current = getPerfNow();
        if (!hasLocalEditsRef.current && !snapshotsEqual(nextSnapshot, lastConfirmedSnapshotRef.current)) {
            hasLocalEditsRef.current = true;
        }

        setSnapshot(nextSnapshot);
    };

    const handleTitleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (isNewRoute && !hasInteractedWithTitle) {
            const value = e.target.value;
            if (value === 'Untitled Project' || value === 'مشروع غير معنون') {
                const nextSnapshot = { ...presentRef.current, titleEn: '', titleAr: '' };
                setSnapshot(nextSnapshot);
                setHasInteractedWithTitle(true);
            }
        }
    };

    const handleRestoreLocalDraft = () => {
        const draft = latestAvailableDraftRef.current;
        if (!draft) {
            return;
        }

        setSaveIssue(hydrateFromRecoveryDraft(draft, 'recovered'));
        writeEditorTelemetry.log('recovery', 'draft_restored_from_banner', {
            reason: draft.reason,
            serverRevision: draft.serverRevision,
        });
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

    const handleProfilerRender = useCallback((
        id: string,
        _phase: 'mount' | 'update' | 'nested-update',
        actualDuration: number
    ) => {
        writeEditorTelemetry.recordRender(id, ['react_profiler'], actualDuration);
    }, []);

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
        <React.Profiler id="EditorScreen.Commit" onRender={handleProfilerRender}>
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
                            className="hidden lg:inline-flex text-xs px-3 py-1"
                        >
                            {isFocusMode ? (lang === 'en' ? 'Exit Focus' : 'إنهاء التركيز') : (lang === 'en' ? 'Focus' : 'تركيز')}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => setIsMobileOutlineOpen(true)}
                            className="lg:hidden"
                            aria-label={lang === 'en' ? 'Open outline' : 'فتح المخطط'}
                        >
                            <ViewListIcon className="h-5 w-5" />
                        </Button>
                        <Button variant="ghost" onClick={openMentor}>
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
                <React.Profiler id="FormattingToolbar.Commit" onRender={handleProfilerRender}>
                    <FormattingToolbar
                        editor={editor}
                        onToggleVoice={toggleVoice}
                        isRecording={dictationPhase !== 'idle'}
                        isVisible={!isFocusMode || dictationPhase !== 'idle'}
                        innerClassName={manuscriptLaneClassName}
                        alignToEditorColumn={!isFocusMode}
                        dictationStatusLabel={getDictationStatusLabel(dictationPhase, lang)}
                        dictationElapsedMs={dictationElapsedMs}
                        dictationLanguageLabel={getDictationLanguageLabel(dictationSessionLanguage, lang)}
                    />
                </React.Profiler>

                {isMobileOutlineOpen ? (
                    <div className="fixed inset-0 z-40 lg:hidden">
                        <button
                            type="button"
                            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
                            onClick={() => setIsMobileOutlineOpen(false)}
                            aria-label={lang === 'en' ? 'Close outline' : 'إغلاق المخطط'}
                        />
                        <div className="absolute inset-x-0 bottom-0 rounded-t-[28px] border border-white/10 bg-slate-950/96 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-2xl">
                            <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-white/15" aria-hidden="true" />
                            <div className="mb-4 flex items-center justify-between">
                                <BilingualText role="H1" className="!text-lg !font-semibold">
                                    {lang === 'en' ? 'Outline' : 'المخطط'}
                                </BilingualText>
                                <Button
                                    variant="ghost"
                                    onClick={() => setIsMobileOutlineOpen(false)}
                                    className="!h-10 !w-10 !rounded-full !p-0"
                                >
                                    <XIcon className="h-4 w-4" />
                                </Button>
                            </div>
                            <OutlinePanel
                                variant="sheet"
                                items={outlineItems}
                                onSelectItem={handleOutlineSelect}
                                titleLabel={lang === 'en' ? 'Outline' : 'المخطط'}
                                emptyLabel={lang === 'en' ? 'Add headings to build your outline.' : 'أضف عناوين لبناء المخطط.'}
                            />
                        </div>
                    </div>
                ) : null}

                <div ref={editorScrollRef} className="flex-grow min-h-0 overflow-y-auto overscroll-y-contain">
                    <LiteraryShell className="relative min-h-full py-4">
                        <CollaborativeCursorLayer cursors={collaborationRuntime.cursorOverlays} />
                        <div className={cn('h-full', !isFocusMode && 'lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-6')}>
                            {!isFocusMode && (
                                <OutlinePanel
                                    items={outlineItems}
                                    onSelectItem={handleOutlineSelect}
                                    titleLabel={lang === 'en' ? 'Outline' : 'المخطط'}
                                    emptyLabel={lang === 'en' ? 'Add headings to build your outline.' : 'أضف عناوين لبناء المخطط.'}
                                />
                            )}

                            <div className="min-h-0">
                                <React.Profiler id="TiptapEditor.Commit" onRender={handleProfilerRender}>
                                    <TiptapEditor
                                        content={present.content}
                                        contentDoc={present.contentDoc}
                                        onChange={handleEditorChange}
                                        onEditorReady={setEditor}
                                        isFocusMode={isFocusMode}
                                        langHint={lang === 'ar' ? 'ar' : 'en'}
                                    />
                                </React.Profiler>
                            </div>
                        </div>
                        <div className="h-40 md:h-56" aria-hidden="true" />
                    </LiteraryShell>
                </div>
            </div>

            <React.Profiler id="MentorModal.Commit" onRender={handleProfilerRender}>
                <Modal isOpen={isMentorOpen} onClose={closeMentor}>
                    <div className="flex flex-col items-center text-center p-2">
                        <div className="p-4 rounded-full bg-sky-100 dark:bg-sky-900/30 mb-4">
                            {mentor?.icon && <mentor.icon className="h-12 w-12 text-sky-500" />}
                        </div>
                        <BilingualText role="H1" className="!text-2xl mb-2">{mentor?.name}</BilingualText>
                        <BilingualText className="text-slate-600 dark:text-slate-300 mb-6">
                            {lang === 'en' ? mentor?.descriptionEn : mentor?.descriptionAr}
                        </BilingualText>
                        <Button onClick={startMentorChat} className="w-full">
                            {lang === 'en' ? 'Chat with Mentor' : 'تحدث مع المرشد'}
                        </Button>
                    </div>
                </Modal>
            </React.Profiler>
            {DevWritePerformanceOverlay ? (
                <React.Suspense fallback={null}>
                    <DevWritePerformanceOverlay />
                </React.Suspense>
            ) : null}
        </div>
        </React.Profiler>
    );
};

export default EditorScreen;
