import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { resolveBookToEbookAttachment } from "../attachments/resolveBookToEbookAttachment";
import { FieldValue } from "firebase-admin/firestore";
import { canUserReadBook } from "../rights/bookRights";

const db = admin.firestore();
const storage = admin.storage();

export type ReaderManifestFormat = "pdf" | "epub" | "unknown";
type ReaderManifestSourceType = "attachment" | "legacy_upload";

const READER_MANIFEST_PIPELINE_VERSION = "reader_manifest_v1";

interface ReaderManifestLocationMap {
  version: "v1";
  mode: "page" | "logical";
  checkpointUnit: "page" | "spine_item";
  status?: "pending" | "ready";
  docPath?: string;
  anchorSchema?: "canonical_anchor_v1";
}

interface ReaderManifestIndexState {
  status: "pending" | "ready";
  docPath: string;
}

export interface ReaderManifestInternal {
  bookId: string;
  version: number;
  pipelineVersion: string;
  sourceType: ReaderManifestSourceType;
  sourceSignature: string;
  storagePath: string;
  attachmentId: string | null;
  format: ReaderManifestFormat;
  estimatedPageCount: number | null;
  locationMap: ReaderManifestLocationMap;
  searchIndex: ReaderManifestIndexState;
  highlightAnchors: ReaderManifestIndexState;
  generatedAtMs: number;
}

export interface ReaderManifestPublic {
  bookId: string;
  version: number;
  pipelineVersion: string;
  format: ReaderManifestFormat;
  estimatedPageCount: number | null;
  locationMap: ReaderManifestLocationMap;
  searchIndex: ReaderManifestIndexState;
  highlightAnchors: ReaderManifestIndexState;
  generatedAtMs: number;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveLegacyOwnerUid(book: Record<string, unknown>): string | null {
  return (
    asNonEmptyString(book.ownerUid) ??
    asNonEmptyString(book.ownerId) ??
    asNonEmptyString(book.createdBy) ??
    asNonEmptyString(book.uploadedByUid)
  );
}

function isCanonicalStoragePath(bookId: string, path: string): boolean {
  return path.startsWith(`books/${bookId}/original/`) || path.startsWith(`ebooks/${bookId}/`);
}

function inferFormatFromPath(storagePath: string): ReaderManifestFormat {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".epub")) return "epub";
  return "unknown";
}

function inferFormatFromContentType(contentType: string | undefined): ReaderManifestFormat {
  const value = (contentType || "").toLowerCase();
  if (value.includes("application/pdf")) return "pdf";
  if (value.includes("application/epub+zip")) return "epub";
  return "unknown";
}

function toPositiveIntOrNull(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const n = Math.trunc(value);
  return n > 0 ? n : null;
}

function toPublicManifest(manifest: ReaderManifestInternal): ReaderManifestPublic {
  return {
    bookId: manifest.bookId,
    version: manifest.version,
    pipelineVersion: manifest.pipelineVersion,
    format: manifest.format,
    estimatedPageCount: manifest.estimatedPageCount,
    locationMap: manifest.locationMap,
    searchIndex: manifest.searchIndex,
    highlightAnchors: manifest.highlightAnchors,
    generatedAtMs: manifest.generatedAtMs,
  };
}

function sanitizeExistingManifest(
  bookId: string,
  input: Record<string, unknown> | null
): ReaderManifestInternal | null {
  if (!input) return null;

  const storagePath = asNonEmptyString(input.storagePath);
  const format = asNonEmptyString(input.format) as ReaderManifestFormat | null;
  const pipelineVersion = asNonEmptyString(input.pipelineVersion);
  const sourceType = asNonEmptyString(input.sourceType) as ReaderManifestSourceType | null;
  const sourceSignature = asNonEmptyString(input.sourceSignature);
  const versionRaw = input.version;
  const generatedAtMsRaw = input.generatedAtMs;

  if (
    !storagePath ||
    !format ||
    !pipelineVersion ||
    !sourceType ||
    !sourceSignature ||
    typeof versionRaw !== "number" ||
    !Number.isFinite(versionRaw) ||
    versionRaw <= 0 ||
    typeof generatedAtMsRaw !== "number" ||
    !Number.isFinite(generatedAtMsRaw)
  ) {
    return null;
  }

  const locationMapRaw = input.locationMap as Record<string, unknown> | undefined;
  const searchIndexRaw = input.searchIndex as Record<string, unknown> | undefined;
  const highlightAnchorsRaw = input.highlightAnchors as Record<string, unknown> | undefined;

  if (!locationMapRaw || !searchIndexRaw || !highlightAnchorsRaw) {
    return null;
  }

  const locationMap: ReaderManifestLocationMap = {
    version: "v1",
    mode: locationMapRaw.mode === "page" ? "page" : "logical",
    checkpointUnit:
      locationMapRaw.checkpointUnit === "page" ? "page" : "spine_item",
    status: locationMapRaw.status === "ready" ? "ready" : "pending",
    docPath: asNonEmptyString(locationMapRaw.docPath) || `reader_location_map/${bookId}`,
    anchorSchema: "canonical_anchor_v1",
  };

  const searchIndex: ReaderManifestIndexState = {
    status: searchIndexRaw.status === "ready" ? "ready" : "pending",
    docPath: asNonEmptyString(searchIndexRaw.docPath) || `reader_search_index/${bookId}`,
  };

  const highlightAnchors: ReaderManifestIndexState = {
    status: highlightAnchorsRaw.status === "ready" ? "ready" : "pending",
    docPath:
      asNonEmptyString(highlightAnchorsRaw.docPath) || `reader_highlight_anchors/${bookId}`,
  };

  return {
    bookId,
    version: Math.trunc(versionRaw),
    pipelineVersion,
    sourceType,
    sourceSignature,
    storagePath,
    attachmentId: asNonEmptyString(input.attachmentId),
    format,
    estimatedPageCount: toPositiveIntOrNull(input.estimatedPageCount),
    locationMap,
    searchIndex,
    highlightAnchors,
    generatedAtMs: Math.trunc(generatedAtMsRaw),
  };
}

async function resolveReadableSource(params: {
  uid: string;
  bookId: string;
  book: Record<string, unknown>;
}): Promise<{
  sourceType: ReaderManifestSourceType;
  storagePath: string;
  attachmentId: string | null;
}> {
  const { uid, bookId, book } = params;

  const attachment = await resolveBookToEbookAttachment(bookId);
  if (attachment?.storagePath) {
    if (
      !canUserReadBook(book, uid) ||
      attachment.visibility === "private" ||
      attachment.visibility === "restricted"
    ) {
      throw new HttpsError("permission-denied", "You do not have access to this ebook.");
    }

    return {
      sourceType: "attachment",
      storagePath: attachment.storagePath,
      attachmentId: attachment.id,
    };
  }

  const legacyStoragePath = asNonEmptyString(book.storagePath);
  const legacyOwnerUid = resolveLegacyOwnerUid(book);
  const source = asNonEmptyString(book.source);
  const likelyUserUpload =
    source === "user_upload" ||
    (legacyStoragePath ? legacyStoragePath.startsWith(`books/${bookId}/original/`) : false);

  if (!legacyStoragePath) {
    throw new HttpsError("not-found", "No readable ebook file found for this book.");
  }

  if (!isCanonicalStoragePath(bookId, legacyStoragePath)) {
    throw new HttpsError(
      "failed-precondition",
      "Book storage path is outside canonical reader scope."
    );
  }

  if (!(legacyOwnerUid === uid || (legacyOwnerUid === null && likelyUserUpload))) {
    throw new HttpsError("permission-denied", "You do not have access to this ebook.");
  }

  return {
    sourceType: "legacy_upload",
    storagePath: legacyStoragePath,
    attachmentId: null,
  };
}

async function inferManifestFormat(storagePath: string): Promise<ReaderManifestFormat> {
  const pathFormat = inferFormatFromPath(storagePath);
  if (pathFormat !== "unknown") return pathFormat;

  const file = storage.bucket().file(storagePath);
  try {
    const [meta] = await file.getMetadata();
    return inferFormatFromContentType(meta.contentType);
  } catch (error) {
    logger.warn("[READER][MANIFEST_FORMAT_METADATA_FAILED]", {
      storagePath,
      error: String(error),
    });
    return "unknown";
  }
}

export async function getOrBuildReaderManifest(params: {
  uid: string;
  bookId: string;
}): Promise<ReaderManifestInternal> {
  const { uid, bookId } = params;

  const bookRef = db.collection("books").doc(bookId);
  const manifestRef = db.collection("reader_manifests").doc(bookId);

  const bookSnap = await bookRef.get();
  if (!bookSnap.exists) {
    throw new HttpsError("not-found", "Book not found.");
  }

  const book = (bookSnap.data() || {}) as Record<string, unknown>;
  const source = await resolveReadableSource({ uid, bookId, book });

  const file = storage.bucket().file(source.storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError("not-found", "Ebook file missing from storage.");
  }

  const format = await inferManifestFormat(source.storagePath);
  const sourceSignature = `${source.sourceType}:${source.storagePath}:${source.attachmentId || "none"}:${format}`;

  const manifestSnap = await manifestRef.get();
  const existing = sanitizeExistingManifest(
    bookId,
    manifestSnap.exists ? ((manifestSnap.data() || {}) as Record<string, unknown>) : null
  );

  if (
    existing &&
    existing.sourceSignature === sourceSignature &&
    existing.pipelineVersion === READER_MANIFEST_PIPELINE_VERSION
  ) {
    return existing;
  }

  const version = existing ? existing.version + 1 : 1;
  const generatedAtMs = Date.now();
  const estimatedPageCount = toPositiveIntOrNull(book.pageCount);

  const nextManifest: ReaderManifestInternal = {
    bookId,
    version,
    pipelineVersion: READER_MANIFEST_PIPELINE_VERSION,
    sourceType: source.sourceType,
    sourceSignature,
    storagePath: source.storagePath,
    attachmentId: source.attachmentId,
    format,
    estimatedPageCount,
    locationMap: {
      version: "v1",
      mode: format === "pdf" ? "page" : "logical",
      checkpointUnit: format === "pdf" ? "page" : "spine_item",
      status: "pending",
      docPath: `reader_location_map/${bookId}`,
      anchorSchema: "canonical_anchor_v1",
    },
    searchIndex: {
      status: "pending",
      docPath: `reader_search_index/${bookId}`,
    },
    highlightAnchors: {
      status: "pending",
      docPath: `reader_highlight_anchors/${bookId}`,
    },
    generatedAtMs,
  };

  await manifestRef.set(
    {
      ...nextManifest,
      createdAt: manifestSnap.exists
        ? (manifestSnap.data() as Record<string, unknown> | undefined)?.createdAt ||
          FieldValue.serverTimestamp()
        : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  logger.info("[READER][MANIFEST_BUILT]", {
    uid,
    bookId,
    version,
    format,
    sourceType: source.sourceType,
  });

  return nextManifest;
}

export function toPublicReaderManifest(manifest: ReaderManifestInternal): ReaderManifestPublic {
  return toPublicManifest(manifest);
}
