import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { recomputeUserStats } from "../userStats/recomputeUserStats";
import {
  buildSearchFieldsFromTextParts,
  normalizeSearchText,
} from "../search/normalization";

const db = admin.firestore();

const MAX_UID_LENGTH = 128;
const MAX_NAME_LENGTH = 80;
const MAX_HANDLE_LENGTH = 40;
const MAX_BIO_LENGTH = 500;
const MAX_URL_LENGTH = 2048;
const MAX_PROFILE_TAB_LIMIT = 30;
const DEFAULT_PROFILE_TAB_LIMIT = 20;
const DEFAULT_AVATAR_BASE = "https://api.dicebear.com/8.x/lorelei/svg?seed=";

type PublicProfile = {
  uid: string;
  name: string;
  handle: string;
  avatarUrl: string;
  bannerUrl: string;
  bioEn: string;
  bioAr: string;
  joinDate: string;
  updatedAt: string;
  followers: number;
  following: number;
};

type ProfilePost = {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  content: {
    text: string | null;
    attachments: Array<{
      attachmentId: string;
      type: string;
      role: string;
      renderHint: string;
    }>;
  };
  visibility: "public" | "followers" | "private" | "restricted";
  status: "published";
  counters: {
    likes: number;
    comments: number;
    reposts: number;
    bookmarks: number;
  };
  timestamps: {
    createdAt: string;
    updatedAt: string | null;
    publishedAt: string | null;
  };
  flags: {
    edited: boolean;
    hasAttachments: boolean;
  };
};

type ProfileReview = {
  id: string;
  bookId: string;
  userId: string;
  rating: number;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  timestamp: string;
  upvotes: number;
  downvotes: number;
  commentsCount: number;
};

type ProfileBook = {
  id: string;
  authorId: string;
  titleEn: string;
  titleAr: string;
  authorEn: string;
  authorAr: string;
  descriptionEn: string;
  descriptionAr: string;
  coverUrl: string;
  rating: number;
  ratingsCount: number;
  isEbookAvailable: boolean;
  genresEn: string[];
  genresAr: string[];
  publicationDate: string | null;
  pageCount: number | null;
  ebookAttachmentId?: string;
};

function buildProfileSearchFields(profile: {
  name: string;
  handle: string;
  bioEn: string;
  bioAr: string;
}) {
  const fields = buildSearchFieldsFromTextParts([
    profile.name,
    profile.handle,
    profile.bioEn,
    profile.bioAr,
  ]);

  return {
    nameNormalized: normalizeSearchText(profile.name),
    handleNormalized: normalizeSearchText(profile.handle),
    bioNormalized: normalizeSearchText(`${profile.bioEn} ${profile.bioAr}`),
    searchTokens: fields.tokens,
    searchPrefixes: fields.prefixes,
  };
}

function ensureUid(value: unknown, field = "uid"): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_UID_LENGTH) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return normalized;
}

function toIso(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const raw = (value as { toDate: () => Date }).toDate();
    if (!Number.isNaN(raw.getTime())) return raw.toISOString();
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return new Date().toISOString();
}

function sanitizeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().slice(0, MAX_NAME_LENGTH);
  return normalized || fallback;
}

function sanitizeHandle(value: unknown, uid: string): string {
  if (typeof value !== "string") return `@${uid.slice(0, 12)}`;
  const normalized = value.trim();
  if (!normalized) return `@${uid.slice(0, 12)}`;
  const withPrefix = normalized.startsWith("@") ? normalized : `@${normalized}`;
  return withPrefix.slice(0, MAX_HANDLE_LENGTH);
}

function sanitizeBio(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_BIO_LENGTH);
}

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function sanitizeStringArray(
  value: unknown,
  itemMaxLen: number,
  maxItems: number
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, itemMaxLen))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function toNullableIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toIso(value);
}

function resolveLimit(value: unknown): number {
  const numeric = toNonNegativeInt(value);
  if (numeric <= 0) return DEFAULT_PROFILE_TAB_LIMIT;
  return Math.min(MAX_PROFILE_TAB_LIMIT, Math.max(1, numeric));
}

function isHttpUrl(value: string): boolean {
  if (!value) return true;
  if (value.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrlForRead(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  if (!isHttpUrl(normalized)) return "";
  return normalized;
}

function sanitizeUrlForUpdate(value: unknown, fieldName: string): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  if (!isHttpUrl(normalized)) {
    throw new HttpsError("invalid-argument", `${fieldName} must use http/https.`);
  }
  return normalized;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  return 0;
}

function normalizePublicProfile(uid: string, source: Record<string, unknown>): PublicProfile {
  const safeUid = ensureUid(uid, "uid");
  const safeName = sanitizeName(source.name, "New User");
  const safeAvatar =
    normalizeUrlForRead(source.avatarUrl) ||
    `${DEFAULT_AVATAR_BASE}${encodeURIComponent(safeUid)}`;

  return {
    uid: safeUid,
    name: safeName,
    handle: sanitizeHandle(source.handle, safeUid),
    avatarUrl: safeAvatar,
    bannerUrl: normalizeUrlForRead(source.bannerUrl),
    bioEn: sanitizeBio(source.bioEn),
    bioAr: sanitizeBio(source.bioAr),
    joinDate: toIso(source.joinDate ?? source.createdAt),
    updatedAt: toIso(source.updatedAt ?? source.lastActive ?? source.createdAt),
    followers: toNonNegativeInt(source.followers ?? source.followerCount),
    following: toNonNegativeInt(source.following ?? source.followingCount),
  };
}

function normalizeAttachmentRefs(
  value: unknown
): Array<{
  attachmentId: string;
  type: string;
  role: string;
  renderHint: string;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => {
      const item = toRecord(raw);
      const attachmentId = sanitizeString(item.attachmentId, 256);
      if (!attachmentId) return null;
      return {
        attachmentId,
        type: sanitizeString(item.type, 64) || "IMAGE",
        role: sanitizeString(item.role, 32) || "primary",
        renderHint: sanitizeString(item.renderHint, 32) || "card",
      };
    })
    .filter(
      (
        item
      ): item is {
        attachmentId: string;
        type: string;
        role: string;
        renderHint: string;
      } => item !== null
    );
}

function normalizeProfilePost(docId: string, source: Record<string, unknown>): ProfilePost {
  const content = toRecord(source.content);
  const counters = toRecord(source.counters);
  const timestamps = toRecord(source.timestamps);
  const flags = toRecord(source.flags);
  const authorId = sanitizeString(source.authorId, MAX_UID_LENGTH);
  const attachmentRefs = normalizeAttachmentRefs(content.attachments);

  return {
    id: sanitizeString(docId, 128),
    authorId,
    authorName: sanitizeString(source.authorName, 120) || "Unknown",
    authorHandle: sanitizeHandle(source.authorHandle, authorId || "user"),
    authorAvatar:
      normalizeUrlForRead(source.authorAvatar) ||
      `${DEFAULT_AVATAR_BASE}${encodeURIComponent(authorId || docId)}`,
    content: {
      text:
        typeof content.text === "string" ? sanitizeString(content.text, 10000) : null,
      attachments: attachmentRefs,
    },
    visibility:
      source.visibility === "followers" ||
      source.visibility === "private" ||
      source.visibility === "restricted"
        ? source.visibility
        : "public",
    status: "published",
    counters: {
      likes: toNonNegativeInt(counters.likes),
      comments: toNonNegativeInt(counters.comments),
      reposts: toNonNegativeInt(counters.reposts),
      bookmarks: toNonNegativeInt(counters.bookmarks),
    },
    timestamps: {
      createdAt: toIso(
        timestamps.createdAt ?? source.createdAt ?? source.timestamp ?? new Date().toISOString()
      ),
      updatedAt: toNullableIso(timestamps.updatedAt ?? source.updatedAt),
      publishedAt: toNullableIso(timestamps.publishedAt ?? source.publishedAt),
    },
    flags: {
      edited: flags.edited === true || source.isEdited === true,
      hasAttachments: flags.hasAttachments === true || attachmentRefs.length > 0,
    },
  };
}

function canViewPost(
  post: ProfilePost,
  viewerUid: string,
  targetUid: string,
  viewerFollowsTarget: boolean,
  source?: Record<string, unknown>
): boolean {
  if (viewerUid === targetUid) return true;
  if (post.visibility === "public") return true;
  if (post.visibility === "followers") return viewerFollowsTarget;
  if (post.visibility === "private") return false;
  const allowedUserIds = Array.isArray(source?.allowedUserIds)
    ? source.allowedUserIds.filter((item): item is string => typeof item === "string")
    : [];
  return allowedUserIds.includes(viewerUid);
}

function normalizeProfileReview(
  docId: string,
  source: Record<string, unknown>,
  fallbackBookId: string
): ProfileReview {
  return {
    id: sanitizeString(docId, 128),
    bookId: sanitizeString(source.bookId, 128) || fallbackBookId,
    userId: sanitizeString(source.userId, MAX_UID_LENGTH),
    rating: Math.min(5, Math.max(1, toNonNegativeInt(source.rating) || 1)),
    text: sanitizeString(source.text, 2000),
    authorName: sanitizeString(source.authorName, 120),
    authorHandle: sanitizeString(source.authorHandle, 120),
    authorAvatar: normalizeUrlForRead(source.authorAvatar),
    timestamp: toIso(source.updatedAt ?? source.timestamp ?? source.createdAt),
    upvotes: toNonNegativeInt(source.upvotes),
    downvotes: toNonNegativeInt(source.downvotes),
    commentsCount: toNonNegativeInt(source.commentsCount),
  };
}

function normalizeProfileBook(docId: string, source: Record<string, unknown>): ProfileBook {
  const titleEn = sanitizeString(source.titleEn ?? source.title, 300);
  const titleAr = sanitizeString(source.titleAr, 300);
  const authorEn = sanitizeString(source.authorEn ?? source.author, 300);
  const authorAr = sanitizeString(source.authorAr, 300);

  return {
    id: sanitizeString(docId, 128),
    authorId: sanitizeString(source.authorId, 128) || "author_unknown",
    titleEn,
    titleAr,
    authorEn,
    authorAr,
    descriptionEn: sanitizeString(source.descriptionEn ?? source.description, 5000),
    descriptionAr: sanitizeString(source.descriptionAr, 5000),
    coverUrl: normalizeUrlForRead(
      source.coverUrl ?? toRecord(source.cover).medium ?? toRecord(source.cover).original
    ),
    rating:
      typeof source.rating === "number" && Number.isFinite(source.rating)
        ? Math.max(0, source.rating)
        : 0,
    ratingsCount: toNonNegativeInt(source.ratingsCount),
    isEbookAvailable: source.isEbookAvailable === true || source.hasEbook === true,
    genresEn: sanitizeStringArray(source.genresEn ?? source.categories, 120, 30),
    genresAr: sanitizeStringArray(source.genresAr, 120, 30),
    publicationDate: sanitizeString(source.publicationDate, 64) || null,
    pageCount: (() => {
      const value = toNonNegativeInt(source.pageCount);
      return value > 0 ? value : null;
    })(),
    ...(typeof source.ebookAttachmentId === "string" &&
    source.ebookAttachmentId.trim().length > 0
      ? { ebookAttachmentId: source.ebookAttachmentId.trim().slice(0, 256) }
      : {}),
  };
}

async function resolveFollowStats(uid: string, fallback: PublicProfile): Promise<{
  followers: number;
  following: number;
}> {
  const statsSnap = await db.collection("user_stats").doc(uid).get();
  if (!statsSnap.exists) {
    return {
      followers: fallback.followers,
      following: fallback.following,
    };
  }

  const stats = statsSnap.data() || {};
  const counters = (stats.counters || {}) as Record<string, unknown>;

  return {
    followers: toNonNegativeInt(
      stats.followers ?? counters.followers ?? fallback.followers
    ),
    following: toNonNegativeInt(
      stats.following ?? counters.following ?? fallback.following
    ),
  };
}

async function readOrCreatePublicProfile(uid: string): Promise<PublicProfile | null> {
  const publicRef = db.collection("public_profiles").doc(uid);
  const publicSnap = await publicRef.get();

  if (publicSnap.exists) {
    return normalizePublicProfile(uid, publicSnap.data() || {});
  }

  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    return null;
  }

  const profile = normalizePublicProfile(uid, userSnap.data() || {});
  const searchFields = buildProfileSearchFields(profile);
  await publicRef.set(
    {
      uid: profile.uid,
      name: profile.name,
      handle: profile.handle,
      avatarUrl: profile.avatarUrl,
      bannerUrl: profile.bannerUrl,
      bioEn: profile.bioEn,
      bioAr: profile.bioAr,
      joinDate: profile.joinDate,
      updatedAt: profile.updatedAt,
      followerCount: profile.followers,
      followingCount: profile.following,
      ...searchFields,
    },
    { merge: true }
  );

  return profile;
}

async function isViewerFollowingTarget(
  viewerUid: string,
  targetUid: string
): Promise<boolean> {
  if (!viewerUid || !targetUid || viewerUid === targetUid) return true;
  const followSnap = await db
    .collection("users")
    .doc(targetUid)
    .collection("followers")
    .doc(viewerUid)
    .get();
  return followSnap.exists;
}

export const getPublicProfile = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = ensureUid(request.data?.uid, "uid");
  const profile = await readOrCreatePublicProfile(uid);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found.");
  }

  const followStats = await resolveFollowStats(uid, profile);

  return {
    ...profile,
    followers: followStats.followers,
    following: followStats.following,
  };
});

export const updateOwnProfile = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = ensureUid(request.auth.uid, "auth.uid");
  const updates = (request.data?.updates || {}) as Record<string, unknown>;
  const nowIso = new Date().toISOString();

  const userUpdates: Record<string, unknown> = {
    updatedAt: nowIso,
    lastActive: nowIso,
  };
  const publicUpdates: Record<string, unknown> = {
    updatedAt: nowIso,
  };
  const changedFields: string[] = [];

  if ("name" in updates) {
    const name = sanitizeName(updates.name, "");
    if (!name) {
      throw new HttpsError("invalid-argument", "name must not be empty.");
    }
    userUpdates.name = name;
    publicUpdates.name = name;
    changedFields.push("name");
  }

  if ("bioEn" in updates) {
    const bioEn = sanitizeBio(updates.bioEn);
    userUpdates.bioEn = bioEn;
    publicUpdates.bioEn = bioEn;
    changedFields.push("bioEn");
  }

  if ("bioAr" in updates) {
    const bioAr = sanitizeBio(updates.bioAr);
    userUpdates.bioAr = bioAr;
    publicUpdates.bioAr = bioAr;
    changedFields.push("bioAr");
  }

  if ("avatarUrl" in updates) {
    const avatarUrl = sanitizeUrlForUpdate(updates.avatarUrl, "avatarUrl");
    if (!avatarUrl) {
      throw new HttpsError("invalid-argument", "avatarUrl must not be empty.");
    }
    userUpdates.avatarUrl = avatarUrl;
    publicUpdates.avatarUrl = avatarUrl;
    changedFields.push("avatarUrl");
  }

  if ("bannerUrl" in updates) {
    const bannerUrl = sanitizeUrlForUpdate(updates.bannerUrl, "bannerUrl");
    userUpdates.bannerUrl = bannerUrl;
    publicUpdates.bannerUrl = bannerUrl;
    changedFields.push("bannerUrl");
  }

  if ("aiConsent" in updates) {
    if (typeof updates.aiConsent !== "boolean") {
      throw new HttpsError("invalid-argument", "aiConsent must be boolean.");
    }
    userUpdates.aiConsent = updates.aiConsent;
    changedFields.push("aiConsent");
  }

  if (changedFields.length === 0) {
    throw new HttpsError("invalid-argument", "No valid profile fields were provided.");
  }

  const userRef = db.collection("users").doc(uid);
  const publicRef = db.collection("public_profiles").doc(uid);

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new HttpsError("failed-precondition", "Profile is not initialized.");
    }

    const current = userSnap.data() || {};
    const normalizedCurrent = normalizePublicProfile(uid, current);
    const resolvedName =
      "name" in publicUpdates
        ? String(publicUpdates.name)
        : normalizedCurrent.name;
    const resolvedBioEn =
      "bioEn" in publicUpdates
        ? String(publicUpdates.bioEn)
        : normalizedCurrent.bioEn;
    const resolvedBioAr =
      "bioAr" in publicUpdates
        ? String(publicUpdates.bioAr)
        : normalizedCurrent.bioAr;
    const searchFields = buildProfileSearchFields({
      name: resolvedName,
      handle: normalizedCurrent.handle,
      bioEn: resolvedBioEn,
      bioAr: resolvedBioAr,
    });
    tx.set(userRef, userUpdates, { merge: true });
    tx.set(
      publicRef,
      {
        uid,
        name: ("name" in publicUpdates ? publicUpdates.name : normalizedCurrent.name),
        handle: normalizedCurrent.handle,
        avatarUrl:
          "avatarUrl" in publicUpdates
            ? publicUpdates.avatarUrl
            : normalizedCurrent.avatarUrl,
        bannerUrl:
          "bannerUrl" in publicUpdates
            ? publicUpdates.bannerUrl
            : normalizedCurrent.bannerUrl,
        bioEn: "bioEn" in publicUpdates ? publicUpdates.bioEn : normalizedCurrent.bioEn,
        bioAr: "bioAr" in publicUpdates ? publicUpdates.bioAr : normalizedCurrent.bioAr,
        joinDate: normalizedCurrent.joinDate,
        updatedAt: nowIso,
        ...searchFields,
      },
      { merge: true }
    );
  });

  if (
    changedFields.includes("bioEn") ||
    changedFields.includes("bioAr") ||
    changedFields.includes("avatarUrl")
  ) {
    try {
      await recomputeUserStats(uid);
    } catch (error) {
      logger.error("[PROFILE][RECOMPUTE_FAILED]", { uid, error });
    }
  }

  return {
    updated: true,
    changedFields,
    updatedAt: nowIso,
  };
});

export const followUser = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const followerUid = ensureUid(request.auth.uid, "auth.uid");
  const targetUid = ensureUid(request.data?.targetUid, "targetUid");

  if (followerUid === targetUid) {
    throw new HttpsError("invalid-argument", "You cannot follow yourself.");
  }

  const targetProfile = await readOrCreatePublicProfile(targetUid);
  if (!targetProfile) {
    throw new HttpsError("not-found", "Target profile not found.");
  }

  const followerRef = db.doc(`users/${targetUid}/followers/${followerUid}`);
  const followingRef = db.doc(`users/${followerUid}/following/${targetUid}`);
  const createdAt = new Date().toISOString();

  await db.runTransaction(async (tx) => {
    const existing = await tx.get(followerRef);
    if (existing.exists) return;

    tx.set(followerRef, {
      uid: followerUid,
      targetUid,
      createdAt,
    });

    tx.set(followingRef, {
      uid: targetUid,
      targetUid,
      createdAt,
    });
  });

  return {
    targetUid,
    following: true,
  };
});

export const unfollowUser = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const followerUid = ensureUid(request.auth.uid, "auth.uid");
  const targetUid = ensureUid(request.data?.targetUid, "targetUid");

  if (followerUid === targetUid) {
    throw new HttpsError("invalid-argument", "You cannot unfollow yourself.");
  }

  const followerRef = db.doc(`users/${targetUid}/followers/${followerUid}`);
  const followingRef = db.doc(`users/${followerUid}/following/${targetUid}`);

  await db.runTransaction(async (tx) => {
    tx.delete(followerRef);
    tx.delete(followingRef);
  });

  return {
    targetUid,
    following: false,
  };
});

export const getSuggestedProfiles = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const requesterUid = ensureUid(request.auth.uid, "auth.uid");
  const requestedLimit = toNonNegativeInt(request.data?.limit);
  const limitSize = Math.min(30, Math.max(1, requestedLimit || 20));

  const snap = await db
    .collection("public_profiles")
    .orderBy("updatedAt", "desc")
    .limit(limitSize + 10)
    .get();

  const profiles: PublicProfile[] = [];
  for (const docSnap of snap.docs) {
    if (docSnap.id === requesterUid) continue;
    profiles.push(normalizePublicProfile(docSnap.id, docSnap.data() || {}));
    if (profiles.length >= limitSize) break;
  }

  return profiles;
});

export const listProfilePosts = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const viewerUid = ensureUid(request.auth.uid, "auth.uid");
  const targetUid = ensureUid(request.data?.uid, "uid");
  const limitSize = resolveLimit(request.data?.limit);

  const profile = await readOrCreatePublicProfile(targetUid);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found.");
  }

  const viewerFollowsTarget = await isViewerFollowingTarget(viewerUid, targetUid);
  const snap = await db
    .collection("posts")
    .where("authorId", "==", targetUid)
    .where("status", "==", "published")
    .orderBy("timestamps.createdAt", "desc")
    .limit(Math.min(120, limitSize * 4))
    .get();

  const items: ProfilePost[] = [];
  let hasMore = false;

  for (const postDoc of snap.docs) {
    const source = toRecord(postDoc.data());
    if (source.isDeleted === true) continue;

    const normalizedPost = normalizeProfilePost(postDoc.id, source);
    if (
      !canViewPost(
        normalizedPost,
        viewerUid,
        targetUid,
        viewerFollowsTarget,
        source
      )
    ) {
      continue;
    }

    items.push(normalizedPost);
    if (items.length >= limitSize) {
      hasMore = true;
      break;
    }
  }

  return {
    items,
    hasMore,
  };
});

export const listProfileReviews = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const targetUid = ensureUid(request.data?.uid, "uid");
  const limitSize = resolveLimit(request.data?.limit);

  const profile = await readOrCreatePublicProfile(targetUid);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found.");
  }

  const snap = await db
    .collectionGroup("reviews")
    .where("userId", "==", targetUid)
    .orderBy("updatedAt", "desc")
    .limit(Math.min(120, limitSize * 4))
    .get();

  const items: ProfileReview[] = [];
  let hasMore = false;

  for (const reviewDoc of snap.docs) {
    const parentDoc = reviewDoc.ref.parent.parent;
    const grandCollectionId = parentDoc?.parent?.id;
    if (grandCollectionId !== "books") continue;

    const fallbackBookId = sanitizeString(parentDoc?.id, 128);
    if (!fallbackBookId) continue;

    const normalizedReview = normalizeProfileReview(
      reviewDoc.id,
      toRecord(reviewDoc.data()),
      fallbackBookId
    );
    if (!normalizedReview.userId) {
      normalizedReview.userId = targetUid;
    }
    items.push(normalizedReview);
    if (items.length >= limitSize) {
      hasMore = true;
      break;
    }
  }

  return {
    items,
    hasMore,
  };
});

export const listProfileBooks = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const targetUid = ensureUid(request.data?.uid, "uid");
  const limitSize = resolveLimit(request.data?.limit);

  const profile = await readOrCreatePublicProfile(targetUid);
  if (!profile) {
    throw new HttpsError("not-found", "Profile not found.");
  }

  const librarySnap = await db
    .collection("user_library_books")
    .where("uid", "==", targetUid)
    .orderBy("updatedAt", "desc")
    .limit(limitSize + 10)
    .get();

  const orderedBookIds: string[] = [];
  const seen = new Set<string>();
  for (const libraryDoc of librarySnap.docs) {
    const bookId = sanitizeString(libraryDoc.data().bookId, 128);
    if (!bookId || seen.has(bookId)) continue;
    seen.add(bookId);
    orderedBookIds.push(bookId);
  }

  const selectedBookIds = orderedBookIds.slice(0, limitSize);
  const bookSnaps = await Promise.all(
    selectedBookIds.map((bookId) => db.collection("books").doc(bookId).get())
  );

  const items: ProfileBook[] = [];
  for (const bookSnap of bookSnaps) {
    if (!bookSnap.exists) continue;
    items.push(normalizeProfileBook(bookSnap.id, toRecord(bookSnap.data())));
  }

  return {
    items,
    hasMore: orderedBookIds.length > limitSize,
  };
});
