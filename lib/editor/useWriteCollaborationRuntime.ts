import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { type Editor } from '@tiptap/react';
import { type EditorSnapshot, getPerfNow } from './editorRuntimeTypes.ts';
import {
  captureCollaborativePresence,
  createCollaborativeCursorOverlays,
  ingestRemoteCollaborationOperations,
  shouldApplyRemoteSnapshot,
} from './writeCollaborationRuntime.ts';
import { writeCollaborationTransport } from './writeCollaborationTransport.ts';
import {
  type CollaborativeCursorOverlay,
  type CollaborationConnectionState,
  type WriteCollaboratorPresenceRecord,
} from './writeCollaborationTypes.ts';
import { type AuthorityStatus } from './editorRuntimeTypes.ts';
import { type WriteChunkSnapshotOperation } from './writeOperationalTypes.ts';
import { getWriteRuntimeDeviceId } from './writeRuntimeIdentity.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

const MAX_SEEN_REMOTE_OPERATION_IDS = 500;
const MAX_REMOTE_OPERATION_APPLY_BATCH = 24;

function boundSeenOperationIds(ids: Set<string>): void {
  if (ids.size <= MAX_SEEN_REMOTE_OPERATION_IDS) {
    return;
  }
  const overflow = ids.size - MAX_SEEN_REMOTE_OPERATION_IDS;
  Array.from(ids).slice(0, overflow).forEach((operationId) => ids.delete(operationId));
}

interface UseWriteCollaborationRuntimeParams {
  uid?: string;
  projectId?: string;
  authorityStatus: AuthorityStatus;
  isOffline: boolean;
  editor: Editor | null;
  scrollElement: HTMLElement | null;
  hasHydratedRef: MutableRefObject<boolean>;
  hasLocalEditsRef: MutableRefObject<boolean>;
  presentRef: MutableRefObject<EditorSnapshot>;
  lastConfirmedSnapshotRef: MutableRefObject<EditorSnapshot>;
  currentRevisionRef: MutableRefObject<number | null>;
  setSnapshot: (snapshot: EditorSnapshot) => void;
  displayName?: string;
}

export function useWriteCollaborationRuntime({
  uid,
  projectId,
  authorityStatus,
  isOffline,
  editor,
  scrollElement,
  hasHydratedRef,
  hasLocalEditsRef,
  presentRef,
  lastConfirmedSnapshotRef,
  currentRevisionRef,
  setSnapshot,
  displayName,
}: UseWriteCollaborationRuntimeParams) {
  const [connectionState, setConnectionState] = useState<CollaborationConnectionState>('disabled');
  const [collaborators, setCollaborators] = useState<WriteCollaboratorPresenceRecord[]>([]);
  const [cursorOverlays, setCursorOverlays] = useState<CollaborativeCursorOverlay[]>([]);
  const deviceId = useMemo(() => (uid ? getWriteRuntimeDeviceId(uid) : ''), [uid]);
  const seenRemoteOperationIdsRef = useRef<Set<string>>(new Set());
  const pendingRemoteSnapshotRef = useRef<EditorSnapshot | null>(null);
  const latestPresenceSignalRef = useRef(0);

  const canCollaborate = Boolean(
    uid &&
    projectId &&
    projectId !== 'new' &&
    authorityStatus === 'persistent' &&
    !isOffline
  );

  const applyRemoteSnapshot = useCallback((snapshot: EditorSnapshot, latestRevision?: number) => {
    if (!editor || !hasHydratedRef.current) {
      pendingRemoteSnapshotRef.current = snapshot;
      return false;
    }

    if (!shouldApplyRemoteSnapshot({
      snapshot,
      hasLocalEdits: hasLocalEditsRef.current,
      mountedSectionIds: presentRef.current.mountedSectionIds,
    })) {
      pendingRemoteSnapshotRef.current = snapshot;
      writeEditorTelemetry.log('sync', 'remote_snapshot_deferred', {
        projectId,
        hasLocalEdits: hasLocalEditsRef.current,
        remoteMountedSectionCount: snapshot.mountedSectionIds?.length ?? 0,
      }, 'debug');
      return false;
    }

    const finish = writeEditorTelemetry.startTimer('sync.remoteReplay', {
      projectId,
    });
    lastConfirmedSnapshotRef.current = snapshot;
    presentRef.current = snapshot;
    if (typeof latestRevision === 'number') {
      currentRevisionRef.current = Math.max(currentRevisionRef.current ?? 0, latestRevision);
    }
    setSnapshot(snapshot);
    if (snapshot.contentDoc?.type === 'doc') {
      editor.commands.setContent({ type: 'doc', content: snapshot.contentDoc.content }, false);
    }
    finish();
    writeEditorTelemetry.increment('sync.remoteOperationApplied');
    return true;
  }, [
    currentRevisionRef,
    editor,
    hasHydratedRef,
    hasLocalEditsRef,
    lastConfirmedSnapshotRef,
    presentRef,
    projectId,
    setSnapshot,
  ]);

  const publishLocalOperation = useCallback(async (operation: WriteChunkSnapshotOperation) => {
    if (!canCollaborate || !uid || !projectId || operation.causality?.deviceId !== deviceId) {
      return;
    }

    try {
      const startedAt = getPerfNow();
      await writeCollaborationTransport.publishOperation({
        uid,
        projectId,
        operation,
      });
      seenRemoteOperationIdsRef.current.add(operation.operationId);
      writeEditorTelemetry.timing('sync.liveOperationPropagation', getPerfNow() - startedAt, {
        projectId,
        operationId: operation.operationId,
      });
    } catch (error) {
      setConnectionState('degraded');
      writeEditorTelemetry.log('sync', 'live_operation_publish_failed', {
        projectId,
        operationId: operation.operationId,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn');
    }
  }, [canCollaborate, deviceId, projectId, uid]);

  useEffect(() => {
    if (!canCollaborate || !uid || !projectId || !deviceId) {
      setConnectionState('disabled');
      setCollaborators([]);
      return;
    }

    setConnectionState('connecting');
    const unsubscribeOperations = writeCollaborationTransport.subscribeOperations({
      uid,
      projectId,
      onRecords: (records) => {
        const unseen = records.filter((record) => {
          if (seenRemoteOperationIdsRef.current.has(record.operationId)) {
            return false;
          }
          seenRemoteOperationIdsRef.current.add(record.operationId);
          return true;
        });
        boundSeenOperationIds(seenRemoteOperationIdsRef.current);
        if (unseen.length === 0) {
          setConnectionState('connected');
          return;
        }

        const boundedUnseen = unseen.slice(0, MAX_REMOTE_OPERATION_APPLY_BATCH);
        if (unseen.length > boundedUnseen.length) {
          unseen.slice(MAX_REMOTE_OPERATION_APPLY_BATCH).forEach((record) => {
            seenRemoteOperationIdsRef.current.delete(record.operationId);
          });
          writeEditorTelemetry.increment('sync.remoteReplayBackpressureActivated');
          writeEditorTelemetry.log('sync', 'remote_replay_backpressure_activated', {
            projectId,
            receivedCount: unseen.length,
            appliedBatchSize: boundedUnseen.length,
          }, 'warn');
        }
        const startedAt = getPerfNow();
        const result = ingestRemoteCollaborationOperations({
          uid,
          projectId,
          localDeviceId: deviceId,
          records: boundedUnseen,
        });
        writeEditorTelemetry.timing('sync.distributedMerge', getPerfNow() - startedAt, {
          projectId,
          acceptedCount: result.acceptedOperations.length,
          rejectedCount: result.rejectedOperationIds.length,
          duplicateCount: result.duplicateOperationIds.length,
        });
        writeEditorTelemetry.gauge('sync.remoteAcceptedOperationCount', result.acceptedOperations.length);
        if (result.appliedSnapshot) {
          applyRemoteSnapshot(result.appliedSnapshot, result.latestRevision);
        }
        setConnectionState('connected');
      },
      onError: () => setConnectionState('degraded'),
    });

    const unsubscribePresence = writeCollaborationTransport.subscribePresence({
      uid,
      projectId,
      onPresence: (records) => {
        const remoteRecords = records.filter((record) => record.deviceId !== deviceId);
        setCollaborators(remoteRecords);
        writeEditorTelemetry.gauge('sync.activeCollaboratorCount', remoteRecords.length);
      },
      onError: () => setConnectionState('degraded'),
    });

    return () => {
      unsubscribeOperations();
      unsubscribePresence();
    };
  }, [applyRemoteSnapshot, canCollaborate, deviceId, projectId, uid]);

  useEffect(() => {
    if (!canCollaborate || !uid || !projectId || !editor || !deviceId) {
      return;
    }

    const publishPresence = () => {
      if (!hasHydratedRef.current) {
        return;
      }
      latestPresenceSignalRef.current = Date.now();
      const presence = captureCollaborativePresence({
        editor,
        uid,
        projectId,
        deviceId,
        displayName,
        mountedSectionIds: presentRef.current.mountedSectionIds,
      });
      void writeCollaborationTransport.publishPresence({
        uid,
        projectId,
        presence,
      }).catch((error) => {
        setConnectionState('degraded');
        writeEditorTelemetry.log('sync', 'presence_publish_failed', {
          projectId,
          error: error instanceof Error ? error.message : String(error),
        }, 'warn');
      });
    };

    const handleSelectionUpdate = () => {
      if (Date.now() - latestPresenceSignalRef.current < 900) {
        return;
      }
      publishPresence();
    };

    publishPresence();
    const interval = window.setInterval(publishPresence, 10_000);
    editor.on('selectionUpdate', handleSelectionUpdate);
    editor.on('focus', publishPresence);
    editor.on('blur', publishPresence);
    return () => {
      window.clearInterval(interval);
      editor.off('selectionUpdate', handleSelectionUpdate);
      editor.off('focus', publishPresence);
      editor.off('blur', publishPresence);
      void writeCollaborationTransport.removePresence({
        uid,
        projectId,
        actorId: uid,
        deviceId,
      }).catch(() => undefined);
    };
  }, [canCollaborate, deviceId, displayName, editor, hasHydratedRef, presentRef, projectId, uid]);

  useEffect(() => {
    const updateOverlays = () => {
      const overlays = createCollaborativeCursorOverlays({
        editor,
        scrollElement,
        collaborators,
        localDeviceId: deviceId,
      });
      setCursorOverlays(overlays);
      writeEditorTelemetry.gauge('sync.remoteCursorCount', overlays.length);
    };

    updateOverlays();
    if (!scrollElement) {
      return;
    }

    scrollElement.addEventListener('scroll', updateOverlays, { passive: true });
    window.addEventListener('resize', updateOverlays);
    return () => {
      scrollElement.removeEventListener('scroll', updateOverlays);
      window.removeEventListener('resize', updateOverlays);
    };
  }, [collaborators, deviceId, editor, scrollElement]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!pendingRemoteSnapshotRef.current || hasLocalEditsRef.current) {
        return;
      }
      const pending = pendingRemoteSnapshotRef.current;
      pendingRemoteSnapshotRef.current = null;
      applyRemoteSnapshot(pending);
    }, 1_500);
    return () => window.clearInterval(interval);
  }, [applyRemoteSnapshot, hasLocalEditsRef]);

  return {
    connectionState,
    collaborators,
    cursorOverlays,
    publishLocalOperation,
  };
}
