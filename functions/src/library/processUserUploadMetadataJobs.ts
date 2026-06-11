import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import JSZip from "jszip";

import { admin } from "../firebaseAdmin";
import { normalizeIsbn } from "./normalization/bookSearchNormalization";

const db = admin.firestore();
const bucket = admin.storage().bucket();

type UploadMetadataStatus = "pending" | "processing" | "ready" | "failed";
type UploadMetadataSource = "epub_opf";
type UploadMetadataJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_FIELD_LENGTH = 500;
const MAX_FAILURE_REASON_LENGTH = 240;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeText(value: string | null, maxLength = MAX_TEXT_FIELD_LENGTH): string | null {
  if (!value) return null;
  const normalized = decodeXmlEntities(value)
    .replace(/<[^>]*>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeLanguage(value: string | null): string | null {
  const normalized = normalizeText(value, 32);
  return normalized ? normalized.toLowerCase() : null;
}

function normalizeDate(value: string | null): string | null {
  const normalized = normalizeText(value, 64);
  if (!normalized) return null;
  const match = normalized.match(/^\d{4}(?:-\d{2}(?:-\d{2})?)?/u);
  return match ? match[0] : normalized.slice(0, 64);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&apos;/gu, "'");
}

function firstTagText(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<[^>]*(?:${tagName}|dc:${tagName})\\b[^>]*>([\\s\\S]*?)<\\/[^>]*(?:${tagName}|dc:${tagName})>`, "iu");
  return normalizeText(pattern.exec(xml)?.[1] ?? null);
}

function tagTexts(xml: string, tagName: string): string[] {
  const pattern = new RegExp(`<[^>]*(?:${tagName}|dc:${tagName})\\b[^>]*>([\\s\\S]*?)<\\/[^>]*(?:${tagName}|dc:${tagName})>`, "giu");
  const values: string[] = [];
  for (const match of xml.matchAll(pattern)) {
    const normalized = normalizeText(match[1] ?? null);
    if (normalized) values.push(normalized);
  }
  return values;
}

function normalizeIdentifierToIsbn(value: string): string | null {
  const withoutUrnPrefix = value.replace(/^urn:isbn:/iu, "");
  return normalizeIsbn(withoutUrnPrefix, 13) || normalizeIsbn(withoutUrnPrefix, 10) || null;
}

function extractIsbnFromIdentifiers(identifiers: readonly string[]): string | null {
  for (const identifier of identifiers) {
    const normalized = normalizeIdentifierToIsbn(identifier);
    if (normalized && normalized.length === 13) return normalized;
  }
  for (const identifier of identifiers) {
    const normalized = normalizeIdentifierToIsbn(identifier);
    if (normalized) return normalized;
  }
  return null;
}

async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  return entry.async("text");
}

async function resolvePackagePath(zip: JSZip): Promise<string | null> {
  const container = await readZipText(zip, "META-INF/container.xml");
  if (!container) return null;
  const rootfile = container.match(/<rootfile\b[^>]*>/iu)?.[0] ?? "";
  const fullPath = rootfile.match(/\bfull-path=["']([^"']+)["']/iu)?.[1];
  return fullPath ? decodeXmlEntities(fullPath).trim() : null;
}

async function extractEpubOpfMetadata(buffer: Buffer): Promise<Record<string, string | null>> {
  const zip = await JSZip.loadAsync(buffer);
  const packagePath = await resolvePackagePath(zip);
  if (!packagePath) {
    throw new Error("EPUB_PACKAGE_DOCUMENT_MISSING");
  }

  const opf = await readZipText(zip, packagePath);
  if (!opf) {
    throw new Error("EPUB_OPF_MISSING");
  }

  const identifiers = tagTexts(opf, "identifier");
  return {
    title: firstTagText(opf, "title"),
    author: firstTagText(opf, "creator"),
    language: normalizeLanguage(firstTagText(opf, "language")),
    isbn: extractIsbnFromIdentifiers(identifiers),
    publisher: firstTagText(opf, "publisher"),
    publicationDate: normalizeDate(firstTagText(opf, "date")),
  };
}

function uploadMetadataPatch(
  status: UploadMetadataStatus,
  values: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    uploadMetadata: {
      status,
      source: "epub_opf" satisfies UploadMetadataSource,
      lastProcessedAt: status === "pending" ? null : FieldValue.serverTimestamp(),
      failureReason: null,
      ...values,
    },
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function failureReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.slice(0, MAX_FAILURE_REASON_LENGTH);
}

export const processUserUploadMetadataJobs = onDocumentWritten(
  {
    document: "upload_metadata_jobs/{bookId}",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const bookId = String(event.params.bookId || "").trim();
    if (!bookId) return;

    const jobRef = after.ref;
    const bookRef = db.collection("books").doc(bookId);
    const lock = await db.runTransaction(async (tx) => {
      const jobSnap = await tx.get(jobRef);
      const data = (jobSnap.data() || {}) as Record<string, unknown>;
      const status = asNonEmptyString(data.status);
      if (status !== "PENDING") return null;

      tx.set(
        jobRef,
        {
          status: "PROCESSING" satisfies UploadMetadataJobStatus,
          startedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          failureReason: null,
        },
        { merge: true }
      );
      tx.set(bookRef, uploadMetadataPatch("processing"), { merge: true });
      return data;
    });

    if (!lock) return;

    try {
      const bookSnap = await bookRef.get();
      if (!bookSnap.exists) throw new Error("BOOK_NOT_FOUND");
      const book = (bookSnap.data() || {}) as Record<string, unknown>;
      if (asNonEmptyString(book.source) !== "user_upload") {
        throw new Error("INVALID_BOOK_SOURCE");
      }

      const ownerUid = asNonEmptyString(book.ownerUid);
      const fileType = asNonEmptyString(lock.fileType);
      const storagePath = asNonEmptyString(lock.storagePath);
      if (fileType !== "epub") throw new Error("UNSUPPORTED_FILE_TYPE");
      if (!storagePath) throw new Error("MISSING_STORAGE_PATH");
      if (!storagePath.startsWith(`books/${bookId}/original/`)) {
        throw new Error("INVALID_STORAGE_PATH");
      }

      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) throw new Error("SOURCE_FILE_NOT_FOUND");
      const [meta] = await file.getMetadata();
      const sourceBytes = Number(meta.size || 0);
      if (!Number.isFinite(sourceBytes) || sourceBytes <= 0) {
        throw new Error("SOURCE_FILE_EMPTY");
      }
      if (sourceBytes > MAX_SOURCE_FILE_BYTES) {
        throw new Error("SOURCE_FILE_TOO_LARGE");
      }

      const [buffer] = await file.download();
      if (buffer.length <= 0) throw new Error("SOURCE_FILE_EMPTY");

      const extracted = await extractEpubOpfMetadata(buffer);
      await db.runTransaction(async (tx) => {
        const candidateJobRef = db.collection("upload_canonical_candidate_jobs").doc(bookId);
        tx.set(
          bookRef,
          uploadMetadataPatch("ready", {
            title: extracted.title,
            author: extracted.author,
            language: extracted.language,
            isbn: extracted.isbn,
            publisher: extracted.publisher,
            publicationDate: extracted.publicationDate,
          }),
          { merge: true }
        );
        tx.set(
          candidateJobRef,
          {
            id: bookId,
            bookId,
            ownerUid: ownerUid ?? null,
            source: "user_upload",
            metadataSource: "epub_opf",
            status: "PENDING",
            failureReason: null,
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(
          jobRef,
          {
            status: "COMPLETED" satisfies UploadMetadataJobStatus,
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            ownerUid: ownerUid ?? null,
          },
          { merge: true }
        );
      });

      logger.info("[UPLOAD_METADATA][EPUB_OPF_READY]", {
        bookId,
        ownerUid,
        hasTitle: Boolean(extracted.title),
        hasAuthor: Boolean(extracted.author),
        hasIsbn: Boolean(extracted.isbn),
      });
    } catch (error) {
      const reason = failureReason(error);
      await db.runTransaction(async (tx) => {
        tx.set(
          bookRef,
          uploadMetadataPatch("failed", {
            failureReason: reason,
            title: null,
            author: null,
            language: null,
            isbn: null,
            publisher: null,
            publicationDate: null,
          }),
          { merge: true }
        );
        tx.set(
          jobRef,
          {
            status: "FAILED" satisfies UploadMetadataJobStatus,
            failureReason: reason,
            failedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      logger.warn("[UPLOAD_METADATA][EPUB_OPF_FAILED]", {
        bookId,
        reason,
      });
    }
  }
);
