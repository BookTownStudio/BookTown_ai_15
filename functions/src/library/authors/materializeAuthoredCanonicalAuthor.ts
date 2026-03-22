import { FieldValue } from "firebase-admin/firestore";

import { admin } from "../../firebaseAdmin";
import {
  buildSearchFieldsFromTextParts,
  normalizeSearchText,
} from "../../search/normalization";
import { buildCanonicalAuthorKey } from "../persistence/canonicalAuthorKey";

export type AuthoredCanonicalAuthor = {
  authorId: string;
  canonicalKey: string;
};

type AuthoredTopWork = {
  workId: string;
  title: string;
};

function asNonEmptyString(value: unknown, max = 512): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function buildAuthoredAuthorId(ownerUid: string): string {
  return `authored_${ownerUid}`;
}

function buildAuthoredAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/8.x/initials/svg?seed=${encodeURIComponent(seed)}`;
}

function stripHandlePrefix(value: string): string {
  return value.replace(/^@+/, "").trim();
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.trunc(value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asTopWorks(value: unknown): AuthoredTopWork[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asRecord(entry))
    .map((entry) => {
      const workId = asNonEmptyString(entry?.workId, 256);
      const title = asNonEmptyString(entry?.title, 180);
      if (!workId || !title) return null;
      return { workId, title };
    })
    .filter((entry): entry is AuthoredTopWork => entry !== null)
    .slice(0, 12);
}

function upsertTopWork(
  existing: AuthoredTopWork[],
  next?: AuthoredTopWork
): AuthoredTopWork[] {
  if (!next) {
    return existing.slice(0, 12);
  }

  const deduped = [next, ...existing.filter((entry) => entry.workId !== next.workId)];
  return deduped.slice(0, 12);
}

function buildDefaultShortBio(params: {
  authorDisplayName: string;
  language: string;
  workCount: number;
}): { en: string; ar: string } {
  const nounEn = params.workCount === 1 ? "book" : "books";
  const nounAr = params.workCount === 1 ? "كتاب" : "كتب";
  const languageEn = params.language === "ar" ? "Arabic" : "English";
  const languageAr = params.language === "ar" ? "العربية" : "الإنجليزية";

  return {
    en: `${params.authorDisplayName} is a BookTown author writing in ${languageEn} with ${params.workCount} published ${nounEn}.`,
    ar: `${params.authorDisplayName} مؤلف في بوك تاون يكتب باللغة ${languageAr} وله ${params.workCount} ${nounAr} منشورة.`,
  };
}

function buildGracefulCountryDefaults(): { en: string; ar: string } {
  return {
    en: "BookTown",
    ar: "بوك تاون",
  };
}

function computeFairPopularityScore(params: {
  publishedBookCount: number;
  followersCount: number;
  quoteCount: number;
  readingActivityCount: number;
}): number {
  return (
    params.publishedBookCount +
    params.followersCount +
    params.quoteCount +
    params.readingActivityCount
  );
}

export async function materializeAuthoredCanonicalAuthor(params: {
  tx: FirebaseFirestore.Transaction;
  ownerUid: string;
  authorDisplayName: string;
  language?: string;
  currentBook?: {
    bookId: string;
    title: string;
  };
  isNewCanonicalBook?: boolean;
}): Promise<AuthoredCanonicalAuthor> {
  const ownerUid = asNonEmptyString(params.ownerUid, 256);
  const authorDisplayName = asNonEmptyString(params.authorDisplayName, 180);
  const language = asNonEmptyString(params.language, 12).toLowerCase();

  if (!ownerUid) {
    throw new Error("AUTHORED_AUTHOR_OWNER_UID_REQUIRED");
  }
  if (!authorDisplayName) {
    throw new Error("AUTHORED_AUTHOR_DISPLAY_NAME_REQUIRED");
  }

  const authorId = buildAuthoredAuthorId(ownerUid);
  const authorRef = admin.firestore().collection("authors").doc(authorId);
  const publicProfileRef = admin.firestore().collection("public_profiles").doc(ownerUid);
  const userRef = admin.firestore().collection("users").doc(ownerUid);
  const authorUserLinkRef = admin.firestore().collection("author_user_links").doc(authorId);
  const [authorSnap, publicProfileSnap, userSnap] = await Promise.all([
    params.tx.get(authorRef),
    params.tx.get(publicProfileRef),
    params.tx.get(userRef),
  ]);
  const existing = (authorSnap.data() ?? {}) as Record<string, unknown>;
  const publicProfile = (publicProfileSnap.data() ?? {}) as Record<string, unknown>;
  const userProfile = (userSnap.data() ?? {}) as Record<string, unknown>;
  const canonicalKey = buildCanonicalAuthorKey({
    name: authorDisplayName,
    birthYear: "",
  });
  const now = FieldValue.serverTimestamp();
  const nameEn =
    language === "ar"
      ? asNonEmptyString(existing.nameEn, 180) || authorDisplayName
      : authorDisplayName;
  const nameAr =
    language === "ar"
      ? authorDisplayName
      : asNonEmptyString(existing.nameAr, 180) || authorDisplayName;
  const linkedHandle =
    asNonEmptyString(publicProfile.handle, 80) ||
    asNonEmptyString(userProfile.handle, 80);
  const normalizedHandle = normalizeSearchText(stripHandlePrefix(linkedHandle));
  const existingTopWorks = asTopWorks(existing.topWorks);
  const nextTopWorks = upsertTopWork(
    existingTopWorks,
    params.currentBook
      ? {
          workId: asNonEmptyString(params.currentBook.bookId, 256),
          title: asNonEmptyString(params.currentBook.title, 180),
        }
      : undefined
  );
  const previousPublishedBookCount = toNonNegativeInt(
    existing.publishedBookCount ?? existing.workCount
  );
  const publishedBookCount = params.isNewCanonicalBook
    ? Math.max(previousPublishedBookCount + 1, nextTopWorks.length, 1)
    : Math.max(previousPublishedBookCount, nextTopWorks.length);
  const followersCount = toNonNegativeInt(existing.followersCount);
  const quoteCount = toNonNegativeInt(existing.quoteCount);
  const readingActivityCount = toNonNegativeInt(existing.readingActivityCount);
  const defaultShortBio = buildDefaultShortBio({
    authorDisplayName,
    language: language || "en",
    workCount: publishedBookCount || 1,
  });
  const gracefulCountry = buildGracefulCountryDefaults();
  const bioEn =
    asNonEmptyString(existing.bioEn, 5000) ||
    asNonEmptyString(publicProfile.bioEn, 5000) ||
    asNonEmptyString(userProfile.bioEn, 5000) ||
    defaultShortBio.en;
  const bioAr =
    asNonEmptyString(existing.bioAr, 5000) ||
    asNonEmptyString(publicProfile.bioAr, 5000) ||
    asNonEmptyString(userProfile.bioAr, 5000) ||
    defaultShortBio.ar;
  const shortBioEn =
    asNonEmptyString(existing.shortBioEn, 240) ||
    asNonEmptyString(publicProfile.bioEn, 240) ||
    asNonEmptyString(userProfile.bioEn, 240) ||
    defaultShortBio.en;
  const shortBioAr =
    asNonEmptyString(existing.shortBioAr, 240) ||
    asNonEmptyString(publicProfile.bioAr, 240) ||
    asNonEmptyString(userProfile.bioAr, 240) ||
    defaultShortBio.ar;
  const countryEn =
    asNonEmptyString(existing.countryEn, 120) ||
    asNonEmptyString(publicProfile.countryEn, 120) ||
    asNonEmptyString(userProfile.countryEn, 120) ||
    asNonEmptyString(userProfile.country, 120) ||
    gracefulCountry.en;
  const countryAr =
    asNonEmptyString(existing.countryAr, 120) ||
    asNonEmptyString(publicProfile.countryAr, 120) ||
    asNonEmptyString(userProfile.countryAr, 120) ||
    gracefulCountry.ar;
  const languageEn =
    asNonEmptyString(existing.languageEn, 120) ||
    asNonEmptyString(userProfile.languageEn, 120) ||
    (language === "ar" ? "Arabic" : "English");
  const languageAr =
    asNonEmptyString(existing.languageAr, 120) ||
    asNonEmptyString(userProfile.languageAr, 120) ||
    (language === "ar" ? "العربية" : "الإنجليزية");
  const popularityScore = computeFairPopularityScore({
    publishedBookCount,
    followersCount,
    quoteCount,
    readingActivityCount,
  });
  const displayName =
    asNonEmptyString(existing.displayName, 180) ||
    authorDisplayName;
  const normalizedName = normalizeSearchText(displayName);
  const searchFields = buildSearchFieldsFromTextParts([
    displayName,
    linkedHandle,
    shortBioEn,
    shortBioAr,
  ]);
  const existingSourceIds = asRecord(existing.sourceIds) ?? {};
  const existingRemoteIds = asRecord(existing.remoteIds) ?? {};
  const linkDisplayName =
    asNonEmptyString(publicProfile.name, 180) ||
    asNonEmptyString(userProfile.name, 180) ||
    asNonEmptyString(userProfile.displayName, 180) ||
    authorDisplayName;

  params.tx.set(
    authorRef,
    {
      id: authorId,
      ownerUid,
      linkedUserUid: ownerUid,
      linkedUserHandle: linkedHandle,
      linkedUserProfilePath: `public_profiles/${ownerUid}`,
      displayName,
      normalizedName,
      canonicalKey,
      nameEn,
      nameAr,
      nameEnNormalized: normalizeSearchText(nameEn),
      nameArNormalized: normalizeSearchText(nameAr),
      aliases: [],
      aliasesNormalized: [],
      searchTokens: searchFields.tokens,
      searchPrefixes: searchFields.prefixes,
      bioEn,
      bioAr,
      shortBioEn,
      shortBioAr,
      avatarUrl:
        asNonEmptyString(existing.avatarUrl, 2048) ||
        asNonEmptyString(publicProfile.avatarUrl, 2048) ||
        asNonEmptyString(userProfile.avatarUrl, 2048) ||
        buildAuthoredAvatarUrl(authorDisplayName || ownerUid),
      lifespan: asNonEmptyString(existing.lifespan, 32),
      birthYear: asNonEmptyString(existing.birthYear, 8) || null,
      deathYear: asNonEmptyString(existing.deathYear, 8) || null,
      countryEn,
      countryAr,
      country: countryEn,
      languageEn,
      languageAr,
      primaryLanguage: language || "en",
      sourceIds: {
        ...existingSourceIds,
        booktownUser: ownerUid,
      },
      sourceRecordType: "authored_native",
      enrichmentEligible: false,
      remoteIds: {
        ...existingRemoteIds,
        ...(linkedHandle ? { userHandle: stripHandlePrefix(linkedHandle) } : {}),
        userUid: ownerUid,
        publicProfilePath: `public_profiles/${ownerUid}`,
      },
      primarySource: "booktown",
      officialLinks: [],
      workCount: publishedBookCount,
      publishedBookCount,
      topWorks: nextTopWorks,
      metadataVersion: 1,
      followersCount,
      quoteCount,
      readingActivityCount,
      popularityScore,
      bridgeVersion: 1,
      futureIdentityHints: {
        normalizedDisplayName: normalizedName,
        normalizedHandle,
        booktownUserUid: ownerUid,
      },
      createdAt: existing.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );

  params.tx.set(
    authorUserLinkRef,
    {
      authorId,
      ownerUid,
      relationshipType: "owner",
      isPrimary: true,
      displayNameSnapshot: linkDisplayName,
      handleSnapshot: linkedHandle,
      publicProfilePath: `public_profiles/${ownerUid}`,
      createdAt: existing.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );

  params.tx.set(
    admin.firestore().collection("author_identity").doc(`authored_owner:${ownerUid}`),
    {
      identityKey: `authored_owner:${ownerUid}`,
      identityType: "canonical",
      value: ownerUid,
      precedence: 50,
      authorId,
      createdAt: existing.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );

  params.tx.set(
    admin.firestore().collection("author_identity").doc(`canonical:${canonicalKey}`),
    {
      identityKey: `canonical:${canonicalKey}`,
      identityType: "canonical",
      value: canonicalKey,
      precedence: 100,
      authorId,
      createdAt: existing.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );

  params.tx.set(
    admin.firestore().collection("author_identity").doc(`booktown_user:${ownerUid}`),
    {
      identityKey: `booktown_user:${ownerUid}`,
      identityType: "canonical",
      value: ownerUid,
      precedence: 90,
      authorId,
      createdAt: existing.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );

  if (normalizedHandle) {
    params.tx.set(
      admin.firestore().collection("author_identity").doc(`booktown_handle:${normalizedHandle}`),
      {
        identityKey: `booktown_handle:${normalizedHandle}`,
        identityType: "canonical",
        value: normalizedHandle,
        precedence: 70,
        authorId,
        createdAt: existing.createdAt || now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  return {
    authorId,
    canonicalKey,
  };
}
