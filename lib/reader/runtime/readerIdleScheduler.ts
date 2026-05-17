export function scheduleReaderIdleTask(
  task: () => void,
  options: { timeoutMs?: number } = {}
): () => void {
  if (typeof window === 'undefined') {
    task();
    return () => {};
  }

  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(
      () => {
        task();
      },
      { timeout: options.timeoutMs ?? 1200 }
    );
    return () => {
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
    };
  }

  const timeoutId = window.setTimeout(task, Math.min(options.timeoutMs ?? 1200, 250));
  return () => window.clearTimeout(timeoutId);
}
