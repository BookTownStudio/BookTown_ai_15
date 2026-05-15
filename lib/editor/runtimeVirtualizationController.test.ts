import { describe, expect, it } from 'vitest';
import { createVirtualizedEditorSnapshot } from './runtimeVirtualizationController.ts';
import { type HydrationWindow } from './incrementalHydrationController.ts';
import { type Project } from '../../types/entities.ts';

describe('runtime virtualization controller', () => {
  it('marks incomplete hydration windows as partial mounted editor snapshots', () => {
    const project = {
      id: 'project_1',
      titleEn: 'Novel',
      titleAr: '',
      content: '<p>Novel</p>',
      wordCount: 1200,
    } as Project;
    const window = {
      activeSectionId: 'section_0002',
      sections: [],
      loadedSectionIds: ['section_0002'],
      chunks: [{
        schemaVersion: 1,
        projectId: 'project_1',
        sectionId: 'section_0002',
        chunkId: 'section_0002_chunk_0001',
        order: 0,
        nodeCount: 1,
        byteSize: 100,
        plainTextSize: 10,
        wordCount: 4,
        contentHash: 'hash',
        revision: 1,
        contentDoc: {
          version: 1,
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mounted only' }] }],
        },
        createdAt: '2026-05-15T00:00:00.000Z',
        updatedAt: '2026-05-15T00:00:00.000Z',
      }],
      isComplete: false,
      totalSectionCount: 8,
      totalChunkCount: 20,
      contentDoc: {
        version: 1,
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mounted only' }] }],
      },
      cacheStats: {
        chunkCount: 1,
        loadedSectionCount: 1,
        loadedSectionIds: ['section_0002'],
        totalByteSize: 100,
        totalNodeCount: 1,
        hits: 1,
        misses: 0,
        evictions: 0,
      },
    } satisfies HydrationWindow;

    const result = createVirtualizedEditorSnapshot(project, window);

    expect(result.isPartial).toBe(true);
    expect(result.snapshot.isPartialManuscript).toBe(true);
    expect(result.snapshot.mountedSectionIds).toEqual(['section_0002']);
    expect(result.snapshot.wordCount).toBe(1200);
    expect(result.snapshot.contentDoc?.content).toHaveLength(1);
  });
});
