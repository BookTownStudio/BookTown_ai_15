// functions/src/reader/requestEbookOfflineAccess.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { getOrBuildReaderManifest } from "./readerManifestService";

const db = admin.firestore();
const storage = admin.storage();
const OFFLINE_URL_TTL_MS = 10 * 60 * 1000;

/**
 * requestEbookOfflineAccess
 *
 * 🔒 AUTHORITATIVE OFFLINE ACCESS GATE
 *
 * Contract:
 * - User must be authenticated
 * - Book must exist and be readable by user
 * - Offline eligibility is SERVER-DECIDED
 * - Returns short-lived signed URL + offline policy
 *
 * Client receives:
 * - signedUrl (temporary)
 * - expiresAt
 * - checksum (if available)
 * - maxBytes
 * - format
 */
export const requestEbookOfflineAccess = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;
    const { bookId } = request.data || {};

    if (!bookId || typeof bookId !== "string") {
      throw new HttpsError("invalid-argument", "Invalid bookId.");
    }

    logger.info("[OFFLINE][REQUEST]", { uid, bookId });

    const manifest = await getOrBuildReaderManifest({
      uid,
      bookId,
    });
    const file = storage.bucket().file(manifest.storagePath);
    const [exists] = await file.exists();

    if (!exists) {
      throw new HttpsError("not-found", "Ebook file missing from storage.");
    }

    const [fileMetadata] = await file.getMetadata();

    /**
     * 🔒 OFFLINE ELIGIBILITY (LOCKED RULES)
     */
    if (manifest.format === "unknown") {
      throw new HttpsError(
        "failed-precondition",
        "This ebook is not available for offline reading."
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
    let signedUrl: string;
    try {
      const [issuedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + OFFLINE_URL_TTL_MS,
      });
      signedUrl = issuedUrl;
    } catch (error) {
      logger.error("[OFFLINE][SIGNED_URL_ISSUE_FAILED]", {
        uid,
        bookId,
        storagePath: manifest.storagePath,
        error: String(error),
      });
      throw new HttpsError(
        "internal",
        "Reader URL signing is not configured for this environment."
      );
    }

    /**
     * 🔒 SERVER STATE WRITE
     */
    await db.collection("reading_sessions").doc(`${uid}_${bookId}`).set(
      {
        offline: {
          state: "AVAILABLE",
          grantedAt: FieldValue.serverTimestamp(),
          expiresAt,
          storagePath: manifest.storagePath,
          manifestVersion: manifest.version,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    logger.info("[OFFLINE][GRANTED]", {
      uid,
      bookId,
      expiresAt: expiresAt.toDate().toISOString(),
      format: manifest.format,
    });

    const maxBytesRaw =
      typeof fileMetadata.size === "string" ? Number(fileMetadata.size) : fileMetadata.size;
    const maxBytes =
      typeof maxBytesRaw === "number" && Number.isFinite(maxBytesRaw) && maxBytesRaw > 0
        ? Math.trunc(maxBytesRaw)
        : null;

    const customMetadata =
      fileMetadata.metadata && typeof fileMetadata.metadata === "object"
        ? (fileMetadata.metadata as Record<string, unknown>)
        : {};
    const sha256Checksum =
      typeof customMetadata.checksum === "string" &&
      /^[a-f0-9]{64}$/i.test(customMetadata.checksum)
        ? customMetadata.checksum.toLowerCase()
        : null;

    return {
      bookId,
      format: manifest.format,
      signedUrl,
      expiresAt: expiresAt.toMillis(),
      checksum: sha256Checksum,
      maxBytes,
    };
  }
);
