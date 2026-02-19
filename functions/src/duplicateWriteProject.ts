import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";

type WriteStatus = "Idea" | "Draft" | "Revision" | "Final";

function normalizeStatus(value: unknown): WriteStatus {
  if (value === "Idea" || value === "Draft" || value === "Revision" || value === "Final") {
    return value;
  }
  return "Draft";
}

function normalizeString(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, max);
}

function normalizeCoverUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString().slice(0, 2048);
  } catch {
    return null;
  }
}

/**
 * duplicateWriteProject
 * Deterministic duplicate with operation-level idempotency.
 */
export const duplicateWriteProject = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }

  const uid = request.auth.uid;
  const { projectId, operationId } = request.data as {
    projectId?: unknown;
    operationId?: unknown;
  };

  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }

  if (typeof operationId !== "string" || !operationId.trim()) {
    throw new HttpsError("invalid-argument", "A valid operationId is required.");
  }

  const db = admin.firestore();
  const opRef = db
    .collection("users")
    .doc(uid)
    .collection("project_duplicate_ops")
    .doc(operationId.trim());
  const sourceRef = db.collection("users").doc(uid).collection("projects").doc(projectId.trim());

  try {
    const result = await db.runTransaction(async (tx) => {
      const opSnap = await tx.get(opRef);
      if (opSnap.exists) {
        const existingId = opSnap.data()?.newProjectId;
        if (typeof existingId === "string" && existingId.trim()) {
          const existingRef = db.collection("users").doc(uid).collection("projects").doc(existingId);
          const existingSnap = await tx.get(existingRef);
          if (existingSnap.exists) {
            return { id: existingId.trim(), data: existingSnap.data() as Record<string, unknown> };
          }
        }
      }

      const sourceSnap = await tx.get(sourceRef);
      if (!sourceSnap.exists) {
        throw new HttpsError("not-found", "Source project not found.");
      }

      const source = sourceSnap.data() as Record<string, unknown>;
      const now = admin.firestore.Timestamp.now();
      const titleEn = normalizeString(source.titleEn, "Untitled Project", 180);
      const titleAr = normalizeString(source.titleAr, "مشروع غير معنون", 180);
      const duplicateData = {
        ownerId: uid,
        uid,
        title: `Copy of ${titleEn}`.slice(0, 180),
        titleEn: `Copy of ${titleEn}`.slice(0, 180),
        titleAr: `نسخة من ${titleAr}`.slice(0, 180),
        content: typeof source.content === "string" ? source.content.slice(0, 2_000_000) : "",
        wordCount:
          typeof source.wordCount === "number" && Number.isFinite(source.wordCount)
            ? Math.max(0, Math.floor(source.wordCount))
            : 0,
        status: normalizeStatus(source.status),
        typeEn: normalizeString(source.typeEn, "Draft", 80),
        typeAr: normalizeString(source.typeAr, "مسودة", 80),
        coverUrl: normalizeCoverUrl(source.coverUrl),
        isPublished: false,
        publishedBookId: null,
        revision: 1,
        source: "write-duplicate",
        version: 1,
        createdAt: now,
        updatedAt: now,
      };

      const duplicateRef = db.collection("users").doc(uid).collection("projects").doc();
      tx.set(duplicateRef, duplicateData);
      tx.set(opRef, {
        operationId: operationId.trim(),
        sourceProjectId: projectId.trim(),
        newProjectId: duplicateRef.id,
        createdAt: now,
      });

      return { id: duplicateRef.id, data: duplicateData };
    });

    const createdAtIso =
      result.data.createdAt instanceof admin.firestore.Timestamp
        ? result.data.createdAt.toDate().toISOString()
        : new Date().toISOString();
    const updatedAtIso =
      result.data.updatedAt instanceof admin.firestore.Timestamp
        ? result.data.updatedAt.toDate().toISOString()
        : new Date().toISOString();

    return {
      id: result.id,
      canonicalId: result.id,
      path: `users/${uid}/projects/${result.id}`,
      ownerId: uid,
      uid,
      title: normalizeString(result.data.title, "Untitled Project", 180),
      titleEn: normalizeString(result.data.titleEn, "Untitled Project", 180),
      titleAr: normalizeString(result.data.titleAr, "مشروع غير معنون", 180),
      content: typeof result.data.content === "string" ? result.data.content : "",
      wordCount:
        typeof result.data.wordCount === "number" && Number.isFinite(result.data.wordCount)
          ? Math.max(0, Math.floor(result.data.wordCount))
          : 0,
      status: normalizeStatus(result.data.status),
      typeEn: normalizeString(result.data.typeEn, "Draft", 80),
      typeAr: normalizeString(result.data.typeAr, "مسودة", 80),
      isPublished: false,
      revision: 1,
      source: "write-duplicate",
      version: 1,
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
      coverUrl: normalizeCoverUrl(result.data.coverUrl) ?? undefined,
    };
  } catch (error) {
    logger.error("[WRITE][DUPLICATE_FAILED]", { uid, projectId, operationId, error });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to duplicate project.");
  }
});
