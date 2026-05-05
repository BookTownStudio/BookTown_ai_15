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
       3. LIBRARY REBUILD (AUTHORITATIVE)
       ===================================================== */
    logger.info("[BACKFILL] Rebuilding user library canonical sets...");

    // Clear existing canonical set (authoritative rebuild)
    const existingLibBooks = await db.collection("user_library_books").get();
    for (let i = 0; i < existingLibBooks.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = existingLibBooks.docs.slice(i, i + BATCH_SIZE);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    // Temporary in-memory aggregation:
    // userId -> Map(bookId -> { shelfIds:Set, hasProgress:boolean })
    const userLibraryMap = new Map<
      string,
      Map<string, { shelfIds: Set<string>; hasProgress: boolean }>
    >();

    /* ---- 3a. From shelf_books ---- */
    const shelfBooksDocs = await db.collection("shelf_books").get();
    for (const sbDoc of shelfBooksDocs.docs) {
      const data = sbDoc.data() as any;
      const ownerId = data.ownerId;
      const shelfId = data.shelfId;
      const bookId = data.bookId;

      if (!ownerId || !shelfId || !bookId) continue;

      if (!userLibraryMap.has(ownerId)) {
        userLibraryMap.set(ownerId, new Map());
      }

      const userMap = userLibraryMap.get(ownerId)!;
      if (!userMap.has(bookId)) {
        userMap.set(bookId, {
          shelfIds: new Set(),
          hasProgress: false,
        });
      }
      userMap.get(bookId)!.shelfIds.add(shelfId);
    }

    /* ---- 3b. From reading_progress ---- */
    const progressDocs = await db.collection("reading_progress").get();
    for (const prog of progressDocs.docs) {
      const data = prog.data() as any;
      const uid = data.uid || data.userId;
      const bookId = data.bookId;

      if (!uid || !bookId) continue;

      if (!userLibraryMap.has(uid)) {
        userLibraryMap.set(uid, new Map());
      }

      const userMap = userLibraryMap.get(uid)!;
      if (!userMap.has(bookId)) {
        userMap.set(bookId, {
          shelfIds: new Set(),
          hasProgress: true,
        });
      } else {
        userMap.get(bookId)!.hasProgress = true;
      }
    }

    /* ---- 3c. Persist canonical library books + counters ---- */
    for (const [uid, booksMap] of userLibraryMap.entries()) {
      let totalBooks = 0;

      for (const [bookId, state] of booksMap.entries()) {
        if (state.shelfIds.size === 0 && state.hasProgress === false) {
          continue;
        }

        await db
          .collection("user_library_books")
          .doc(`${uid}_${bookId}`)
          .set({
            uid,
            bookId,
            shelfIds: Array.from(state.shelfIds),
            hasProgress: state.hasProgress,
            rebuiltAt: timestamp,
          });

        totalBooks++;
        results.libraryBooks++;
      }

      await db
        .collection("user_stats")
        .doc(uid)
        .set(
          {
            "counters.totalBooks": totalBooks,
            lastBackfilledAt: timestamp,
          },
          { merge: true }
        );

      results.libraryCounters++;
    }

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
      await db.collection("event_stats").doc(docSnap.id).set(
        {
          rsvps: rsvps.data().count,
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
