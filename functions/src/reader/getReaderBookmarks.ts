import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import {
  evaluateContinuityCompatibility,
  type ReaderSourceProvenance,
  provenanceFromManifest,
  provenanceFromStoredRecord,
} from "./readerContinuityCompatibility";

const db = admin.firestore();
const MAX_BOOKMARKS = 200;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : null;
}

function sanitizeCanonicalAnchor(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const kind = asNonEmptyString(record.kind);
  const manifestVersion = asPositiveInt(record.manifestVersion);

  if (!kind || manifestVersion === null) {
    return null;
  }

  switch (kind) {
  case "epub_point": {
    const locationId = asNonEmptyString(record.locationId);
    const spineItemId = asNonEmptyString(record.spineItemId);
    const cfi = asNonEmptyString(record.cfi);
    if (!locationId || !spineItemId || !cfi) return null;
    return { kind, manifestVersion, locationId, spineItemId, cfi };
  }
  case "epub_range": {
    const startLocationId = asNonEmptyString(record.startLocationId);
    const endLocationId = asNonEmptyString(record.endLocationId);
    const spineItemId = asNonEmptyString(record.spineItemId);
    const startCfi = asNonEmptyString(record.startCfi);
    const endCfi = asNonEmptyString(record.endCfi);
    if (!startLocationId || !endLocationId || !spineItemId || !startCfi || !endCfi) {
      return null;
    }
    return {
      kind,
      manifestVersion,
      startLocationId,
      endLocationId,
      spineItemId,
      startCfi,
      endCfi,
    };
  }
  case "pdf_point": {
    const locationId = asNonEmptyString(record.locationId);
    const pageIndex = asNonNegativeInt(record.pageIndex);
    const textOffset = asNonNegativeInt(record.textOffset);
    if (!locationId || pageIndex === null || textOffset === null) return null;
    return { kind, manifestVersion, locationId, pageIndex, textOffset };
  }
  case "pdf_range": {
    const startLocationId = asNonEmptyString(record.startLocationId);
    const endLocationId = asNonEmptyString(record.endLocationId);
    const pageIndex = asNonNegativeInt(record.pageIndex);
    const startOffset = asNonNegativeInt(record.startOffset);
    const endOffset = asNonNegativeInt(record.endOffset);
    const quote = typeof record.quote === "string" ? record.quote : null;
    const prefix = typeof record.prefix === "string" ? record.prefix : null;
    const suffix = typeof record.suffix === "string" ? record.suffix : null;
    if (
      !startLocationId ||
      !endLocationId ||
      pageIndex === null ||
      startOffset === null ||
      endOffset === null ||
      quote === null ||
      prefix === null ||
      suffix === null
    ) {
      return null;
    }
    return {
      kind,
      manifestVersion,
      startLocationId,
      endLocationId,
      pageIndex,
      startOffset,
      endOffset,
      quote,
      prefix,
      suffix,
    };
  }
  default:
    return null;
  }
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }
  return 0;
}

async function loadSourceProvenance(params: {
  uid: string;
  bookId: string;
}): Promise<ReaderSourceProvenance | null> {
  try {
    return provenanceFromManifest(
      await (await import("./readerManifestService")).getOrBuildReaderManifest(params)
    );
  } catch (error) {
    if (process.env.NODE_ENV === "test") {
      logger.warn("[READER][BOOKMARK_COMPATIBILITY_SKIPPED_IN_TEST]", {
        uid: params.uid,
        bookId: params.bookId,
        error: String(error),
      });
      return null;
    }
    throw error;
  }
}

export const getReaderBookmarksHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const uid = request.auth.uid;
  const { bookId } = request.data || {};
  if (!bookId || typeof bookId !== "string") {
    throw new HttpsError("invalid-argument", "bookId is required.");
  }

  const prefix = `${uid}_${bookId}_`;
  logger.info("[READER][GET_BOOKMARKS]", {
    uid,
    bookId,
  });

  const sourceProvenance = await loadSourceProvenance({ uid, bookId });

  const snap = await db
    .collection("reader_bookmarks")
    .where(FieldPath.documentId(), ">=", prefix)
    .where(FieldPath.documentId(), "<", `${prefix}\uf8ff`)
    .limit(MAX_BOOKMARKS)
    .get();

  let staleAnchorRejectedCount = 0;
  const compatibilityCounts: Record<string, number> = {};

  const bookmarks = snap.docs
    .map((doc) => {
      const data = doc.data();
      const anchor = sanitizeCanonicalAnchor(data.anchor);
      const compatibility = sourceProvenance
        ? evaluateContinuityCompatibility({
          current: sourceProvenance,
          stored: provenanceFromStoredRecord(data, anchor),
        })
        : null;
      if (compatibility) {
        compatibilityCounts[compatibility.status] =
          (compatibilityCounts[compatibility.status] || 0) + 1;
      }
      if (anchor && compatibility && !compatibility.compatible) {
        staleAnchorRejectedCount += 1;
        return null;
      }
      return {
        bookmarkId:
          typeof data.bookmarkId === "string" && data.bookmarkId.trim().length > 0
            ? data.bookmarkId.trim()
            : doc.id.slice(prefix.length),
        bookId:
          typeof data.bookId === "string" && data.bookId.trim().length > 0
            ? data.bookId.trim()
            : bookId,
        label: typeof data.label === "string" ? data.label : "",
        page:
          typeof data.page === "number" && Number.isFinite(data.page)
            ? Math.max(1, Math.trunc(data.page))
            : null,
        cfi: typeof data.cfi === "string" && data.cfi.trim().length > 0 ? data.cfi : null,
        anchor,
        anchorManifestVersion:
          anchor?.manifestVersion ??
          asPositiveInt(data.anchorManifestVersion) ??
          null,
        ...(compatibility && sourceProvenance
          ? {
              compatibility: {
                status: compatibility.status,
                reasons: compatibility.reasons,
                manifestVersion: sourceProvenance.manifestVersion,
                sourceSignatureHash: sourceProvenance.sourceSignatureHash,
                attachmentId: sourceProvenance.attachmentId,
                sourceType: sourceProvenance.sourceType,
              },
            }
          : {}),
        updatedAt: toMillis(data.updatedAt) || null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) => {
      const rightUpdated = right.updatedAt || 0;
      const leftUpdated = left.updatedAt || 0;
      if (rightUpdated !== leftUpdated) return rightUpdated - leftUpdated;
      const rightPage = right.page || 0;
      const leftPage = left.page || 0;
      return rightPage - leftPage;
    });

  return {
    bookmarks,
    ...(sourceProvenance
      ? {
          compatibility: {
            staleAnchorRejectedCount,
            bookmarkCompatibilityRate:
              snap.docs.length > 0 ? bookmarks.length / snap.docs.length : 1,
            counts: compatibilityCounts,
            manifestVersion: sourceProvenance.manifestVersion,
            sourceSignatureHash: sourceProvenance.sourceSignatureHash,
            attachmentId: sourceProvenance.attachmentId,
            sourceType: sourceProvenance.sourceType,
          },
        }
      : {}),
  };
};

export const getReaderBookmarks = onCall({ cors: true }, getReaderBookmarksHandler);
