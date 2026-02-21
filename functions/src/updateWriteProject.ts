import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "./shared/auth";

type WriteStatus = "Idea" | "Draft" | "Revision" | "Final";

function normalizeString(value: unknown, max = 300): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, max);
}

function normalizeContent(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, 2_000_000);
}

function normalizeWordCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeStatus(value: unknown): WriteStatus | undefined {
  if (value === "Idea" || value === "Draft" || value === "Revision" || value === "Final") {
    return value;
  }
  return undefined;
}

function normalizeCoverUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
}

/**
 * updateWriteProject
 * Deterministic project update with revision precondition.
 */
export const updateWriteProject = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const { projectId, updates, expectedRevision } = request.data as {
    projectId?: unknown;
    updates?: Record<string, unknown>;
    expectedRevision?: unknown;
  };

  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }

  if (!updates || typeof updates !== "object") {
    throw new HttpsError("invalid-argument", "A non-empty updates object is required.");
  }

  if (!Number.isInteger(expectedRevision) || Number(expectedRevision) < 1) {
    throw new HttpsError(
      "invalid-argument",
      "expectedRevision must be a positive integer."
    );
  }

  const normalizedUpdates: Record<string, unknown> = {};

  const titleEn = normalizeString(updates.titleEn, 180);
  const titleAr = normalizeString(updates.titleAr, 180);
  const content = normalizeContent(updates.content);
  const wordCount = normalizeWordCount(updates.wordCount);
  const status = normalizeStatus(updates.status);
  const typeEn = normalizeString(updates.typeEn, 80);
  const typeAr = normalizeString(updates.typeAr, 80);
  const coverUrl = normalizeCoverUrl(updates.coverUrl);

  if (titleEn !== undefined) {
    normalizedUpdates.titleEn = titleEn;
    normalizedUpdates.title = titleEn;
  }
  if (titleAr !== undefined) normalizedUpdates.titleAr = titleAr;
  if (content !== undefined) normalizedUpdates.content = content;
  if (wordCount !== undefined) normalizedUpdates.wordCount = wordCount;
  if (status !== undefined) normalizedUpdates.status = status;
  if (typeEn !== undefined) normalizedUpdates.typeEn = typeEn;
  if (typeAr !== undefined) normalizedUpdates.typeAr = typeAr;
  if (coverUrl !== undefined) normalizedUpdates.coverUrl = coverUrl;

  if (Object.keys(normalizedUpdates).length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "No writable fields were provided in updates."
    );
  }

  const db = admin.firestore();
  const projectRef = db.collection("users").doc(uid).collection("projects").doc(projectId.trim());
  const now = admin.firestore.Timestamp.now();

  try {
    const nextRevision = await db.runTransaction(async (tx) => {
      const snap = await tx.get(projectRef);
      if (!snap.exists) {
        throw new HttpsError("not-found", "Project was not found.");
      }

      const data = snap.data() as Record<string, unknown>;
      const currentRevision =
        typeof data.revision === "number" && Number.isInteger(data.revision)
          ? data.revision
          : 1;

      if (currentRevision !== expectedRevision) {
        throw new HttpsError(
          "failed-precondition",
          `Revision mismatch. Expected ${expectedRevision}, found ${currentRevision}.`
        );
      }

      const revision = currentRevision + 1;
      tx.update(projectRef, {
        ...normalizedUpdates,
        revision,
        updatedAt: now,
      });

      return revision;
    });

    return {
      projectId: projectId.trim(),
      revision: nextRevision,
      updatedAt: now.toDate().toISOString(),
    };
  } catch (error) {
    logger.error("[WRITE][UPDATE_FAILED]", { uid, projectId, error });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to update project.");
  }
});
