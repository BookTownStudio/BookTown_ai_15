import { describe, expect, it } from 'vitest';
import { resolveCursorPosition } from './cursorMemory.ts';

describe('cursorMemory', () => {
  const buildEditor = () =>
    ({
      state: {
        doc: {
          content: { size: 18 },
          descendants: (visitor: (node: any, pos: number) => boolean) => {
            visitor({ type: { name: 'paragraph' }, textContent: 'Alpha' }, 0);
            visitor({ type: { name: 'heading' }, textContent: 'Beta' }, 7);
            return true;
          },
        },
      },
    }) as any;

  it('restores to the exact saved block and offset when valid', () => {
    const position = resolveCursorPosition(buildEditor(), {
      lastCursorBlockId: 'block:1',
      lastCursorOffset: 2,
    });

    expect(position).toBe(10);
  });

  it('falls back to the nearest valid block when the saved block no longer exists', () => {
    const position = resolveCursorPosition(buildEditor(), {
      lastCursorBlockId: 'block:9',
      lastCursorOffset: 1,
    });

    expect(position).toBe(9);
  });

  it('falls back to the end of editable content when the saved block id is invalid', () => {
    const position = resolveCursorPosition(buildEditor(), {
      lastCursorBlockId: 'invalid',
      lastCursorOffset: 999,
    });

    expect(position).toBe(12);
  });
});
