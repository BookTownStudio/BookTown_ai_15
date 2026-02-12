// components/reader/PdfViewer.tsx

import React, { useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// 🔒 Worker configuration (required for production)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url
).toString();

interface PdfViewerProps {
  url: string;
  onPageChange?: (currentPage: number, totalPages: number) => void;
}

const PdfViewer: React.FC<PdfViewerProps> = ({ url, onPageChange }) => {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);

  const handleLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setPageNumber(1);
      onPageChange?.(1, numPages);
    },
    [onPageChange]
  );

  const goNext = () => {
    setPageNumber(p => {
      const next = Math.min(p + 1, numPages);
      onPageChange?.(next, numPages);
      return next;
    });
  };

  const goPrev = () => {
    setPageNumber(p => {
      const prev = Math.max(p - 1, 1);
      onPageChange?.(prev, numPages);
      return prev;
    });
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-black">
      <div className="flex-grow overflow-auto">
        <Document
          file={url}
          onLoadSuccess={handleLoadSuccess}
          loading={<div className="text-white/50 p-6">Loading…</div>}
          error={<div className="text-red-400 p-6">Failed to load PDF</div>}
        >
          <Page
            pageNumber={pageNumber}
            renderTextLayer
            renderAnnotationLayer
            width={window.innerWidth}
          />
        </Document>
      </div>

      {/* Minimal navigation (temporary UI) */}
      <div className="flex items-center gap-4 py-3 text-white/60 text-sm">
        <button
          onClick={goPrev}
          disabled={pageNumber <= 1}
          className="px-3 py-1 rounded bg-white/10 disabled:opacity-30"
        >
          ‹
        </button>

        <span>
          {pageNumber} / {numPages || '—'}
        </span>

        <button
          onClick={goNext}
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