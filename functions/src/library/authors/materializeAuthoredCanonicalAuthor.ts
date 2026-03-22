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

export async function materializeAuthoredCanonicalAuthor(params: {
  tx: FirebaseFirestore.Transaction;
  ownerUid: string;
  authorDisplayName: string;
  language?: string;
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
  const authorSnap = await params.tx.get(authorRef);
  const existing = (authorSnap.data() ?? {}) as Record<string, unknown>;
  const canonicalKey = buildCanonicalAuthorKey({
    name: authorDisplayName,
    birthYear: "",
  });
  const searchFields = buildSearchFieldsFromTextParts([authorDisplayName]);
  const now = FieldValue.serverTimestamp();
  const nameEn = language === "ar" ? asNonEmptyString(existing.nameEn, 180) || authorDisplayName : authorDisplayName;
  const nameAr = language === "ar" ? authorDisplayName : asNonEmptyString(existing.nameAr, 180) || authorDisplayName;

  params.tx.set(
    authorRef,
    {
      id: authorId,
      ownerUid,
      canonicalKey,
      nameEn,
      nameAr,
      nameEnNormalized: normalizeSearchText(nameEn),
      nameArNormalized: normalizeSearchText(nameAr),
      aliases: [],
      aliasesNormalized: [],
      searchTokens: searchFields.tokens,
      searchPrefixes: searchFields.prefixes,
      bioEn: asNonEmptyString(existing.bioEn, 5000),
      bioAr: asNonEmptyString(existing.bioAr, 5000),
      avatarUrl:
        asNonEmptyString(existing.avatarUrl, 2048) ||
        buildAuthoredAvatarUrl(authorDisplayName || ownerUid),
      lifespan: asNonEmptyString(existing.lifespan, 32),
      birthYear: asNonEmptyString(existing.birthYear, 8) || null,
      deathYear: asNonEmptyString(existing.deathYear, 8) || null,
      countryEn: asNonEmptyString(existing.countryEn, 120),
      countryAr: asNonEmptyString(existing.countryAr, 120),
      languageEn:
        asNonEmptyString(existing.languageEn, 120) || (language === "ar" ? "Arabic" : "English"),
      languageAr:
        asNonEmptyString(existing.languageAr, 120) || (language === "ar" ? "العربية" : "الإنجليزية"),
      sourceIds: {},
      sourceRecordType: "authored_native",
      enrichmentEligible: false,
      remoteIds: {},
      primarySource: "booktown",
      officialLinks: [],
      workCount:
        typeof existing.workCount === "number" && Number.isFinite(existing.workCount)
          ? Math.max(0, Math.trunc(existing.workCount))
          : 0,
      topWorks: Array.isArray(existing.topWorks) ? existing.topWorks : [],
      metadataVersion: 1,
      followersCount:
        typeof existing.followersCount === "number" && Number.isFinite(existing.followersCount)
          ? Math.max(0, Math.trunc(existing.followersCount))
          : 0,
      popularityScore:
        typeof existing.popularityScore === "number" && Number.isFinite(existing.popularityScore)
          ? existing.popularityScore
          : 0,
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

  return {
    authorId,
    canonicalKey,
  };
}
