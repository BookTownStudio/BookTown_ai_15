// lib/hooks/useReadingProgress.ts

import { useCallback } from "react";
import { useReaderProgress } from "./useReaderProgress.ts";

/**
 * Legacy compatibility wrapper.
 *
 * Batch 2 decision (locked):
 * - Client MUST NOT write reading_progress directly.
 * - All writes route through recordReadingProgress callable.
 *
 * This wrapper preserves the old API while delegating to
 * the server-authoritative hook.
 */

export interface ReadingLocation {
  page?: number;
  totalPages?: number;
  scroll?: number;
  cfi?: string;
}

export function useReadingProgress(bookId?: string) {
  const { progress, isLoading, recordProgress } = useReaderProgress(bookId);

  const updateProgress = useCallback(
    (nextProgress: number, location?: ReadingLocation) => {
      const clamped = Math.max(0, Math.min(1, nextProgress));
      const page =
        typeof location?.page === "number" && Number.isFinite(location.page)
          ? Math.max(1, Math.trunc(location.page))
          : 1;

      const totalPages =
        typeof location?.totalPages === "number" && Number.isFinite(location.totalPages)
          ? Math.max(1, Math.trunc(location.totalPages))
          : Math.max(1, page);

      recordProgress({
        currentPage: page,
        totalPages,
        percentage: clamped,
        lastPosition: location ?? null,
      });
    },
    [recordProgress]
  );

  return {
    isLoading,
    progress: progress?.progress ?? 0,
    location: (progress?.lastPosition as ReadingLocation | undefined) ?? undefined,
    updateProgress,
  };
}
