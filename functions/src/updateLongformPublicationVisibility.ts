import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "./firebaseAdmin";
import { assertActiveAuthenticatedUser } from "./shared/auth";
import { normalizePublicationVisibility, type PublicationVisibility } from "./rights/bookRights";

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

function normalizeRequestedVisibility(value: unknown): PublicationVisibility {
  const normalized = normalizePublicationVisibility(value, "public");
  if (value !== "public" && value !== "private") {
    throw new HttpsError("invalid-argument", "A valid visibility is required.");
  }
  return normalized;
}

export const updateLongformPublicationVisibility = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const publicationId = normalizePublicationId(
    (request.data as { publicationId?: unknown }).publicationId
  );
  const visibility = normalizeRequestedVisibility(
    (request.data as { visibility?: unknown }).visibility
  );
  const db = admin.firestore();
  const publicationRef = db.collection("longform_publications").doc(publicationId);

  try {
    const result = await db.runTransaction(async (tx) => {
      const publicationSnap = await tx.get(publicationRef);
      if (!publicationSnap.exists) {
        throw new HttpsError("not-found", "Publication not found.");
      }

      const publication = (publicationSnap.data() ?? {}) as Record<string, unknown>;
      const ownerUid = asNonEmptyString(publication.ownerUid, 256);
      if (!ownerUid || ownerUid !== caller.uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the publication owner can update visibility."
        );
      }

      const now = FieldValue.serverTimestamp();
      tx.set(
        publicationRef,
        {
          visibility,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        publicationId,
        visibility,
      };
    });

    logger.info("[PUBLISH][LONGFORM_VISIBILITY_UPDATED]", {
      uid: caller.uid,
      publicationId: result.publicationId,
      visibility: result.visibility,
    });

    return result;
  } catch (error) {
    logger.error("[PUBLISH][LONGFORM_VISIBILITY_UPDATE_FAILED]", {
      uid: caller.uid,
      publicationId,
      visibility,
      error,
    });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to update publication visibility.");
  }
});
