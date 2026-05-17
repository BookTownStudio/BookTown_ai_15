export type ReaderTelemetryEventName =
  | 'reader_open_start'
  | 'manifest_loaded'
  | 'signed_url_received'
  | 'epub_runtime_ready'
  | 'pdf_runtime_ready'
  | 'pdf_survival_fallback'
  | 'first_page_rendered'
  | 'first_interaction_ready'
  | 'reader_chrome_visibility'
  | 'reader_runtime_prewarm'
  | 'hydration_deferred'
  | 'hydration_completed'
  | 'epub_canonical_locations_loaded'
  | 'epub_canonical_locations_fallback'
  | 'epub_locations_cache_hit'
  | 'epub_locations_cache_miss'
  | 'epub_locations_generate_time'
  | 'page_turn_latency'
  | 'scroll_fps'
  | 'dropped_frames'
  | 'long_task'
  | 'layout_shift'
  | 'memory_usage'
  | 'highlight_creation_latency'
  | 'offline_queue_size'
  | 'offline_flush_time'
  | 'sync_failure_rate'
  | 'render_crashes';

type ReaderTelemetryPayload = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    __readerPerfMetrics?: {
      done?: boolean;
      error?: string;
      openStartedAtMs?: number;
      manifestLoadedMs?: number;
      signedUrlReceivedMs?: number;
      pdfRuntimeReadyMs?: number;
      epubRuntimeReadyMs?: number;
      firstPageRenderMs?: number;
      firstInteractionReadyMs?: number;
      coldOpenMs?: number;
      longTaskCount?: number;
      longTaskTotalMs?: number;
      layoutShiftScore?: number;
      events?: Array<{
        name: ReaderTelemetryEventName;
        atMs: number;
        elapsedMs: number;
        payload?: ReaderTelemetryPayload;
      }>;
    };
  }
}

const PERF_KEY_BY_EVENT: Partial<Record<ReaderTelemetryEventName, keyof NonNullable<Window['__readerPerfMetrics']>>> = {
  manifest_loaded: 'manifestLoadedMs',
  signed_url_received: 'signedUrlReceivedMs',
  epub_runtime_ready: 'epubRuntimeReadyMs',
  pdf_runtime_ready: 'pdfRuntimeReadyMs',
  first_page_rendered: 'firstPageRenderMs',
  first_interaction_ready: 'firstInteractionReadyMs',
};

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function ensurePerfMetrics(startedAtMs = nowMs()) {
  if (typeof window === 'undefined') return null;
  if (!window.__readerPerfMetrics) {
    window.__readerPerfMetrics = {
      done: false,
      openStartedAtMs: startedAtMs,
      events: [],
    };
  }
  if (typeof window.__readerPerfMetrics.openStartedAtMs !== 'number') {
    window.__readerPerfMetrics.openStartedAtMs = startedAtMs;
  }
  if (!Array.isArray(window.__readerPerfMetrics.events)) {
    window.__readerPerfMetrics.events = [];
  }
  return window.__readerPerfMetrics;
}

export function resetReaderPerfMetrics(): number {
  const startedAtMs = nowMs();
  if (typeof window !== 'undefined') {
    window.__readerPerfMetrics = {
      done: false,
      openStartedAtMs: startedAtMs,
      events: [],
    };
  }
  return startedAtMs;
}

export function markReaderTelemetry(
  name: ReaderTelemetryEventName,
  payload?: ReaderTelemetryPayload
): void {
  const atMs = nowMs();
  const metrics = ensurePerfMetrics(atMs);
  const elapsedMs = atMs - (metrics?.openStartedAtMs ?? atMs);

  if (metrics) {
    metrics.events?.push({
      name,
      atMs,
      elapsedMs,
      ...(payload ? { payload } : {}),
    });

    const key = PERF_KEY_BY_EVENT[name];
    if (key && typeof metrics[key] !== 'number') {
      metrics[key] = elapsedMs as never;
    }

    if (name === 'first_interaction_ready' && typeof metrics.coldOpenMs !== 'number') {
      metrics.coldOpenMs = elapsedMs;
      metrics.done = true;
    }
  }

  if (import.meta.env.DEV) {
    console.debug('[READER_TELEMETRY]', name, {
      elapsedMs: Number(elapsedMs.toFixed(2)),
      ...(payload || {}),
    });
  }
}

export function markReaderTelemetryError(error: unknown): void {
  if (typeof window !== 'undefined') {
    const metrics = ensurePerfMetrics();
    if (metrics) {
      metrics.error = error instanceof Error ? error.message : String(error);
      metrics.done = true;
    }
  }
  markReaderTelemetry('render_crashes', {
    message: error instanceof Error ? error.message : String(error),
  });
}

export function sampleReaderMemory(): void {
  if (typeof performance === 'undefined') return;
  const memory = (performance as Performance & {
    memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number };
  }).memory;
  if (!memory || typeof memory.usedJSHeapSize !== 'number') return;

  markReaderTelemetry('memory_usage', {
    usedJSHeapSize: Math.trunc(memory.usedJSHeapSize),
    jsHeapSizeLimit:
      typeof memory.jsHeapSizeLimit === 'number' ? Math.trunc(memory.jsHeapSizeLimit) : null,
  });
}

export function observeReaderLongTasks(): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => {};
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < 50) continue;
        if (typeof window !== 'undefined') {
          const metrics = ensurePerfMetrics();
          if (metrics) {
            metrics.longTaskCount = (metrics.longTaskCount ?? 0) + 1;
            metrics.longTaskTotalMs = (metrics.longTaskTotalMs ?? 0) + entry.duration;
          }
        }
        markReaderTelemetry('long_task', {
          durationMs: Math.round(entry.duration),
          startTimeMs: Math.round(entry.startTime),
        });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}

export function observeReaderLayoutShifts(): () => void {
  if (typeof PerformanceObserver === 'undefined') {
    return () => {};
  }

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const layoutShift = entry as PerformanceEntry & {
          value?: number;
          hadRecentInput?: boolean;
        };
        if (layoutShift.hadRecentInput) continue;
        const value = typeof layoutShift.value === 'number' ? layoutShift.value : 0;
        if (value <= 0) continue;
        if (typeof window !== 'undefined') {
          const metrics = ensurePerfMetrics();
          if (metrics) {
            metrics.layoutShiftScore = (metrics.layoutShiftScore ?? 0) + value;
          }
        }
        markReaderTelemetry('layout_shift', {
          score: Number(value.toFixed(4)),
          startTimeMs: Math.round(entry.startTime),
        });
      }
    });
    observer.observe({ type: 'layout-shift', buffered: true });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}
