const IS_ENABLED = import.meta.env.DEV;
const MAX_SAMPLES_PER_METRIC = 240;
const MAX_LOGS = 120;
const FIRESTORE_WARNING_BYTES = 750_000;
const FIRESTORE_CRITICAL_BYTES = 950_000;

type TelemetryCategory =
  | 'editor'
  | 'render'
  | 'autosave'
  | 'memory'
  | 'lifecycle'
  | 'recovery'
  | 'hydration'
  | 'manuscript'
  | 'sync'
  | 'guard';

export type WriteTelemetryLog = {
  id: number;
  at: number;
  category: TelemetryCategory;
  event: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  detail?: Record<string, unknown>;
};

export type TimingSummary = {
  name: string;
  count: number;
  latestMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

export type RenderSummary = {
  component: string;
  count: number;
  latestChangedKeys: string[];
  latestActualDurationMs?: number;
};

export type AutosaveState = {
  attempts: number;
  successes: number;
  failures: number;
  queued: boolean;
  lastQueueDelayMs?: number;
  lastPayloadBytes?: number;
  lastNetworkMs?: number;
  lastCompletionMs?: number;
  lastFailureReason?: string;
};

export type WriteTelemetrySnapshot = {
  enabled: boolean;
  timings: TimingSummary[];
  renders: RenderSummary[];
  counters: Record<string, number>;
  gauges: Record<string, number>;
  autosave: AutosaveState;
  logs: WriteTelemetryLog[];
};

type Subscriber = () => void;

const timingSamples = new Map<string, number[]>();
const renderSummaries = new Map<string, RenderSummary>();
const counters = new Map<string, number>();
const gauges = new Map<string, number>();
const logs: WriteTelemetryLog[] = [];
const subscribers = new Set<Subscriber>();
const warnRateLimit = new Map<string, number>();
let logId = 0;

const autosaveState: AutosaveState = {
  attempts: 0,
  successes: 0,
  failures: 0,
  queued: false,
};

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function emitChange(): void {
  if (!IS_ENABLED) return;
  subscribers.forEach((subscriber) => subscriber());
}

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function pushLog(entry: Omit<WriteTelemetryLog, 'id' | 'at'>): void {
  if (!IS_ENABLED) return;
  const nextLog: WriteTelemetryLog = {
    ...entry,
    id: ++logId,
    at: Date.now(),
  };
  logs.unshift(nextLog);
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }

  if (entry.level === 'warn' || entry.level === 'error') {
    const method = entry.level === 'error' ? console.error : console.warn;
    method('[WRITE_TELEMETRY]', nextLog);
  } else {
    console.info('[WRITE_TELEMETRY]', nextLog);
  }
}

function warnRateLimited(key: string, event: string, detail?: Record<string, unknown>): void {
  if (!IS_ENABLED) return;
  const current = Date.now();
  const previous = warnRateLimit.get(key) ?? 0;
  if (current - previous < 10_000) {
    return;
  }
  warnRateLimit.set(key, current);
  pushLog({
    category: 'guard',
    event,
    level: 'warn',
    detail,
  });
}

function byteLength(value: string): number {
  if (!value) return 0;
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

function safeJsonBytes(value: unknown): number {
  try {
    return byteLength(JSON.stringify(value ?? null));
  } catch {
    return 0;
  }
}

function updateFirestoreRiskGauge(label: string, bytes: number): void {
  if (!IS_ENABLED) return;
  if (bytes >= FIRESTORE_CRITICAL_BYTES) {
    warnRateLimited(`${label}:critical`, 'document_size_critical', { label, bytes });
    return;
  }
  if (bytes >= FIRESTORE_WARNING_BYTES) {
    warnRateLimited(`${label}:warning`, 'document_size_warning', { label, bytes });
  }
}

export const writeEditorTelemetry = {
  enabled: IS_ENABLED,

  subscribe(subscriber: Subscriber): () => void {
    if (!IS_ENABLED) return () => undefined;
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  },

  log(category: TelemetryCategory, event: string, detail?: Record<string, unknown>, level: WriteTelemetryLog['level'] = 'info'): void {
    pushLog({ category, event, level, detail });
    emitChange();
  },

  increment(name: string, amount = 1): void {
    if (!IS_ENABLED) return;
    counters.set(name, (counters.get(name) ?? 0) + amount);
    emitChange();
  },

  gauge(name: string, value: number): void {
    if (!IS_ENABLED || !Number.isFinite(value)) return;
    gauges.set(name, round(value));
    emitChange();
  },

  timing(name: string, durationMs: number, detail?: Record<string, unknown>): void {
    if (!IS_ENABLED || !Number.isFinite(durationMs)) return;
    const samples = timingSamples.get(name) ?? [];
    samples.push(round(durationMs));
    if (samples.length > MAX_SAMPLES_PER_METRIC) {
      samples.splice(0, samples.length - MAX_SAMPLES_PER_METRIC);
    }
    timingSamples.set(name, samples);

    if (name.includes('keystroke') && durationMs > 16) {
      warnRateLimited('keystroke:slow', 'slow_keystroke_processing', {
        durationMs: round(durationMs),
        ...detail,
      });
    }

    if (name.includes('render') && durationMs > 50) {
      warnRateLimited(`render:${name}`, 'slow_render_commit', {
        name,
        durationMs: round(durationMs),
        ...detail,
      });
    }

    emitChange();
  },

  measure<T>(name: string, fn: () => T, detail?: Record<string, unknown>): T {
    if (!IS_ENABLED) return fn();
    const startedAt = now();
    try {
      return fn();
    } finally {
      this.timing(name, now() - startedAt, detail);
    }
  },

  startTimer(name: string, detail?: Record<string, unknown>): () => number {
    if (!IS_ENABLED) return () => 0;
    const startedAt = now();
    return () => {
      const durationMs = now() - startedAt;
      this.timing(name, durationMs, detail);
      return durationMs;
    };
  },

  recordRender(component: string, changedKeys: string[], actualDurationMs?: number): void {
    if (!IS_ENABLED) return;
    const previous = renderSummaries.get(component);
    renderSummaries.set(component, {
      component,
      count: (previous?.count ?? 0) + 1,
      latestChangedKeys: changedKeys,
      latestActualDurationMs:
        typeof actualDurationMs === 'number' && Number.isFinite(actualDurationMs)
          ? round(actualDurationMs)
          : previous?.latestActualDurationMs,
    });
    counters.set(`render.${component}`, (counters.get(`render.${component}`) ?? 0) + 1);
    if (typeof actualDurationMs === 'number') {
      this.timing(`render.${component}`, actualDurationMs, { changedKeys });
    }
    emitChange();
  },

  recordSnapshotSizes(params: {
    html?: string;
    plainText?: string;
    contentDoc?: unknown;
    editorJson?: unknown;
    localDraft?: unknown;
    label?: string;
  }): void {
    if (!IS_ENABLED) return;
    const label = params.label ?? 'editor';
    const htmlBytes = params.html !== undefined ? byteLength(params.html) : undefined;
    const plainTextBytes = params.plainText !== undefined ? byteLength(params.plainText) : undefined;
    const contentDocBytes = params.contentDoc !== undefined ? safeJsonBytes(params.contentDoc) : undefined;
    const editorStateBytes = params.editorJson !== undefined ? safeJsonBytes(params.editorJson) : undefined;
    const localDraftBytes = params.localDraft !== undefined ? safeJsonBytes(params.localDraft) : undefined;

    if (htmlBytes !== undefined) this.gauge(`${label}.htmlBytes`, htmlBytes);
    if (plainTextBytes !== undefined) this.gauge(`${label}.plainTextBytes`, plainTextBytes);
    if (contentDocBytes !== undefined) {
      this.gauge(`${label}.contentDocBytes`, contentDocBytes);
      updateFirestoreRiskGauge(`${label}.contentDoc`, contentDocBytes);
    }
    if (editorStateBytes !== undefined) this.gauge(`${label}.editorStateBytes`, editorStateBytes);
    if (localDraftBytes !== undefined) this.gauge(`${label}.localDraftBytes`, localDraftBytes);

    const duplicatedPayloadBytes =
      (htmlBytes ?? 0) + (plainTextBytes ?? 0) + (contentDocBytes ?? 0);
    if (duplicatedPayloadBytes > 0) {
      this.gauge(`${label}.duplicatedPayloadBytes`, duplicatedPayloadBytes);
      updateFirestoreRiskGauge(`${label}.duplicatedPayload`, duplicatedPayloadBytes);
    }
  },

  sampleHeap(label = 'editor'): void {
    if (!IS_ENABLED || typeof performance === 'undefined') return;
    const memory = (performance as Performance & {
      memory?: { usedJSHeapSize?: number; totalJSHeapSize?: number; jsHeapSizeLimit?: number };
    }).memory;
    if (!memory) return;
    if (typeof memory.usedJSHeapSize === 'number') this.gauge(`${label}.usedJSHeapBytes`, memory.usedJSHeapSize);
    if (typeof memory.totalJSHeapSize === 'number') this.gauge(`${label}.totalJSHeapBytes`, memory.totalJSHeapSize);
    if (typeof memory.jsHeapSizeLimit === 'number') this.gauge(`${label}.heapLimitBytes`, memory.jsHeapSizeLimit);
  },

  autosaveQueued(queueDelayMs?: number): void {
    if (!IS_ENABLED) return;
    autosaveState.queued = true;
    if (typeof queueDelayMs === 'number' && Number.isFinite(queueDelayMs)) {
      autosaveState.lastQueueDelayMs = round(queueDelayMs);
      this.timing('autosave.queueDelay', queueDelayMs);
    }
    this.increment('autosave.triggered');
    emitChange();
  },

  autosaveAttempt(payloadBytes?: number): void {
    if (!IS_ENABLED) return;
    autosaveState.attempts += 1;
    if (typeof payloadBytes === 'number' && Number.isFinite(payloadBytes)) {
      autosaveState.lastPayloadBytes = payloadBytes;
      this.gauge('autosave.payloadBytes', payloadBytes);
      if (payloadBytes >= FIRESTORE_WARNING_BYTES) {
        warnRateLimited('autosave:payload', 'autosave_payload_size_risk', { payloadBytes });
      }
    }
    this.increment('autosave.attempt');
    emitChange();
  },

  autosaveSuccess(networkMs: number, completionMs?: number): void {
    if (!IS_ENABLED) return;
    autosaveState.successes += 1;
    autosaveState.queued = false;
    autosaveState.lastNetworkMs = round(networkMs);
    if (typeof completionMs === 'number' && Number.isFinite(completionMs)) {
      autosaveState.lastCompletionMs = round(completionMs);
      this.timing('autosave.completion', completionMs);
    }
    this.timing('autosave.network', networkMs);
    this.increment('autosave.success');
    emitChange();
  },

  autosaveFailure(reason: string, networkMs?: number): void {
    if (!IS_ENABLED) return;
    autosaveState.failures += 1;
    autosaveState.queued = false;
    autosaveState.lastFailureReason = reason;
    if (typeof networkMs === 'number' && Number.isFinite(networkMs)) {
      autosaveState.lastNetworkMs = round(networkMs);
      this.timing('autosave.networkFailed', networkMs);
    }
    this.increment('autosave.failure');
    pushLog({
      category: 'autosave',
      event: 'autosave_failed',
      level: 'warn',
      detail: { reason },
    });
    emitChange();
  },

  getSnapshot(): WriteTelemetrySnapshot {
    const timings = Array.from(timingSamples.entries())
      .map(([name, samples]) => {
        const sorted = [...samples].sort((a, b) => a - b);
        return {
          name,
          count: samples.length,
          latestMs: samples[samples.length - 1] ?? 0,
          p50Ms: round(percentile(sorted, 0.5)),
          p95Ms: round(percentile(sorted, 0.95)),
          maxMs: round(sorted[sorted.length - 1] ?? 0),
        };
      })
      .sort((a, b) => b.p95Ms - a.p95Ms);

    return {
      enabled: IS_ENABLED,
      timings,
      renders: Array.from(renderSummaries.values()).sort((a, b) => b.count - a.count),
      counters: Object.fromEntries(counters),
      gauges: Object.fromEntries(gauges),
      autosave: { ...autosaveState },
      logs: [...logs],
    };
  },
};

export function getWriteTelemetryPayloadBytes(value: unknown): number {
  if (!IS_ENABLED) return 0;
  return safeJsonBytes(value);
}
