import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { generateReleaseEpub } from "./publishing/generateReleaseEpub";
import type { NormalizedManuscript } from "./publishing/normalizeProjectManuscript";
import { assertActiveAuthenticatedUser } from "./shared/auth";

type ReleaseBinaryStatus = "pending" | "ready" | "failed";
type CoverAsset = {
  bytes: Buffer;
  mediaType: "image/jpeg" | "image/png";
  fileName: "cover.jpg" | "cover.png";
};

const EPUB_MIME_TYPE = "application/epub+zip";
const MAX_COVER_BYTES = 10 * 1024 * 1024;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

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

function normalizeReleaseStatus(value: unknown): ReleaseBinaryStatus {
  if (value === "ready" || value === "failed" || value === "pending") {
    return value;
  }
  return "pending";
}

function deriveBookId(ownerUid: string, projectId: string): string {
  return `write_${ownerUid}_${projectId}`;
}

function deriveProjectTitle(project: Record<string, unknown>): string {
  const titleEn = asNonEmptyString(project.titleEn, 180);
  const titleAr = asNonEmptyString(project.titleAr, 180);
  const title = asNonEmptyString(project.title, 180);
  return titleEn || titleAr || title || "Untitled";
}

function deriveAuthorName(profile: Record<string, unknown> | null, ownerUid: string): string {
  if (!profile) return "BookTown Author";
  return (
    asNonEmptyString(profile.name, 180) ||
    asNonEmptyString(profile.displayName, 180) ||
    asNonEmptyString(profile.handle, 180) ||
    ownerUid
  );
}

function containsArabic(value: string): boolean {
  return /[\u0600-\u06FF]/.test(value);
}

function deriveLanguage(params: {
  normalizedContent: NormalizedManuscript;
  project: Record<string, unknown>;
}): string {
  for (const unit of params.normalizedContent.units) {
    for (const block of unit.content) {
      const lang = asNonEmptyString(block.attrs?.lang, 12).toLowerCase();
      if (lang === "ar" || lang === "en") {
        return lang;
      }
    }
  }

  const titleEn = asNonEmptyString(params.project.titleEn, 180);
  const titleAr = asNonEmptyString(params.project.titleAr, 180);
  if (titleAr && !titleEn) return "ar";
  if (titleEn) return "en";
  return containsArabic(deriveProjectTitle(params.project)) ? "ar" : "en";
}

function assertNormalizedContent(value: unknown): NormalizedManuscript {
  const record = asRecord(value);
  const units = Array.isArray(record?.units) ? record.units : null;
  if (!units || units.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Release normalizedContent is missing or empty."
    );
  }
  return record as unknown as NormalizedManuscript;
}

function normalizeCoverUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.toString().slice(0, 2048);
  } catch {
    return "";
  }
}

async function fetchOptionalCoverAsset(coverUrl: string): Promise<CoverAsset | undefined> {
  if (!coverUrl) return undefined;

  let response: Response;
  try {
    response = await fetch(coverUrl);
  } catch (error) {
    logger.warn("[PUBLISH][RELEASE_COVER_FETCH_FAILED]", {
      coverUrl,
      error: String(error),
    });
    return undefined;
  }

  if (!response.ok) {
    logger.warn("[PUBLISH][RELEASE_COVER_BAD_STATUS]", {
      coverUrl,
      status: response.status,
    });
    return undefined;
  }

  const contentType = asNonEmptyString(response.headers.get("content-type"), 128).toLowerCase();
  let mediaType: CoverAsset["mediaType"] | null = null;
  let fileName: CoverAsset["fileName"] | null = null;

  if (contentType.startsWith("image/jpeg")) {
    mediaType = "image/jpeg";
    fileName = "cover.jpg";
  } else if (contentType.startsWith("image/png")) {
    mediaType = "image/png";
    fileName = "cover.png";
  } else {
    logger.warn("[PUBLISH][RELEASE_COVER_UNSUPPORTED_TYPE]", {
      coverUrl,
      contentType,
    });
    return undefined;
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength <= 0 || arrayBuffer.byteLength > MAX_COVER_BYTES) {
    logger.warn("[PUBLISH][RELEASE_COVER_INVALID_SIZE]", {
      coverUrl,
      size: arrayBuffer.byteLength,
    });
    return undefined;
  }

  return {
    bytes: Buffer.from(arrayBuffer),
    mediaType,
    fileName,
  };
}

async function createReleaseAttachment(params: {
  releaseId: string;
  ownerUid: string;
  projectId: string;
  bookId: string;
  storagePath: string;
}): Promise<string> {
  const db = admin.firestore();
  const attachmentId = `att_release_${params.releaseId}`;
  const now = FieldValue.serverTimestamp();
  const nowIso = new Date().toISOString();

  await db.collection("attachments").doc(attachmentId).set(
    {
      id: attachmentId,
      type: "ebook",
      purpose: "ebook",
      format: "epub",
      mimeType: EPUB_MIME_TYPE,
      size: null,
      parentType: "project_releases",
      parentId: params.releaseId,
      storagePath: params.storagePath,
      uploader: {
        uid: params.ownerUid,
      },
      visibility: "private",
      status: "active",
      metadata: {
        attachmentId,
        type: "DOCUMENT",
        contentType: EPUB_MIME_TYPE,
        mimeType: EPUB_MIME_TYPE,
        createdAt: nowIso,
        uploadedAt: nowIso,
        uploader: {
          uid: params.ownerUid,
        },
        storagePath: params.storagePath,
        parentType: "project_releases",
        parentId: params.releaseId,
        releaseId: params.releaseId,
        projectId: params.projectId,
        bookId: params.bookId,
      },
      createdAt: now,
      uploadedAt: now,
      finalizedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  return attachmentId;
}

export const generateProjectReleaseEpub = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const ownerUid = caller.uid;
  const releaseId = normalizeReleaseId((request.data as { releaseId?: unknown }).releaseId);
  const db = admin.firestore();
  const storage = admin.storage().bucket();
  const releaseRef = db.collection("project_releases").doc(releaseId);

  let tracedProjectId = "";
  let tracedStoragePath = "";
  let shouldMarkReleaseFailed = false;

  try {
    const releaseSnap = await releaseRef.get();
    if (!releaseSnap.exists) {
      throw new HttpsError("not-found", "Release not found.");
    }

    const release = (releaseSnap.data() ?? {}) as Record<string, unknown>;
    const releaseOwnerUid = asNonEmptyString(release.ownerUid, 256);
    const projectId = asNonEmptyString(release.projectId, 256);
    tracedProjectId = projectId;

    if (!releaseOwnerUid || !projectId) {
      throw new HttpsError(
        "failed-precondition",
        "Release is missing required project linkage."
      );
    }

    if (releaseOwnerUid !== ownerUid) {
      throw new HttpsError("permission-denied", "Release ownership mismatch.");
    }

    if (release.publishKind !== "ebook_epub") {
      throw new HttpsError(
        "failed-precondition",
        "This release is not eligible for EPUB generation."
      );
    }

    const binaryStatus = normalizeReleaseStatus(release.binaryStatus);
    const existingAttachmentId = asNonEmptyString(release.attachmentId, 256);
    const existingStoragePath = asNonEmptyString(release.epubStoragePath, 2048);

    if (binaryStatus === "ready" && existingAttachmentId && existingStoragePath) {
      logger.info("[PUBLISH][RELEASE_BINARY_ALREADY_READY]", {
        releaseId,
        projectId,
        epubStoragePath: existingStoragePath,
        attachmentId: existingAttachmentId,
        binaryStatus,
      });
      return {
        releaseId,
        projectId,
        epubStoragePath: existingStoragePath,
        attachmentId: existingAttachmentId,
        binaryStatus,
      };
    }

    if (binaryStatus === "failed") {
      throw new HttpsError(
        "failed-precondition",
        "Release binary generation is locked in failed state."
      );
    }

    const normalizedContent = assertNormalizedContent(release.normalizedContent);
    shouldMarkReleaseFailed = true;
    const projectRef = db.collection("users").doc(ownerUid).collection("projects").doc(projectId);
    const [projectSnap, ownerProfileSnap] = await Promise.all([
      projectRef.get(),
      db.collection("users").doc(ownerUid).get(),
    ]);

    if (!projectSnap.exists) {
      throw new HttpsError("failed-precondition", "Source project metadata is missing.");
    }

    const project = (projectSnap.data() ?? {}) as Record<string, unknown>;
    const coverAsset = await fetchOptionalCoverAsset(normalizeCoverUrl(project.coverUrl));
    const language = deriveLanguage({ normalizedContent, project });
    const title = deriveProjectTitle(project);
    const author = deriveAuthorName(
      ownerProfileSnap.exists ? ((ownerProfileSnap.data() ?? {}) as Record<string, unknown>) : null,
      ownerUid
    );
    const bookId = deriveBookId(ownerUid, projectId);
    const epubStoragePath = `books/${bookId}/releases/${releaseId}/book.epub`;
    tracedStoragePath = epubStoragePath;

    const epubBuffer = await generateReleaseEpub({
      normalizedContent,
      metadata: {
        title,
        author,
        language,
        identifier: `urn:booktown:release:${releaseId}`,
      },
      cover: coverAsset,
    });

    const file = storage.file(epubStoragePath);
    await file.save(epubBuffer, {
      resumable: false,
      contentType: EPUB_MIME_TYPE,
      metadata: {
        cacheControl: "private, max-age=0, no-transform",
        metadata: {
          releaseId,
          projectId,
          ownerUid,
          publishKind: "ebook_epub",
          source: "project_release",
          language,
        },
      },
    });

    const attachmentId = await createReleaseAttachment({
      releaseId,
      ownerUid,
      projectId,
      bookId,
      storagePath: epubStoragePath,
    });

    await releaseRef.set(
      {
        epubStoragePath,
        attachmentId,
        binaryStatus: "ready",
      },
      { merge: true }
    );

    logger.info("[PUBLISH][RELEASE_BINARY_READY]", {
      releaseId,
      projectId,
      epubStoragePath,
      attachmentId,
      binaryStatus: "ready",
    });

    return {
      releaseId,
      projectId,
      epubStoragePath,
      attachmentId,
      binaryStatus: "ready" as const,
    };
  } catch (error) {
    logger.error("[PUBLISH][RELEASE_BINARY_FAILED]", {
      releaseId,
      projectId: tracedProjectId,
      epubStoragePath: tracedStoragePath || null,
      binaryStatus: "failed",
      error,
    });

    if (shouldMarkReleaseFailed) {
      const failurePayload: Record<string, unknown> = {
        binaryStatus: "failed",
        attachmentId: null,
      };
      if (tracedStoragePath) {
        failurePayload.epubStoragePath = tracedStoragePath;
      }
      await releaseRef.set(failurePayload, { merge: true });
    }

    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to generate release EPUB.");
  }
});
