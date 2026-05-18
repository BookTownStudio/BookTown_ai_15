import { afterEach, describe, expect, it, vi } from 'vitest';
import { type WriteContentNode } from '../types/entities.ts';
import { createChunkedManuscriptDraft } from '../lib/editor/chunkedManuscript.ts';
import { type EditorSnapshot } from '../lib/editor/editorRuntimeTypes.ts';

const batchSet = vi.fn();
const batchDelete = vi.fn();
const batchCommit = vi.fn(async () => undefined);
const callableMock = vi.fn(async () => ({
  data: {
    success: true,
    data: {
      metadata: {
        version: 1,
        mode: 'chunked',
        activeSectionId: 'section_0001',
        latestRevision: 2,
        sectionCount: 2,
        chunkCount: 2,
        updatedAt: '2026-05-15T00:00:02.000Z',
      },
      projectPatch: {
        title: 'Novel',
        titleEn: 'Novel',
        titleAr: '',
        activeSectionId: 'section_0001',
        wordCount: 1,
        revision: 2,
        updatedAt: '2026-05-15T00:00:02.000Z',
        manuscriptStorage: {
          version: 1,
          mode: 'chunked',
          activeSectionId: 'section_0001',
          latestRevision: 2,
          sectionCount: 2,
          chunkCount: 2,
          updatedAt: '2026-05-15T00:00:02.000Z',
        },
      },
      revision: 2,
      updatedAt: '2026-05-15T00:00:02.000Z',
      mutationAck: {
        schemaVersion: 1,
        operationId: 'writeop_1',
        status: 'acknowledged',
        acknowledgedRevision: 2,
        checkpointId: 'chunk_checkpoint_1',
        acknowledgedAt: '2026-05-15T00:00:02.000Z',
        duplicate: false,
        chunkWriteCount: 1,
        sectionWriteCount: 1,
      },
    },
  },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...segments: unknown[]) => ({ kind: 'collection', segments })),
  deleteDoc: vi.fn(async () => undefined),
  doc: vi.fn((...segments: unknown[]) => ({ kind: 'doc', segments })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn((...args: unknown[]) => ({ kind: 'orderBy', args })),
  query: vi.fn((...args: unknown[]) => ({ kind: 'query', args })),
  writeBatch: vi.fn(() => ({
    set: batchSet,
    delete: batchDelete,
    commit: batchCommit,
  })),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => callableMock),
}));

vi.mock('../lib/firebase.ts', () => ({
  getFirebaseDb: vi.fn(() => ({ kind: 'db' })),
  getFirebaseFunctions: vi.fn(() => ({ kind: 'functions' })),
}));

function paragraph(text: string): WriteContentNode {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

function snapshot(nodes: WriteContentNode[], totalSectionCount?: number, totalChunkCount?: number): EditorSnapshot {
  return {
    titleEn: 'Novel',
    titleAr: '',
    content: '<p>Novel</p>',
    wordCount: nodes.length,
    contentDoc: {
      version: 1,
      type: 'doc',
      content: nodes,
    },
    isPartialManuscript: true,
    mountedSectionIds: ['section_0001'],
    activeSectionId: 'section_0001',
    totalSectionCount,
    totalChunkCount,
  };
}

describe('ManuscriptRepository bounded partial saves', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    batchSet.mockClear();
    batchDelete.mockClear();
    batchCommit.mockClear();
    callableMock.mockClear();
  });

  it('routes partial saves to the server-authoritative chunk mutation endpoint without client chunk writes', async () => {
    const { ManuscriptRepository } = await import('./manuscriptRepository.ts');
    const fullDraft = createChunkedManuscriptDraft({
      projectId: 'project_1',
      snapshot: snapshot([
        paragraph('First'),
        { type: 'horizontalRule' },
        paragraph('Second'),
      ]),
      revision: 1,
      source: 'autosave',
      now: '2026-05-15T00:00:01.000Z',
    });
    const partialSnapshot = snapshot([paragraph('First changed')], 2, fullDraft.chunks.length);

    const loadSections = vi.spyOn(ManuscriptRepository, 'loadSections').mockRejectedValue(
      new Error('global sections should not be loaded')
    );
    const loadChunks = vi.spyOn(ManuscriptRepository, 'loadChunks').mockRejectedValue(
      new Error('global chunks should not be loaded')
    );
    const loadSectionsByIds = vi.spyOn(ManuscriptRepository, 'loadSectionsByIds').mockResolvedValue([
      fullDraft.sections[0],
    ]);
    const loadChunksForSections = vi.spyOn(ManuscriptRepository, 'loadChunksForSections').mockResolvedValue([
      fullDraft.chunks[0],
    ]);

    const metadata = await ManuscriptRepository.saveSnapshot({
      uid: 'uid_1',
      projectId: 'project_1',
      snapshot: partialSnapshot,
      revision: 2,
      source: 'autosave',
      authority: 'partial',
      authoritativeSectionIds: ['section_0001'],
      affectedChunkIds: ['section_0001_chunk_0001'],
      operation: {
        schemaVersion: 1,
        operationId: 'writeop_1',
        type: 'chunk_snapshot_save',
        sequence: 1,
        createdAt: 100,
        updatedAt: 100,
        expectedRevision: 2,
        affectedChunkIds: ['section_0001_chunk_0001'],
        mountedSectionIds: ['section_0001'],
        causality: {
          schemaVersion: 1,
          actorId: 'uid_1',
          deviceId: 'device_1',
          sequence: 1,
          parents: [],
          vectorClock: { device_1: 1 },
          chunkIds: ['section_0001_chunk_0001'],
          baseRevision: 2,
          createdAt: 100,
        },
        convergenceHash: 'hash_1',
      },
    });

    expect(loadSections).not.toHaveBeenCalled();
    expect(loadChunks).not.toHaveBeenCalled();
    expect(loadSectionsByIds).not.toHaveBeenCalled();
    expect(loadChunksForSections).not.toHaveBeenCalled();
    expect(batchSet).not.toHaveBeenCalled();
    expect(batchDelete).not.toHaveBeenCalled();
    expect(batchCommit).not.toHaveBeenCalled();
    expect(callableMock).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project_1',
      revision: 2,
      source: 'autosave',
      authority: 'partial',
      metadata: {
        title: 'Novel',
        titleEn: 'Novel',
        titleAr: '',
      },
      authoritativeSectionIds: ['section_0001'],
      affectedChunkIds: ['section_0001_chunk_0001'],
      operation: expect.objectContaining({
        operationId: 'writeop_1',
      }),
    }));
    expect(metadata.sectionCount).toBe(2);
    expect(metadata.chunkCount).toBe(fullDraft.chunks.length);
    expect(metadata.latestSnapshotId).toBeUndefined();
  });

  it('blocks autosave chunk mutations before incomplete runtime payloads reach transport', async () => {
    const { ManuscriptRepository } = await import('./manuscriptRepository.ts');

    await expect(ManuscriptRepository.saveSnapshot({
      uid: 'uid_1',
      projectId: 'project_1',
      snapshot: snapshot([paragraph('First changed')], undefined, undefined),
      revision: 2,
      source: 'autosave',
      authority: 'partial',
      authoritativeSectionIds: ['section_0001'],
      affectedChunkIds: ['section_0001_chunk_0001'],
    })).rejects.toThrow('Partial chunk mutation requires hydrated manuscript runtime counts.');

    expect(callableMock).not.toHaveBeenCalled();
  });

  it('blocks autosave chunk mutations without distributed operation metadata', async () => {
    const { ManuscriptRepository } = await import('./manuscriptRepository.ts');

    await expect(ManuscriptRepository.saveSnapshot({
      uid: 'uid_1',
      projectId: 'project_1',
      snapshot: snapshot([paragraph('First changed')], 1, 1),
      revision: 2,
      source: 'autosave',
      authority: 'partial',
      authoritativeSectionIds: ['section_0001'],
      affectedChunkIds: ['section_0001_chunk_0001'],
    })).rejects.toThrow('Autosave chunk mutation requires a distributed operation.');

    expect(callableMock).not.toHaveBeenCalled();
  });
});
