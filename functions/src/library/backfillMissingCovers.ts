import {
  CallableRequest,
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import sharp from "sharp";
import {
  fetchFirstValid,
  upgradeGoogleCoverCandidates,
  upgradeOpenLibraryCandidates,
} from "./ingestBook";

const db = admin.firestore();
const bucket = admin.storage().bucket();

type SupportedSource = "googleBooks" | "openLibrary";
type CoverSize = "original" | "large" | "medium" | "small";
type DerivedCoverSize = Exclude<CoverSize, "original">;

interface CoverPaths {
  original: string;
  large: string;
  medium: string;
  small: string;
}

const DERIVED_CONFIG: Record<DerivedCoverSize, { width: number; quality: number }> = {
  large: { width: 1200, quality: 82 },
  medium: { width: 600, quality: 80 },
  small: { width: 300, quality: 75 },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSource(value: unknown): SupportedSource | null {
  const source = asNonEmptyString(value);
  if (!source) return null;
  if (source === "googleBooks") return "googleBooks";
  if (source === "openLibrary") return "openLibrary";
  return null;
}

function isStorageCoverPath(path: string, bookId: string): boolean {
  return path.startsWith(`books/${bookId}/covers/`);
}

function normalizeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) return null;
  return value.replace(/^http:\/\//i, "https://");
}

function extractExternalId(
  source: SupportedSource,
  data: Record<string, unknown>
): string | null {
  const explicitId = asNonEmptyString(data.externalId);
  if (explicitId) return explicitId;

  const externalKey = asNonEmptyString(data.externalKey);
  if (!externalKey) return null;

  const [keySource, keyId] = externalKey.split(":", 2);
  if (keySource !== source) return null;
  return keyId && keyId.trim().length > 0 ? keyId.trim() : null;
}

function extractOpenLibraryCoverId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/b\/id\/(\d+)-/i);
  return match?.[1] ?? null;
}

function resolveCoverPaths(
  bookId: string,
  coverData: Record<string, unknown> | null
): CoverPaths {
  const originalCandidate = asNonEmptyString(coverData?.original);
  const largeCandidate = asNonEmptyString(coverData?.large);
  const mediumCandidate = asNonEmptyString(coverData?.medium);
  const smallCandidate = asNonEmptyString(coverData?.small);

  const fallbackOriginal = `books/${bookId}/covers/original.jpg`;
  const fallbackLarge = `books/${bookId}/covers/large.jpg`;
  const fallbackMedium = `books/${bookId}/covers/medium.jpg`;
  const fallbackSmall = `books/${bookId}/covers/small.jpg`;

  return {
    original:
      originalCandidate && isStorageCoverPath(originalCandidate, bookId)
        ? originalCandidate
        : fallbackOriginal,
    large:
      largeCandidate && isStorageCoverPath(largeCandidate, bookId)
        ? largeCandidate
        : fallbackLarge,
    medium:
      mediumCandidate && isStorageCoverPath(mediumCandidate, bookId)
        ? mediumCandidate
        : fallbackMedium,
    small:
      smallCandidate && isStorageCoverPath(smallCandidate, bookId)
        ? smallCandidate
        : fallbackSmall,
  };
}

function hasStorageCoverRelation(
  bookId: string,
  coverData: Record<string, unknown> | null
): boolean {
  if (!coverData) return false;
  const values = [
    asNonEmptyString(coverData.original),
    asNonEmptyString(coverData.large),
    asNonEmptyString(coverData.medium),
    asNonEmptyString(coverData.small),
  ];
  return values.some(
    (value) => value !== null && isStorageCoverPath(value, bookId)
  );
}

function needsCoverRelationUpdate(
  coverData: Record<string, unknown> | null,
  resolved: CoverPaths
): boolean {
  return (
    asNonEmptyString(coverData?.original) !== resolved.original ||
    asNonEmptyString(coverData?.large) !== resolved.large ||
    asNonEmptyString(coverData?.medium) !== resolved.medium ||
    asNonEmptyString(coverData?.small) !== resolved.small
  );
}

function collectCandidateUrls(
  source: SupportedSource,
  externalId: string,
  data: Record<string, unknown>
): string[] {
  const rawBook = asRecord(data.rawBook) ?? {};
  const coverData = asRecord(data.cover);

  const fallbackCoverUrl =
    asNonEmptyString(rawBook.coverUrl) ||
    asNonEmptyString(data.coverUrl) ||
    asNonEmptyString(coverData?.original) ||
    asNonEmptyString(coverData?.large) ||
    asNonEmptyString(coverData?.medium) ||
    asNonEmptyString(coverData?.small);

  const sourceInput: Record<string, unknown> = { ...rawBook };

  if (!asNonEmptyString(sourceInput.coverUrl) && fallbackCoverUrl) {
    sourceInput.coverUrl = fallbackCoverUrl;
  }
  if (!asNonEmptyString(sourceInput.thumbnail) && fallbackCoverUrl) {
    sourceInput.thumbnail = fallbackCoverUrl;
  }

  if (source === "openLibrary" && !asNonEmptyString(sourceInput.coverId)) {
    const derivedCoverId = extractOpenLibraryCoverId(fallbackCoverUrl);
    if (derivedCoverId) {
      sourceInput.coverId = derivedCoverId;
    }
  }

  const sourceCandidates =
    source === "googleBooks"
      ? upgradeGoogleCoverCandidates(sourceInput)
      : upgradeOpenLibraryCandidates(sourceInput, externalId);

  const directCandidates = [
    fallbackCoverUrl,
    asNonEmptyString(data.coverUrl),
    asNonEmptyString(coverData?.original),
    asNonEmptyString(coverData?.large),
    asNonEmptyString(coverData?.medium),
    asNonEmptyString(coverData?.small),
  ];

  const normalized = [...sourceCandidates, ...directCandidates]
    .map((value) => normalizeHttpUrl(value ?? null))
    .filter((value): value is string => Boolean(value));

  const unique = new Set<string>();
  const ordered: string[] = [];
  for (const url of normalized) {
    if (unique.has(url)) continue;
    unique.add(url);
    ordered.push(url);
  }

  return ordered;
}

function googleIdBasedCandidates(externalId: string): string[] {
  const id = encodeURIComponent(externalId);
  return [
    `https://books.google.com/books/content?id=${id}&printsec=frontcover&img=1&zoom=0&source=gbs_api`,
    `https://books.google.com/books/content?id=${id}&printsec=frontcover&img=1&zoom=1&source=gbs_api`,
    `https://books.google.com/books/content?id=${id}&printsec=frontcover&img=1&zoom=2&source=gbs_api`,
  ];
}

async function fetchGoogleVolumeCandidates(externalId: string): Promise<string[]> {
  const id = encodeURIComponent(externalId);
  const url = `https://www.googleapis.com/books/v1/volumes/${id}`;

  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return [];

    const payload = (await res.json()) as Record<string, unknown>;
    const volumeInfo = asRecord(payload.volumeInfo) ?? {};

    return upgradeGoogleCoverCandidates({
      imageLinks: asRecord(volumeInfo.imageLinks) ?? undefined,
      coverUrl: asNonEmptyString(volumeInfo.thumbnail) ?? undefined,
      thumbnail: asNonEmptyString(volumeInfo.thumbnail) ?? undefined,
    });
  } catch (error) {
    logger.warn("[MISSING_COVERS][GOOGLE_VOLUME_LOOKUP_FAILED]", {
      externalId,
      error: String(error),
    });
    return [];
  }
}

async function loadEditionData(
  bookId: string,
  externalKey: string | null
): Promise<Record<string, unknown> | null> {
  const direct = await db.collection("editions").doc(bookId).get();
  if (direct.exists) {
    return (direct.data() as Record<string, unknown>) ?? null;
  }

  if (!externalKey) return null;

  const byExternalKey = await db
    .collection("editions")
    .where("externalKey", "==", externalKey)
    .limit(1)
    .get();

  if (byExternalKey.empty) return null;
  return (byExternalKey.docs[0].data() as Record<string, unknown>) ?? null;
}

async function resizeDerived(
  originalBuffer: Buffer,
  size: DerivedCoverSize
): Promise<Buffer> {
  const config = DERIVED_CONFIG[size];
  return sharp(originalBuffer)
    .resize({ width: config.width, withoutEnlargement: true })
    .jpeg({ quality: config.quality, mozjpeg: true })
    .toBuffer();
}

async function storageFileExists(path: string): Promise<boolean> {
  const [exists] = await bucket.file(path).exists();
  return exists;
}

async function saveCover(
  path: string,
  buffer: Buffer,
  bookId: string,
  size: CoverSize
): Promise<void> {
  await bucket.file(path).save(buffer, {
    contentType: "image/jpeg",
    resumable: false,
    metadata: {
      cacheControl: "private, max-age=0, no-transform",
      metadata: {
        access: "canonical",
        assetType: "book-cover",
        bookId,
        size,
        recoveredBy: "backfillMissingCovers",
      },
    },
  });
}

async function assertAdmin(request: CallableRequest<unknown>): Promise<string> {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const token = (request.auth.token ?? {}) as Record<string, unknown>;
  if (token.admin === true) {
    return uid;
  }

  const userSnap = await db.doc(`users/${uid}`).get();
  if (userSnap.exists && userSnap.data()?.role === "admin") {
    return uid;
  }

  throw new HttpsError("permission-denied", "Admin access required.");
}

export const backfillMissingCovers = onCall(
  { cors: true, timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const executor = await assertAdmin(request);

    const payload = (request.data ?? {}) as Record<string, unknown>;

    const dryRun =
      typeof payload.dryRun === "boolean" ? payload.dryRun : true;
    const requestedLimit =
      typeof payload.limit === "number" && Number.isFinite(payload.limit)
        ? Math.floor(payload.limit)
        : 100;
    const limit = Math.min(Math.max(requestedLimit, 1), 200);
    const startAfterBookId = asNonEmptyString(payload.startAfterBookId);

    logger.info("[MISSING_COVERS][START]", {
      executor,
      dryRun,
      limit,
      startAfterBookId: startAfterBookId ?? null,
    });

    let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db
      .collection("books")
      .orderBy("__name__")
      .limit(limit);

    if (startAfterBookId) {
      query = query.startAfter(startAfterBookId);
    }

    const snapshot = await query.get();

    let scanned = 0;
    let targeted = 0;
    let healthy = 0;
    let skipped = 0;
    let failed = 0;
    let restoredBooks = 0;
    let restoredOriginals = 0;
    let restoredDerived = 0;

    for (const doc of snapshot.docs) {
      scanned++;
      const bookId = doc.id;
      const data = doc.data() as Record<string, unknown>;
      const source = normalizeSource(data.source);
      const coverData = asRecord(data.cover);

      if (!source) {
        skipped++;
        continue;
      }

      if (!hasStorageCoverRelation(bookId, coverData)) {
        skipped++;
        continue;
      }

      const externalId = extractExternalId(source, data);
      if (!externalId) {
        skipped++;
        logger.warn("[MISSING_COVERS][SKIP][MISSING_EXTERNAL_ID]", { bookId });
        continue;
      }

      const paths = resolveCoverPaths(bookId, coverData);

      try {
        const [hasOriginal, hasLarge, hasMedium, hasSmall] = await Promise.all([
          storageFileExists(paths.original),
          storageFileExists(paths.large),
          storageFileExists(paths.medium),
          storageFileExists(paths.small),
        ]);

        const missingDerived: DerivedCoverSize[] = [];
        if (!hasLarge) missingDerived.push("large");
        if (!hasMedium) missingDerived.push("medium");
        if (!hasSmall) missingDerived.push("small");

        const hasMissing = !hasOriginal || missingDerived.length > 0;
        if (!hasMissing) {
          healthy++;
          continue;
        }

        targeted++;

        let originalBuffer: Buffer | null = null;
        let restoredOriginalForBook = false;

        if (hasOriginal && missingDerived.length > 0) {
          try {
            const [buffer] = await bucket.file(paths.original).download();
            if (buffer.length >= 1_000) {
              originalBuffer = buffer;
            }
          } catch (error) {
            logger.warn("[MISSING_COVERS][ORIGINAL_DOWNLOAD_FAILED]", {
              bookId,
              error: String(error),
            });
          }
        }

        if (!hasOriginal || !originalBuffer) {
          let candidateUrls = collectCandidateUrls(source, externalId, data);

          if (candidateUrls.length === 0) {
            const editionData = await loadEditionData(
              bookId,
              asNonEmptyString(data.externalKey)
            );

            if (editionData) {
              const merged: Record<string, unknown> = {
                ...editionData,
                ...data,
                coverUrl:
                  asNonEmptyString(data.coverUrl) ??
                  asNonEmptyString(editionData.coverUrl) ??
                  null,
              };
              candidateUrls = collectCandidateUrls(source, externalId, merged);
            }
          }

          if (candidateUrls.length === 0 && source === "googleBooks") {
            const [volumeCandidates] = await Promise.all([
              fetchGoogleVolumeCandidates(externalId),
            ]);
            candidateUrls = Array.from(
              new Set([...volumeCandidates, ...googleIdBasedCandidates(externalId)])
            );
          }

          if (candidateUrls.length === 0) {
            failed++;
            logger.warn("[MISSING_COVERS][NO_CANDIDATE_URLS]", { bookId });
            continue;
          }

          originalBuffer = await fetchFirstValid(candidateUrls);
          if (!originalBuffer) {
            failed++;
            logger.warn("[MISSING_COVERS][FETCH_FAILED]", {
              bookId,
              source,
              candidateCount: candidateUrls.length,
            });
            continue;
          }

          restoredOriginalForBook = true;
          if (!dryRun) {
            await saveCover(paths.original, originalBuffer, bookId, "original");
          }
        }

        let restoredDerivedForBook = 0;
        if (missingDerived.length > 0) {
          for (const size of missingDerived) {
            const derivedBuffer = await resizeDerived(originalBuffer, size);
            if (!dryRun) {
              await saveCover(paths[size], derivedBuffer, bookId, size);
            }
            restoredDerivedForBook++;
          }
        }

        if (!dryRun && needsCoverRelationUpdate(coverData, paths)) {
          await doc.ref.set(
            {
              cover: paths,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        }

        restoredBooks++;
        if (restoredOriginalForBook) {
          restoredOriginals++;
        }
        restoredDerived += restoredDerivedForBook;

        logger.info("[MISSING_COVERS][BOOK_REPAIRED]", {
          bookId,
          restoredOriginal: restoredOriginalForBook,
          restoredDerived: restoredDerivedForBook,
          dryRun,
        });
      } catch (error) {
        failed++;
        logger.error("[MISSING_COVERS][BOOK_FAILED]", {
          bookId,
          error: String(error),
        });
      }
    }

    const nextCursor =
      snapshot.docs.length > 0
        ? snapshot.docs[snapshot.docs.length - 1].id
        : undefined;

    logger.info("[MISSING_COVERS][END]", {
      scanned,
      targeted,
      healthy,
      skipped,
      failed,
      restoredBooks,
      restoredOriginals,
      restoredDerived,
      dryRun,
      nextCursor: nextCursor ?? null,
    });

    return {
      dryRun,
      scanned,
      targeted,
      healthy,
      skipped,
      failed,
      restoredBooks,
      restoredOriginals,
      restoredDerived,
      nextCursor,
    };
  }
);
