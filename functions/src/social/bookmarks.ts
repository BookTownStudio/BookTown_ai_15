import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { assertActiveAuthenticatedUser } from "../shared/auth";
import { z, parseInput } from "../shared/validation";
import { assertViewerCanInteractWithPost } from "./postAccess";
import {
  toBookmarkInteraction,
  writeUserEntityInteraction,
} from "../identityGraph/userEntityInteractionRuntime";

const db = admin.firestore();

const bookmarkEntityTypeSchema = z.enum([
  "book",
  "quote",
  "post",
  "author",
  "venue",
  "event",
]);

const toggleBookmarkSchema = z
  .object({
    entityType: bookmarkEntityTypeSchema,
    entityId: z.string().trim().min(1).max(190),
    active: z.boolean(),
    quoteOwnerId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

type BookmarkEntityType = z.infer<typeof bookmarkEntityTypeSchema>;

type BookmarkTarget = {
  bookmarkId: string;
  collectionName: "bookmarks" | "venue_bookmarks" | "event_bookmarks";
  entityId: string;
  entityType: BookmarkEntityType;
  extra?: Record<string, string>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function canReadBook(book: Record<string, unknown>, uid: string): boolean {
  const ownerId =
    asString(book.ownerUid) ||
    asString(book.ownerId) ||
    asString(book.createdBy) ||
    asString(book.uploadedByUid);
  const visibility = asString(book.visibility) || "public";
  const rightsMode = asString(book.rightsMode) || "public_free";
  return uid === ownerId || (visibility === "public" && rightsMode !== "private");
}

function canReadShelf(shelf: Record<string, unknown>, uid: string): boolean {
  const ownerId = asString(shelf.ownerId);
  const visibility = asString(shelf.visibility) || "public";
  return visibility === "public" || visibility === "unlisted" || uid === ownerId;
}

function canReadEvent(event: Record<string, unknown>, uid: string): boolean {
  const ownerId = asString(event.ownerId);
  const privacy = asString(event.privacy) || "public";
  return privacy === "public" || uid === ownerId;
}

async function resolveQuoteTarget(
  uid: string,
  entityId: string,
  quoteOwnerId?: string
): Promise<BookmarkTarget> {
  let sourceQuote: Record<string, unknown> | null = null;
  const rootSnap = await db.collection("quotes").doc(entityId).get();
  if (rootSnap.exists) {
    sourceQuote = rootSnap.data() as Record<string, unknown>;
  }

  if (!sourceQuote && quoteOwnerId) {
    const legacySnap = await db
      .collection("users")
      .doc(quoteOwnerId)
      .collection("quotes")
      .doc(entityId)
      .get();
    if (legacySnap.exists) {
      sourceQuote = legacySnap.data() as Record<string, unknown>;
    }
  }

  if (!sourceQuote) {
    throw new HttpsError("not-found", "Quote not found.");
  }

  const ownerId = asString(sourceQuote.ownerId) || quoteOwnerId || "";
  if (sourceQuote.isPublic !== true && uid !== ownerId) {
    throw new HttpsError("permission-denied", "Quote is private.");
  }

  const canonicalQuoteId = asString(sourceQuote.canonicalQuoteId) || entityId;
  return {
    bookmarkId: canonicalQuoteId,
    collectionName: "bookmarks",
    entityId: canonicalQuoteId,
    entityType: "quote",
    extra: ownerId ? { quoteOwnerId: ownerId } : undefined,
  };
}

async function resolveBookmarkTarget(
  uid: string,
  entityType: BookmarkEntityType,
  entityId: string,
  quoteOwnerId?: string
): Promise<BookmarkTarget> {
  if (entityType === "post") {
    const postSnap = await db.collection("posts").doc(entityId).get();
    if (!postSnap.exists) {
      throw new HttpsError("not-found", "Post not found.");
    }
    await assertViewerCanInteractWithPost({
      postId: entityId,
      postData: postSnap.data() as Record<string, unknown>,
      viewerUid: uid,
    });
    return {
      bookmarkId: entityId,
      collectionName: "bookmarks",
      entityId,
      entityType,
    };
  }

  if (entityType === "quote") {
    return resolveQuoteTarget(uid, entityId, quoteOwnerId);
  }

  if (entityType === "book") {
    const bookSnap = await db.collection("books").doc(entityId).get();
    if (!bookSnap.exists) {
      throw new HttpsError("not-found", "Book not found.");
    }
    if (!canReadBook(bookSnap.data() as Record<string, unknown>, uid)) {
      throw new HttpsError("permission-denied", "Book is not bookmarkable.");
    }
    return {
      bookmarkId: entityId,
      collectionName: "bookmarks",
      entityId,
      entityType,
    };
  }

  if (entityType === "author") {
    const authorSnap = await db.collection("authors").doc(entityId).get();
    if (!authorSnap.exists) {
      throw new HttpsError("not-found", "Author not found.");
    }
    return {
      bookmarkId: entityId,
      collectionName: "bookmarks",
      entityId,
      entityType,
    };
  }

  if (entityType === "venue") {
    const venueSnap = await db.collection("venues").doc(entityId).get();
    if (!venueSnap.exists) {
      throw new HttpsError("not-found", "Venue not found.");
    }
    return {
      bookmarkId: entityId,
      collectionName: "venue_bookmarks",
      entityId,
      entityType,
    };
  }

  const eventSnap = await db.collection("events").doc(entityId).get();
  if (!eventSnap.exists) {
    throw new HttpsError("not-found", "Event not found.");
  }
  if (!canReadEvent(eventSnap.data() as Record<string, unknown>, uid)) {
    throw new HttpsError("permission-denied", "Event is not bookmarkable.");
  }
  return {
    bookmarkId: entityId,
    collectionName: "event_bookmarks",
    entityId,
    entityType,
  };
}

export const toggleBookmark = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const { entityType, entityId, active, quoteOwnerId } = parseInput(
    toggleBookmarkSchema,
    request.data
  );

  const target = await resolveBookmarkTarget(uid, entityType, entityId, quoteOwnerId);
  const bookmarkRef = db
    .collection("users")
    .doc(uid)
    .collection(target.collectionName)
    .doc(target.bookmarkId);
  const viewerStateRef = db
    .collection("users")
    .doc(uid)
    .collection("post_interaction_state")
    .doc(target.entityId);

  if (active) {
    const batch = db.batch();
    const nowIso = new Date().toISOString();
    batch.set(
      bookmarkRef,
      {
        type: target.entityType,
        entityId: target.entityId,
        ...(target.extra ?? {}),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        version: 1,
      },
      { merge: true }
    );
    if (target.entityType === "post") {
      batch.set(
        viewerStateRef,
        {
          postId: target.entityId,
          bookmarked: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          version: 1,
        },
        { merge: true }
      );
    }
    if (
      target.entityType === "book" ||
      target.entityType === "author" ||
      target.entityType === "quote"
    ) {
      writeUserEntityInteraction(
        batch,
        db,
        toBookmarkInteraction({
          uid,
          entityType: target.entityType,
          entityId: target.entityId,
          occurredAt: nowIso,
        })
      );
    }
    if (target.entityType === "event") {
      batch.set(
        db.collection("events").doc(target.entityId).collection("rsvps").doc(uid),
        {
          userId: uid,
          eventId: target.entityId,
          status: "attending",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  } else {
    const batch = db.batch();
    const nowIso = new Date().toISOString();
    batch.delete(bookmarkRef);
    if (target.entityType === "post") {
      batch.set(
        viewerStateRef,
        {
          postId: target.entityId,
          bookmarked: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          version: 1,
        },
        { merge: true }
      );
    }
    if (
      target.entityType === "book" ||
      target.entityType === "author" ||
      target.entityType === "quote"
    ) {
      writeUserEntityInteraction(
        batch,
        db,
        toBookmarkInteraction({
          uid,
          entityType: target.entityType,
          entityId: target.entityId,
          occurredAt: nowIso,
          lifecycleState: "withdrawn",
        })
      );
    }
    await batch.commit();
  }

  return {
    bookmarked: active,
    bookmarkId: target.bookmarkId,
    entityId: target.entityId,
    entityType: target.entityType,
  };
});

export const followShelf = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const shelfId = parseInput(
    z.object({ shelfId: z.string().trim().min(1).max(190) }).strict(),
    request.data
  ).shelfId;

  const shelfRef = db.collection("shelves").doc(shelfId);
  const followerRef = shelfRef.collection("followers").doc(uid);

  await db.runTransaction(async (tx) => {
    const shelfSnap = await tx.get(shelfRef);
    if (!shelfSnap.exists) {
      throw new HttpsError("not-found", "Shelf not found.");
    }
    if (!canReadShelf(shelfSnap.data() as Record<string, unknown>, uid)) {
      throw new HttpsError("permission-denied", "Shelf is not followable.");
    }
    tx.set(
      followerRef,
      {
        uid,
        followedAt: admin.firestore.FieldValue.serverTimestamp(),
        version: 1,
      },
      { merge: true }
    );
  });

  return {
    shelfId,
    following: true,
  };
});
