// functions/src/library/ingestion.types.ts

import { Timestamp } from "firebase-admin/firestore";

/**
 * Canonical ingestion state machine.
 * Backend authoritative. Frontend must never infer ingestion state.
 */
export enum IngestionState {
  RECEIVED = "RECEIVED",
  VALIDATING = "VALIDATING",
  MATERIALIZING = "MATERIALIZING",
  STORAGE_UPLOADING = "STORAGE_UPLOADING",
  COVER_PROCESSING = "COVER_PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED_RETRYABLE = "FAILED_RETRYABLE",
  FAILED_FATAL = "FAILED_FATAL",
}

export type IngestionFailureClass =
  | "NETWORK"
  | "PROVIDER"
  | "STORAGE"
  | "VALIDATION"
  | "UNKNOWN";

/**
 * Firestore record stored in `book_ingestions/{ingestionKey}`
 * This is the single source of truth for ingestion lifecycle.
 */
export interface IngestionRecord {
  ingestionId: string;
  bookId: string | null;
  externalKey: string;
  source: "googleBooks" | "openLibrary";
  state: IngestionState;
  retryCount: number;
  lastErrorClass?: IngestionFailureClass;
  lastErrorMessage?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
