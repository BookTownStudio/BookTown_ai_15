import { describe, it, expect } from 'vitest';
import { searchAnnotationEngine } from '../searchAnnotationEngine';

/**
 * ============================================================
 * 🔒 BOOKTOWN DISCOVERY HARNESS — CONTRACT ENFORCEMENT
 * ============================================================
 *
 * This harness verifies that Discovery:
 * - Does NOT return books
 * - Does NOT rank or score
 * - Operates ONLY on allowed inputs
 *
 * Compile-time enforcement is relied upon for forbidden inputs.
 * ============================================================
 */

describe('Search Annotation Harness — Contract Enforcement', () => {
  const baseResults = [
    {
      id: 'book-1',
      title: 'The Trial',
      authors: ['Franz Kafka'],
      language: 'en',
    },
  ];

  it('returns annotated results without altering existing fields', async () => {
    const result = await searchAnnotationEngine({
      results: baseResults,
      userContext: {},
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0].title).toBe('The Trial');
    expect(result[0].discovery).toBeDefined();
  });

  it('does not inject ranking, scoring, or confidence fields', async () => {
    const result = await searchAnnotationEngine({
      results: baseResults,
      userContext: {},
    });

    expect('rank' in result[0]).toBe(false);
    expect('score' in result[0]).toBe(false);
    expect('confidence' in result[0]).toBe(false);
  });

  it('fails safely on null input', async () => {
    const result = await searchAnnotationEngine(null);
    expect(result).toEqual([]);
  });

  it('fails safely on empty but valid input', async () => {
    const result = await searchAnnotationEngine({
      results: [],
      userContext: {},
    });

    expect(result).toEqual([]);
  });
});
