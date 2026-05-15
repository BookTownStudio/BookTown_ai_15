import { describe, expect, it } from 'vitest';
import {
  ensureStructuralAnchorsInDoc,
  resolveDominantChunkId,
} from './structuralAnchors.ts';
import { type WriteContentDoc } from '../../types/entities.ts';

function doc(): WriteContentDoc {
  return {
    version: 1,
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Alpha' }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Beta' }],
      },
    ],
  };
}

describe('structural anchors', () => {
  it('assigns stable unique anchors and preserves them across hydration cycles', () => {
    const first = ensureStructuralAnchorsInDoc(doc(), 'project_1');
    const second = ensureStructuralAnchorsInDoc(first, 'project_1');

    expect(first.content.map((node) => node.attrs?.btAnchorId)).toEqual(
      second.content.map((node) => node.attrs?.btAnchorId)
    );
    expect(new Set(first.content.map((node) => node.attrs?.btAnchorId)).size).toBe(first.content.length);
  });

  it('uses editor-native chunk identity as the dominant chunk mapping', () => {
    const content = ensureStructuralAnchorsInDoc(doc(), 'project_1').content.map((node, index) => ({
      ...node,
      attrs: {
        ...node.attrs,
        btChunkId: index === 0 ? 'chunk_a' : 'chunk_b',
      },
    }));

    expect(resolveDominantChunkId([content[1], content[0], content[1]], 'fallback')).toBe('chunk_b');
  });
});
