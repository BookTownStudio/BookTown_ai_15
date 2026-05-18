import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { type Editor } from '@tiptap/react';
import { useDebounce } from 'use-debounce';
import { useQueryClient } from '../react-query.ts';
import { queryKeys } from '../queryKeys.ts';
import { WriteRepository } from '../../services/writeRepository.ts';
import { type ManuscriptStorageMetadata, type Project } from '../../types/entities.ts';
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
import { normalizeEditorSnapshotForTransport } from './writeTransportSerialization.ts';

type AutosaveProject = (variables: {
    projectId: string;
    expectedRevision?: number;
    updates: Partial<Project>;
    operation?: WriteProjectOperationAckInput;
    manuscriptStorageMode?: ManuscriptStorageMetadata['mode'];
}) => Promise<{
    projectId: string;
    revision: number;
    updatedAt: string;
    operationAck?: WriteProjectOperationAckResult;
}>;

function withoutUndefinedProjectFields(patch: Partial<Project>): Partial<Project> {
    return Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
    ) as Partial<Project>;
}

function logBlockedAutosave(
    tag: '[WRITE][AUTOSAVE_BLOCKED_NOT_READY]' |
        '[WRITE][AUTOSAVE_SKIPPED_EDITOR_REFRESH]' |
        '[WRITE][AUTOSAVE_SKIPPED_RECONCILE]' |
        '[WRITE][MIGRATION_IN_PROGRESS]',
    projectId: string | undefined,
    reason: string,
    detail: Record<string, unknown> = {}
): void {
    console.warn(tag, {
        projectId,
        reason,
        ...detail,
    });
    writeEditorTelemetry.log('autosave', tag.replace('[WRITE][', '').replace(']', '').toLowerCase(), {
        projectId,
        reason,
        ...detail,
    }, 'warn');
}

function getAutosaveReadinessFailure(params: {
    hasHydrated: boolean;
    hasEditor: boolean;
    hasChunkRuntime: boolean;
    snapshot: EditorSnapshot;
}): { tag: '[WRITE][AUTOSAVE_BLOCKED_NOT_READY]' | '[WRITE][AUTOSAVE_SKIPPED_EDITOR_REFRESH]' | '[WRITE][AUTOSAVE_SKIPPED_RECONCILE]'; reason: string; detail?: Record<string, unknown> } | null {
    if (!params.hasHydrated) {
        return {
            tag: '[WRITE][AUTOSAVE_BLOCKED_NOT_READY]',
            reason: 'project_not_hydrated',
        };
    }

    if (!params.hasEditor) {
        return {
            tag: '[WRITE][AUTOSAVE_SKIPPED_EDITOR_REFRESH]',
            reason: 'editor_not_ready',
        };
    }

    if (!params.snapshot.contentDoc) {
        return {
            tag: '[WRITE][AUTOSAVE_SKIPPED_EDITOR_REFRESH]',
            reason: 'content_doc_not_ready',
        };
    }

    if (params.snapshot.isPartialManuscript) {
        if (!params.hasChunkRuntime) {
            return {
                tag: '[WRITE][AUTOSAVE_BLOCKED_NOT_READY]',
                reason: 'chunk_runtime_not_ready',
            };
        }
        if (!Array.isArray(params.snapshot.mountedSectionIds) || params.snapshot.mountedSectionIds.length === 0) {
            return {
                tag: '[WRITE][AUTOSAVE_BLOCKED_NOT_READY]',
                reason: 'mounted_sections_not_ready',
            };
        }
        if (!Array.isArray(params.snapshot.affectedChunkIds)) {
            return {
                tag: '[WRITE][AUTOSAVE_SKIPPED_RECONCILE]',
                reason: 'affected_chunks_not_ready',
            };
        }
        if (
            typeof params.snapshot.totalSectionCount !== 'number' ||
            !Number.isInteger(params.snapshot.totalSectionCount) ||
            typeof params.snapshot.totalChunkCount !== 'number' ||
            !Number.isInteger(params.snapshot.totalChunkCount)
        ) {
            return {
                tag: '[WRITE][AUTOSAVE_BLOCKED_NOT_READY]',
                reason: 'partial_runtime_counts_not_ready',
                detail: {
                    totalSectionCount: params.snapshot.totalSectionCount,
                    totalChunkCount: params.snapshot.totalChunkCount,
                },
            };
        }
    }

    return null;
}

interface UseEditorPersistenceControllerParams {
    uid?: string;
    projectId?: string;
    lang: string;
    isOffline: boolean;
    authorityStatus: AuthorityStatus;
    editor: Editor | null;
    present: EditorSnapshot;
    autosaveAsync: AutosaveProject;
    manuscriptStorageMode?: ManuscriptStorageMetadata['mode'];
    saveManuscriptSnapshot?: (
        snapshot: EditorSnapshot,
        revision: number,
        operation?: WriteProjectOperationAckInput
    ) => Promise<Partial<Project> | null>;
    loadManuscriptSnapshot?: (project: Project) => Promise<{ snapshot: EditorSnapshot; source: 'chunked' | 'legacy' | 'new' }>;
    isManuscriptMigrationInProgress?: () => boolean;
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
    manuscriptStorageMode,
    saveManuscriptSnapshot,
    loadManuscriptSnapshot,
    isManuscriptMigrationInProgress,
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
    const [confirmedSnapshotVersion, setConfirmedSnapshotVersion] = useState(0);
    const activeSavePromiseRef = useRef<Promise<boolean> | null>(null);
    const activeCursorSavePromiseRef = useRef<Promise<boolean> | null>(null);
    const activeReplayPromiseRef = useRef<Promise<void> | null>(null);
    const queuedSnapshotRef = useRef<{ snapshot: EditorSnapshot; expectedRevision?: number } | null>(null);
    const isChunkNativeManuscript = manuscriptStorageMode === 'chunked' || manuscriptStorageMode === 'hybrid';

    const [debouncedContent] = useDebounce(present.content, 2000);
    const [debouncedTitleEn] = useDebounce(present.titleEn, 2000);
    const [debouncedTitleAr] = useDebounce(present.titleAr, 2000);
    const [debouncedDocSignature] = useDebounce(serializeDoc(present.contentDoc), 2000);

    const hasDirtyChanges = useMemo(
        () => snapshotsEqual(present, lastConfirmedSnapshotRef.current) === false,
        [confirmedSnapshotVersion, lastConfirmedSnapshotRef, present]
    );

    const confirmSnapshot = useCallback((snapshotToConfirm: EditorSnapshot) => {
        lastConfirmedSnapshotRef.current = snapshotToConfirm;
        setConfirmedSnapshotVersion((version) => version + 1);
    }, [lastConfirmedSnapshotRef]);

    const indicator = getSaveIndicator({
        authorityStatus,
        isSaving,
        saveIssue,
        isOffline,
        hasDirtyChanges,
        hasLocalEdits: hasLocalEditsRef.current,
    });

    const patchProjectCaches = useCallback((targetProjectId: string, patch: Partial<Project>) => {
        if (!uid) {
            return;
        }
        const cachePatch = withoutUndefinedProjectFields(patch);

        queryClient.setQueryData(
            queryKeys.user.project(uid, targetProjectId) as unknown as any[],
            (old: Project | undefined) => old ? { ...old, ...cachePatch } : old
        );
        queryClient.setQueryData<Project[]>(
            queryKeys.user.projects(uid) as unknown as any[],
            (old = []) => old.map(item => item.id === targetProjectId ? { ...item, ...cachePatch } : item)
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.user.project(uid, targetProjectId) as unknown as any[] });
        queryClient.invalidateQueries({ queryKey: queryKeys.user.projects(uid) as unknown as any[] });
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

        if (isChunkNativeManuscript) {
            writeEditorTelemetry.log('autosave', 'cursor_update_project_blocked', {
                projectId,
                manuscriptStorageMode,
            }, 'debug');
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
                    manuscriptStorageMode,
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
    }, [authorityStatus, autosaveAsync, currentRevisionRef, editor, isChunkNativeManuscript, isOffline, lastPersistedCursorRef, manuscriptStorageMode, projectId, uid]);

    const persistSnapshot = useCallback(async (
        snapshot: EditorSnapshot,
        options?: { expectedRevision?: number; draftReason?: WriteDraftReason }
    ): Promise<boolean> => {
        const liveSnapshot = snapshot;
        const transportSnapshot = normalizeEditorSnapshotForTransport(snapshot);
        if (!uid || !projectId || projectId === 'new' || authorityStatus !== 'persistent') {
            return false;
        }

        if (isManuscriptMigrationInProgress?.()) {
            logBlockedAutosave(
                '[WRITE][MIGRATION_IN_PROGRESS]',
                projectId,
                'legacy_migration_in_progress',
                {}
            );
            setSaveIssue('none');
            return false;
        }

        const readinessFailure = getAutosaveReadinessFailure({
            hasHydrated: hasHydratedRef.current,
            hasEditor: Boolean(editor),
            hasChunkRuntime: Boolean(saveManuscriptSnapshot),
            snapshot: transportSnapshot,
        });
        if (readinessFailure) {
            logBlockedAutosave(
                readinessFailure.tag,
                projectId,
                readinessFailure.reason,
                readinessFailure.detail ?? {}
            );
            return false;
        }

        if (isOffline) {
            persistLocalDraft(transportSnapshot, options?.draftReason || 'offline');
            await enqueueOfflineSnapshotOperation(
                transportSnapshot,
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
                snapshot: liveSnapshot,
                expectedRevision: options?.expectedRevision,
            };
            return activeSavePromiseRef.current.then(async () => {
                const queued = queuedSnapshotRef.current;
                if (!queued) {
                    return true;
                }
                queuedSnapshotRef.current = null;
                return persistSnapshot(queued.snapshot, {
                    expectedRevision: currentRevisionRef.current ?? queued.expectedRevision,
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
                if (saveManuscriptSnapshot) {
                    const committedOperation = await writeOperationalSyncEngine.createCommittedChunkSnapshotOperation({
                        uid,
                        projectId,
                        expectedRevision: operationExpectedRevision,
                        snapshot: transportSnapshot,
                    });
                    const manuscriptMetadata = await saveManuscriptSnapshot(
                        transportSnapshot,
                        operationExpectedRevision,
                        toWriteProjectOperationAckInput(committedOperation)
                    );
                    if (!manuscriptMetadata || typeof manuscriptMetadata.revision !== 'number') {
                        throw new Error('Chunk manuscript save did not return an authoritative revision.');
                    }
                    const networkMs = getPerfNow() - networkStartedAt;
                    currentRevisionRef.current = manuscriptMetadata.revision;
                    patchProjectCaches(projectId, {
                        title: manuscriptMetadata.title,
                        titleEn: manuscriptMetadata.titleEn,
                        titleAr: manuscriptMetadata.titleAr,
                        updatedAt: manuscriptMetadata.updatedAt,
                        revision: manuscriptMetadata.revision,
                        wordCount: manuscriptMetadata.wordCount,
                        activeSectionId: manuscriptMetadata.activeSectionId,
                        manuscriptStorage: manuscriptMetadata.manuscriptStorage,
                    });
                    confirmSnapshot(liveSnapshot);
                    if (onLocalOperationCommitted) {
                        await onLocalOperationCommitted({
                            ...committedOperation,
                            status: 'applied',
                            updatedAt: Date.now(),
                            appliedAt: Date.now(),
                            serverRevision: manuscriptMetadata.revision,
                        });
                    }
                    hasLocalEditsRef.current = false;
                    setSaveIssue('none');
                    clearLocalDraft();
                    writeEditorTelemetry.autosaveSuccess(networkMs, getPerfNow() - operationStartedAt);
                    return true;
                }
                const result = await autosaveAsync({
                    projectId,
                    expectedRevision: operationExpectedRevision,
                    updates: {
                        ...transportSnapshot,
                        ...(cursorMemory ?? {}),
                    },
                    manuscriptStorageMode,
                });
                currentRevisionRef.current = result.revision;
                if (cursorMemory) {
                    lastPersistedCursorRef.current = cursorMemory;
                }
                const networkMs = getPerfNow() - networkStartedAt;

                currentRevisionRef.current = result.revision;
                confirmSnapshot(liveSnapshot);
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
                    persistLocalDraft(transportSnapshot, options?.draftReason || 'conflict');
                    writeEditorTelemetry.autosaveFailure('conflict', getPerfNow() - operationStartedAt);
                    return false;
                }

                if (isOfflineWriteError(error)) {
                    setSaveIssue('offline');
                    persistLocalDraft(transportSnapshot, options?.draftReason || 'offline');
                    await enqueueOfflineSnapshotOperation(
                        transportSnapshot,
                        options?.expectedRevision ?? currentRevisionRef.current ?? 1
                    );
                    writeEditorTelemetry.autosaveFailure('offline', getPerfNow() - operationStartedAt);
                    return false;
                }

                console.error('[WRITE][AUTOSAVE_FAILED]', error);
                setSaveIssue('error');
                persistLocalDraft(transportSnapshot, options?.draftReason || 'error');
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
                expectedRevision: currentRevisionRef.current ?? queued.expectedRevision,
                draftReason: options?.draftReason,
            });
        }

        return success;
    }, [
        authorityStatus,
        autosaveAsync,
        clearLocalDraft,
        confirmSnapshot,
        currentRevisionRef,
        editor,
        enqueueOfflineSnapshotOperation,
        hasLocalEditsRef,
        hasHydratedRef,
        isChunkNativeManuscript,
        isOffline,
        lastPersistedCursorRef,
        isManuscriptMigrationInProgress,
        manuscriptStorageMode,
        onLocalOperationCommitted,
        patchProjectCaches,
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
            const operationSnapshot = normalizeEditorSnapshotForTransport(operation.snapshot);
            const cursorMemory = editor ? captureCursorMemory(editor) : null;
            const expectedRevision = currentRevisionRef.current ?? operation.expectedRevision ?? 1;
            const manuscriptMetadata = await saveManuscriptSnapshot(
                operationSnapshot,
                expectedRevision,
                toWriteProjectOperationAckInput(operation)
            );
            if (!manuscriptMetadata || typeof manuscriptMetadata.revision !== 'number') {
                throw new Error('Chunk manuscript replay did not return an authoritative revision.');
            }

            currentRevisionRef.current = manuscriptMetadata.revision;
            confirmSnapshot(operationSnapshot);
            if (onLocalOperationCommitted) {
                await onLocalOperationCommitted({
                    ...operation,
                    status: 'applied',
                    updatedAt: Date.now(),
                    appliedAt: Date.now(),
                    serverRevision: manuscriptMetadata.revision,
                });
            }
            if (cursorMemory) {
                lastPersistedCursorRef.current = cursorMemory;
            }
            return {
                revision: manuscriptMetadata.revision,
                updatedAt: typeof manuscriptMetadata.updatedAt === 'string' ? manuscriptMetadata.updatedAt : undefined,
            };
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
        confirmSnapshot,
        currentRevisionRef,
        editor,
        hasLocalEditsRef,
        isOffline,
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
            patchProjectCaches(projectId, latestProject);

            const latestSnapshot = loadManuscriptSnapshot
                ? (await loadManuscriptSnapshot(latestProject)).snapshot
                : snapshotFromProject(latestProject);
            currentRevisionRef.current = latestProject.revision ?? 1;
            confirmSnapshot(latestSnapshot);

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
        confirmSnapshot,
        currentRevisionRef,
        lang,
        persistLocalDraft,
        persistSnapshot,
        presentRef,
        projectId,
        loadManuscriptSnapshot,
        showToast,
        uid,
        patchProjectCaches,
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
