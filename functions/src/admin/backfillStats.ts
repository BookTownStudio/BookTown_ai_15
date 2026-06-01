// functions/src/admin/backfillStats.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import {
  assertActiveAuthenticatedUser,
  assertRoleFromClaims,
} from "../shared/auth";

/**
 * backfillDerivedStats
 * Admin-only utility to synchronize aggregate counters with existence documents.
 * Sequential processing in batches of 250 to respect Firestore write limits.
 */
export const backfillDerivedStats = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  assertRoleFromClaims(caller, "superadmin");

  const db = admin.firestore();
  const BATCH_SIZE = 250;
  const results: any = {
    posts: 0,
    users: 0,
    shelves: 0,
    books: 0,
    venues: 0,
    events: 0,
    libraryBooks: 0,
    libraryCounters: 0,
  };
  const timestamp = admin.firestore.Timestamp.now();

  try {
    logger.info("[BACKFILL] Starting global stats synchronization...");

    /* =====================================================
       1. POST STATS
       ===================================================== */
    const postDocs = await db.collection("posts").get();
    for (let i = 0; i < postDocs.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = postDocs.docs.slice(i, i + BATCH_SIZE);

      for (const postDoc of chunk) {
        const [likes, bookmarks, reposts, comments] = await Promise.all([
          db.collection(`posts/${postDoc.id}/likes`).count().get(),
          db.collection(`posts/${postDoc.id}/bookmarks`).count().get(),
          db.collection(`posts/${postDoc.id}/reposts`).count().get(),
          db.collection(`posts/${postDoc.id}/comments`).count().get(),
        ]);

        batch.set(
          db.collection("post_stats").doc(postDoc.id),
          {
            counters: {
              likes: likes.data().count,
              bookmarks: bookmarks.data().count,
              reposts: reposts.data().count,
              comments: comments.data().count,
            },
            likesCount: likes.data().count,
            bookmarksCount: bookmarks.data().count,
            repostsCount: reposts.data().count,
            commentsCount: comments.data().count,
            lastBackfilledAt: timestamp,
          },
          { merge: true }
        );
      }
      await batch.commit();
      results.posts += chunk.length;
    }

    /* =====================================================
       2. USER STATS (followers / following)
       ===================================================== */
    const userDocs = await db.collection("users").get();
    for (let i = 0; i < userDocs.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = userDocs.docs.slice(i, i + BATCH_SIZE);

      for (const userDoc of chunk) {
        const [followers, following] = await Promise.all([
          db.collection(`users/${userDoc.id}/followers`).count().get(),
          db.collection(`users/${userDoc.id}/following`).count().get(),
        ]);

        batch.set(
          db.collection("user_stats").doc(userDoc.id),
          {
            followers: followers.data().count,
            following: following.data().count,
            lastBackfilledAt: timestamp,
          },
          { merge: true }
        );
      }
      await batch.commit();
      results.users += chunk.length;
    }

    /* =====================================================
       3. LIBRARY REBUILD
       ===================================================== */
    logger.info(
      "[BACKFILL] Skipping user_library_books. Use recoverUserLibraryBooks for bounded Phase 8A recovery."
    );

    /* =====================================================
       4. SHELF COUNTERS (PHYSICAL ONLY)
       ===================================================== */
    logger.info("[BACKFILL] Rebuilding shelf counters...");

    const shelfCountMap = new Map<string, number>();

    const shelfDocs = await db.collection("shelves").get();

for (const shelfDoc of shelfDocs.docs) {
      const data = shelfDoc.data() as any;
      const ownerId = data.ownerId;
      const isVirtual = Boolean(data.isVirtual);
      if (!ownerId || isVirtual) continue;

      shelfCountMap.set(ownerId, (shelfCountMap.get(ownerId) || 0) + 1);
    }

    for (const [uid, count] of shelfCountMap.entries()) {
      await db
        .collection("user_stats")
        .doc(uid)
        .set(
          {
            "counters.totalShelves": count,
            lastBackfilledAt: timestamp,
          },
          { merge: true }
        );
    }

    /* =====================================================
       5. BOOK / VENUE / EVENT STATS (UNCHANGED)
       ===================================================== */
    const bookDocs = await db.collection("books").get();
    for (let i = 0; i < bookDocs.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = bookDocs.docs.slice(i, i + BATCH_SIZE);

      for (const bookDoc of chunk) {
        const reviewsSnap = await db
          .collection(`books/${bookDoc.id}/reviews`)
          .where("visibility", "==", "public")
          .get();
        const ratingsSnap = await db
          .collection(`books/${bookDoc.id}/ratings`)
          .where("visibility", "==", "public")
          .get();
        const reviewsCount = reviewsSnap.size;
        const ratingsCount = ratingsSnap.size;
        const ratingSum = ratingsSnap.docs.reduce((sum, ratingDoc) => {
          const data = ratingDoc.data() as Record<string, unknown>;
          const rating =
            typeof data.rating === "number" && Number.isFinite(data.rating)
              ? Math.trunc(data.rating)
              : 0;
          return sum + Math.max(0, Math.min(5, rating));
        }, 0);
        const averageRating = ratingsCount > 0 ? ratingSum / ratingsCount : 0;

        batch.set(
          db.collection("book_stats").doc(bookDoc.id),
          {
            reviews: reviewsCount,
            ratingsCount,
            ratingSum,
            averageRating,
            lastBackfilledAt: timestamp,
          },
          { merge: true }
        );
      }
      await batch.commit();
      results.books += chunk.length;
    }

    const venueDocs = await db.collection("venues").get();
    for (const docSnap of venueDocs.docs) {
      const reviews = await db
        .collection(`venues/${docSnap.id}/reviews`)
        .count()
        .get();
      await db.collection("venue_stats").doc(docSnap.id).set(
        {
          reviews: reviews.data().count,
          lastBackfilledAt: timestamp,
        },
        { merge: true }
      );
      results.venues++;
    }

    const eventDocs = await db.collection("events").get();
    for (const docSnap of eventDocs.docs) {
      const rsvps = await db
        .collection(`events/${docSnap.id}/rsvps`)
        .count()
        .get();
      const rsvpCount = rsvps.data().count;
      await db.collection("event_stats").doc(docSnap.id).set(
        {
          counters: {
            rsvps: rsvpCount,
          },
          rsvps: rsvpCount,
          rsvpsCount: rsvpCount,
          updatedAt: timestamp,
          lastUpdatedAt: timestamp,
          lastBackfilledAt: timestamp,
        },
        { merge: true }
      );
      results.events++;
    }

    logger.info("[BACKFILL] Success. Results summary:", results);
    return { success: true, results };
  } catch (error: any) {
    logger.error("[BACKFILL] Critical failure during sync:", error);
    throw new HttpsError(
      "internal",
      "Backfill operation failed. Check logs."
    );
  }
});
