import { afterEach, describe, expect, it } from 'vitest';
import {
  buildEpubLocationCacheKey,
  normalizeEpubLocationCacheSource,
  readCachedEpubLocations,
  writeCachedEpubLocations,
} from '../../../lib/reader/runtime/epubLocationCache.ts';

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { href: 'https://booktown.test/read' },
      localStorage,
    },
  });

  return store;
}

describe('epub location cache', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('normalizes signed URLs so regenerated tokens reuse the same cache entry', () => {
    const first =
      'https://storage.example.com/books/user-1/book.epub?X-Goog-Signature=old#chapter';
    const second = 'https://storage.example.com/books/user-1/book.epub?X-Goog-Signature=new';

    expect(normalizeEpubLocationCacheSource(first)).toBe(
      'https://storage.example.com/books/user-1/book.epub'
    );
    expect(buildEpubLocationCacheKey(first, 1200)).toBe(
      buildEpubLocationCacheKey(second, 1200)
    );
  });

  it('round-trips saved epub.js location payloads through localStorage', () => {
    installLocalStorage();

    const wrote = writeCachedEpubLocations({
      url: 'https://storage.example.com/books/user-1/book.epub?token=one',
      generationChars: 1200,
      locationCount: 3,
      payload: ['epubcfi(/6/2)', 'epubcfi(/6/4)', 'epubcfi(/6/6)'],
    });

    expect(wrote).toBe(true);
    const record = readCachedEpubLocations({
      url: 'https://storage.example.com/books/user-1/book.epub?token=two',
      generationChars: 1200,
    });

    expect(record?.locationCount).toBe(3);
    expect(record?.payload).toEqual(['epubcfi(/6/2)', 'epubcfi(/6/4)', 'epubcfi(/6/6)']);
  });

  it('rejects expired or mismatched location cache entries', () => {
    const store = installLocalStorage();
    const key = buildEpubLocationCacheKey('https://storage.example.com/books/user-1/book.epub', 1200);
    store.set(
      key,
      JSON.stringify({
        version: 1,
        sourceKey: 'https://storage.example.com/books/user-1/book.epub',
        generatedAtMs: Date.now() - 10_000,
        generationChars: 1200,
        locationCount: 1,
        payload: ['epubcfi(/6/2)'],
      })
    );

    expect(
      readCachedEpubLocations({
        url: 'https://storage.example.com/books/user-1/book.epub',
        generationChars: 1200,
        maxAgeMs: 1,
      })
    ).toBeNull();
    expect(store.has(key)).toBe(false);
  });
});
