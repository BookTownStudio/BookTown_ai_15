import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PdfViewerProps {
  url: string;
  initialPage?: number;
  theme?: 'light' | 'dark' | 'sepia';
  onPageChange?: (currentPage: number, totalPages: number) => void;
  onLoadError?: (message: string) => void;
}

const PdfViewer: React.FC<PdfViewerProps> = ({
  url,
  initialPage = 1,
  theme = 'dark',
  onPageChange,
  onLoadError,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.floor(entry.contentRect.width);
      if (width > 0) setContainerWidth(width);
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setNumPages(0);
    setLoadError(null);
    setUseIframeFallback(false);
    setPageNumber(Math.max(1, Math.trunc(initialPage)));
  }, [url, initialPage]);

  useEffect(() => {
    if (numPages > 0 || useIframeFallback) return;
    const timer = setTimeout(() => {
      setUseIframeFallback(true);
      onLoadError?.('PDF engine fallback applied.');
    }, 8000);

    return () => clearTimeout(timer);
  }, [numPages, onLoadError, useIframeFallback]);

  const handleLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      const requestedPage = Math.max(1, Math.trunc(initialPage));
      const clamped = Math.min(requestedPage, Math.max(1, numPages));
      setPageNumber(clamped);
      onPageChange?.(clamped, numPages);
    },
    [initialPage, onPageChange]
  );

  const handleLoadFailure = useCallback(
    (error: Error) => {
      const message = error?.message || 'Failed to load PDF.';
      setLoadError(message);
      setUseIframeFallback(true);
      onLoadError?.(message);
    },
    [onLoadError]
  );

  const goNext = useCallback(() => {
    setPageNumber((p) => {
      const next = Math.min(p + 1, numPages);
      onPageChange?.(next, numPages);
      return next;
    });
  }, [numPages, onPageChange]);

  const goPrev = useCallback(() => {
    setPageNumber((p) => {
      const prev = Math.max(p - 1, 1);
      onPageChange?.(prev, numPages);
      return prev;
    });
  }, [numPages, onPageChange]);

  const pageWidth = useMemo(() => {
    if (!containerWidth) return undefined;
    return Math.max(280, Math.floor(containerWidth - 32));
  }, [containerWidth]);

  const viewerBackground =
    theme === 'light' ? '#ffffff' : theme === 'sepia' ? '#F3E9D2' : '#0b0f14';

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-0 flex flex-col"
      style={{ backgroundColor: viewerBackground }}
    >
      <div className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center">
        {useIframeFallback ? (
          <iframe
            src={`${url}#page=${pageNumber}`}
            title="PDF Fallback Viewer"
            className="w-full h-full border-0 bg-white"
          />
        ) : loadError ? (
          <div className="text-sm text-red-300">{loadError}</div>
        ) : (
          <Document
            file={url}
            onLoadSuccess={handleLoadSuccess}
            onLoadError={handleLoadFailure}
            loading={<div className="text-white/60 p-4">Loading PDF…</div>}
            error={<div className="text-red-300 p-4">Failed to render PDF.</div>}
          >
            <Page
              pageNumber={pageNumber}
              width={pageWidth}
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-3 text-white/70 text-sm border-t border-white/10 bg-[#111827]">
        <button
          onClick={(event) => {
            event.stopPropagation();
            goPrev();
          }}
          type="button"
          disabled={pageNumber <= 1}
          className="px-3 py-1 rounded bg-white/10 disabled:opacity-30"
        >
          ‹
        </button>

        <span className="min-w-20 text-center tabular-nums">
          {pageNumber} / {numPages || '—'}
        </span>

        <button
          onClick={(event) => {
            event.stopPropagation();
            goNext();
          }}
          type="button"
          disabled={pageNumber >= numPages}
          className="px-3 py-1 rounded bg-white/10 disabled:opacity-30"
        >
          ›
        </button>
      </div>
    </div>
  );
};

export default PdfViewer;
