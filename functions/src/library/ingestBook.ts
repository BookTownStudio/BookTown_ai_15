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

const SEARCH_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

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

function resolveDescription(rawBook: any): string {
  return (
    rawBook?.descriptionEn ||
    rawBook?.description ||
    rawBook?.summary ||
    ""
  );
}

function normalizeSearchText(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearch(value?: string | null): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length > 1 && !SEARCH_STOPWORDS.has(token));
}

function computeServerVerifiedDownloadable(rawBook: any): boolean {
  const attachmentId =
    typeof rawBook?.ebookAttachmentId === "string"
      ? rawBook.ebookAttachmentId.trim()
      : "";
  const storagePath =
    typeof rawBook?.ebookStoragePath === "string"
      ? rawBook.ebookStoragePath.trim()
      : "";
  return attachmentId.length > 0 || storagePath.length > 0;
}

function resolveCoverUrl(rawBook: any): string | null {
  const url =
    rawBook?.coverUrl ||
    rawBook?.thumbnail ||
    rawBook?.imageLinks?.thumbnail ||
    rawBook?.coverImages?.large ||
    rawBook?.coverImages?.medium ||
    rawBook?.coverImages?.small ||
    null;

  if (!url) return null;
  return String(url).replace("http:", "https:");
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
  const explicitCover =
    rawBook?.coverUrl ||
    rawBook?.thumbnail ||
    rawBook?.coverImages?.large ||
    rawBook?.coverImages?.medium ||
    rawBook?.coverImages?.small ||
    null;

  const coverId =
    rawBook?.coverId ||
    rawBook?.cover_i ||
    null;

  const candidates = [
    explicitCover ? String(explicitCover).replace("http:", "https:") : null,
    explicitCover && /-M\.(jpg|jpeg|png)$/i.test(String(explicitCover))
      ? String(explicitCover).replace(/-M(\.(jpg|jpeg|png))$/i, "-L$1")
      : null,
    coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
    coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : null,
    coverId ? `https://covers.openlibrary.org/b/id/${coverId}-S.jpg` : null,
    `https://covers.openlibrary.org/b/olid/${externalId}-L.jpg`,
    `https://covers.openlibrary.org/b/olid/${externalId}-M.jpg`,
    `https://covers.openlibrary.org/b/olid/${externalId}-S.jpg`,
  ];

  return Array.from(new Set(candidates.filter(Boolean))) as string[];
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

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) continue;

      const buffer = Buffer.from(await res.arrayBuffer());
      // Accept smaller but still meaningful images (many provider thumbnails are <10KB).
      if (buffer.length >= 1_000) return buffer;
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
    const authors: string[] = Array.isArray(rawBook.authors)
      ? rawBook.authors
          .filter((v: unknown) => typeof v === "string")
          .map((v: string) => v.trim())
          .filter(Boolean)
      : [];
    const author =
      rawBook.authorEn ||
      authors[0] ||
      rawBook.author ||
      "Unknown";
    const effectiveAuthors = authors.length > 0 ? authors : [author];
    const description = resolveDescription(rawBook);
    const fallbackCoverUrl = resolveCoverUrl(rawBook);
    const downloadable = computeServerVerifiedDownloadable(rawBook);
    const hasEbook = downloadable;
    const searchTitleNormalized = normalizeSearchText(title);
    const searchAuthorNormalized = normalizeSearchText(effectiveAuthors.join(" "));
    const searchTokens = Array.from(
      new Set([
        ...tokenizeSearch(title),
        ...effectiveAuthors.flatMap((entry) => tokenizeSearch(entry)),
      ])
    );

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
        authors: effectiveAuthors,
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
      const persistedCoverValue = coverPath || fallbackCoverUrl;

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
            titleEn: rawBook.titleEn || title,
            titleAr: rawBook.titleAr || "",
            author,
            authorEn: rawBook.authorEn || author,
            authorAr: rawBook.authorAr || "",
            authors: effectiveAuthors,
            description,
            descriptionEn: rawBook.descriptionEn || description,
            descriptionAr: rawBook.descriptionAr || "",
            coverUrl: fallbackCoverUrl,
            cover: {
              original: persistedCoverValue,
              large: persistedCoverValue,
              medium: persistedCoverValue,
              small: persistedCoverValue,
            },
            isEbookAvailable: hasEbook,
            hasEbook,
            downloadable,
            searchTitleNormalized,
            searchAuthorNormalized,
            searchTokens,
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
            titleAr: rawBook.titleAr || "",
            title,
            authorEn: author,
            authorAr: rawBook.authorAr || "",
            authors: effectiveAuthors,
            description,
            descriptionEn: rawBook.descriptionEn || description,
            descriptionAr: rawBook.descriptionAr || "",
            source,
            externalId,
            coverUrl: fallbackCoverUrl,
            isEbookAvailable: hasEbook,
            hasEbook,
            downloadable,
            searchTitleNormalized,
            searchAuthorNormalized,
            searchTokens,
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
