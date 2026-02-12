/**
 * ============================================================
 * 🔒 BOOKTOWN SEARCH BEHAVIOR — AUTHORITATIVE TEST HARNESS
 * ============================================================
 *
 * This file is the EXECUTABLE specification for BookTown search.
 *
 * Rules:
 * - All search behavior is defined here first.
 * - Production code MUST conform to these tests.
 * - Tests are written BEFORE changing searchEngine.ts.
 *
 * Change policy:
 * - New behavior → add or modify a test (expected to FAIL).
 * - Then update implementation until tests pass.
 * - Silent behavior changes are forbidden.
 *
 * Relationship:
 * - SEARCH_CONTRACT.md defines INTENT.
 * - This file defines ENFORCEMENT.
 * - searchEngine.ts is an IMPLEMENTATION DETAIL.
 *
 * If tests and implementation disagree:
 * 👉 TESTS WIN.
 *
 * ============================================================
 */

import { describe, it, expect, vi } from 'vitest';
import { getProviderFixtures } from './fixtures';

/**
 * 🔒 Hard block Firestore at module boundary (ESM-safe)
 */
vi.mock('firebase-admin/firestore', () => {
  return {
    getFirestore: () => {
      throw new Error('Firestore disabled in search harness');
    },
  };
});

/**
 * 🔒 Deterministic fetch stub for external providers
 */
global.fetch = (async (input: any) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const parsed = new URL(url);
  const q = parsed.searchParams.get('q') || '';
  const fixtures = getProviderFixtures(q);

  if (url.includes('googleapis.com/books/v1/volumes')) {
    return {
      ok: true,
      status: 200,
      json: async () => fixtures.google,
    } as any;
  }

  if (url.includes('openlibrary.org/search.json')) {
    return {
      ok: true,
      status: 200,
      json: async () => fixtures.openLibrary,
    } as any;
  }

  return {
    ok: false,
    status: 404,
    json: async () => ({}),
  } as any;
}) as any;

/**
 * 🔒 Import AFTER mocks
 */
import { unifiedSearch } from '../searchEngine';

const getAuthors = (results: any[]) =>
  results.map(r =>
    Array.isArray((r as any).authors) ? (r as any).authors[0] : ''
  );

const titleMatchesPattern = (title: string, pattern: RegExp) =>
  pattern.test(title.toLowerCase());

describe('Search Harness — Literary Relevance & Safety', () => {
  it('Literary dominant entity ordering — harry', async () => {
    const results = await unifiedSearch('harry', {});
    expect(results.length).toBeGreaterThanOrEqual(5);
    expect(results.length).toBeLessThanOrEqual(20);

    const topTitles = results.slice(0, 3).map(r => r.title);
    expect(
      topTitles.some(t => t.toLowerCase().includes('harry potter'))
    ).toBe(true);

    const topAuthors = getAuthors(results.slice(0, 3));
    expect(
      topAuthors.every(a => normalize(a) === normalize('J. K. Rowling'))
    ).toBe(true);

    const forbiddenPatterns = [
      /\bin re\b/,
      /\bv\.?\b/,
      /\bestate\b/,
      /\bconference\b/,
      /\bhearing\b/,
    ];

    const topFiveTitles = results.slice(0, 5).map(r => r.title);
    forbiddenPatterns.forEach(pattern => {
      expect(
        topFiveTitles.every(title => !titleMatchesPattern(title, pattern))
      ).toBe(true);
    });
  });

  it('Author intent dominance — hesse', async () => {
    const results = await unifiedSearch('hesse', {});
    expect(results.length).toBeGreaterThan(0);

    const top = results[0];
    const topAuthor = Array.isArray((top as any).authors)
      ? (top as any).authors[0]
      : '';
    expect(normalize(topAuthor)).toBe(normalize('Hermann Hesse'));
    expect(isSecondary(top.title)).toBe(false);
  });

  it('Series expansion correctness — rowling', async () => {
    const results = await unifiedSearch('rowling', {});
    expect(results.length).toBeGreaterThan(0);

    const topAuthors = getAuthors(results.slice(0, 3));
    expect(
      topAuthors.every(a => normalize(a) === normalize('J. K. Rowling'))
    ).toBe(true);

    const firstSecondaryIndex = results.findIndex(r =>
      isSecondary(r.title)
    );
    const lastPrimaryIndex = results
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !isSecondary(r.title))
      .map(({ i }) => i)
      .pop();

    if (firstSecondaryIndex !== -1 && lastPrimaryIndex !== undefined) {
      expect(lastPrimaryIndex).toBeLessThan(firstSecondaryIndex);
    }
  });

  it('Keyword ambiguity containment — wolf', async () => {
    const results = await unifiedSearch('wolf', {});
    expect(results.length).toBeGreaterThan(0);

    results.forEach(r => {
      expect(r.title).toBeTruthy();
      expect(Array.isArray((r as any).authors)).toBe(true);
      expect(
        !titleMatchesPattern(r.title, /\b(in re|estate|v\.?|vs)\b/)
      ).toBe(true);
    });
  });

  it('Negative intent suppression — financial', async () => {
    const results = await unifiedSearch('financial', {});
    expect(results.length).toBeGreaterThan(0);

    const topFive = results.slice(0, 5);
    topFive.forEach(r => {
      expect(
        !titleMatchesPattern(r.title, /\b(in re|estate|v\.?|vs)\b/)
      ).toBe(true);
      expect(!titleMatchesPattern(r.title, /\breport\b/)).toBe(true);
    });
  });

  it('Ebook-only filter excludes non-ebook editions across providers', async () => {
    const results = await unifiedSearch('ebook filter', {
      ebookOnly: true,
    });

    expect(results.length).toBeGreaterThan(0);

    results.forEach(r => {
      expect(Boolean((r as any).hasEbook || (r as any).ebookAvailable)).toBe(
        true
      );
    });

    const titles = results.map(r => r.title.toLowerCase());
    expect(titles).toContain('ebook filter primary novel');
    expect(titles).toContain('ebook filter epub access');
    expect(titles).toContain('ebook filter library digital');
    expect(titles).not.toContain('ebook filter print edition');
    expect(titles).not.toContain('ebook filter library print');
  });
});

/* ---------------------------------- */
/* Helpers                            */
/* ---------------------------------- */

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isSecondary(title: string): boolean {
  return [
    'criticism',
    'analysis',
    'study',
    'studies',
    'companion',
    'guide',
    'handbook',
    'biography',
    'memoir',
    'essays',
    'essay',
    'collection',
    'conference',
    'conferences',
    'proceedings',
    'hearing',
    'hearings',
    'report',
    'reports',
  ].some(token => title.toLowerCase().includes(token));
}
