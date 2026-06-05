import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  FontSize,
  FontStyle,
  ReaderLineHeight,
  ReaderMargin,
} from '../../store/reading-prefs.tsx';
import type {
  ReaderHighlightOverlay,
  ReaderManifestSnapshot,
  ReaderNarrationSnapshot,
  ReaderTextSelection,
} from '../../lib/reader/runtime/contracts.ts';
import { resolveCanonicalEpubLocationMap } from '../../lib/reader/runtime/canonicalEpubStructure.ts';
import {
  readCachedEpubLocations,
  writeCachedEpubLocations,
  type EpubLocationCachePayload,
} from '../../lib/reader/runtime/epubLocationCache.ts';
import { markReaderTelemetry } from '../../lib/reader/runtime/readerTelemetry.ts';

type ReaderTheme = 'light' | 'dark' | 'sepia';
type ReaderMode = 'scroll' | 'page';

type EpubViewerProps = {
  url: string;
  initialPage?: number;
  initialEpubCfi?: string | null;
  onLocationChange?: (location: {
    cfi: string;
    href: string | null;
    index: number | null;
  }) => void;
  theme?: ReaderTheme;
  readingMode?: ReaderMode;
  fontSize?: FontSize;
  fontStyle?: FontStyle;
  lineHeight?: ReaderLineHeight;
  margin?: ReaderMargin;
  highlights?: ReaderHighlightOverlay[];
  manifest?: ReaderManifestSnapshot | null;
  onPageChange?: (currentPage: number, totalPages: number) => void;
  onLoadError?: (message: string) => void;
  onTextSelection?: (selection: ReaderTextSelection | null) => void;
  onNarrationSnapshotChange?: (snapshot: ReaderNarrationSnapshot | null) => void;
  onUserActivity?: () => void;
  onPageNavigationChange?: (navigation: {
    goPrevious: () => void;
    goNext: () => void;
  } | null) => void;
};

type EpubThemeStyles = Record<string, Record<string, string>>;

type EpubBook = {
  ready: Promise<unknown>;
  locations: {
    generate: (chars: number) => Promise<void>;
    length: () => number;
    cfiFromPercentage: (value: number) => string;
    percentageFromCfi: (cfi: string) => number;
    save?: () => EpubLocationCachePayload;
    load?: (payload: EpubLocationCachePayload) => void;
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
    resize?: (width?: number, height?: number) => void;
    on: {
      (event: 'selected', callback: (cfiRange: string, contents: any) => void): void;
      (event: string, callback: (payload: any) => void): void;
    };
    destroy: () => void;
    annotations?: {
      highlight: (
        cfiRange: string,
        data?: object,
        cb?: Function,
        className?: string,
        styles?: Record<string, string>
      ) => void;
      remove: (cfiRange: string, type: string) => void;
    };
    themes?: {
      default: (styles: EpubThemeStyles) => void;
      select: (name: string) => void;
    };
  };

type EpubFactory = (src: string | ArrayBuffer) => EpubBook;

const EPUB_LOCATION_GENERATION_CHARS = 1200;

function resolveEpubFactory(epubModule: typeof import('epubjs')): EpubFactory {
  const candidate = epubModule.default ?? epubModule;
  if (typeof candidate !== 'function') {
    throw new Error('EPUB runtime factory unavailable.');
  }
  return candidate as unknown as EpubFactory;
}

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

function waitForAnimationFrame(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

async function waitForStableContainer(container: HTMLElement): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  let stableFrameCount = 0;
  let lastWidth = -1;
  let lastHeight = -1;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await waitForAnimationFrame();

    if (!container.isConnected) {
      return;
    }

    const width = Math.floor(container.clientWidth);
    const height = Math.floor(container.clientHeight);
    if (width <= 0 || height <= 0) {
      stableFrameCount = 0;
      lastWidth = width;
      lastHeight = height;
      continue;
    }

    if (width === lastWidth && height === lastHeight) {
      stableFrameCount += 1;
    } else {
      stableFrameCount = 1;
      lastWidth = width;
      lastHeight = height;
    }

    if (stableFrameCount >= 2) {
      return;
    }
  }
}

function scheduleIdleTask(task: () => void): () => void {
  if (typeof window === 'undefined') {
    task();
    return () => {};
  }

  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(() => {
      task();
    }, { timeout: 1500 });
    return () => {
      if (typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId);
      }
    };
  }

  const timeoutId = window.setTimeout(task, 0);
  return () => {
    window.clearTimeout(timeoutId);
  };
}

function getFontSizePx(fontSize: FontSize): string {
  switch (fontSize) {
    case 'xs':
      return '14px';
    case 'sm':
      return '15px';
    case 'md':
      return '17px';
    case 'lg':
      return '19px';
    case 'xl':
      return '21px';
    default:
      return '17px';
  }
}

function getFontFamily(fontStyle: FontStyle): string {
  if (fontStyle === 'dyslexic') {
    return "'Atkinson Hyperlegible', 'OpenDyslexic', Arial, sans-serif";
  }
  return "Georgia, 'Times New Roman', serif";
}

function getLineHeightValue(lineHeight: ReaderLineHeight): string {
  if (lineHeight === 'compact') return '1.5';
  if (lineHeight === 'relaxed') return '1.9';
  return '1.7';
}

function getEpubMarginValue(margin: ReaderMargin): string {
  if (margin === 'narrow') return '4%';
  if (margin === 'wide') return '12%';
  return '8%';
}

function getEpubThemeStyles(
  theme: ReaderTheme,
  fontSize: FontSize,
  fontStyle: FontStyle,
  lineHeight: ReaderLineHeight,
  margin: ReaderMargin
): EpubThemeStyles {
  const typography = {
    'font-size': getFontSizePx(fontSize),
    'font-family': getFontFamily(fontStyle),
    'line-height': getLineHeightValue(lineHeight),
    'padding-left': getEpubMarginValue(margin),
    'padding-right': getEpubMarginValue(margin),
    'box-sizing': 'border-box',
  };

  if (theme === 'light') {
    return {
      html: { background: '#ffffff' },
      body: { ...typography, background: '#ffffff', color: '#0f172a' },
      p: { color: '#0f172a' },
      li: { color: '#0f172a' },
      h1: { color: '#0f172a' },
      h2: { color: '#0f172a' },
      h3: { color: '#0f172a' },
      h4: { color: '#0f172a' },
      h5: { color: '#0f172a' },
      h6: { color: '#0f172a' },
      a: { color: '#0ea5e9' },
    };
  }
  if (theme === 'sepia') {
    return {
      html: { background: '#F3E9D2' },
      body: { ...typography, background: '#F3E9D2', color: '#433422' },
      p: { color: '#433422' },
      li: { color: '#433422' },
      h1: { color: '#433422' },
      h2: { color: '#433422' },
      h3: { color: '#433422' },
      h4: { color: '#433422' },
      h5: { color: '#433422' },
      h6: { color: '#433422' },
      a: { color: '#2563eb' },
    };
  }
  return {
    html: { background: '#0f172a' },
    body: { ...typography, background: '#0f172a', color: '#e2e8f0' },
    p: { color: '#e2e8f0' },
    li: { color: '#e2e8f0' },
    h1: { color: '#e2e8f0' },
    h2: { color: '#e2e8f0' },
    h3: { color: '#e2e8f0' },
    h4: { color: '#e2e8f0' },
    h5: { color: '#e2e8f0' },
    h6: { color: '#e2e8f0' },
    a: { color: '#38bdf8' },
  };
}

function getContainerBackground(theme: ReaderTheme): string {
  if (theme === 'light') return '#ffffff';
  if (theme === 'sepia') return '#F3E9D2';
  return '#0b0f14';
}

function normalizeSelectionText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function hashNarrationParagraph(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function collectEpubNarrationSnapshot(
  container: HTMLElement,
  currentPage: number
): ReaderNarrationSnapshot | null {
  const viewportRect = container.getBoundingClientRect();
  const targetY = viewportRect.top + Math.min(viewportRect.height * 0.3, 180);
  const paragraphs: ReaderNarrationSnapshot['paragraphs'] = [];
  let currentParagraphIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  const frames = Array.from(container.querySelectorAll('iframe')) as HTMLIFrameElement[];
  for (const [frameIndex, frame] of frames.entries()) {
    const frameRect = frame.getBoundingClientRect();
    if (frameRect.bottom < viewportRect.top || frameRect.top > viewportRect.bottom) {
      continue;
    }

    const doc = frame.contentDocument;
    const elements = Array.from(
      doc?.body?.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6') || []
    ) as HTMLElement[];

    for (const element of elements) {
      const text = normalizeSelectionText(element.textContent || '');
      if (!text) continue;

      const rect = element.getBoundingClientRect();
      if (rect.height <= 0 || rect.width <= 0) continue;

      const top = frameRect.top + rect.top;
      const bottom = frameRect.top + rect.bottom;
      if (bottom < viewportRect.top + 4 || top > viewportRect.bottom - 4) continue;

      const paragraphIndex = paragraphs.length;
      const centerY = top + rect.height / 2;
      const distance = Math.abs(centerY - targetY);
      if (distance < closestDistance) {
        closestDistance = distance;
        currentParagraphIndex = paragraphIndex;
      }

      paragraphs.push({
        id: `epub:${currentPage}:${frameIndex}:${paragraphIndex}:${hashNarrationParagraph(text)}`,
        text,
        page: currentPage,
      });
    }
  }

  if (paragraphs.length === 0) {
    return null;
  }

  return {
    paragraphs,
    currentParagraphIndex,
    capturedAtMs: Date.now(),
  };
}

function toViewportRect(rect: DOMRect, frame: HTMLElement | null): DOMRect {
  if (!frame) {
    return new DOMRect(rect.x, rect.y, rect.width, rect.height);
  }

  const frameRect = frame.getBoundingClientRect();
  return new DOMRect(
    frameRect.left + rect.left,
    frameRect.top + rect.top,
    rect.width,
    rect.height
  );
}

function epubHighlightStyles(color: string): Record<string, string> {
  if (color === 'green') {
    return {
      fill: '#34d399',
      'fill-opacity': '0.28',
      'mix-blend-mode': 'multiply',
    };
  }

  return {
    fill: '#facc15',
    'fill-opacity': '0.28',
    'mix-blend-mode': 'multiply',
  };
}

const EpubViewer: React.FC<EpubViewerProps> = ({
  url,
  initialPage = 1,
  initialEpubCfi = null,
  theme = 'dark',
  readingMode = 'scroll',
  fontSize = 'md',
  fontStyle = 'default',
  lineHeight = 'standard',
  margin = 'normal',
  highlights = [],
  manifest = null,
  onPageChange,
  onLoadError,
  onLocationChange,
  onTextSelection,
  onNarrationSnapshotChange,
  onUserActivity,
  onPageNavigationChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renditionRef = useRef<ReturnType<EpubBook['renderTo']> | null>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const onPageChangeRef = useRef<EpubViewerProps["onPageChange"]>(onPageChange);
  const onLoadErrorRef = useRef<EpubViewerProps["onLoadError"]>(onLoadError);
  const onLocationChangeRef = useRef<EpubViewerProps["onLocationChange"]>(onLocationChange);
  const onTextSelectionRef = useRef<EpubViewerProps["onTextSelection"]>(onTextSelection);
  const onNarrationSnapshotChangeRef =
    useRef<EpubViewerProps["onNarrationSnapshotChange"]>(onNarrationSnapshotChange);
  const onPageNavigationChangeRef =
    useRef<EpubViewerProps["onPageNavigationChange"]>(onPageNavigationChange);
  const appliedHighlightCfisRef = useRef<string[]>([]);
  const lastWheelNavAtRef = useRef<number>(0);
  const isRenditionReadyRef = useRef<boolean>(false);
  const pageStateRef = useRef<{ current: number; total: number }>({ current: 1, total: 1 });
  const narrationFrameRef = useRef<number | null>(null);
  const lastDisplayedCfiRef = useRef<string | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const idleTaskCancelRef = useRef<(() => void) | null>(null);
  const hasInitialRenderSettledRef = useRef<boolean>(false);
  const shouldSkipRelocatedSnapshotRef = useRef<boolean>(true);
  const areLocationsReadyRef = useRef<boolean>(false);
  const [pageState, setPageState] = useState({ current: 1, total: 1 });
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    onTextSelectionRef.current = onTextSelection;
  }, [onTextSelection]);

  useEffect(() => {
    onNarrationSnapshotChangeRef.current = onNarrationSnapshotChange;
  }, [onNarrationSnapshotChange]);

  useEffect(() => {
    onPageNavigationChangeRef.current = onPageNavigationChange;
  }, [onPageNavigationChange]);

  const emitPage = useCallback(
    (current: number, total: number) => {
      const safeTotal = Math.max(1, Math.trunc(total));
      const safeCurrent = clamp(Math.trunc(current), 1, safeTotal);
      setPageState({ current: safeCurrent, total: safeTotal });
      pageStateRef.current = { current: safeCurrent, total: safeTotal };
      onPageChangeRef.current?.(safeCurrent, safeTotal);
    },
    []
  );

  const scheduleNarrationSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (narrationFrameRef.current !== null) {
      window.cancelAnimationFrame(narrationFrameRef.current);
    }

    narrationFrameRef.current = window.requestAnimationFrame(() => {
      narrationFrameRef.current = null;
      const container = containerRef.current;
      if (!container) {
        onNarrationSnapshotChangeRef.current?.(null);
        return;
      }

      onNarrationSnapshotChangeRef.current?.(
        collectEpubNarrationSnapshot(container, pageStateRef.current.current)
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();

    async function setup() {
      if (!containerRef.current) return;

      setLoadError(null);
      setPageState({ current: 1, total: 1 });
      isRenditionReadyRef.current = false;
      hasInitialRenderSettledRef.current = false;
      shouldSkipRelocatedSnapshotRef.current = true;
      areLocationsReadyRef.current = false;

      try {
        const epubModule = await import('epubjs');
        const createBook = resolveEpubFactory(epubModule);

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
        rendition.themes?.default(getEpubThemeStyles(theme, fontSize, fontStyle, lineHeight, margin));
        rendition.themes?.select('default');

        if (cancelled) return;

        const requestedPage = Math.max(1, Math.trunc(initialPage));
        const startupCfi =
          typeof initialEpubCfi === 'string' && initialEpubCfi.trim().length > 0
            ? initialEpubCfi.trim()
            : null;
        const finalizeHydratedLocations = async () => {
          if (cancelled) return;

          areLocationsReadyRef.current = true;
          const totalLocations = Math.max(1, book.locations.length());
          const effectiveRequestedPage =
            readingMode === 'scroll'
              ? Math.min(requestedPage, Math.max(1, totalLocations - 1))
              : Math.min(requestedPage, totalLocations);

          if (!startupCfi && effectiveRequestedPage > 1) {
            const ratio =
              totalLocations <= 1
                ? 0
                : clamp((effectiveRequestedPage - 1) / (totalLocations - 1), 0, 1);
            const targetCfi = book.locations.cfiFromPercentage(ratio);
            lastDisplayedCfiRef.current = targetCfi;
            await rendition.display(targetCfi);
            if (cancelled) return;
            emitPage(effectiveRequestedPage, totalLocations);
            return;
          }

          const currentCfi = lastDisplayedCfiRef.current;
          if (currentCfi) {
            const percentage = book.locations.percentageFromCfi(currentCfi);
            const current = Math.max(
              1,
              Math.round(clamp(percentage, 0, 1) * Math.max(1, totalLocations - 1)) + 1
            );
            emitPage(current, totalLocations);
          } else {
            emitPage(1, totalLocations);
          }
        };

        const hydrateLocations = async () => {
          try {
            const canonicalLocations = resolveCanonicalEpubLocationMap(
              manifest,
              EPUB_LOCATION_GENERATION_CHARS
            );
            if (canonicalLocations && typeof book.locations.load === 'function') {
              try {
                book.locations.load(canonicalLocations.payload);
                if (book.locations.length() > 0) {
                  markReaderTelemetry('epub_canonical_locations_loaded', {
                    locationCount: book.locations.length(),
                    generationChars: canonicalLocations.generationChars,
                    manifestVersion: canonicalLocations.identity.manifestVersion,
                  });
                  await finalizeHydratedLocations();
                  return;
                }
              } catch (error) {
                markReaderTelemetry('epub_canonical_locations_fallback', {
                  reason: 'load_failed',
                  generationChars: canonicalLocations.generationChars,
                });
                console.warn('[READER][EPUB_CANONICAL_LOCATIONS_LOAD_FAILED]', error);
              }
            } else {
              markReaderTelemetry('epub_canonical_locations_fallback', {
                reason: manifest?.format === 'epub' ? 'unavailable' : 'manifest_not_epub',
                generationChars: EPUB_LOCATION_GENERATION_CHARS,
              });
            }

            const cachedLocations = readCachedEpubLocations({
              url,
              generationChars: EPUB_LOCATION_GENERATION_CHARS,
              sourceIdentity: canonicalLocations?.sourceIdentity,
            });

            if (cachedLocations && typeof book.locations.load === 'function') {
              try {
                book.locations.load(cachedLocations.payload);
                if (book.locations.length() > 0) {
                  markReaderTelemetry('epub_locations_cache_hit', {
                    locationCount: book.locations.length(),
                    generationChars: EPUB_LOCATION_GENERATION_CHARS,
                  });
                  await finalizeHydratedLocations();
                  return;
                }
              } catch (error) {
                markReaderTelemetry('epub_locations_cache_miss', {
                  reason: 'load_failed',
                  generationChars: EPUB_LOCATION_GENERATION_CHARS,
                });
                console.warn('[READER][EPUB_LOCATIONS_CACHE_LOAD_FAILED]', error);
              }
            } else {
              markReaderTelemetry('epub_locations_cache_miss', {
                reason: cachedLocations ? 'load_unavailable' : 'empty',
                generationChars: EPUB_LOCATION_GENERATION_CHARS,
              });
            }

            const generationStartedAtMs = nowMs();
            await book.locations.generate(EPUB_LOCATION_GENERATION_CHARS);
            if (cancelled) return;

            const totalLocations = Math.max(1, book.locations.length());
            markReaderTelemetry('epub_locations_generate_time', {
              durationMs: Math.round(nowMs() - generationStartedAtMs),
              locationCount: totalLocations,
              generationChars: EPUB_LOCATION_GENERATION_CHARS,
            });

            if (typeof book.locations.save === 'function') {
              const payload = book.locations.save();
              writeCachedEpubLocations({
                url,
                generationChars: EPUB_LOCATION_GENERATION_CHARS,
                locationCount: totalLocations,
                payload,
                sourceIdentity: canonicalLocations?.sourceIdentity,
              });
            }

            await finalizeHydratedLocations();
            if (cancelled) {
              return;
            }
          } catch (error) {
            if (!cancelled) {
              console.warn('[READER][EPUB_LOCATIONS_GENERATE_FAILED]', error);
            }
          } finally {
            if (!cancelled) {
              scheduleNarrationSnapshot();
            }
          }
        };

        const renderedHandler = () => {
          if (cancelled || hasInitialRenderSettledRef.current) return;
          hasInitialRenderSettledRef.current = true;
          shouldSkipRelocatedSnapshotRef.current = false;
          idleTaskCancelRef.current?.();
          idleTaskCancelRef.current = scheduleIdleTask(() => {
            void hydrateLocations();
          });
        };

        rendition.on('rendered', renderedHandler);

        await waitForStableContainer(containerRef.current);
        if (cancelled) return;
        if (startupCfi) {
          try {
            await rendition.display(startupCfi);
            lastDisplayedCfiRef.current = startupCfi;
          } catch (error) {
            console.warn('[READER][EPUB_START_CFI_DISPLAY_FAILED]', error);
            await rendition.display();
          }
        } else {
          await rendition.display();
        }
        isRenditionReadyRef.current = true;
        emitPage(1, 1);

        rendition.on('relocated', (location: any) => {
          if (cancelled) return;

          const cfi = location?.start?.cfi;
          if (!cfi) return;
          lastDisplayedCfiRef.current = cfi;
          onLocationChangeRef.current?.({
            cfi,
            href:
              typeof location?.start?.href === 'string' && location.start.href.trim().length > 0
                ? location.start.href.trim()
                : null,
            index:
              typeof location?.start?.index === 'number' && Number.isFinite(location.start.index)
                ? Math.trunc(location.start.index)
                : null,
          });
          if (!areLocationsReadyRef.current) {
            return;
          }
          const totalLocations = Math.max(1, book.locations.length());
          const percentage = book.locations.percentageFromCfi(cfi);
          const current = Math.max(
            1,
            Math.round(clamp(percentage, 0, 1) * Math.max(1, totalLocations - 1)) + 1
          );

          emitPage(current, totalLocations);
          if (shouldSkipRelocatedSnapshotRef.current || !hasInitialRenderSettledRef.current) {
            return;
          }
          scheduleNarrationSnapshot();
        });

        rendition.on('selected', (cfiRange: string, contents: any) => {
          if (cancelled) return;
          if (!cfiRange || typeof cfiRange !== 'string') return;

          const selection =
            typeof contents?.window?.getSelection === 'function'
              ? contents.window.getSelection()
              : null;
          const quote = normalizeSelectionText(selection?.toString?.() || '');
          if (!quote || !selection || selection.rangeCount === 0) {
            onTextSelectionRef.current?.(null);
            return;
          }

          const range = selection.getRangeAt(0);
          const rawRect = range.getBoundingClientRect();
          const frame =
            (contents?.document?.defaultView?.frameElement as HTMLElement | null) || null;
          const rect = toViewportRect(rawRect, frame);
          const page = areLocationsReadyRef.current
            ? (() => {
                const totalLocations = Math.max(1, book.locations.length());
                const percentage = book.locations.percentageFromCfi(cfiRange);
                return Math.max(
                  1,
                  Math.round(clamp(percentage, 0, 1) * Math.max(1, totalLocations - 1)) + 1
                );
              })()
            : pageStateRef.current.current;

          onTextSelectionRef.current?.({
            quote,
            page,
            cfi: cfiRange,
            rect,
          });
        });
      } catch (error: any) {
      if (abortController.signal.aborted) return;
      const message = error?.message || 'Failed to load EPUB.';
        if (cancelled) return;
        setLoadError(message);
        onNarrationSnapshotChangeRef.current?.(null);
        onLoadErrorRef.current?.(message);
      }
    }

    setup();

    return () => {
      cancelled = true;
      abortController.abort();
      try {
        const applied = appliedHighlightCfisRef.current;
        if (renditionRef.current?.annotations && applied.length > 0) {
          for (const cfi of applied) {
            renditionRef.current.annotations.remove(cfi, 'highlight');
          }
        }
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
      isRenditionReadyRef.current = false;
      areLocationsReadyRef.current = false;
      hasInitialRenderSettledRef.current = false;
      shouldSkipRelocatedSnapshotRef.current = true;
      lastDisplayedCfiRef.current = null;
      appliedHighlightCfisRef.current = [];
      idleTaskCancelRef.current?.();
      idleTaskCancelRef.current = null;
      if (resizeTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      if (narrationFrameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(narrationFrameRef.current);
        narrationFrameRef.current = null;
      }
      onNarrationSnapshotChangeRef.current?.(null);
      onPageNavigationChangeRef.current?.(null);
    };
  }, [
    emitPage,
    fontSize,
    fontStyle,
    initialEpubCfi,
    initialPage,
    manifest,
    lineHeight,
    margin,
    readingMode,
    scheduleNarrationSnapshot,
    theme,
    url,
  ]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition?.annotations) return;

    for (const cfi of appliedHighlightCfisRef.current) {
      try {
        rendition.annotations.remove(cfi, 'highlight');
      } catch (error) {
        console.warn('[READER][EPUB_HIGHLIGHT_REMOVE_FAILED]', error);
      }
    }

    const nextCfis = highlights
      .filter((highlight) => highlight.cfi && !highlight.cfi.startsWith('pdf:'))
      .map((highlight) => highlight.cfi as string);

    for (const highlight of highlights) {
      if (!highlight.cfi || highlight.cfi.startsWith('pdf:')) continue;
      try {
        rendition.annotations.highlight(
          highlight.cfi,
          { highlightId: highlight.highlightId },
          undefined,
          'booktown-reader-highlight',
          epubHighlightStyles(highlight.color)
        );
      } catch (error) {
        console.warn('[READER][EPUB_HIGHLIGHT_RENDER_FAILED]', error);
      }
    }

    appliedHighlightCfisRef.current = nextCfis;
  }, [highlights, theme]);

  useEffect(() => {
    if (loadError) {
      onNarrationSnapshotChangeRef.current?.(null);
      return;
    }

    if (!hasInitialRenderSettledRef.current) {
      return;
    }

    if (!areLocationsReadyRef.current) {
      return;
    }

    scheduleNarrationSnapshot();
  }, [fontSize, fontStyle, lineHeight, loadError, margin, pageState.current, readingMode, scheduleNarrationSnapshot, theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !isRenditionReadyRef.current) return;

      const width = Math.floor(entry.contentRect.width);
      const height = Math.floor(entry.contentRect.height);
      if (width <= 0 || height <= 0) return;

      if (resizeTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(resizeTimerRef.current);
      }

      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null;
        const rendition = renditionRef.current;
        if (!rendition || !isRenditionReadyRef.current) return;

        try {
          rendition.resize?.(width, height);
          if (hasInitialRenderSettledRef.current && areLocationsReadyRef.current) {
            scheduleNarrationSnapshot();
          }
        } catch (error) {
          console.warn('[READER][EPUB_RESIZE_REFLOW_FAILED]', error);
        }
      }, 120);
    });

    observer.observe(container);
    return () => {
      observer.disconnect();
      if (resizeTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, [scheduleNarrationSnapshot]);

  const navigateRendition = useCallback(
    (direction: 'prev' | 'next') => {
      const rendition = renditionRef.current;
      if (!rendition || !isRenditionReadyRef.current) return;
      if (readingMode !== 'page') return;
      onUserActivity?.();

      try {
        const result =
          direction === 'prev' ? rendition.prev() : rendition.next();
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((error) => {
            console.warn('[READER][EPUB_NAV_FAILED]', error);
          });
        }
      } catch (error) {
        console.warn('[READER][EPUB_NAV_FAILED]', error);
      }
    },
    [onUserActivity, readingMode]
  );

  const goPrev = useCallback(() => {
    navigateRendition('prev');
  }, [navigateRendition]);

  const goNext = useCallback(() => {
    navigateRendition('next');
  }, [navigateRendition]);

  useEffect(() => {
    if (readingMode !== 'page') {
      onPageNavigationChangeRef.current?.(null);
      return;
    }

    onPageNavigationChangeRef.current?.({
      goPrevious: goPrev,
      goNext,
    });

    return () => {
      onPageNavigationChangeRef.current?.(null);
    };
  }, [goNext, goPrev, readingMode]);

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (readingMode !== 'page') return;
      if (!isRenditionReadyRef.current) return;
      onUserActivity?.();

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
    [goNext, goPrev, onUserActivity, readingMode]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (readingMode !== 'page') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onUserActivity?.();
        goPrev();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onUserActivity?.();
        goNext();
      }
    },
    [goNext, goPrev, onUserActivity, readingMode]
  );

  return (
    <div
      className="h-full w-full min-h-0 flex flex-col outline-none"
      style={{ backgroundColor: getContainerBackground(theme) }}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      onMouseDown={() => onTextSelectionRef.current?.(null)}
      tabIndex={0}
    >
      <div
        className={`relative flex-1 min-h-0 ${
          readingMode === 'page' ? 'overflow-hidden' : 'overflow-auto'
        }`}
      >
        {loadError ? (
          <div className="h-full w-full flex items-center justify-center text-sm text-red-300 px-4 text-center">
            {loadError}
          </div>
        ) : (
          <div
            ref={containerRef}
            className={`h-full w-full min-h-0 overscroll-contain ${
              readingMode === 'page' ? 'overflow-hidden' : 'overflow-auto'
            }`}
          />
        )}
      </div>
    </div>
  );
};

export default EpubViewer;
