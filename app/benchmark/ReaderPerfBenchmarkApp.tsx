import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReaderSurface from '../../components/reader/runtime/ReaderSurface.tsx';
import { resolveReaderEngine } from '../../lib/reader/runtime/engineSelection.ts';

type ReaderPerfMetrics = {
  coldOpenMs: number | null;
  firstPageRenderMs: number | null;
  done: boolean;
  error: string | null;
};

declare global {
  interface Window {
    __readerPerfMetrics?: ReaderPerfMetrics;
  }
}

const FIXTURE_URL = '/fixtures/reader-benchmark.pdf';

const ReaderPerfBenchmarkApp: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [coldOpenMs, setColdOpenMs] = useState<number | null>(null);
  const [firstPageRenderMs, setFirstPageRenderMs] = useState<number | null>(null);

  const selection = useMemo(
    () =>
      resolveReaderEngine({
        platform: 'web',
        format: 'pdf',
      }),
    []
  );

  const publishMetrics = useCallback(
    (next: Partial<ReaderPerfMetrics> = {}) => {
      const current: ReaderPerfMetrics = {
        coldOpenMs,
        firstPageRenderMs,
        done: Boolean(coldOpenMs !== null && firstPageRenderMs !== null && !error),
        error,
        ...next,
      };
      window.__readerPerfMetrics = current;
    },
    [coldOpenMs, firstPageRenderMs, error]
  );

  useEffect(() => {
    publishMetrics({
      coldOpenMs: null,
      firstPageRenderMs: null,
      done: false,
      error: null,
    });
  }, [publishMetrics]);

  useEffect(() => {
    publishMetrics();
  }, [coldOpenMs, firstPageRenderMs, error, publishMetrics]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (coldOpenMs === null || firstPageRenderMs === null) {
        setError('READER_BENCHMARK_TIMEOUT');
      }
    }, 12000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [coldOpenMs, firstPageRenderMs]);

  const handlePdfLoadError = useCallback((message: string) => {
    setError(message || 'PDF render failed.');
  }, []);

  const handlePdfDocumentLoadSuccess = useCallback(() => {
    setColdOpenMs(performance.now());
  }, []);

  const handlePdfFirstPageRender = useCallback(() => {
    setFirstPageRenderMs(performance.now());
  }, []);

  return (
    <div className="h-screen w-full bg-black text-white">
      <div className="absolute top-3 left-3 z-20 text-xs font-mono bg-black/70 rounded px-2 py-1">
        reader-perf-benchmark
      </div>
      <ReaderSurface
        selection={selection}
        signedUrl={FIXTURE_URL}
        initialPage={1}
        theme="dark"
        readingMode="page"
        fontSize="md"
        fontStyle="default"
        onPageChange={() => {}}
        onPdfLoadError={handlePdfLoadError}
        onEpubLoadError={setError}
        onPdfDocumentLoadSuccess={handlePdfDocumentLoadSuccess}
        onPdfFirstPageRender={handlePdfFirstPageRender}
        renderUnsupported={() => (
          <div className="h-full w-full flex items-center justify-center text-red-300">
            Unsupported benchmark format
          </div>
        )}
      />

      <div
        data-testid="reader-perf-result"
        className="absolute bottom-3 left-3 z-20 text-xs font-mono bg-black/70 rounded px-2 py-1"
      >
        {JSON.stringify(
          {
            coldOpenMs,
            firstPageRenderMs,
            done: Boolean(coldOpenMs !== null && firstPageRenderMs !== null && !error),
            error,
          },
          null,
          0
        )}
      </div>
    </div>
  );
};

export default ReaderPerfBenchmarkApp;
