import { describe, expect, it } from 'vitest';
import { type EditorSnapshot } from './editorRuntimeTypes.ts';
import {
  arbitrateChunkConflicts,
  compareVectorClocks,
  createOperationCausality,
  planDistributedOperationReplay,
} from './writeConvergenceSemantics.ts';
import { type WriteChunkSnapshotOperation } from './writeOperationalTypes.ts';

function snapshot(text: string, chunkIds: string[]): EditorSnapshot {
  return {
    titleEn: 'Novel',
    titleAr: '',
    content: `<p>${text}</p>`,
    wordCount: 1,
    affectedChunkIds: chunkIds,
    mountedSectionIds: ['section_0001'],
    contentDoc: {
      version: 1,
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: {
          btAnchorId: `anchor_${text}`,
          btChunkId: chunkIds[0],
          btSectionId: 'section_0001',
        },
        content: [{ type: 'text', text }],
      }],
    },
  };
}

function operation(params: {
  id: string;
  sequence: number;
  createdAt?: number;
  deviceId?: string;
  vectorClock?: Record<string, number>;
  chunkIds?: string[];
  parents?: WriteChunkSnapshotOperation[];
}): WriteChunkSnapshotOperation {
  const chunkIds = params.chunkIds ?? ['chunk_1'];
  const base: WriteChunkSnapshotOperation = {
    schemaVersion: 1,
    operationId: params.id,
    uid: 'uid_1',
    projectId: 'project_1',
    type: 'chunk_snapshot_save',
    status: 'pending',
    sequence: params.sequence,
    createdAt: params.createdAt ?? params.sequence,
    updatedAt: params.createdAt ?? params.sequence,
    expectedRevision: 1,
    snapshot: snapshot(params.id, chunkIds),
    affectedChunkIds: chunkIds,
    mountedSectionIds: ['section_0001'],
    attempts: 0,
  };
  base.causality = {
    ...createOperationCausality({
      actorId: 'uid_1',
      deviceId: params.deviceId ?? 'device_a',
      sequence: params.sequence,
      createdAt: base.createdAt,
      operationId: params.id,
      chunkIds,
      baseRevision: 1,
      parents: params.parents,
    }),
    vectorClock: params.vectorClock ?? { [params.deviceId ?? 'device_a']: params.sequence },
  };
  return base;
}

describe('write convergence semantics', () => {
  it('compares operation vector clocks deterministically', () => {
    expect(compareVectorClocks({ a: 1 }, { a: 1 })).toBe('equal');
    expect(compareVectorClocks({ a: 1 }, { a: 2 })).toBe('before');
    expect(compareVectorClocks({ a: 3 }, { a: 2 })).toBe('after');
    expect(compareVectorClocks({ a: 2 }, { b: 1 })).toBe('concurrent');
  });

  it('orders child operations after causal parents regardless of input order', () => {
    const parent = operation({ id: 'op_parent', sequence: 1, vectorClock: { device_a: 1 } });
    const child = operation({
      id: 'op_child',
      sequence: 2,
      vectorClock: { device_a: 2 },
      parents: [parent],
    });

    const plan = planDistributedOperationReplay({
      uid: 'uid_1',
      projectId: 'project_1',
      operations: [child, parent],
      now: 1_000,
    });

    expect(plan.replayableOperations.map((entry) => entry.operationId)).toEqual([
      'op_parent',
      'op_child',
    ]);
    expect(plan.graph.edgeCount).toBe(1);
  });

  it('detects concurrent chunk conflicts without dropping either operation', () => {
    const first = operation({
      id: 'op_a',
      sequence: 1,
      deviceId: 'device_a',
      vectorClock: { device_a: 1 },
      chunkIds: ['chunk_1'],
    });
    const second = operation({
      id: 'op_b',
      sequence: 2,
      deviceId: 'device_b',
      vectorClock: { device_b: 1 },
      chunkIds: ['chunk_1'],
    });

    const conflicts = arbitrateChunkConflicts([second, first]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].chunkId).toBe('chunk_1');
    expect(conflicts[0].operationIds).toEqual(['op_a', 'op_b']);
    expect(conflicts[0].winnerOperationId).toBe('op_b');
  });

  it('filters already checkpointed operations from replay plans', () => {
    const first = operation({ id: 'op_a', sequence: 1 });
    const second = operation({ id: 'op_b', sequence: 2 });

    const plan = planDistributedOperationReplay({
      uid: 'uid_1',
      projectId: 'project_1',
      operations: [first, second],
      appliedOperationIds: ['op_a'],
      now: 1_000,
    });

    expect(plan.duplicateOperationIds).toEqual(['op_a']);
    expect(plan.replayableOperations.map((entry) => entry.operationId)).toEqual(['op_b']);
  });
});
