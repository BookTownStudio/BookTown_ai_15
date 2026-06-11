import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "../shared/auth";
import { getOrBuildReaderManifest } from "../reader/readerManifestService";

const db = admin.firestore();
const bucket = admin.storage().bucket();

type FinalizeUserUploadRequest = {
  bookId: string;
};

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildUserUploadReaderAuthority(
  updatedAt: FirebaseFirestore.FieldValue
): Record<string, unknown> {
  return {
    hasReadableAttachment: true,
    attachmentId: null,
    source: "user_upload",
    updatedAt,
  };
}

export const finalizeUserUpload = onCall<FinalizeUserUploadRequest>(
  { cors: true },
  async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    const uid = caller.uid;
    const bookId = asNonEmptyString(request.data?.bookId);
    if (!bookId) {
      throw new HttpsError("invalid-argument", "Missing bookId.");
    }

    const bookRef = db.collection("books").doc(bookId);
    const jobRef = db.collection("cover_jobs").doc(bookId);
    const metadataJobRef = db.collection("upload_metadata_jobs").doc(bookId);
    const bookSnap = await bookRef.get();

    if (!bookSnap.exists) {
      throw new HttpsError("not-found", "Uploaded book was not found.");
    }

    const book = (bookSnap.data() || {}) as Record<string, unknown>;
    const ownerUid = asNonEmptyString(book.ownerUid);
    if (ownerUid !== uid) {
      throw new HttpsError("permission-denied", "Only the owner can finalize upload.");
    }

    if (asNonEmptyString(book.source) !== "user_upload") {
      throw new HttpsError("failed-precondition", "Book is not a user upload.");
    }

    const storagePath = asNonEmptyString(book.storagePath);
    const fileType = asNonEmptyString(book.fileType);
    if (!storagePath || (fileType !== "pdf" && fileType !== "epub")) {
      throw new HttpsError("failed-precondition", "Book upload metadata is incomplete.");
    }

    if (!storagePath.startsWith(`books/${bookId}/original/`)) {
      throw new HttpsError("failed-precondition", "Storage path is outside canonical upload prefix.");
    }

    const file = bucket.file(storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError("failed-precondition", "Uploaded file is missing from storage.");
    }

    const [meta] = await file.getMetadata();
    const size = Number(meta.size || 0);
    if (!Number.isFinite(size) || size <= 0) {
      throw new HttpsError("failed-precondition", "Uploaded file is empty.");
    }

    const now = FieldValue.serverTimestamp();
    const batch = db.batch();

    batch.set(
      jobRef,
      {
        id: bookId,
        bookId,
        ownerUid: uid,
        source: "user_upload",
        fileType,
        storagePath,
        status: "PENDING",
        attempts: 0,
        maxAttempts: 3,
        lastErrorCode: null,
        lastErrorMessage: null,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );

    batch.set(
      bookRef,
      {
        uploadFinalized: true,
        uploadFinalizedAt: now,
        readerAuthority: buildUserUploadReaderAuthority(now),
        hasEbook: true,
        downloadable: true,
        isEbookAvailable: true,
        coverState: "PENDING",
        coverFailureCode: null,
        coverFailureMessage: null,
        coverUpdatedAt: now,
        ...(fileType === "epub"
          ? {
              uploadMetadata: {
                status: "pending",
                lastProcessedAt: null,
                failureReason: null,
                source: "epub_opf",
              },
            }
          : {}),
        updatedAt: now,
      },
      { merge: true }
    );

    if (fileType === "epub") {
      batch.set(
        metadataJobRef,
        {
          id: bookId,
          bookId,
          ownerUid: uid,
          source: "user_upload",
          metadataSource: "epub_opf",
          fileType,
          storagePath,
          status: "PENDING",
          failureReason: null,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true }
      );
    }

    await batch.commit();

    try {
      await getOrBuildReaderManifest({
        uid,
        bookId,
      });
    } catch (error) {
      logger.warn("[USER_UPLOAD][MANIFEST_BUILD_FAILED]", {
        uid,
        bookId,
        error: String(error),
      });
    }

    logger.info("[USER_UPLOAD][FINALIZED]", {
      uid,
      bookId,
      storagePath,
      fileType,
      size,
    });

    return {
      bookId,
      status: "QUEUED" as const,
    };
  }
);
