import { useEffect, useMemo, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase.ts';
import type {
  ReaderManifestIndexState,
  ReaderManifestSnapshot,
  ReaderSectionGraphNode,
  ReaderSectionGraphSnapshot,
  ReaderSessionSnapshot,
} from '../reader/runtime/contracts.ts';
import {
  markReaderTelemetry,
  reportReaderDiagnostic,
} from '../reader/runtime/readerTelemetry.ts';

interface ReaderSessionBootstrapState {
  session: ReaderSessionSnapshot | null;
  manifest: ReaderManifestSnapshot | null;
  sectionGraph: ReaderSectionGraphSnapshot | null;
  summaries: {
    bookmarkCompatibilitySummary?: Record<string, unknown>;
    highlightCompatibilitySummary?: Record<string, unknown>;
  } | null;
  isLoading: boolean;
  error: string | null;
}

function resolveReaderIndexDocPath(docPath: string): [string, string] | null {
  const parts = docPath.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  if (parts[0] !== 'reader_section_graph') return null;
  return [parts[0], parts[1]];
}

function normalizeSectionGraphNode(value: unknown): ReaderSectionGraphNode | null {
  const raw = value as Partial<ReaderSectionGraphNode> | null;
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.sectionId !== 'string' || raw.sectionId.trim().length === 0) return null;
  if (typeof raw.spineIndex !== 'number' || !Number.isFinite(raw.spineIndex) || raw.spineIndex < 0) {
    return null;
  }
  if (typeof raw.href !== 'string' || raw.href.trim().length === 0) return null;
  if (raw.title !== null && raw.title !== undefined && typeof raw.title !== 'string') return null;
  if (
    raw.parentSectionId !== null &&
    raw.parentSectionId !== undefined &&
    typeof raw.parentSectionId !== 'string'
  ) {
    return null;
  }
  if (!Array.isArray(raw.childSectionIds) || raw.childSectionIds.some((id) => typeof id !== 'string')) {
    return null;
  }

  const title = typeof raw.title === 'string' && raw.title.trim().length > 0 ? raw.title.trim() : null;
  return {
    sectionId: raw.sectionId.trim(),
    spineIndex: Math.trunc(raw.spineIndex),
    href: raw.href.trim(),
    title,
    parentSectionId:
      typeof raw.parentSectionId === 'string' && raw.parentSectionId.trim().length > 0
        ? raw.parentSectionId.trim()
        : null,
    childSectionIds: raw.childSectionIds.map((id) => id.trim()).filter(Boolean),
  };
}

function normalizeSectionGraphSnapshot(
  value: unknown,
  manifest: ReaderManifestSnapshot
): ReaderSectionGraphSnapshot | null {
  const raw = value as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object') return null;
  if (raw.schemaVersion !== 'v1') return null;
  if (raw.bookId !== manifest.bookId) return null;
  if (raw.manifestVersion !== manifest.version) return null;

  const expectedSourceHash = manifest.locationMap.identity?.sourceSignatureHash;
  if (
    typeof expectedSourceHash !== 'string' ||
    expectedSourceHash.trim().length === 0 ||
    raw.sourceSignatureHash !== expectedSourceHash
  ) {
    return null;
  }

  if (!Array.isArray(raw.sections)) return null;
  const sections = raw.sections
    .map((section) => normalizeSectionGraphNode(section))
    .filter((section): section is ReaderSectionGraphNode => Boolean(section));
  if (sections.length !== raw.sections.length || sections.length === 0) return null;

  return {
    schemaVersion: 'v1',
    bookId: manifest.bookId,
    manifestVersion: manifest.version,
    sourceSignatureHash: expectedSourceHash,
    sections,
  };
}

async function hydrateReaderSectionGraph(
  manifest: ReaderManifestSnapshot | null
): Promise<ReaderSectionGraphSnapshot | null> {
  if (!manifest || manifest.format !== 'epub') return null;
  if (manifest.sectionGraph?.status !== 'ready') return null;
  if (typeof manifest.sectionGraph.docPath !== 'string' || manifest.sectionGraph.docPath.trim().length === 0) {
    return null;
  }
  const resolvedPath = resolveReaderIndexDocPath(manifest.sectionGraph.docPath);
  if (!resolvedPath) return null;

  try {
    const snapshot = await getDoc(doc(getFirebaseDb(), resolvedPath[0], resolvedPath[1]));
    if (!snapshot.exists()) return null;
    return normalizeSectionGraphSnapshot(snapshot.data(), manifest);
  } catch (error) {
    console.warn('[READER][SECTION_GRAPH_HYDRATION_SKIPPED]', error);
    return null;
  }
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
  const [sectionGraph, setSectionGraph] = useState<ReaderSectionGraphSnapshot | null>(null);
  const [summaries, setSummaries] = useState<ReaderSessionBootstrapState['summaries']>(null);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(bookId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId) {
      setSession(null);
      setManifest(null);
      setSectionGraph(null);
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
        setSectionGraph(null);
        setSummaries({
          bookmarkCompatibilitySummary: bootstrapPayload.bootstrap?.bookmarkCompatibilitySummary,
          highlightCompatibilitySummary: bootstrapPayload.bootstrap?.highlightCompatibilitySummary,
        });

        void hydrateReaderSectionGraph(nextManifest).then((nextSectionGraph) => {
          if (active) setSectionGraph(nextSectionGraph);
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
        setSectionGraph(null);
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
      sectionGraph,
      summaries,
      isLoading,
      error,
    }),
    [session, manifest, sectionGraph, summaries, isLoading, error]
  );
}
