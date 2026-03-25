import { describe, expect, it } from 'vitest';
import {
  createJournalEntryNodes,
  getLatestJournalEntryMeta,
  JOURNAL_ENTRY_DATE_ATTR,
  toJournalDateKey,
} from './journalMode.ts';
import type { WriteContentDoc } from '../../types/entities.ts';

describe('journalMode', () => {
  it('creates a stable local date key', () => {
    const date = new Date(2026, 2, 22, 20, 14, 0, 0);
    expect(toJournalDateKey(date)).toBe('2026-03-22');
  });

  it('creates chapter entry nodes with journal date metadata on the heading', () => {
    const date = new Date(2026, 2, 22, 20, 14, 0, 0);
    const nodes = createJournalEntryNodes({ date, locale: 'en' });
    const heading = nodes[1];

    expect(nodes[0]?.type).toBe('horizontalRule');
    expect(heading?.type).toBe('heading');
    expect(heading?.attrs?.[JOURNAL_ENTRY_DATE_ATTR]).toBe('2026-03-22');
  });

  it('detects the latest journal entry from heading metadata', () => {
    const contentDoc: WriteContentDoc = {
      version: 1,
      type: 'doc',
      plainText: 'entry',
      content: [
        ...createJournalEntryNodes({ date: new Date(2026, 2, 21, 10, 0), locale: 'en' }),
        ...createJournalEntryNodes({ date: new Date(2026, 2, 22, 20, 14), locale: 'en' }),
      ],
    };

    expect(getLatestJournalEntryMeta(contentDoc)?.dateKey).toBe('2026-03-22');
  });
});
