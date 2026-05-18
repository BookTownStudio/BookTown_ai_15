import { describe, expect, it } from 'vitest';
import {
  createChunkedManuscriptDraft,
  type ManuscriptChunkRecord,
} from './chunkedManuscript.ts';
import { reconcileChunkAuthority } from './chunkAuthority.ts';
import { type EditorSnapshot } from './editorRuntimeTypes.ts';
import { type WriteContentNode } from '../../types/entities.ts';

function paragraph(text: string) {
  return {
    type: 'paragraph' as const,
    content: [{ type: 'text' as const, text }],
  };
}

function snapshot(nodes: WriteContentNode[]): EditorSnapshot {
  return {
    titleEn: 'Novel',
    titleAr: '',
    content: '<p>Novel</p>',
    wordCount: nodes.length * 2,
    contentDoc: {
      version: 1,
      type: 'doc',
      content: nodes,
    },
  };
}

function createDraft(nodes: WriteContentNode[], revision: number) {
  return createChunkedManuscriptDraft({
    projectId: 'project_1',
    snapshot: snapshot(nodes),
    revision,
    source: 'autosave',
    now: `2026-05-15T00:00:0${revision}.000Z`,
  });
}

describe('chunk authority reconciliation', () => {
  it('reuses stable chunk identities and marks only changed chunks dirty', () => {
    const nodes = Array.from({ length: 170 }, (_, index) => paragraph(`Paragraph ${index + 1}`));
    const existingDraft = createDraft(nodes, 1);
    const nextNodes = nodes.map((node, index) => (
      index === 90 ? paragraph('Changed paragraph 91') : node
    ));
    const nextDraft = createDraft(nextNodes, 2);

    const reconciliation = reconcileChunkAuthority({
      draft: nextDraft,
      existingSections: existingDraft.sections,
      existingChunks: existingDraft.chunks,
      revision: 2,
      authority: 'complete',
      now: '2026-05-15T00:00:02.000Z',
    });

    expect(reconciliation.chunkUpserts).toHaveLength(1);
    expect(reconciliation.dirtyChunkCount).toBe(1);
    expect(reconciliation.unchangedChunkCount).toBe(existingDraft.chunks.length - 1);
    expect(reconciliation.reusedChunkIdentityCount).toBe(existingDraft.chunks.length);
    expect(reconciliation.chunks.map((chunk) => chunk.chunkId)).toEqual(
      existingDraft.chunks.map((chunk) => chunk.chunkId)
    );
  });

  it('preserves unloaded chunks during partial section-authority saves', () => {
    const firstSection = Array.from({ length: 3 }, (_, index) => paragraph(`First ${index + 1}`));
    const secondSection = Array.from({ length: 3 }, (_, index) => paragraph(`Second ${index + 1}`));
    const existingDraft = createDraft([
      ...firstSection,
      { type: 'horizontalRule' as const },
      ...secondSection,
    ], 1);
    const partialDraft = createDraft([
      paragraph('First 1 changed'),
      ...firstSection.slice(1),
    ], 2);

    const reconciliation = reconcileChunkAuthority({
      draft: partialDraft,
      existingSections: existingDraft.sections,
      existingChunks: existingDraft.chunks,
      revision: 2,
      authority: 'partial',
      authoritativeSectionIds: ['section_0001'],
      now: '2026-05-15T00:00:02.000Z',
    });

    expect(reconciliation.preservedUnloadedChunkCount).toBeGreaterThan(0);
    expect(reconciliation.chunkDeletes).toHaveLength(0);
    expect(reconciliation.sectionDeletes).toHaveLength(0);
    expect(reconciliation.chunks.every((chunk) => chunk.sectionId === 'section_0001')).toBe(true);
  });

  it('keeps chunk identities with unchanged content when chunks are reordered', () => {
    const firstChunkNodes = Array.from({ length: 80 }, (_, index) => paragraph(`Alpha ${index + 1}`));
    const secondChunkNodes = Array.from({ length: 80 }, (_, index) => paragraph(`Beta ${index + 1}`));
    const existingDraft = createDraft([...firstChunkNodes, ...secondChunkNodes], 1);
    const nextDraft = createDraft([
      ...existingDraft.chunks[1].contentDoc.content,
      ...existingDraft.chunks[0].contentDoc.content,
    ], 2);
    const existingChunkByHash = new Map<string, ManuscriptChunkRecord>(
      existingDraft.chunks.map((chunk) => [chunk.contentHash, chunk])
    );

    const reconciliation = reconcileChunkAuthority({
      draft: nextDraft,
      existingSections: existingDraft.sections,
      existingChunks: existingDraft.chunks,
      revision: 2,
      authority: 'complete',
      now: '2026-05-15T00:00:02.000Z',
    });

    expect(reconciliation.movedChunkCount).toBe(2);
    reconciliation.chunks.forEach((chunk) => {
      expect(chunk.chunkId).toBe(existingChunkByHash.get(chunk.contentHash)?.chunkId);
    });
  });

  it('preserves existing section identity when a new chapter collides with fallback section id', () => {
    const existingDraft = createDraft([
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Chapter One' }] },
      paragraph('Existing body'),
    ], 1);
    const nextDraft = createDraft([
      { type: 'horizontalRule' as const },
      { type: 'heading' as const, attrs: { level: 2 }, content: [{ type: 'text' as const, text: 'Inserted Chapter' }] },
      paragraph('Inserted body'),
      { type: 'horizontalRule' as const },
      ...existingDraft.contentDoc.content,
    ], 2);

    expect(nextDraft.sections.map((section) => section.sectionId)).toEqual(['section_0001', 'section_0001']);

    const reconciliation = reconcileChunkAuthority({
      draft: nextDraft,
      existingSections: existingDraft.sections,
      existingChunks: existingDraft.chunks,
      revision: 2,
      authority: 'complete',
      now: '2026-05-15T00:00:02.000Z',
    });

    expect(new Set(reconciliation.sections.map((section) => section.sectionId)).size).toBe(2);
    expect(reconciliation.sections.map((section) => section.title)).toEqual(['Inserted Chapter', 'Chapter One']);
    expect(reconciliation.sections[1].sectionId).toBe(existingDraft.sections[0].sectionId);
    expect(reconciliation.chunks.map((chunk) => chunk.sectionId)).toEqual(
      expect.arrayContaining(reconciliation.sections.map((section) => section.sectionId))
    );
  });
});
