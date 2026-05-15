import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { type Editor } from '@tiptap/react';
import { useDebounce } from 'use-debounce';
import { useQueryClient } from '../react-query.ts';
import { queryKeys } from '../queryKeys.ts';
import { WriteRepository } from '../../services/writeRepository.ts';
import { type Project } from '../../types/entities.ts';
import {
    type AuthorityStatus,
    type EditorSnapshot,
    type SaveIndicator,
    type SaveIssue,
    getPerfNow,
    isOfflineWriteError,
    isRevisionMismatchError,
    serializeDoc,
    snapshotFromProject,
    snapshotsEqual,
} from './editorRuntimeTypes.ts';
import {
    captureCursorMemory,
    cursorMemoryChanged,
    type CursorMemoryPayload,
} from './cursorMemory.ts';
import { type WriteDraftReason } from './writeLocalDrafts.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';
import { writeOperationalSyncEngine } from './writeOperationalSyncEngine.ts';
import {
    type WriteChunkSnapshotOperation,
    type WriteProjectOperationAckInput,
    type WriteProjectOperationAckResult,
    toWriteProjectOperationAckInput,
} from './writeOperationalTypes.ts';

type AutosaveProject = (variables: {
    projectId: string;
    expectedRevision?: number;
    updates: Partial<Project>;
    operation?: WriteProjectOperationAckInput;
}) => Promise<{
    projectId: string;
    revision: number;
    updatedAt: string;
    operationAck?: WriteProjectOperationAckResult;
}>;

interface UseEditorPersistenceControllerParams {
    uid?: string;
    projectId?: string;
    lang: string;
    isOffline: boolean;
    authorityStatus: AuthorityStatus;
    editor: Editor | null;
    present: EditorSnapshot;
    autosaveAsync: AutosaveProject;
    saveManuscriptSnapshot?: (
        snapshot: EditorSnapshot,
        revision: number,
        operation?: WriteProjectOperationAckInput
    ) => Promise<Partial<Project> | null>;
    loadManuscriptSnapshot?: (project: Project) => Promise<{ snapshot: EditorSnapshot; source: 'chunked' | 'legacy' }>;
    persistLocalDraft: (snapshot: EditorSnapshot, reason: WriteDraftReason) => void;
    clearLocalDraft: () => void;
    onLocalOperationCommitted?: (operation: WriteChunkSnapshotOperation) => void | Promise<void>;
    showToast: (message: string) => void;
    hasHydratedRef: MutableRefObject<boolean>;
    hasLocalEditsRef: MutableRefObject<boolean>;
    presentRef: MutableRefObject<EditorSnapshot>;
    lastConfirmedSnapshotRef: MutableRefObject<EditorSnapshot>;
    currentRevisionRef: MutableRefObject<number | null>;
    lastPersistedCursorRef: MutableRefObject<CursorMemoryPayload | null>;
    lastLocalEditAtRef: MutableRefObject<number | null>;
}

export function getSaveIndicator(params: {
    authorityStatus: AuthorityStatus;
    isSaving: boolean;
    saveIssue: SaveIssue;
    isOffline: boolean;
    hasDirtyChanges: boolean;
    hasLocalEdits: boolean;
}): SaveIndicator {
    if (params.authorityStatus === 'error') {
        return 'error';
    }
    if (params.authorityStatus === 'materializing' || params.isSaving) {
        return 'saving';
    }
    if (params.saveIssue === 'conflict') {
        return 'conflict';
    }
    if (params.saveIssue === 'error') {
        return 'error';
    }
    if (params.authorityStatus === 'ephemeral') {
        return params.hasLocalEdits ? 'local-only' : 'saved';
    }
    if ((params.saveIssue === 'offline' || params.isOffline) && params.hasDirtyChanges) {
        return 'offline';
    }
    if (params.hasDirtyChanges) {
        return 'unsaved';
    }
    return 'saved';
}

export function useEditorPersistenceController({
    uid,
    projectId,
    lang,
    isOffline,
    authorityStatus,
    editor,
    present,
    autosaveAsync,
    saveManuscriptSnapshot,
    loadManuscriptSnapshot,
    persistLocalDraft,
    clearLocalDraft,
    onLocalOperationCommitted,
    showToast,
    hasHydratedRef,
    hasLocalEditsRef,
    presentRef,
    lastConfirmedSnapshotRef,
    currentRevisionRef,
    lastPersistedCursorRef,
    lastLocalEditAtRef,
}: UseEditorPersistenceControllerParams) {
    const queryClient = useQueryClient();
    const [isSaving, setIsSaving] = useState(false);
    const [saveIssue, setSaveIssue] = useState<SaveIssue>('none');
    const activeSavePromiseRef = useRef<Promise<boolean> | null>(null);
    const activeCursorSavePromiseRef = useRef<Promise<boolean> | null>(null);
    const activeReplayPromiseRef = useRef<Promise<void> | null>(null);
    const queuedSnapshotRef = useRef<{ snapshot: EditorSnapshot; expectedRevision?: number } | null>(null);

    const [debouncedContent] = useDebounce(present.content, 2000);
    const [debouncedTitleEn] = useDebounce(present.titleEn, 2000);
    const [debouncedTitleAr] = useDebounce(present.titleAr, 2000);
    const [debouncedDocSignature] = useDebounce(serializeDoc(present.contentDoc), 2000);

    const hasDirtyChanges = useMemo(
        () => snapshotsEqual(present, lastConfirmedSnapshotRef.current) === false,
        [lastConfirmedSnapshotRef, present]
    );

    const indicator = getSaveIndicator({
        authorityStatus,
        isSaving,
        saveIssue,
        isOffline,
        hasDirtyChanges,
        hasLocalEdits: hasLocalEditsRef.current,
    });

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

    const enqueueOfflineSnapshotOperation = useCallback(async (
        snapshot: EditorSnapshot,
        expectedRevision?: number
    ) => {
        if (!uid || !projectId || projectId === 'new' || !saveManuscriptSnapshot) {
            return null;
        }

        try {
            const operation = await writeOperationalSyncEngine.enqueueChunkSnapshotOperation({
                uid,
                projectId,
                expectedRevision,
                snapshot,
            });
            writeEditorTelemetry.log('sync', 'offline_snapshot_queued', {
                projectId,
                operationId: operation.operationId,
                affectedChunkCount: operation.affectedChunkIds?.length ?? 0,
                mountedSectionCount: operation.mountedSectionIds?.length ?? 0,
            }, 'debug');
            return operation;
        } catch (error) {
            writeEditorTelemetry.log('sync', 'offline_snapshot_queue_failed', {
                projectId,
                error: error instanceof Error ? error.message : String(error),
            }, 'warn');
            return null;
        }
    }, [projectId, saveManuscriptSnapshot, uid]);

    const persistCursorMemory = useCallback(async (): Promise<boolean> => {
        if (!editor || !uid || !projectId || projectId === 'new' || authorityStatus !== 'persistent' || isOffline) {
            return false;
        }

        if (activeSavePromiseRef.current) {
            await activeSavePromiseRef.current;
        }

        if (activeCursorSavePromiseRef.current) {
            await activeCursorSavePromiseRef.current;
        }

        const run = async (): Promise<boolean> => {
            const cursorMemory = captureCursorMemory(editor);
            if (!cursorMemory || !cursorMemoryChanged(cursorMemory, lastPersistedCursorRef.current)) {
                return false;
            }

            try {
                const networkStartedAt = getPerfNow();
                const result = await autosaveAsync({
                    projectId,
                    expectedRevision: currentRevisionRef.current ?? 1,
                    updates: cursorMemory,
                });

                currentRevisionRef.current = result.revision;
                lastPersistedCursorRef.current = cursorMemory;
                writeEditorTelemetry.timing('autosave.cursorNetwork', getPerfNow() - networkStartedAt);
                return true;
            } catch (error) {
                console.error('[WRITE][CURSOR_SAVE_FAILED]', {
                    projectId,
                    error,
                });
                return false;
            }
        };

        activeCursorSavePromiseRef.current = run();
        const success = await activeCursorSavePromiseRef.current;
        activeCursorSavePromiseRef.current = null;
        return success;
    }, [authorityStatus, autosaveAsync, currentRevisionRef, editor, isOffline, lastPersistedCursorRef, projectId, uid]);

    const persistSnapshot = useCallback(async (
        snapshot: EditorSnapshot,
        options?: { expectedRevision?: number; draftReason?: WriteDraftReason }
    ): Promise<boolean> => {
        if (!uid || !projectId || projectId === 'new' || authorityStatus !== 'persistent') {
            return false;
        }

        if (isOffline) {
            persistLocalDraft(snapshot, options?.draftReason || 'offline');
            await enqueueOfflineSnapshotOperation(
                snapshot,
                options?.expectedRevision ?? currentRevisionRef.current ?? 1
            );
            setSaveIssue('offline');
            return false;
        }

        if (activeCursorSavePromiseRef.current) {
            await activeCursorSavePromiseRef.current;
        }

        if (activeSavePromiseRef.current) {
            writeEditorTelemetry.log('autosave', 'snapshot_coalesced', {
                hasExpectedRevision: typeof options?.expectedRevision === 'number',
            }, 'debug');
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
            const operationStartedAt = getPerfNow();

            try {
                const cursorMemory = editor ? captureCursorMemory(editor) : null;
                const operationExpectedRevision = options?.expectedRevision ?? currentRevisionRef.current ?? 1;
                const networkStartedAt = getPerfNow();
                const result = await autosaveAsync({
                    projectId,
                    expectedRevision: operationExpectedRevision,
                    updates: saveManuscriptSnapshot
                        ? {
                            titleEn: snapshot.titleEn,
                            titleAr: snapshot.titleAr,
                            ...(snapshot.isPartialManuscript ? {} : { wordCount: snapshot.wordCount }),
                            ...(cursorMemory ?? {}),
                        }
                        : {
                            ...snapshot,
                            ...(cursorMemory ?? {}),
                        },
                });
                const committedOperation = saveManuscriptSnapshot
                    ? await writeOperationalSyncEngine.createCommittedChunkSnapshotOperation({
                        uid,
                        projectId,
                        expectedRevision: operationExpectedRevision,
                        snapshot,
                    })
                    : null;
                const manuscriptMetadata = saveManuscriptSnapshot
                    ? await saveManuscriptSnapshot(
                        snapshot,
                        result.revision,
                        committedOperation ? toWriteProjectOperationAckInput(committedOperation) : undefined
                    )
                    : null;
                const finalResult = manuscriptMetadata
                    ? await autosaveAsync({
                        projectId,
                        expectedRevision: result.revision,
                        updates: manuscriptMetadata,
                        operation: committedOperation
                            ? toWriteProjectOperationAckInput(committedOperation)
                            : undefined,
                    })
                    : result;
                const networkMs = getPerfNow() - networkStartedAt;

                currentRevisionRef.current = finalResult.revision;
                lastConfirmedSnapshotRef.current = snapshot;
                if (onLocalOperationCommitted && committedOperation) {
                    await onLocalOperationCommitted({
                        ...committedOperation,
                        status: 'applied',
                        updatedAt: Date.now(),
                        appliedAt: Date.now(),
                        serverRevision: finalResult.revision,
                        convergenceCheckpointId: finalResult.operationAck?.checkpointId,
                    });
                }
                if (cursorMemory) {
                    lastPersistedCursorRef.current = cursorMemory;
                }
                hasLocalEditsRef.current = false;
                setSaveIssue('none');
                clearLocalDraft();
                writeEditorTelemetry.autosaveSuccess(networkMs, getPerfNow() - operationStartedAt);
                return true;
            } catch (error) {
                if (isRevisionMismatchError(error)) {
                    setSaveIssue('conflict');
                    persistLocalDraft(snapshot, options?.draftReason || 'conflict');
                    writeEditorTelemetry.autosaveFailure('conflict', getPerfNow() - operationStartedAt);
                    return false;
                }

                if (isOfflineWriteError(error)) {
                    setSaveIssue('offline');
                    persistLocalDraft(snapshot, options?.draftReason || 'offline');
                    await enqueueOfflineSnapshotOperation(
                        snapshot,
                        options?.expectedRevision ?? currentRevisionRef.current ?? 1
                    );
                    writeEditorTelemetry.autosaveFailure('offline', getPerfNow() - operationStartedAt);
                    return false;
                }

                console.error('[WRITE][AUTOSAVE_FAILED]', error);
                setSaveIssue('error');
                persistLocalDraft(snapshot, options?.draftReason || 'error');
                writeEditorTelemetry.autosaveFailure(
                    error instanceof Error ? error.message : 'error',
                    getPerfNow() - operationStartedAt
                );
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
    }, [
        authorityStatus,
        autosaveAsync,
        clearLocalDraft,
        currentRevisionRef,
        editor,
        enqueueOfflineSnapshotOperation,
        hasLocalEditsRef,
        isOffline,
        lastConfirmedSnapshotRef,
        lastPersistedCursorRef,
        onLocalOperationCommitted,
        persistLocalDraft,
        projectId,
        saveManuscriptSnapshot,
        uid,
    ]);

    const replayOfflineOperations = useCallback(async () => {
        if (
            !uid ||
            !projectId ||
            projectId === 'new' ||
            !saveManuscriptSnapshot ||
            isOffline ||
            authorityStatus !== 'persistent'
        ) {
            return;
        }

        if (activeReplayPromiseRef.current) {
            await activeReplayPromiseRef.current;
            return;
        }

        const applyOperation = async (
            operation: WriteChunkSnapshotOperation
        ): Promise<{ revision: number; updatedAt?: string }> => {
            const cursorMemory = editor ? captureCursorMemory(editor) : null;
            const baseResult = await autosaveAsync({
                projectId,
                expectedRevision: currentRevisionRef.current ?? operation.expectedRevision ?? 1,
                updates: {
                    titleEn: operation.snapshot.titleEn,
                    titleAr: operation.snapshot.titleAr,
                    ...(operation.snapshot.isPartialManuscript ? {} : { wordCount: operation.snapshot.wordCount }),
                    ...(cursorMemory ?? {}),
                },
            });
            const manuscriptMetadata = await saveManuscriptSnapshot(
                operation.snapshot,
                baseResult.revision,
                toWriteProjectOperationAckInput(operation)
            );
            const finalResult = manuscriptMetadata
                ? await autosaveAsync({
                    projectId,
                    expectedRevision: baseResult.revision,
                    updates: manuscriptMetadata,
                    operation: toWriteProjectOperationAckInput(operation),
                })
                : baseResult;

            currentRevisionRef.current = finalResult.revision;
            lastConfirmedSnapshotRef.current = operation.snapshot;
            if (onLocalOperationCommitted) {
                await onLocalOperationCommitted({
                    ...operation,
                    status: 'applied',
                    updatedAt: Date.now(),
                    appliedAt: Date.now(),
                    serverRevision: finalResult.revision,
                    convergenceCheckpointId: finalResult.operationAck?.checkpointId,
                });
            }
            if (cursorMemory) {
                lastPersistedCursorRef.current = cursorMemory;
            }
            return finalResult;
        };

        activeReplayPromiseRef.current = writeOperationalSyncEngine.replayPendingOperations({
            uid,
            projectId,
            applyOperation,
        }).then((result) => {
            if (result.appliedCount > 0 && result.failedCount === 0) {
                hasLocalEditsRef.current = false;
                setSaveIssue('none');
                clearLocalDraft();
                writeEditorTelemetry.log('sync', 'offline_replay_applied', {
                    projectId,
                    appliedCount: result.appliedCount,
                    latestRevision: result.latestRevision,
                }, 'debug');
            }
        }).finally(() => {
            activeReplayPromiseRef.current = null;
        });

        await activeReplayPromiseRef.current;
    }, [
        authorityStatus,
        autosaveAsync,
        clearLocalDraft,
        currentRevisionRef,
        editor,
        hasLocalEditsRef,
        isOffline,
        lastConfirmedSnapshotRef,
        lastPersistedCursorRef,
        onLocalOperationCommitted,
        projectId,
        saveManuscriptSnapshot,
        uid,
    ]);

    const reconcileConflict = useCallback(async () => {
        if (!uid || !projectId || projectId === 'new') {
            return;
        }

        setIsSaving(true);
        try {
            const latestProject = await WriteRepository.getProject(uid, projectId);
            updateProjectCaches(latestProject);

            const latestSnapshot = loadManuscriptSnapshot
                ? (await loadManuscriptSnapshot(latestProject)).snapshot
                : snapshotFromProject(latestProject);
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
    }, [
        clearLocalDraft,
        currentRevisionRef,
        lang,
        lastConfirmedSnapshotRef,
        persistLocalDraft,
        persistSnapshot,
        presentRef,
        projectId,
        loadManuscriptSnapshot,
        showToast,
        uid,
        updateProjectCaches,
    ]);

    const flushBeforeExit = useCallback(async (): Promise<boolean> => {
        const dirtyAtFlush = snapshotsEqual(presentRef.current, lastConfirmedSnapshotRef.current) === false;
        const finishFlush = writeEditorTelemetry.startTimer('autosave.flushBeforeExit', {
            authorityStatus,
            hasDirtyChanges: dirtyAtFlush,
            saveIssue,
            isOffline,
        });

        if (!hasHydratedRef.current) {
            finishFlush();
            return true;
        }

        const snapshot = presentRef.current;

        if (authorityStatus === 'ephemeral' && hasLocalEditsRef.current) {
            persistLocalDraft(snapshot, 'exit');
            showToast(lang === 'en' ? 'Draft saved locally.' : 'تم حفظ المسودة محلياً.');
            finishFlush();
            return true;
        }

        if (authorityStatus !== 'persistent' || !projectId || projectId === 'new' || !dirtyAtFlush) {
            if (authorityStatus === 'persistent') {
                await persistCursorMemory();
            }
            finishFlush();
            return true;
        }

        if (saveIssue === 'conflict') {
            persistLocalDraft(snapshot, 'conflict');
            showToast(lang === 'en' ? 'Conflict kept locally. Reopen to reconcile.' : 'تم الاحتفاظ بالتعارض محلياً. أعد الفتح للمصالحة.');
            finishFlush();
            return true;
        }

        if (isOffline) {
            persistLocalDraft(snapshot, 'offline');
            await enqueueOfflineSnapshotOperation(snapshot, currentRevisionRef.current ?? 1);
            showToast(lang === 'en' ? 'Draft saved locally while offline.' : 'تم حفظ المسودة محلياً أثناء عدم الاتصال.');
            finishFlush();
            return true;
        }

        const flushed = await persistSnapshot(snapshot, { draftReason: 'exit' });
        if (!flushed) {
            showToast(lang === 'en' ? 'Could not confirm server save. Staying in editor.' : 'تعذر تأكيد الحفظ على الخادم. ستبقى في المحرر.');
            finishFlush();
            return false;
        }

        await persistCursorMemory();

        finishFlush();
        return true;
    }, [
        authorityStatus,
        hasHydratedRef,
        hasLocalEditsRef,
        isOffline,
        lang,
        lastConfirmedSnapshotRef,
        enqueueOfflineSnapshotOperation,
        currentRevisionRef,
        persistCursorMemory,
        persistLocalDraft,
        persistSnapshot,
        presentRef,
        projectId,
        saveIssue,
        showToast,
    ]);

    useEffect(() => {
        if (
            isOffline ||
            !hasHydratedRef.current ||
            authorityStatus !== 'persistent' ||
            !uid ||
            !projectId ||
            projectId === 'new'
        ) {
            return;
        }

        void replayOfflineOperations();
    }, [
        authorityStatus,
        hasHydratedRef,
        isOffline,
        projectId,
        replayOfflineOperations,
        uid,
    ]);

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

        writeEditorTelemetry.autosaveQueued(
            lastLocalEditAtRef.current ? getPerfNow() - lastLocalEditAtRef.current : undefined
        );
        void persistSnapshot(pendingSnapshot, { draftReason: 'unsaved' });
    }, [
        authorityStatus,
        debouncedContent,
        debouncedDocSignature,
        debouncedTitleAr,
        debouncedTitleEn,
        hasHydratedRef,
        isOffline,
        lastConfirmedSnapshotRef,
        lastLocalEditAtRef,
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

        writeEditorTelemetry.timing(
            'autosave.localDraftDebounce',
            lastLocalEditAtRef.current ? getPerfNow() - lastLocalEditAtRef.current : 0,
            { reason: draftReason }
        );
        const timer = window.setTimeout(() => {
            persistLocalDraft(presentRef.current, draftReason);
        }, 600);

        return () => window.clearTimeout(timer);
    }, [
        authorityStatus,
        clearLocalDraft,
        hasDirtyChanges,
        hasHydratedRef,
        hasLocalEditsRef,
        isSaving,
        lastLocalEditAtRef,
        persistLocalDraft,
        present,
        presentRef,
        saveIssue,
        uid,
    ]);

    useEffect(() => {
        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            if (!hasHydratedRef.current) {
                return;
            }

            const snapshot = presentRef.current;
            const dirtyAtUnload = snapshotsEqual(snapshot, lastConfirmedSnapshotRef.current) === false;
            const shouldGuard =
                (authorityStatus === 'ephemeral' && hasLocalEditsRef.current) ||
                (authorityStatus === 'persistent' && dirtyAtUnload);

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

            const dirtyAtHide = snapshotsEqual(presentRef.current, lastConfirmedSnapshotRef.current) === false;
            const shouldPersist =
                (authorityStatus === 'ephemeral' && hasLocalEditsRef.current) ||
                (authorityStatus === 'persistent' && dirtyAtHide);

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
    }, [
        authorityStatus,
        hasHydratedRef,
        hasLocalEditsRef,
        isOffline,
        lastConfirmedSnapshotRef,
        persistLocalDraft,
        presentRef,
        saveIssue,
        uid,
    ]);

    const resetPersistenceController = useCallback(() => {
        activeSavePromiseRef.current = null;
        activeCursorSavePromiseRef.current = null;
        activeReplayPromiseRef.current = null;
        queuedSnapshotRef.current = null;
        setIsSaving(false);
        setSaveIssue('none');
    }, []);

    return {
        isSaving,
        saveIssue,
        setSaveIssue,
        hasDirtyChanges,
        indicator,
        persistSnapshot,
        persistCursorMemory,
        reconcileConflict,
        flushBeforeExit,
        resetPersistenceController,
    };
}
