export const PDF_SCROLL_WINDOW_RADIUS = 2;
export const PDF_LOW_MEMORY_SCROLL_WINDOW_RADIUS = 1;
export const PDF_SCROLL_PAGE_GAP_PX = 16;
export const PDF_DEFAULT_PAGE_ASPECT_RATIO = 1.414;
export const PDF_HUGE_PAGECOUNT_THRESHOLD = 150;

export function clampPdfPage(page: number, total: number): number {
  const safeTotal = Math.max(1, Math.trunc(total));
  return Math.min(Math.max(1, Math.trunc(page)), safeTotal);
}

export function resolvePdfPageWindow(
  centerPage: number,
  totalPages: number,
  radius = PDF_SCROLL_WINDOW_RADIUS
): { start: number; end: number } {
  const safeTotal = Math.max(1, Math.trunc(totalPages || 1));
  const safeRadius = Math.max(0, Math.trunc(radius));
  const center = clampPdfPage(centerPage, safeTotal);
  return {
    start: Math.max(1, center - safeRadius),
    end: Math.min(safeTotal, center + safeRadius),
  };
}

export function resolveAdaptivePdfWindowRadius(params: {
  totalPages: number;
  deviceMemoryGb?: number | null;
  reducedMotion?: boolean;
}): number {
  const safeTotal = Math.max(1, Math.trunc(params.totalPages || 1));
  const deviceMemoryGb = params.deviceMemoryGb;
  const isLowMemoryDevice =
    typeof deviceMemoryGb === 'number' && Number.isFinite(deviceMemoryGb) && deviceMemoryGb > 0
      ? deviceMemoryGb <= 4
      : false;

  if (safeTotal >= PDF_HUGE_PAGECOUNT_THRESHOLD || isLowMemoryDevice || params.reducedMotion) {
    return PDF_LOW_MEMORY_SCROLL_WINDOW_RADIUS;
  }

  return PDF_SCROLL_WINDOW_RADIUS;
}

export function buildVirtualPdfPageOffsetIndex(numPages: number, pageStridePx: number): number[] {
  const safeTotal = Math.max(0, Math.trunc(numPages));
  const safeStride = Math.max(1, Math.trunc(pageStridePx));
  return Array.from({ length: safeTotal }, (_, index) => index * safeStride);
}

export function estimatePdfPageStridePx(params: {
  pageWidth?: number;
  containerWidth?: number;
  measuredPageStride?: number | null;
}): number {
  const measured = params.measuredPageStride;
  if (typeof measured === 'number' && Number.isFinite(measured) && measured > 0) {
    return Math.trunc(measured);
  }

  const width = Math.max(1, Math.trunc(params.pageWidth || params.containerWidth || 720));
  return Math.max(
    1,
    Math.round(width * PDF_DEFAULT_PAGE_ASPECT_RATIO) + PDF_SCROLL_PAGE_GAP_PX
  );
}
