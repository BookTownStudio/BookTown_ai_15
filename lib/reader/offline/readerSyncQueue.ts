import { ReaderSyncOperation } from "./types.ts";

const READER_SYNC_QUEUE_KEY = "booktown_reader_sync_queue_v1";
const MAX_QUEUE_SIZE = 500;

function readQueue(): ReaderSyncOperation[] {
  try {
    const raw = localStorage.getItem(READER_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ReaderSyncOperation[];
  } catch {
    return [];
  }
}

function writeQueue(next: ReaderSyncOperation[]): void {
  localStorage.setItem(READER_SYNC_QUEUE_KEY, JSON.stringify(next));
}

function operationDeduplicationKey(op: ReaderSyncOperation): string {
  if (op.type === "upsert_progress") {
    return `progress:${op.bookId}:${op.clientTimestampMs}:${op.opId}`;
  }

  if (op.type === "upsert_highlight" || op.type === "delete_highlight") {
    const highlightId = String(op.payload?.highlightId || "");
    return `highlight:${op.bookId}:${highlightId}`;
  }

  if (op.type === "upsert_bookmark" || op.type === "delete_bookmark") {
    const bookmarkId = String(op.payload?.bookmarkId || "");
    return `bookmark:${op.bookId}:${bookmarkId}`;
  }

  return `${op.type}:${op.bookId}:${op.opId}`;
}

export const readerSyncQueue = {
  list(): ReaderSyncOperation[] {
    return readQueue();
  },

  count(): number {
    return readQueue().length;
  },

  clear(): void {
    localStorage.removeItem(READER_SYNC_QUEUE_KEY);
  },

  enqueue(op: ReaderSyncOperation): ReaderSyncOperation {
    const queue = readQueue();
    const dedupeKey = operationDeduplicationKey(op);

    const filtered = queue.filter((item) => {
      if (item.opId === op.opId) return false;
      return operationDeduplicationKey(item) !== dedupeKey;
    });

    filtered.push(op);
    const bounded = filtered.slice(-MAX_QUEUE_SIZE);
    writeQueue(bounded);
    return op;
  },

  peek(limit: number): ReaderSyncOperation[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 20;
    return readQueue().slice(0, safeLimit);
  },

  removeMany(opIds: string[]): void {
    const idSet = new Set(opIds);
    const next = readQueue().filter((item) => !idSet.has(item.opId));
    writeQueue(next);
  },
};
