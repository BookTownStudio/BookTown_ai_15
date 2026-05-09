import { afterEach, describe, expect, it } from 'vitest';
import {
  addPersistedSearchHistoryQuery,
  clearPersistedSearchHistory,
  mergeSearchHistoryQuery,
  normalizeSearchHistoryList,
  normalizeSearchHistoryQuery,
  readPersistedSearchHistory,
  removePersistedSearchHistoryQuery,
} from '../../lib/hooks/useSearchHistory.ts';

describe('search history normalization', () => {
  afterEach(() => {
    clearPersistedSearchHistory();
  });

  it('normalizes whitespace and caps query length', () => {
    const longQuery = `  Kafka    ${'x'.repeat(140)}  `;

    expect(normalizeSearchHistoryQuery(longQuery)).toHaveLength(120);
    expect(normalizeSearchHistoryQuery('  The Trial   Kafka  ')).toBe('The Trial Kafka');
  });

  it('deduplicates case-insensitively and caps recent searches', () => {
    const normalized = normalizeSearchHistoryList([
      'Kafka',
      ' kafka ',
      'Borges',
      'Proust',
      'Mahfouz',
      'Calvino',
      'Woolf',
      'Austen',
      'Dostoevsky',
      null,
    ]);

    expect(normalized).toEqual([
      'Kafka',
      'Borges',
      'Proust',
      'Mahfouz',
      'Calvino',
      'Woolf',
      'Austen',
    ]);
  });

  it('promotes an existing search without growing duplicate entries', () => {
    expect(mergeSearchHistoryQuery(['Kafka', 'Borges', 'Proust'], ' borges ')).toEqual([
      'borges',
      'Kafka',
      'Proust',
    ]);
  });

  it('adds against persisted storage instead of stale caller state', () => {
    localStorage.setItem('booktown_search_history', JSON.stringify(['Kafka']));

    expect(addPersistedSearchHistoryQuery('Borges')).toEqual(['Borges', 'Kafka']);
    expect(readPersistedSearchHistory()).toEqual(['Borges', 'Kafka']);
  });

  it('retains sequential persisted searches in newest-first order', () => {
    addPersistedSearchHistoryQuery('Kafka');
    addPersistedSearchHistoryQuery('Borges');
    addPersistedSearchHistoryQuery('Quran');

    expect(readPersistedSearchHistory()).toEqual(['Quran', 'Borges', 'Kafka']);
  });

  it('promotes persisted duplicates without losing intervening entries', () => {
    localStorage.setItem('booktown_search_history', JSON.stringify(['Borges', 'Kafka', 'Quran']));

    expect(addPersistedSearchHistoryQuery(' kafka ')).toEqual(['kafka', 'Borges', 'Quran']);
    expect(readPersistedSearchHistory()).toEqual(['kafka', 'Borges', 'Quran']);
  });

  it('removes against latest persisted storage', () => {
    localStorage.setItem('booktown_search_history', JSON.stringify(['Kafka', 'Borges', 'Quran']));

    expect(removePersistedSearchHistoryQuery('borges')).toEqual(['Kafka', 'Quran']);
    expect(readPersistedSearchHistory()).toEqual(['Kafka', 'Quran']);
  });
});
