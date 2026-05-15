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
  type WriteCollaborationOperationRecord,
  type WriteCollaborationReplayCursor,
  type WriteCollaboratorPresenceRecord,
} from './writeCollaborationTypes.ts';
import { type AuthorityStatus } from './editorRuntimeTypes.ts';
import { type WriteChunkSnapshotOperation } from './writeOperationalTypes.ts';
import { getWriteRuntimeDeviceId } from './writeRuntimeIdentity.ts';
import { getWriteRuntimeSessionCoordinator } from './writeRuntimeSessionCoordinator.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

const MAX_SEEN_REMOTE_OPERATION_IDS = 500;
const MAX_REMOTE_OPERATION_APPLY_BATCH = 24;
const MAX_REMOTE_REPLAY_RECOVERY_WINDOWS = 8;
const REMOTE_REPLAY_RECOVERY_YIELD_MS = 25;
const MIN_IDENTICAL_PRESENCE_INTERVAL_MS = 5_000;

function boundSeenOperationIds(ids: Set<string>): void {
  if (ids.size <= MAX_SEEN_REMOTE_OPERATION_IDS) {
    return;
  }
  const overflow = ids.size - MAX_SEEN_REMOTE_OPERATION_IDS;
  Array.from(ids).slice(0, overflow).forEach((operationId) => ids.delete(operationId));
}

function coordinatorSequence(record: WriteCollaborationOperationRecord): number {
  return typeof record.coordinatorSequence === 'number' && Number.isFinite(record.coordinatorSequence)
    ? record.coordinatorSequence
    : 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createPresenceSignature(presence: WriteCollaboratorPresenceRecord): string {
  return JSON.stringify({
    status: presence.status,
    selectionFrom: presence.selectionFrom,
    selectionTo: presence.selectionTo,
    anchorId: presence.anchorId,
    chunkId: presence.chunkId,
    sectionId: presence.sectionId,
    mountedSectionIds: presence.mountedSectionIds,
  });
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
  const runtimeCoordinator = useMemo(() => (
    uid && projectId && projectId !== 'new' && deviceId
      ? getWriteRuntimeSessionCoordinator({ uid, projectId, deviceId })
      : null
  ), [deviceId, projectId, uid]);
  const seenRemoteOperationIdsRef = useRef<Set<string>>(new Set());
  const remoteReplayCursorRef = useRef<WriteCollaborationReplayCursor | null>(null);
  const remoteReplayProcessingRef = useRef(false);
  const remoteReplayRecoveringRef = useRef(false);
  const pendingRemoteSnapshotRef = useRef<EditorSnapshot | null>(null);
  const latestPresenceSignalRef = useRef(0);
  const lastPresenceSignatureRef = useRef('');
  const lastPresencePublishAtRef = useRef(0);
  const [isRuntimeLeader, setIsRuntimeLeader] = useState(false);

  const canCollaborate = Boolean(
    uid &&
    projectId &&
    projectId !== 'new' &&
    authorityStatus === 'persistent' &&
    !isOffline
  );

  useEffect(() => {
    if (!runtimeCoordinator) {
      return;
    }
    if (!canCollaborate) {
      runtimeCoordinator.stop();
      return;
    }
    runtimeCoordinator.start();
    return () => {
      runtimeCoordinator.stop();
    };
  }, [canCollaborate, runtimeCoordinator]);

  useEffect(() => {
    if (!canCollaborate || !runtimeCoordinator) {
      setIsRuntimeLeader(false);
      return;
    }

    return runtimeCoordinator.subscribe((snapshot) => {
      setIsRuntimeLeader(snapshot.isLeader);
      writeEditorTelemetry.log('sync', 'runtime_leadership_snapshot', {
        projectId,
        isLeader: snapshot.isLeader,
        leaderInstanceId: snapshot.leaderInstanceId,
        term: snapshot.term,
      }, 'debug');
    });
  }, [canCollaborate, projectId, runtimeCoordinator]);

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

  const publishOperationDirect = useCallback(async (
    operation: WriteChunkSnapshotOperation,
    source: 'local' | 'delegated' | 'fallback'
  ) => {
    if (!canCollaborate || !uid || !projectId || operation.causality?.deviceId !== deviceId) {
      return;
    }

    const claimedPublication = runtimeCoordinator?.claimOperationPublication(operation.operationId) ?? null;
    if (runtimeCoordinator && !claimedPublication) {
      writeEditorTelemetry.increment('sync.duplicateOperationPublicationPrevented');
      writeEditorTelemetry.log('sync', 'duplicate_operation_publication_prevented', {
        projectId,
        operationId: operation.operationId,
        source,
      }, 'debug');
      return;
    }
    const releasePublication = claimedPublication ?? (() => undefined);

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
        source,
      });
    } catch (error) {
      setConnectionState('degraded');
      writeEditorTelemetry.log('sync', 'live_operation_publish_failed', {
        projectId,
        operationId: operation.operationId,
        source,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn');
    } finally {
      releasePublication();
    }
  }, [canCollaborate, deviceId, projectId, runtimeCoordinator, uid]);

  const publishLocalOperation = useCallback(async (operation: WriteChunkSnapshotOperation) => {
    if (!canCollaborate || !uid || !projectId || operation.causality?.deviceId !== deviceId) {
      return;
    }

    if (runtimeCoordinator && !runtimeCoordinator.isLeader()) {
      const delegated = runtimeCoordinator.requestOperationPublication(operation);
      if (delegated) {
        return;
      }
      writeEditorTelemetry.increment('sync.operationPublicationFallback');
      writeEditorTelemetry.log('sync', 'operation_publication_fallback', {
        projectId,
        operationId: operation.operationId,
      }, 'warn');
    }

    await publishOperationDirect(operation, runtimeCoordinator?.isLeader() ? 'local' : 'fallback');
  }, [canCollaborate, deviceId, projectId, publishOperationDirect, runtimeCoordinator, uid]);

  useEffect(() => {
    if (!canCollaborate || !runtimeCoordinator) {
      return;
    }

    return runtimeCoordinator.onOperationPublishRequest((operation) => {
      if (operation.causality?.deviceId !== deviceId) {
        return;
      }
      void publishOperationDirect(operation, 'delegated');
    });
  }, [canCollaborate, deviceId, publishOperationDirect, runtimeCoordinator]);

  const processOperationRecords = useCallback(async (
    records: WriteCollaborationOperationRecord[],
    options: { source: 'listener' | 'recovery' | 'broadcast'; advanceCursor: boolean }
  ): Promise<{ advanced: boolean; blocked: boolean }> => {
    if (remoteReplayProcessingRef.current) {
      writeEditorTelemetry.increment('sync.remoteReplayProcessingCoalesced');
      return { advanced: false, blocked: true };
    }

    const cursorSequence = options.advanceCursor
      ? remoteReplayCursorRef.current?.lastCoordinatorSequence ?? 0
      : 0;
    const ordered = records
      .filter((record) => {
        const sequence = coordinatorSequence(record);
        if (sequence <= cursorSequence) {
          return false;
        }
        return options.advanceCursor || !seenRemoteOperationIdsRef.current.has(record.operationId);
      })
      .sort((first, second) => (
        coordinatorSequence(first) - coordinatorSequence(second) ||
        first.createdAt - second.createdAt ||
        first.operationId.localeCompare(second.operationId)
      ));

    if (ordered.length === 0) {
      setConnectionState('connected');
      return { advanced: false, blocked: false };
    }

    const boundedUnseen = ordered.slice(0, MAX_REMOTE_OPERATION_APPLY_BATCH);
    if (ordered.length > boundedUnseen.length) {
      writeEditorTelemetry.increment('sync.remoteReplayBackpressureActivated');
      writeEditorTelemetry.log('sync', 'remote_replay_backpressure_activated', {
        projectId,
        receivedCount: ordered.length,
        appliedBatchSize: boundedUnseen.length,
        source: options.source,
      }, 'warn');
    }

    remoteReplayProcessingRef.current = true;
    const startedAt = getPerfNow();
    try {
      const previousCursor = remoteReplayCursorRef.current;
      const result = ingestRemoteCollaborationOperations({
        uid: uid ?? '',
        projectId: projectId ?? '',
        localDeviceId: deviceId,
        records: boundedUnseen,
        previousCheckpoint: previousCursor
          ? {
            schemaVersion: 1,
            checkpointId: previousCursor.checkpointId ?? 'remote_replay_cursor',
            uid: uid ?? '',
            projectId: projectId ?? '',
            operationIds: previousCursor.operationIds,
            chunkIds: [],
            createdAt: previousCursor.updatedAt,
            causalityHash: previousCursor.checkpointHash ?? '',
          }
          : undefined,
      });
      writeEditorTelemetry.timing('sync.distributedMerge', getPerfNow() - startedAt, {
        projectId,
        acceptedCount: result.acceptedOperations.length,
        rejectedCount: result.rejectedOperationIds.length,
        duplicateCount: result.duplicateOperationIds.length,
        source: options.source,
      });
      writeEditorTelemetry.gauge('sync.remoteAcceptedOperationCount', result.acceptedOperations.length);
      const applied = result.appliedSnapshot
        ? applyRemoteSnapshot(result.appliedSnapshot, result.latestRevision)
        : true;
      const recordsById = new Map(boundedUnseen.map((record) => [record.operationId, record]));
      const rejectedRemoteIds = result.rejectedOperationIds.filter((operationId) => {
        const record = recordsById.get(operationId);
        return record && record.deviceId !== deviceId;
      });
      if (!applied || rejectedRemoteIds.length > 0) {
        writeEditorTelemetry.log('sync', 'remote_replay_checkpoint_deferred', {
          projectId,
          applied,
          rejectedRemoteCount: rejectedRemoteIds.length,
          source: options.source,
        }, 'warn');
        setConnectionState('connected');
        return { advanced: false, blocked: true };
      }

      boundedUnseen.forEach((record) => {
        seenRemoteOperationIdsRef.current.add(record.operationId);
      });
      boundSeenOperationIds(seenRemoteOperationIdsRef.current);

      if (options.advanceCursor && uid && projectId && deviceId) {
        const upToCoordinatorSequence = Math.max(...boundedUnseen.map(coordinatorSequence));
        const cursorResult = await writeCollaborationTransport.advanceReplayCursor({
          uid,
          projectId,
          deviceId,
          upToCoordinatorSequence,
          operationIds: boundedUnseen.map((record) => record.operationId),
        });
        remoteReplayCursorRef.current = cursorResult.cursor;
        writeEditorTelemetry.gauge('sync.remoteReplayCursorSequence', cursorResult.cursor.lastCoordinatorSequence);
      }

      setConnectionState('connected');
      return { advanced: options.advanceCursor, blocked: false };
    } catch (error) {
      setConnectionState('degraded');
      writeEditorTelemetry.log('sync', 'remote_replay_processing_failed', {
        projectId,
        source: options.source,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn');
      return { advanced: false, blocked: true };
    } finally {
      remoteReplayProcessingRef.current = false;
    }
  }, [applyRemoteSnapshot, deviceId, projectId, uid]);

  const recoverRemoteReplay = useCallback(async () => {
    if (!canCollaborate || !uid || !projectId || !deviceId || remoteReplayRecoveringRef.current) {
      return;
    }

    remoteReplayRecoveringRef.current = true;
    try {
      for (let index = 0; index < MAX_REMOTE_REPLAY_RECOVERY_WINDOWS; index += 1) {
        const windowResult = await writeCollaborationTransport.recoverReplayWindow({
          uid,
          projectId,
          deviceId,
          limit: MAX_REMOTE_OPERATION_APPLY_BATCH,
        });
        remoteReplayCursorRef.current = windowResult.cursor;
        writeEditorTelemetry.gauge('sync.replayWindowFetchCount', windowResult.records.length);
        if (windowResult.windowGap) {
          writeEditorTelemetry.log('sync', 'remote_replay_window_gap_detected', {
            projectId,
            cursorSequence: windowResult.cursor.lastCoordinatorSequence,
            latestCoordinatorSequence: windowResult.latestCoordinatorSequence,
          }, 'warn');
          setConnectionState('degraded');
          return;
        }
        if (windowResult.records.length === 0) {
          setConnectionState('connected');
          return;
        }

        const processed = await processOperationRecords(windowResult.records, {
          source: 'recovery',
          advanceCursor: true,
        });
        if (processed.blocked || !windowResult.hasMore) {
          return;
        }
        await delay(REMOTE_REPLAY_RECOVERY_YIELD_MS);
      }
    } catch (error) {
      setConnectionState('degraded');
      writeEditorTelemetry.log('sync', 'remote_replay_recovery_failed', {
        projectId,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn');
    } finally {
      remoteReplayRecoveringRef.current = false;
    }
  }, [canCollaborate, deviceId, processOperationRecords, projectId, uid]);

  const handlePresenceRecords = useCallback((records: WriteCollaboratorPresenceRecord[]) => {
    const remoteRecords = records.filter((record) => record.deviceId !== deviceId);
    setCollaborators(remoteRecords);
    writeEditorTelemetry.gauge('sync.activeCollaboratorCount', remoteRecords.length);
  }, [deviceId]);

  useEffect(() => {
    if (!canCollaborate || !uid || !projectId || !deviceId || !runtimeCoordinator) {
      setConnectionState('disabled');
      setCollaborators([]);
      remoteReplayCursorRef.current = null;
      return;
    }

    setConnectionState('connecting');
    if (!isRuntimeLeader) {
      const unsubscribeOperations = runtimeCoordinator.onRemoteOperationRecords((records) => {
        void processOperationRecords(records, {
          source: 'broadcast',
          advanceCursor: false,
        });
      });
      const unsubscribePresence = runtimeCoordinator.onPresenceRecords(handlePresenceRecords);
      if (runtimeCoordinator.hasActiveLeader()) {
        setConnectionState('connected');
      }
      return () => {
        unsubscribeOperations();
        unsubscribePresence();
      };
    }

    let cancelled = false;
    let unsubscribeOperations: (() => void) | undefined;
    void (async () => {
      await recoverRemoteReplay();
      if (cancelled) {
        return;
      }
      unsubscribeOperations = writeCollaborationTransport.subscribeOperations({
        uid,
        projectId,
        onRecords: (records) => {
          runtimeCoordinator.broadcastRemoteOperationRecords(records);
          void processOperationRecords(records, {
            source: 'listener',
            advanceCursor: true,
          });
        },
        onError: () => setConnectionState('degraded'),
      });
    })();

    const unsubscribePresence = writeCollaborationTransport.subscribePresence({
      uid,
      projectId,
      onPresence: (records) => {
        runtimeCoordinator.broadcastPresenceRecords(records);
        handlePresenceRecords(records);
      },
      onError: () => setConnectionState('degraded'),
    });

    return () => {
      cancelled = true;
      unsubscribeOperations?.();
      unsubscribePresence();
    };
  }, [
    canCollaborate,
    deviceId,
    handlePresenceRecords,
    isRuntimeLeader,
    processOperationRecords,
    projectId,
    recoverRemoteReplay,
    runtimeCoordinator,
    uid,
  ]);

  useEffect(() => {
    if (!canCollaborate || !uid || !projectId || !editor || !deviceId || !isRuntimeLeader) {
      return;
    }

    const publishPresence = () => {
      if (!hasHydratedRef.current) {
        return;
      }
      const presence = captureCollaborativePresence({
        editor,
        uid,
        projectId,
        deviceId,
        displayName,
        mountedSectionIds: presentRef.current.mountedSectionIds,
      });
      const now = Date.now();
      const signature = createPresenceSignature(presence);
      if (
        signature === lastPresenceSignatureRef.current &&
        now - lastPresencePublishAtRef.current < MIN_IDENTICAL_PRESENCE_INTERVAL_MS
      ) {
        writeEditorTelemetry.increment('sync.presenceRuntimeNoiseSuppressed');
        return;
      }
      latestPresenceSignalRef.current = now;
      lastPresenceSignatureRef.current = signature;
      lastPresencePublishAtRef.current = now;
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
  }, [canCollaborate, deviceId, displayName, editor, hasHydratedRef, isRuntimeLeader, presentRef, projectId, uid]);

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
