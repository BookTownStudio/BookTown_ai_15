import { HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { canUserReadBook } from "../rights/bookRights";
import { resolveReadableManifestationForWork } from "../manifestations/manifestationAuthority";
import {
  CANONICAL_EPUB_LOCATION_GENERATION_CHARS,
  CANONICAL_EPUB_PIPELINE_VERSION,
  preprocessCanonicalEpub,
  type CanonicalEpubPreprocessResult,
} from "./canonicalEpubProducer";

const db = admin.firestore();
const storage = admin.storage();

export type ReaderManifestFormat = "pdf" | "epub" | "unknown";
type ReaderManifestSourceType = "manifestation" | "legacy_upload";

const READER_MANIFEST_PIPELINE_VERSION = "reader_manifest_v2";
const EPUB_LOCATION_GENERATION_CHARS = CANONICAL_EPUB_LOCATION_GENERATION_CHARS;
const CANONICAL_EPUB_RETRY_AFTER_MS = 6 * 60 * 60 * 1000;

interface ReaderManifestLocationMap {
  version: "v1";
  mode: "page" | "logical";
  checkpointUnit: "page" | "spine_item";
  status?: "pending" | "ready";
  docPath?: string;
  anchorSchema?: "canonical_anchor_v1";
  source?: "server_precomputed" | "runtime_generated";
  identity?: {
    bookId: string;
    manifestVersion: number;
    pipelineVersion: string;
    sourceSignatureHash: string;
    generationChars: number;
  };
  generationChars?: number;
  locationCount?: number;
  payload?: string | unknown[];
}

interface ReaderManifestIndexState {
  status: "pending" | "ready";
  docPath: string;
  schemaVersion?: "v1";
}

export interface ReaderManifestInternal {
  bookId: string;
  editionId: string;
  manifestationId: string;
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
  chapterMap: ReaderManifestIndexState;
  sectionMap: ReaderManifestIndexState;
  stableAnchors: ReaderManifestIndexState;
  spineMap: ReaderManifestIndexState;
  sectionGraph: ReaderManifestIndexState;
  stableAnchorMap: ReaderManifestIndexState;
  navigationIndex: ReaderManifestIndexState;
  paginationHints: ReaderManifestIndexState;
  literaryCoordinateMap: ReaderManifestIndexState;
  passageIndex: ReaderManifestIndexState;
  annotationIdentityIndex: ReaderManifestIndexState;
  literaryMemoryPrimitives: ReaderManifestIndexState;
  generatedAtMs: number;
}

export interface ReaderManifestPublic {
  bookId: string;
  editionId: string;
  manifestationId: string;
  version: number;
  pipelineVersion: string;
  format: ReaderManifestFormat;
  estimatedPageCount: number | null;
  locationMap: ReaderManifestLocationMap;
  searchIndex: ReaderManifestIndexState;
  highlightAnchors: ReaderManifestIndexState;
  chapterMap: ReaderManifestIndexState;
  sectionMap: ReaderManifestIndexState;
  stableAnchors: ReaderManifestIndexState;
  spineMap: ReaderManifestIndexState;
  sectionGraph: ReaderManifestIndexState;
  stableAnchorMap: ReaderManifestIndexState;
  navigationIndex: ReaderManifestIndexState;
  paginationHints: ReaderManifestIndexState;
  literaryCoordinateMap: ReaderManifestIndexState;
  passageIndex: ReaderManifestIndexState;
  annotationIdentityIndex: ReaderManifestIndexState;
  literaryMemoryPrimitives: ReaderManifestIndexState;
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

function stableManifestHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeIndexState(
  raw: Record<string, unknown> | undefined,
  fallbackDocPath: string
): ReaderManifestIndexState {
  return {
    status: raw?.status === "ready" ? "ready" : "pending",
    docPath: asNonEmptyString(raw?.docPath) || fallbackDocPath,
    schemaVersion: raw?.schemaVersion === "v1" ? "v1" : undefined,
  };
}

function docPathToRef(docPath: string) {
  const [collection, docId] = docPath.split("/");
  if (!collection || !docId || docPath.split("/").length !== 2) {
    throw new HttpsError("internal", "Invalid reader manifest index path.");
  }
  return db.collection(collection).doc(docId);
}

async function persistCanonicalEpubIndexes(params: {
  bookId: string;
  editionId: string;
  manifestationId: string;
  version: number;
  sourceSignatureHash: string;
  manifest: Pick<
    ReaderManifestInternal,
    | "spineMap"
    | "sectionGraph"
    | "stableAnchorMap"
    | "navigationIndex"
    | "paginationHints"
    | "literaryCoordinateMap"
    | "passageIndex"
    | "annotationIdentityIndex"
    | "literaryMemoryPrimitives"
  >;
  produced: CanonicalEpubPreprocessResult;
}): Promise<void> {
  const base = {
    bookId: params.bookId,
    editionId: params.editionId,
    manifestationId: params.manifestationId,
    manifestVersion: params.version,
    pipelineVersion: CANONICAL_EPUB_PIPELINE_VERSION,
    sourceSignatureHash: params.sourceSignatureHash,
    generatedAtMs: Date.now(),
  };

  await Promise.all([
    docPathToRef(params.manifest.spineMap.docPath).set({
      ...base,
      ...params.produced.spineMap,
    }),
    docPathToRef(params.manifest.sectionGraph.docPath).set({
      ...base,
      ...params.produced.sectionGraph,
    }),
    docPathToRef(params.manifest.stableAnchorMap.docPath).set({
      ...base,
      ...params.produced.stableAnchorMap,
    }),
    docPathToRef(params.manifest.navigationIndex.docPath).set({
      ...base,
      ...params.produced.navigationIndex,
    }),
    docPathToRef(params.manifest.paginationHints.docPath).set({
      ...base,
      ...params.produced.paginationHints,
    }),
    docPathToRef(params.manifest.literaryCoordinateMap.docPath).set({
      ...base,
      ...params.produced.literaryCoordinateMap,
    }),
    docPathToRef(params.manifest.passageIndex.docPath).set({
      ...base,
      ...params.produced.passageIndex,
    }),
    docPathToRef(params.manifest.annotationIdentityIndex.docPath).set({
      ...base,
      ...params.produced.annotationIdentityIndex,
    }),
    docPathToRef(params.manifest.literaryMemoryPrimitives.docPath).set({
      ...base,
      ...params.produced.literaryMemoryPrimitives,
    }),
  ]);
}

function toPublicManifest(manifest: ReaderManifestInternal): ReaderManifestPublic {
  return {
    bookId: manifest.bookId,
    editionId: manifest.editionId,
    manifestationId: manifest.manifestationId,
    version: manifest.version,
    pipelineVersion: manifest.pipelineVersion,
    format: manifest.format,
    estimatedPageCount: manifest.estimatedPageCount,
    locationMap: manifest.locationMap,
    searchIndex: manifest.searchIndex,
    highlightAnchors: manifest.highlightAnchors,
    chapterMap: manifest.chapterMap,
    sectionMap: manifest.sectionMap,
    stableAnchors: manifest.stableAnchors,
    spineMap: manifest.spineMap,
    sectionGraph: manifest.sectionGraph,
    stableAnchorMap: manifest.stableAnchorMap,
    navigationIndex: manifest.navigationIndex,
    paginationHints: manifest.paginationHints,
    literaryCoordinateMap: manifest.literaryCoordinateMap,
    passageIndex: manifest.passageIndex,
    annotationIdentityIndex: manifest.annotationIdentityIndex,
    literaryMemoryPrimitives: manifest.literaryMemoryPrimitives,
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
  const chapterMapRaw = input.chapterMap as Record<string, unknown> | undefined;
  const sectionMapRaw = input.sectionMap as Record<string, unknown> | undefined;
  const stableAnchorsRaw = input.stableAnchors as Record<string, unknown> | undefined;
  const spineMapRaw = input.spineMap as Record<string, unknown> | undefined;
  const sectionGraphRaw = input.sectionGraph as Record<string, unknown> | undefined;
  const stableAnchorMapRaw = input.stableAnchorMap as Record<string, unknown> | undefined;
  const navigationIndexRaw = input.navigationIndex as Record<string, unknown> | undefined;
  const paginationHintsRaw = input.paginationHints as Record<string, unknown> | undefined;
  const literaryCoordinateMapRaw = input.literaryCoordinateMap as Record<string, unknown> | undefined;
  const passageIndexRaw = input.passageIndex as Record<string, unknown> | undefined;
  const annotationIdentityIndexRaw = input.annotationIdentityIndex as Record<string, unknown> | undefined;
  const literaryMemoryPrimitivesRaw = input.literaryMemoryPrimitives as Record<string, unknown> | undefined;

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
    source:
      locationMapRaw.source === "server_precomputed"
        ? "server_precomputed"
        : "runtime_generated",
    generationChars:
      typeof locationMapRaw.generationChars === "number" &&
      Number.isFinite(locationMapRaw.generationChars) &&
      locationMapRaw.generationChars > 0
        ? Math.trunc(locationMapRaw.generationChars)
        : format === "epub"
          ? EPUB_LOCATION_GENERATION_CHARS
          : undefined,
    locationCount: toPositiveIntOrNull(locationMapRaw.locationCount) ?? undefined,
  };
  const locationIdentityRaw = locationMapRaw.identity as Record<string, unknown> | undefined;
  const sourceSignatureHash = stableManifestHash(sourceSignature);
  if (format === "epub") {
    locationMap.identity = {
      bookId,
      manifestVersion: Math.trunc(versionRaw),
      pipelineVersion,
      sourceSignatureHash:
        asNonEmptyString(locationIdentityRaw?.sourceSignatureHash) || sourceSignatureHash,
      generationChars: locationMap.generationChars || EPUB_LOCATION_GENERATION_CHARS,
    };
  }
  if (
    locationMap.source === "server_precomputed" &&
    locationMap.status === "ready" &&
    (typeof locationMapRaw.payload === "string" || Array.isArray(locationMapRaw.payload))
  ) {
    locationMap.payload = locationMapRaw.payload;
  }

  const searchIndex = sanitizeIndexState(searchIndexRaw, `reader_search_index/${bookId}`);
  const highlightAnchors = sanitizeIndexState(
    highlightAnchorsRaw,
    `reader_highlight_anchors/${bookId}`
  );
  const chapterMap = sanitizeIndexState(chapterMapRaw, `reader_chapter_map/${bookId}`);
  const sectionMap = sanitizeIndexState(sectionMapRaw, `reader_section_map/${bookId}`);
  const stableAnchors = sanitizeIndexState(stableAnchorsRaw, `reader_stable_anchors/${bookId}`);
  const spineMap = sanitizeIndexState(spineMapRaw, `reader_spine_map/${bookId}`);
  const sectionGraph = sanitizeIndexState(sectionGraphRaw, `reader_section_graph/${bookId}`);
  const stableAnchorMap = sanitizeIndexState(
    stableAnchorMapRaw,
    `reader_stable_anchor_map/${bookId}`
  );
  const navigationIndex = sanitizeIndexState(
    navigationIndexRaw,
    `reader_navigation_index/${bookId}`
  );
  const paginationHints = sanitizeIndexState(
    paginationHintsRaw,
    `reader_pagination_hints/${bookId}`
  );
  const literaryCoordinateMap = sanitizeIndexState(
    literaryCoordinateMapRaw,
    `reader_literary_coordinate_map/${bookId}`
  );
  const passageIndex = sanitizeIndexState(passageIndexRaw, `reader_passage_index/${bookId}`);
  const annotationIdentityIndex = sanitizeIndexState(
    annotationIdentityIndexRaw,
    `reader_annotation_identity_index/${bookId}`
  );
  const literaryMemoryPrimitives = sanitizeIndexState(
    literaryMemoryPrimitivesRaw,
    `reader_literary_memory_primitives/${bookId}`
  );

  return {
    bookId,
    editionId: asNonEmptyString(input.editionId) || "",
    manifestationId: asNonEmptyString(input.manifestationId) || "",
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
    chapterMap,
    sectionMap,
    stableAnchors,
    spineMap,
    sectionGraph,
    stableAnchorMap,
    navigationIndex,
    paginationHints,
    literaryCoordinateMap,
    passageIndex,
    annotationIdentityIndex,
    literaryMemoryPrimitives,
    generatedAtMs: Math.trunc(generatedAtMsRaw),
  };
}

async function resolveReadableSource(params: {
  uid: string;
  bookId: string;
  book: Record<string, unknown>;
}): Promise<{
  sourceType: ReaderManifestSourceType;
  editionId: string;
  manifestationId: string;
  storagePath: string;
  attachmentId: string | null;
}> {
  const { uid, bookId, book } = params;

  const manifestation = await resolveReadableManifestationForWork({ bookId, book });
  if (manifestation.storagePath) {
    const legacyOwnerUid = resolveLegacyOwnerUid(book);
    const isAllowedLegacyUploadOwner =
      manifestation.source === "legacy_upload" && legacyOwnerUid === uid;
    if (!canUserReadBook(book, uid) && !isAllowedLegacyUploadOwner) {
      throw new HttpsError("permission-denied", "You do not have access to this ebook.");
    }
    if (
      manifestation.visibility !== "public" &&
      !isAllowedLegacyUploadOwner
    ) {
      throw new HttpsError("permission-denied", "You do not have access to this ebook.");
    }

    return {
      sourceType: manifestation.source === "legacy_upload" ? "legacy_upload" : "manifestation",
      editionId: manifestation.editionId,
      manifestationId: manifestation.manifestationId,
      storagePath: manifestation.storagePath,
      attachmentId: manifestation.attachmentId,
    };
  }

  throw new HttpsError("not-found", "No readable Manifestation found for this Work.");
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
  const sourceSignature = `${source.sourceType}:${source.manifestationId}:${source.storagePath}:${source.attachmentId || "none"}:${format}`;

  const manifestSnap = await manifestRef.get();
  const existing = sanitizeExistingManifest(
    bookId,
    manifestSnap.exists ? ((manifestSnap.data() || {}) as Record<string, unknown>) : null
  );

  if (
    existing &&
    existing.sourceSignature === sourceSignature &&
    existing.pipelineVersion === READER_MANIFEST_PIPELINE_VERSION &&
    (
      existing.format !== "epub" ||
      existing.locationMap.source === "server_precomputed" ||
      Date.now() - existing.generatedAtMs < CANONICAL_EPUB_RETRY_AFTER_MS
    )
  ) {
    return existing;
  }

  const version = existing ? existing.version + 1 : 1;
  const generatedAtMs = Date.now();
  const estimatedPageCount = toPositiveIntOrNull(book.pageCount);
  const sourceSignatureHash = stableManifestHash(sourceSignature);

  const nextManifest: ReaderManifestInternal = {
    bookId,
    editionId: source.editionId,
    manifestationId: source.manifestationId,
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
      source: "runtime_generated",
      generationChars: format === "epub" ? EPUB_LOCATION_GENERATION_CHARS : undefined,
      identity:
        format === "epub"
          ? {
              bookId,
              manifestVersion: version,
              pipelineVersion: READER_MANIFEST_PIPELINE_VERSION,
              sourceSignatureHash,
              generationChars: EPUB_LOCATION_GENERATION_CHARS,
            }
          : undefined,
    },
    searchIndex: {
      status: "pending",
      docPath: `reader_search_index/${bookId}`,
      schemaVersion: "v1",
    },
    highlightAnchors: {
      status: "pending",
      docPath: `reader_highlight_anchors/${bookId}`,
      schemaVersion: "v1",
    },
    chapterMap: {
      status: "pending",
      docPath: `reader_chapter_map/${bookId}`,
      schemaVersion: "v1",
    },
    sectionMap: {
      status: "pending",
      docPath: `reader_section_map/${bookId}`,
      schemaVersion: "v1",
    },
    stableAnchors: {
      status: "pending",
      docPath: `reader_stable_anchors/${bookId}`,
      schemaVersion: "v1",
    },
    spineMap: {
      status: "pending",
      docPath: `reader_spine_map/${bookId}`,
      schemaVersion: "v1",
    },
    sectionGraph: {
      status: "pending",
      docPath: `reader_section_graph/${bookId}`,
      schemaVersion: "v1",
    },
    stableAnchorMap: {
      status: "pending",
      docPath: `reader_stable_anchor_map/${bookId}`,
      schemaVersion: "v1",
    },
    navigationIndex: {
      status: "pending",
      docPath: `reader_navigation_index/${bookId}`,
      schemaVersion: "v1",
    },
    paginationHints: {
      status: "pending",
      docPath: `reader_pagination_hints/${bookId}`,
      schemaVersion: "v1",
    },
    literaryCoordinateMap: {
      status: "pending",
      docPath: `reader_literary_coordinate_map/${bookId}`,
      schemaVersion: "v1",
    },
    passageIndex: {
      status: "pending",
      docPath: `reader_passage_index/${bookId}`,
      schemaVersion: "v1",
    },
    annotationIdentityIndex: {
      status: "pending",
      docPath: `reader_annotation_identity_index/${bookId}`,
      schemaVersion: "v1",
    },
    literaryMemoryPrimitives: {
      status: "pending",
      docPath: `reader_literary_memory_primitives/${bookId}`,
      schemaVersion: "v1",
    },
    generatedAtMs,
  };

  if (format === "epub" && typeof file.download === "function") {
    try {
      const [buffer] = await file.download();
      const produced = await preprocessCanonicalEpub(Buffer.from(buffer), {
        bookId,
        generationChars: EPUB_LOCATION_GENERATION_CHARS,
      });

      if (produced.ok) {
        nextManifest.locationMap = {
          ...nextManifest.locationMap,
          status: "ready",
          source: "server_precomputed",
          generationChars: EPUB_LOCATION_GENERATION_CHARS,
          locationCount: produced.locationCount,
          payload: produced.locationPayload,
        };
        nextManifest.spineMap.status = "ready";
        nextManifest.sectionGraph.status = "ready";
        nextManifest.stableAnchorMap.status = "ready";
        nextManifest.navigationIndex.status = "ready";
        nextManifest.paginationHints.status = "ready";
        nextManifest.literaryCoordinateMap.status = "ready";
        nextManifest.passageIndex.status = "ready";
        nextManifest.annotationIdentityIndex.status = "ready";
        nextManifest.literaryMemoryPrimitives.status = "ready";

        await persistCanonicalEpubIndexes({
          bookId,
          editionId: source.editionId,
          manifestationId: source.manifestationId,
          version,
          sourceSignatureHash,
          manifest: nextManifest,
          produced,
        });

        logger.info("[READER][CANONICAL_EPUB_PREPROCESS_READY]", {
          bookId,
          version,
          locationCount: produced.locationCount,
          spineItemCount: produced.spineMap.itemCount,
          warningCount: produced.warnings.length,
          cfiFidelity: produced.cfiFidelity,
          coordinateCount: produced.literaryCoordinateMap.coordinateCount,
          passageCount: produced.passageIndex.passageCount,
        });
      } else {
        logger.warn("[READER][CANONICAL_EPUB_PREPROCESS_SKIPPED]", {
          bookId,
          version,
          reason: produced.reason,
          classification: produced.classification,
          warningCount: produced.warnings.length,
        });
      }
    } catch (error) {
      logger.warn("[READER][CANONICAL_EPUB_PREPROCESS_FAILED]", {
        bookId,
        version,
        error: String(error),
      });
    }
  }

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
