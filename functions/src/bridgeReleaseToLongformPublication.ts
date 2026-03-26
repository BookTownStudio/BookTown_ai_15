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
import { normalizePublicationVisibility, type PublicationVisibility } from "./rights/bookRights";
import { resolveCanonicalCoverState } from "./covers/canonicalFallbackCover";

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

function normalizeRequestedVisibility(value: unknown): PublicationVisibility {
  const normalized = normalizePublicationVisibility(value, "public");
  if (value !== "public" && value !== "private") {
    throw new HttpsError("invalid-argument", "A valid visibility is required.");
  }
  return normalized;
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
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{Script=Arabic}a-z0-9\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return normalized || "publication";
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }
  return value;
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
    const requestedVisibility = normalizeRequestedVisibility(
      (request.data as { visibility?: unknown }).visibility
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
        const resolvedCover = resolveCanonicalCoverState({
          coverUrl,
          title,
          author: release.authorDisplayName,
          kind: "blog",
        });
        const excerpt = deriveExcerpt(release.normalizedContent);
        const wordCount = deriveWordCount(release.normalizedContent);
        const estimatedReadingMinutes = deriveEstimatedReadingMinutes(wordCount);
        const nextDerivedSlug = slugifyTitle(title);
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
        const projectRef = db
          .collection("users")
          .doc(release.ownerUid)
          .collection("projects")
          .doc(release.projectId);
        const existing = existingSnap.empty
          ? null
          : ((existingSnap.docs[0].data() ?? {}) as Record<string, unknown>);
        const existingPublicationVersion =
          normalizePositiveInteger(existing?.publicationVersion) ??
          normalizePositiveInteger(existing?.publishVersion);
        const publicationVersion = existing
          ? (existingPublicationVersion ?? 1) + 1
          : 1;
        const canonicalSlug =
          asNonEmptyString(existing?.canonicalSlug, 120) ||
          asNonEmptyString(existing?.slug, 120) ||
          nextDerivedSlug;
        const datePublished =
          existing?.datePublished ??
          existing?.createdAt ??
          now;

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
              slug: canonicalSlug,
              canonicalSlug,
              excerpt,
              publicationType: "blog_longform",
              currentReleaseId: releaseId,
              normalizedContent: release.normalizedContent,
              language,
              status: "published",
              visibility: requestedVisibility,
              coverMode: resolvedCover.coverMode,
              ...(resolvedCover.fallbackCover
                ? { fallbackCover: resolvedCover.fallbackCover }
                : {}),
              publicationVersion,
              publishVersion: 1,
              wordCount,
              estimatedReadingMinutes,
              datePublished,
              dateModified: now,
              lastPublishedTarget: "blog",
              publicationState: "published",
              canonicalLocked: true,
              lastPublishedAt: now,
              ...(coverUrl ? { coverUrl } : {}),
              createdAt: now,
              updatedAt: now,
            },
            { merge: true }
          );
        } else {
          const existingOwnerUid = asNonEmptyString(existing?.ownerUid, 256);
          if (existingOwnerUid && existingOwnerUid !== release.ownerUid) {
            throw new HttpsError(
              "failed-precondition",
              "Longform publication ownership mismatch."
            );
          }

          tx.set(
            publicationRef,
            {
              authorId: canonicalAuthor.authorId,
              authorDisplayName: release.authorDisplayName,
              title,
              slug: canonicalSlug,
              canonicalSlug,
              excerpt,
              currentReleaseId: releaseId,
              normalizedContent: release.normalizedContent,
              language,
              status: "published",
              visibility: requestedVisibility,
              coverMode: resolvedCover.coverMode,
              ...(resolvedCover.fallbackCover
                ? { fallbackCover: resolvedCover.fallbackCover }
                : { fallbackCover: FieldValue.delete() }),
              publicationVersion,
              publishVersion: publicationVersion,
              wordCount,
              estimatedReadingMinutes,
              datePublished,
              dateModified: now,
              lastPublishedTarget: "blog",
              publicationState: "published",
              canonicalLocked: true,
              lastPublishedAt: now,
              ...(coverUrl ? { coverUrl } : { coverUrl: FieldValue.delete() }),
              updatedAt: now,
            },
            { merge: true }
          );
        }

        if (projectRef.id) {
          tx.set(
            projectRef,
            {
              status: "Final",
              isPublished: true,
              publishedPublicationId: publicationRef.id,
              lastPublishedTarget: "blog",
              updatedAt: now,
            },
            { merge: true }
          );
        }

        return {
          publicationId: publicationRef.id,
          projectId: release.projectId,
          currentReleaseId: releaseId,
          publicationVersion,
          canonicalSlug,
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
