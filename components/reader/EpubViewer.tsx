import React, { useEffect, useRef, useState, useCallback } from 'react';

type ReaderTheme = 'light' | 'dark' | 'sepia';
type ReaderMode = 'scroll' | 'page';

type EpubViewerProps = {
  url: string;
  initialPage?: number;
  theme?: ReaderTheme;
  readingMode?: ReaderMode;
  onPageChange?: (currentPage: number, totalPages: number) => void;
  onLoadError?: (message: string) => void;
};

type EpubThemeStyles = {
  body: {
    background: string;
    color: string;
  };
  p: {
    color: string;
  };
  a: {
    color: string;
  };
};

type EpubBook = {
  ready: Promise<unknown>;
  locations: {
    generate: (chars: number) => Promise<void>;
    length: () => number;
    cfiFromPercentage: (value: number) => string;
    percentageFromCfi: (cfi: string) => number;
  };
  renderTo: (
    element: HTMLElement,
    options: Record<string, unknown>
  ) => EpubRendition;
  destroy?: () => void;
};

type EpubRendition = {
    display: (target?: string) => Promise<void>;
    prev: () => Promise<void>;
    next: () => Promise<void>;
    on: (event: string, callback: (payload: any) => void) => void;
    destroy: () => void;
    themes?: {
      default: (styles: EpubThemeStyles) => void;
      select: (name: string) => void;
    };
  };

async function loadEpubBinary(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`EPUB fetch failed (${response.status}).`);
  }

  return response.arrayBuffer();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getEpubThemeStyles(theme: ReaderTheme): EpubThemeStyles {
  if (theme === 'light') {
    return {
      body: { background: '#ffffff', color: '#0f172a' },
      p: { color: '#0f172a' },
      a: { color: '#0ea5e9' },
    };
  }
  if (theme === 'sepia') {
    return {
      body: { background: '#F3E9D2', color: '#433422' },
      p: { color: '#433422' },
      a: { color: '#2563eb' },
    };
  }
  return {
    body: { background: '#0f172a', color: '#e2e8f0' },
    p: { color: '#e2e8f0' },
    a: { color: '#38bdf8' },
  };
}

function getContainerBackground(theme: ReaderTheme): string {
  if (theme === 'light') return '#ffffff';
  if (theme === 'sepia') return '#F3E9D2';
  return '#0b0f14';
}

const EpubViewer: React.FC<EpubViewerProps> = ({
  url,
  initialPage = 1,
  theme = 'dark',
  readingMode = 'scroll',
  onPageChange,
  onLoadError,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<ReturnType<EpubBook['renderTo']> | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const lastWheelNavAtRef = useRef<number>(0);
  const [pageState, setPageState] = useState({ current: 1, total: 1 });
  const [loadError, setLoadError] = useState<string | null>(null);

  const emitPage = useCallback(
    (current: number, total: number) => {
      const safeTotal = Math.max(1, Math.trunc(total));
      const safeCurrent = clamp(Math.trunc(current), 1, safeTotal);
      setPageState({ current: safeCurrent, total: safeTotal });
      onPageChange?.(safeCurrent, safeTotal);
    },
    [onPageChange]
  );

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    async function setup() {
      if (!containerRef.current) return;

      setLoadError(null);
      setPageState({ current: 1, total: 1 });

      try {
        const epubModule = await import('epubjs');
        const createBook = (epubModule.default ?? epubModule) as (
          src: string | ArrayBuffer
        ) => EpubBook;

        const epubBinary = await loadEpubBinary(url, abortController.signal);
        const book = createBook(epubBinary);
        const rendition = book.renderTo(containerRef.current, {
          width: '100%',
          height: '100%',
          flow: readingMode === 'page' ? 'paginated' : 'scrolled-continuous',
          spread: 'none',
          manager: readingMode === 'page' ? 'default' : 'continuous',
          allowScriptedContent: false,
        });

        bookRef.current = book;
        renditionRef.current = rendition;

        await book.ready;
        rendition.themes?.default(getEpubThemeStyles(theme));
        rendition.themes?.select('default');
        await book.locations.generate(1200);

        if (cancelled) return;

        const totalLocations = Math.max(1, book.locations.length());
        const requestedPage = Math.max(1, Math.trunc(initialPage));
        const ratio =
          totalLocations <= 1
            ? 0
            : clamp((requestedPage - 1) / (totalLocations - 1), 0, 1);

        const startCfi = book.locations.cfiFromPercentage(ratio);
        await rendition.display(startCfi);

        emitPage(requestedPage, totalLocations);

        rendition.on('relocated', (location: any) => {
          if (cancelled) return;

          const cfi = location?.start?.cfi;
          if (!cfi) return;
          const percentage = book.locations.percentageFromCfi(cfi);
          const current = Math.max(
            1,
            Math.round(clamp(percentage, 0, 1) * Math.max(1, totalLocations - 1)) + 1
          );

          emitPage(current, totalLocations);
        });
      } catch (error: any) {
        if (abortController.signal.aborted) return;
        const message = error?.message || 'Failed to load EPUB.';
        if (cancelled) return;
        setLoadError(message);
        onLoadError?.(message);
      }
    }

    setup();

    return () => {
      cancelled = true;
      abortController.abort();
      try {
        renditionRef.current?.destroy();
      } catch {
        // no-op
      }
      try {
        bookRef.current?.destroy?.();
      } catch {
        // no-op
      }
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [emitPage, initialPage, onLoadError, readingMode, theme, url]);

  const goPrev = useCallback(() => {
    renditionRef.current?.prev().catch(() => {});
  }, []);

  const goNext = useCallback(() => {
    renditionRef.current?.next().catch(() => {});
  }, []);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (readingMode !== 'page') return;

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
    [goNext, goPrev, readingMode]
  );

  return (
    <div
      className="h-full w-full min-h-0 flex flex-col"
      style={{ backgroundColor: getContainerBackground(theme) }}
      onWheel={handleWheel}
    >
      <div className="flex-1 min-h-0 overflow-auto">
        {loadError ? (
          <div className="h-full w-full flex items-center justify-center text-sm text-red-300 px-4 text-center">
            {loadError}
          </div>
        ) : (
          <div
            ref={containerRef}
            className="h-full w-full min-h-0 overflow-auto overscroll-contain"
          />
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-3 text-white/70 text-sm border-t border-white/10 bg-[#111827]">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            goPrev();
          }}
          className="px-3 py-1 rounded bg-white/10"
        >
          ‹
        </button>
        <span className="min-w-20 text-center tabular-nums">
          {pageState.current} / {pageState.total}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            goNext();
          }}
          className="px-3 py-1 rounded bg-white/10"
        >
          ›
        </button>
      </div>
    </div>
  );
};

export default EpubViewer;
