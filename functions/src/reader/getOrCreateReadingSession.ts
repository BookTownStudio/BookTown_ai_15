import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { getOrBuildReaderManifest } from "./readerManifestService";

const db = admin.firestore();
const storage = admin.storage();
const READER_URL_TTL_MS = 10 * 60 * 1000;

function resolveResumePage(lastPosition: unknown): number {
  if (typeof lastPosition === "number" && Number.isFinite(lastPosition)) {
    return Math.max(1, Math.trunc(lastPosition));
  }

  if (lastPosition && typeof lastPosition === "object") {
    const page = (lastPosition as { page?: unknown }).page;
    if (typeof page === "number" && Number.isFinite(page)) {
      return Math.max(1, Math.trunc(page));
    }
  }

  return 1;
}

/**
 * Canonical Reader Session (V3)
 * - Resolves through server-built reader manifest
 * - Issues short-lived signed URL
 * - Returns deterministic resume page + format
 */
export const getOrCreateReadingSessionHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const { bookId } = request.data || {};
  const uid = request.auth.uid;

  if (!bookId || typeof bookId !== "string") {
    throw new HttpsError("invalid-argument", "bookId is required");
  }

  logger.info("[READER][SESSION_INIT_REQUEST]", {
    uid,
    bookId,
  });

  const sessionId = `${uid}_${bookId}`;
  const sessionRef = db.collection("reading_sessions").doc(sessionId);
  const progressRef = db.collection("reading_progress").doc(`${uid}_${bookId}`);

  try {
    const [manifest, progressSnap] = await Promise.all([
      getOrBuildReaderManifest({
        uid,
        bookId,
      }),
      progressRef.get(),
    ]);

    const file = storage.bucket().file(manifest.storagePath);
    const [exists] = await file.exists();
    if (!exists) {
      logger.error("[READER][MISSING_STORAGE_FILE]", {
        uid,
        bookId,
        storagePath: manifest.storagePath,
      });
      throw new HttpsError("not-found", "Ebook file missing from storage.");
    }

    let signedUrl: string;
    try {
      const [issuedUrl] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + READER_URL_TTL_MS,
      });
      signedUrl = issuedUrl;
    } catch (error) {
      logger.error("[READER][SIGNED_URL_ISSUE_FAILED]", {
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

    const progressData = progressSnap.exists
      ? (progressSnap.data() as { lastPosition?: unknown } | undefined)
      : null;

    const resumePage = resolveResumePage(progressData?.lastPosition);
    const now = FieldValue.serverTimestamp();

    await sessionRef.set(
      {
        userId: uid,
        bookId,
        status: "reading",
        resumePage,
        format: manifest.format,
        manifestVersion: manifest.version,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );

    logger.info("[READER][SESSION_READY]", {
      uid,
      bookId,
      sessionId,
      resumePage,
      format: manifest.format,
      manifestVersion: manifest.version,
    });

    return {
      signedUrl,
      resumePage,
      format: manifest.format,
    };
  } catch (error: any) {
    logger.error("[READER][SESSION_INIT_FAILED]", {
      uid,
      bookId,
      error: String(error?.message || error),
      code: error instanceof HttpsError ? error.code : "internal",
    });
    throw error;
  }
};

export const getOrCreateReadingSession = onCall(
  { cors: true },
  getOrCreateReadingSessionHandler
);
