import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import type { NormalizedManuscript } from "./publishing/normalizeProjectManuscript";
import {
  deriveEstimatedReadingMinutes,
  deriveExcerpt,
  deriveWordCount,
} from "./publishing/releaseDerivedFields";
import { assertActiveAuthenticatedUser } from "./shared/auth";

type PreviewType = "blog" | "ebook";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
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

function normalizePreviewType(value: unknown): PreviewType {
  if (value === "blog" || value === "ebook") {
    return value;
  }
  throw new HttpsError(
    "invalid-argument",
    "previewType must be either 'blog' or 'ebook'."
  );
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

export const getProjectReleasePreview = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const releaseId = normalizeReleaseId((request.data as { releaseId?: unknown }).releaseId);
  const previewType = normalizePreviewType(
    (request.data as { previewType?: unknown }).previewType
  );

  try {
    const releaseSnap = await admin.firestore().collection("project_releases").doc(releaseId).get();
    if (!releaseSnap.exists) {
      throw new HttpsError("not-found", "Release not found.");
    }

    const release = (releaseSnap.data() ?? {}) as Record<string, unknown>;
    const ownerUid = asNonEmptyString(release.ownerUid, 256);
    if (!ownerUid || ownerUid !== caller.uid) {
      throw new HttpsError("permission-denied", "Release ownership mismatch.");
    }

    const normalizedContent = assertNormalizedContent(release.normalizedContent);
    const title = asNonEmptyString(release.title, 180);
    if (!title) {
      throw new HttpsError(
        "failed-precondition",
        "Release title is missing."
      );
    }

    const language = asNonEmptyString(release.language, 12) || "en";
    const coverUrl = asNonEmptyString(release.coverUrl, 2048) || undefined;
    const excerpt =
      asNonEmptyString(release.excerpt, 220) || deriveExcerpt(normalizedContent);
    const wordCount =
      typeof release.wordCount === "number" && Number.isFinite(release.wordCount) && release.wordCount >= 0
        ? Math.floor(release.wordCount)
        : deriveWordCount(normalizedContent);
    const estimatedReadingMinutes =
      typeof release.estimatedReadingMinutes === "number" &&
      Number.isFinite(release.estimatedReadingMinutes) &&
      release.estimatedReadingMinutes > 0
        ? Math.floor(release.estimatedReadingMinutes)
        : deriveEstimatedReadingMinutes(wordCount);
    const authorDisplayName =
      asNonEmptyString(release.authorDisplayName, 180) || asNonEmptyString(release.ownerUid, 256);

    logger.info("[PUBLISH][RELEASE_PREVIEW_LOADED]", {
      releaseId,
      previewType,
      ownerUid,
      unitCount: normalizedContent.units.length,
    });

    return {
      releaseId,
      previewType,
      title,
      language,
      coverUrl,
      excerpt,
      wordCount,
      estimatedReadingMinutes,
      normalizedContent,
      frontmatter: {
        author: authorDisplayName,
        language,
        unitCount: normalizedContent.units.length,
      },
    };
  } catch (error) {
    logger.error("[PUBLISH][RELEASE_PREVIEW_FAILED]", {
      releaseId,
      previewType,
      ownerUid: caller.uid,
      error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to load release preview.");
  }
});
