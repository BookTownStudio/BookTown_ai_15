import type { Timestamp } from "firebase/firestore";
import type { ReaderFormat, ReaderSessionSnapshot } from "../lib/reader/runtime/contracts.ts";
import type { OfflineEbookRecord } from "../app/lib/offline/offlineManager.ts";

export interface ReaderRuntimeDTO {
  bookId: string;
  format: ReaderFormat;
  session: ReaderSessionSnapshot | null;
  offlineRecord: OfflineEbookRecord | null;
}

export interface ReaderContinuityDTO {
  bookId: string;
  progress: number;
  updatedAt: Timestamp | null;
  status_state?: ReadingContinuityState;
  continuityLevel?: string | null;
  sourceType?: string | null;
}

export type OfflineReaderRecordDTO = OfflineEbookRecord;

export type ReadingContinuityState = "reading" | "paused" | "abandoned" | "completed";

export interface ReaderInsightsDTO {
  currentlyReading?: Array<{
    bookId?: unknown;
    progress?: unknown;
    lastActiveAt?: unknown;
    status_state?: unknown;
    continuityLevel?: unknown;
    sourceType?: unknown;
  }>;
}
