import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

const MAX_BOOKS_PER_RUN = 25;
const MAX_REVIEWS_PER_BOOK = 10000;
const MAX_RATINGS_PER_BOOK = 10000;
const CHECKPOINT_COLLECTION = "_ops";
const CHECKPOINT_DOC_ID = "review_aggregate_reconcile_checkpoint";
const RUN_REPORT_COLLECTION = "_ops/review_aggregate_reconcile_runs/logs";

type ReconcileStatus = "repaired" | "clean" | "skipped_cap" | "error";

type ReconcileItem = {
  bookId: string;
  status: ReconcileStatus;
  expectedReviews?: number;
  expectedRatingsCount?: number;
  expectedRatingSum?: number;
  expectedAverageRating?: number;
  observedReviews?: number;
  observedRatingsCount?: number;
  observedRatingSum?: number;
  observedAverageRating?: number;
  reason?: string;
};

function normalizeRating(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Math.trunc(numeric)));
}

function normalizeCounterInt(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

function normalizeCounterFloat(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

async function reconcileBook(bookId: string): Promise<ReconcileItem> {
  const reviewsRef = db.collection("books").doc(bookId).collection("reviews");
  const ratingsRef = db.collection("books").doc(bookId).collection("ratings");
  const reviewsSnap = await reviewsRef
    .where("visibility", "==", "public")
    .limit(MAX_REVIEWS_PER_BOOK + 1)
    .get();

  if (reviewsSnap.size > MAX_REVIEWS_PER_BOOK) {
    return {
      bookId,
      status: "skipped_cap",
      reason: `review_count_exceeds_cap:${MAX_REVIEWS_PER_BOOK}`,
    };
  }

  const ratingsSnap = await ratingsRef
    .where("visibility", "==", "public")
    .limit(MAX_RATINGS_PER_BOOK + 1)
    .get();
  if (ratingsSnap.size > MAX_RATINGS_PER_BOOK) {
    return {
      bookId,
      status: "skipped_cap",
      reason: `rating_count_exceeds_cap:${MAX_RATINGS_PER_BOOK}`,
    };
  }

  const expectedReviews = reviewsSnap.size;
  let expectedRatingSum = 0;
  for (const ratingDoc of ratingsSnap.docs) {
    expectedRatingSum += normalizeRating(ratingDoc.get("rating"));
  }
  const expectedRatingsCount = ratingsSnap.size;
  const expectedAverageRating =
    expectedRatingsCount > 0
      ? Number((expectedRatingSum / expectedRatingsCount).toFixed(4))
      : 0;

  const statsRef = db.collection("book_stats").doc(bookId);
  const statsSnap = await statsRef.get();
  const counters =
    statsSnap.exists && statsSnap.data() && typeof statsSnap.data() === "object"
      ? ((statsSnap.data() as { counters?: unknown }).counters as Record<string, unknown> | undefined) ?? {}
      : {};

  const observedReviews = normalizeCounterInt(counters.reviews);
  const observedRatingsCount = normalizeCounterInt(counters.ratingsCount);
  const observedRatingSum = normalizeCounterFloat(counters.ratingSum);
  const observedAverageRating = normalizeCounterFloat(counters.averageRating);

  const hasDrift =
    observedReviews !== expectedReviews ||
    observedRatingsCount !== expectedRatingsCount ||
    Math.abs(observedRatingSum - expectedRatingSum) > 0.0001 ||
    Math.abs(observedAverageRating - expectedAverageRating) > 0.0001;

  if (!hasDrift) {
    return {
      bookId,
      status: "clean",
      expectedReviews,
      expectedRatingsCount,
      expectedRatingSum,
      expectedAverageRating,
      observedReviews,
      observedRatingsCount,
      observedRatingSum,
      observedAverageRating,
    };
  }

  await statsRef.set(
    {
      counters: {
        ...counters,
        reviews: expectedReviews,
        ratingsCount: expectedRatingsCount,
        ratingSum: expectedRatingSum,
        averageRating: expectedAverageRating,
      },
      reviews: expectedReviews,
      ratingsCount: expectedRatingsCount,
      averageRating: expectedAverageRating,
      lastReconciledAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    bookId,
    status: "repaired",
    expectedReviews,
    expectedRatingsCount,
    expectedRatingSum,
    expectedAverageRating,
    observedReviews,
    observedRatingsCount,
    observedRatingSum,
    observedAverageRating,
  };
}

export const scheduledReviewAggregateReconcile = onSchedule(
  {
    schedule: "15 */2 * * *",
    timeZone: "UTC",
    memory: "256MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const checkpointRef = db.collection(CHECKPOINT_COLLECTION).doc(CHECKPOINT_DOC_ID);
    const checkpointSnap = await checkpointRef.get();
    const lastBookId =
      checkpointSnap.exists && typeof checkpointSnap.get("lastBookId") === "string"
        ? String(checkpointSnap.get("lastBookId"))
        : null;

    let baseQuery = db
      .collection("book_stats")
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(MAX_BOOKS_PER_RUN);
    if (lastBookId) {
      baseQuery = baseQuery.startAfter(lastBookId);
    }

    let statsSnap = await baseQuery.get();
    if (statsSnap.empty && lastBookId) {
      statsSnap = await db
        .collection("book_stats")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(MAX_BOOKS_PER_RUN)
        .get();
    }

    if (statsSnap.empty) {
      logger.info("[REVIEW_AGG_RECONCILE][SKIP_EMPTY]");
      return;
    }

    const results: ReconcileItem[] = [];
    for (const statDoc of statsSnap.docs) {
      const bookId = statDoc.id;
      try {
        const result = await reconcileBook(bookId);
        results.push(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          bookId,
          status: "error",
          reason: message,
        });
      }
    }

    const repaired = results.filter((item) => item.status === "repaired").length;
    const clean = results.filter((item) => item.status === "clean").length;
    const skipped = results.filter((item) => item.status === "skipped_cap").length;
    const errored = results.filter((item) => item.status === "error").length;
    const nextLastBookId = statsSnap.docs[statsSnap.docs.length - 1]?.id ?? null;

    await checkpointRef.set(
      {
        lastBookId: nextLastBookId,
        runAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await db.collection(RUN_REPORT_COLLECTION).add({
      totalBooksScanned: results.length,
      repaired,
      clean,
      skippedCap: skipped,
      errored,
      runAt: admin.firestore.FieldValue.serverTimestamp(),
      checkpointFrom: lastBookId,
      checkpointTo: nextLastBookId,
      results,
    });

    if (repaired > 0 || errored > 0 || skipped > 0) {
      logger.warn("[REVIEW_AGG_RECONCILE][DRIFT_DETECTED]", {
        repaired,
        clean,
        skipped,
        errored,
        checkpointFrom: lastBookId,
        checkpointTo: nextLastBookId,
      });
      return;
    }

    logger.info("[REVIEW_AGG_RECONCILE][CLEAN]", {
      repaired,
      clean,
      skipped,
      errored,
      checkpointFrom: lastBookId,
      checkpointTo: nextLastBookId,
    });
  }
);
