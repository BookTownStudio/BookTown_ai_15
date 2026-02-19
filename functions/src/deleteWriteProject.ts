import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";

const MAX_CASCADE_DELETE_DOCS = 450;

/**
 * deleteWriteProject
 * Authoritative delete with deterministic cascade cleanup.
 */
export const deleteWriteProject = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated to delete a project.");
  }

  const uid = request.auth.uid;
  const { projectId } = request.data as { projectId?: unknown };

  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }

  const canonicalProjectId = projectId.trim();
  const db = admin.firestore();

  const userRef = db.collection("users").doc(uid);
  const projectRef = userRef.collection("projects").doc(canonicalProjectId);
  const shareRef = userRef.collection("project_share_links").doc(canonicalProjectId);

  try {
    const [projectSnap, shareSnap, publishedSnap, publishOpsSnap, duplicateOpsSnap] = await Promise.all([
      projectRef.get(),
      shareRef.get(),
      userRef.collection("published_books").where("projectId", "==", canonicalProjectId).get(),
      userRef.collection("project_publish_ops").where("projectId", "==", canonicalProjectId).get(),
      userRef.collection("project_duplicate_ops").where("sourceProjectId", "==", canonicalProjectId).get(),
    ]);

    if (!projectSnap.exists) {
      throw new HttpsError("not-found", "Project was not found.");
    }

    const shareData = shareSnap.exists ? (shareSnap.data() as Record<string, unknown>) : null;
    const shareToken =
      shareData && typeof shareData.token === "string" && shareData.token.trim().length > 0
        ? shareData.token.trim()
        : null;

    const editionIds = new Set<string>();
    const bookIds = new Set<string>();

    for (const publishedDoc of publishedSnap.docs) {
      const data = publishedDoc.data() as Record<string, unknown>;
      if (typeof data.editionId === "string" && data.editionId.trim().length > 0) {
        editionIds.add(data.editionId.trim());
      }
      if (typeof data.bookId === "string" && data.bookId.trim().length > 0) {
        bookIds.add(data.bookId.trim());
      }
    }

    const docsToDeleteCount =
      1 +
      (shareSnap.exists ? 1 : 0) +
      (shareToken ? 1 : 0) +
      publishedSnap.size +
      publishOpsSnap.size +
      duplicateOpsSnap.size +
      editionIds.size +
      bookIds.size;

    if (docsToDeleteCount > MAX_CASCADE_DELETE_DOCS) {
      throw new HttpsError(
        "failed-precondition",
        "Project has too many linked artifacts for a single atomic delete operation."
      );
    }

    const bucket = admin.storage().bucket();
    await bucket.deleteFiles({
      prefix: `projects/${uid}/${canonicalProjectId}/exports/`,
      force: true,
    });

    const batch = db.batch();
    batch.delete(projectRef);

    if (shareSnap.exists) {
      batch.delete(shareRef);
    }

    if (shareToken) {
      batch.delete(db.collection("write_project_shares").doc(shareToken));
    }

    for (const publishedDoc of publishedSnap.docs) {
      batch.delete(publishedDoc.ref);
    }

    for (const publishOpDoc of publishOpsSnap.docs) {
      batch.delete(publishOpDoc.ref);
    }

    for (const duplicateOpDoc of duplicateOpsSnap.docs) {
      batch.delete(duplicateOpDoc.ref);
    }

    for (const editionId of editionIds) {
      batch.delete(db.collection("editions").doc(editionId));
    }

    for (const bookId of bookIds) {
      const bookRef = db.collection("books").doc(bookId);
      const bookSnap = await bookRef.get();
      if (!bookSnap.exists) {
        continue;
      }
      const bookData = bookSnap.data() as Record<string, unknown>;
      if (bookData.ownerId === uid && bookData.projectId === canonicalProjectId) {
        batch.delete(bookRef);
      }
    }

    await batch.commit();

    return { success: true };
  } catch (error) {
    logger.error("[WRITE][DELETE_FAILED]", {
      uid,
      projectId: canonicalProjectId,
      error,
    });

    if (error instanceof HttpsError) {
      throw error;
    }

    throw new HttpsError("internal", "Failed to delete project and linked artifacts.");
  }
});
