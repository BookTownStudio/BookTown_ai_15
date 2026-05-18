import React, { createRef } from 'react';
import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '../react-query.ts';
import { queryKeys } from '../queryKeys.ts';
import { useEditorPersistenceController } from './useEditorPersistenceController.ts';
import type { EditorSnapshot } from './editorRuntimeTypes.ts';
import type { WriteProjectOperationAckInput } from './writeOperationalTypes.ts';
import { writeOperationalSyncEngine } from './writeOperationalSyncEngine.ts';
import type { Project } from '../../types/entities.ts';

const snapshot: EditorSnapshot = {
  titleEn: 'Draft',
  titleAr: '',
  content: '<p>Draft</p>',
  wordCount: 1,
  contentDoc: {
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft' }] }],
  },
};

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

function wrapperWithClient(client: QueryClient) {
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useEditorPersistenceController chunk-native persistence routing', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves chunk-native manuscript autosave through the chunk callable without updateWriteProject', async () => {
    const autosaveAsync = vi.fn();
    vi.spyOn(writeOperationalSyncEngine, 'replayPendingOperations').mockResolvedValue({
      appliedCount: 0,
      failedCount: 0,
    });
    vi.spyOn(writeOperationalSyncEngine, 'createCommittedChunkSnapshotOperation').mockResolvedValue({
      schemaVersion: 1,
      operationId: 'writeop_1',
      uid: 'uid_1',
      projectId: 'project_1',
      type: 'chunk_snapshot_save',
      status: 'applied',
      sequence: 1,
      createdAt: 100,
      updatedAt: 100,
      expectedRevision: 1,
      snapshot,
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
        baseRevision: 1,
        createdAt: 100,
      },
      convergenceHash: 'hash_1',
      attempts: 0,
    });
    const saveManuscriptSnapshot = vi.fn(async (
      _snapshot: EditorSnapshot,
      _revision: number,
      operation?: WriteProjectOperationAckInput
    ) => ({
      activeSectionId: 'section_0001',
      manuscriptStorage: {
        version: 1 as const,
        mode: 'chunked' as const,
        latestRevision: 2,
        sectionCount: 1,
        chunkCount: 1,
      },
      revision: 2,
      updatedAt: '2026-05-18T00:00:00.000Z',
      operationId: operation?.operationId,
    }));

    const hasHydratedRef = createRef<boolean>() as React.MutableRefObject<boolean>;
    const hasLocalEditsRef = createRef<boolean>() as React.MutableRefObject<boolean>;
    const presentRef = createRef<EditorSnapshot>() as React.MutableRefObject<EditorSnapshot>;
    const lastConfirmedSnapshotRef = createRef<EditorSnapshot>() as React.MutableRefObject<EditorSnapshot>;
    const currentRevisionRef = createRef<number | null>() as React.MutableRefObject<number | null>;
    const lastPersistedCursorRef = createRef<null>() as React.MutableRefObject<null>;
    const lastLocalEditAtRef = createRef<number | null>() as React.MutableRefObject<number | null>;

    hasHydratedRef.current = true;
    hasLocalEditsRef.current = true;
    presentRef.current = snapshot;
    lastConfirmedSnapshotRef.current = { ...snapshot, titleEn: 'Previous' };
    currentRevisionRef.current = 1;
    lastPersistedCursorRef.current = null;
    lastLocalEditAtRef.current = null;

    const { result } = renderHook(() => useEditorPersistenceController({
      uid: 'uid_1',
      projectId: 'project_1',
      lang: 'en',
      isOffline: false,
      authorityStatus: 'persistent',
      editor: {
        state: {
          selection: { empty: true, from: 1 },
          doc: {
            descendants: () => undefined,
          },
        },
      } as never,
      present: snapshot,
      autosaveAsync,
      manuscriptStorageMode: 'chunked',
      saveManuscriptSnapshot,
      isManuscriptMigrationInProgress: () => false,
      persistLocalDraft: vi.fn(),
      clearLocalDraft: vi.fn(),
      onLocalOperationCommitted: vi.fn(),
      showToast: vi.fn(),
      hasHydratedRef,
      hasLocalEditsRef,
      presentRef,
      lastConfirmedSnapshotRef,
      currentRevisionRef,
      lastPersistedCursorRef,
      lastLocalEditAtRef,
    }), { wrapper });

    await act(async () => {
      await result.current.persistSnapshot(snapshot, { expectedRevision: 1 });
    });

    expect(autosaveAsync).not.toHaveBeenCalled();
    expect(saveManuscriptSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ titleEn: 'Draft' }),
      1,
      expect.objectContaining({
        type: 'chunk_snapshot_save',
        causality: expect.any(Object),
        convergenceHash: expect.any(String),
      })
    );
    expect(currentRevisionRef.current).toBe(2);
  });

  it('coalesces parallel chunk-native saves and sends the next mutation with the returned revision', async () => {
    const autosaveAsync = vi.fn();
    vi.spyOn(writeOperationalSyncEngine, 'replayPendingOperations').mockResolvedValue({
      appliedCount: 0,
      failedCount: 0,
    });
    vi.spyOn(writeOperationalSyncEngine, 'createCommittedChunkSnapshotOperation').mockImplementation(async (params) => ({
      schemaVersion: 1,
      operationId: `writeop_${params.expectedRevision ?? 1}`,
      uid: 'uid_1',
      projectId: 'project_1',
      type: 'chunk_snapshot_save',
      status: 'applied',
      sequence: params.expectedRevision ?? 1,
      createdAt: 100,
      updatedAt: 100,
      expectedRevision: params.expectedRevision,
      snapshot,
      affectedChunkIds: ['section_0001_chunk_0001'],
      mountedSectionIds: ['section_0001'],
      causality: {
        schemaVersion: 1,
        actorId: 'uid_1',
        deviceId: 'device_1',
        sequence: params.expectedRevision ?? 1,
        parents: [],
        vectorClock: { device_1: params.expectedRevision ?? 1 },
        chunkIds: ['section_0001_chunk_0001'],
        baseRevision: params.expectedRevision,
        createdAt: 100,
      },
      convergenceHash: `hash_${params.expectedRevision ?? 1}`,
      attempts: 0,
    }));

    const resolvers: Array<(value: {
      revision: number;
      updatedAt: string;
    }) => void> = [];
    const saveManuscriptSnapshot = vi.fn(() => new Promise<{
      revision: number;
      updatedAt: string;
    }>((resolve) => {
      resolvers.push(resolve);
    }));

    const hasHydratedRef = createRef<boolean>() as React.MutableRefObject<boolean>;
    const hasLocalEditsRef = createRef<boolean>() as React.MutableRefObject<boolean>;
    const presentRef = createRef<EditorSnapshot>() as React.MutableRefObject<EditorSnapshot>;
    const lastConfirmedSnapshotRef = createRef<EditorSnapshot>() as React.MutableRefObject<EditorSnapshot>;
    const currentRevisionRef = createRef<number | null>() as React.MutableRefObject<number | null>;
    const lastPersistedCursorRef = createRef<null>() as React.MutableRefObject<null>;
    const lastLocalEditAtRef = createRef<number | null>() as React.MutableRefObject<number | null>;

    hasHydratedRef.current = true;
    hasLocalEditsRef.current = true;
    presentRef.current = snapshot;
    lastConfirmedSnapshotRef.current = { ...snapshot, titleEn: 'Previous' };
    currentRevisionRef.current = 1;
    lastPersistedCursorRef.current = null;
    lastLocalEditAtRef.current = null;

    const { result } = renderHook(() => useEditorPersistenceController({
      uid: 'uid_1',
      projectId: 'project_1',
      lang: 'en',
      isOffline: false,
      authorityStatus: 'persistent',
      editor: {
        state: {
          selection: { empty: true, from: 1 },
          doc: { descendants: () => undefined },
        },
      } as never,
      present: snapshot,
      autosaveAsync,
      manuscriptStorageMode: 'chunked',
      saveManuscriptSnapshot,
      isManuscriptMigrationInProgress: () => false,
      persistLocalDraft: vi.fn(),
      clearLocalDraft: vi.fn(),
      onLocalOperationCommitted: vi.fn(),
      showToast: vi.fn(),
      hasHydratedRef,
      hasLocalEditsRef,
      presentRef,
      lastConfirmedSnapshotRef,
      currentRevisionRef,
      lastPersistedCursorRef,
      lastLocalEditAtRef,
    }), { wrapper });

    let firstSave!: Promise<boolean>;
    let secondSave!: Promise<boolean>;
    await act(async () => {
      firstSave = result.current.persistSnapshot(snapshot, { expectedRevision: 1 });
      secondSave = result.current.persistSnapshot({ ...snapshot, titleEn: 'Draft 2' }, { expectedRevision: 1 });
      await Promise.resolve();
    });

    expect(saveManuscriptSnapshot).toHaveBeenCalledTimes(1);
    expect(saveManuscriptSnapshot.mock.calls[0][1]).toBe(1);

    await act(async () => {
      resolvers[0]({ revision: 2, updatedAt: '2026-05-18T00:00:00.000Z' });
      await Promise.resolve();
    });

    expect(saveManuscriptSnapshot).toHaveBeenCalledTimes(2);
    expect(saveManuscriptSnapshot.mock.calls[1][1]).toBe(2);

    await act(async () => {
      resolvers[1]({ revision: 3, updatedAt: '2026-05-18T00:00:01.000Z' });
      await Promise.all([firstSave, secondSave]);
    });

    expect(autosaveAsync).not.toHaveBeenCalled();
    expect(currentRevisionRef.current).toBe(3);
  });

  it('patches project caches from the authoritative chunk mutation response', async () => {
    const queryClient = new QueryClient();
    const staleProject = {
      id: 'project_1',
      title: 'Old',
      titleEn: 'Old',
      titleAr: '',
      revision: 1,
      updatedAt: '2026-05-18T00:00:00.000Z',
      wordCount: 0,
    } as Project;
    queryClient.setQueryData(queryKeys.user.project('uid_1', 'project_1') as unknown as any[], staleProject);
    queryClient.setQueryData(queryKeys.user.projects('uid_1') as unknown as any[], [staleProject]);

    vi.spyOn(writeOperationalSyncEngine, 'replayPendingOperations').mockResolvedValue({
      appliedCount: 0,
      failedCount: 0,
    });
    vi.spyOn(writeOperationalSyncEngine, 'createCommittedChunkSnapshotOperation').mockResolvedValue({
      schemaVersion: 1,
      operationId: 'writeop_cache',
      uid: 'uid_1',
      projectId: 'project_1',
      type: 'chunk_snapshot_save',
      status: 'applied',
      sequence: 1,
      createdAt: 100,
      updatedAt: 100,
      expectedRevision: 1,
      snapshot,
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
        baseRevision: 1,
        createdAt: 100,
      },
      convergenceHash: 'hash_cache',
      attempts: 0,
    });
    const saveManuscriptSnapshot = vi.fn(async () => ({
      title: 'Draft',
      titleEn: 'Draft',
      titleAr: '',
      activeSectionId: 'section_0001',
      manuscriptStorage: {
        version: 1 as const,
        mode: 'chunked' as const,
        activeSectionId: 'section_0001',
        latestRevision: 2,
        sectionCount: 1,
        chunkCount: 1,
      },
      revision: 2,
      updatedAt: '2026-05-18T00:00:02.000Z',
      wordCount: 1,
    }));

    const hasHydratedRef = createRef<boolean>() as React.MutableRefObject<boolean>;
    const hasLocalEditsRef = createRef<boolean>() as React.MutableRefObject<boolean>;
    const presentRef = createRef<EditorSnapshot>() as React.MutableRefObject<EditorSnapshot>;
    const lastConfirmedSnapshotRef = createRef<EditorSnapshot>() as React.MutableRefObject<EditorSnapshot>;
    const currentRevisionRef = createRef<number | null>() as React.MutableRefObject<number | null>;
    const lastPersistedCursorRef = createRef<null>() as React.MutableRefObject<null>;
    const lastLocalEditAtRef = createRef<number | null>() as React.MutableRefObject<number | null>;

    hasHydratedRef.current = true;
    hasLocalEditsRef.current = true;
    presentRef.current = snapshot;
    lastConfirmedSnapshotRef.current = { ...snapshot, titleEn: 'Previous' };
    currentRevisionRef.current = 1;
    lastPersistedCursorRef.current = null;
    lastLocalEditAtRef.current = null;

    const { result } = renderHook(() => useEditorPersistenceController({
      uid: 'uid_1',
      projectId: 'project_1',
      lang: 'en',
      isOffline: false,
      authorityStatus: 'persistent',
      editor: {
        state: {
          selection: { empty: true, from: 1 },
          doc: { descendants: () => undefined },
        },
      } as never,
      present: snapshot,
      autosaveAsync: vi.fn(),
      manuscriptStorageMode: 'chunked',
      saveManuscriptSnapshot,
      isManuscriptMigrationInProgress: () => false,
      persistLocalDraft: vi.fn(),
      clearLocalDraft: vi.fn(),
      onLocalOperationCommitted: vi.fn(),
      showToast: vi.fn(),
      hasHydratedRef,
      hasLocalEditsRef,
      presentRef,
      lastConfirmedSnapshotRef,
      currentRevisionRef,
      lastPersistedCursorRef,
      lastLocalEditAtRef,
    }), { wrapper: wrapperWithClient(queryClient) });

    await act(async () => {
      await result.current.persistSnapshot(snapshot, { expectedRevision: 1 });
    });

    expect(queryClient.getQueryData<Project>(queryKeys.user.project('uid_1', 'project_1') as unknown as any[])).toMatchObject({
      title: 'Draft',
      titleEn: 'Draft',
      revision: 2,
      wordCount: 1,
      activeSectionId: 'section_0001',
    });
    expect(queryClient.getQueryData<Project[]>(queryKeys.user.projects('uid_1') as unknown as any[])?.[0]).toMatchObject({
      title: 'Draft',
      titleEn: 'Draft',
      revision: 2,
      wordCount: 1,
      activeSectionId: 'section_0001',
    });
  });

  it('marks the live editor snapshot clean after a successful normalized chunk save', async () => {
    const rawEditorSnapshot: EditorSnapshot = {
      ...snapshot,
      titleEn: 'Renamed',
      contentDoc: {
        version: 1,
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: {
              lang: 'en',
              dir: 'ltr',
              btAnchorId: 'anc_1',
              btSectionId: null,
              btChunkId: null,
            },
            content: [{ type: 'text', text: 'Renamed' }],
          },
        ],
      },
    };
    const autosaveAsync = vi.fn();
    vi.spyOn(writeOperationalSyncEngine, 'replayPendingOperations').mockResolvedValue({
      appliedCount: 0,
      failedCount: 0,
    });
    vi.spyOn(writeOperationalSyncEngine, 'createCommittedChunkSnapshotOperation').mockResolvedValue({
      schemaVersion: 1,
      operationId: 'writeop_dirty',
      uid: 'uid_1',
      projectId: 'project_1',
      type: 'chunk_snapshot_save',
      status: 'applied',
      sequence: 1,
      createdAt: 100,
      updatedAt: 100,
      expectedRevision: 1,
      snapshot: rawEditorSnapshot,
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
        baseRevision: 1,
        createdAt: 100,
      },
      convergenceHash: 'hash_dirty',
      attempts: 0,
    });
    const saveManuscriptSnapshot = vi.fn(async () => ({
      title: 'Renamed',
      titleEn: 'Renamed',
      titleAr: '',
      activeSectionId: 'section_0001',
      manuscriptStorage: {
        version: 1 as const,
        mode: 'chunked' as const,
        activeSectionId: 'section_0001',
        latestRevision: 2,
        sectionCount: 1,
        chunkCount: 1,
      },
      revision: 2,
      updatedAt: '2026-05-18T00:00:02.000Z',
      wordCount: 1,
    }));

    const hasHydratedRef = createRef<boolean>() as React.MutableRefObject<boolean>;
    const hasLocalEditsRef = createRef<boolean>() as React.MutableRefObject<boolean>;
    const presentRef = createRef<EditorSnapshot>() as React.MutableRefObject<EditorSnapshot>;
    const lastConfirmedSnapshotRef = createRef<EditorSnapshot>() as React.MutableRefObject<EditorSnapshot>;
    const currentRevisionRef = createRef<number | null>() as React.MutableRefObject<number | null>;
    const lastPersistedCursorRef = createRef<null>() as React.MutableRefObject<null>;
    const lastLocalEditAtRef = createRef<number | null>() as React.MutableRefObject<number | null>;

    hasHydratedRef.current = true;
    hasLocalEditsRef.current = true;
    presentRef.current = rawEditorSnapshot;
    lastConfirmedSnapshotRef.current = { ...rawEditorSnapshot, titleEn: 'Old' };
    currentRevisionRef.current = 1;
    lastPersistedCursorRef.current = null;
    lastLocalEditAtRef.current = null;

    const { result } = renderHook(() => useEditorPersistenceController({
      uid: 'uid_1',
      projectId: 'project_1',
      lang: 'en',
      isOffline: false,
      authorityStatus: 'persistent',
      editor: {
        state: {
          selection: { empty: true, from: 1 },
          doc: { descendants: () => undefined },
        },
      } as never,
      present: rawEditorSnapshot,
      autosaveAsync,
      manuscriptStorageMode: 'chunked',
      saveManuscriptSnapshot,
      isManuscriptMigrationInProgress: () => false,
      persistLocalDraft: vi.fn(),
      clearLocalDraft: vi.fn(),
      onLocalOperationCommitted: vi.fn(),
      showToast: vi.fn(),
      hasHydratedRef,
      hasLocalEditsRef,
      presentRef,
      lastConfirmedSnapshotRef,
      currentRevisionRef,
      lastPersistedCursorRef,
      lastLocalEditAtRef,
    }), { wrapper });

    await act(async () => {
      await result.current.persistSnapshot(rawEditorSnapshot, { expectedRevision: 1 });
    });

    expect(autosaveAsync).not.toHaveBeenCalled();
    expect(saveManuscriptSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        contentDoc: expect.objectContaining({
          content: [
            expect.objectContaining({
              attrs: expect.not.objectContaining({
                btSectionId: null,
                btChunkId: null,
              }),
            }),
          ],
        }),
      }),
      1,
      expect.any(Object)
    );
    expect(lastConfirmedSnapshotRef.current).toBe(rawEditorSnapshot);
    expect(result.current.indicator).toBe('saved');
  });
});
