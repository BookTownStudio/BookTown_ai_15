// functions/src/triggers/aggregationTriggers.ts

import {
  onDocumentCreated,
  onDocumentDeleted,
  onDocumentWritten,
} from "firebase-functions/v2/firestore";
import { admin } from "../firebaseAdmin";
import { recomputeUserStats } from "../userStats/recomputeUserStats";

const db = admin.firestore();

/**
 * updateStatCounter
 * Authoritative atomic counter update.
 */
async function updateStatCounter(
  collection: string,
  docId: string,
  field: string,
  delta: number
) {
  const ref = db.collection(collection).doc(docId);
  const fieldPath = `counters.${field}`;
  await ref.set(
    {
      [fieldPath]: admin.firestore.FieldValue.increment(delta),
      lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * ---------------------------------------------------------
 * LIBRARY COUNTERS (Authoritative)
 * ---------------------------------------------------------
 * Goal:
 * - Move library header counts to user_stats (O(1) read)
 * - Avoid runtime computation across shelves/progress
 *
 * Approach (Tier-1 stable):
 * - Maintain a per-user canonical set: user_library_books/{uid}_{bookId}
 * - Sources:
 *   - Shelf membership (entries map)
 *   - Reading progress existence (reading_progress)
 *
 * Counters:
 * - user_stats/{uid}.counters.totalBooks  (unique, deduped)
 * - user_stats/{uid}.counters.totalShelves (physical shelves docs)
 *
 * NOTE:
 * - We DO NOT rely on "shelf count == book count"
 * - We DO NOT rely on virtual shelves for counting
 */

/** Internal helper: canonical library book doc id */
function libraryBookDocId(uid: string, bookId: string) {
  return `${uid}_${bookId}`;
}

/**
 * Internal helper: apply library-book source changes transactionally.
 */
async function applyLibraryBookDelta(params: {
  uid: string;
  bookId: string;
  addShelfId?: string;
  removeShelfId?: string;
  setHasProgress?: boolean;
}) {
  const { uid, bookId, addShelfId, removeShelfId, setHasProgress } = params;

  const libRef = db
    .collection("user_library_books")
    .doc(libraryBookDocId(uid, bookId));
  const statsRef = db.collection("user_stats").doc(uid);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(libRef);
    const existed = snap.exists;

    const before = snap.exists ? (snap.data() as any) : null;
    const beforeShelfIds: string[] = Array.isArray(before?.shelfIds)
      ? before.shelfIds
      : [];
    const beforeHasProgress = Boolean(before?.hasProgress);

    const nextShelfIds = new Set(beforeShelfIds);
    if (addShelfId) nextShelfIds.add(addShelfId);
    if (removeShelfId) nextShelfIds.delete(removeShelfId);

    const nextHasProgress =
      typeof setHasProgress === "boolean"
        ? setHasProgress
        : beforeHasProgress;

    const isEmpty = nextShelfIds.size === 0 && nextHasProgress === false;

    if (!existed && !isEmpty) {
      tx.set(
        statsRef,
        {
          "counters.totalBooks":
            admin.firestore.FieldValue.increment(1),
          lastUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    if (existed && isEmpty) {
      tx.set(
        statsRef,
        {
          "counters.totalBooks":
            admin.firestore.FieldValue.increment(-1),
          lastUpdatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.delete(libRef);
      return;
    }

    if (!isEmpty) {
      tx.set(
        libRef,
        {
          uid,
          bookId,
          shelfIds: Array.from(nextShelfIds),
          hasProgress: nextHasProgress,
          updatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}

// ------------------------------------------------------------------
// --- POST INTERACTION TRIGGERS ---
// ------------------------------------------------------------------

export const onPostLikeCreated = onDocumentCreated(
  "users/{userId}/likes/{postId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "likes",
      1
    );
  }
);

export const onPostLikeDeleted = onDocumentDeleted(
  "users/{userId}/likes/{postId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "likes",
      -1
    );
  }
);

export const onPostRepostCreated = onDocumentCreated(
  "users/{userId}/reposts/{postId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "reposts",
      1
    );
  }
);

export const onPostRepostDeleted = onDocumentDeleted(
  "users/{userId}/reposts/{postId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "reposts",
      -1
    );
  }
);

export const onPostCommentCreated = onDocumentCreated(
  "posts/{postId}/comments/{commentId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "comments",
      1
    );
  }
);

export const onPostCommentDeleted = onDocumentDeleted(
  "posts/{postId}/comments/{commentId}",
  async (event) => {
    await updateStatCounter(
      "post_stats",
      event.params.postId,
      "comments",
      -1
    );
  }
);

export const onPostBookmarkCreated = onDocumentCreated(
  "users/{userId}/bookmarks/{entityId}",
  async (event) => {
    const data = event.data?.data();
    if (data?.type === "post") {
      await updateStatCounter(
        "post_stats",
        event.params.entityId,
        "bookmarks",
        1
      );
    }
  }
);

export const onPostBookmarkDeleted = onDocumentDeleted(
  "users/{userId}/bookmarks/{entityId}",
  async (event) => {
    const data = event.data?.data();
    if (data?.type === "post") {
      await updateStatCounter(
        "post_stats",
        event.params.entityId,
        "bookmarks",
        -1
      );
    }
  }
);

// ------------------------------------------------------------------
// --- USER & CATALOG TRIGGERS ---
// ------------------------------------------------------------------

export const onUserFollowCreated = onDocumentCreated(
  "users/{userId}/followers/{followerId}",
  async (event) => {
    await updateStatCounter(
      "user_stats",
      event.params.userId,
      "followers",
      1
    );
    await updateStatCounter(
      "user_stats",
      event.params.followerId,
      "following",
      1
    );

    await db.collection("public_profiles").doc(event.params.userId).set(
      {
        followerCount: admin.firestore.FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    await db.collection("public_profiles").doc(event.params.followerId).set(
      {
        followingCount: admin.firestore.FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
);

export const onUserFollowDeleted = onDocumentDeleted(
  "users/{userId}/followers/{followerId}",
  async (event) => {
    await updateStatCounter(
      "user_stats",
      event.params.userId,
      "followers",
      -1
    );
    await updateStatCounter(
      "user_stats",
      event.params.followerId,
      "following",
      -1
    );

    await db.collection("public_profiles").doc(event.params.userId).set(
      {
        followerCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    await db.collection("public_profiles").doc(event.params.followerId).set(
      {
        followingCount: admin.firestore.FieldValue.increment(-1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }
);

/**
 * Legacy path (kept for backward compatibility)
 */
export const onShelfCreated = onDocumentCreated(
  "users/{userId}/shelves/{shelfId}",
  async (event) => {
    await updateStatCounter(
      "user_stats",
      event.params.userId,
      "shelvesCreated",
      1
    );
    await recomputeUserStats(event.params.userId);
  }
);

export const onBookReviewCreated = onDocumentCreated(
  "books/{bookId}/reviews/{reviewId}",
  async (event) => {
    await updateStatCounter(
      "book_stats",
      event.params.bookId,
      "reviews",
      1
    );
    const data = event.data?.data();
    if (data?.userId) {
      await recomputeUserStats(data.userId);
    }
  }
);

export const onEventRsvpCreated = onDocumentCreated(
  "events/{eventId}/rsvps/{userId}",
  async (event) => {
    await updateStatCounter(
      "event_stats",
      event.params.eventId,
      "rsvps",
      1
    );
  }
);

// ------------------------------------------------------------------
// ✅ TOP-LEVEL SHELVES AUTHORITY
// shelves/{uid}_{shelfId}
// ------------------------------------------------------------------

export const onTopLevelShelfCreated = onDocumentCreated(
  "shelves/{shelfDocId}",
  async (event) => {
    const data = event.data?.data() as any;
    const ownerId = data?.ownerId;
    const isVirtual = Boolean(data?.isVirtual);
    if (!ownerId || isVirtual) return;

    await updateStatCounter(
      "user_stats",
      ownerId,
      "totalShelves",
      1
    );
    await recomputeUserStats(ownerId);
  }
);

export const onTopLevelShelfDeleted = onDocumentDeleted(
  "shelves/{shelfDocId}",
  async (event) => {
    const data = event.data?.data() as any;
    const ownerId = data?.ownerId;
    const isVirtual = Boolean(data?.isVirtual);
    if (!ownerId || isVirtual) return;

    await updateStatCounter(
      "user_stats",
      ownerId,
      "totalShelves",
      -1
    );
    await recomputeUserStats(ownerId);
  }
);

// ------------------------------------------------------------------
// ✅ SHELF ENTRIES MAP DIFF → CANONICAL LIBRARY SET
// ------------------------------------------------------------------

export const onShelfEntriesWritten = onDocumentWritten(
  "shelves/{shelfDocId}",
  async (event) => {
    const before = event.data?.before?.data() as any;
    const after = event.data?.after?.data() as any;
    if (!after) return;

    const ownerId = after?.ownerId;
    const shelfId = after?.id;
    const isVirtual = Boolean(after?.isVirtual);
    if (!ownerId || !shelfId || isVirtual) return;

    const beforeEntries = before?.entries || {};
    const afterEntries = after?.entries || {};

    const beforeIds = new Set(Object.keys(beforeEntries));
    const afterIds = new Set(Object.keys(afterEntries));

    const added = [...afterIds].filter(id => !beforeIds.has(id));
    const removed = [...beforeIds].filter(id => !afterIds.has(id));
    if (!added.length && !removed.length) return;

    for (const bookId of added) {
      await applyLibraryBookDelta({
        uid: ownerId,
        bookId,
        addShelfId: shelfId,
      });
    }

    for (const bookId of removed) {
      await applyLibraryBookDelta({
        uid: ownerId,
        bookId,
        removeShelfId: shelfId,
      });
    }
  }
);

// ------------------------------------------------------------------
// ✅ READING PROGRESS → CANONICAL LIBRARY SET
// ------------------------------------------------------------------

export const onReadingProgressWritten = onDocumentWritten(
  "reading_progress/{progressId}",
  async (event) => {
    const after = event.data?.after?.data() as any;
    if (!after) return;

    const uid = after?.uid || after?.userId;
    const bookId = after?.bookId;
    if (!uid || !bookId) return;

    await applyLibraryBookDelta({
      uid,
      bookId,
      setHasProgress: true,
    });
    await recomputeUserStats(uid);
  }
);
