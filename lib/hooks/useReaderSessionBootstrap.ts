import { useEffect, useMemo, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type {
  ReaderManifestIndexState,
  ReaderManifestSnapshot,
  ReaderSessionSnapshot,
} from '../reader/runtime/contracts.ts';
import {
  markReaderTelemetry,
  reportReaderDiagnostic,
} from '../reader/runtime/readerTelemetry.ts';

interface ReaderSessionBootstrapState {
  session: ReaderSessionSnapshot | null;
  manifest: ReaderManifestSnapshot | null;
  summaries: {
    bookmarkCompatibilitySummary?: Record<string, unknown>;
    highlightCompatibilitySummary?: Record<string, unknown>;
  } | null;
  isLoading: boolean;
  error: string | null;
}

function normalizeEnvelope<T>(value: unknown): T {
  const payload = value as any;

  if (payload?.success === false) {
    const code =
      typeof payload?.error?.code === 'string' ? payload.error.code : 'UNKNOWN';
    const message =
      typeof payload?.error?.message === 'string'
        ? payload.error.message
        : 'Callable request failed.';
    throw new Error(`[${code}] ${message}`);
  }

  return (payload?.success === true ? payload.data : payload) as T;
}

function validateReaderSession(value: ReaderSessionSnapshot): ReaderSessionSnapshot {
  if (
    !value ||
    typeof value.signedUrl !== 'string' ||
    value.signedUrl.trim().length === 0
  ) {
    throw new Error('Invalid reader session payload.');
  }

  return value;
}

function normalizeReaderManifest(value: unknown): ReaderManifestSnapshot | null {
  const manifest = value as Partial<ReaderManifestSnapshot> | null;
  if (!manifest || typeof manifest !== 'object') return null;
  if (typeof manifest.bookId !== 'string' || manifest.bookId.trim().length === 0) return null;
  if (typeof manifest.version !== 'number' || !Number.isFinite(manifest.version) || manifest.version <= 0) {
    return null;
  }
  if (typeof manifest.pipelineVersion !== 'string' || manifest.pipelineVersion.trim().length === 0) {
    return null;
  }
  if (manifest.format !== 'pdf' && manifest.format !== 'epub' && manifest.format !== 'unknown') {
    return null;
  }
  if (
    !manifest.locationMap ||
    manifest.locationMap.version !== 'v1' ||
    (manifest.locationMap.mode !== 'page' && manifest.locationMap.mode !== 'logical') ||
    (manifest.locationMap.checkpointUnit !== 'page' && manifest.locationMap.checkpointUnit !== 'spine_item')
  ) {
    return null;
  }
  if (
    !manifest.searchIndex ||
    (manifest.searchIndex.status !== 'pending' && manifest.searchIndex.status !== 'ready') ||
    typeof manifest.searchIndex.docPath !== 'string'
  ) {
    return null;
  }
  if (
    !manifest.highlightAnchors ||
    (manifest.highlightAnchors.status !== 'pending' && manifest.highlightAnchors.status !== 'ready') ||
    typeof manifest.highlightAnchors.docPath !== 'string'
  ) {
    return null;
  }

  const normalizeIndex = (input: unknown, fallbackDocPath: string): ReaderManifestIndexState => {
    const raw = input as Partial<ReaderManifestIndexState> | null;
    return {
      status: raw?.status === 'ready' ? 'ready' : 'pending',
      docPath:
        typeof raw?.docPath === 'string' && raw.docPath.trim().length > 0
          ? raw.docPath.trim()
          : fallbackDocPath,
      schemaVersion: raw?.schemaVersion === 'v1' ? 'v1' : undefined,
    };
  };

  return {
    bookId: manifest.bookId,
    version: Math.trunc(manifest.version),
    pipelineVersion: manifest.pipelineVersion,
    format: manifest.format,
    estimatedPageCount:
      typeof manifest.estimatedPageCount === 'number' &&
      Number.isFinite(manifest.estimatedPageCount) &&
      manifest.estimatedPageCount > 0
        ? Math.trunc(manifest.estimatedPageCount)
        : null,
    locationMap: manifest.locationMap,
    searchIndex: manifest.searchIndex,
    highlightAnchors: manifest.highlightAnchors,
    chapterMap: normalizeIndex(manifest.chapterMap, `reader_chapter_map/${manifest.bookId}`),
    sectionMap: normalizeIndex(manifest.sectionMap, `reader_section_map/${manifest.bookId}`),
    stableAnchors: normalizeIndex(manifest.stableAnchors, `reader_stable_anchors/${manifest.bookId}`),
    spineMap: normalizeIndex(manifest.spineMap, `reader_spine_map/${manifest.bookId}`),
    sectionGraph: normalizeIndex(manifest.sectionGraph, `reader_section_graph/${manifest.bookId}`),
    stableAnchorMap: normalizeIndex(manifest.stableAnchorMap, `reader_stable_anchor_map/${manifest.bookId}`),
    navigationIndex: normalizeIndex(manifest.navigationIndex, `reader_navigation_index/${manifest.bookId}`),
    paginationHints: normalizeIndex(manifest.paginationHints, `reader_pagination_hints/${manifest.bookId}`),
    generatedAtMs:
      typeof manifest.generatedAtMs === 'number' && Number.isFinite(manifest.generatedAtMs)
        ? Math.trunc(manifest.generatedAtMs)
        : Date.now(),
  };
}

export function useReaderSessionBootstrap(bookId?: string): ReaderSessionBootstrapState {
  const [session, setSession] = useState<ReaderSessionSnapshot | null>(null);
  const [manifest, setManifest] = useState<ReaderManifestSnapshot | null>(null);
  const [summaries, setSummaries] = useState<ReaderSessionBootstrapState['summaries']>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(bookId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) {
      setSession(null);
      setManifest(null);
      setSummaries(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(null);
    const startedAt = performance.now();
    markReaderTelemetry('reader_bootstrap_start', { bookId });
    void reportReaderDiagnostic({
      eventName: 'reader_bootstrap_start',
      severity: 'info',
      payload: { bookId, phase: 'bootstrap' },
    });

    const bootstrapFn = httpsCallable<{ bookId: string }, ReaderSessionSnapshot & {
      manifest?: ReaderManifestSnapshot | null;
      bootstrap?: {
        bookmarkCompatibilitySummary?: Record<string, unknown>;
        highlightCompatibilitySummary?: Record<string, unknown>;
      };
    }>(
      getFunctions(),
      'getReaderBootstrap'
    );

    bootstrapFn({ bookId })
      .then((bootstrapResult) => {
        if (!active) return;

        const bootstrapPayload = normalizeEnvelope<ReaderSessionSnapshot & {
          manifest?: ReaderManifestSnapshot | null;
          bootstrap?: {
            bookmarkCompatibilitySummary?: Record<string, unknown>;
            highlightCompatibilitySummary?: Record<string, unknown>;
          };
        }>(bootstrapResult.data);
        const nextSession = validateReaderSession(
          bootstrapPayload
        );
        const nextManifest = normalizeReaderManifest(bootstrapPayload.manifest);
        const durationMs = Number((performance.now() - startedAt).toFixed(2));

        markReaderTelemetry('reader_bootstrap_success', {
          bookId,
          format: nextSession.format,
          durationMs,
          manifestVersion: nextManifest?.version ?? null,
        });
        void reportReaderDiagnostic({
          eventName: 'reader_bootstrap_success',
          severity: 'info',
          payload: {
            bookId,
            format: nextSession.format,
            durationMs,
            manifestVersion: nextManifest?.version ?? null,
          },
        });

        if (!nextManifest) {
          markReaderTelemetry('reader_manifest_failed', {
            bookId,
            phase: 'manifest_hydration',
            recoverable: true,
          });
          void reportReaderDiagnostic({
            eventName: 'reader_manifest_failed',
            severity: 'warn',
            payload: {
              bookId,
              phase: 'manifest_hydration',
              recoverable: true,
            },
          });
        } else if (
          nextManifest.locationMap.status !== 'ready' ||
          nextManifest.sectionGraph?.status !== 'ready' ||
          nextManifest.stableAnchorMap?.status !== 'ready'
        ) {
          void reportReaderDiagnostic({
            eventName: 'reader_manifest_pending',
            severity: 'info',
            payload: {
              bookId,
              format: nextManifest.format,
              manifestVersion: nextManifest.version,
              locationMapStatus: nextManifest.locationMap.status || 'pending',
              sectionGraphStatus: nextManifest.sectionGraph?.status || 'pending',
              stableAnchorMapStatus: nextManifest.stableAnchorMap?.status || 'pending',
              navigationIndexStatus: nextManifest.navigationIndex?.status || 'pending',
              searchIndexStatus: nextManifest.searchIndex.status,
              highlightAnchorsStatus: nextManifest.highlightAnchors.status,
            },
          });
        }

        setSession(nextSession);
        setManifest(nextManifest);
        setSummaries({
          bookmarkCompatibilitySummary: bootstrapPayload.bootstrap?.bookmarkCompatibilitySummary,
          highlightCompatibilitySummary: bootstrapPayload.bootstrap?.highlightCompatibilitySummary,
        });
      })
      .catch((err: any) => {
        if (!active) return;
        const codeMatch = typeof err?.message === 'string' ? err.message.match(/^\[([^\]]+)\]/) : null;
        const code = codeMatch?.[1] || 'unknown';
        markReaderTelemetry('reader_bootstrap_failed', {
          bookId,
          code,
          phase: 'bootstrap',
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
        });
        void reportReaderDiagnostic({
          eventName: 'reader_bootstrap_failed',
          severity: 'error',
          payload: {
            bookId,
            code,
            phase: 'bootstrap',
            durationMs: Number((performance.now() - startedAt).toFixed(2)),
          },
        });
        setError(String(err?.message || err));
        setSession(null);
        setManifest(null);
        setSummaries(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [bookId]);

  return useMemo(
    () => ({
      session,
      manifest,
      summaries,
      isLoading,
      error,
    }),
    [session, manifest, summaries, isLoading, error]
  );
}
