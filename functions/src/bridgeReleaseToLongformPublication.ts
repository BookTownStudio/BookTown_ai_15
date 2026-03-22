import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import type {
  NormalizedManuscript,
} from "./publishing/normalizeProjectManuscript";
import {
  deriveEstimatedReadingMinutes,
  deriveExcerpt,
  deriveLanguageFromNormalizedContent,
  deriveWordCount,
} from "./publishing/releaseDerivedFields";
import { assertActiveAuthenticatedUser } from "./shared/auth";
import { materializeAuthoredCanonicalAuthor } from "./library/authors/materializeAuthoredCanonicalAuthor";

type ReadyLongformRelease = {
  releaseId: string;
  ownerUid: string;
  projectId: string;
  normalizedContent: NormalizedManuscript;
  title: string;
  authorDisplayName: string;
  language: string;
  coverUrl?: string;
};

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

function normalizeCoverUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
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

export function slugifyTitle(title: string): string {
  const normalized = title
    .trim()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized.slice(0, 120) || "publication";
}

function assertReadyLongformRelease(
  releaseId: string,
  release: Record<string, unknown>,
  callerUid: string
): ReadyLongformRelease {
  const ownerUid = asNonEmptyString(release.ownerUid, 256);
  const projectId = asNonEmptyString(release.projectId, 256);
  const title = asNonEmptyString(release.title, 180);
  const authorDisplayName = asNonEmptyString(release.authorDisplayName, 180);
  const language =
    asNonEmptyString(release.language, 12).toLowerCase() ||
    deriveLanguageFromNormalizedContent({
      normalizedContent: assertNormalizedContent(release.normalizedContent),
      titleEn: title,
      titleAr: "",
    });

  if (!ownerUid || !projectId) {
    throw new HttpsError(
      "failed-precondition",
      "Release is missing required project linkage."
    );
  }

  if (ownerUid !== callerUid) {
    throw new HttpsError("permission-denied", "Release ownership mismatch.");
  }

  if (release.publishKind !== "blog") {
    throw new HttpsError(
      "failed-precondition",
      "This release is not eligible for longform blog publication."
    );
  }

  if (!title) {
    throw new HttpsError(
      "failed-precondition",
      "Release title is missing."
    );
  }

  if (!authorDisplayName) {
    throw new HttpsError(
      "failed-precondition",
      "Release authorDisplayName is missing."
    );
  }

  return {
    releaseId,
    ownerUid,
    projectId,
    normalizedContent: assertNormalizedContent(release.normalizedContent),
    title,
    authorDisplayName,
    language,
    coverUrl: normalizeCoverUrl(release.coverUrl),
  };
}

export const bridgeReleaseToLongformPublication = onCall(
  { cors: true },
  async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    const releaseId = normalizeReleaseId(
      (request.data as { releaseId?: unknown }).releaseId
    );
    const db = admin.firestore();
    const releaseRef = db.collection("project_releases").doc(releaseId);

    try {
      const result = await db.runTransaction(async (tx) => {
        const releaseSnap = await tx.get(releaseRef);
        if (!releaseSnap.exists) {
          throw new HttpsError("not-found", "Release not found.");
        }

        const release = assertReadyLongformRelease(
          releaseId,
          (releaseSnap.data() ?? {}) as Record<string, unknown>,
          caller.uid
        );

        const title = release.title;
        const language = release.language;
        const coverUrl = release.coverUrl;
        const excerpt = deriveExcerpt(release.normalizedContent);
        const wordCount = deriveWordCount(release.normalizedContent);
        const estimatedReadingMinutes = deriveEstimatedReadingMinutes(wordCount);
        const slug = slugifyTitle(title);
        const existingSnap = await tx.get(
          db
            .collection("longform_publications")
            .where("ownerUid", "==", release.ownerUid)
            .where("projectId", "==", release.projectId)
            .where("publicationType", "==", "blog_longform")
            .limit(1)
        );
        const canonicalAuthor = await materializeAuthoredCanonicalAuthor({
          tx,
          ownerUid: release.ownerUid,
          authorDisplayName: release.authorDisplayName,
          language,
        });

        const now = FieldValue.serverTimestamp();
        const publicationRef = existingSnap.empty
          ? db.collection("longform_publications").doc()
          : existingSnap.docs[0].ref;

        if (existingSnap.empty) {
          tx.set(
            publicationRef,
            {
              publicationId: publicationRef.id,
              projectId: release.projectId,
              ownerUid: release.ownerUid,
              authorId: canonicalAuthor.authorId,
              authorDisplayName: release.authorDisplayName,
              title,
              slug,
              excerpt,
              publicationType: "blog_longform",
              currentReleaseId: releaseId,
              normalizedContent: release.normalizedContent,
              language,
              status: "published",
              visibility: "private",
              publishVersion: 1,
              wordCount,
              estimatedReadingMinutes,
              lastPublishedAt: now,
              ...(coverUrl ? { coverUrl } : {}),
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
        } else {
          const existing = (existingSnap.docs[0].data() ?? {}) as Record<string, unknown>;
          const existingOwnerUid = asNonEmptyString(existing.ownerUid, 256);
          if (existingOwnerUid && existingOwnerUid !== release.ownerUid) {
            throw new HttpsError(
              "failed-precondition",
              "Longform publication ownership mismatch."
            );
          }

          const existingTitle = asNonEmptyString(existing.title, 180);
          const nextSlug =
            existingTitle === title
              ? asNonEmptyString(existing.slug, 120) || slug
              : slug;
          const publishVersionRaw = existing.publishVersion;
          const publishVersion =
            typeof publishVersionRaw === "number" &&
            Number.isInteger(publishVersionRaw) &&
            publishVersionRaw > 0
              ? publishVersionRaw + 1
              : 1;

          tx.set(
            publicationRef,
            {
              authorId: canonicalAuthor.authorId,
              authorDisplayName: release.authorDisplayName,
              title,
              slug: nextSlug,
              excerpt,
              currentReleaseId: releaseId,
              normalizedContent: release.normalizedContent,
              language,
              status: "published",
              visibility: "private",
              publishVersion,
              wordCount,
              estimatedReadingMinutes,
              lastPublishedAt: now,
              ...(coverUrl ? { coverUrl } : { coverUrl: FieldValue.delete() }),
              updatedAt: now,
            },
            { merge: true }
          );
        }

        return {
          publicationId: publicationRef.id,
          projectId: release.projectId,
          currentReleaseId: releaseId,
        };
      });

      logger.info("[PUBLISH][LONGFORM_PUBLICATION_BOUND]", {
        releaseId,
        publicationId: result.publicationId,
        projectId: result.projectId,
        currentReleaseId: result.currentReleaseId,
      });

      return result;
    } catch (error) {
      logger.error("[PUBLISH][LONGFORM_PUBLICATION_BIND_FAILED]", {
        releaseId,
        ownerUid: caller.uid,
        error,
      });
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError(
        "internal",
        "Failed to bind release to longform publication."
      );
    }
  }
);
