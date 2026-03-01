import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { FontSize } from '../../store/reading-prefs.tsx';
import {
  buildPageOffsetIndex,
  findPageForAnchor,
} from '../../lib/reader/runtime/pageOffsetLocator.js';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PdfViewerProps {
  url: string;
  initialPage?: number;
  theme?: 'light' | 'dark' | 'sepia';
  readingMode?: 'scroll' | 'page';
  fontSize?: FontSize;
  onPageChange?: (currentPage: number, totalPages: number) => void;
  onLoadError?: (message: string) => void;
  onDocumentLoadSuccess?: (numPages: number) => void;
  onFirstPageRender?: () => void;
}

function zoomScaleFromFontSize(fontSize: FontSize): number {
  switch (fontSize) {
    case 'xs':
      return 0.9;
    case 'sm':
      return 0.95;
    case 'md':
      return 1;
    case 'lg':
      return 1.08;
    case 'xl':
      return 1.16;
    default:
      return 1;
  }
}

function clampPage(page: number, total: number): number {
  const safeTotal = Math.max(1, Math.trunc(total));
  return Math.min(Math.max(1, Math.trunc(page)), safeTotal);
}

const PdfViewer: React.FC<PdfViewerProps> = ({
  url,
  initialPage = 1,
  theme = 'dark',
  readingMode = 'scroll',
  fontSize = 'md',
  onPageChange,
  onLoadError,
  onDocumentLoadSuccess,
  onFirstPageRender,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pageOffsetsRef = useRef<number[]>([]);
  const pageNumberRef = useRef<number>(1);
  const lastWheelNavAtRef = useRef<number>(0);

  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const hasReportedFirstPageRenderRef = useRef(false);

  useEffect(() => {
    pageNumberRef.current = pageNumber;
  }, [pageNumber]);

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
    const startPage = Math.max(1, Math.trunc(initialPage));
    setPageNumber(startPage);
    pageNumberRef.current = startPage;
    pageRefs.current = [];
    pageOffsetsRef.current = [];
    hasReportedFirstPageRenderRef.current = false;
  }, [url, initialPage]);

  const rebuildPageOffsets = useCallback(() => {
    if (readingMode !== 'scroll') return;
    if (numPages <= 0) return;

    const offsets = buildPageOffsetIndex(pageRefs.current, numPages);
    if (offsets.length > 0) {
      pageOffsetsRef.current = offsets;
    }
  }, [numPages, readingMode]);

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
      const clamped = clampPage(requestedPage, numPages);
      setPageNumber(clamped);
      pageNumberRef.current = clamped;
      onPageChange?.(clamped, numPages);
      onDocumentLoadSuccess?.(numPages);
    },
    [initialPage, onDocumentLoadSuccess, onPageChange]
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
      const next = clampPage(p + 1, numPages);
      pageNumberRef.current = next;
      onPageChange?.(next, numPages);
      return next;
    });
  }, [numPages, onPageChange]);

  const goPrev = useCallback(() => {
    setPageNumber((p) => {
      const prev = clampPage(p - 1, numPages);
      pageNumberRef.current = prev;
      onPageChange?.(prev, numPages);
      return prev;
    });
  }, [numPages, onPageChange]);

  const handleWheelInPageMode = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (readingMode !== 'page') return;
      if (useIframeFallback) return;

      const magnitude = Math.abs(event.deltaY);
      if (magnitude < 8) return;

      event.preventDefault();
      event.stopPropagation();

      const now = Date.now();
      if (now - lastWheelNavAtRef.current < 220) return;
      lastWheelNavAtRef.current = now;

      if (event.deltaY > 0) goNext();
      else goPrev();
    },
    [goNext, goPrev, readingMode, useIframeFallback]
  );

  const syncPageFromScroll = useCallback(() => {
    if (readingMode !== 'scroll') return;
    if (numPages <= 0) return;
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const anchor = viewport.scrollTop + viewport.clientHeight * 0.3;
    if (pageOffsetsRef.current.length !== numPages) {
      rebuildPageOffsets();
    }
    const current = findPageForAnchor(pageOffsetsRef.current, anchor);

    if (current !== pageNumberRef.current) {
      pageNumberRef.current = current;
      setPageNumber(current);
      onPageChange?.(current, numPages);
    }
  }, [numPages, onPageChange, readingMode, rebuildPageOffsets]);

  useEffect(() => {
    if (readingMode !== 'scroll') return;
    if (numPages <= 0) return;

    const targetPage = clampPage(initialPage, numPages);
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const raf = window.requestAnimationFrame(() => {
      const targetNode = pageRefs.current[targetPage - 1];
      if (targetNode) {
        viewport.scrollTop = Math.max(0, targetNode.offsetTop - 8);
      }

      pageNumberRef.current = targetPage;
      setPageNumber(targetPage);
      onPageChange?.(targetPage, numPages);
    });

    return () => window.cancelAnimationFrame(raf);
  }, [initialPage, numPages, onPageChange, readingMode, url]);

  const basePageWidth = useMemo(() => {
    if (!containerWidth) return undefined;
    return Math.max(280, Math.floor(containerWidth - 32));
  }, [containerWidth]);

  const pageWidth = useMemo(() => {
    if (!basePageWidth) return undefined;
    const scaled = Math.floor(basePageWidth * zoomScaleFromFontSize(fontSize));
    return Math.max(240, scaled);
  }, [basePageWidth, fontSize]);

  useEffect(() => {
    if (readingMode !== 'scroll') return;
    if (numPages <= 0) return;

    const raf = window.requestAnimationFrame(() => {
      rebuildPageOffsets();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [numPages, pageWidth, readingMode, rebuildPageOffsets, url]);

  const viewerBackground =
    theme === 'light' ? '#ffffff' : theme === 'sepia' ? '#F3E9D2' : '#0b0f14';

  const handleFirstPageRender = useCallback(() => {
    if (hasReportedFirstPageRenderRef.current) return;
    hasReportedFirstPageRenderRef.current = true;
    onFirstPageRender?.();
  }, [onFirstPageRender]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-0 flex flex-col"
      style={{ backgroundColor: viewerBackground }}
      onWheel={handleWheelInPageMode}
    >
      <div
        ref={scrollViewportRef}
        onScroll={syncPageFromScroll}
        className="flex-1 min-h-0 overflow-auto p-4 flex items-start justify-center"
      >
        {useIframeFallback ? (
          <iframe
            src={readingMode === 'page' ? `${url}#page=${pageNumber}` : url}
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
            {readingMode === 'scroll' ? (
              <div className="w-full flex flex-col items-center">
                {Array.from({ length: numPages }, (_, index) => {
                  const page = index + 1;
                  return (
                    <div
                      key={page}
                      ref={(node) => {
                        pageRefs.current[index] = node;
                      }}
                      className="mb-4 last:mb-0"
                    >
                      <Page
                        pageNumber={page}
                        width={pageWidth}
                        renderTextLayer
                        renderAnnotationLayer
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <Page
                pageNumber={pageNumber}
                width={pageWidth}
                renderTextLayer
                renderAnnotationLayer
                onRenderSuccess={handleFirstPageRender}
              />
            )}
          </Document>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-3 text-white/70 text-sm border-t border-white/10 bg-[#111827]">
        {readingMode === 'page' && (
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
        )}

        <span className="min-w-20 text-center tabular-nums">
          {pageNumber} / {numPages || '—'}
        </span>

        {readingMode === 'page' && (
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
        )}
      </div>
    </div>
  );
};

export default PdfViewer;
