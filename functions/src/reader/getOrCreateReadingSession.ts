import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { resolveBookToEbookAttachment } from "../attachments/resolveBookToEbookAttachment";

const db = admin.firestore();
const storage = admin.storage();
const READER_URL_TTL_MS = 10 * 60 * 1000;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isCanonicalStoragePath(bookId: string, path: string): boolean {
  return (
    path.startsWith(`books/${bookId}/original/`) ||
    path.startsWith(`ebooks/${bookId}/`)
  );
}

function resolveLegacyOwnerUid(book: Record<string, unknown>): string | null {
  return (
    asNonEmptyString(book.ownerUid) ??
    asNonEmptyString(book.ownerId) ??
    asNonEmptyString(book.createdBy) ??
    asNonEmptyString(book.uploadedByUid)
  );
}

function resolveResumePage(lastPosition: unknown): number {
  if (typeof lastPosition === "number" && Number.isFinite(lastPosition)) {
    return Math.max(1, Math.trunc(lastPosition));
  }

  if (lastPosition && typeof lastPosition === "object") {
    const page = (lastPosition as { page?: unknown }).page;
    if (typeof page === "number" && Number.isFinite(page)) {
      return Math.max(1, Math.trunc(page));
    }
  }

  return 1;
}

function inferFormatFromPath(storagePath: string): "pdf" | "epub" | "unknown" {
  const lower = storagePath.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".epub")) return "epub";
  return "unknown";
}

function inferFormatFromContentType(
  contentType: string | undefined
): "pdf" | "epub" | "unknown" {
  const value = (contentType || "").toLowerCase();
  if (value.includes("application/pdf")) return "pdf";
  if (value.includes("application/epub+zip")) return "epub";
  return "unknown";
}

/**
 * Canonical Reader Session (V2)
 * Returns a mediated signed URL + deterministic resume page.
 */
export const getOrCreateReadingSession = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const { bookId } = request.data || {};
  const uid = request.auth.uid;

  if (!bookId || typeof bookId !== "string") {
    throw new HttpsError("invalid-argument", "bookId is required");
  }

  const sessionId = `${uid}_${bookId}`;
  const sessionRef = db.collection("reading_sessions").doc(sessionId);
  const progressRef = db.collection("reading_progress").doc(`${uid}_${bookId}`);
  const bookRef = db.collection("books").doc(bookId);

  const [bookSnap, progressSnap] = await Promise.all([bookRef.get(), progressRef.get()]);
  if (!bookSnap.exists) {
    throw new HttpsError("not-found", "Book not found.");
  }

  const book = bookSnap.data() as Record<string, unknown>;

  // Prefer canonical attachment path; fallback to legacy user-upload path.
  let storagePath: string | null = null;
  const attachment = await resolveBookToEbookAttachment(bookId);
  if (attachment?.storagePath) {
    storagePath = attachment.storagePath;
  } else {
    const legacyStoragePath = asNonEmptyString(book.storagePath);
    const legacyOwnerUid = resolveLegacyOwnerUid(book);
    const source = asNonEmptyString(book.source);
    const likelyUserUpload =
      source === "user_upload" ||
      (legacyStoragePath
        ? legacyStoragePath.startsWith(`books/${bookId}/original/`)
        : false);

    if (legacyStoragePath && !isCanonicalStoragePath(bookId, legacyStoragePath)) {
      throw new HttpsError(
        "failed-precondition",
        "Book storage path is outside canonical reader scope."
      );
    }

    if (
      legacyStoragePath &&
      (legacyOwnerUid === uid || (legacyOwnerUid === null && likelyUserUpload))
    ) {
      storagePath = legacyStoragePath;
    }
  }

  if (!storagePath) {
    logger.warn("[READER][NO_STORAGE_PATH]", {
      uid,
      bookId,
      hasAttachment: Boolean(attachment?.storagePath),
      hasLegacyPath: Boolean(asNonEmptyString(book.storagePath)),
      legacyOwnerUid: resolveLegacyOwnerUid(book),
      source: asNonEmptyString(book.source),
    });
    throw new HttpsError("not-found", "No readable ebook file found for this book.");
  }

  const file = storage.bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) {
    logger.error("[READER][MISSING_STORAGE_FILE]", {
      uid,
      bookId,
      storagePath,
    });
    throw new HttpsError("not-found", "Ebook file missing from storage.");
  }

  let signedUrl: string;
  let format = inferFormatFromPath(storagePath);
  if (format === "unknown") {
    try {
      const [meta] = await file.getMetadata();
      format = inferFormatFromContentType(meta.contentType);
    } catch (error) {
      logger.warn("[READER][FORMAT_INFER_METADATA_FAILED]", {
        uid,
        bookId,
        storagePath,
        error: String(error),
      });
    }
  }
  try {
    const [issuedUrl] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + READER_URL_TTL_MS,
      responseDisposition: "inline",
      ...(format === "pdf"
        ? { responseType: "application/pdf" }
        : {}),
    });
    signedUrl = issuedUrl;
  } catch (error) {
    logger.error("[READER][SIGNED_URL_ISSUE_FAILED]", {
      uid,
      bookId,
      storagePath,
      error: String(error),
    });
    throw new HttpsError(
      "internal",
      "Reader URL signing is not configured for this environment."
    );
  }

  const progressData = progressSnap.exists
    ? (progressSnap.data() as { lastPosition?: unknown; progress?: unknown })
    : null;

  const resumePage = resolveResumePage(progressData?.lastPosition);
  const now = FieldValue.serverTimestamp();

  await sessionRef.set(
    {
      userId: uid,
      bookId,
      status: "reading",
      resumePage,
      storagePath,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  logger.info("[READER][SESSION_READY]", {
    uid,
    bookId,
    sessionId,
    resumePage,
    format,
    pathPrefix: storagePath.split("/").slice(0, 2).join("/"),
  });

  return {
    signedUrl,
    resumePage,
    format,
  };
});
