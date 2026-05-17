import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleReaderIdleTask } from '../../../lib/reader/runtime/readerIdleScheduler.ts';

describe('reader idle scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('runs immediately outside the browser runtime', () => {
    const task = vi.fn();
    vi.stubGlobal('window', undefined);

    const cancel = scheduleReaderIdleTask(task);

    expect(task).toHaveBeenCalledTimes(1);
    cancel();
  });

  it('uses requestIdleCallback when the browser provides it', () => {
    const task = vi.fn();
    const cancelIdleCallback = vi.fn();
    const requestIdleCallback = vi.fn((callback: () => void) => {
      callback();
      return 42;
    });
    Reflect.set(globalThis, 'window', {
      requestIdleCallback,
      cancelIdleCallback,
    });

    const cancel = scheduleReaderIdleTask(task, { timeoutMs: 900 });
    cancel();

    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 900 });
    expect(task).toHaveBeenCalledTimes(1);
    expect(cancelIdleCallback).toHaveBeenCalledWith(42);
  });

  it('falls back to a short cancellable timeout without idle callback support', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    Reflect.set(globalThis, 'window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });

    const cancel = scheduleReaderIdleTask(task, { timeoutMs: 1000 });
    cancel();
    vi.advanceTimersByTime(300);

    expect(task).not.toHaveBeenCalled();
  });
});
