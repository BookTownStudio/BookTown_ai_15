import { admin } from "../firebaseAdmin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, WriteBatch } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { recomputeUserStats } from "../userStats/recomputeUserStats";
import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import { buildSearchFieldsFromTextParts, normalizeSearchText } from "../search/normalization";
import { canonicalizeRoleClaim } from "../shared/auth";

const db = admin.firestore();

const DEFAULT_SHELF_METADATA = [
  { id: "want-to-read", titleEn: "Want to Read", titleAr: "أرغب في قراءته" },
  { id: "finished", titleEn: "Finished", titleAr: "انتهيت من قراءته" },
];

type BootstrapIdentity = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  source: string;
};

async function ensureCanonicalRoleClaim(authUser: admin.auth.UserRecord): Promise<void> {
  const existingClaims = (authUser.customClaims ?? {}) as Record<string, unknown>;
  const canonicalRole = canonicalizeRoleClaim(existingClaims.role);
  if (existingClaims.role === canonicalRole) {
    return;
  }

  await admin.auth().setCustomUserClaims(authUser.uid, {
    ...existingClaims,
    role: canonicalRole,
  });
}

async function bootstrapUserProfileAndShelves(identity: BootstrapIdentity): Promise<string[]> {
  const { uid, source } = identity;
  const userRef = db.doc(`users/${uid}`);
  const now = FieldValue.serverTimestamp();
  const email = identity.email ?? "";
  const bootstrapName = identity.displayName ?? "New User";
  const bootstrapHandle = `@${email.split("@")[0] || "user"}`;
  const bootstrapAvatarUrl =
    identity.photoURL ||
    `https://api.dicebear.com/8.x/lorelei/svg?seed=${uid}`;
  const [userSnap, publicSnap] = await Promise.all([
    userRef.get(),
    db.doc(`public_profiles/${uid}`).get(),
  ]);
  const existingUser = (userSnap.exists ? userSnap.data() : {}) || {};
  const existingPublic = (publicSnap.exists ? publicSnap.data() : {}) || {};
  const resolvedName =
    typeof existingUser.name === "string" && existingUser.name.trim()
      ? existingUser.name.trim()
      : typeof existingPublic.name === "string" && existingPublic.name.trim()
        ? existingPublic.name.trim()
        : bootstrapName;
  const resolvedHandle =
    typeof existingUser.handle === "string" && existingUser.handle.trim()
      ? existingUser.handle.trim()
      : typeof existingPublic.handle === "string" && existingPublic.handle.trim()
        ? existingPublic.handle.trim()
        : bootstrapHandle;
  const resolvedAvatarUrl =
    typeof existingUser.avatarUrl === "string" && existingUser.avatarUrl.trim()
      ? existingUser.avatarUrl.trim()
      : typeof existingPublic.avatarUrl === "string" && existingPublic.avatarUrl.trim()
        ? existingPublic.avatarUrl.trim()
        : bootstrapAvatarUrl;
  const resolvedBannerUrl =
    typeof existingUser.bannerUrl === "string" && existingUser.bannerUrl.trim()
      ? existingUser.bannerUrl.trim()
      : typeof existingPublic.bannerUrl === "string" && existingPublic.bannerUrl.trim()
        ? existingPublic.bannerUrl.trim()
        : "";
  const resolvedBioEn =
    typeof existingUser.bioEn === "string"
      ? existingUser.bioEn
      : typeof existingPublic.bioEn === "string"
        ? existingPublic.bioEn
        : "";
  const resolvedBioAr =
    typeof existingUser.bioAr === "string"
      ? existingUser.bioAr
      : typeof existingPublic.bioAr === "string"
        ? existingPublic.bioAr
        : "";
  const resolvedJoinDate =
    typeof existingUser.joinDate === "string" && existingUser.joinDate.trim()
      ? existingUser.joinDate.trim()
      : typeof existingPublic.joinDate === "string" && existingPublic.joinDate.trim()
        ? existingPublic.joinDate.trim()
        : new Date().toISOString();
  const bootstrapSearchFields = buildSearchFieldsFromTextParts([
    resolvedName,
    resolvedHandle,
    resolvedBioEn,
    resolvedBioAr,
  ]);

  logger.info("[BOOTSTRAP][START]", {
    uid,
    source,
    project: process.env.GCLOUD_PROJECT,
  });

  await db.doc(`_bootstrap_probe/${uid}`).set(
    {
      uid,
      firedAt: now,
      source,
      runtime: "v2",
    },
    { merge: true }
  );

  const batch: WriteBatch = db.batch();

  batch.set(
    userRef,
    {
      uid,
      email: email || null,
      name: resolvedName,
      handle: resolvedHandle,
      avatarUrl: resolvedAvatarUrl,
      bannerUrl: resolvedBannerUrl,
      bioEn: resolvedBioEn,
      bioAr: resolvedBioAr,
      createdAt: now,
      joinDate: resolvedJoinDate,
      lastActive: now,
      status: "active",
      isSuspended: false,
      initializationVersion: 5,
    },
    { merge: true }
  );

  const bootstrapJoinDate = new Date().toISOString();
  batch.set(
    db.doc(`public_profiles/${uid}`),
    {
      uid,
      name: resolvedName,
      handle: resolvedHandle,
      avatarUrl: resolvedAvatarUrl,
      bannerUrl: resolvedBannerUrl,
      bioEn: resolvedBioEn,
      bioAr: resolvedBioAr,
      joinDate: resolvedJoinDate || bootstrapJoinDate,
      updatedAt: bootstrapJoinDate,
      followerCount:
        typeof existingPublic.followerCount === "number"
          ? existingPublic.followerCount
          : 0,
      followingCount:
        typeof existingPublic.followingCount === "number"
          ? existingPublic.followingCount
          : 0,
      nameNormalized: normalizeSearchText(resolvedName),
      handleNormalized: normalizeSearchText(resolvedHandle),
      bioNormalized: normalizeSearchText([resolvedBioEn, resolvedBioAr].join(" ")),
      searchTokens: bootstrapSearchFields.tokens,
      searchPrefixes: bootstrapSearchFields.prefixes,
    },
    { merge: true }
  );

  for (const shelf of DEFAULT_SHELF_METADATA) {
    const shelfRef = db.collection("shelves").doc(`${uid}_${shelf.id}`);
    batch.set(
      shelfRef,
      {
        ...shelf,
        ownerId: uid,
        visibility: "public",
        createdAt: now,
        updatedAt: now,
        isSystem: true,
      },
      { merge: true }
    );
  }

  await batch.commit();
  await recomputeUserStats(uid);

  logger.info("[BOOTSTRAP][SUCCESS]", {
    uid,
    source,
    shelves: DEFAULT_SHELF_METADATA.map((shelf) => shelf.id),
  });

  return DEFAULT_SHELF_METADATA.map((shelf) => shelf.id);
}

export const bootstrapCurrentUser = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const authUser = await admin.auth().getUser(request.auth.uid);
  await ensureCanonicalRoleClaim(authUser);
  const created = await bootstrapUserProfileAndShelves({
    uid: authUser.uid,
    email: authUser.email ?? null,
    displayName: authUser.displayName ?? null,
    photoURL: authUser.photoURL ?? null,
    source: "callable.bootstrapCurrentUser",
  });

  return {
    ok: true,
    created,
  };
});

/**
 * createDefaultShelves
 * Explicit, callable bootstrap (deterministic + debuggable)
 *
 * AMENDMENT (LOCKED):
 * - Does NOT create "currently-reading"
 */
const createDefaultShelvesRaw = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const authUser = await admin.auth().getUser(request.auth.uid);
  await ensureCanonicalRoleClaim(authUser);
  const created = await bootstrapUserProfileAndShelves({
    uid: authUser.uid,
    email: authUser.email ?? null,
    displayName: authUser.displayName ?? null,
    photoURL: authUser.photoURL ?? null,
    source: "callable.createDefaultShelves",
  });

  return {
    ok: true,
    created,
  };
});

export const createDefaultShelves = wrapCallableV2("createDefaultShelves", createDefaultShelvesRaw);
