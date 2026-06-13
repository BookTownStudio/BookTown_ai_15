import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

export type ManifestationFormat = "epub" | "pdf" | "unknown";
export type ManifestationAccessMode = "in_app" | "external_link";
export type ManifestationSource =
  | "ebook_attachment"
  | "acquisition"
  | "external_readable_source"
  | "legacy_upload";
export type ManifestationStatus = "active" | "inactive";

export interface ManifestationRecord {
  id: string;
  manifestationId: string;
  workId: string;
  bookId: string;
  editionId: string;
  status: ManifestationStatus;
  source: ManifestationSource;
  accessMode: ManifestationAccessMode;
  format: ManifestationFormat;
  mimeType?: string;
  attachmentId?: string;
  storagePath?: string;
  visibility?: "public" | "restricted" | "private";
  provider?: string;
  providerExternalId?: string;
  externalUrl?: string;
  checksum?: string;
  readability: {
    canReadInApp: boolean;
    canRender: boolean;
    canDownload: boolean;
    acquisitionEligible: boolean;
  };
  createdAt?: unknown;
  updatedAt: unknown;
}

export interface ResolvedReadableManifestation {
  bookId: string;
  editionId: string;
  manifestationId: string;
  source: ManifestationSource;
  accessMode: ManifestationAccessMode;
  format: ManifestationFormat;
  storagePath: string;
  attachmentId: string | null;
  visibility: "public" | "restricted" | "private";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function inferManifestationFormat(params: {
  storagePath?: string | null;
  mimeType?: string | null;
  format?: string | null;
}): ManifestationFormat {
  const explicit = asNonEmptyString(params.format).toLowerCase();
  if (explicit === "epub" || explicit === "pdf") return explicit;

  const mimeType = asNonEmptyString(params.mimeType).toLowerCase();
  if (mimeType.includes("application/epub+zip")) return "epub";
  if (mimeType.includes("application/pdf")) return "pdf";

  const storagePath = asNonEmptyString(params.storagePath).toLowerCase();
  if (storagePath.endsWith(".epub")) return "epub";
  if (storagePath.endsWith(".pdf")) return "pdf";

  return "unknown";
}

export function resolvePrimaryEditionIdFromWork(book: Record<string, unknown>): string {
  return asNonEmptyString(book.primaryEditionId);
}

function assertEditionBelongsToWork(params: {
  bookId: string;
  editionId: string;
  edition: Record<string, unknown>;
}): void {
  const linkedWorkId =
    asNonEmptyString(params.edition.workId) ||
    asNonEmptyString(params.edition.bookId) ||
    asNonEmptyString(params.edition.canonicalBookId);
  if (linkedWorkId && linkedWorkId !== params.bookId) {
    throw new HttpsError(
      "failed-precondition",
      "Primary Edition does not belong to the requested Work."
    );
  }
}

export function attachmentManifestationId(attachmentId: string): string {
  return `attachment:${attachmentId}`;
}

export function legacyStorageManifestationId(editionId: string, storagePath: string): string {
  return `legacy:${editionId}:${simpleHash(storagePath)}`;
}

export function externalReadableManifestationId(params: {
  editionId: string;
  provider: string;
  providerExternalId: string;
}): string {
  return `external:${params.editionId}:${params.provider}:${simpleHash(params.providerExternalId)}`;
}

function buildAttachmentManifestation(params: {
  manifestationId: string;
  bookId: string;
  editionId: string;
  attachmentId: string;
  storagePath: string;
  mimeType?: string | null;
  format?: string | null;
  visibility?: string | null;
  source: "ebook_attachment" | "acquisition" | "legacy_upload";
  checksum?: string | null;
  now: unknown;
  createdAt?: unknown;
}): ManifestationRecord {
  const format = inferManifestationFormat({
    storagePath: params.storagePath,
    mimeType: params.mimeType,
    format: params.format,
  });
  const visibility =
    params.visibility === "private" || params.visibility === "restricted"
      ? params.visibility
      : "public";

  return {
    id: params.manifestationId,
    manifestationId: params.manifestationId,
    workId: params.bookId,
    bookId: params.bookId,
    editionId: params.editionId,
    status: "active",
    source: params.source,
    accessMode: "in_app",
    format,
    ...(params.mimeType ? { mimeType: params.mimeType } : {}),
    ...(params.attachmentId ? { attachmentId: params.attachmentId } : {}),
    storagePath: params.storagePath,
    visibility,
    ...(params.checksum ? { checksum: params.checksum } : {}),
    readability: {
      canReadInApp: true,
      canRender: true,
      canDownload: true,
      acquisitionEligible: false,
    },
    ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    updatedAt: params.now,
  };
}

function buildManifestationAvailabilityProjection(params: {
  manifestationId: string;
  editionId: string;
  attachmentId?: string | null;
  storagePath?: string | null;
  format: ManifestationFormat;
  source: ManifestationSource;
  accessMode: ManifestationAccessMode;
  visibility?: string | null;
  canReadInApp: boolean;
  canDownload: boolean;
  acquisitionEligible: boolean;
  updatedAt: unknown;
}): Record<string, unknown> {
  return {
    hasReadableManifestation: params.canReadInApp,
    canReadInApp: params.canReadInApp,
    canDownload: params.canDownload,
    acquisitionEligible: params.acquisitionEligible,
    manifestationId: params.manifestationId,
    editionId: params.editionId,
    format: params.format,
    source: params.source,
    accessMode: params.accessMode,
    ...(params.attachmentId ? { attachmentId: params.attachmentId } : {}),
    ...(params.visibility ? { visibility: params.visibility } : {}),
    updatedAt: params.updatedAt,
  };
}

function projectionRefs(params: {
  bookId: string;
  editionId: string;
  projection: Record<string, unknown>;
  updatedAt: unknown;
}): {
  bookRef: FirebaseFirestore.DocumentReference;
  editionRef: FirebaseFirestore.DocumentReference;
  bookPatch: Record<string, unknown>;
  editionPatch: Record<string, unknown>;
} {
  const readable = params.projection.hasReadableManifestation === true;
  return {
    bookRef: db.collection("books").doc(params.bookId),
    editionRef: db.collection("editions").doc(params.editionId),
    bookPatch: {
      manifestationAvailability: params.projection,
      readerAuthority: {
        hasReadableAttachment: readable,
        attachmentId:
          typeof params.projection.attachmentId === "string"
            ? params.projection.attachmentId
            : null,
        manifestationId: params.projection.manifestationId,
        source: params.projection.source,
        updatedAt: params.updatedAt,
      },
      hasEbook: readable,
      downloadable: readable,
      isEbookAvailable: readable,
      updatedAt: params.updatedAt,
    },
    editionPatch: {
      manifestationAvailability: params.projection,
      hasEbook: readable,
      downloadable: readable,
      isEbookAvailable: readable,
      updatedAt: params.updatedAt,
    },
  };
}

function attachmentProjection(params: {
  manifestationId: string;
  editionId: string;
  attachmentId: string;
  storagePath: string;
  mimeType?: string | null;
  format?: string | null;
  visibility?: string | null;
  source: "ebook_attachment" | "acquisition";
  updatedAt: unknown;
}): Record<string, unknown> {
  const format = inferManifestationFormat({
    storagePath: params.storagePath,
    mimeType: params.mimeType,
    format: params.format,
  });
  const visibility =
    params.visibility === "private" || params.visibility === "restricted"
      ? params.visibility
      : "public";
  return buildManifestationAvailabilityProjection({
    manifestationId: params.manifestationId,
    editionId: params.editionId,
    attachmentId: params.attachmentId,
    storagePath: params.storagePath,
    format,
    source: params.source,
    accessMode: "in_app",
    visibility,
    canReadInApp: true,
    canDownload: true,
    acquisitionEligible: false,
    updatedAt: params.updatedAt,
  });
}

export function setAttachmentManifestationInTransaction(
  tx: Transaction,
  params: {
    bookId: string;
    editionId: string;
    attachmentId: string;
    storagePath: string;
    mimeType?: string | null;
    format?: string | null;
    visibility?: string | null;
    source: "ebook_attachment" | "acquisition";
    checksum?: string | null;
    now: unknown;
  }
): string {
  const manifestationId = attachmentManifestationId(params.attachmentId);
  const projection = attachmentProjection({
    ...params,
    manifestationId,
    updatedAt: params.now,
  });
  tx.set(
    db.collection("manifestations").doc(manifestationId),
    buildAttachmentManifestation({
      ...params,
      manifestationId,
      createdAt: params.now,
    }),
    { merge: true }
  );
  const refs = projectionRefs({
    bookId: params.bookId,
    editionId: params.editionId,
    projection,
    updatedAt: params.now,
  });
  tx.set(refs.bookRef, refs.bookPatch, { merge: true });
  tx.set(refs.editionRef, refs.editionPatch, { merge: true });
  return manifestationId;
}

export function setExternalFileManifestationInTransaction(
  tx: Transaction,
  params: {
    bookId: string;
    editionId: string;
    sourceId: string;
    externalUrl: string;
    format?: string | null;
    now: unknown;
  }
): string {
  const manifestationId = `external_file:${params.editionId}:${simpleHash(params.sourceId)}`;
  const format = inferManifestationFormat({
    storagePath: params.externalUrl,
    format: params.format,
  });
  tx.set(
    db.collection("manifestations").doc(manifestationId),
    {
      id: manifestationId,
      manifestationId,
      workId: params.bookId,
      bookId: params.bookId,
      editionId: params.editionId,
      status: "active",
      source: "external_readable_source",
      accessMode: "external_link",
      format,
      externalUrl: params.externalUrl,
      readability: {
        canReadInApp: false,
        canRender: false,
        canDownload: true,
        acquisitionEligible: false,
      },
      createdAt: params.now,
      updatedAt: params.now,
    } satisfies ManifestationRecord,
    { merge: true }
  );
  const projection = buildManifestationAvailabilityProjection({
    manifestationId,
    editionId: params.editionId,
    storagePath: params.externalUrl,
    format,
    source: "external_readable_source",
    accessMode: "external_link",
    visibility: "public",
    canReadInApp: false,
    canDownload: true,
    acquisitionEligible: false,
    updatedAt: params.now,
  });
  const refs = projectionRefs({
    bookId: params.bookId,
    editionId: params.editionId,
    projection,
    updatedAt: params.now,
  });
  tx.set(refs.bookRef, refs.bookPatch, { merge: true });
  tx.set(refs.editionRef, refs.editionPatch, { merge: true });
  return manifestationId;
}

export async function upsertAttachmentManifestation(params: {
  bookId: string;
  editionId: string;
  attachmentId: string;
  storagePath: string;
  mimeType?: string | null;
  format?: string | null;
  visibility?: string | null;
  source: "ebook_attachment" | "acquisition";
  checksum?: string | null;
}): Promise<string> {
  const now = FieldValue.serverTimestamp();
  const manifestationId = attachmentManifestationId(params.attachmentId);
  await db.collection("manifestations").doc(manifestationId).set(
    buildAttachmentManifestation({
      ...params,
      manifestationId,
      now,
      createdAt: now,
    }),
    { merge: true }
  );
  const projection = attachmentProjection({
    ...params,
    manifestationId,
    updatedAt: now,
  });
  const refs = projectionRefs({
    bookId: params.bookId,
    editionId: params.editionId,
    projection,
    updatedAt: now,
  });
  await Promise.all([
    refs.bookRef.set(refs.bookPatch, { merge: true }),
    refs.editionRef.set(refs.editionPatch, { merge: true }),
  ]);
  return manifestationId;
}

export async function upsertExternalReadableManifestation(params: {
  bookId: string;
  editionId: string;
  provider: string;
  providerExternalId: string;
  externalUrl?: string | null;
}): Promise<string> {
  const now = FieldValue.serverTimestamp();
  const manifestationId = externalReadableManifestationId(params);
  await db.collection("manifestations").doc(manifestationId).set(
    {
      id: manifestationId,
      manifestationId,
      workId: params.bookId,
      bookId: params.bookId,
      editionId: params.editionId,
      status: "active",
      source: "external_readable_source",
      accessMode: "external_link",
      format: "unknown",
      provider: params.provider,
      providerExternalId: params.providerExternalId,
      ...(params.externalUrl ? { externalUrl: params.externalUrl } : {}),
      readability: {
        canReadInApp: false,
        canRender: false,
        canDownload: false,
        acquisitionEligible: true,
      },
      createdAt: now,
      updatedAt: now,
    } satisfies ManifestationRecord,
    { merge: true }
  );
  const projection = buildManifestationAvailabilityProjection({
    manifestationId,
    editionId: params.editionId,
    format: "unknown",
    source: "external_readable_source",
    accessMode: "external_link",
    visibility: "public",
    canReadInApp: false,
    canDownload: false,
    acquisitionEligible: true,
    updatedAt: now,
  });
  const refs = projectionRefs({
    bookId: params.bookId,
    editionId: params.editionId,
    projection,
    updatedAt: now,
  });
  await Promise.all([
    refs.bookRef.set(refs.bookPatch, { merge: true }),
    refs.editionRef.set(refs.editionPatch, { merge: true }),
  ]);
  return manifestationId;
}

export async function upsertLegacyUploadManifestation(params: {
  bookId: string;
  editionId: string;
  storagePath: string;
  format?: string | null;
  visibility?: string | null;
}): Promise<string> {
  const now = FieldValue.serverTimestamp();
  const manifestationId = legacyStorageManifestationId(params.editionId, params.storagePath);
  const visibility =
    params.visibility === "public" || params.visibility === "restricted"
      ? params.visibility
      : "private";
  await db.collection("manifestations").doc(manifestationId).set(
    buildAttachmentManifestation({
      manifestationId,
      bookId: params.bookId,
      editionId: params.editionId,
      attachmentId: "",
      storagePath: params.storagePath,
      format: params.format || inferManifestationFormat({ storagePath: params.storagePath }),
      visibility,
      source: "legacy_upload",
      now,
      createdAt: now,
    }),
    { merge: true }
  );
  const projection = buildManifestationAvailabilityProjection({
    manifestationId,
    editionId: params.editionId,
    storagePath: params.storagePath,
    format: inferManifestationFormat({
      storagePath: params.storagePath,
      format: params.format,
    }),
    source: "legacy_upload",
    accessMode: "in_app",
    visibility,
    canReadInApp: true,
    canDownload: true,
    acquisitionEligible: false,
    updatedAt: now,
  });
  const refs = projectionRefs({
    bookId: params.bookId,
    editionId: params.editionId,
    projection,
    updatedAt: now,
  });
  await Promise.all([
    refs.bookRef.set(refs.bookPatch, { merge: true }),
    refs.editionRef.set(refs.editionPatch, { merge: true }),
  ]);
  return manifestationId;
}

async function loadPrimaryEdition(params: {
  bookId: string;
  book: Record<string, unknown>;
}): Promise<{ editionId: string; edition: Record<string, unknown> }> {
  const editionId = resolvePrimaryEditionIdFromWork(params.book);
  if (!editionId) {
    throw new HttpsError(
      "failed-precondition",
      "Work has no primary Edition authority."
    );
  }

  const editionSnap = await db.collection("editions").doc(editionId).get();
  if (!editionSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Primary Edition authority points to a missing Edition."
    );
  }
  const edition = (editionSnap.data() || {}) as Record<string, unknown>;
  assertEditionBelongsToWork({ bookId: params.bookId, editionId, edition });
  return { editionId, edition };
}

async function findExistingReadableManifestation(
  editionId: string
): Promise<ResolvedReadableManifestation | null> {
  const collection = db.collection("manifestations") as unknown as {
    where?: (field: string, op: "==", value: string) => {
      limit: (count: number) => {
        get: () => Promise<{
          docs: Array<{
            id: string;
            data: () => Record<string, unknown>;
          }>;
        }>;
      };
      get: () => Promise<{
        docs: Array<{
          id: string;
          data: () => Record<string, unknown>;
        }>;
      }>;
    };
  };
  if (typeof collection.where !== "function") return null;

  const query = collection.where("editionId", "==", editionId);
  const snap = typeof query.limit === "function" ? await query.limit(25).get() : await query.get();
  const readable = snap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter(({ data }) => {
      const storagePath = asNonEmptyString(data.storagePath);
      const readability = asRecord(data.readability);
      return (
        data.status === "active" &&
        data.accessMode === "in_app" &&
        Boolean(storagePath) &&
        readability?.canReadInApp === true
      );
    })
    .sort((left, right) => {
      const sourceRank = (source: unknown): number => {
        if (source === "ebook_attachment") return 0;
        if (source === "acquisition") return 1;
        if (source === "legacy_upload") return 2;
        return 3;
      };
      return (
        sourceRank(left.data.source) - sourceRank(right.data.source) ||
        left.id.localeCompare(right.id)
      );
    });

  for (const doc of readable) {
    const data = doc.data;
    const storagePath = asNonEmptyString(data.storagePath);
    return {
      bookId: asNonEmptyString(data.bookId) || asNonEmptyString(data.workId),
      editionId,
      manifestationId: doc.id,
      source: (asNonEmptyString(data.source) || "ebook_attachment") as ManifestationSource,
      accessMode: "in_app",
      format: inferManifestationFormat({
        storagePath,
        mimeType: asNonEmptyString(data.mimeType),
        format: asNonEmptyString(data.format),
      }),
      storagePath,
      attachmentId: asNonEmptyString(data.attachmentId) || null,
      visibility:
        data.visibility === "private" || data.visibility === "restricted"
          ? data.visibility
          : "public",
    };
  }
  return null;
}

export async function resolveReadableManifestationForWork(params: {
  bookId: string;
  book?: Record<string, unknown>;
}): Promise<ResolvedReadableManifestation> {
  const book =
    params.book ||
    ((await db.collection("books").doc(params.bookId).get()).data() as Record<string, unknown> | undefined);
  if (!book) {
    throw new HttpsError("not-found", "Book not found.");
  }

  const { editionId } = await loadPrimaryEdition({
    bookId: params.bookId,
    book,
  });

  const existing = await findExistingReadableManifestation(editionId);
  if (existing) return existing;

  throw new HttpsError("not-found", "No readable Manifestation found for this Work.");
}
