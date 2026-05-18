import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManuscriptRepository } from '../../services/manuscriptRepository.ts';
import type { Project } from '../../types/entities.ts';
import {
  classifyManuscriptLifecycle,
  useChunkedManuscriptController,
} from './useChunkedManuscriptController.ts';
import type { EditorSnapshot } from './editorRuntimeTypes.ts';
import type { ManuscriptChunkRecord, ManuscriptSectionRecord } from './chunkedManuscript.ts';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project_1',
    titleEn: 'Draft',
    titleAr: '',
    workType: 'book',
    typeEn: 'Draft',
    typeAr: 'مسودة',
    status: 'Draft',
    wordCount: 2,
    updatedAt: '2026-05-18T00:00:00.000Z',
    createdAt: '2026-05-18T00:00:00.000Z',
    content: '<p>Draft</p>',
    contentDoc: {
      version: 1,
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft' }] }],
    },
    isPublished: false,
    revision: 1,
    ...overrides,
  };
}

const snapshot: EditorSnapshot = {
  titleEn: 'Draft',
  titleAr: '',
  content: '<p>Draft</p>',
  wordCount: 2,
  contentDoc: {
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft' }] }],
  },
};

function section(sectionId: string, order: number): ManuscriptSectionRecord {
  return {
    schemaVersion: 1,
    projectId: 'project_1',
    sectionId,
    order,
    title: `Chapter ${order + 1}`,
    kind: 'chapter',
    chunkCount: 1,
    nodeCount: 2,
    wordCount: 4,
    revision: 2,
    contentHash: `${sectionId}_hash`,
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
  };
}

function chunk(sectionId: string, order: number): ManuscriptChunkRecord {
  return {
    schemaVersion: 1,
    projectId: 'project_1',
    sectionId,
    chunkId: `${sectionId}_chunk_0001`,
    order: 0,
    nodeCount: 2,
    byteSize: 240,
    plainTextSize: 24,
    wordCount: 4,
    contentHash: `${sectionId}_chunk_hash`,
    revision: 2,
    contentDoc: {
      version: 1,
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2, btSectionId: sectionId, btChunkId: `${sectionId}_chunk_0001` }, content: [{ type: 'text', text: `Chapter ${order + 1}` }] },
        { type: 'paragraph', attrs: { btSectionId: sectionId, btChunkId: `${sectionId}_chunk_0001` }, content: [{ type: 'text', text: `Body ${order + 1}` }] },
      ],
    },
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
  };
}

describe('useChunkedManuscriptController lifecycle classification', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies brand new chunk-native projects without chunk rows as NEW_PROJECT', () => {
    expect(classifyManuscriptLifecycle(project({
      manuscriptStorage: {
        version: 1,
        mode: 'chunked',
        latestRevision: 1,
        sectionCount: 0,
        chunkCount: 0,
      },
    }), {
      totalSectionCount: 0,
      chunkCount: 0,
    })).toBe('NEW_PROJECT');
  });

  it('classifies missing chunk storage without chunk-native metadata as LEGACY_MIGRATION_REQUIRED', () => {
    expect(classifyManuscriptLifecycle(project(), {
      totalSectionCount: 0,
      chunkCount: 0,
    })).toBe('LEGACY_MIGRATION_REQUIRED');
  });

  it('classifies hydrated chunk rows as CHUNK_NATIVE_READY', () => {
    expect(classifyManuscriptLifecycle(project(), {
      totalSectionCount: 1,
      chunkCount: 1,
    })).toBe('CHUNK_NATIVE_READY');
  });

  it('does not emit migration for a brand new project typing immediately after creation', async () => {
    vi.spyOn(ManuscriptRepository, 'loadSections').mockResolvedValue([]);
    vi.spyOn(ManuscriptRepository, 'loadChunksForSections').mockResolvedValue([]);
    const saveSnapshot = vi.spyOn(ManuscriptRepository, 'saveSnapshot').mockResolvedValue({
      version: 1,
      mode: 'chunked',
      latestRevision: 1,
      sectionCount: 1,
      chunkCount: 1,
    });

    const { result } = renderHook(() => useChunkedManuscriptController({
      uid: 'uid_1',
      projectId: 'project_1',
    }));

    let loaded: Awaited<ReturnType<typeof result.current.loadProjectSnapshot>> | null = null;
    await act(async () => {
      loaded = await result.current.loadProjectSnapshot(project({
        manuscriptStorage: {
          version: 1,
          mode: 'chunked',
          latestRevision: 1,
          sectionCount: 0,
          chunkCount: 0,
        },
      }));
    });

    expect(loaded?.source).toBe('new');

    await act(async () => {
      await result.current.saveSnapshot(snapshot, 1);
    });

    expect(saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project_1',
      revision: 1,
      source: 'autosave',
      authority: 'complete',
    }));
    expect(saveSnapshot).not.toHaveBeenCalledWith(expect.objectContaining({
      source: 'migration',
    }));
  });

  it('preserves legacy migration and returns to autosave after migration', async () => {
    vi.spyOn(ManuscriptRepository, 'loadSections').mockResolvedValue([]);
    vi.spyOn(ManuscriptRepository, 'loadChunksForSections').mockResolvedValue([]);
    const saveSnapshot = vi.spyOn(ManuscriptRepository, 'saveSnapshot').mockResolvedValue({
      version: 1,
      mode: 'chunked',
      latestRevision: 1,
      sectionCount: 1,
      chunkCount: 1,
    });

    const { result } = renderHook(() => useChunkedManuscriptController({
      uid: 'uid_1',
      projectId: 'project_1',
    }));

    let loaded: Awaited<ReturnType<typeof result.current.loadProjectSnapshot>> | null = null;
    await act(async () => {
      loaded = await result.current.loadProjectSnapshot(project());
    });
    expect(loaded?.source).toBe('legacy');

    await act(async () => {
      await result.current.migrateLegacySnapshot(snapshot, 1);
    });

    expect(saveSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      source: 'migration',
      revision: 1,
    }));

    await act(async () => {
      await result.current.saveSnapshot(snapshot, 2);
    });

    expect(saveSnapshot).toHaveBeenLastCalledWith(expect.objectContaining({
      source: 'autosave',
      revision: 2,
    }));
  });

  it('hydrates all persisted chapters on reopen for bounded manuscripts', async () => {
    const sections = [section('section_0001', 0), section('section_0002', 1), section('section_0003', 2)];
    const chunks = sections.map((entry) => chunk(entry.sectionId, entry.order));
    const loadedSectionIds: string[][] = [];
    vi.spyOn(ManuscriptRepository, 'loadSections').mockResolvedValue(sections);
    vi.spyOn(ManuscriptRepository, 'loadChunksForSections').mockImplementation(async (_uid, _projectId, sectionIds) => {
      loadedSectionIds.push(sectionIds);
      return chunks.filter((entry) => sectionIds.includes(entry.sectionId));
    });

    const { result } = renderHook(() => useChunkedManuscriptController({
      uid: 'uid_1',
      projectId: 'project_1',
    }));

    let loaded: Awaited<ReturnType<typeof result.current.loadProjectSnapshot>> | null = null;
    await act(async () => {
      loaded = await result.current.loadProjectSnapshot(project({
        manuscriptStorage: {
          version: 1,
          mode: 'chunked',
          activeSectionId: 'section_0001',
          latestRevision: 3,
          sectionCount: 3,
          chunkCount: 3,
        },
        activeSectionId: 'section_0001',
      }));
    });

    expect(loaded?.source).toBe('chunked');
    expect(loaded?.snapshot.isPartialManuscript).toBe(false);
    expect(loaded?.snapshot.contentDoc?.content).toHaveLength(6);
    expect(loaded?.snapshot.contentDoc?.content.filter((node) => node.type === 'heading')).toHaveLength(3);
    expect(loadedSectionIds).toEqual([
      ['section_0001', 'section_0002'],
      ['section_0003'],
    ]);
  });
});
