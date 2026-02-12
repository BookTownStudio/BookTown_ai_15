import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { v4 as uuidv4 } from "uuid";
import { Buffer } from "buffer";

import { evaluatePublicDomainStatus } from "./policy/publicDomainPolicy";
import { buildCanonicalKey } from "./persistence/canonicalKey"; // 🔒 A6.1

const db = admin.firestore();
const bucket = admin.storage().bucket();

interface IngestionRequest {
  bookId: string;
  source: "googleBooks" | "openLibrary";
  rawBook: any;
}

// -------------------------------------------------
// A2.7 — Ingestion lifecycle & failure classification
// -------------------------------------------------

enum IngestionState {
  RECEIVED = "RECEIVED",
  MATERIALIZING = "MATERIALIZING",
  COMPLETE = "COMPLETE",
  FAILED_RETRYABLE = "FAILED_RETRYABLE",
  FAILED_FATAL = "FAILED_FATAL",
}

enum IngestionFailureType {
  RETRYABLE = "retryable",
  FATAL = "fatal",
}

function classifyIngestionError(err: any): IngestionFailureType {
  if (!err) return IngestionFailureType.FATAL;

  const message = String(err.message || err);

  if (
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("ECONNRESET")
  ) {
    return IngestionFailureType.RETRYABLE;
  }

  return IngestionFailureType.FATAL;
}

/**
 * upgradeGoogleCoverCandidates
 */
export function upgradeGoogleCoverCandidates(rawBook: any): string[] {
  const thumb =
    rawBook?.imageLinks?.thumbnail ||
    rawBook?.coverUrl ||
    rawBook?.thumbnail ||
    rawBook?.coverImages?.large ||
    rawBook?.coverImages?.medium ||
    rawBook?.coverImages?.small;

  if (!thumb) return [];

  const https = String(thumb).replace("http:", "https:");

  const candidates = [
    https.replace(/zoom=\d/, "zoom=0"),
    https + "&fife=w1600",
    https + "&fife=w1200",
    https + "&fife=w800",
    https,
  ];

  return Array.from(new Set(candidates.filter(Boolean)));
}

/**
 * upgradeOpenLibraryCandidates
 */
export function upgradeOpenLibraryCandidates(
  rawBook: any,
  externalId: string
): string[] {
  return [
    `https://covers.openlibrary.org/b/olid/${externalId}-L.jpg`,
    `https://covers.openlibrary.org/b/olid/${externalId}-M.jpg`,
    `https://covers.openlibrary.org/b/olid/${externalId}-S.jpg`,
  ];
}

/**
 * fetchFirstValid (instrumented)
 */
export async function fetchFirstValid(
  urls: string[]
): Promise<Buffer | null> {
  logger.info("[FETCH] Starting candidate evaluation", {
    count: urls.length,
  });

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 BookTownBot/1.0",
          Accept: "image/*,*/*",
        },
      });

      if (!res.ok) continue;

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 10_000) return buffer;
    } catch (err) {
      logger.error("[FETCH] Failed", { url, err: String(err) });
    }
  }

  return null;
}

export const ingestBook = onCall<IngestionRequest>(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Auth required.");
    }

    const payload =
      request.data &&
      typeof request.data === "object" &&
      "data" in request.data
        ? (request.data as any).data
        : request.data;

    const { bookId: clientBookId, source: sourceRaw, rawBook } =
      payload || {};
    const source = normalizeSource(sourceRaw);

    if (!clientBookId || !source || !rawBook) {
      throw new HttpsError(
        "invalid-argument",
        "Missing or invalid parameters."
      );
    }

    const title = rawBook.titleEn || rawBook.title || "Untitled";
    const author =
      rawBook.authorEn ||
      (Array.isArray(rawBook.authors) && rawBook.authors[0]) ||
      rawBook.author ||
      "Unknown";

    const publicationYear =
      rawBook.publicationYear ||
      rawBook.firstPublishYear ||
      rawBook.publishedDate?.slice(0, 4) ||
      null;

    const canonicalKey = buildCanonicalKey({
      title,
      author,
    }); // 🔒 A6.1 — authoritative identity

    const externalId = String(clientBookId).replace(/^(gb_|ol_)/, "");
    const externalKey = `${source}:${externalId}`;

    const ingestionRef = db
      .collection("bookIngestions")
      .doc(externalKey);

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ingestionRef);
        if (snap.exists) return;

        tx.set(ingestionRef, {
          ingestionId: ingestionRef.id,
          externalKey,
          source,
          bookId: null,
          state: IngestionState.RECEIVED,
          retryCount: 0,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });

      const publicDomainResult = evaluatePublicDomainStatus({
        title,
        authors: [author],
        publicationYear,
        source,
        sourcePublicDomainFlag: rawBook.publicDomain,
        rights: rawBook.rights,
        language: rawBook.language,
      });

      const orphanBook = await db
        .collection("books")
        .where("externalKey", "==", externalKey)
        .limit(1)
        .get();

      const bookId = !orphanBook.empty
        ? orphanBook.docs[0].id
        : uuidv4();

      let buffer: Buffer | null = null;

      if (source === "googleBooks") {
        buffer = await fetchFirstValid(
          upgradeGoogleCoverCandidates(rawBook)
        );
      }

      if (source === "openLibrary" && !buffer) {
        buffer = await fetchFirstValid(
          upgradeOpenLibraryCandidates(rawBook, externalId)
        );
      }

      const coverPath = buffer
        ? `books/${bookId}/covers/original.jpg`
        : null;

      if (buffer && coverPath) {
        await bucket.file(coverPath).save(buffer, {
          contentType: "image/jpeg",
          resumable: false,
        });
      }

      await db.runTransaction(async (tx) => {
        const now = FieldValue.serverTimestamp();

        tx.set(
          db.collection("books").doc(bookId),
          {
            id: bookId,
            externalKey,
            canonicalKey,
            source,
            externalId,
            title,
            author,
            description: rawBook.description || "",
            cover: {
              original: coverPath,
              large: coverPath,
              medium: coverPath,
              small: coverPath,
            },
            createdAt: now,
            updatedAt: now,
            ingestionState: IngestionState.COMPLETE,
            ingestionStatus: buffer
              ? "complete"
              : "metadata_only",
          },
          { merge: true }
        );

        tx.set(
          db.collection("editions").doc(bookId),
          {
            id: bookId,
            externalKey,
            canonicalKey,
            titleEn: title,
            authorEn: author,
            description: rawBook.description || "",
            source,
            externalId,
            publicDomain: publicDomainResult.isPublicDomain,
            publicDomainReason: publicDomainResult.reason,
            publicDomainEvaluatedAt: now,
            createdAt: now,
            updatedAt: now,
            visibility: "public",
            status: "active",
          },
          { merge: true }
        );

        tx.set(
          ingestionRef,
          {
            bookId,
            state: IngestionState.COMPLETE,
            updatedAt: now,
          },
          { merge: true }
        );
      });

      return {
        bookId,
        editionId: bookId,
        status: buffer ? "MATERIALIZED" : "NO_COVER",
      };
    } catch (err) {
      const failureType = classifyIngestionError(err);

      await ingestionRef.set(
        {
          state:
            failureType === IngestionFailureType.RETRYABLE
              ? IngestionState.FAILED_RETRYABLE
              : IngestionState.FAILED_FATAL,
          lastError: String(err),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      throw new HttpsError(
        "internal",
        failureType === IngestionFailureType.RETRYABLE
          ? "Temporary ingestion failure"
          : "Fatal ingestion failure"
      );
    }
  }
);

function normalizeSource(
  input: any
): "googleBooks" | "openLibrary" | null {
  const s = String(input || "").trim();
  if (
    ["googleBooks", "google_books", "googlebooks"].includes(s)
  )
    return "googleBooks";
  if (
    ["openLibrary", "open_library", "openlibrary"].includes(s)
  )
    return "openLibrary";
  return null;
}
