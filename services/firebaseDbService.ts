import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  where,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";

import { getFirebaseDb } from "../lib/firebase.ts";

import {
  PostStats,
  UserStats,
  BookStats,
  ShelfStats,
} from "./db.types.ts";

import {
  User,
  Post,
  ThreadComment,
  RecommendedShelf,
  Shelf,
  Book,
} from "../types/entities.ts";

import { normalizePost } from "../lib/data-validation.ts";
import { FirebaseUploadService } from "./firebaseUploadService.ts";

/**
 * 🔒 AUTHORITATIVE Firebase Catalog Service
 * Reads canonical editions from Firestore
 * FIREBASE MODE — Production-grade, no mock leakage
 */
import { firebaseCatalogService } from "../lib/services/firebaseCatalogService.ts";

const getDb = () => {
  const db = getFirebaseDb();
  if (!db) return null as any;
  return db;
};

const cursorRegistry = new Map<string, QueryDocumentSnapshot<DocumentData>>();

/* =========================
   USERS
========================= */
class FirebaseUserService {
  async getProfile(uid: string): Promise<User> {
    const db = getDb();
    if (!db) throw new Error("Firebase not initialized");
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) throw new Error("User not found");
    return snap.data() as User;
  }

  async createProfile(uid: string, user: User): Promise<void> {
    const db = getDb();
    if (!db) return;
    await setDoc(doc(db, "users", uid), user);
  }

  async updateProfile(uid: string, data: Partial<User>): Promise<void> {
    const db = getDb();
    if (!db) return;
    await updateDoc(doc(db, "users", uid), data);
  }

  async getStats(uid: string): Promise<UserStats> {
    const db = getDb();
    if (!db) {
      return {
        followers: 0,
        following: 0,
        posts: 0,
        reviews: 0,
        booksRead: 0,
        booksPublished: 0,
        wordsWritten: 0,
        postsPublished: 0,
        shelvesCreated: 0,
        quotesAuthored: 0,
      };
    }

    const snap = await getDoc(doc(db, "user_stats", uid));

    if (!snap.exists()) {
      return {
        followers: 0,
        following: 0,
        posts: 0,
        reviews: 0,
        booksRead: 0,
        booksPublished: 0,
        wordsWritten: 0,
        postsPublished: 0,
        shelvesCreated: 0,
        quotesAuthored: 0,
      };
    }

    const data = snap.data() as Partial<UserStats>;

    return {
      followers: data.followers || 0,
      following: data.following || 0,
      posts: data.posts || 0,
      reviews: data.reviews || 0,
      booksRead: data.booksRead || 0,
      booksPublished: data.booksPublished || 0,
      wordsWritten: data.wordsWritten || 0,
      postsPublished: data.postsPublished || 0,
      shelvesCreated: data.shelvesCreated || 0,
      quotesAuthored: data.quotesAuthored || 0,
      profileCompletionScore: data.profileCompletionScore,
    };
  }
}

/* =========================
   SHELVES
========================= */
class FirebaseShelfService {
  async getUserShelves(uid: string): Promise<Shelf[]> {
    const db = getDb();
    if (!db) return [];
    const q = query(
      collection(db, "shelves"),
      where("ownerId", "==", uid),
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ ...d.data(), id: d.id })) as Shelf[];
  }

  async getShelf(ownerId: string, shelfId: string): Promise<Shelf> {
    const db = getDb();
    if (!db) throw new Error("Firebase not initialized");
    const snap = await getDoc(doc(db, "shelves", shelfId));
    if (!snap.exists()) throw new Error("Shelf not found");
    return { ...snap.data(), id: snap.id } as Shelf;
  }

  async createShelf(
    uid: string,
    data: { titleEn: string; titleAr: string; entries?: Record<string, any> }
  ): Promise<Shelf> {
    const db = getDb();
    if (!db) throw new Error("Firebase not initialized");

    const shelfRef = doc(collection(db, "shelves"));
    const shelfData = {
      ownerId: uid,
      titleEn: data.titleEn,
      titleAr: data.titleAr,
      entries: data.entries || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      isSystem: false,
    };

    await setDoc(shelfRef, shelfData);
    return { id: shelfRef.id, ...shelfData } as unknown as Shelf;
  }

  async updateShelf(uid: string, shelfId: string, updates: Partial<Shelf>): Promise<void> {
    const db = getDb();
    if (!db) return;
    const shelfRef = doc(db, "shelves", shelfId);
    await updateDoc(shelfRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  }

  async deleteShelf(uid: string, shelfId: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    await deleteDoc(doc(db, "shelves", shelfId));
  }

  async getShelfEntries(
    uid: string,
    shelfId: string,
    options?: { resolveBooks?: boolean }
  ): Promise<any[]> {
    const db = getDb();
    if (!db) return [];

    const shelfRef = doc(db, "shelves", shelfId);
    const snap = await getDoc(shelfRef);
    if (!snap.exists()) return [];

    const data = snap.data() as any;
    const entries = data?.entries || {};

    const rawEntries = Object.entries(entries).map(([bookId, entry]: any) => ({
      bookId,
      ...(entry || {}),
    }));

    if (options?.resolveBooks === false) {
      return rawEntries;
    }

    const hydrated = await Promise.all(
      rawEntries.map(async (entry) => {
        try {
          const book = await firebaseCatalogService.getBook(entry.bookId);
          return { ...entry, book };
        } catch (err) {
          if (entry.snapshot) {
            return {
              ...entry,
              book: {
                id: entry.bookId,
                titleEn: entry.snapshot.titleEn,
                titleAr: entry.snapshot.titleAr,
                coverImages: {
                  medium: entry.snapshot.coverUrl
                }
              }
            };
          }

          console.warn("[SHELF][HYDRATION_FAILED]", entry.bookId, err);
          return { ...entry, book: null };
        }
      })
    );

    return hydrated;
  }

  async addBookToShelf(uid: string, shelfId: string, bookId: string, book?: Book): Promise<void> {
    const db = getDb();
    if (!db) return;

    const shelfRef = doc(db, "shelves", shelfId);

    const snapshot = book ? {
      titleEn: book.titleEn || null,
      titleAr: book.titleAr || null,
      coverUrl: book.coverUrl || null,
    } : null;

    await updateDoc(shelfRef, {
      [`entries.${bookId}`]: {
        bookId,
        addedAt: new Date().toISOString(),
        snapshot,
      },
      updatedAt: serverTimestamp()
    });
  }

  async removeBookFromShelf(uid: string, shelfId: string, bookId: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    const shelfRef = doc(db, "shelves", shelfId);
    await updateDoc(shelfRef, {
      [`entries.${bookId}`]: deleteField(),
      updatedAt: serverTimestamp()
    });
  }

  async followShelf(uid: string, shelfId: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    const followRef = doc(db, "shelves", shelfId, "followers", uid);
    await setDoc(followRef, {
      uid,
      followedAt: serverTimestamp()
    });
  }

  async getStats(shelfId: string): Promise<ShelfStats> {
    const db = getDb();
    if (!db) return { followers: 0, posts: 0 };
    const snap = await getDoc(doc(db, "shelf_stats", shelfId));
    if (snap.exists()) {
      const data = snap.data();
      return {
        followers: data.followers || 0,
        posts: data.posts || 0
      };
    }
    return { followers: 0, posts: 0 };
  }

  async getRecommendedShelves(): Promise<RecommendedShelf[]> {
    return [];
  }
}

/* =========================
   SOCIAL
========================= */
class FirebaseSocialService {
  async getFeed(
    uid: string,
    scope: string,
    filters: string[] = [],
    cursorId?: string
  ): Promise<{ posts: Post[]; nextCursor?: string }> {
    const db = getDb();
    if (!db) return { posts: [], nextCursor: undefined };

    const PAGE_SIZE = 20;

    try {
      const postsRef = collection(db, "posts");
      const normScope = (scope || "explore").toLowerCase();

      let baseConstraints: any[] = [
        where("status", "==", "published"),
        where("isDeleted", "!=", true),
      ];

      if (normScope === "explore" || normScope === "discover") {
        baseConstraints.push(where("visibility", "==", "public"));
      } else if (normScope === "following") {
        baseConstraints.push(
          where("visibility", "in", ["public", "followers"])
        );
      } else if (normScope === "books") {
        baseConstraints.push(where("visibility", "==", "public"));
        baseConstraints.push(where("flags.hasAttachments", "==", true));
      }

      let q = query(
        postsRef,
        ...baseConstraints,
        orderBy("isDeleted"),
        orderBy("timestamps.createdAt", "desc"),
        orderBy("__name__", "desc"),
        limit(PAGE_SIZE)
      );

      if (cursorId && cursorRegistry.has(cursorId)) {
        const docSnap = cursorRegistry.get(cursorId);
        if (docSnap) q = query(q, startAfter(docSnap));
      }

      const snap = await getDocs(q);
      const posts = snap.docs.map((docRef) =>
        normalizePost({ ...docRef.data(), id: docRef.id })
      );

      const lastDoc = snap.docs[snap.docs.length - 1];
      let nextCursor: string | undefined;
      if (lastDoc && snap.docs.length === PAGE_SIZE) {
        nextCursor = lastDoc.id;
        cursorRegistry.set(nextCursor, lastDoc);
      }

      return { posts, nextCursor };
    } catch (error) {
      console.error("[SOCIAL][FEED_EXECUTION_ERROR]", error);
      throw error;
    }
  }

  async getComments(
    postId: string,
    cursorId?: string
  ): Promise<{ comments: ThreadComment[]; hasMore: boolean; nextCursor?: string }> {
    const db = getDb();
    if (!db) return { comments: [], hasMore: false };

    const PAGE_SIZE = 20;

    const commentsRef = collection(db, "posts", postId, "comments");
    let q = query(
      commentsRef,
      where("status", "==", "published"),
      orderBy("timestamp", "asc"),
      limit(PAGE_SIZE)
    );

    if (cursorId && cursorRegistry.has(cursorId)) {
      const docSnap = cursorRegistry.get(cursorId);
      if (docSnap) q = query(q, startAfter(docSnap));
    }

    const snap = await getDocs(q);
    const comments = snap.docs.map((docRef) => {
      const data = docRef.data();
      return {
        id: docRef.id,
        authorId: data.authorId,
        authorName: data.authorName,
        authorHandle: data.authorHandle,
        authorAvatar: data.authorAvatar,
        text: data.text,
        createdAt:
          data.timestamp?.toDate?.()?.toISOString() ||
          new Date().toISOString(),
        parentId: data.parentId || null,
        likesCount: data.likesCount || 0,
        liked: false,
      } as ThreadComment;
    });

    return {
      comments,
      hasMore: snap.docs.length === PAGE_SIZE,
      nextCursor: snap.docs.at(-1)?.id,
    };
  }
}

/* =========================
   FIREBASE DB SERVICE
========================= */
export const firebaseDbService: any = {
  users: new FirebaseUserService(),
  social: new FirebaseSocialService(),
  shelves: new FirebaseShelfService(),
  upload: new FirebaseUploadService(),

  /**
   * 🔒 Catalog is now FIRST-CLASS
   * No fallback. No proxy masking.
   */
  catalog: firebaseCatalogService,
};
