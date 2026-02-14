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
  Venue,
  Event,
  VenueReview,
  Bookmark,
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

const MAX_VENUE_SEARCH_RESULTS = 25;
const MAX_REVIEW_LENGTH = 1000;
const MAX_VENUE_FIELD_LENGTH = 240;

const toIsoString = (value: any): string => {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  if (typeof value?.toDate === "function") {
    return value.toDate().toISOString();
  }
  return new Date().toISOString();
};

const normalizeString = (value: unknown, maxLength: number): string =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const ensureNonEmptyString = (
  value: unknown,
  fieldName: string,
  maxLength = MAX_VENUE_FIELD_LENGTH
): string => {
  const normalized = normalizeString(value, maxLength);
  if (!normalized) {
    throw new Error(`INVALID_ARGUMENT: ${fieldName} is required.`);
  }
  return normalized;
};

const normalizeOptionalString = (
  value: unknown,
  maxLength = MAX_VENUE_FIELD_LENGTH
): string | undefined => {
  const normalized = normalizeString(value, maxLength);
  return normalized || undefined;
};

const normalizeIsoDate = (value: unknown, fieldName: string): string => {
  const input = ensureNonEmptyString(value, fieldName, 64);
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`INVALID_ARGUMENT: ${fieldName} must be a valid datetime.`);
  }
  return parsed.toISOString();
};

const ensureHttpsUrl = (value: unknown, fieldName: string): string => {
  const input = ensureNonEmptyString(value, fieldName, 1024);
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error(`INVALID_ARGUMENT: ${fieldName} must be a valid URL.`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(`INVALID_ARGUMENT: ${fieldName} must use http/https.`);
  }
  return parsed.toString();
};

const stripUndefined = <T extends Record<string, any>>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as T;

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

  async getBookmarks(uid: string): Promise<Bookmark[]> {
    const db = getDb();
    if (!db) return [];

    const q = query(
      collection(db, "users", uid, "bookmarks"),
      orderBy("timestamp", "desc"),
      limit(200)
    );

    const snap = await getDocs(q);

    return snap.docs
      .map((bookmarkDoc) => {
        const data = bookmarkDoc.data() as Record<string, unknown>;
        const typeValue = typeof data.type === "string" ? data.type : null;
        const entityIdValue =
          typeof data.entityId === "string" && data.entityId.trim()
            ? data.entityId.trim()
            : null;

        if (!typeValue || !entityIdValue) {
          return null;
        }

        return {
          id: bookmarkDoc.id,
          type: typeValue as Bookmark["type"],
          entityId: entityIdValue,
          timestamp: toIsoString(data.timestamp),
          ...(typeof data.quoteOwnerId === "string" && data.quoteOwnerId.trim()
            ? { quoteOwnerId: data.quoteOwnerId.trim() }
            : {}),
        } satisfies Bookmark;
      })
      .filter((bookmark): bookmark is Bookmark => bookmark !== null);
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
    const canonicalEntries =
      data?.entries && typeof data.entries === 'object'
        ? data.entries
        : {};

    // Backward-compatibility: older upload flow wrote keys like "entries.<bookId>"
    // as top-level fields. Merge them into the effective entries map for rendering.
    const legacyEntries: Record<string, any> = {};
    for (const [key, value] of Object.entries(data || {})) {
      if (!key.startsWith('entries.')) continue;
      if (!value || typeof value !== 'object') continue;

      const legacyBookId = key.slice('entries.'.length).trim();
      if (!legacyBookId) continue;

      legacyEntries[legacyBookId] = value;
    }

    const entries = {
      ...legacyEntries,
      ...canonicalEntries,
    };

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
                authorId: '',
                authorEn: '',
                authorAr: '',
                coverUrl: entry.snapshot.coverUrl || '',
                descriptionEn: '',
                descriptionAr: '',
                genresEn: [],
                genresAr: [],
                rating: 0,
                ratingsCount: 0,
                isEbookAvailable: false
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
   VENUES
========================= */
class FirebaseVenueService {
  private requireDb() {
    const db = getDb();
    if (!db) throw new Error("Firebase not initialized");
    return db;
  }

  private async resolveEntity(venueId: string): Promise<{
    collectionName: "venues" | "events";
    data: any;
  }> {
    const db = this.requireDb();
    const normalizedId = ensureNonEmptyString(venueId, "venueId", 128);

    const venueRef = doc(db, "venues", normalizedId);
    const venueSnap = await getDoc(venueRef);
    if (venueSnap.exists()) {
      return { collectionName: "venues", data: { id: venueSnap.id, ...venueSnap.data() } };
    }

    const eventRef = doc(db, "events", normalizedId);
    const eventSnap = await getDoc(eventRef);
    if (eventSnap.exists()) {
      return { collectionName: "events", data: { id: eventSnap.id, ...eventSnap.data() } };
    }

    throw new Error("NOT_FOUND: Venue or event not found.");
  }

  private mapVenue(data: any): Venue {
    return {
      id: data.id,
      ownerId: data.ownerId,
      name: data.name,
      type: data.type,
      address: data.address,
      imageUrl: data.imageUrl,
      descriptionEn: data.descriptionEn || "",
      descriptionAr: data.descriptionAr || "",
      openingHours: data.openingHours || "",
      rating: typeof data.rating === "number" ? data.rating : undefined,
      ratingsCount: typeof data.ratingsCount === "number" ? data.ratingsCount : undefined,
      websiteUrl: data.websiteUrl || undefined,
      phone: data.phone || undefined,
    };
  }

  private mapEvent(data: any): Event {
    return {
      id: data.id,
      ownerId: data.ownerId,
      titleEn: data.titleEn,
      titleAr: data.titleAr,
      type: data.type,
      dateTime: data.dateTime,
      imageUrl: data.imageUrl,
      privacy: data.privacy === "private" ? "private" : "public",
      duration: data.duration || undefined,
      isOnline: Boolean(data.isOnline),
      venueName: data.venueName || undefined,
      link: data.link || undefined,
    };
  }

  async searchVenues(queryText: string): Promise<(Venue | Event)[]> {
    const db = this.requireDb();
    const normalizedQuery = normalizeString(queryText, 120).toLowerCase();

    const venuesRef = collection(db, "venues");
    const eventsRef = collection(db, "events");

    const venuesQuery = normalizedQuery.length >= 2
      ? query(
          venuesRef,
          where("nameLower", ">=", normalizedQuery),
          where("nameLower", "<=", `${normalizedQuery}\uf8ff`),
          orderBy("nameLower"),
          limit(MAX_VENUE_SEARCH_RESULTS)
        )
      : query(venuesRef, orderBy("updatedAt", "desc"), limit(MAX_VENUE_SEARCH_RESULTS));

    const eventsQuery = normalizedQuery.length >= 2
      ? query(
          eventsRef,
          where("titleLower", ">=", normalizedQuery),
          where("titleLower", "<=", `${normalizedQuery}\uf8ff`),
          orderBy("titleLower"),
          limit(MAX_VENUE_SEARCH_RESULTS)
        )
      : query(eventsRef, orderBy("dateTime", "asc"), limit(MAX_VENUE_SEARCH_RESULTS));

    const [venuesSnap, eventsSnap] = await Promise.all([
      getDocs(venuesQuery),
      getDocs(eventsQuery),
    ]);

    const venues = venuesSnap.docs.map((snap) =>
      this.mapVenue({ id: snap.id, ...snap.data() })
    );
    const events = eventsSnap.docs.map((snap) =>
      this.mapEvent({ id: snap.id, ...snap.data() })
    );

    return [...venues, ...events];
  }

  async getVenue(venueId: string): Promise<Venue | Event> {
    const entity = await this.resolveEntity(venueId);
    if (entity.collectionName === "venues") {
      return this.mapVenue(entity.data);
    }
    return this.mapEvent(entity.data);
  }

  async getVenueReviews(venueId: string): Promise<VenueReview[]> {
    const db = this.requireDb();
    const entity = await this.resolveEntity(venueId);
    const reviewsRef = collection(db, entity.collectionName, venueId, "reviews");
    const reviewsQuery = query(reviewsRef, orderBy("timestamp", "desc"), limit(100));
    const reviewsSnap = await getDocs(reviewsQuery);

    return reviewsSnap.docs.map((snap) => {
      const data = snap.data() as any;
      return {
        id: snap.id,
        venueId,
        userId: data.userId,
        rating: data.rating,
        text: data.text || "",
        authorName: data.authorName || "Unknown",
        authorHandle: data.authorHandle || "@unknown",
        authorAvatar: data.authorAvatar || "",
        timestamp: toIsoString(data.timestamp),
        upvotes: data.upvotes || 0,
        downvotes: data.downvotes || 0,
        commentsCount: data.commentsCount || 0,
      };
    });
  }

  async submitVenueReview(
    uid: string,
    venueId: string,
    rating: number,
    text: string
  ): Promise<void> {
    const db = this.requireDb();
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedVenueId = ensureNonEmptyString(venueId, "venueId", 128);
    const normalizedText = normalizeString(text, MAX_REVIEW_LENGTH);
    const normalizedRating = Number(rating);

    if (!Number.isFinite(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
      throw new Error("INVALID_ARGUMENT: rating must be between 1 and 5.");
    }

    const entity = await this.resolveEntity(normalizedVenueId);
    const userSnap = await getDoc(doc(db, "users", normalizedUid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    const reviewRef = doc(collection(db, entity.collectionName, normalizedVenueId, "reviews"));
    await setDoc(reviewRef, {
      venueId: normalizedVenueId,
      userId: normalizedUid,
      rating: Math.round(normalizedRating),
      text: normalizedText,
      authorName: normalizeString(userData?.name || userData?.displayName || "Unknown", 120),
      authorHandle: normalizeString(userData?.handle || "@unknown", 120),
      authorAvatar: normalizeOptionalString(userData?.avatarUrl, 1024) || "",
      upvotes: 0,
      downvotes: 0,
      commentsCount: 0,
      timestamp: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  async createVenue(
    uid: string,
    data: Omit<Venue, "id" | "ownerId"> | Omit<Event, "id" | "ownerId">
  ): Promise<void> {
    const db = this.requireDb();
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);

    if ("dateTime" in data) {
      const titleEn = ensureNonEmptyString(data.titleEn, "titleEn");
      const titleAr = normalizeOptionalString(data.titleAr) || titleEn;
      const type = ensureNonEmptyString(data.type, "type");
      const dateTime = normalizeIsoDate(data.dateTime, "dateTime");
      const imageUrl = ensureHttpsUrl(data.imageUrl, "imageUrl");
      const isOnline = Boolean(data.isOnline);
      const venueName = isOnline ? undefined : ensureNonEmptyString(data.venueName, "venueName");
      const link = isOnline ? ensureHttpsUrl(data.link, "link") : undefined;

      const eventRef = doc(collection(db, "events"));
      await setDoc(eventRef, stripUndefined({
        ownerId: normalizedUid,
        titleEn,
        titleAr,
        titleLower: titleEn.toLowerCase(),
        type,
        typeLower: type.toLowerCase(),
        dateTime,
        imageUrl,
        privacy: data.privacy === "private" ? "private" : "public",
        duration: normalizeOptionalString(data.duration),
        isOnline,
        venueName,
        link,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
      return;
    }

    const name = ensureNonEmptyString(data.name, "name");
    const type = ensureNonEmptyString(data.type, "type");
    const address = ensureNonEmptyString(data.address, "address");
    const imageUrl = ensureHttpsUrl(data.imageUrl, "imageUrl");

    const venueRef = doc(collection(db, "venues"));
    await setDoc(venueRef, stripUndefined({
      ownerId: normalizedUid,
      name,
      nameLower: name.toLowerCase(),
      type,
      typeLower: type.toLowerCase(),
      address,
      imageUrl,
      openingHours: normalizeOptionalString(data.openingHours),
      descriptionEn: normalizeOptionalString(data.descriptionEn, 2000) || "",
      descriptionAr: normalizeOptionalString(data.descriptionAr, 2000) || "",
      rating: 0,
      ratingsCount: 0,
      websiteUrl: normalizeOptionalString(data.websiteUrl, 1024),
      phone: normalizeOptionalString(data.phone, 64),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
  }

  async updateVenue(uid: string, venueId: string, data: Venue | Event): Promise<void> {
    const db = this.requireDb();
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedVenueId = ensureNonEmptyString(venueId, "venueId", 128);
    const entity = await this.resolveEntity(normalizedVenueId);

    if (entity.data.ownerId !== normalizedUid) {
      throw new Error("PERMISSION_DENIED: Only the owner can update this item.");
    }

    if (entity.collectionName === "events") {
      const eventData = data as Event;
      const titleEn = ensureNonEmptyString(eventData.titleEn, "titleEn");
      const titleAr = normalizeOptionalString(eventData.titleAr) || titleEn;
      const type = ensureNonEmptyString(eventData.type, "type");
      const dateTime = normalizeIsoDate(eventData.dateTime, "dateTime");
      const imageUrl = ensureHttpsUrl(eventData.imageUrl, "imageUrl");
      const isOnline = Boolean(eventData.isOnline);

      await updateDoc(doc(db, "events", normalizedVenueId), stripUndefined({
        titleEn,
        titleAr,
        titleLower: titleEn.toLowerCase(),
        type,
        typeLower: type.toLowerCase(),
        dateTime,
        imageUrl,
        privacy: eventData.privacy === "private" ? "private" : "public",
        duration: normalizeOptionalString(eventData.duration),
        isOnline,
        venueName: isOnline ? undefined : ensureNonEmptyString(eventData.venueName, "venueName"),
        link: isOnline ? ensureHttpsUrl(eventData.link, "link") : undefined,
        updatedAt: serverTimestamp(),
      }));
      return;
    }

    const venueData = data as Venue;
    const name = ensureNonEmptyString(venueData.name, "name");
    const type = ensureNonEmptyString(venueData.type, "type");
    const address = ensureNonEmptyString(venueData.address, "address");
    const imageUrl = ensureHttpsUrl(venueData.imageUrl, "imageUrl");

    await updateDoc(doc(db, "venues", normalizedVenueId), stripUndefined({
      name,
      nameLower: name.toLowerCase(),
      type,
      typeLower: type.toLowerCase(),
      address,
      imageUrl,
      openingHours: normalizeOptionalString(venueData.openingHours),
      descriptionEn: normalizeOptionalString(venueData.descriptionEn, 2000) || "",
      descriptionAr: normalizeOptionalString(venueData.descriptionAr, 2000) || "",
      websiteUrl: normalizeOptionalString(venueData.websiteUrl, 1024),
      phone: normalizeOptionalString(venueData.phone, 64),
      updatedAt: serverTimestamp(),
    }));
  }

  async saveVenue(uid: string, venueId: string): Promise<void> {
    const db = this.requireDb();
    const normalizedUid = ensureNonEmptyString(uid, "uid", 128);
    const normalizedVenueId = ensureNonEmptyString(venueId, "venueId", 128);
    const entity = await this.resolveEntity(normalizedVenueId);
    const bookmarkType = entity.collectionName === "events" ? "event" : "venue";

    await setDoc(
      doc(db, "users", normalizedUid, "bookmarks", normalizedVenueId),
      {
        type: bookmarkType,
        entityId: normalizedVenueId,
        timestamp: serverTimestamp(),
        version: 1,
      },
      { merge: true }
    );
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
  venues: new FirebaseVenueService(),
  upload: new FirebaseUploadService(),

  /**
   * 🔒 Catalog is now FIRST-CLASS
   * No fallback. No proxy masking.
   */
  catalog: firebaseCatalogService,
};
