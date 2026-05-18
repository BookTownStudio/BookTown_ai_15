import { describe, expect, it } from 'vitest';
import { apiContracts } from '../../../contracts/apiContracts.ts';

describe('write callable contracts structural identity attrs', () => {
  it('accepts structural identity attrs on chunk mutation content nodes', () => {
    const result = apiContracts.callable.applyWriteChunkMutation.requestSchema.safeParse({
      projectId: 'project_1',
      revision: 2,
      source: 'autosave',
      authority: 'partial',
      authoritativeSectionIds: ['section_0001'],
      affectedChunkIds: ['section_0001_chunk_0001'],
      snapshot: {
        wordCount: 2,
        totalSectionCount: 1,
        totalChunkCount: 1,
        contentDoc: {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: {
                lang: 'en',
                dir: 'ltr',
                btAnchorId: 'anc_1',
                btSectionId: 'section_0001',
                btChunkId: 'section_0001_chunk_0001',
              },
              content: [{ type: 'text', text: 'Contract safe.' }],
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('accepts bounded editor chrome metadata on chunk mutations', () => {
    const result = apiContracts.callable.applyWriteChunkMutation.requestSchema.safeParse({
      projectId: 'project_1',
      revision: 2,
      source: 'autosave',
      authority: 'partial',
      authoritativeSectionIds: ['section_0001'],
      affectedChunkIds: ['section_0001_chunk_0001'],
      metadata: {
        title: 'Novel',
        titleEn: 'Novel',
        titleAr: 'رواية',
      },
      snapshot: {
        wordCount: 2,
        totalSectionCount: 1,
        totalChunkCount: 1,
        contentDoc: {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: {
                btAnchorId: 'anc_1',
                btSectionId: 'section_0001',
                btChunkId: 'section_0001_chunk_0001',
              },
              content: [{ type: 'text', text: 'Contract safe.' }],
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it('keeps rejecting unknown attrs after admitting canonical write identity attrs', () => {
    const result = apiContracts.callable.applyWriteChunkMutation.requestSchema.safeParse({
      projectId: 'project_1',
      revision: 2,
      source: 'autosave',
      authority: 'partial',
      authoritativeSectionIds: ['section_0001'],
      snapshot: {
        wordCount: 2,
        contentDoc: {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: {
                btAnchorId: 'anc_1',
                unsafeClientAttr: 'reject-me',
              },
            },
          ],
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects chunk mutation operation ack without convergence metadata', () => {
    const result = apiContracts.callable.applyWriteChunkMutation.requestSchema.safeParse({
      projectId: 'project_1',
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
      },
      snapshot: {
        wordCount: 2,
        totalSectionCount: 1,
        totalChunkCount: 1,
        contentDoc: {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              attrs: {
                btAnchorId: 'anc_1',
                btSectionId: 'section_0001',
                btChunkId: 'section_0001_chunk_0001',
              },
              content: [{ type: 'text', text: 'Contract safe.' }],
            },
          ],
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issuePaths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(issuePaths).toEqual(expect.arrayContaining([
        'operation.causality',
        'operation.convergenceHash',
      ]));
    }
  });

  it('rejects raw ProseMirror null default attrs before transport normalization', () => {
    const result = apiContracts.callable.applyWriteChunkMutation.requestSchema.safeParse({
      projectId: 'project_1',
      revision: 2,
      source: 'autosave',
      authority: 'complete',
      snapshot: {
        wordCount: 2,
        contentDoc: {
          version: 1,
          type: 'doc',
          content: [
            {
              type: 'heading',
              attrs: {
                lang: 'en',
                dir: 'ltr',
                langManual: false,
                btAnchorId: 'anc_1',
                btSectionId: null,
                btChunkId: null,
                journalEntryDate: null,
              },
              content: [{ type: 'text', text: 'Raw ProseMirror defaults.' }],
            },
          ],
        },
      },
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issuePaths = result.error.issues.map((issue) => issue.path.join('.'));
      expect(issuePaths).toEqual(expect.arrayContaining([
        'snapshot.contentDoc.content.0.attrs.btSectionId',
        'snapshot.contentDoc.content.0.attrs.btChunkId',
        'snapshot.contentDoc.content.0.attrs.journalEntryDate',
      ]));
    }
  });
});
