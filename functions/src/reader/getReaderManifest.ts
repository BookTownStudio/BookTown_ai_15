import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {
  getOrBuildReaderManifest,
  toPublicReaderManifest,
} from "./readerManifestService";

export const getReaderManifestHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const uid = request.auth.uid;
  const bookId = request.data?.bookId;

  if (!bookId || typeof bookId !== "string") {
    throw new HttpsError("invalid-argument", "bookId is required");
  }

  logger.info("[READER][MANIFEST_REQUEST]", {
    uid,
    bookId,
  });

  try {
    const manifest = await getOrBuildReaderManifest({
      uid,
      bookId,
    });

    const publicManifest = toPublicReaderManifest(manifest);

    logger.info("[READER][MANIFEST_READY]", {
      uid,
      bookId,
      version: publicManifest.version,
      format: publicManifest.format,
      pipelineVersion: publicManifest.pipelineVersion,
    });

    return publicManifest;
  } catch (error: any) {
    logger.error("[READER][MANIFEST_FAILED]", {
      uid,
      bookId,
      error: String(error?.message || error),
      code: error instanceof HttpsError ? error.code : "internal",
    });
    throw error;
  }
};

export const getReaderManifest = onCall({ cors: true }, getReaderManifestHandler);
