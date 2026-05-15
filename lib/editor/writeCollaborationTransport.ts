import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDb, getFirebaseFunctions } from '../firebase.ts';
import {
  type WriteCollaborationPresenceResult,
  type WriteCollaborationReplayCursorResult,
  type WriteCollaboratorPresenceRecord,
  type WriteCollaborationOperationRecord,
} from './writeCollaborationTypes.ts';
import {
  createOperationConvergenceHash,
} from './writeConvergenceSemantics.ts';
import {
  type WriteChunkSnapshotOperation,
} from './writeOperationalTypes.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';
import { requestWriteOperationCompaction } from './writeOperationRetention.ts';

const MAX_LIVE_OPERATION_BATCH = 80;
const LIVE_OPERATION_PRESSURE_THRESHOLD = 70;
const MAX_LIVE_PRESENCE_RECORDS = 32;
const LIVE_PRESENCE_PRESSURE_THRESHOLD = 28;

type CallableEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

type PublishCollaborationOperationResult = {
  record: WriteCollaborationOperationRecord;
  duplicate: boolean;
};

type SyncReplayCursorResult = WriteCollaborationReplayCursorResult;

type SyncPresenceResult = WriteCollaborationPresenceResult;

function projectRef(uid: string, projectId: string) {
  return doc(getFirebaseDb(), 'users', uid, 'projects', projectId);
}

function operationCollectionRef(uid: string, projectId: string) {
  return collection(projectRef(uid, projectId), 'collaborationOperations');
}

function presenceCollectionRef(uid: string, projectId: string) {
  return collection(projectRef(uid, projectId), 'collaborationPresence');
}

function byteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value ?? null);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(serialized).length;
    }
    return serialized.length;
  } catch {
    return 0;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mapOperationRecord(value: Record<string, unknown>): WriteCollaborationOperationRecord | null {
  if (
    value.schemaVersion !== 1 ||
    typeof value.projectId !== 'string' ||
    typeof value.ownerUid !== 'string' ||
    typeof value.operationId !== 'string' ||
    typeof value.actorId !== 'string' ||
    typeof value.deviceId !== 'string' ||
    typeof value.createdAt !== 'number' ||
    (
      value.coordinatorSequence !== undefined &&
      typeof value.coordinatorSequence !== 'number'
    ) ||
    typeof value.payloadBytes !== 'number' ||
    !isObject(value.operation) ||
    !isObject(value.causality)
  ) {
    return null;
  }

  return value as unknown as WriteCollaborationOperationRecord;
}

function mapReplayCursorResult(value: SyncReplayCursorResult): WriteCollaborationReplayCursorResult {
  return {
    ...value,
    records: value.records
      .map((entry) => mapOperationRecord(entry as unknown as Record<string, unknown>))
      .filter((entry): entry is WriteCollaborationOperationRecord => entry !== null),
  };
}

function mapPresenceRecord(value: Record<string, unknown>): WriteCollaboratorPresenceRecord | null {
  if (
    value.schemaVersion !== 1 ||
    typeof value.projectId !== 'string' ||
    typeof value.ownerUid !== 'string' ||
    typeof value.actorId !== 'string' ||
    typeof value.deviceId !== 'string' ||
    typeof value.updatedAt !== 'number' ||
    typeof value.expiresAt !== 'number' ||
    (value.status !== 'active' && value.status !== 'idle')
  ) {
    return null;
  }

  return value as unknown as WriteCollaboratorPresenceRecord;
}

export const writeCollaborationTransport = {
  async publishOperation(params: {
    uid: string;
    projectId: string;
    operation: WriteChunkSnapshotOperation;
  }): Promise<WriteCollaborationOperationRecord> {
    if (!params.operation.causality) {
      throw new Error('Collaboration operation requires causality metadata.');
    }

    const convergenceHash = params.operation.convergenceHash ?? createOperationConvergenceHash(params.operation);
    const record: WriteCollaborationOperationRecord = {
      schemaVersion: 1,
      projectId: params.projectId,
      ownerUid: params.uid,
      operationId: params.operation.operationId,
      actorId: params.operation.causality.actorId,
      deviceId: params.operation.causality.deviceId,
      createdAt: Date.now(),
      payloadBytes: byteLength(params.operation),
      operation: {
        ...params.operation,
        convergenceHash,
      },
      causality: params.operation.causality,
      convergenceHash,
    };

    const finish = writeEditorTelemetry.startTimer('sync.liveOperationPublish', {
      projectId: params.projectId,
      operationId: params.operation.operationId,
    });
    const callable = httpsCallable<
      { projectId: string; operation: WriteChunkSnapshotOperation },
      CallableEnvelope<PublishCollaborationOperationResult> | PublishCollaborationOperationResult
    >(
      getFirebaseFunctions(),
      'publishWriteCollaborationOperation'
    );
    const response = await callable({
      projectId: params.projectId,
      operation: record.operation,
    });
    const value = response.data;
    const result = value && typeof value === 'object' && 'success' in value
      ? (value as CallableEnvelope<PublishCollaborationOperationResult>).success
        ? (value as { success: true; data: PublishCollaborationOperationResult }).data
        : null
      : value as PublishCollaborationOperationResult;
    if (!result?.record) {
      throw new Error('Collaboration coordinator rejected the operation.');
    }
    finish();
    writeEditorTelemetry.increment(result.duplicate
      ? 'sync.liveOperationDuplicateAcknowledged'
      : 'sync.liveOperationPublished');
    writeEditorTelemetry.gauge('sync.liveOperationPayloadBytes', result.record.payloadBytes);
    writeEditorTelemetry.gauge('sync.collaborationCoordinatorSequence', result.record.coordinatorSequence ?? 0);
    void requestWriteOperationCompaction({
      projectId: params.projectId,
      reason: 'collaboration',
    });
    return result.record;
  },

  async recoverReplayWindow(params: {
    uid: string;
    projectId: string;
    deviceId: string;
    limit?: number;
  }): Promise<WriteCollaborationReplayCursorResult> {
    const finish = writeEditorTelemetry.startTimer('sync.remoteReplayRecovery', {
      projectId: params.projectId,
    });
    const callable = httpsCallable<
      { projectId: string; deviceId: string; action: 'recover'; limit?: number },
      CallableEnvelope<SyncReplayCursorResult> | SyncReplayCursorResult
    >(
      getFirebaseFunctions(),
      'syncWriteCollaborationReplayCursor'
    );
    const response = await callable({
      projectId: params.projectId,
      deviceId: params.deviceId,
      action: 'recover',
      limit: params.limit ?? MAX_LIVE_OPERATION_BATCH,
    });
    const value = response.data;
    const result = value && typeof value === 'object' && 'success' in value
      ? (value as CallableEnvelope<SyncReplayCursorResult>).success
        ? (value as { success: true; data: SyncReplayCursorResult }).data
        : null
      : value as SyncReplayCursorResult;
    if (!result?.cursor) {
      throw new Error('Collaboration replay cursor recovery failed.');
    }
    finish();
    const mapped = mapReplayCursorResult(result);
    writeEditorTelemetry.gauge('sync.replayWindowRecordCount', mapped.records.length);
    writeEditorTelemetry.gauge('sync.remoteReplayCursorSequence', mapped.cursor.lastCoordinatorSequence);
    if (mapped.windowGap) {
      writeEditorTelemetry.increment('sync.remoteReplayWindowGap');
    }
    return mapped;
  },

  async advanceReplayCursor(params: {
    uid: string;
    projectId: string;
    deviceId: string;
    upToCoordinatorSequence: number;
    operationIds: string[];
  }): Promise<WriteCollaborationReplayCursorResult> {
    const finish = writeEditorTelemetry.startTimer('sync.remoteReplayCheckpointAdvance', {
      projectId: params.projectId,
    });
    const callable = httpsCallable<
      {
        projectId: string;
        deviceId: string;
        action: 'advance';
        upToCoordinatorSequence: number;
        operationIds: string[];
      },
      CallableEnvelope<SyncReplayCursorResult> | SyncReplayCursorResult
    >(
      getFirebaseFunctions(),
      'syncWriteCollaborationReplayCursor'
    );
    const response = await callable({
      projectId: params.projectId,
      deviceId: params.deviceId,
      action: 'advance',
      upToCoordinatorSequence: params.upToCoordinatorSequence,
      operationIds: params.operationIds,
    });
    const value = response.data;
    const result = value && typeof value === 'object' && 'success' in value
      ? (value as CallableEnvelope<SyncReplayCursorResult>).success
        ? (value as { success: true; data: SyncReplayCursorResult }).data
        : null
      : value as SyncReplayCursorResult;
    if (!result?.cursor) {
      throw new Error('Collaboration replay cursor advance failed.');
    }
    finish();
    const mapped = mapReplayCursorResult(result);
    writeEditorTelemetry.gauge('sync.remoteReplayCursorSequence', mapped.cursor.lastCoordinatorSequence);
    writeEditorTelemetry.increment(mapped.duplicate
      ? 'sync.remoteReplayCursorDuplicate'
      : 'sync.remoteReplayCursorAdvanced');
    return mapped;
  },

  subscribeOperations(params: {
    uid: string;
    projectId: string;
    onRecords: (records: WriteCollaborationOperationRecord[]) => void;
    onError?: (error: Error) => void;
  }): Unsubscribe {
    const operationsQuery = query(
      operationCollectionRef(params.uid, params.projectId),
      orderBy('createdAt', 'desc'),
      limit(MAX_LIVE_OPERATION_BATCH)
    );

    return onSnapshot(
      operationsQuery,
      (snapshot) => {
        const records = snapshot.docs
          .map((entry) => mapOperationRecord(entry.data() as Record<string, unknown>))
          .filter((entry): entry is WriteCollaborationOperationRecord => entry !== null)
          .sort((first, second) => (
            (first.coordinatorSequence ?? first.createdAt) - (second.coordinatorSequence ?? second.createdAt) ||
            first.createdAt - second.createdAt ||
            first.operationId.localeCompare(second.operationId)
          ));
        writeEditorTelemetry.gauge('sync.liveOperationListenerBatchSize', records.length);
        if (records.length >= LIVE_OPERATION_PRESSURE_THRESHOLD) {
          writeEditorTelemetry.increment('sync.listenerBackpressureActivated');
          writeEditorTelemetry.log('sync', 'live_operation_listener_pressure', {
            projectId: params.projectId,
            recordCount: records.length,
            limit: MAX_LIVE_OPERATION_BATCH,
          }, 'warn');
        }
        params.onRecords(records);
      },
      (error) => {
        writeEditorTelemetry.log('sync', 'live_operation_subscription_failed', {
          projectId: params.projectId,
          error: error.message,
        }, 'warn');
        params.onError?.(error);
      }
    );
  },

  async publishPresence(params: {
    uid: string;
    projectId: string;
    presence: WriteCollaboratorPresenceRecord;
  }): Promise<void> {
    const finish = writeEditorTelemetry.startTimer('sync.presencePublish', {
      projectId: params.projectId,
    });
    const callable = httpsCallable<
      {
        action: 'publish';
        projectId: string;
        deviceId: string;
        presence: WriteCollaboratorPresenceRecord;
      },
      CallableEnvelope<SyncPresenceResult> | SyncPresenceResult
    >(
      getFirebaseFunctions(),
      'syncWriteCollaborationPresence'
    );
    const response = await callable({
      action: 'publish',
      projectId: params.projectId,
      deviceId: params.presence.deviceId,
      presence: params.presence,
    });
    const value = response.data;
    const result = value && typeof value === 'object' && 'success' in value
      ? (value as CallableEnvelope<SyncPresenceResult>).success
        ? (value as { success: true; data: SyncPresenceResult }).data
        : null
      : value as SyncPresenceResult;
    if (!result) {
      throw new Error('Collaboration presence coordinator rejected the update.');
    }
    finish();
    writeEditorTelemetry.increment(result.throttled
      ? 'sync.presenceThrottled'
      : 'sync.presencePublished');
    writeEditorTelemetry.gauge('sync.presenceCleanupCount', result.cleanupCount);
    writeEditorTelemetry.gauge('sync.presenceSequence', result.presenceSequence ?? result.record?.presenceSequence ?? 0);
    void requestWriteOperationCompaction({
      projectId: params.projectId,
      reason: 'presence',
    });
  },

  subscribePresence(params: {
    uid: string;
    projectId: string;
    onPresence: (records: WriteCollaboratorPresenceRecord[]) => void;
    onError?: (error: Error) => void;
  }): Unsubscribe {
    const presenceQuery = query(
      presenceCollectionRef(params.uid, params.projectId),
      orderBy('updatedAt', 'desc'),
      limit(MAX_LIVE_PRESENCE_RECORDS)
    );

    return onSnapshot(
      presenceQuery,
      (snapshot) => {
        const now = Date.now();
        const records = snapshot.docs
          .map((entry) => mapPresenceRecord(entry.data() as Record<string, unknown>))
          .filter((entry): entry is WriteCollaboratorPresenceRecord => (
            entry !== null && entry.expiresAt > now
          ))
          .sort((first, second) => (
            (first.presenceSequence ?? first.updatedAt) - (second.presenceSequence ?? second.updatedAt) ||
            first.updatedAt - second.updatedAt ||
            first.deviceId.localeCompare(second.deviceId)
          ));
        writeEditorTelemetry.gauge('sync.presenceListenerBatchSize', records.length);
        if (snapshot.size >= LIVE_PRESENCE_PRESSURE_THRESHOLD) {
          writeEditorTelemetry.increment('sync.presenceListenerBackpressureActivated');
          writeEditorTelemetry.log('sync', 'presence_listener_pressure', {
            projectId: params.projectId,
            recordCount: snapshot.size,
            limit: MAX_LIVE_PRESENCE_RECORDS,
          }, 'warn');
        }
        params.onPresence(records);
      },
      (error) => {
        writeEditorTelemetry.log('sync', 'presence_subscription_failed', {
          projectId: params.projectId,
          error: error.message,
        }, 'warn');
        params.onError?.(error);
      }
    );
  },

  async removePresence(params: {
    uid: string;
    projectId: string;
    actorId: string;
    deviceId: string;
  }): Promise<void> {
    const callable = httpsCallable<
      { action: 'remove'; projectId: string; deviceId: string },
      CallableEnvelope<SyncPresenceResult> | SyncPresenceResult
    >(
      getFirebaseFunctions(),
      'syncWriteCollaborationPresence'
    );
    const response = await callable({
      action: 'remove',
      projectId: params.projectId,
      deviceId: params.deviceId,
    });
    const value = response.data;
    const result = value && typeof value === 'object' && 'success' in value
      ? (value as CallableEnvelope<SyncPresenceResult>).success
        ? (value as { success: true; data: SyncPresenceResult }).data
        : null
      : value as SyncPresenceResult;
    if (!result?.removed) {
      throw new Error('Collaboration presence coordinator did not remove presence.');
    }
  },
};
