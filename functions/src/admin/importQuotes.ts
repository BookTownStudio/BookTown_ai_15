import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { parse } from "csv-parse";

import { admin } from "../firebaseAdmin";
import { assertRoleFromClaims } from "../shared/auth";

const db = admin.firestore();
const bucket = admin.storage().bucket();

export const QUOTE_IMPORT_CONTROL_DOC_PATH = "system/importJobs";
export const QUOTE_IMPORT_CANONICAL_STORAGE_PATH = "imports/quotes/quotes500k.csv";
export const QUOTE_IMPORT_DAILY_ROW_LIMIT = 15_000;
export const QUOTE_IMPORT_DAILY_WRITE_BUDGET = 15_000;
export const QUOTE_IMPORT_BATCH_ROW_LIMIT = 200;
export const QUOTE_IMPORT_ALLOWED_HEADERS = ["quote", "author", "category"] as const;

export const QUOTE_IMPORT_CANONICAL_HEADERS = [
  "texten",
  "sourceen",
  "tags",
] as const;

const QUOTE_IMPORT_MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;
const QUOTE_IMPORT_ALLOWED_CONTENT_TYPES = new Set([
  "",
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
]);

export type QuoteImportJobStatus =
  | "registered"
  | "running"
  | "completed"
  | "failed";

export type QuoteImportJobState = {
  status: QuoteImportJobStatus;
  storagePath: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  totalRows: number;
  processedRows: number;
  createdRows: number;
  duplicateRows: number;
  skippedRows: number;
  failedRows: number;
  lastProcessedRow: number;
  completed: boolean;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
  registeredBy: string;
  lastError?: string;
  dailyRowLimit: number;
  dailyWriteBudget: number;
  batchRowLimit: number;
  leaseExpiresAtMs?: number;
};

export function quoteImportStateRef() {
  return db.collection("system").doc("importJobs");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function readOptionalNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : undefined;
}

function normalizeHeader(value: unknown): string {
  return typeof value === "string"
    ? value.trim().replace(/^\uFEFF/, "").toLowerCase()
    : "";
}

function detectCsvSchema(normalizedHeaders: string[]): "raw" | "canonical" {
  const hasRaw = QUOTE_IMPORT_ALLOWED_HEADERS.every((header) =>
    normalizedHeaders.includes(header)
  );

  if (hasRaw) {
    return "raw";
  }

  const hasCanonical = QUOTE_IMPORT_CANONICAL_HEADERS.every((header) =>
    normalizedHeaders.includes(header)
  );

  if (hasCanonical) {
    return "canonical";
  }

  throw new HttpsError(
    "invalid-argument",
    "CSV must contain either raw headers (quote, author, category) or canonical headers (textEn, sourceEn, tags)."
  );
}

function validateCsvColumns(headers: string[]): string[] {
  const normalizedHeaders = headers.map(normalizeHeader);
  detectCsvSchema(normalizedHeaders);
  return normalizedHeaders;
}

function readRequiredString(
  value: unknown,
  field: string,
  maxLength: number
): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  if (normalized.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${field} exceeds ${maxLength} characters.`
    );
  }
  return normalized;
}

function readRequiredPositiveInteger(
  value: unknown,
  field: string,
  maxValue: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpsError("invalid-argument", `${field} must be a number.`);
  }
  const normalized = Math.trunc(value);
  if (normalized <= 0 || normalized > maxValue) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be between 1 and ${maxValue}.`
    );
  }
  return normalized;
}

function readOptionalString(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${field} exceeds ${maxLength} characters.`
    );
  }
  return normalized;
}

function validateTemporaryUploadPath(storagePath: string, uid: string): void {
  const expectedPrefix = `imports/${uid}/quote_uploads/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new HttpsError("permission-denied", "Invalid quote import upload path.");
  }
}

async function countCsvRows(storagePath: string): Promise<number> {
  const file = bucket.file(storagePath);
  const parser = parse({
    columns: (headers) => validateCsvColumns(headers),
    bom: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    relax_quotes: true,
  });

  let totalRows = 0;
  const stream = file.createReadStream().pipe(parser);
  for await (const _record of stream) {
    totalRows += 1;
  }
  return totalRows;
}

async function deleteIfExists(storagePath: string): Promise<void> {
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    return;
  }
  await file.delete();
}

function estimateCompletionDays(job: QuoteImportJobState): number {
  const remainingRows = Math.max(job.totalRows - job.lastProcessedRow, 0);
  if (remainingRows === 0) {
    return 0;
  }

  // Safe estimate uses worst-case canonical writes: one quote doc + one identity doc.
  const safeDailyThroughput = Math.max(
    1,
    Math.min(job.dailyRowLimit, Math.floor(job.dailyWriteBudget / 2))
  );
  return Math.ceil(remainingRows / safeDailyThroughput);
}

export function readQuoteImportJobState(
  docData: FirebaseFirestore.DocumentData | undefined
): QuoteImportJobState | null {
  const raw = asRecord(docData?.quotes);
  if (!raw) {
    return null;
  }

  const statusRaw = readString(raw.status);
  if (
    statusRaw !== "registered" &&
    statusRaw !== "running" &&
    statusRaw !== "completed" &&
    statusRaw !== "failed"
  ) {
    return null;
  }

  const storagePath = readString(raw.storagePath);
  const fileName = readString(raw.fileName);
  const createdAt = readString(raw.createdAt);
  const updatedAt = readString(raw.updatedAt);
  const registeredBy = readString(raw.registeredBy);
  if (!storagePath || !fileName || !createdAt || !updatedAt || !registeredBy) {
    return null;
  }

  return {
    status: statusRaw,
    storagePath,
    fileName,
    fileSize: readNonNegativeInteger(raw.fileSize),
    contentType: readString(raw.contentType),
    totalRows: readNonNegativeInteger(raw.totalRows),
    processedRows: readNonNegativeInteger(raw.processedRows),
    createdRows: readNonNegativeInteger(raw.createdRows),
    duplicateRows: readNonNegativeInteger(raw.duplicateRows),
    skippedRows: readNonNegativeInteger(raw.skippedRows),
    failedRows: readNonNegativeInteger(raw.failedRows),
    lastProcessedRow: readNonNegativeInteger(raw.lastProcessedRow),
    completed: raw.completed === true,
    lastRunAt: readString(raw.lastRunAt) || undefined,
    createdAt,
    updatedAt,
    registeredBy,
    lastError: readString(raw.lastError) || undefined,
    dailyRowLimit:
      readNonNegativeInteger(raw.dailyRowLimit) || QUOTE_IMPORT_DAILY_ROW_LIMIT,
    dailyWriteBudget:
      readNonNegativeInteger(raw.dailyWriteBudget) || QUOTE_IMPORT_DAILY_WRITE_BUDGET,
    batchRowLimit:
      readNonNegativeInteger(raw.batchRowLimit) || QUOTE_IMPORT_BATCH_ROW_LIMIT,
    leaseExpiresAtMs: readOptionalNonNegativeInteger(raw.leaseExpiresAtMs),
  };
}

export function serializeQuoteImportJobState(
  job: QuoteImportJobState
): Record<string, unknown> {
  return {
    status: job.status,
    storagePath: job.storagePath,
    fileName: job.fileName,
    fileSize: job.fileSize,
    contentType: job.contentType,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    createdRows: job.createdRows,
    duplicateRows: job.duplicateRows,
    skippedRows: job.skippedRows,
    failedRows: job.failedRows,
    lastProcessedRow: job.lastProcessedRow,
    completed: job.completed,
    lastRunAt: job.lastRunAt ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    registeredBy: job.registeredBy,
    lastError: job.lastError ?? null,
    dailyRowLimit: job.dailyRowLimit,
    dailyWriteBudget: job.dailyWriteBudget,
    batchRowLimit: job.batchRowLimit,
    leaseExpiresAtMs: job.leaseExpiresAtMs ?? null,
  };
}

export function mapQuoteImportJobResponse(job: QuoteImportJobState | null) {
  if (!job) {
    return null;
  }

  return {
    status: job.status,
    storagePath: job.storagePath,
    fileName: job.fileName,
    fileSize: job.fileSize,
    contentType: job.contentType,
    totalRows: job.totalRows,
    processedRows: job.processedRows,
    createdRows: job.createdRows,
    duplicateRows: job.duplicateRows,
    skippedRows: job.skippedRows,
    failedRows: job.failedRows,
    lastProcessedRow: job.lastProcessedRow,
    completed: job.completed,
    ...(job.lastRunAt ? { lastRunAt: job.lastRunAt } : {}),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    registeredBy: job.registeredBy,
    ...(job.lastError ? { lastError: job.lastError } : {}),
    dailyRowLimit: job.dailyRowLimit,
    dailyWriteBudget: job.dailyWriteBudget,
    batchRowLimit: job.batchRowLimit,
    estimatedCompletionDays: estimateCompletionDays(job),
  };
}

export const adminRegisterQuoteImport = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const storagePath = readRequiredString(data.storagePath, "storagePath", 500);
  const fileName = readRequiredString(data.fileName, "fileName", 240);
  const fileSize = readRequiredPositiveInteger(
    data.fileSize,
    "fileSize",
    QUOTE_IMPORT_MAX_FILE_SIZE_BYTES
  );
  const contentType = readOptionalString(data.contentType, "contentType", 160) ?? "";

  validateTemporaryUploadPath(storagePath, caller.uid);

  const existingState = readQuoteImportJobState((await quoteImportStateRef().get()).data());
  if (existingState && !existingState.completed && existingState.status !== "failed") {
    throw new HttpsError(
      "failed-precondition",
      "A quote import job is already active. Wait for completion before registering a new file."
    );
  }

  const sourceFile = bucket.file(storagePath);
  const [exists] = await sourceFile.exists();
  if (!exists) {
    throw new HttpsError("not-found", "Uploaded quote import file was not found.");
  }

  const [metadata] = await sourceFile.getMetadata();
  const storedSize = Number(metadata.size || 0);
  const storedContentType =
    typeof metadata.contentType === "string" ? metadata.contentType.trim() : "";

  if (storedSize <= 0 || storedSize > QUOTE_IMPORT_MAX_FILE_SIZE_BYTES) {
    throw new HttpsError("invalid-argument", "Quote import file size is invalid.");
  }
  if (fileSize !== storedSize) {
    throw new HttpsError("failed-precondition", "Uploaded quote import file metadata is stale.");
  }
  if (
    storedContentType &&
    !QUOTE_IMPORT_ALLOWED_CONTENT_TYPES.has(storedContentType)
  ) {
    throw new HttpsError("invalid-argument", "Quote import file must be a CSV upload.");
  }
  if (contentType && !QUOTE_IMPORT_ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new HttpsError("invalid-argument", "Quote import file must be a CSV upload.");
  }

  const totalRows = await countCsvRows(storagePath);
  if (totalRows <= 0) {
    throw new HttpsError("invalid-argument", "Quote import CSV contains no data rows.");
  }

  await deleteIfExists(QUOTE_IMPORT_CANONICAL_STORAGE_PATH);
  await sourceFile.copy(bucket.file(QUOTE_IMPORT_CANONICAL_STORAGE_PATH));
  await sourceFile.delete();

  const nowIso = new Date().toISOString();
  const job: QuoteImportJobState = {
    status: "registered",
    storagePath: QUOTE_IMPORT_CANONICAL_STORAGE_PATH,
    fileName,
    fileSize,
    contentType: storedContentType || contentType,
    totalRows,
    processedRows: 0,
    createdRows: 0,
    duplicateRows: 0,
    skippedRows: 0,
    failedRows: 0,
    lastProcessedRow: 0,
    completed: false,
    createdAt: nowIso,
    updatedAt: nowIso,
    registeredBy: caller.uid,
    dailyRowLimit: QUOTE_IMPORT_DAILY_ROW_LIMIT,
    dailyWriteBudget: QUOTE_IMPORT_DAILY_WRITE_BUDGET,
    batchRowLimit: QUOTE_IMPORT_BATCH_ROW_LIMIT,
  };

  await quoteImportStateRef().set(
    {
      quotes: serializeQuoteImportJobState(job),
    },
    { merge: true }
  );

  logger.info("[ADMIN][QUOTE_IMPORT][REGISTERED]", {
    actorUid: caller.uid,
    storagePath: QUOTE_IMPORT_CANONICAL_STORAGE_PATH,
    totalRows,
    fileSize,
    fileName,
  });

  return {
    job: mapQuoteImportJobResponse(job),
  };
});

export const adminGetQuoteImportStatus = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const snap = await quoteImportStateRef().get();
  const job = readQuoteImportJobState(snap.data());

  const safeJob = JSON.parse(JSON.stringify(mapQuoteImportJobResponse(job)));

  return {
    job: safeJob,
  };
});