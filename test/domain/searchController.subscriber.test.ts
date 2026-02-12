import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchController } from '../../lib/domain/search/searchController.ts';

describe('SearchController subscribers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('notifies multiple subscribers', () => {
    const fetcher = vi.fn().mockResolvedValue([]);
    const controller = new SearchController(fetcher, 50);

    const subA = vi.fn();
    const subB = vi.fn();
    controller.subscribe(subA);
    controller.subscribe(subB);

    controller.execute({ query: 'rowling', ebookOnly: false });

    expect(subA.mock.calls.length).toBeGreaterThan(1);
    expect(subB.mock.calls.length).toBeGreaterThan(1);
  });

  it('unsubscribe stops notifications', () => {
    const fetcher = vi.fn().mockResolvedValue([]);
    const controller = new SearchController(fetcher, 50);

    const subA = vi.fn();
    const subB = vi.fn();
    const unsubscribeA = controller.subscribe(subA);
    controller.subscribe(subB);

    unsubscribeA();
    controller.execute({ query: 'hesse', ebookOnly: false });

    expect(subA.mock.calls.length).toBe(1);
    expect(subB.mock.calls.length).toBeGreaterThan(1);
  });
});
