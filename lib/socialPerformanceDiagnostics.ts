import { useEffect, useRef } from 'react';
import { devInfo } from './logging/devLog.ts';

type SocialMetricName =
  | 'social_attachment_commit'
  | 'social_cache_invalidation'
  | 'social_feed_fetch'
  | 'social_feed_virtualization'
  | 'social_interaction_mutation'
  | 'social_render_commit'
  | 'social_render_mount';

type MetricValue = string | number | boolean | null | undefined;
type MetricPayload = Record<string, MetricValue>;

type SocialMetric = {
  at: string;
  name: SocialMetricName;
  values: Record<string, string | number | boolean | null>;
};

const MAX_METRICS = 200;
const ENABLED_STORAGE_KEY = 'booktown:socialDiagnostics';
const SAFE_STRING_KEYS = new Set([
  'attachmentType',
  'component',
  'kind',
  'reason',
  'scope',
  'status',
  'surface',
  'viewMode',
]);

const metrics: SocialMetric[] = [];

declare global {
  interface Window {
    __BOOKTOWN_SOCIAL_DIAGNOSTICS__?: {
      clear: () => void;
      disable: () => void;
      enable: () => void;
      metrics: () => SocialMetric[];
    };
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isEnabled(): boolean {
  if (!import.meta.env.DEV || !isBrowser()) return false;
  try {
    return window.localStorage.getItem(ENABLED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function sanitizeMetricPayload(payload: MetricPayload): Record<string, string | number | boolean | null> {
  return Object.entries(payload).reduce<Record<string, string | number | boolean | null>>((safe, [key, value]) => {
    if (typeof value === 'number') {
      safe[key] = Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
      return safe;
    }
    if (typeof value === 'boolean' || value === null || value === undefined) {
      safe[key] = value ?? null;
      return safe;
    }
    if (SAFE_STRING_KEYS.has(key)) {
      safe[key] = value.slice(0, 80);
      return safe;
    }
    safe[key] = '[redacted]';
    return safe;
  }, {});
}

export function installSocialDiagnosticsDevSurface(): void {
  if (!import.meta.env.DEV || !isBrowser() || window.__BOOKTOWN_SOCIAL_DIAGNOSTICS__) return;

  window.__BOOKTOWN_SOCIAL_DIAGNOSTICS__ = {
    clear: () => {
      metrics.splice(0, metrics.length);
    },
    disable: () => {
      window.localStorage.removeItem(ENABLED_STORAGE_KEY);
    },
    enable: () => {
      window.localStorage.setItem(ENABLED_STORAGE_KEY, '1');
    },
    metrics: () => [...metrics],
  };
}

export function recordSocialPerformanceMetric(name: SocialMetricName, payload: MetricPayload = {}): void {
  installSocialDiagnosticsDevSurface();
  if (!isEnabled()) return;

  const metric: SocialMetric = {
    at: new Date().toISOString(),
    name,
    values: sanitizeMetricPayload(payload),
  };

  metrics.push(metric);
  if (metrics.length > MAX_METRICS) {
    metrics.splice(0, metrics.length - MAX_METRICS);
  }

  devInfo('[SOCIAL_DIAGNOSTIC]', metric);
}

export function useSocialRenderDiagnostics(
  component: string,
  payload: MetricPayload = {}
): void {
  if (!import.meta.env.DEV) return;

  const mountedAtRef = useRef<number>(0);
  const renderCountRef = useRef(0);

  renderCountRef.current += 1;

  useEffect(() => {
    mountedAtRef.current = performance.now();
    recordSocialPerformanceMetric('social_render_mount', {
      ...payload,
      component,
    });
    return () => {
      recordSocialPerformanceMetric('social_render_commit', {
        ...payload,
        component,
        renderCount: renderCountRef.current,
        mountedMs: mountedAtRef.current > 0 ? performance.now() - mountedAtRef.current : 0,
        status: 'unmount',
      });
    };
  }, [component]);

  useEffect(() => {
    const renderCount = renderCountRef.current;
    if (renderCount > 3 && renderCount % 10 !== 0) return;
    recordSocialPerformanceMetric('social_render_commit', {
      ...payload,
      component,
      renderCount,
      mountedMs: mountedAtRef.current > 0 ? performance.now() - mountedAtRef.current : 0,
      status: 'commit',
    });
  });
}

export async function measureSocialAsync<T>(
  name: SocialMetricName,
  payload: MetricPayload,
  action: () => Promise<T>
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await action();
    recordSocialPerformanceMetric(name, {
      ...payload,
      durationMs: performance.now() - startedAt,
      status: 'success',
    });
    return result;
  } catch (error) {
    recordSocialPerformanceMetric(name, {
      ...payload,
      durationMs: performance.now() - startedAt,
      status: 'error',
      reason: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}

installSocialDiagnosticsDevSurface();
