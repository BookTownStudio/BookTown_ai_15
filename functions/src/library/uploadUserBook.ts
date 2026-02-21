import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { CONTRACT_VERSION } from "../contracts/shared/version";
import { generateCorrelationId, getHeaderValue } from "../contracts/correlation";
import { assertActiveAuthenticatedUser } from "../shared/auth";

type UploadUserBookRequest = {
  shelfId: string;
  fileName: string;
  fileType: "epub" | "pdf";
  fileSize: number;
};

type CoverState =
  | "PENDING"
  | "PROCESSING"
  | "READY"
  | "FAILED_RETRYABLE"
  | "FAILED_FATAL";

const ENDPOINT_KEY = "uploadUserBook";
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/;

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim();

  if (trimmed.length === 0 || trimmed.length > 255) {
    throw new HttpsError("invalid-argument", "Invalid fileName.");
  }

  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.includes("..") ||
    CONTROL_CHAR_PATTERN.test(trimmed)
  ) {
    throw new HttpsError("invalid-argument", "Invalid fileName.");
  }

  return trimmed;
}

function assertFileTypeMatchesName(
  fileName: string,
  fileType: "epub" | "pdf"
): void {
  const lowered = fileName.toLowerCase();
  const extension = fileType === "epub" ? ".epub" : ".pdf";

  if (!lowered.endsWith(extension)) {
    throw new HttpsError(
      "invalid-argument",
      `fileName extension must match fileType (${extension}).`
    );
  }
}

function toContentType(fileType: "epub" | "pdf"): string {
  return fileType === "epub" ? "application/epub+zip" : "application/pdf";
}

export const uploadUserBook = onCall<UploadUserBookRequest>(
  { cors: true },
  async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    const uid = caller.uid;
    const correlationId =
      getHeaderValue(
        request.rawRequest?.headers as Record<string, unknown> | undefined,
        "x-correlation-id"
      ) ?? generateCorrelationId();

    const { shelfId, fileName, fileType, fileSize } = request.data;
    const sanitizedFileName = sanitizeFileName(fileName);
    assertFileTypeMatchesName(sanitizedFileName, fileType);

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new HttpsError("invalid-argument", "Invalid fileSize.");
    }

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      throw new HttpsError("resource-exhausted", "File exceeds 25MB limit.");
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const bookRef = db.collection("books").doc();
    const bookId = bookRef.id;
    const derivedTitle = sanitizedFileName.replace(/\.[^.]+$/, "");
    const storagePath = `books/${bookId}/original/${sanitizedFileName}`;
    const shelfRef = db.doc(`shelves/${shelfId}`);
    const userShelfRef = db.doc(`users/${uid}/shelves/${shelfId}`);
    const shelfBookRef = db.doc(`users/${uid}/shelves/${shelfId}/books/${bookId}`);
    const coverJobRef = db.collection("coverJobs").doc(bookId);

    logger.info("[UPLOAD_USER_BOOK][START]", {
      endpointKey: ENDPOINT_KEY,
      contractVersion: CONTRACT_VERSION,
      correlationId,
      uid,
      stage: "start",
      shelfId,
      bookId,
    });

    try {
      await bucket.file(storagePath).save(Buffer.alloc(0), {
        resumable: false,
        contentType: toContentType(fileType),
        metadata: {
          metadata: {
            endpointKey: ENDPOINT_KEY,
            contractVersion: CONTRACT_VERSION,
            correlationId,
            uid,
            stage: "storage_write",
            fileType,
            fileSize: String(fileSize),
          },
        },
      });
    } catch (error) {
      logger.error("[UPLOAD_USER_BOOK][STORAGE_WRITE_FAILED]", {
        endpointKey: ENDPOINT_KEY,
        contractVersion: CONTRACT_VERSION,
        correlationId,
        uid,
        stage: "storage_write_failed",
        shelfId,
        bookId,
        error: String(error),
      });

      throw new HttpsError("internal", "Failed to create storage object.");
    }

    try {
      await db.runTransaction(async (tx) => {
        const shelfSnap = await tx.get(shelfRef);
        if (!shelfSnap.exists) {
          throw new HttpsError("not-found", "Shelf not found.");
        }

        const shelfData = shelfSnap.data() as
          | { ownerId?: unknown }
          | undefined;

        if (typeof shelfData?.ownerId !== "string" || shelfData.ownerId !== uid) {
          throw new HttpsError("permission-denied", "Shelf access denied.");
        }

        const now = FieldValue.serverTimestamp();
        const addedAt = new Date().toISOString();

        tx.set(bookRef, {
          id: bookId,
          ownerUid: uid,
          source: "user_upload",
          titleEn: derivedTitle,
          titleAr: derivedTitle,
          authorEn: "Unknown",
          authorAr: "",
          descriptionEn: "",
          descriptionAr: "",
          coverUrl: "",
          coverState: "PENDING" as CoverState,
          coverFailureCode: null,
          coverFailureMessage: null,
          coverUpdatedAt: now,
          isEbookAvailable: true,
          fileName: sanitizedFileName,
          fileType,
          fileSize,
          storagePath,
          createdAt: now,
          updatedAt: now,
        });

        tx.set(
          coverJobRef,
          {
            id: bookId,
            bookId,
            ownerUid: uid,
            source: "user_upload",
            status: "AWAITING_UPLOAD",
            attempts: 0,
            maxAttempts: 3,
            fileType,
            storagePath,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        tx.set(
          userShelfRef,
          {
            id: shelfId,
            ownerId: uid,
            updatedAt: now,
          },
          { merge: true }
        );

        tx.set(shelfBookRef, {
          id: bookId,
          bookId,
          shelfId,
          ownerUid: uid,
          source: "user_upload",
          fileName: sanitizedFileName,
          fileType,
          fileSize,
          addedAt,
          createdAt: now,
          updatedAt: now,
        });

        tx.set(
          shelfRef,
          {
            updatedAt: now,
            entries: {
              [bookId]: {
                bookId,
                addedAt,
                snapshot: {
                  titleEn: derivedTitle,
                  titleAr: derivedTitle,
                  coverUrl: "",
                },
              },
            },
          },
          { merge: true }
        );
      });
    } catch (error) {
      logger.error("[UPLOAD_USER_BOOK][FIRESTORE_WRITE_FAILED]", {
        endpointKey: ENDPOINT_KEY,
        contractVersion: CONTRACT_VERSION,
        correlationId,
        uid,
        stage: "firestore_write_failed",
        shelfId,
        bookId,
        error: String(error),
      });

      try {
        await bucket.file(storagePath).delete({ ignoreNotFound: true });
      } catch (cleanupError) {
        logger.error("[UPLOAD_USER_BOOK][ROLLBACK_FAILED]", {
          endpointKey: ENDPOINT_KEY,
          contractVersion: CONTRACT_VERSION,
          correlationId,
          uid,
          stage: "rollback_failed",
          shelfId,
          bookId,
          error: String(cleanupError),
        });
      }

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError("internal", "Failed to create book documents.");
    }

    logger.info("[UPLOAD_USER_BOOK][SUCCESS]", {
      endpointKey: ENDPOINT_KEY,
      contractVersion: CONTRACT_VERSION,
      correlationId,
      uid,
      stage: "complete",
      shelfId,
      bookId,
    });

    return {
      bookId,
      shelfId,
      storagePath,
      coverState: "PENDING" as CoverState,
      status: "UPLOADED" as const,
    };
  }
);
