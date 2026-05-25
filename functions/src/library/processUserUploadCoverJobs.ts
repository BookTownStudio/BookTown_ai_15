import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import sharp from "sharp";
import { inflateRawSync } from "zlib";

const db = admin.firestore();
const bucket = admin.storage().bucket();

type UploadFileType = "pdf" | "epub";
type CoverState =
  | "PENDING"
  | "PROCESSING"
  | "READY"
  | "FAILED_RETRYABLE"
  | "FAILED_FATAL";
type JobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED_RETRYABLE"
  | "FAILED_FATAL";

type CoverFailureCode =
  | "BOOK_NOT_FOUND"
  | "INVALID_BOOK_SOURCE"
  | "MISSING_STORAGE_PATH"
  | "INVALID_STORAGE_PATH"
  | "SOURCE_FILE_NOT_FOUND"
  | "SOURCE_FILE_EMPTY"
  | "SOURCE_FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "PDF_RENDER_FAILED"
  | "EPUB_ARCHIVE_INVALID"
  | "EPUB_COVER_NOT_FOUND"
  | "EPUB_IMAGE_DECODE_FAILED"
  | "STORAGE_WRITE_FAILED"
  | "UNKNOWN";

interface CoverJobErrorShape {
  code: CoverFailureCode;
  message: string;
  retryable: boolean;
}

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const ZIP_SIGNATURE_EOCD = 0x06054b50;
const ZIP_SIGNATURE_CENTRAL_FILE = 0x02014b50;
const ZIP_SIGNATURE_LOCAL_FILE = 0x04034b50;
const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;
const MIN_IMAGE_BYTES = 1_000;
const COVER_BOOK_WRITE_ALLOWLIST = new Set([
  "cover",
  "coverUrl",
  "coverState",
  "coverFailureReason",
  "coverUpdatedAt",
  "updatedAt",
]);

const DERIVED_SIZES = {
  large: { width: 1200, quality: 82 },
  medium: { width: 600, quality: 80 },
  small: { width: 300, quality: 75 },
} as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function assertAllowedCoverBookPatch(
  patch: Record<string, unknown>,
  context: string
): void {
  const unexpectedFields = Object.keys(patch).filter(
    (field) => !COVER_BOOK_WRITE_ALLOWLIST.has(field)
  );
  if (unexpectedFields.length > 0) {
    logger.error("[COVER_JOB][DISALLOWED_BOOK_MUTATION_FIELDS]", {
      context,
      unexpectedFields,
    });
    fail("UNKNOWN", "Cover pipeline attempted to mutate fields outside its authority.");
  }
}

function coverFailureReason(error: CoverJobErrorShape): Record<string, unknown> {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  };
}

function toUploadFileType(value: unknown): UploadFileType | null {
  const fileType = asNonEmptyString(value);
  if (fileType === "pdf" || fileType === "epub") return fileType;
  return null;
}

function toInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.floor(value);
}

function coverPath(bookId: string, size: "original" | "large" | "medium" | "small"): string {
  return `books/${bookId}/covers/${size}.jpg`;
}

function isRetryableCode(code: CoverFailureCode): boolean {
  return code === "SOURCE_FILE_NOT_FOUND" || code === "STORAGE_WRITE_FAILED" || code === "UNKNOWN";
}

function toErrorShape(error: unknown): CoverJobErrorShape {
  if (error && typeof error === "object") {
    const obj = error as Record<string, unknown>;
    const code = asNonEmptyString(obj.code) as CoverFailureCode | null;
    const message = asNonEmptyString(obj.message);
    const retryable = obj.retryable === true;
    if (code && message) {
      return { code, message, retryable };
    }
  }

  return {
    code: "UNKNOWN",
    message: String(error),
    retryable: true,
  };
}

function fail(
  code: CoverFailureCode,
  message: string,
  retryable = isRetryableCode(code)
): never {
  throw { code, message, retryable };
}

function assertSourcePath(bookId: string, storagePath: string): void {
  if (!storagePath.startsWith(`books/${bookId}/original/`)) {
    fail("INVALID_STORAGE_PATH", "Upload source path is outside canonical prefix.", false);
  }
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const maxScanBytes = 66_000;
  const start = Math.max(0, buffer.length - maxScanBytes);
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === ZIP_SIGNATURE_EOCD) {
      return i;
    }
  }
  return -1;
}

function parseZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) {
    fail("EPUB_ARCHIVE_INVALID", "EOCD marker not found in EPUB archive.", false);
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const end = centralDirectoryOffset + centralDirectorySize;

  if (end > buffer.length || centralDirectoryOffset < 0) {
    fail("EPUB_ARCHIVE_INVALID", "Central directory bounds are invalid.", false);
  }

  const entries: ZipEntry[] = [];
  let cursor = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > buffer.length) {
      fail("EPUB_ARCHIVE_INVALID", "Central file header truncated.", false);
    }

    if (buffer.readUInt32LE(cursor) !== ZIP_SIGNATURE_CENTRAL_FILE) {
      fail("EPUB_ARCHIVE_INVALID", "Central file header signature mismatch.", false);
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);

    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLength;

    if (nameEnd > buffer.length) {
      fail("EPUB_ARCHIVE_INVALID", "Central file name exceeds archive bounds.", false);
    }

    const name = buffer.toString("utf8", nameStart, nameEnd);
    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });

    cursor = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function readZipEntryData(buffer: Buffer, entry: ZipEntry): Buffer {
  const headerOffset = entry.localHeaderOffset;
  if (headerOffset + 30 > buffer.length) {
    fail("EPUB_ARCHIVE_INVALID", "Local file header truncated.", false);
  }

  if (buffer.readUInt32LE(headerOffset) !== ZIP_SIGNATURE_LOCAL_FILE) {
    fail("EPUB_ARCHIVE_INVALID", "Local file header signature mismatch.", false);
  }

  const fileNameLength = buffer.readUInt16LE(headerOffset + 26);
  const extraLength = buffer.readUInt16LE(headerOffset + 28);
  const dataStart = headerOffset + 30 + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;

  if (dataEnd > buffer.length || dataStart < 0) {
    fail("EPUB_ARCHIVE_INVALID", "Entry data bounds exceed archive.", false);
  }

  const compressed = buffer.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) {
    return Buffer.from(compressed);
  }
  if (entry.compressionMethod === 8) {
    try {
      return inflateRawSync(compressed);
    } catch {
      fail("EPUB_ARCHIVE_INVALID", "Unable to inflate EPUB entry.", false);
    }
  }

  fail("EPUB_ARCHIVE_INVALID", "Unsupported EPUB compression method.", false);
}

function rankEpubImageEntry(entry: ZipEntry): number {
  const lower = entry.name.toLowerCase();
  const hasImageExt = /\.(jpe?g|png|webp)$/i.test(lower);
  if (!hasImageExt) return Number.NEGATIVE_INFINITY;

  let score = 0;
  if (lower.includes("cover")) score += 1000;
  if (lower.includes("images/")) score += 100;
  score += Math.min(entry.uncompressedSize, 25_000_000) / 1000;
  return score;
}

async function extractPdfCover(source: Buffer): Promise<Buffer> {
  try {
    const page = await sharp(source, {
      density: 220,
      pages: 1,
      page: 0,
      failOn: "none",
    })
      .flatten({ background: "#ffffff" })
      .rotate()
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();

    if (page.length < MIN_IMAGE_BYTES) {
      fail("PDF_RENDER_FAILED", "PDF first page render returned insufficient image data.", false);
    }

    return page;
  } catch {
    fail("PDF_RENDER_FAILED", "Failed to render PDF first page as cover.", false);
  }
}

async function extractEpubCover(source: Buffer): Promise<Buffer> {
  const entries = parseZipEntries(source);
  const candidates = entries
    .map((entry) => ({ entry, rank: rankEpubImageEntry(entry) }))
    .filter((item) => Number.isFinite(item.rank))
    .sort((a, b) => b.rank - a.rank)
    .map((item) => item.entry);

  if (candidates.length === 0) {
    fail("EPUB_COVER_NOT_FOUND", "No image candidates found in EPUB archive.", false);
  }

  for (const candidate of candidates.slice(0, 20)) {
    try {
      const raw = readZipEntryData(source, candidate);
      if (raw.length < MIN_IMAGE_BYTES) continue;

      const jpeg = await sharp(raw, { failOn: "none" })
        .rotate()
        .jpeg({ quality: 84, mozjpeg: true })
        .toBuffer();

      if (jpeg.length >= MIN_IMAGE_BYTES) {
        return jpeg;
      }
    } catch {
      continue;
    }
  }

  fail("EPUB_IMAGE_DECODE_FAILED", "Unable to decode a valid EPUB cover image.", false);
}

async function writeCoverFile(
  path: string,
  bytes: Buffer,
  bookId: string,
  size: "original" | "large" | "medium" | "small"
): Promise<void> {
  try {
    await bucket.file(path).save(bytes, {
      contentType: "image/jpeg",
      resumable: false,
      metadata: {
        cacheControl: "private, max-age=0, no-transform",
        metadata: {
          access: "canonical",
          assetType: "book-cover",
          source: "user_upload",
          pipeline: "cover_jobs_v1",
          size,
          bookId,
        },
      },
    });
  } catch {
    fail("STORAGE_WRITE_FAILED", `Failed writing cover asset: ${path}`);
  }
}

async function renderOriginalCover(source: Buffer, fileType: UploadFileType): Promise<Buffer> {
  if (fileType === "pdf") {
    return extractPdfCover(source);
  }

  if (fileType === "epub") {
    return extractEpubCover(source);
  }

  fail("UNSUPPORTED_FILE_TYPE", "File type is not supported for cover extraction.", false);
}

async function materializeCovers(bookId: string, originalBuffer: Buffer): Promise<void> {
  const original = coverPath(bookId, "original");
  await writeCoverFile(original, originalBuffer, bookId, "original");

  for (const [size, cfg] of Object.entries(DERIVED_SIZES) as Array<
    [keyof typeof DERIVED_SIZES, (typeof DERIVED_SIZES)[keyof typeof DERIVED_SIZES]]
  >) {
    const derived = await sharp(originalBuffer)
      .resize({ width: cfg.width, withoutEnlargement: true })
      .jpeg({ quality: cfg.quality, mozjpeg: true })
      .toBuffer();

    await writeCoverFile(coverPath(bookId, size), derived, bookId, size);
  }
}

async function processCoverJob(bookId: string): Promise<void> {
  const jobRef = db.collection("cover_jobs").doc(bookId);
  const bookRef = db.collection("books").doc(bookId);

  const lock = await db.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef);
    if (!snap.exists) return null;

    const data = (snap.data() || {}) as Record<string, unknown>;
    const currentStatus = asNonEmptyString(data.status);
    if (currentStatus !== "PENDING") return null;

    const currentAttempts = Math.max(0, toInt(data.attempts, 0));
    const maxAttempts = Math.min(Math.max(toInt(data.maxAttempts, 3), 1), 5);
    const nextAttempts = currentAttempts + 1;

    tx.set(
      jobRef,
      {
        status: "PROCESSING" as JobStatus,
        attempts: nextAttempts,
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
      { merge: true }
    );

    return {
      data,
      attempts: nextAttempts,
      maxAttempts,
    };
  });

  if (!lock) return;

  const { data: jobData, maxAttempts } = lock;
  const ownerUid = asNonEmptyString(jobData.ownerUid);
  const fileType = toUploadFileType(jobData.fileType);
  const storagePath = asNonEmptyString(jobData.storagePath);
  let attempt = lock.attempts;
  let staticValidationError: CoverJobErrorShape | null = null;

  const source = asNonEmptyString(jobData.source);
  if (source !== "user_upload") {
    staticValidationError = {
      code: "INVALID_BOOK_SOURCE",
      message: "Cover job source must be user_upload.",
      retryable: false,
    };
  } else if (!fileType) {
    staticValidationError = {
      code: "UNSUPPORTED_FILE_TYPE",
      message: "Missing or invalid user-upload file type.",
      retryable: false,
    };
  } else if (!storagePath) {
    staticValidationError = {
      code: "MISSING_STORAGE_PATH",
      message: "Missing upload storagePath on cover job.",
      retryable: false,
    };
  } else {
    try {
      assertSourcePath(bookId, storagePath);
    } catch (error) {
      staticValidationError = toErrorShape(error);
    }
  }

  for (; attempt <= maxAttempts; attempt++) {
    try {
      if (staticValidationError) {
        throw staticValidationError;
      }
      const resolvedStoragePath = storagePath as string;
      const resolvedFileType = fileType as UploadFileType;

      const bookSnap = await bookRef.get();
      if (!bookSnap.exists) {
        fail("BOOK_NOT_FOUND", "Book document does not exist.", false);
      }

      const book = (bookSnap.data() || {}) as Record<string, unknown>;
      if (asNonEmptyString(book.source) !== "user_upload") {
        fail("INVALID_BOOK_SOURCE", "Book source is not user_upload.", false);
      }

      const processingBookPatch: Record<string, unknown> = {
        coverState: "PROCESSING" as CoverState,
        coverFailureReason: null,
        coverUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      assertAllowedCoverBookPatch(
        processingBookPatch,
        "processUserUploadCoverJobs.processing"
      );

      await bookRef.set(processingBookPatch, { merge: true });

      const sourceFile = bucket.file(resolvedStoragePath);
      const [exists] = await sourceFile.exists();
      if (!exists) {
        fail("SOURCE_FILE_NOT_FOUND", "Uploaded source file was not found in storage.");
      }

      const [meta] = await sourceFile.getMetadata();
      const sourceBytes = Number(meta.size || 0);
      if (sourceBytes <= 0) {
        fail("SOURCE_FILE_EMPTY", "Uploaded source file is empty.", false);
      }
      if (sourceBytes > MAX_SOURCE_FILE_BYTES) {
        fail("SOURCE_FILE_TOO_LARGE", "Uploaded source file exceeds processing limit.", false);
      }

      const [sourceBuffer] = await sourceFile.download();
      if (sourceBuffer.length <= 0) {
        fail("SOURCE_FILE_EMPTY", "Downloaded source payload is empty.", false);
      }

      const original = await renderOriginalCover(sourceBuffer, resolvedFileType);
      await materializeCovers(bookId, original);

      const cover = {
        original: coverPath(bookId, "original"),
        large: coverPath(bookId, "large"),
        medium: coverPath(bookId, "medium"),
        small: coverPath(bookId, "small"),
      };

      await db.runTransaction(async (tx) => {
        const readyBookPatch: Record<string, unknown> = {
          cover,
          coverState: "READY" as CoverState,
          coverFailureReason: null,
          coverUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        assertAllowedCoverBookPatch(
          readyBookPatch,
          "processUserUploadCoverJobs.ready"
        );

        tx.set(
          bookRef,
          readyBookPatch,
          { merge: true }
        );

        tx.set(
          jobRef,
          {
            status: "COMPLETED" as JobStatus,
            attempts: attempt,
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            output: cover,
            ownerUid: ownerUid ?? null,
          },
          { merge: true }
        );
      });

      logger.info("[COVER_JOB][SUCCESS]", {
        bookId,
        storagePath: resolvedStoragePath,
        fileType: resolvedFileType,
        attempt,
      });
      return;
    } catch (error) {
      const shaped = toErrorShape(error);
      const shouldRetry = shaped.retryable && attempt < maxAttempts;

      logger.error("[COVER_JOB][ATTEMPT_FAILED]", {
        bookId,
        storagePath,
        fileType,
        attempt,
        maxAttempts,
        code: shaped.code,
        retryable: shaped.retryable,
        message: shaped.message,
      });

      if (shouldRetry) {
        continue;
      }

      const failedState: CoverState = shaped.retryable
        ? "FAILED_RETRYABLE"
        : "FAILED_FATAL";
      const failedStatus: JobStatus = shaped.retryable
        ? "FAILED_RETRYABLE"
        : "FAILED_FATAL";

      await db.runTransaction(async (tx) => {
        const failedBookPatch: Record<string, unknown> = {
          coverState: failedState,
          coverFailureReason: coverFailureReason(shaped),
          coverUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        assertAllowedCoverBookPatch(
          failedBookPatch,
          "processUserUploadCoverJobs.failed"
        );

        tx.set(
          bookRef,
          failedBookPatch,
          { merge: true }
        );

        tx.set(
          jobRef,
          {
            status: failedStatus,
            attempts: attempt,
            updatedAt: FieldValue.serverTimestamp(),
            completedAt: FieldValue.serverTimestamp(),
            lastErrorCode: shaped.code,
            lastErrorMessage: shaped.message,
          },
          { merge: true }
        );
      });

      return;
    }
  }
}

export const processUserUploadCoverJobs = onDocumentWritten(
  {
    document: "cover_jobs/{bookId}",
    timeoutSeconds: 540,
    memory: "2GiB",
  },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;

    const afterData = asRecord(after.data()) ?? {};
    const afterStatus = asNonEmptyString(afterData.status);
    if (afterStatus !== "PENDING") return;

    const beforeData = before?.exists ? asRecord(before.data()) : null;
    const beforeStatus = asNonEmptyString(beforeData?.status);
    if (beforeStatus === "PENDING") return;

    const bookId = event.params.bookId;
    await processCoverJob(bookId);
  }
);
