import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { normalizeProjectManuscript } from "./publishing/normalizeProjectManuscript";
import {
  deriveEstimatedReadingMinutes,
  deriveExcerpt,
  deriveLanguageFromNormalizedContent,
  deriveWordCount,
} from "./publishing/releaseDerivedFields";
import { assertActiveAuthenticatedUser } from "./shared/auth";

type PublishKind = "ebook_epub" | "blog";

function normalizeProjectId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }
  return value.trim();
}

function normalizePublishKind(value: unknown): PublishKind {
  if (value === "ebook_epub" || value === "blog") {
    return value;
  }
  throw new HttpsError(
    "invalid-argument",
    "publishKind must be either 'ebook_epub' or 'blog'."
  );
}

function deriveProjectTitle(project: Record<string, unknown>): string {
  const candidates = [project.titleEn, project.titleAr, project.title];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim().slice(0, 180);
    }
  }
  return "Untitled";
}

function deriveOwnerUid(project: Record<string, unknown>): string {
  if (typeof project.ownerId === "string" && project.ownerId.trim()) {
    return project.ownerId.trim();
  }
  if (typeof project.uid === "string" && project.uid.trim()) {
    return project.uid.trim();
  }
  return "";
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

function deriveOwnerDisplayName(profile: Record<string, unknown> | null, uid: string): string {
  if (!profile) return uid;
  return (
    (typeof profile.name === "string" && profile.name.trim() ? profile.name.trim().slice(0, 180) : "") ||
    (typeof profile.displayName === "string" && profile.displayName.trim()
      ? profile.displayName.trim().slice(0, 180)
      : "") ||
    (typeof profile.handle === "string" && profile.handle.trim() ? profile.handle.trim().slice(0, 180) : "") ||
    uid
  );
}

export const createProjectRelease = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const projectId = normalizeProjectId((request.data as { projectId?: unknown }).projectId);
  const publishKind = normalizePublishKind(
    (request.data as { publishKind?: unknown }).publishKind
  );

  const db = admin.firestore();
  const projectRef = db.collection("users").doc(uid).collection("projects").doc(projectId);
  const releaseHeadRef = db.collection("project_release_heads").doc(`${uid}_${projectId}`);
  const releaseRef = db.collection("project_releases").doc();

  try {
    const result = await db.runTransaction(async (tx) => {
      const ownerRef = db.collection("users").doc(uid);
      const [projectSnap, headSnap, ownerSnap] = await Promise.all([
        tx.get(projectRef),
        tx.get(releaseHeadRef),
        tx.get(ownerRef),
      ]);

      if (!projectSnap.exists) {
        throw new HttpsError("not-found", "Project not found.");
      }

      const project = (projectSnap.data() ?? {}) as Record<string, unknown>;
      const ownerUid = deriveOwnerUid(project);
      if (ownerUid && ownerUid !== uid) {
        throw new HttpsError(
          "permission-denied",
          "Project ownership mismatch."
        );
      }

      if (!project.contentDoc || typeof project.contentDoc !== "object") {
        throw new HttpsError(
          "failed-precondition",
          "Project contentDoc is required before creating a release."
        );
      }

      const normalizedContent = normalizeProjectManuscript({
        contentDoc: project.contentDoc,
        projectTitle: deriveProjectTitle(project),
      });

      if (normalizedContent.units.length === 0) {
        throw new HttpsError(
          "failed-precondition",
          "Normalized manuscript output is empty."
        );
      }

      const head = (headSnap.data() ?? {}) as Record<string, unknown>;
      const latestVersion =
        typeof head.latestVersion === "number" &&
        Number.isInteger(head.latestVersion) &&
        head.latestVersion >= 0
          ? head.latestVersion
          : 0;
      const version = latestVersion + 1;
      const now = admin.firestore.Timestamp.now();
      const title = deriveProjectTitle(project);
      const language = deriveLanguageFromNormalizedContent({
        normalizedContent,
        titleEn: typeof project.titleEn === "string" ? project.titleEn : "",
        titleAr: typeof project.titleAr === "string" ? project.titleAr : "",
      });
      const excerpt = deriveExcerpt(normalizedContent);
      const wordCount = deriveWordCount(normalizedContent);
      const estimatedReadingMinutes = deriveEstimatedReadingMinutes(wordCount);
      const ownerDisplayName = deriveOwnerDisplayName(
        ownerSnap.exists
          ? ((ownerSnap.data() ?? {}) as Record<string, unknown>)
          : null,
        uid
      );
      const coverUrl = normalizeCoverUrl(project.coverUrl);

      tx.set(releaseRef, {
        releaseId: releaseRef.id,
        projectId,
        ownerUid: uid,
        title,
        authorDisplayName: ownerDisplayName,
        language,
        excerpt,
        wordCount,
        estimatedReadingMinutes,
        ...(coverUrl ? { coverUrl } : {}),
        version,
        publishKind,
        normalizedContent,
        createdAt: now,
        binaryStatus: "pending",
        attachmentId: null,
        current: false,
      });

      tx.set(
        releaseHeadRef,
        {
          ownerUid: uid,
          projectId,
          latestVersion: version,
          latestReleaseId: releaseRef.id,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        releaseId: releaseRef.id,
        version,
        normalizedContent,
        unitCount: normalizedContent.units.length,
      };
    });

    logger.info("[PUBLISH][RELEASE_CREATED]", {
      projectId,
      releaseId: result.releaseId,
      version: result.version,
      normalizedUnitCount: result.unitCount,
      publishKind,
      ownerUid: uid,
    });

    return {
      releaseId: result.releaseId,
      version: result.version,
      normalizedContent: result.normalizedContent,
    };
  } catch (error) {
    logger.error("[PUBLISH][RELEASE_CREATE_FAILED]", {
      projectId,
      publishKind,
      ownerUid: uid,
      error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      "internal",
      "Failed to create project release."
    );
  }
});
