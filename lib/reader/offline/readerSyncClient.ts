import { getFunctions, httpsCallable } from "firebase/functions";
import { readerSyncQueue } from "./readerSyncQueue.ts";
import { ReaderSyncOperation, ReaderSyncResult } from "./types.ts";
import type { LibrarianRecommendationContext } from "../../../types/librarian.ts";

function generateOpId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `rop_${Date.now()}_${random}`;
}

function normalizeEnvelope<T>(raw: unknown): T {
  const payload = raw as any;
  if (payload?.success === false) {
    const code =
      typeof payload?.error?.code === "string" ? payload.error.code : "UNKNOWN";
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "Reader sync call failed.";
    throw new Error(`[${code}] ${message}`);
  }

  return (payload?.success === true ? payload.data : payload) as T;
}

export function enqueueProgressSyncOperation(params: {
  bookId: string;
  currentPage: number;
  totalPages: number;
  percentage: number;
  lastPosition?: Record<string, unknown> | null;
  lastAnchor?: Record<string, unknown> | null;
  recommendationContext?: LibrarianRecommendationContext;
}): ReaderSyncOperation {
  const opId = generateOpId();
  const clientTimestampMs = Date.now();
  const op: ReaderSyncOperation = {
    opId,
    idempotencyKey: `progress:${params.bookId}:${clientTimestampMs}:${opId}`,
    type: "upsert_progress",
    bookId: params.bookId,
    clientTimestampMs,
    payload: {
      currentPage: params.currentPage,
      totalPages: params.totalPages,
      percentage: params.percentage,
      lastPosition: params.lastPosition || null,
      lastAnchor: params.lastAnchor || null,
      status_state: params.percentage >= 1 ? "completed" : "reading",
      ...(params.recommendationContext
        ? { recommendationContext: params.recommendationContext }
        : {}),
    },
  };

  return readerSyncQueue.enqueue(op);
}

export function enqueueBookmarkUpsertSyncOperation(params: {
  bookId: string;
  bookmarkId: string;
  page: number;
  label?: string;
  cfi?: string | null;
}): ReaderSyncOperation {
  const op: ReaderSyncOperation = {
    opId: generateOpId(),
    idempotencyKey: `bookmark:${params.bookId}:${params.bookmarkId}`,
    type: "upsert_bookmark",
    bookId: params.bookId,
    clientTimestampMs: Date.now(),
    payload: {
      bookmarkId: params.bookmarkId,
      label: params.label || "",
      cfi: params.cfi || null,
      page: Math.max(1, Math.trunc(params.page)),
    },
  };

  return readerSyncQueue.enqueue(op);
}

export function enqueueHighlightUpsertSyncOperation(params: {
  bookId: string;
  highlightId: string;
  page: number;
  color?: string;
  quote?: string;
  note?: string;
  cfi?: string | null;
}): ReaderSyncOperation {
  const op: ReaderSyncOperation = {
    opId: generateOpId(),
    idempotencyKey: `highlight:${params.bookId}:${params.highlightId}`,
    type: "upsert_highlight",
    bookId: params.bookId,
    clientTimestampMs: Date.now(),
    payload: {
      highlightId: params.highlightId,
      color: params.color || "yellow",
      quote: params.quote || "",
      note: params.note || "",
      cfi: params.cfi || null,
      page: Math.max(1, Math.trunc(params.page)),
    },
  };

  return readerSyncQueue.enqueue(op);
}

export function enqueueHighlightDeleteSyncOperation(params: {
  bookId: string;
  highlightId: string;
}): ReaderSyncOperation {
  const op: ReaderSyncOperation = {
    opId: generateOpId(),
    idempotencyKey: `highlight:${params.bookId}:${params.highlightId}`,
    type: "delete_highlight",
    bookId: params.bookId,
    clientTimestampMs: Date.now(),
    payload: {
      highlightId: params.highlightId,
    },
  };

  return readerSyncQueue.enqueue(op);
}

export function enqueueBookmarkDeleteSyncOperation(params: {
  bookId: string;
  bookmarkId: string;
}): ReaderSyncOperation {
  const op: ReaderSyncOperation = {
    opId: generateOpId(),
    idempotencyKey: `bookmark:${params.bookId}:${params.bookmarkId}`,
    type: "delete_bookmark",
    bookId: params.bookId,
    clientTimestampMs: Date.now(),
    payload: {
      bookmarkId: params.bookmarkId,
    },
  };

  return readerSyncQueue.enqueue(op);
}

export async function flushReaderOperations(options?: {
  batchSize?: number;
  maxBatches?: number;
}): Promise<ReaderSyncResult> {
  const batchSize = Number.isFinite(options?.batchSize)
    ? Math.max(1, Math.min(100, Math.trunc(options!.batchSize!)))
    : 20;
  const maxBatches = Number.isFinite(options?.maxBatches)
    ? Math.max(1, Math.min(20, Math.trunc(options!.maxBatches!)))
    : 5;

  const aggregated: ReaderSyncResult = {
    accepted: 0,
    applied: 0,
    deduped: 0,
    rejected: 0,
    errors: [],
  };

  const fn = httpsCallable<{ operations: ReaderSyncOperation[] }, ReaderSyncResult>(
    getFunctions(),
    "syncReaderOperations"
  );

  for (let i = 0; i < maxBatches; i += 1) {
    const batch = readerSyncQueue.peek(batchSize);
    if (batch.length === 0) {
      break;
    }

    const res = await fn({
      operations: batch,
    });
    const result = normalizeEnvelope<ReaderSyncResult>(res.data);

    aggregated.accepted += result.accepted;
    aggregated.applied += result.applied;
    aggregated.deduped += result.deduped;
    aggregated.rejected += result.rejected;
    aggregated.errors.push(...result.errors);

    const failedIds = new Set(result.errors.map((entry) => entry.opId));
    const removableIds = batch
      .filter((op) => {
        if (!failedIds.has(op.opId)) return true;
        const err = result.errors.find((entry) => entry.opId === op.opId);
        return (
          err?.code === "invalid-argument" ||
          err?.code === "failed-precondition" ||
          err?.code === "already-exists"
        );
      })
      .map((op) => op.opId);

    if (removableIds.length > 0) {
      readerSyncQueue.removeMany(removableIds);
    } else {
      break;
    }
  }

  return aggregated;
}
