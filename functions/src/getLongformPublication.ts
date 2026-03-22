import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import type { NormalizedManuscript } from "./publishing/normalizeProjectManuscript";
import {
  deriveEstimatedReadingMinutes,
  deriveExcerpt,
  deriveLanguageFromNormalizedContent,
  deriveWordCount,
} from "./publishing/releaseDerivedFields";
import { assertActiveAuthenticatedUser } from "./shared/auth";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown, max = 512): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizePublicationId(value: unknown): string {
  const publicationId = asNonEmptyString(value, 256);
  if (!publicationId) {
    throw new HttpsError("invalid-argument", "A valid publicationId is required.");
  }
  return publicationId;
}

function assertNormalizedContent(value: unknown): NormalizedManuscript {
  const record = asRecord(value);
  const units = Array.isArray(record?.units) ? record.units : null;
  if (!units || units.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Publication normalizedContent is missing or empty."
    );
  }
  return record as unknown as NormalizedManuscript;
}

export const getLongformPublication = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const publicationId = normalizePublicationId(
    (request.data as { publicationId?: unknown }).publicationId
  );

  try {
    const publicationSnap = await admin
      .firestore()
      .collection("longform_publications")
      .doc(publicationId)
      .get();

    if (!publicationSnap.exists) {
      throw new HttpsError("not-found", "Publication not found.");
    }

    const publication = (publicationSnap.data() ?? {}) as Record<string, unknown>;
    const ownerUid = asNonEmptyString(publication.ownerUid, 256);
    const visibility = asNonEmptyString(publication.visibility, 32);
    const isOwner = ownerUid.length > 0 && ownerUid === caller.uid;
    const isPublic = visibility === "public";

    // Phase 7 keeps publication reads closed and deterministic until explicit visibility enforcement lands.
    if (!isOwner && !isPublic) {
      throw new HttpsError("not-found", "Publication not found.");
    }

    const normalizedContent = assertNormalizedContent(publication.normalizedContent);
    const title = asNonEmptyString(publication.title, 180);
    if (!title) {
      throw new HttpsError(
        "failed-precondition",
        "Publication title is missing."
      );
    }

    const coverUrl = asNonEmptyString(publication.coverUrl, 2048) || undefined;
    const excerpt =
      asNonEmptyString(publication.excerpt, 220) || deriveExcerpt(normalizedContent);
    const wordCount =
      typeof publication.wordCount === "number" &&
      Number.isFinite(publication.wordCount) &&
      publication.wordCount >= 0
        ? Math.floor(publication.wordCount)
        : deriveWordCount(normalizedContent);
    const estimatedReadingMinutes =
      typeof publication.estimatedReadingMinutes === "number" &&
      Number.isFinite(publication.estimatedReadingMinutes) &&
      publication.estimatedReadingMinutes > 0
        ? Math.floor(publication.estimatedReadingMinutes)
        : deriveEstimatedReadingMinutes(wordCount);
    const language =
      asNonEmptyString(publication.language, 12) ||
      deriveLanguageFromNormalizedContent({
        normalizedContent,
        titleEn: title,
        titleAr: "",
      });
    const author =
      asNonEmptyString(publication.authorDisplayName, 180) ||
      asNonEmptyString(publication.ownerDisplayName, 180) ||
      ownerUid ||
      caller.uid;

    logger.info("[PUBLICATION][READ_LOADED]", {
      publicationId,
      ownerUid,
      requestedBy: caller.uid,
      unitCount: normalizedContent.units.length,
    });

    return {
      publicationId,
      title,
      author,
      ...(coverUrl ? { coverUrl } : {}),
      excerpt,
      estimatedReadingMinutes,
      normalizedContent,
      ownerUid,
      language,
    };
  } catch (error) {
    logger.error("[PUBLICATION][READ_FAILED]", {
      publicationId,
      requestedBy: caller.uid,
      error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to load publication.");
  }
});
