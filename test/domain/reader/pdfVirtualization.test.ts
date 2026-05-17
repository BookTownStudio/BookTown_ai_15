import { describe, expect, it } from 'vitest';
import {
  buildVirtualPdfPageOffsetIndex,
  estimatePdfPageStridePx,
  PDF_LOW_MEMORY_SCROLL_WINDOW_RADIUS,
  PDF_SCROLL_WINDOW_RADIUS,
  resolveAdaptivePdfWindowRadius,
  resolvePdfPageWindow,
} from '../../../lib/reader/runtime/pdfVirtualization.ts';

describe('pdf virtualization helpers', () => {
  it('keeps the rendered page window bounded around the current page', () => {
    expect(resolvePdfPageWindow(1, 100)).toEqual({ start: 1, end: 3 });
    expect(resolvePdfPageWindow(50, 100)).toEqual({ start: 48, end: 52 });
    expect(resolvePdfPageWindow(100, 100)).toEqual({ start: 98, end: 100 });
  });

  it('builds deterministic virtual offsets for large PDFs without page nodes', () => {
    const offsets = buildVirtualPdfPageOffsetIndex(5, 1200);
    expect(offsets).toEqual([0, 1200, 2400, 3600, 4800]);
  });

  it('prefers measured page stride when available', () => {
    expect(estimatePdfPageStridePx({ measuredPageStride: 1400, pageWidth: 720 })).toBe(1400);
    expect(estimatePdfPageStridePx({ pageWidth: 720 })).toBeGreaterThan(720);
  });

  it('shrinks the rendered window for huge PDFs and constrained devices', () => {
    expect(resolveAdaptivePdfWindowRadius({ totalPages: 40, deviceMemoryGb: 8 })).toBe(
      PDF_SCROLL_WINDOW_RADIUS
    );
    expect(resolveAdaptivePdfWindowRadius({ totalPages: 220, deviceMemoryGb: 8 })).toBe(
      PDF_LOW_MEMORY_SCROLL_WINDOW_RADIUS
    );
    expect(resolveAdaptivePdfWindowRadius({ totalPages: 40, deviceMemoryGb: 2 })).toBe(
      PDF_LOW_MEMORY_SCROLL_WINDOW_RADIUS
    );
  });
});
