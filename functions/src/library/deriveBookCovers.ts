import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import sharp from "sharp";
import { performance } from "perf_hooks";

// Authority: Use centralized admin instances to ensure initialization and bucket binding
const db = admin.firestore();
const bucket = admin.storage().bucket();
const COVER_BOOK_WRITE_ALLOWLIST = new Set([
  "cover",
  "coverUrl",
  "coverState",
  "coverFailureReason",
  "coverUpdatedAt",
  "updatedAt",
]);

function assertAllowedCoverBookPatch(
  patch: Record<string, unknown>,
  context: string
): void {
  const unexpectedFields = Object.keys(patch).filter(
    (field) => !COVER_BOOK_WRITE_ALLOWLIST.has(field)
  );
  if (unexpectedFields.length > 0) {
    logger.error("[COVERS][DISALLOWED_BOOK_MUTATION_FIELDS]", {
      context,
      unexpectedFields,
    });
    throw new Error("COVERS_DISALLOWED_BOOK_MUTATION_FIELDS");
  }
}

/**
 * deriveBookCovers
 * ----------------
 * Generates large / medium / small cover images from the original.
 *
 * A3.3 HARDENING NOTES:
 * - Covers are canonical assets (NOT public)
 * - Access must always be via signed URLs
 * - Storage objects carry integrity-ready metadata
 */
export const deriveBookCovers = onDocumentCreated(
  {
    document: "books/{bookId}",
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const start = performance.now();
    const bookId = event.params.bookId;
    const snap = event.data;

    if (!snap) {
      logger.warn("[COVERS] No snapshot data", { bookId });
      return;
    }

    const book = snap.data();
    const cover = book?.cover;

    // Safety checks
    if (!cover?.original) {
      logger.info("[COVERS] Skipped — no original cover", { bookId });
      return;
    }

    if (cover.large && cover.medium && cover.small) {
      logger.info("[COVERS] Skipped — covers already derived", { bookId });
      return;
    }

    const originalPath = cover.original;
    const originalFile = bucket.file(originalPath);

    logger.info("[COVERS] Starting derivation", {
      bookId,
      bucket: bucket.name,
      originalPath,
    });

    try {
      const [originalBuffer] = await originalFile.download();

      const sizes = {
        large: { width: 1200, quality: 82 },
        medium: { width: 600, quality: 80 },
        small: { width: 300, quality: 75 },
      };

      const derivedPaths: Record<string, string> = {};
      const derivedMeta: Record<
        string,
        { bytes: number; contentType: string }
      > = {};

      for (const [size, config] of Object.entries(sizes)) {
        const outputPath = `books/${bookId}/covers/${size}.jpg`;

        const buffer = await sharp(originalBuffer)
          .resize({ width: config.width, withoutEnlargement: true })
          .jpeg({ quality: config.quality, mozjpeg: true })
          .toBuffer();

        logger.info("[COVERS] Writing derived cover", {
          bookId,
          size,
          path: outputPath,
          bytes: buffer.length,
        });

        /**
         * A3.3 STORAGE HARDENING
         * - resumable: false → avoids Cloud Run throttling
         * - private cache control → prevents public CDN exposure
         * - metadata.access = canonical → future-proof rule enforcement
         */
        await bucket.file(outputPath).save(buffer, {
          contentType: "image/jpeg",
          resumable: false,
          metadata: {
            cacheControl: "private, max-age=0, no-transform",
            metadata: {
              access: "canonical",
              assetType: "book-cover",
              bookId,
              size,
            },
          },
        });

        derivedPaths[size] = outputPath;
        derivedMeta[size] = {
          bytes: buffer.length,
          contentType: "image/jpeg",
        };
      }

      const bookPatch: Record<string, unknown> = {
        cover: {
          original: cover.original,
          large: derivedPaths.large,
          medium: derivedPaths.medium,
          small: derivedPaths.small,
        },
        coverState: "READY",
        coverUrl: derivedPaths.medium,
        coverFailureReason: null,
        coverUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      void derivedMeta;
      assertAllowedCoverBookPatch(bookPatch, "deriveBookCovers.ready");

      await db.collection("books").doc(bookId).update(bookPatch);

      logger.info("[COVERS] Completed", {
        bookId,
        durationMs: Math.round(performance.now() - start),
      });
    } catch (error: any) {
      logger.error("[COVERS] Failed", {
        bookId,
        error: error?.message || error,
      });
    }
  }
);
