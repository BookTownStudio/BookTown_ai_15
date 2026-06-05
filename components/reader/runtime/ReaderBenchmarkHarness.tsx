import React, { useCallback, useEffect, useState } from 'react';
import ReaderSurface from './ReaderSurface.tsx';
import type { ReaderManifestSnapshot } from '../../../lib/reader/runtime/contracts.ts';
import {
  markReaderTelemetry,
  markReaderTelemetryError,
  observeReaderLayoutShifts,
  observeReaderLongTasks,
  resetReaderPerfMetrics,
  sampleReaderMemory,
} from '../../../lib/reader/runtime/readerTelemetry.ts';

const FIXTURE_URL = '/fixtures/reader-benchmark.pdf';
const ALLOWED_FIXTURE_PREFIX = '/fixtures/reader-corpus/';

function resolveBenchmarkFixture(): {
  signedUrl: string;
  format: 'pdf' | 'epub';
  readingMode: 'page' | 'scroll';
  initialPage: number;
  useCanonicalManifest: boolean;
} {
  if (typeof window === 'undefined') {
    return {
      signedUrl: FIXTURE_URL,
      format: 'pdf',
      readingMode: 'page',
      initialPage: 1,
      useCanonicalManifest: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const requestedFixture = params.get('fixture');
  const safeFixture =
    requestedFixture?.startsWith(ALLOWED_FIXTURE_PREFIX) === true
      ? requestedFixture
      : FIXTURE_URL;
  const format = safeFixture.endsWith('.epub') ? 'epub' : 'pdf';
  const requestedMode = params.get('mode');
  const readingMode = requestedMode === 'scroll' ? 'scroll' : 'page';
  const parsedInitialPage = Number.parseInt(params.get('initialPage') ?? '1', 10);

  return {
    signedUrl: safeFixture,
    format,
    readingMode,
    initialPage: Number.isFinite(parsedInitialPage) ? Math.max(1, parsedInitialPage) : 1,
    useCanonicalManifest: params.get('canonicalManifest') === '1',
  };
}

function buildBenchmarkCanonicalManifest(fixture: ReturnType<typeof resolveBenchmarkFixture>): ReaderManifestSnapshot | null {
  if (fixture.format !== 'epub' || !fixture.useCanonicalManifest) return null;

  const payload = JSON.stringify([
    'epubcfi(/6/2!/4/2/1:0)',
    'epubcfi(/6/4!/4/2/1:0)',
    'epubcfi(/6/6!/4/2/1:0)',
    'epubcfi(/6/8!/4/2/1:0)',
  ]);

  return {
    bookId: 'reader-benchmark-fixture',
    version: 1,
    pipelineVersion: 'reader_manifest_v2',
    format: 'epub',
    estimatedPageCount: null,
    locationMap: {
      version: 'v1',
      mode: 'logical',
      checkpointUnit: 'spine_item',
      status: 'ready',
      source: 'server_precomputed',
      anchorSchema: 'canonical_anchor_v1',
      identity: {
        bookId: 'reader-benchmark-fixture',
        manifestVersion: 1,
        pipelineVersion: 'reader_manifest_v2',
        sourceSignatureHash: 'fixture',
        generationChars: 1200,
      },
      generationChars: 1200,
      locationCount: 4,
      payload,
    },
    searchIndex: { status: 'pending', docPath: 'reader_search_index/reader-benchmark-fixture' },
    highlightAnchors: { status: 'pending', docPath: 'reader_highlight_anchors/reader-benchmark-fixture' },
    generatedAtMs: Date.now(),
  };
}

const ReaderBenchmarkHarness: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [fixture] = useState(resolveBenchmarkFixture);
  const [canonicalManifest] = useState(() => buildBenchmarkCanonicalManifest(fixture));
  const firstPageMarkedRef = React.useRef(false);

  useEffect(() => {
    resetReaderPerfMetrics();
    const stopObservingLongTasks = observeReaderLongTasks();
    const stopObservingLayoutShifts = observeReaderLayoutShifts();
    const memoryTimer = window.setInterval(() => sampleReaderMemory(), 1000);
    markReaderTelemetry('reader_open_start', {
      surface: 'reader_browser_perf_gate',
      format: fixture.format,
      fixture: fixture.signedUrl,
    });
    markReaderTelemetry('signed_url_received', {
      source: 'local_fixture',
    });
    markReaderTelemetry('manifest_loaded', {
      source: 'local_fixture',
    });
    return () => {
      stopObservingLongTasks();
      stopObservingLayoutShifts();
      window.clearInterval(memoryTimer);
    };
  }, [fixture.format, fixture.signedUrl]);

  const handleError = useCallback((message: string) => {
    setError(message);
    markReaderTelemetryError(new Error(message));
  }, []);

  const handleDocumentLoad = useCallback((numPages: number) => {
    markReaderTelemetry('pdf_runtime_ready', {
      numPages,
    });
  }, []);

  const handleFirstPageRender = useCallback(() => {
    if (firstPageMarkedRef.current) return;
    firstPageMarkedRef.current = true;
    markReaderTelemetry('first_page_rendered');
    markReaderTelemetry('first_interaction_ready');
  }, []);

  const handlePageChange = useCallback(
    (_currentPage: number, totalPages: number) => {
      if (fixture.format === 'epub' && !firstPageMarkedRef.current) {
        firstPageMarkedRef.current = true;
        markReaderTelemetry('epub_runtime_ready', { totalPages });
        markReaderTelemetry('first_page_rendered');
        markReaderTelemetry('first_interaction_ready');
      }
    },
    [fixture.format]
  );

  return (
    <div className="h-[100dvh] w-full bg-black text-white">
      {error ? (
        <div className="flex h-full items-center justify-center p-6 text-sm text-red-200">
          {error}
        </div>
      ) : (
        <ReaderSurface
          selection={{
            engine: fixture.format === 'epub' ? 'web_epub' : 'web_pdf',
            format: fixture.format,
          }}
          signedUrl={fixture.signedUrl}
          initialPage={fixture.initialPage}
          theme="dark"
          readingMode={fixture.readingMode}
          fontSize="md"
          fontStyle="default"
          lineHeight="standard"
          margin="normal"
          highlights={[]}
          manifest={canonicalManifest}
          onPageChange={handlePageChange}
          onPdfLoadError={handleError}
          onEpubLoadError={handleError}
          onPdfDocumentLoadSuccess={handleDocumentLoad}
          onPdfFirstPageRender={handleFirstPageRender}
          renderUnsupported={() => null}
        />
      )}
    </div>
  );
};

export default ReaderBenchmarkHarness;
