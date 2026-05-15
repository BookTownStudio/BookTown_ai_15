import { useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
    type WriteDraftReason,
    type WriteDraftRecord,
    writeLocalDrafts,
} from './writeLocalDrafts.ts';
import {
    type EditorSnapshot,
    type RecoveryBanner,
    type SaveIssue,
    toDraftRecord,
} from './editorRuntimeTypes.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

interface UseEditorRecoveryControllerParams {
    uid?: string;
    scopeId: string;
    projectId?: string;
    currentRevisionRef: MutableRefObject<number | null>;
    presentRef: MutableRefObject<EditorSnapshot>;
    hasLocalEditsRef: MutableRefObject<boolean>;
    setSnapshot: (snapshot: EditorSnapshot) => void;
    setRecoveryBanner: Dispatch<SetStateAction<RecoveryBanner>>;
}

function saveIssueFromDraftReason(reason: WriteDraftReason): SaveIssue {
    if (reason === 'offline') return 'offline';
    if (reason === 'conflict') return 'conflict';
    if (reason === 'error') return 'error';
    return 'none';
}

export function useEditorRecoveryController({
    uid,
    scopeId,
    projectId,
    currentRevisionRef,
    presentRef,
    hasLocalEditsRef,
    setSnapshot,
    setRecoveryBanner,
}: UseEditorRecoveryControllerParams) {
    const latestAvailableDraftRef = useRef<WriteDraftRecord | null>(null);

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
    }, [currentRevisionRef, projectId, scopeId, uid]);

    const clearLocalDraft = useCallback(() => {
        if (!uid) {
            return;
        }
        writeLocalDrafts.clear(uid, scopeId);
    }, [scopeId, uid]);

    const loadLocalDraft = useCallback(() => {
        return uid ? writeLocalDrafts.load(uid, scopeId) : null;
    }, [scopeId, uid]);

    const hydrateFromRecoveryDraft = useCallback((draft: WriteDraftRecord, mode: NonNullable<RecoveryBanner>['mode']): SaveIssue => {
        writeEditorTelemetry.log('recovery', 'draft_hydrated', {
            mode,
            reason: draft.reason,
            serverRevision: draft.serverRevision,
            savedAt: draft.savedAt,
        });
        latestAvailableDraftRef.current = draft;
        setSnapshot(draft.snapshot);
        presentRef.current = draft.snapshot;
        hasLocalEditsRef.current = true;
        setRecoveryBanner({ mode, draft });
        return saveIssueFromDraftReason(draft.reason);
    }, [hasLocalEditsRef, presentRef, setRecoveryBanner, setSnapshot]);

    const resetRecoveryController = useCallback(() => {
        latestAvailableDraftRef.current = null;
        setRecoveryBanner(null);
    }, [setRecoveryBanner]);

    return {
        latestAvailableDraftRef,
        persistLocalDraft,
        clearLocalDraft,
        loadLocalDraft,
        hydrateFromRecoveryDraft,
        resetRecoveryController,
    };
}
