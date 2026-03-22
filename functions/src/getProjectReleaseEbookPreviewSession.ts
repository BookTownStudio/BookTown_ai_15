import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { assertActiveAuthenticatedUser } from "./shared/auth";

function asNonEmptyString(value: unknown, max = 512): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeReleaseId(value: unknown): string {
  const releaseId = asNonEmptyString(value, 256);
  if (!releaseId) {
    throw new HttpsError("invalid-argument", "A valid releaseId is required.");
  }
  return releaseId;
}

export const getProjectReleaseEbookPreviewSession = onCall(
  { cors: true },
  async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    const releaseId = normalizeReleaseId(
      (request.data as { releaseId?: unknown }).releaseId
    );
    const db = admin.firestore();
    const storage = admin.storage().bucket();

    try {
      const releaseSnap = await db.collection("project_releases").doc(releaseId).get();
      if (!releaseSnap.exists) {
        throw new HttpsError("not-found", "Release not found.");
      }

      const release = (releaseSnap.data() ?? {}) as Record<string, unknown>;
      const ownerUid = asNonEmptyString(release.ownerUid, 256);
      const projectId = asNonEmptyString(release.projectId, 256);
      const binaryStatus = asNonEmptyString(release.binaryStatus, 32);
      const attachmentId = asNonEmptyString(release.attachmentId, 256);
      const epubStoragePath = asNonEmptyString(release.epubStoragePath, 2048);

      if (!ownerUid || !projectId) {
        throw new HttpsError(
          "failed-precondition",
          "Release is missing required project linkage."
        );
      }

      if (ownerUid !== caller.uid) {
        throw new HttpsError("permission-denied", "Release ownership mismatch.");
      }

      if (release.publishKind !== "ebook_epub") {
        throw new HttpsError(
          "failed-precondition",
          "This release is not eligible for ebook preview."
        );
      }

      if (binaryStatus !== "ready" || !attachmentId || !epubStoragePath) {
        throw new HttpsError(
          "failed-precondition",
          "Release EPUB preview is not ready yet."
        );
      }

      const attachmentSnap = await db.collection("attachments").doc(attachmentId).get();
      if (!attachmentSnap.exists) {
        throw new HttpsError("failed-precondition", "Release attachment is missing.");
      }

      const attachment = (attachmentSnap.data() ?? {}) as Record<string, unknown>;
      const attachmentParentType = asNonEmptyString(attachment.parentType, 64);
      const attachmentParentId = asNonEmptyString(attachment.parentId, 256);
      const attachmentReleaseId = asNonEmptyString(attachment.releaseId, 256);
      const attachmentStoragePath = asNonEmptyString(attachment.storagePath, 2048);

      if (
        !(
          (attachmentParentType === "project_releases" &&
            attachmentParentId === releaseId) ||
          (attachmentParentType === "editions" &&
            attachmentReleaseId === releaseId)
        ) ||
        attachmentStoragePath !== epubStoragePath
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Release attachment does not match the prepared EPUB artifact."
        );
      }

      const file = storage.file(epubStoragePath);
      const [exists] = await file.exists();
      if (!exists) {
        throw new HttpsError("not-found", "Prepared EPUB file is missing.");
      }

      const [signedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + 10 * 60 * 1000,
      });

      logger.info("[PUBLISH][RELEASE_EBOOK_PREVIEW_READY]", {
        releaseId,
        projectId,
        attachmentId,
        ownerUid,
      });

      return {
        signedUrl,
        format: "epub" as const,
      };
    } catch (error) {
      logger.error("[PUBLISH][RELEASE_EBOOK_PREVIEW_FAILED]", {
        releaseId,
        ownerUid: caller.uid,
        error,
      });
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to prepare ebook preview."
      );
    }
  }
);
