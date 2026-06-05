import React, { Suspense, useEffect } from 'react';
import type {
  FontSize,
  FontStyle,
  ReaderLineHeight,
  ReaderMargin,
} from '../../../store/reading-prefs.tsx';
import type {
  ReaderHighlightOverlay,
  ReaderManifestSnapshot,
  ReaderNarrationSnapshot,
  ReaderRuntimeSelection,
  ReaderTextSelection,
} from '../../../lib/reader/runtime/contracts.ts';
import { scheduleReaderIdleTask } from '../../../lib/reader/runtime/readerIdleScheduler.ts';
import { markReaderTelemetry } from '../../../lib/reader/runtime/readerTelemetry.ts';

const loadEpubViewer = () => import('../EpubViewer.tsx');
const loadPdfViewer = () => import('../PdfViewer.tsx');

const EpubViewer = React.lazy(loadEpubViewer);
const PdfViewer = React.lazy(loadPdfViewer);

function canPrewarmReaderRuntime(): boolean {
  if (typeof navigator === 'undefined') return false;

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === 'number' && Number.isFinite(memory) && memory <= 4) {
    return false;
  }

  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) {
    return false;
  }

  return true;
}

type ReaderTheme = 'light' | 'dark' | 'sepia';
type ReaderMode = 'scroll' | 'page';

interface ReaderSurfaceProps {
  selection: ReaderRuntimeSelection;
  signedUrl: string;
  initialPage: number;
  initialEpubCfi?: string | null;
  onEpubLocationChange?: (location: {
    cfi: string;
    href: string | null;
    index: number | null;
  }) => void;
  theme: ReaderTheme;
  readingMode: ReaderMode;
  fontSize: FontSize;
  fontStyle: FontStyle;
  lineHeight: ReaderLineHeight;
  margin: ReaderMargin;
  highlights?: ReaderHighlightOverlay[];
  manifest?: ReaderManifestSnapshot | null;
  onPageChange: (currentPage: number, totalPages: number) => void;
  onPdfLoadError: (message: string) => void;
  onEpubLoadError: (message: string) => void;
  onTextSelection?: (selection: ReaderTextSelection | null) => void;
  onNarrationSnapshotChange?: (snapshot: ReaderNarrationSnapshot | null) => void;
  onPdfDocumentLoadSuccess?: (numPages: number) => void;
  onPdfFirstPageRender?: () => void;
  onUserActivity?: () => void;
  onEpubPageNavigationChange?: (navigation: {
    goPrevious: () => void;
    goNext: () => void;
  } | null) => void;
  renderUnsupported: () => React.ReactNode;
}

const ReaderSurface: React.FC<ReaderSurfaceProps> = ({
  selection,
  signedUrl,
  initialPage,
  initialEpubCfi,
  onEpubLocationChange,
  theme,
  readingMode,
  fontSize,
  fontStyle,
  lineHeight,
  margin,
  highlights,
  manifest,
  onPageChange,
  onPdfLoadError,
  onEpubLoadError,
  onTextSelection,
  onNarrationSnapshotChange,
  onPdfDocumentLoadSuccess,
  onPdfFirstPageRender,
  onUserActivity,
  onEpubPageNavigationChange,
  renderUnsupported,
}) => {
  useEffect(() => {
    if (!canPrewarmReaderRuntime()) return undefined;

    const cancel = scheduleReaderIdleTask(() => {
      if (selection.engine === 'web_epub') {
        void loadPdfViewer().then(() => {
          markReaderTelemetry('reader_runtime_prewarm', {
            engine: 'web_pdf',
            source: 'reader_surface_idle',
          });
        });
        return;
      }

      if (selection.engine === 'web_pdf') {
        void loadEpubViewer().then(() => {
          markReaderTelemetry('reader_runtime_prewarm', {
            engine: 'web_epub',
            source: 'reader_surface_idle',
          });
        });
      }
    }, { timeoutMs: 3000 });

    return cancel;
  }, [selection.engine]);

  const fallbackUi = (
    <div className="h-full w-full flex items-center justify-center text-white/60 text-sm">
      Loading reader engine...
    </div>
  );

  if (selection.engine === 'web_epub') {
    return (
      <Suspense fallback={fallbackUi}>
        <EpubViewer
          url={signedUrl}
          initialPage={initialPage}
          initialEpubCfi={initialEpubCfi}
          onLocationChange={onEpubLocationChange}
          theme={theme}
          readingMode={readingMode}
          fontSize={fontSize}
          fontStyle={fontStyle}
          lineHeight={lineHeight}
          margin={margin}
          highlights={highlights}
          manifest={manifest}
          onPageChange={onPageChange}
          onLoadError={onEpubLoadError}
          onTextSelection={onTextSelection}
          onNarrationSnapshotChange={onNarrationSnapshotChange}
          onUserActivity={onUserActivity}
          onPageNavigationChange={onEpubPageNavigationChange}
        />
      </Suspense>
    );
  }

  if (selection.engine === 'web_pdf') {
    return (
      <Suspense fallback={fallbackUi}>
        <PdfViewer
          url={signedUrl}
          initialPage={initialPage}
          theme={theme}
          readingMode={readingMode}
          fontSize={fontSize}
          margin={margin}
          highlights={highlights}
          onPageChange={onPageChange}
          onLoadError={onPdfLoadError}
          onTextSelection={onTextSelection}
          onNarrationSnapshotChange={onNarrationSnapshotChange}
          onDocumentLoadSuccess={onPdfDocumentLoadSuccess}
          onFirstPageRender={onPdfFirstPageRender}
          onUserActivity={onUserActivity}
        />
      </Suspense>
    );
  }

  return <>{renderUnsupported()}</>;
};

export default ReaderSurface;
