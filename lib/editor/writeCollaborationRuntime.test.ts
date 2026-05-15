import { describe, expect, it } from 'vitest';
import { type EditorSnapshot } from './editorRuntimeTypes.ts';
import {
  ingestRemoteCollaborationOperations,
  shouldApplyRemoteSnapshot,
  validateRemoteCollaborationOperation,
} from './writeCollaborationRuntime.ts';
import { createOperationCausality, createOperationConvergenceHash } from './writeConvergenceSemantics.ts';
import {
  type WriteCollaborationOperationRecord,
} from './writeCollaborationTypes.ts';
import { type WriteChunkSnapshotOperation } from './writeOperationalTypes.ts';

function snapshot(text: string, chunkId = 'chunk_1'): EditorSnapshot {
  return {
    titleEn: 'Novel',
    titleAr: '',
    content: `<p>${text}</p>`,
    wordCount: 1,
    affectedChunkIds: [chunkId],
    mountedSectionIds: ['section_0001'],
    isPartialManuscript: true,
    contentDoc: {
      version: 1,
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: {
          btAnchorId: `anchor_${text}`,
          btChunkId: chunkId,
          btSectionId: 'section_0001',
        },
        content: [{ type: 'text', text }],
      }],
    },
  };
}

function operation(params: {
  id: string;
  deviceId: string;
  sequence: number;
  text: string;
}): WriteChunkSnapshotOperation {
  const operationSnapshot = snapshot(params.text);
  const op: WriteChunkSnapshotOperation = {
    schemaVersion: 1,
    operationId: params.id,
    uid: 'uid_1',
    projectId: 'project_1',
    type: 'chunk_snapshot_save',
    status: 'applied',
    sequence: params.sequence,
    createdAt: params.sequence,
    updatedAt: params.sequence,
    expectedRevision: params.sequence,
    serverRevision: params.sequence + 1,
    snapshot: operationSnapshot,
    affectedChunkIds: operationSnapshot.affectedChunkIds,
    mountedSectionIds: operationSnapshot.mountedSectionIds,
    attempts: 0,
  };
  op.causality = createOperationCausality({
    actorId: 'uid_1',
    deviceId: params.deviceId,
    sequence: params.sequence,
    createdAt: params.sequence,
    operationId: params.id,
    chunkIds: ['chunk_1'],
  });
  op.convergenceHash = createOperationConvergenceHash(op);
  return op;
}

function record(op: WriteChunkSnapshotOperation): WriteCollaborationOperationRecord {
  if (!op.causality) {
    throw new Error('operation requires causality');
  }
  return {
    schemaVersion: 1,
    projectId: op.projectId,
    ownerUid: 'uid_1',
    operationId: op.operationId,
    actorId: op.causality.actorId,
    deviceId: op.causality.deviceId,
    createdAt: op.createdAt,
    payloadBytes: JSON.stringify(op).length,
    operation: op,
    causality: op.causality,
    convergenceHash: op.convergenceHash,
  };
}

describe('write collaboration runtime', () => {
  it('rejects local echo operations during remote ingestion validation', () => {
    const local = operation({ id: 'op_local', deviceId: 'device_local', sequence: 1, text: 'Local' });

    expect(validateRemoteCollaborationOperation({
      record: record(local),
      projectId: 'project_1',
      localDeviceId: 'device_local',
    })).toBeNull();
  });

  it('ingests remote operations in deterministic replay order', () => {
    const first = operation({ id: 'op_a', deviceId: 'device_a', sequence: 1, text: 'Alpha' });
    const second = operation({ id: 'op_b', deviceId: 'device_b', sequence: 2, text: 'Beta' });

    const result = ingestRemoteCollaborationOperations({
      uid: 'uid_1',
      projectId: 'project_1',
      localDeviceId: 'device_local',
      records: [record(second), record(first)],
    });

    expect(result.rejectedOperationIds).toEqual([]);
    expect(result.acceptedOperations.map((entry) => entry.operationId)).toEqual(['op_a', 'op_b']);
    expect(result.appliedSnapshot?.titleEn).toBe('Novel');
    expect(result.latestRevision).toBe(3);
  });

  it('keeps remote partial snapshots virtualization-safe', () => {
    expect(shouldApplyRemoteSnapshot({
      snapshot: snapshot('Remote'),
      hasLocalEdits: false,
      mountedSectionIds: ['section_0001'],
    })).toBe(true);

    expect(shouldApplyRemoteSnapshot({
      snapshot: snapshot('Remote'),
      hasLocalEdits: true,
      mountedSectionIds: ['section_0001'],
    })).toBe(false);

    expect(shouldApplyRemoteSnapshot({
      snapshot: { ...snapshot('Remote'), mountedSectionIds: ['section_0002'] },
      hasLocalEdits: false,
      mountedSectionIds: ['section_0001'],
    })).toBe(false);
  });
});
