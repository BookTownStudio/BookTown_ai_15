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
  recommendationContext?: LibrarianRecommendationContext;
}): ReaderSyncOperation {
  const op: ReaderSyncOperation = {
    opId: generateOpId(),
    idempotencyKey: `progress:${params.bookId}`,
    type: "upsert_progress",
    bookId: params.bookId,
    clientTimestampMs: Date.now(),
    payload: {
      currentPage: params.currentPage,
      totalPages: params.totalPages,
      percentage: params.percentage,
      lastPosition: params.lastPosition || null,
      status_state: params.percentage >= 1 ? "completed" : "reading",
      ...(params.recommendationContext
        ? { recommendationContext: params.recommendationContext }
        : {}),
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
        return err?.code === "invalid-argument";
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
