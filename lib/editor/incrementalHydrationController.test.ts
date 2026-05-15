import { describe, expect, it } from 'vitest';
import {
  IncrementalHydrationController,
  type IncrementalHydrationRepository,
} from './incrementalHydrationController.ts';
import { ChunkRuntimeCache } from './chunkRuntimeCache.ts';
import {
  type ManuscriptChunkRecord,
  type ManuscriptSectionRecord,
} from './chunkedManuscript.ts';

function section(sectionId: string, order: number): ManuscriptSectionRecord {
  return {
    schemaVersion: 1,
    projectId: 'project_1',
    sectionId,
    order,
    title: `Section ${order + 1}`,
    kind: 'chapter',
    chunkCount: 1,
    nodeCount: 1,
    wordCount: 2,
    revision: 1,
    contentHash: sectionId,
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  };
}

function chunk(sectionId: string, order: number): ManuscriptChunkRecord {
  return {
    schemaVersion: 1,
    projectId: 'project_1',
    sectionId,
    chunkId: `${sectionId}_chunk_0001`,
    order: 0,
    nodeCount: 1,
    byteSize: 120,
    plainTextSize: 14,
    wordCount: 2,
    contentHash: `${sectionId}_hash`,
    revision: 1,
    contentDoc: {
      version: 1,
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: `Paragraph ${order + 1}` }],
        },
      ],
    },
    createdAt: '2026-05-15T00:00:00.000Z',
    updatedAt: '2026-05-15T00:00:00.000Z',
  };
}

describe('incremental manuscript hydration', () => {
  it('hydrates the active section window before expanding to the full manuscript', async () => {
    const sections = [section('section_0001', 0), section('section_0002', 1), section('section_0003', 2)];
    const chunks = sections.map((entry) => chunk(entry.sectionId, entry.order));
    const loadedSectionIds: string[] = [];
    const repository: IncrementalHydrationRepository = {
      async loadSections() {
        return sections;
      },
      async loadChunksForSections(_uid, _projectId, sectionIds) {
        loadedSectionIds.push(...sectionIds);
        return chunks.filter((entry) => sectionIds.includes(entry.sectionId));
      },
    };
    const controller = new IncrementalHydrationController(repository);

    const initial = await controller.hydrateInitialWindow({
      uid: 'uid_1',
      projectId: 'project_1',
      activeSectionId: 'section_0002',
      sectionRadius: 0,
    });

    expect(initial.loadedSectionIds).toEqual(['section_0002']);
    expect(initial.isComplete).toBe(false);
    expect(initial.contentDoc.content).toHaveLength(1);

    const complete = await controller.hydrateCompleteManuscript({
      uid: 'uid_1',
      projectId: 'project_1',
      activeSectionId: initial.activeSectionId,
      seed: initial,
    });

    expect(complete.isComplete).toBe(true);
    expect(complete.loadedSectionIds).toEqual(['section_0001', 'section_0002', 'section_0003']);
    expect(complete.contentDoc.content).toHaveLength(3);
    expect(loadedSectionIds).toEqual(['section_0002', 'section_0001', 'section_0003']);
  });

  it('evicts least-recently-used chunks when runtime cache bounds are exceeded', () => {
    const cache = new ChunkRuntimeCache({ maxChunks: 1 });

    cache.putChunks([chunk('section_0001', 0)]);
    expect(cache.getStats().chunkCount).toBe(1);

    cache.putChunks([chunk('section_0002', 1)]);

    expect(cache.getStats().chunkCount).toBe(1);
    expect(cache.getStats().evictions).toBe(1);
    expect(cache.getChunk('section_0001', 'section_0001_chunk_0001')).toBeNull();
    expect(cache.getChunk('section_0002', 'section_0002_chunk_0001')?.sectionId).toBe('section_0002');
  });

  it('hydrates an adjacent runtime window for dynamic virtualization shifts', async () => {
    const sections = [section('section_0001', 0), section('section_0002', 1), section('section_0003', 2)];
    const chunks = sections.map((entry) => chunk(entry.sectionId, entry.order));
    const repository: IncrementalHydrationRepository = {
      async loadSections() {
        return sections;
      },
      async loadChunksForSections(_uid, _projectId, sectionIds) {
        return chunks.filter((entry) => sectionIds.includes(entry.sectionId));
      },
    };
    const controller = new IncrementalHydrationController(repository);

    const shifted = await controller.hydrateShiftedWindow({
      uid: 'uid_1',
      projectId: 'project_1',
      activeSectionId: 'section_0001',
      direction: 'next',
      sectionRadius: 0,
    });

    expect(shifted?.activeSectionId).toBe('section_0002');
    expect(shifted?.loadedSectionIds).toEqual(['section_0002']);
    expect(shifted?.contentDoc.content).toHaveLength(1);
  });
});
