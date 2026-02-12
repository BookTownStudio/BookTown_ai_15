// functions/src/library/discovery/__tests__/discoveryHarness.phase2.test.ts

import { describe, it, expect } from 'vitest';
import { searchAnnotationEngine } from '../searchAnnotationEngine';

describe('Discovery Harness — Phase 2 (Explainable Annotations Only)', () => {
  const baseResults = [
    {
      id: 'book-1',
      title: 'The Trial',
      authors: ['Franz Kafka'],
      language: 'en',
    },
    {
      id: 'book-2',
      title: 'Steppenwolf',
      authors: ['Hermann Hesse'],
      language: 'de',
    },
  ];

  it('adds languageMatch signal when user language matches item language', async () => {
    const result = await searchAnnotationEngine({
      results: baseResults,
      userContext: {
        language: 'en',
      },
    });

    const first = result[0] as any;

    expect(first.discovery).toBeDefined();
    expect(first.discovery.signals?.languageMatch).toBe(true);
    expect(first.discovery.explanation).toContain('language');
  });

  it('adds fromShelf signal when item appears in user shelf', async () => {
    const result = await searchAnnotationEngine({
      results: baseResults,
      userContext: {
        shelves: ['book-2'],
      },
    });

    const second = result[1] as any;

    expect(second.discovery).toBeDefined();
    expect(second.discovery.signals?.fromShelf).toBe(true);
    expect(second.discovery.explanation).toContain('shelf');
  });

  it('adds fromHistory signal when item appears in reading history', async () => {
    const result = await searchAnnotationEngine({
      results: baseResults,
      userContext: {
        history: ['book-1'],
      },
    });

    const first = result[0] as any;

    expect(first.discovery).toBeDefined();
    expect(first.discovery.signals?.fromHistory).toBe(true);
    expect(first.discovery.explanation).toContain('read');
  });

  it('preserves result order exactly', async () => {
    const result = await searchAnnotationEngine({
      results: baseResults,
      userContext: {
        language: 'en',
        shelves: ['book-2'],
      },
    });

    expect(result.map((r: any) => r.id)).toEqual(['book-1', 'book-2']);
  });

  it('does not remove or inject items', async () => {
    const result = await searchAnnotationEngine({
      results: baseResults,
      userContext: {},
    });

    expect(result.length).toBe(baseResults.length);
  });

  it('fails safely and returns empty array on null input', async () => {
    const result = await searchAnnotationEngine(null);
    expect(result).toEqual([]);
  });

  it('never mutates canonical fields', async () => {
    const result = await searchAnnotationEngine({
      results: baseResults,
      userContext: {
        language: 'en',
      },
    });

    expect(result[0].title).toBe('The Trial');
    expect(result[0].authors[0]).toBe('Franz Kafka');
  });

  it('requires explanations for any positive signal', async () => {
    const result = await searchAnnotationEngine({
      results: baseResults,
      userContext: {
        language: 'en',
        history: ['book-1'],
      },
    });

    const first = result[0] as any;

    const hasAnySignal = Object.values(first.discovery.signals || {}).some(Boolean);
    if (hasAnySignal) {
      expect(typeof first.discovery.explanation).toBe('string');
      expect(first.discovery.explanation.length).toBeGreaterThan(5);
    }
  });
});
