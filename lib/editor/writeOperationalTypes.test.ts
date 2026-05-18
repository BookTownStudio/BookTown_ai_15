import { describe, expect, it } from 'vitest';
import {
  createChunkSnapshotOperationId,
  createWriteOperationHash,
  toWriteProjectOperationAckInput,
  type WriteChunkSnapshotOperation,
} from './writeOperationalTypes.ts';
import { type EditorSnapshot } from './editorRuntimeTypes.ts';

function snapshot(text: string): EditorSnapshot {
  return {
    titleEn: 'Novel',
    titleAr: '',
    content: `<p>${text}</p>`,
    wordCount: 1,
    affectedChunkIds: ['chunk_2', 'chunk_1'],
    mountedSectionIds: ['section_0001'],
    contentDoc: {
      version: 1,
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: {
          btAnchorId: 'anchor_1',
          btChunkId: 'chunk_1',
          btSectionId: 'section_0001',
        },
        content: [{ type: 'text', text }],
      }],
    },
  };
}

describe('write operational types', () => {
  it('creates stable hashes independent of object key ordering', () => {
    expect(createWriteOperationHash({ b: 2, a: 1 })).toBe(createWriteOperationHash({ a: 1, b: 2 }));
  });

  it('creates deterministic operation IDs for identical chunk snapshot operations', () => {
    const first = createChunkSnapshotOperationId({
      uid: 'uid_1',
      projectId: 'project_1',
      expectedRevision: 4,
      snapshot: snapshot('Alpha'),
    });
    const second = createChunkSnapshotOperationId({
      uid: 'uid_1',
      projectId: 'project_1',
      expectedRevision: 4,
      snapshot: snapshot('Alpha'),
    });
    const changed = createChunkSnapshotOperationId({
      uid: 'uid_1',
      projectId: 'project_1',
      expectedRevision: 4,
      snapshot: snapshot('Beta'),
    });

    expect(first).toBe(second);
    expect(first).not.toBe(changed);
  });

  it('creates bounded acknowledgement input without manuscript payloads', () => {
    const operation: WriteChunkSnapshotOperation = {
      schemaVersion: 1,
      operationId: 'writeop_1',
      uid: 'uid_1',
      projectId: 'project_1',
      type: 'chunk_snapshot_save',
      status: 'applied',
      sequence: 7,
      createdAt: 100,
      updatedAt: 110,
      expectedRevision: 4,
      snapshot: snapshot('Alpha'),
      affectedChunkIds: ['chunk_1'],
      mountedSectionIds: ['section_0001'],
      causality: {
        schemaVersion: 1,
        actorId: 'uid_1',
        deviceId: 'device_1',
        sequence: 7,
        parents: [],
        vectorClock: { device_1: 7 },
        chunkIds: ['chunk_1'],
        baseRevision: 4,
        createdAt: 100,
      },
      convergenceHash: 'hash_1',
      conflictState: 'none',
      attempts: 0,
      appliedAt: 120,
      serverRevision: 5,
    };

    const ackInput = toWriteProjectOperationAckInput(operation);

    expect(ackInput.operationId).toBe(operation.operationId);
    expect(ackInput.causality?.chunkIds).toEqual(['chunk_1']);
    expect('snapshot' in ackInput).toBe(false);
  });

  it('rejects acknowledgement input without required convergence metadata', () => {
    const operation: WriteChunkSnapshotOperation = {
      schemaVersion: 1,
      operationId: 'writeop_2',
      uid: 'uid_1',
      projectId: 'project_1',
      type: 'chunk_snapshot_save',
      status: 'applied',
      sequence: 8,
      createdAt: 200,
      updatedAt: 210,
      snapshot: snapshot('Beta'),
      attempts: 0,
    };

    expect(() => toWriteProjectOperationAckInput(operation)).toThrow(
      'Write operation ack input requires causality and convergence metadata.'
    );
  });
});
