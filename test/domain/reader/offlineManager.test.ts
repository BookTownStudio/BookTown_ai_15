import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCacheKey } from '../../../app/lib/offline/offlineManager.ts';

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

describe('reader offline manager', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds same-origin http cache keys accepted by Cache Storage', () => {
    vi.stubGlobal('window', {
      location: {
        origin: 'https://booktown.test',
      },
    });

    const cacheKey = buildCacheKey('book id/with spaces');
    const parsed = new URL(cacheKey);

    expect(parsed.protocol).toBe('https:');
    expect(parsed.origin).toBe('https://booktown.test');
    expect(parsed.pathname).toBe('/__booktown_offline__/ebooks/book%20id%2Fwith%20spaces');
  });
});
