import { describe, expect, it } from 'vitest';
import {
  type EditorSnapshot,
  hasPartialManuscriptRuntimeMetadata,
  mergeAuthoritativeRuntimeMetadata,
} from './editorRuntimeTypes.ts';

const partialDraft: EditorSnapshot = {
  titleEn: 'Draft',
  titleAr: '',
  content: '<p>Draft</p>',
  wordCount: 1,
  contentDoc: {
    version: 1,
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Draft' }] }],
  },
  isPartialManuscript: true,
};

const hydratedServerSnapshot: EditorSnapshot = {
  ...partialDraft,
  titleEn: 'Server',
  mountedSectionIds: ['section_0001'],
  activeSectionId: 'section_0001',
  totalSectionCount: 3,
  totalChunkCount: 9,
};

describe('editor runtime recovery metadata authority', () => {
  it('detects unrecoverable partial local drafts missing runtime counts', () => {
    expect(hasPartialManuscriptRuntimeMetadata(partialDraft)).toBe(false);
  });

  it('merges server-owned runtime metadata into a partial recovery draft', () => {
    const repaired = mergeAuthoritativeRuntimeMetadata(partialDraft, hydratedServerSnapshot);

    expect(repaired).toMatchObject({
      titleEn: 'Draft',
      mountedSectionIds: ['section_0001'],
      activeSectionId: 'section_0001',
      totalSectionCount: 3,
      totalChunkCount: 9,
    });
  });

  it('rejects a partial recovery draft when no authoritative runtime metadata exists', () => {
    const repaired = mergeAuthoritativeRuntimeMetadata(partialDraft, {
      ...hydratedServerSnapshot,
      mountedSectionIds: undefined,
      totalSectionCount: undefined,
      totalChunkCount: undefined,
    });

    expect(repaired).toBeNull();
  });
});
