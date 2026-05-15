import { describe, expect, it } from 'vitest';
import {
  assembleChunkedContentDoc,
  createChunkedManuscriptDraft,
  TARGET_CHUNK_NODE_COUNT,
} from './chunkedManuscript.ts';
import { type EditorSnapshot } from './editorRuntimeTypes.ts';
import { type WriteContentNode } from '../../types/entities.ts';

function paragraph(text: string) {
  return {
    type: 'paragraph' as const,
    content: [{ type: 'text' as const, text }],
  };
}

function stripRuntimeIdentity(node: WriteContentNode): WriteContentNode {
  const attrs = node.attrs
    ? Object.fromEntries(
      Object.entries(node.attrs).filter(([key]) => (
        key !== 'btAnchorId' && key !== 'btChunkId' && key !== 'btSectionId'
      ))
    )
    : undefined;
  return {
    ...Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'attrs')),
    ...(attrs && Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(Array.isArray(node.content)
      ? { content: node.content.map((child) => stripRuntimeIdentity(child)) }
      : {}),
  };
}

describe('chunked manuscript architecture', () => {
  it('round-trips a legacy contentDoc through ordered sections and chunks', () => {
    const snapshot: EditorSnapshot = {
      titleEn: 'Novel',
      titleAr: '',
      content: '<p>One</p>',
      wordCount: 4,
      contentDoc: {
        version: 1,
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter One' }] },
          paragraph('First paragraph.'),
          { type: 'horizontalRule' },
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Chapter Two' }] },
          paragraph('Second paragraph.'),
        ],
      },
    };

    const draft = createChunkedManuscriptDraft({
      projectId: 'project_1',
      snapshot,
      revision: 3,
      source: 'migration',
      now: '2026-05-15T00:00:00.000Z',
    });

    expect(draft.sections).toHaveLength(2);
    expect(draft.activeSectionId).toBe('section_0001');
    const assembled = assembleChunkedContentDoc(draft.chunks);
    expect(assembled.content.map((node) => stripRuntimeIdentity(node))).toEqual(snapshot.contentDoc?.content);
    expect(assembled.content.every((node) => typeof node.attrs?.btAnchorId === 'string')).toBe(true);
    expect(assembled.content.every((node) => typeof node.attrs?.btChunkId === 'string')).toBe(true);
    expect(draft.snapshot.revision).toBe(3);
    expect(draft.snapshot.sectionCount).toBe(2);
  });

  it('bounds chunks by node count without dropping manuscript nodes', () => {
    const nodes = Array.from({ length: TARGET_CHUNK_NODE_COUNT + 5 }, (_, index) =>
      paragraph(`Paragraph ${index + 1}`)
    );
    const snapshot: EditorSnapshot = {
      titleEn: 'Long Draft',
      titleAr: '',
      content: '',
      wordCount: nodes.length * 2,
      contentDoc: {
        version: 1,
        type: 'doc',
        content: nodes,
      },
    };

    const draft = createChunkedManuscriptDraft({
      projectId: 'project_2',
      snapshot,
      revision: 1,
      source: 'autosave',
    });

    expect(draft.chunks.length).toBeGreaterThan(1);
    expect(draft.chunks.every((chunk) => chunk.nodeCount <= TARGET_CHUNK_NODE_COUNT)).toBe(true);
    expect(assembleChunkedContentDoc(draft.chunks).content).toHaveLength(nodes.length);
  });

  it('preserves structural section identity for virtualized partial windows', () => {
    const snapshot: EditorSnapshot = {
      titleEn: 'Window',
      titleAr: '',
      content: '',
      wordCount: 2,
      contentDoc: {
        version: 1,
        type: 'doc',
        content: [
          {
            ...paragraph('Mounted second section'),
            attrs: {
              btAnchorId: 'anchor_2',
              btSectionId: 'section_0002',
              btChunkId: 'section_0002_chunk_0001',
            },
          },
        ],
      },
      isPartialManuscript: true,
      mountedSectionIds: ['section_0002'],
      activeSectionId: 'section_0002',
      totalSectionCount: 4,
      totalChunkCount: 4,
    };

    const draft = createChunkedManuscriptDraft({
      projectId: 'project_3',
      snapshot,
      revision: 2,
      source: 'autosave',
    });

    expect(draft.sections.map((section) => section.sectionId)).toEqual(['section_0002']);
    expect(draft.chunks.map((chunk) => chunk.sectionId)).toEqual(['section_0002']);
    expect(draft.chunks.map((chunk) => chunk.chunkId)).toEqual(['section_0002_chunk_0001']);
  });
});
