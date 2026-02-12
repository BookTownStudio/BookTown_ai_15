import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchController } from '../../lib/domain/search/searchController.ts';

describe('SearchController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with idle state', () => {
    const controller = new SearchController(async () => []);
    expect(controller.getState().status).toBe('idle');
  });

  it('transitions to debouncing after execute', () => {
    const controller = new SearchController(async () => [], 50);
    controller.execute({ query: 'harry', ebookOnly: false });
    expect(controller.getState().status).toBe('debouncing');
  });

  it('transitions to loading then success', async () => {
    const fetcher = vi.fn().mockResolvedValue([{ id: '1' }]);
    const controller = new SearchController(fetcher, 10);

    controller.execute({ query: 'harry', ebookOnly: false });
    vi.advanceTimersByTime(10);
    await vi.runAllTimersAsync();

    expect(controller.getState().status).toBe('success');
    expect(controller.getState().data.length).toBe(1);
  });

  it('emits cancelled when an in-flight request is aborted', async () => {
    const fetcher = vi.fn(
      (_input, signal) =>
        new Promise<any[]>((_, reject) => {
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );
    const controller = new SearchController(fetcher, 10);

    controller.execute({ query: 'harry', ebookOnly: false });
    vi.advanceTimersByTime(10);
    expect(controller.getState().status).toBe('loading');

    (controller as any).controller.abort();
    await vi.runAllTimersAsync();

    expect(controller.getState().status).toBe('cancelled');
  });
});
