import { describe, expect, it } from 'vitest';
import {
  buildCanonicalEpubLocationSourceIdentity,
  resolveCanonicalEpubLocationMap,
} from '../../../lib/reader/runtime/canonicalEpubStructure.ts';
import type { ReaderManifestSnapshot } from '../../../lib/reader/runtime/contracts.ts';

const identity = {
  bookId: 'book-1',
  manifestVersion: 3,
  pipelineVersion: 'reader_manifest_v2',
  sourceSignatureHash: 'abc123',
  generationChars: 1200,
};

function buildManifest(overrides: Partial<ReaderManifestSnapshot> = {}): ReaderManifestSnapshot {
  return {
    bookId: 'book-1',
    version: 3,
    pipelineVersion: 'reader_manifest_v2',
    format: 'epub',
    estimatedPageCount: null,
    locationMap: {
      version: 'v1',
      mode: 'logical',
      checkpointUnit: 'spine_item',
      status: 'ready',
      source: 'server_precomputed',
      anchorSchema: 'canonical_anchor_v1',
      identity,
      generationChars: 1200,
      locationCount: 2,
      payload: ['epubcfi(/6/2!/4/2/2)', 'epubcfi(/6/4!/4/2/2)'],
    },
    searchIndex: { status: 'pending', docPath: 'reader_search_index/book-1' },
    highlightAnchors: { status: 'pending', docPath: 'reader_highlight_anchors/book-1' },
    generatedAtMs: 1,
    ...overrides,
  };
}

describe('canonical EPUB structure helpers', () => {
  it('accepts ready server-precomputed EPUB location maps with stable identity', () => {
    const canonical = resolveCanonicalEpubLocationMap(buildManifest(), 1200);

    expect(canonical?.locationCount).toBe(2);
    expect(canonical?.sourceIdentity).toBe(
      buildCanonicalEpubLocationSourceIdentity(identity)
    );
  });

  it('rejects runtime-generated or mismatched location maps', () => {
    expect(
      resolveCanonicalEpubLocationMap(
        buildManifest({
          locationMap: {
            ...buildManifest().locationMap,
            source: 'runtime_generated',
          },
        }),
        1200
      )
    ).toBeNull();

    expect(resolveCanonicalEpubLocationMap(buildManifest(), 800)).toBeNull();
  });
});
