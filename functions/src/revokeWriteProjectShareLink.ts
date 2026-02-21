import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { assertActiveAuthenticatedUser } from "./shared/auth";

type RevokeResult = {
  projectId: string;
  revoked: boolean;
  revokedAt: string | null;
};

/**
 * revokeWriteProjectShareLink
 * Revokes active share link for a write project.
 */
export const revokeWriteProjectShareLink = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const { projectId } = request.data as {
    projectId?: unknown;
  };

  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }

  const canonicalProjectId = projectId.trim();
  const db = admin.firestore();

  const projectRef = db.collection("users").doc(uid).collection("projects").doc(canonicalProjectId);
  const shareRef = db
    .collection("users")
    .doc(uid)
    .collection("project_share_links")
    .doc(canonicalProjectId);

  try {
    const result = await db.runTransaction<RevokeResult>(async (tx) => {
      const projectSnap = await tx.get(projectRef);
      if (!projectSnap.exists) {
        throw new HttpsError("not-found", "Project was not found.");
      }

      const now = admin.firestore.Timestamp.now();
      const nowIso = now.toDate().toISOString();

      const shareSnap = await tx.get(shareRef);
      if (!shareSnap.exists) {
        tx.set(
          projectRef,
          {
            shareEnabled: false,
            shareUpdatedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );

        return {
          projectId: canonicalProjectId,
          revoked: false,
          revokedAt: null,
        };
      }

      const share = shareSnap.data() as Record<string, unknown>;
      const token =
        typeof share.token === "string" && share.token.trim().length > 0
          ? share.token.trim()
          : null;

      tx.set(
        shareRef,
        {
          isRevoked: true,
          revokedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      if (token) {
        tx.set(
          db.collection("write_project_shares").doc(token),
          {
            isRevoked: true,
            revokedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
      }

      tx.set(
        projectRef,
        {
          shareEnabled: false,
          shareToken: admin.firestore.FieldValue.delete(),
          shareUpdatedAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        projectId: canonicalProjectId,
        revoked: true,
        revokedAt: nowIso,
      };
    });

    return result;
  } catch (error) {
    logger.error("[WRITE][SHARE_LINK_REVOKE_FAILED]", {
      uid,
      projectId: canonicalProjectId,
      error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to revoke project share link.");
  }
});
