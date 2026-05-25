import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import sharp from "sharp";
import { admin } from "../firebaseAdmin";
import { fetchFirstValid } from "./ingestBook";

const db = admin.firestore();
const bucket = admin.storage().bucket();

type JobStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

type CoverSizes = "original" | "large" | "medium" | "small";
const COVER_BOOK_WRITE_ALLOWLIST = new Set([
  "cover",
  "coverUrl",
  "coverState",
  "coverFailureReason",
  "coverUpdatedAt",
  "updatedAt",
]);

const DERIVED_SIZES: Record<Exclude<CoverSizes, "original">, { width: number; quality: number }> = {
  large: { width: 1200, quality: 82 },
  medium: { width: 600, quality: 80 },
  small: { width: 300, quality: 75 },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function assertAllowedCoverBookPatch(
  patch: Record<string, unknown>,
  context: string
): void {
  const unexpectedFields = Object.keys(patch).filter(
    (field) => !COVER_BOOK_WRITE_ALLOWLIST.has(field)
  );
  if (unexpectedFields.length > 0) {
    logger.error("[COVER_JOB][DISALLOWED_BOOK_MUTATION_FIELDS]", {
      context,
      unexpectedFields,
    });
    throw new Error("COVER_JOB_DISALLOWED_BOOK_MUTATION_FIELDS");
  }
}

function coverPath(bookId: string, size: CoverSizes): string {
  return `books/${bookId}/covers/${size}.jpg`;
}

async function writeCover(path: string, bytes: Buffer, bookId: string, size: CoverSizes): Promise<void> {
  await bucket.file(path).save(bytes, {
    contentType: "image/jpeg",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000",
      metadata: {
        pipeline: "cover_jobs_v2",
        size,
        bookId,
      },
    },
  });
}

async function failJob(params: {
  bookId: string;
  statusRef: FirebaseFirestore.DocumentReference;
  error: unknown;
}): Promise<void> {
  const { bookId, statusRef, error } = params;
  const message = String(error);
  logger.error("COVER_JOB_V2_TRACE", {
    phase: "final_failed",
    bookId,
    error: message,
  });

  const bookPatch: Record<string, unknown> = {
    coverState: "FAILED",
    cover: {
      state: "FAILED",
    },
    coverFailureReason: message,
    coverUpdatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  assertAllowedCoverBookPatch(bookPatch, "processCoverJobs.fail");

  await Promise.all([
    statusRef.set(
      {
        status: "FAILED" as JobStatus,
        lastError: message,
        updatedAt: FieldValue.serverTimestamp(),
        completedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    db.collection("books").doc(bookId).set(
      bookPatch,
      { merge: true }
    ),
  ]);
}

export const processCoverJobs = onDocumentWritten("cover_jobs/{bookId}", async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;

  const bookId = String(event.params.bookId || "").trim();
  if (!bookId) return;

  const afterData = asRecord(after.data() || null);
  const status = asNonEmptyString(afterData?.status) as JobStatus | null;
  if (status !== "PENDING") return;
  if (asNonEmptyString(afterData?.source) === "user_upload") return;

  const locked = await db.runTransaction(async (tx) => {
    const jobSnap = await tx.get(after.ref);
    if (!jobSnap.exists) return false;

    const jobData = asRecord(jobSnap.data() || null);
    const currentStatus = asNonEmptyString(jobData?.status) as JobStatus | null;
    if (currentStatus !== "PENDING") return false;

    const attempts = Number(jobData?.attempts || 0) + 1;

    tx.set(
      after.ref,
      {
        status: "PROCESSING" as JobStatus,
        attempts,
        startedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastError: null,
      },
      { merge: true }
    );

    const processingBookPatch: Record<string, unknown> = {
      coverState: "PROCESSING",
      cover: {
        state: "PROCESSING",
      },
      coverFailureReason: null,
      coverUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    assertAllowedCoverBookPatch(processingBookPatch, "processCoverJobs.processing");

    tx.set(
      db.collection("books").doc(bookId),
      processingBookPatch,
      { merge: true }
    );

    return true;
  });

  if (!locked) {
    return;
  }

  logger.info("COVER_JOB_V2_TRACE", {
    phase: "picked",
    transition: "PENDING->PROCESSING",
    bookId,
  });

  try {
    const liveJobSnap = await after.ref.get();
    const liveJobData = asRecord(liveJobSnap.data() || null);
    const candidateUrls = Array.isArray(liveJobData?.candidateUrls)
      ? liveJobData.candidateUrls.filter(
          (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
        )
      : [];

    if (candidateUrls.length === 0) {
      throw new Error("COVER_CANDIDATES_EMPTY");
    }

    logger.info("COVER_JOB_V2_TRACE", {
      phase: "candidates",
      bookId,
      candidateUrls: candidateUrls.length,
    });

    const originalBytes = await fetchFirstValid(candidateUrls);
    if (!originalBytes) {
      throw new Error("NO_VALID_COVER_CANDIDATE");
    }

    logger.info("COVER_JOB_V2_TRACE", {
      phase: "fetch",
      bookId,
      validImageFetched: true,
    });

    const normalizedOriginal = await sharp(originalBytes, { failOn: "none" })
      .rotate()
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();

    const paths = {
      original: coverPath(bookId, "original"),
      large: coverPath(bookId, "large"),
      medium: coverPath(bookId, "medium"),
      small: coverPath(bookId, "small"),
    };

    await writeCover(paths.original, normalizedOriginal, bookId, "original");

    const derivedOutputs = await Promise.all(
      (Object.entries(DERIVED_SIZES) as Array<[keyof typeof DERIVED_SIZES, (typeof DERIVED_SIZES)[keyof typeof DERIVED_SIZES]]>).map(
        async ([size, cfg]) => {
          const bytes = await sharp(normalizedOriginal)
            .resize({ width: cfg.width, withoutEnlargement: true })
            .jpeg({ quality: cfg.quality, mozjpeg: true })
            .toBuffer();

          await writeCover(paths[size], bytes, bookId, size);
        }
      )
    );

    void derivedOutputs;

    const readyBookPatch: Record<string, unknown> = {
      coverState: "READY",
      coverUrl: paths.medium,
      cover: {
        state: "READY",
        original: paths.original,
        large: paths.large,
        medium: paths.medium,
        small: paths.small,
      },
      coverFailureReason: null,
      coverUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    assertAllowedCoverBookPatch(readyBookPatch, "processCoverJobs.ready");

    await Promise.all([
      after.ref.set(
        {
          status: "READY" as JobStatus,
          updatedAt: FieldValue.serverTimestamp(),
          completedAt: FieldValue.serverTimestamp(),
          lastError: null,
        },
        { merge: true }
      ),
      db.collection("books").doc(bookId).set(
        readyBookPatch,
        { merge: true }
      ),
    ]);

    logger.info("[COVER_JOB][READY]", {
      bookId,
      paths,
    });
    logger.info("COVER_JOB_V2_TRACE", {
      phase: "final_ready",
      bookId,
      status: "READY",
      paths,
    });
  } catch (error) {
    await failJob({
      bookId,
      statusRef: after.ref,
      error,
    });
  }
});
