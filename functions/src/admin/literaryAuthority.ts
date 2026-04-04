import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Query, DocumentData } from "firebase-admin/firestore";

import { admin } from "../firebaseAdmin";
import { normalizeSearchText } from "../search/normalization";
import { assertRoleFromClaims } from "../shared/auth";
import {
  type AdminAuthorUpsertInput,
  upsertAdminAuthorInTransaction,
} from "../library/authors/authorCatalog";

const db = admin.firestore();
const MAX_ADMIN_LIMIT = 50;

type AdminAuthorShape = {
  authorId: string;
  canonicalName: string;
  normalizedName: string;
  displayName: string;
  aliases: string[];
  slug?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  deathPlace?: string;
  nationality?: string;
  languages: string[];
  genres: string[];
  movements: string[];
  period?: string;
  themes: string[];
  influenceTags: string[];
  shortBio?: string;
  fullBio?: string;
  wikipediaUrl?: string;
  goodreadsId?: string;
  openLibraryId?: string;
  wikidataId?: string;
  isni?: string;
  viaf?: string;
  portraitUrl?: string;
  gallery: string[];
  knownWorks: string[];
  bookIds: string[];
  status: "active" | "archived";
  source?: string;
  primarySource?: string;
  provenance?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
};

function readRequiredString(value: unknown, field: string, max = 300): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  if (normalized.length > max) {
    throw new HttpsError(
      "invalid-argument",
      `${field} exceeds ${max} characters.`
    );
  }
  return normalized;
}

function readOptionalString(value: unknown, field: string, max = 300): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  if (normalized.length > max) {
    throw new HttpsError(
      "invalid-argument",
      `${field} exceeds ${max} characters.`
    );
  }
  return normalized;
}

function readStringArray(value: unknown, max = 24): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n;]/)
      : [];
  const seen = new Set<string>();

  for (const entry of rawValues) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (!normalized) continue;
    seen.add(normalized);
    if (seen.size >= max) break;
  }

  return Array.from(seen);
}

function timestampToIso(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

function mapAdminAuthor(raw: DocumentData, authorId: string): AdminAuthorShape {
  const authorityLinks =
    raw.authorityLinks && typeof raw.authorityLinks === "object"
      ? (raw.authorityLinks as Record<string, unknown>)
      : {};

  return {
    authorId,
    canonicalName:
      typeof raw.canonicalName === "string" && raw.canonicalName.trim()
        ? raw.canonicalName.trim()
        : typeof raw.nameEn === "string" && raw.nameEn.trim()
          ? raw.nameEn.trim()
          : authorId,
    normalizedName:
      typeof raw.normalizedName === "string" && raw.normalizedName.trim()
        ? raw.normalizedName.trim()
        : normalizeSearchText(
            typeof raw.canonicalName === "string"
              ? raw.canonicalName
              : typeof raw.nameEn === "string"
                ? raw.nameEn
                : ""
          ),
   displayName:
      typeof raw.displayName === "string" && raw.displayName.trim()
        ? raw.displayName.trim()
        : typeof raw.nameEn === "string" && raw.nameEn.trim()
          ? raw.nameEn.trim()
          : authorId,
    aliases: readStringArray(raw.aliases, 40),
    slug:
      typeof raw.slug === "string" && raw.slug.trim()
        ? raw.slug.trim()
        : undefined,
    birthDate:
      typeof raw.birthDate === "string" && raw.birthDate.trim()
        ? raw.birthDate.trim()
        : undefined,
    deathDate:
      typeof raw.deathDate === "string" && raw.deathDate.trim()
        ? raw.deathDate.trim()
        : undefined,
    birthPlace:
      typeof raw.birthPlace === "string" && raw.birthPlace.trim()
        ? raw.birthPlace.trim()
        : undefined,
    deathPlace:
      typeof raw.deathPlace === "string" && raw.deathPlace.trim()
        ? raw.deathPlace.trim()
        : undefined,
    nationality:
      typeof raw.nationality === "string" && raw.nationality.trim()
        ? raw.nationality.trim()
        : typeof raw.countryEn === "string" && raw.countryEn.trim()
          ? raw.countryEn.trim()
          : undefined,
    languages: readStringArray(raw.languages, 12),
    genres: readStringArray(raw.genres, 16),
    movements: readStringArray(raw.movements, 16),
    period:
      typeof raw.period === "string" && raw.period.trim()
        ? raw.period.trim()
        : undefined,
    themes: readStringArray(raw.themes, 20),
    influenceTags: readStringArray(raw.influenceTags, 20),
    shortBio:
      typeof raw.shortBio === "string" && raw.shortBio.trim()
        ? raw.shortBio.trim()
        : undefined,
    fullBio:
      typeof raw.fullBio === "string" && raw.fullBio.trim()
        ? raw.fullBio.trim()
        : typeof raw.bioEn === "string" && raw.bioEn.trim()
          ? raw.bioEn.trim()
          : undefined,
    wikipediaUrl:
      typeof authorityLinks.wikipediaUrl === "string" && authorityLinks.wikipediaUrl.trim()
        ? authorityLinks.wikipediaUrl.trim()
        : undefined,
    goodreadsId:
      typeof authorityLinks.goodreadsId === "string" && authorityLinks.goodreadsId.trim()
        ? authorityLinks.goodreadsId.trim()
        : undefined,
    openLibraryId:
      typeof authorityLinks.openLibraryId === "string" && authorityLinks.openLibraryId.trim()
        ? authorityLinks.openLibraryId.trim()
        : undefined,
    wikidataId:
      typeof authorityLinks.wikidataId === "string" && authorityLinks.wikidataId.trim()
        ? authorityLinks.wikidataId.trim()
        : undefined,
    isni:
      typeof authorityLinks.isni === "string" && authorityLinks.isni.trim()
        ? authorityLinks.isni.trim()
        : undefined,
    viaf:
      typeof authorityLinks.viaf === "string" && authorityLinks.viaf.trim()
        ? authorityLinks.viaf.trim()
        : undefined,
    portraitUrl:
      typeof raw.portraitUrl === "string" && raw.portraitUrl.trim()
        ? raw.portraitUrl.trim()
        : typeof raw.avatarUrl === "string" && raw.avatarUrl.trim()
          ? raw.avatarUrl.trim()
          : undefined,
    gallery: readStringArray(raw.gallery, 12),
    knownWorks: readStringArray(raw.knownWorks, 24),
    bookIds: readStringArray(raw.bookIds, 48),
    status: raw.status === "archived" ? "archived" : "active",
    source:
      typeof raw.source === "string" && raw.source.trim()
        ? raw.source.trim()
        : undefined,
    primarySource:
      typeof raw.primarySource === "string" && raw.primarySource.trim()
        ? raw.primarySource.trim()
        : undefined,
    provenance:
      raw.provenance && typeof raw.provenance === "object"
        ? (raw.provenance as Record<string, unknown>)
        : undefined,
    createdAt: timestampToIso(raw.createdAt),
    updatedAt: timestampToIso(raw.updatedAt),
    createdBy:
      typeof raw.createdBy === "string" && raw.createdBy.trim()
        ? raw.createdBy.trim()
        : undefined,
    updatedBy:
      typeof raw.updatedBy === "string" && raw.updatedBy.trim()
        ? raw.updatedBy.trim()
        : undefined,
  };
}

function buildAuthorInput(data: Record<string, unknown>): AdminAuthorUpsertInput {
  return {
    authorId: readOptionalString(data.authorId, "authorId", 180),
    canonicalName: readRequiredString(data.canonicalName, "canonicalName", 240),
    displayName: readOptionalString(data.displayName, "displayName", 240),
    aliases: readStringArray(data.aliases, 40),
    slug: readOptionalString(data.slug, "slug", 120),
    birthDate: readOptionalString(data.birthDate, "birthDate", 16),
    deathDate: readOptionalString(data.deathDate, "deathDate", 16),
    birthPlace: readOptionalString(data.birthPlace, "birthPlace", 160),
    deathPlace: readOptionalString(data.deathPlace, "deathPlace", 160),
    nationality: readOptionalString(data.nationality, "nationality", 120),
    languages: readStringArray(data.languages, 12),
    genres: readStringArray(data.genres, 16),
    movements: readStringArray(data.movements, 16),
    period: readOptionalString(data.period, "period", 120),
    themes: readStringArray(data.themes, 20),
    influenceTags: readStringArray(data.influenceTags, 20),
    shortBio: readOptionalString(data.shortBio, "shortBio", 800),
    fullBio: readOptionalString(data.fullBio, "fullBio", 5000),
    wikipediaUrl: readOptionalString(data.wikipediaUrl, "wikipediaUrl", 500),
    goodreadsId: readOptionalString(data.goodreadsId, "goodreadsId", 120),
    openLibraryId: readOptionalString(data.openLibraryId, "openLibraryId", 120),
    wikidataId: readOptionalString(data.wikidataId, "wikidataId", 120),
    isni: readOptionalString(data.isni, "isni", 120),
    viaf: readOptionalString(data.viaf, "viaf", 120),
    portraitUrl: readOptionalString(data.portraitUrl, "portraitUrl", 500),
    gallery: readStringArray(data.gallery, 12),
    knownWorks: readStringArray(data.knownWorks, 24),
    bookIds: readStringArray(data.bookIds, 48),
    status: data.status === "archived" ? "archived" : "active",
    source: readOptionalString(data.source, "source", 120),
    primarySource: readOptionalString(data.primarySource, "primarySource", 120),
    provenance:
      data.provenance && typeof data.provenance === "object" && !Array.isArray(data.provenance)
        ? (data.provenance as Record<string, unknown>)
        : undefined,
  };
}

export const adminListAuthors = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const limitRaw = data.limit;
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(MAX_ADMIN_LIMIT, Math.trunc(limitRaw)))
      : 24;
  const queryValue = readOptionalString(data.query, "query", 120);
  const status =
    data.status === "archived" || data.status === "active" ? data.status : "all";

  let queryRef: Query = db.collection("authors");
  if (status === "archived") {
    queryRef = queryRef.where("status", "==", "archived");
  }
  if (queryValue) {
    queryRef = queryRef.where("searchPrefixes", "array-contains", normalizeSearchText(queryValue));
  }

  const snap = await queryRef.limit(Math.max(limit, 40)).get();
  const items = snap.docs
    .map((docSnap) => mapAdminAuthor(docSnap.data(), docSnap.id))
    .filter((author) =>
      status === "all"
        ? true
        : status === "active"
          ? author.status !== "archived"
          : author.status === "archived"
    )
    .filter((author) => {
      if (!queryValue) return true;
      const normalizedQuery = normalizeSearchText(queryValue);
      return (
        author.normalizedName.includes(normalizedQuery) ||
        author.aliases.some((alias) => normalizeSearchText(alias).includes(normalizedQuery))
      );
    })
    .sort((left, right) =>
      (right.updatedAt || right.createdAt || "").localeCompare(
        left.updatedAt || left.createdAt || ""
      )
    )
    .slice(0, limit);

  return {
    authors: items,
  };
});

export const adminGetAuthor = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const authorId = readRequiredString(data.authorId, "authorId", 180);
  const snap = await db.collection("authors").doc(authorId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Author not found.");
  }

  return {
    author: mapAdminAuthor(snap.data() as DocumentData, snap.id),
  };
});

export const adminAuthorCreate = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const input = buildAuthorInput(data);

  const result = await db.runTransaction((tx) =>
    upsertAdminAuthorInTransaction({
      tx,
      actorUid: caller.uid,
      input,
    })
  );

  const snap = await db.collection("authors").doc(result.authorId).get();
  return {
    author: mapAdminAuthor(snap.data() as DocumentData, snap.id),
    status: result.status,
  };
});

export const adminAuthorUpdate = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const authorId = readRequiredString(data.authorId, "authorId", 180);
  const input = {
    ...buildAuthorInput({
      ...data,
      authorId,
    }),
    authorId,
  };

  const result = await db.runTransaction((tx) =>
    upsertAdminAuthorInTransaction({
      tx,
      actorUid: caller.uid,
      input,
    })
  );

  const snap = await db.collection("authors").doc(result.authorId).get();
  return {
    author: mapAdminAuthor(snap.data() as DocumentData, snap.id),
    status: result.status,
  };
});

export const adminAuthorArchive = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const authorId = readRequiredString(data.authorId, "authorId", 180);
  const authorRef = db.collection("authors").doc(authorId);
  const snap = await authorRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Author not found.");
  }

  await authorRef.set(
    {
      status: "archived",
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      archivedBy: caller.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: caller.uid,
    },
    { merge: true }
  );

  const archivedSnap = await authorRef.get();

  return {
    author: mapAdminAuthor(archivedSnap.data() as DocumentData, archivedSnap.id),
    archived: true,
  };
});
