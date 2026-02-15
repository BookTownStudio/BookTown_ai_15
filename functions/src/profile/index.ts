import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { recomputeUserStats } from "../userStats/recomputeUserStats";

const db = admin.firestore();

const MAX_UID_LENGTH = 128;
const MAX_NAME_LENGTH = 80;
const MAX_HANDLE_LENGTH = 40;
const MAX_BIO_LENGTH = 500;
const MAX_URL_LENGTH = 2048;
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
    },
    { merge: true }
  );

  return profile;
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
