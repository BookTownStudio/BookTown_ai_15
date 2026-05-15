import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from '../firebase.ts';
import {
  type WriteCollaboratorPresenceRecord,
  type WriteCollaborationOperationRecord,
} from './writeCollaborationTypes.ts';
import {
  createOperationConvergenceHash,
} from './writeConvergenceSemantics.ts';
import {
  createWriteOperationHash,
  type WriteChunkSnapshotOperation,
} from './writeOperationalTypes.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';
import { requestWriteOperationCompaction } from './writeOperationRetention.ts';

const MAX_LIVE_OPERATION_BATCH = 80;
const LIVE_OPERATION_PRESSURE_THRESHOLD = 70;

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
    typeof value.payloadBytes !== 'number' ||
    !isObject(value.operation) ||
    !isObject(value.causality)
  ) {
    return null;
  }

  return value as unknown as WriteCollaborationOperationRecord;
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
    await setDoc(
      doc(operationCollectionRef(params.uid, params.projectId), params.operation.operationId),
      record,
      { merge: false }
    );
    finish();
    writeEditorTelemetry.increment('sync.liveOperationPublished');
    writeEditorTelemetry.gauge('sync.liveOperationPayloadBytes', record.payloadBytes);
    void requestWriteOperationCompaction({
      projectId: params.projectId,
      reason: 'collaboration',
    });
    return record;
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
          .sort((first, second) => first.createdAt - second.createdAt || first.operationId.localeCompare(second.operationId));
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
    const presenceId = createWriteOperationHash({
      actorId: params.presence.actorId,
      deviceId: params.presence.deviceId,
    });
    const finish = writeEditorTelemetry.startTimer('sync.presencePublish', {
      projectId: params.projectId,
    });
    await setDoc(
      doc(presenceCollectionRef(params.uid, params.projectId), presenceId),
      params.presence,
      { merge: true }
    );
    finish();
    writeEditorTelemetry.increment('sync.presencePublished');
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
    return onSnapshot(
      presenceCollectionRef(params.uid, params.projectId),
      (snapshot) => {
        const now = Date.now();
        const records = snapshot.docs
          .map((entry) => mapPresenceRecord(entry.data() as Record<string, unknown>))
          .filter((entry): entry is WriteCollaboratorPresenceRecord => (
            entry !== null && entry.expiresAt > now
          ));
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
    const presenceId = createWriteOperationHash({
      actorId: params.actorId,
      deviceId: params.deviceId,
    });
    await deleteDoc(doc(presenceCollectionRef(params.uid, params.projectId), presenceId));
  },
};
