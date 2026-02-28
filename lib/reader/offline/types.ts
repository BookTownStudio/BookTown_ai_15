export type ReaderSyncOperationType =
  | "upsert_progress"
  | "upsert_highlight"
  | "delete_highlight"
  | "upsert_bookmark"
  | "delete_bookmark";

export interface ReaderSyncOperation {
  opId: string;
  idempotencyKey: string;
  type: ReaderSyncOperationType;
  bookId: string;
  clientTimestampMs: number;
  payload?: Record<string, unknown>;
}

export interface ReaderSyncResult {
  accepted: number;
  applied: number;
  deduped: number;
  rejected: number;
  errors: Array<{
    opId: string;
    code: string;
    message: string;
  }>;
}
