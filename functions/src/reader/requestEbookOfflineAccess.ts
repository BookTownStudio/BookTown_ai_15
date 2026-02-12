// functions/src/reader/requestEbookOfflineAccess.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { getSignedUrl } from "../attachments/storageSignedUrl";

const db = admin.firestore();

/**
 * requestEbookOfflineAccess
 *
 * 🔒 AUTHORITATIVE OFFLINE ACCESS GATE
 *
 * Contract:
 * - User must be authenticated
 * - Ebook must exist and be readable by user
 * - Offline eligibility is SERVER-DECIDED
 * - Returns short-lived signed URL + offline policy
 *
 * Client receives:
 * - signedUrl (temporary)
 * - expiresAt
 * - checksum (if available)
 * - maxBytes
 */
export const requestEbookOfflineAccess = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;
    const { ebookId } = request.data || {};

    if (!ebookId || typeof ebookId !== "string") {
      throw new HttpsError("invalid-argument", "Invalid ebookId.");
    }

    logger.info("[OFFLINE][REQUEST]", { uid, ebookId });

    const ebookRef = db.collection("ebooks").doc(ebookId);
    const ebookSnap = await ebookRef.get();

    if (!ebookSnap.exists) {
      throw new HttpsError("not-found", "Ebook not found.");
    }

    const ebook = ebookSnap.data();
    if (!ebook) {
      throw new HttpsError("internal", "Ebook record corrupted.");
    }

    /**
     * 🔒 ACCESS CONTROL
     */
    if (
      ebook.visibility === "private" &&
      ebook.ownerUid !== uid
    ) {
      throw new HttpsError("permission-denied", "Access denied.");
    }

    /**
     * 🔒 OFFLINE ELIGIBILITY (LOCKED RULES)
     */
    if (!ebook.downloadable) {
      throw new HttpsError(
        "failed-precondition",
        "This ebook is not available for offline reading."
      );
    }

    if (!ebook.storagePath || typeof ebook.storagePath !== "string") {
      throw new HttpsError(
        "failed-precondition",
        "Ebook storage path missing."
      );
    }

    /**
     * 🔒 OFFLINE POLICY (SERVER-OWNED)
     */
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(
      now.toMillis() + 7 * 24 * 60 * 60 * 1000 // 7 days
    );

    /**
     * 🔒 SIGNED URL (INTENT-BASED)
     */
    const signedUrl = await getSignedUrl({
      bucket: admin.storage().bucket().name,
      path: ebook.storagePath,
      intent: "ebook",
    });

    /**
     * 🔒 SERVER STATE WRITE
     */
    await ebookRef.set(
      {
        offline: {
          state: "AVAILABLE",
          grantedTo: uid,
          grantedAt: FieldValue.serverTimestamp(),
          expiresAt,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logger.info("[OFFLINE][GRANTED]", {
      uid,
      ebookId,
      expiresAt: expiresAt.toDate().toISOString(),
    });

    return {
      ebookId,
      signedUrl,
      expiresAt: expiresAt.toMillis(),
      checksum: ebook.checksum ?? null,
      maxBytes: ebook.bytes ?? null,
    };
  }
);
