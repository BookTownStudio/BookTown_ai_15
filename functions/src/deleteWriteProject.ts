import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { assertActiveAuthenticatedUser } from "./shared/auth";

const MAX_CASCADE_DELETE_DOCS = 450;
const WRITE_PROJECT_DESTRUCTIVE_AUTHORITY_CONTRACT_VERSION = 1;
const WRITE_PROJECT_DESTRUCTIVE_OPERATION = "deleteWriteProject";

function assertWriteProjectDestructiveAuthority(params: {
  uid: string;
  projectId: string;
}): void {
  if (!params.uid || !params.uid.trim()) {
    throw new HttpsError("unauthenticated", "Project deletion requires an authenticated actor.");
  }
  if (!params.projectId || !params.projectId.trim()) {
    throw new HttpsError("invalid-argument", "Project deletion requires a project id.");
  }
}

function buildProjectDestructiveAuditRecord(params: {
  uid: string;
  projectId: string;
  deletedCounts: Record<string, number>;
}): Record<string, unknown> {
  return {
    action: "write_project_delete",
    authority: "user_owned_destructive",
    authorityContractVersion: WRITE_PROJECT_DESTRUCTIVE_AUTHORITY_CONTRACT_VERSION,
    allowedOperation: WRITE_PROJECT_DESTRUCTIVE_OPERATION,
    resourceType: "write_project",
    resourceId: `${params.uid}/${params.projectId}`,
    actorUid: params.uid,
    projectId: params.projectId,
    deletedCounts: params.deletedCounts,
    timestamp: admin.firestore.Timestamp.now(),
    source: "write_project_api",
  };
}

function isAuthoredProjectBook(
  bookData: Record<string, unknown>,
  uid: string,
  projectId: string
): boolean {
  const ownerMatches =
    bookData.ownerId === uid ||
    bookData.ownerUid === uid;
  const projectMatches = bookData.projectId === projectId;
  const source = typeof bookData.source === "string" ? bookData.source : "";
  const bookType = typeof bookData.bookType === "string" ? bookData.bookType : "";

  return (
    ownerMatches &&
    projectMatches &&
    (source === "write_publish" ||
      source === "write_release" ||
      bookType === "authored_native")
  );
}

/**
 * deleteWriteProject
 * Authoritative delete with deterministic cascade cleanup.
 */
export const deleteWriteProject = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const { projectId } = request.data as { projectId?: unknown };

  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }

  const canonicalProjectId = projectId.trim();
  const db = admin.firestore();
  assertWriteProjectDestructiveAuthority({ uid, projectId: canonicalProjectId });

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

    const legacyEditionIds = new Set<string>();
    const legacyBookIds = new Set<string>();
    const publishedEditionIds = new Set<string>();
    const publishedWorkIds = new Set<string>();

    for (const publishedDoc of publishedSnap.docs) {
      const data = publishedDoc.data() as Record<string, unknown>;
      if (typeof data.publishedEditionId === "string" && data.publishedEditionId.trim().length > 0) {
        publishedEditionIds.add(data.publishedEditionId.trim());
      }
      if (typeof data.publishedWorkId === "string" && data.publishedWorkId.trim().length > 0) {
        publishedWorkIds.add(data.publishedWorkId.trim());
      }
      if (typeof data.editionId === "string" && data.editionId.trim().length > 0) {
        legacyEditionIds.add(data.editionId.trim());
      }
      if (typeof data.bookId === "string" && data.bookId.trim().length > 0) {
        legacyBookIds.add(data.bookId.trim());
      }
    }

    const docsToDeleteCount =
      1 +
      (shareSnap.exists ? 1 : 0) +
      (shareToken ? 1 : 0) +
      publishedSnap.size +
      publishOpsSnap.size +
      duplicateOpsSnap.size +
      publishedEditionIds.size +
      publishedWorkIds.size +
      legacyEditionIds.size +
      legacyBookIds.size +
      1;

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
    const deletedCounts = {
      projects: 1,
      shareLinks: shareSnap.exists ? 1 : 0,
      publicShareTokens: shareToken ? 1 : 0,
      publishedBooks: publishedSnap.size,
      publishOps: publishOpsSnap.size,
      duplicateOps: duplicateOpsSnap.size,
      publishedEditions: publishedEditionIds.size,
      publishedWorks: publishedWorkIds.size,
      legacyEditions: legacyEditionIds.size,
      legacyBooks: legacyBookIds.size,
    };
    batch.set(
      db.collection("admin_audit_log").doc(),
      buildProjectDestructiveAuditRecord({
        uid,
        projectId: canonicalProjectId,
        deletedCounts,
      })
    );
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

    for (const publishedEditionId of publishedEditionIds) {
      batch.delete(db.collection("published_editions").doc(publishedEditionId));
    }

    for (const publishedWorkId of publishedWorkIds) {
      batch.delete(db.collection("published_works").doc(publishedWorkId));
    }

    for (const editionId of legacyEditionIds) {
      batch.delete(db.collection("editions").doc(editionId));
    }

    for (const bookId of legacyBookIds) {
      const bookRef = db.collection("books").doc(bookId);
      const bookSnap = await bookRef.get();
      if (!bookSnap.exists) {
        continue;
      }
      const bookData = bookSnap.data() as Record<string, unknown>;
      if (isAuthoredProjectBook(bookData, uid, canonicalProjectId)) {
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
