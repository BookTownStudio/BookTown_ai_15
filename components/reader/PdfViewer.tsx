import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { FontSize } from '../../store/reading-prefs.tsx';
import type {
  ReaderHighlightOverlay,
  ReaderNarrationSnapshot,
  ReaderTextSelection,
} from '../../lib/reader/runtime/contracts.ts';
import {
  buildPageOffsetIndex,
  findPageForAnchor,
} from '../../lib/reader/runtime/pageOffsetLocator.js';
import { markReaderTelemetry } from '../../lib/reader/runtime/readerTelemetry.ts';
import { scheduleReaderIdleTask } from '../../lib/reader/runtime/readerIdleScheduler.ts';
import {
  buildVirtualPdfPageOffsetIndex,
  clampPdfPage,
  estimatePdfPageStridePx,
  PDF_SCROLL_PAGE_GAP_PX,
  resolveAdaptivePdfWindowRadius,
  resolvePdfPageWindow,
} from '../../lib/reader/runtime/pdfVirtualization.ts';

const PDF_ENGINE_FALLBACK_TIMEOUT_MS = 8_000;

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
  highlights?: ReaderHighlightOverlay[];
  onPageChange?: (currentPage: number, totalPages: number) => void;
  onLoadError?: (message: string) => void;
  onTextSelection?: (selection: ReaderTextSelection | null) => void;
  onNarrationSnapshotChange?: (snapshot: ReaderNarrationSnapshot | null) => void;
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
  return clampPdfPage(page, total);
}

function getDeviceMemoryGb(): number | null {
  if (typeof navigator === 'undefined') return null;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof memory === 'number' && Number.isFinite(memory) ? memory : null;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

type PdfTextLine = {
  page: number;
  top: number;
  bottom: number;
  left: number;
  textParts: string[];
};

type PdfTextParagraph = {
  page: number;
  top: number;
  bottom: number;
  textParts: string[];
};

function collectPdfNarrationSnapshot(params: {
  container: HTMLElement;
  viewport: HTMLElement;
  currentPage: number;
  readingMode: 'scroll' | 'page';
}): ReaderNarrationSnapshot | null {
  const { container, viewport, currentPage, readingMode } = params;
  const viewportRect = viewport.getBoundingClientRect();
  const targetY = viewportRect.top + Math.min(viewportRect.height * 0.3, 180);
  const paragraphs: ReaderNarrationSnapshot['paragraphs'] = [];
  let currentParagraphIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  const pageNodes = Array.from(
    container.querySelectorAll('[data-reader-pdf-page]')
  ) as HTMLElement[];

  const relevantPageNodes = pageNodes.filter((pageNode) => {
    const page = Number(pageNode.dataset.readerPdfPage || '');
    if (!Number.isFinite(page) || page <= 0) return false;
    if (readingMode === 'page') return page === currentPage;
    const rect = pageNode.getBoundingClientRect();
    return rect.bottom >= viewportRect.top && rect.top <= viewportRect.bottom;
  });

  for (const pageNode of relevantPageNodes) {
    const page = Number(pageNode.dataset.readerPdfPage || '');
    const textLayer = pageNode.querySelector('.react-pdf__Page__textContent') as HTMLElement | null;
    if (!Number.isFinite(page) || !textLayer) continue;

    const lines: PdfTextLine[] = [];
    const spans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];

    for (const span of spans) {
      const text = normalizeSelectionText(span.textContent || '');
      if (!text) continue;

      const rect = span.getBoundingClientRect();
      if (rect.height <= 0 || rect.width <= 0) continue;
      if (rect.bottom < viewportRect.top + 2 || rect.top > viewportRect.bottom - 2) continue;

      const lastLine = lines[lines.length - 1];
      if (!lastLine) {
        lines.push({
          page,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          textParts: [text],
        });
        continue;
      }

      const lineMid = (lastLine.top + lastLine.bottom) / 2;
      const spanMid = rect.top + rect.height / 2;
      const sameLine =
        Math.abs(spanMid - lineMid) <= Math.max(8, (lastLine.bottom - lastLine.top) * 0.75);

      if (sameLine) {
        lastLine.bottom = Math.max(lastLine.bottom, rect.bottom);
        lastLine.left = Math.min(lastLine.left, rect.left);
        lastLine.textParts.push(text);
        continue;
      }

      lines.push({
        page,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        textParts: [text],
      });
    }

    const paragraphGroups: PdfTextParagraph[] = [];
    for (const line of lines) {
      const lineText = normalizeSelectionText(line.textParts.join(' '));
      if (!lineText) continue;

      const lastParagraph = paragraphGroups[paragraphGroups.length - 1];
      if (!lastParagraph) {
        paragraphGroups.push({
          page,
          top: line.top,
          bottom: line.bottom,
          textParts: [lineText],
        });
        continue;
      }

      const lineHeight = Math.max(12, lastParagraph.bottom - lastParagraph.top);
      const gap = line.top - lastParagraph.bottom;
      if (gap > lineHeight * 1.4) {
        paragraphGroups.push({
          page,
          top: line.top,
          bottom: line.bottom,
          textParts: [lineText],
        });
        continue;
      }

      lastParagraph.bottom = Math.max(lastParagraph.bottom, line.bottom);
      lastParagraph.textParts.push(lineText);
    }

    for (const group of paragraphGroups) {
      const text = normalizeSelectionText(group.textParts.join(' '));
      if (!text) continue;

      const paragraphIndex = paragraphs.length;
      const centerY = group.top + (group.bottom - group.top) / 2;
      const distance = Math.abs(centerY - targetY);
      if (distance < closestDistance) {
        closestDistance = distance;
        currentParagraphIndex = paragraphIndex;
      }

      paragraphs.push({
        id: `pdf:${page}:${paragraphIndex}:${hashNarrationParagraph(text)}`,
        text,
        page,
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

function hashSelectionAnchor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function parsePdfHighlightAnchor(anchor: string | null): {
  page: number;
  start: number;
  end: number;
} | null {
  if (!anchor || !anchor.startsWith('pdf:')) return null;
  const parts = anchor.split(':');
  if (parts.length < 5) return null;
  const page = Number(parts[1]);
  const start = Number(parts[2]);
  const end = Number(parts[3]);
  if (!Number.isFinite(page) || !Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  if (page <= 0 || start < 0 || end <= start) return null;
  return {
    page: Math.trunc(page),
    start: Math.trunc(start),
    end: Math.trunc(end),
  };
}

function pdfHighlightColor(color: string): string {
  if (color === 'green') return 'rgba(52, 211, 153, 0.35)';
  return 'rgba(250, 204, 21, 0.35)';
}

function clearPdfHighlightMarks(root: HTMLElement): void {
  const marks = Array.from(
    root.querySelectorAll('mark[data-reader-pdf-highlight="true"]')
  ) as HTMLElement[];

  for (const mark of marks) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
    parent.normalize();
  }
}

function applyPdfHighlightRange(params: {
  textLayer: HTMLElement;
  start: number;
  end: number;
  color: string;
  highlightId: string;
}): void {
  const { textLayer, start, end, color, highlightId } = params;
  const walker = document.createTreeWalker(textLayer, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  let position = 0;

  while (node) {
    const textNode = node as Text;
    const textLength = textNode.textContent?.length || 0;
    const nodeStart = position;
    const nodeEnd = position + textLength;
    const overlapStart = Math.max(start, nodeStart);
    const overlapEnd = Math.min(end, nodeEnd);

    if (overlapStart < overlapEnd && textNode.parentElement?.closest('mark[data-reader-pdf-highlight="true"]') === null) {
      try {
        const range = document.createRange();
        range.setStart(textNode, overlapStart - nodeStart);
        range.setEnd(textNode, overlapEnd - nodeStart);

        const mark = document.createElement('mark');
        mark.dataset.readerPdfHighlight = 'true';
        mark.dataset.highlightId = highlightId;
        mark.style.backgroundColor = pdfHighlightColor(color);
        mark.style.borderRadius = '2px';
        mark.style.padding = '0';
        mark.style.margin = '0';

        range.surroundContents(mark);
      } catch (error) {
        console.warn('[READER][PDF_HIGHLIGHT_RENDER_FAILED]', error);
      }
    }

    position = nodeEnd;
    node = walker.nextNode();
  }
}

const PdfViewer: React.FC<PdfViewerProps> = ({
  url,
  initialPage = 1,
  theme = 'dark',
  readingMode = 'scroll',
  fontSize = 'md',
  highlights = [],
  onPageChange,
  onLoadError,
  onTextSelection,
  onNarrationSnapshotChange,
  onDocumentLoadSuccess,
  onFirstPageRender,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pageOffsetsRef = useRef<number[]>([]);
  const measuredPageStrideRef = useRef<number | null>(null);
  const pageNumberRef = useRef<number>(1);
  const lastWheelNavAtRef = useRef<number>(0);
  const scrollSampleRef = useRef<{ startedAt: number; frames: number; dropped: number }>({
    startedAt: 0,
    frames: 0,
    dropped: 0,
  });
  const lastScrollFrameAtRef = useRef<number>(0);
  const onTextSelectionRef = useRef<PdfViewerProps['onTextSelection']>(onTextSelection);
  const onNarrationSnapshotChangeRef =
    useRef<PdfViewerProps['onNarrationSnapshotChange']>(onNarrationSnapshotChange);
  const narrationFrameRef = useRef<number | null>(null);
  const highlightHydrationCancelRef = useRef<(() => void) | null>(null);

  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [virtualWindow, setVirtualWindow] = useState<{ start: number; end: number }>(() =>
    resolvePdfPageWindow(1, 1)
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const hasReportedFirstPageRenderRef = useRef(false);

  const adaptiveWindowRadius = useMemo(
    () =>
      resolveAdaptivePdfWindowRadius({
        totalPages: numPages,
        deviceMemoryGb: getDeviceMemoryGb(),
        reducedMotion: prefersReducedMotion(),
      }),
    [numPages]
  );

  useEffect(() => {
    pageNumberRef.current = pageNumber;
  }, [pageNumber]);

  useEffect(() => {
    onTextSelectionRef.current = onTextSelection;
  }, [onTextSelection]);

  useEffect(() => {
    onNarrationSnapshotChangeRef.current = onNarrationSnapshotChange;
  }, [onNarrationSnapshotChange]);

  const scheduleNarrationSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (narrationFrameRef.current !== null) {
      window.cancelAnimationFrame(narrationFrameRef.current);
    }

    narrationFrameRef.current = window.requestAnimationFrame(() => {
      narrationFrameRef.current = null;
      const container = containerRef.current;
      const viewport = scrollViewportRef.current;
      if (!container || !viewport || useIframeFallback) {
        onNarrationSnapshotChangeRef.current?.(null);
        return;
      }

      onNarrationSnapshotChangeRef.current?.(
        collectPdfNarrationSnapshot({
          container,
          viewport,
          currentPage: pageNumberRef.current,
          readingMode,
        })
      );
    });
  }, [readingMode, useIframeFallback]);

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
    measuredPageStrideRef.current = null;
    setVirtualWindow(resolvePdfPageWindow(startPage, 1, adaptiveWindowRadius));
    hasReportedFirstPageRenderRef.current = false;
    onNarrationSnapshotChangeRef.current?.(null);
    highlightHydrationCancelRef.current?.();
    highlightHydrationCancelRef.current = null;
  }, [adaptiveWindowRadius, url, initialPage]);

  const basePageWidth = useMemo(() => {
    if (!containerWidth) return undefined;
    return Math.max(280, Math.floor(containerWidth - 32));
  }, [containerWidth]);

  const pageWidth = useMemo(() => {
    if (!basePageWidth) return undefined;
    const scaled = Math.floor(basePageWidth * zoomScaleFromFontSize(fontSize));
    return Math.max(240, scaled);
  }, [basePageWidth, fontSize]);

  const rebuildPageOffsets = useCallback(() => {
    if (readingMode !== 'scroll') return;
    if (numPages <= 0) return;

    const estimatedStride = estimatePdfPageStridePx({
      containerWidth,
      measuredPageStride: measuredPageStrideRef.current,
      pageWidth,
    });
    const offsets =
      pageRefs.current.filter(Boolean).length >= numPages
        ? buildPageOffsetIndex(pageRefs.current, numPages)
        : buildVirtualPdfPageOffsetIndex(numPages, estimatedStride);
    if (offsets.length > 0) {
      pageOffsetsRef.current = offsets;
    }
  }, [containerWidth, numPages, pageWidth, readingMode]);

  const handleFirstPageRender = useCallback(() => {
    if (hasReportedFirstPageRenderRef.current) return;
    hasReportedFirstPageRenderRef.current = true;
    markReaderTelemetry('hydration_deferred', {
      target: 'first_interaction_noncritical_pdf_work',
    });
    onFirstPageRender?.();
  }, [onFirstPageRender]);

  useEffect(() => {
    if (numPages > 0 || useIframeFallback) return;
    const timer = setTimeout(() => {
      setUseIframeFallback(true);
      markReaderTelemetry('pdf_survival_fallback', {
        reason: 'engine_startup_timeout',
        timeoutMs: PDF_ENGINE_FALLBACK_TIMEOUT_MS,
      });
      handleFirstPageRender();
    }, PDF_ENGINE_FALLBACK_TIMEOUT_MS);

    return () => clearTimeout(timer);
  }, [handleFirstPageRender, numPages, useIframeFallback]);

  const handleLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      const requestedPage = Math.max(1, Math.trunc(initialPage));
      const clamped = clampPage(requestedPage, numPages);
      setPageNumber(clamped);
      pageNumberRef.current = clamped;
      const nextRadius = resolveAdaptivePdfWindowRadius({
        totalPages: numPages,
        deviceMemoryGb: getDeviceMemoryGb(),
        reducedMotion: prefersReducedMotion(),
      });
      setVirtualWindow(resolvePdfPageWindow(clamped, numPages, nextRadius));
      markReaderTelemetry('pdf_runtime_ready', {
        numPages,
        adaptiveWindowRadius: nextRadius,
      });
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
    const startedAt = performance.now();
    setPageNumber((p) => {
      const next = clampPage(p + 1, numPages);
      pageNumberRef.current = next;
      onPageChange?.(next, numPages);
      markReaderTelemetry('page_turn_latency', {
        direction: 'next',
        latencyMs: Number((performance.now() - startedAt).toFixed(2)),
      });
      return next;
    });
  }, [numPages, onPageChange]);

  const goPrev = useCallback(() => {
    const startedAt = performance.now();
    setPageNumber((p) => {
      const prev = clampPage(p - 1, numPages);
      pageNumberRef.current = prev;
      onPageChange?.(prev, numPages);
      markReaderTelemetry('page_turn_latency', {
        direction: 'previous',
        latencyMs: Number((performance.now() - startedAt).toFixed(2)),
      });
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
    const now = performance.now();
    const sample = scrollSampleRef.current;
    if (sample.startedAt === 0) {
      sample.startedAt = now;
      sample.frames = 0;
      sample.dropped = 0;
      lastScrollFrameAtRef.current = now;
    } else {
      const delta = now - lastScrollFrameAtRef.current;
      lastScrollFrameAtRef.current = now;
      sample.frames += 1;
      if (delta > 34) sample.dropped += 1;
      if (now - sample.startedAt >= 1000) {
        markReaderTelemetry('scroll_fps', {
          fps: Number(((sample.frames * 1000) / (now - sample.startedAt)).toFixed(1)),
        });
        if (sample.dropped > 0) {
          markReaderTelemetry('dropped_frames', {
            count: sample.dropped,
          });
        }
        sample.startedAt = now;
        sample.frames = 0;
        sample.dropped = 0;
      }
    }

    const anchor = viewport.scrollTop + viewport.clientHeight * 0.3;
    if (pageOffsetsRef.current.length !== numPages) {
      rebuildPageOffsets();
    }
    const current = findPageForAnchor(pageOffsetsRef.current, anchor);

    if (current !== pageNumberRef.current) {
      pageNumberRef.current = current;
      setPageNumber(current);
      setVirtualWindow(resolvePdfPageWindow(current, numPages, adaptiveWindowRadius));
      onPageChange?.(current, numPages);
    }
    scheduleNarrationSnapshot();
  }, [adaptiveWindowRadius, numPages, onPageChange, readingMode, rebuildPageOffsets, scheduleNarrationSnapshot]);

  useEffect(() => {
    if (readingMode !== 'scroll') return;
    if (numPages <= 0) return;

    const targetPage = clampPage(initialPage, numPages);
    const viewport = scrollViewportRef.current;
    if (!viewport) return;

    const raf = window.requestAnimationFrame(() => {
      const pageStride = estimatePdfPageStridePx({
        containerWidth: viewport.clientWidth,
        measuredPageStride: measuredPageStrideRef.current,
        pageWidth,
      });
      viewport.scrollTop = Math.max(0, (targetPage - 1) * pageStride);

      pageNumberRef.current = targetPage;
      setPageNumber(targetPage);
      setVirtualWindow(resolvePdfPageWindow(targetPage, numPages, adaptiveWindowRadius));
      onPageChange?.(targetPage, numPages);
      scheduleNarrationSnapshot();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [adaptiveWindowRadius, initialPage, numPages, onPageChange, pageWidth, readingMode, scheduleNarrationSnapshot, url]);

  useEffect(() => {
    if (readingMode !== 'scroll') return;
    if (numPages <= 0) return;

    const raf = window.requestAnimationFrame(() => {
      rebuildPageOffsets();
    });

    return () => window.cancelAnimationFrame(raf);
  }, [numPages, pageWidth, readingMode, rebuildPageOffsets, url]);

  const renderedScrollPages = useMemo(() => {
    if (readingMode !== 'scroll' || numPages <= 0) return [];
    const pages: number[] = [];
    for (let page = virtualWindow.start; page <= virtualWindow.end; page += 1) {
      pages.push(page);
    }
    return pages;
  }, [numPages, readingMode, virtualWindow.end, virtualWindow.start]);

  const estimatedPageStride = useMemo(() => {
    return estimatePdfPageStridePx({
      containerWidth,
      measuredPageStride: measuredPageStrideRef.current,
      pageWidth,
    });
  }, [containerWidth, pageWidth]);

  const topSpacerHeight = readingMode === 'scroll'
    ? Math.max(0, (virtualWindow.start - 1) * estimatedPageStride)
    : 0;
  const bottomSpacerHeight = readingMode === 'scroll'
    ? Math.max(0, (numPages - virtualWindow.end) * estimatedPageStride)
    : 0;

  const captureRenderedPageMetrics = useCallback((page: number, node: HTMLDivElement | null) => {
    pageRefs.current[page - 1] = node;
    if (!node) return;
    const measuredHeight = Math.ceil(node.getBoundingClientRect().height);
    if (measuredHeight > 0) {
      measuredPageStrideRef.current = measuredHeight + PDF_SCROLL_PAGE_GAP_PX;
      rebuildPageOffsets();
    }
  }, [rebuildPageOffsets]);

  const viewerBackground =
    theme === 'light' ? '#ffffff' : theme === 'sepia' ? '#F3E9D2' : '#0b0f14';

  const captureTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      onTextSelectionRef.current?.(null);
      return;
    }

    const quote = normalizeSelectionText(selection.toString());
    if (!quote) {
      onTextSelectionRef.current?.(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const startElement =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as Element)
        : range.startContainer.parentElement;
    const endElement =
      range.endContainer.nodeType === Node.ELEMENT_NODE
        ? (range.endContainer as Element)
        : range.endContainer.parentElement;
    const startPageNode = startElement?.closest('[data-reader-pdf-page]') as HTMLElement | null;
    const endPageNode = endElement?.closest('[data-reader-pdf-page]') as HTMLElement | null;

    if (!startPageNode || !endPageNode || startPageNode !== endPageNode) {
      onTextSelectionRef.current?.(null);
      return;
    }

    const page = Number(startPageNode.dataset.readerPdfPage || '');
    if (!Number.isFinite(page) || page <= 0) {
      onTextSelectionRef.current?.(null);
      return;
    }

    const textLayer = startPageNode.querySelector('.react-pdf__Page__textContent') as HTMLElement | null;
    if (!textLayer) {
      onTextSelectionRef.current?.(null);
      return;
    }

    const preRange = range.cloneRange();
    preRange.selectNodeContents(textLayer);
    preRange.setEnd(range.startContainer, range.startOffset);
    const startOffset = preRange.toString().length;
    const endOffset = startOffset + range.toString().length;
    const rect = range.getBoundingClientRect();

    onTextSelectionRef.current?.({
      quote,
      page,
      cfi: `pdf:${page}:${startOffset}:${endOffset}:${hashSelectionAnchor(quote)}`,
      rect: new DOMRect(rect.x, rect.y, rect.width, rect.height),
    });
  }, []);

  const rehydratePdfHighlights = useCallback(() => {
    const startedAt = performance.now();
    if (!containerRef.current) return 0;

    const pageNodes = Array.from(
      containerRef.current.querySelectorAll('[data-reader-pdf-page]')
    ) as HTMLElement[];

    for (const pageNode of pageNodes) {
      const page = Number(pageNode.dataset.readerPdfPage || '');
      const textLayer = pageNode.querySelector('.react-pdf__Page__textContent') as HTMLElement | null;
      if (!Number.isFinite(page) || !textLayer) continue;

      clearPdfHighlightMarks(textLayer);

      const pageHighlights = highlights
        .map((highlight) => ({
          highlight,
          anchor: parsePdfHighlightAnchor(highlight.cfi),
        }))
        .filter((entry) => entry.anchor && entry.anchor.page === page)
        .sort((left, right) => (right.anchor!.start - left.anchor!.start));

      for (const entry of pageHighlights) {
        applyPdfHighlightRange({
          textLayer,
          start: entry.anchor!.start,
          end: entry.anchor!.end,
          color: entry.highlight.color,
          highlightId: entry.highlight.highlightId,
        });
      }
    }
    return Number((performance.now() - startedAt).toFixed(2));
  }, [highlights]);

  const schedulePdfHighlightHydration = useCallback(
    (source: 'state_change' | 'page_render', timeoutMs = 900) => {
      const startedAt = performance.now();
      markReaderTelemetry('hydration_deferred', {
        target: 'pdf_highlights',
        source,
        highlightCount: highlights.length,
      });
      highlightHydrationCancelRef.current?.();
      highlightHydrationCancelRef.current = scheduleReaderIdleTask(() => {
        highlightHydrationCancelRef.current = null;
        const durationMs = rehydratePdfHighlights();
        markReaderTelemetry('hydration_completed', {
          target: 'pdf_highlights',
          source,
          durationMs: durationMs ?? 0,
          delayMs: Number((performance.now() - startedAt).toFixed(2)),
          highlightCount: highlights.length,
        });
      }, { timeoutMs });
    },
    [highlights.length, rehydratePdfHighlights]
  );

  useEffect(() => {
    if (loadError || useIframeFallback) {
      onNarrationSnapshotChangeRef.current?.(null);
      return;
    }

    scheduleNarrationSnapshot();
  }, [fontSize, loadError, pageNumber, readingMode, scheduleNarrationSnapshot, theme, useIframeFallback]);

  useEffect(() => {
    schedulePdfHighlightHydration('state_change');

    return () => {
      highlightHydrationCancelRef.current?.();
      highlightHydrationCancelRef.current = null;
    };
  }, [highlights, pageNumber, readingMode, schedulePdfHighlightHydration, url]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full min-h-0 flex flex-col"
      style={{ backgroundColor: viewerBackground }}
      onWheel={handleWheelInPageMode}
      onMouseDown={() => onTextSelectionRef.current?.(null)}
      onMouseUp={() => {
        window.setTimeout(() => {
          captureTextSelection();
        }, 0);
      }}
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
                {topSpacerHeight > 0 && (
                  <div aria-hidden="true" style={{ height: topSpacerHeight }} />
                )}
                {renderedScrollPages.map((page) => (
                  <div
                    key={page}
                    ref={(node) => captureRenderedPageMetrics(page, node)}
                    data-reader-pdf-page={page}
                    className="mb-4 last:mb-0"
                    style={{ minHeight: Math.max(320, estimatedPageStride - PDF_SCROLL_PAGE_GAP_PX) }}
                  >
                    <Page
                      pageNumber={page}
                      width={pageWidth}
                      renderTextLayer={Math.abs(page - pageNumber) <= 1}
                      renderAnnotationLayer={Math.abs(page - pageNumber) <= 1}
                      onRenderSuccess={() => {
                        handleFirstPageRender();
                        window.requestAnimationFrame(() => {
                          schedulePdfHighlightHydration('page_render', 700);
                          scheduleNarrationSnapshot();
                        });
                      }}
                    />
                  </div>
                ))}
                {bottomSpacerHeight > 0 && (
                  <div aria-hidden="true" style={{ height: bottomSpacerHeight }} />
                )}
              </div>
            ) : (
              <div data-reader-pdf-page={pageNumber}>
                <Page
                  pageNumber={pageNumber}
                  width={pageWidth}
                  renderTextLayer
                  renderAnnotationLayer
                  onRenderSuccess={() => {
                    handleFirstPageRender();
                    window.requestAnimationFrame(() => {
                      schedulePdfHighlightHydration('page_render', 700);
                      scheduleNarrationSnapshot();
                    });
                  }}
                />
              </div>
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
