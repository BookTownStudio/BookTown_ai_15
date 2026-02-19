export type ImportFileType = "csv" | "zip";

export type SourceKind = "AUTO" | "CSV" | "DSAR_JSON";
export type DetectedSourceKind = "CSV" | "DSAR_JSON";

export type SessionStatus =
  | "RECEIVED"
  | "UPLOADING"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETE"
  | "FAILED";

export type ProcessingCounters = {
  processed: number;
  succeeded: number;
  failed: number;
};

export type ParseIssue = {
  rowIndex: number;
  rowKey: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type RawPointer = {
  sourceKind: DetectedSourceKind;
  entry: string;
  rowIndex: number;
};

export type ValidationStatus = "VALID";

export type CanonicalImportRow = {
  rowIndex: number;
  rowKey: string;
  identityKey: string;
  sourceKind: DetectedSourceKind;
  rawPointer: RawPointer;
  validationStatus: ValidationStatus;
  title: string;
  author: string;
  titleNorm: string;
  authorNorm: string;
  isbn10: string | null;
  isbn13: string | null;
  rating: number;
  reviewText: string;
  shelfNames: string[];
  exclusiveShelf: string | null;
  dateAdded: string | null;
  dateRead: string | null;
};

export type CsvRow = {
  rowIndex: number;
  values: string[];
};

export type SourceDetectionResult = {
  detectedKind: DetectedSourceKind;
  csvEntryName?: string;
};
