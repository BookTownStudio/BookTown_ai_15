import { describe, expect, it } from 'vitest';
import { toWriteContentDoc } from '../../../lib/editor/writeDocument.ts';
import {
  createChunkSnapshotOperationId,
  createWriteOperationHash,
  type WriteChunkSnapshotOperation,
} from '../../../lib/editor/writeOperationalTypes.ts';
import {
  normalizeEditorSnapshotForTransport,
  normalizeWriteOperationForTransport,
} from '../../../lib/editor/writeTransportSerialization.ts';

function nullPrototypeAttrs() {
  const attrs = Object.create(null) as Record<string, unknown>;
  attrs.lang = 'en';
  attrs.btAnchorId = 'anchor_1';
  attrs.btChunkId = 'chunk_1';
  attrs.btSectionId = 'section_1';
  return attrs;
}

describe('write transport serialization hygiene', () => {
  it('normalizes ProseMirror null-prototype attrs into callable-safe plain objects', () => {
    const contentDoc = toWriteContentDoc({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: nullPrototypeAttrs(),
          content: [{ type: 'text', text: 'Stable transport payload.' }],
        },
      ],
    }, 'Stable transport payload.');

    const attrs = contentDoc.content[0]?.attrs as Record<string, unknown>;
    expect(Object.getPrototypeOf(attrs)).toBe(Object.prototype);
    expect(typeof attrs.hasOwnProperty).toBe('function');
    expect(attrs.btAnchorId).toBe('anchor_1');
    expect(attrs.btChunkId).toBe('chunk_1');
    expect(attrs.btSectionId).toBe('section_1');
  });

  it('normalizes snapshots and operations without changing deterministic identity', () => {
    const snapshot = normalizeEditorSnapshotForTransport({
      titleEn: 'Title',
      titleAr: '',
      content: '<p>Stable transport payload.</p>',
      contentDoc: {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: nullPrototypeAttrs(),
            content: [{ type: 'text', text: 'Stable transport payload.' }],
          },
        ],
      },
      wordCount: 3,
      affectedChunkIds: ['chunk_1'],
      mountedSectionIds: ['section_1'],
    });
    const operation: WriteChunkSnapshotOperation = {
      schemaVersion: 1,
      operationId: createChunkSnapshotOperationId({
        uid: 'uid_1',
        projectId: 'project_1',
        expectedRevision: 7,
        snapshot,
      }),
      uid: 'uid_1',
      projectId: 'project_1',
      type: 'chunk_snapshot_save',
      status: 'pending',
      sequence: 1,
      createdAt: 10,
      updatedAt: 10,
      expectedRevision: 7,
      snapshot,
      affectedChunkIds: snapshot.affectedChunkIds,
      mountedSectionIds: snapshot.mountedSectionIds,
      causality: {
        schemaVersion: 1,
        actorId: 'uid_1',
        deviceId: 'device_1',
        sequence: 1,
        parents: [],
        vectorClock: { device_1: 1 },
        chunkIds: ['chunk_1'],
        baseRevision: 7,
        createdAt: 10,
      },
      attempts: 0,
    };

    const normalized = normalizeWriteOperationForTransport(operation);
    const attrs = normalized.snapshot.contentDoc?.content[0]?.attrs as Record<string, unknown>;

    expect(Object.getPrototypeOf(attrs)).toBe(Object.prototype);
    expect(attrs.btAnchorId).toBe('anchor_1');
    expect(createWriteOperationHash(operation)).toBe(createWriteOperationHash(normalized));
    expect(JSON.stringify(normalized)).toContain('btSectionId');
  });
});
