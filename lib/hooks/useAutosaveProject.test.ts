import { describe, expect, it } from 'vitest';
import { assertNoChunkNativeManuscriptUpdate } from './useAutosaveProject.ts';

describe('useAutosaveProject authority guard', () => {
  it('blocks chunk-native manuscript fields from updateWriteProject', () => {
    expect(() => assertNoChunkNativeManuscriptUpdate({
      projectId: 'project_1',
      manuscriptStorageMode: 'chunked',
      updates: {
        contentDoc: { version: 1, type: 'doc', content: [] },
        manuscriptStorage: { version: 1, mode: 'chunked' },
      },
    })).toThrow('[WRITE][DUAL_AUTHORITY_BLOCKED]');
  });

  it('allows cursor-only updates through the generic project endpoint', () => {
    expect(() => assertNoChunkNativeManuscriptUpdate({
      projectId: 'project_1',
      manuscriptStorageMode: 'chunked',
      updates: {
        lastCursorBlockId: 'block:0',
        lastCursorOffset: 1,
        lastCursorSavedAt: '2026-05-18T00:00:00.000Z',
      },
    })).not.toThrow();
  });
});
