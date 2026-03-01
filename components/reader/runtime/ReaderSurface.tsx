import React, { Suspense } from 'react';
import type { FontSize, FontStyle } from '../../../store/reading-prefs.tsx';
import type { ReaderRuntimeSelection } from '../../../lib/reader/runtime/contracts.ts';

const EpubViewer = React.lazy(() => import('../EpubViewer.tsx'));
const PdfViewer = React.lazy(() => import('../PdfViewer.tsx'));

type ReaderTheme = 'light' | 'dark' | 'sepia';
type ReaderMode = 'scroll' | 'page';

interface ReaderSurfaceProps {
  selection: ReaderRuntimeSelection;
  signedUrl: string;
  initialPage: number;
  theme: ReaderTheme;
  readingMode: ReaderMode;
  fontSize: FontSize;
  fontStyle: FontStyle;
  onPageChange: (currentPage: number, totalPages: number) => void;
  onPdfLoadError: (message: string) => void;
  onEpubLoadError: (message: string) => void;
  onPdfDocumentLoadSuccess?: (numPages: number) => void;
  onPdfFirstPageRender?: () => void;
  renderUnsupported: () => React.ReactNode;
}

const ReaderSurface: React.FC<ReaderSurfaceProps> = ({
  selection,
  signedUrl,
  initialPage,
  theme,
  readingMode,
  fontSize,
  fontStyle,
  onPageChange,
  onPdfLoadError,
  onEpubLoadError,
  onPdfDocumentLoadSuccess,
  onPdfFirstPageRender,
  renderUnsupported,
}) => {
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
          theme={theme}
          readingMode={readingMode}
          fontSize={fontSize}
          fontStyle={fontStyle}
          onPageChange={onPageChange}
          onLoadError={onEpubLoadError}
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
          onPageChange={onPageChange}
          onLoadError={onPdfLoadError}
          onDocumentLoadSuccess={onPdfDocumentLoadSuccess}
          onFirstPageRender={onPdfFirstPageRender}
        />
      </Suspense>
    );
  }

  return <>{renderUnsupported()}</>;
};

export default ReaderSurface;
