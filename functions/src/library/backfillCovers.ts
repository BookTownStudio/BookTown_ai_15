// functions/src/library/backfillCovers.ts

import { onCall } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { Buffer } from "buffer";

const db = admin.firestore();
const bucket = admin.storage().bucket();

const MIN_UPGRADE_GAIN = 1.3; // New image must be 30% larger

// Reuse the exact same logic you already approved:
import {
  upgradeGoogleCoverCandidates,
  upgradeOpenLibraryCandidates,
  fetchFirstValid
} from "./ingestBook"; // (or extract helpers to shared file if you prefer)

// FIX: Added cors configuration to onCall for consistency with other Cloud Functions.
export const backfillCovers = onCall({ cors: true }, async (request) => {
  if (!request.auth?.token?.admin) {
    throw new Error("Admin only");
  }

  const limit = Number(request.data?.limit ?? 20);

  const snapshot = await db
    .collection("books")
    .orderBy("updatedAt", "asc")
    .limit(limit)
    .get();

  let upgraded = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const book = doc.data();
    const bookId = doc.id;

    try {
      const externalId = book.externalId;
      const source = book.source;
      const rawBook = book.rawBook || {}; // fallback

      const coverPath = book.cover?.original;
      let currentSize = 0;

      if (coverPath) {
        try {
          const file = bucket.file(coverPath);
          const [meta] = await file.getMetadata();
          currentSize = Number(meta.size || 0);
        } catch {}
      }

      let buffer: Buffer | null = null;

      if (source === "googleBooks") {
        buffer = await fetchFirstValid(upgradeGoogleCoverCandidates(rawBook));
      }

      if (source === "openLibrary" && !buffer) {
        buffer = await fetchFirstValid(upgradeOpenLibraryCandidates(rawBook, externalId));
      }

      if (!buffer) {
        skipped++;
        continue;
      }

      if (currentSize && buffer.length < currentSize * MIN_UPGRADE_GAIN) {
        skipped++;
        continue;
      }

      const basePath = `books/${bookId}/covers`;
      const filePath = `${basePath}/original.jpg`;

      await bucket.file(filePath).save(buffer, {
        contentType: "image/jpeg",
        resumable: false,
        metadata: { cacheControl: "public, max-age=31536000" },
      });

      await doc.ref.update({
        ingestionStatus: "upgraded",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      upgraded++;
      logger.info(`[BACKFILL] Upgraded cover`, { bookId, size: buffer.length });

    } catch (err) {
      logger.error(`[BACKFILL] Failed`, { bookId, err });
    }
  }

  return { processed: snapshot.size, upgraded, skipped };
});