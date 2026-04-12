import type { Transaction } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { v4 as uuidv4 } from "uuid";

import { admin } from "../../firebaseAdmin";
import {
  buildSearchFieldsFromTextParts,
  normalizeSearchText,
} from "../../search/normalization";
import {
  buildCanonicalAuthorKey,
  normalizeAuthorYear,
} from "../persistence/canonicalAuthorKey";

const db = admin.firestore();

export type SupportedAuthorSource = "booktown" | "openLibrary" | "wikidata" | "googleBooks";

type AuthorIdentityType =
  | "canonical"
  | "provider"
  | "authority"
  | "slug"
  | "normalized_name";

type AuthorIdentityRecord = {
  identityKey: string;
  identityType: AuthorIdentityType;
  value: string;
  precedence: number;
  authorId: string;
  createdAt?: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
};

export type MaterializeCanonicalAuthorParams = {
  providerExternalId?: string | null;
  source: SupportedAuthorSource;
  rawAuthor: Record<string, unknown>;
};

export type MaterializeCanonicalAuthorResult = {
  canonicalAuthorId: string;
  authorId: string;
  canonicalKey: string;
  status: "CREATED" | "MERGED" | "ALREADY_COMPLETE";
  source: SupportedAuthorSource;
  providerExternalId?: string;
};

export type AdminAuthorStatus = "active" | "archived";

export type AdminAuthorUpsertInput = {
  authorId?: string;
  canonicalName: string;
  displayName?: string;
  aliases?: string[];
  slug?: string;
  birthDate?: string | null;
  deathDate?: string | null;
  birthPlace?: string;
  deathPlace?: string;
  nationality?: string;
  languages?: string[];
  genres?: string[];
  movements?: string[];
  period?: string;
  themes?: string[];
  influenceTags?: string[];
  shortBio?: string;
  fullBio?: string;
  wikipediaUrl?: string;
  goodreadsId?: string;
  openLibraryId?: string;
  wikidataId?: string;
  isni?: string;
  viaf?: string;
  portraitUrl?: string;
  gallery?: string[];
  knownWorks?: string[];
  bookIds?: string[];
  status?: AdminAuthorStatus;
  source?: string;
  primarySource?: string;
  provenance?: Record<string, unknown>;
};

export type AdminAuthorUpsertResult = {
  authorId: string;
  canonicalKey: string;
  status: "CREATED" | "UPDATED" | "MERGED";
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function preferNonEmpty(incoming: string, fallback: unknown): string {
  return incoming || asNonEmptyString(fallback);
}

function uniqueStrings(values: readonly string[], max = 40): string[] {
  const dedup = new Set<string>();

  for (const raw of values) {
    const normalized = raw.trim();
    if (!normalized) continue;
    dedup.add(normalized);
    if (dedup.size >= max) break;
  }

  return Array.from(dedup);
}

function extractProviderIdMap(rawAuthor: Record<string, unknown>): Partial<
  Record<SupportedAuthorSource, string>
> {
  const sourceIds = asRecord(rawAuthor.sourceIds);
  const remoteIds = asRecord(rawAuthor.remote_ids);
  const openLibrary = asNonEmptyString(sourceIds?.openLibrary);
  const wikidata =
    asNonEmptyString(sourceIds?.wikidata) ||
    asNonEmptyString(remoteIds?.wikidata) ||
    asNonEmptyString(rawAuthor.wikidataQid);
  const googleBooks = asNonEmptyString(sourceIds?.googleBooks);

  return {
    ...(openLibrary ? { openLibrary } : {}),
    ...(wikidata ? { wikidata: wikidata.toUpperCase() } : {}),
    ...(googleBooks ? { googleBooks } : {}),
  };
}

function extractWikidataLangValue(
  rawAuthor: Record<string, unknown>,
  field: "labels" | "descriptions" | "aliases",
  lang: string
): string[] {
  const fieldRecord = asRecord(rawAuthor[field]);
  const langValue = asRecord(fieldRecord?.[lang]);

  if (field === "aliases") {
    const rawAliases = Array.isArray(fieldRecord?.[lang]) ? fieldRecord?.[lang] : [];
    return rawAliases
      .map((entry) => asRecord(entry))
      .map((entry) => asNonEmptyString(entry?.value))
      .filter(Boolean);
  }

  const direct = asNonEmptyString(langValue?.value);
  return direct ? [direct] : [];
}

function extractWikidataClaimYear(
  rawAuthor: Record<string, unknown>,
  claimKey: string
): string {
  const claims = asRecord(rawAuthor.claims);
  const claimValues = Array.isArray(claims?.[claimKey]) ? claims?.[claimKey] : [];

  for (const entry of claimValues) {
    const mainsnak = asRecord(asRecord(entry)?.mainsnak);
    const datavalue = asRecord(mainsnak?.datavalue);
    const value = asRecord(datavalue?.value);
    const year = normalizeAuthorYear(asNonEmptyString(value?.time));
    if (year) {
      return year;
    }
  }

  return "";
}

function extractBioValue(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  const record = asRecord(value);
  return asNonEmptyString(record?.value);
}

function extractExternalId(
  source: SupportedAuthorSource,
  providerExternalId: string,
  rawAuthor: Record<string, unknown>
): string {
  const candidate =
    providerExternalId ||
    asNonEmptyString(rawAuthor.externalId) ||
    asNonEmptyString(rawAuthor.authorId) ||
    asNonEmptyString(rawAuthor.id) ||
    asNonEmptyString(rawAuthor.key) ||
    asNonEmptyString(rawAuthor.qid) ||
    asNonEmptyString(rawAuthor.entityId);

  if (!candidate) {
    return "";
  }

  if (source === "openLibrary") {
    return candidate
      .replace(/^https?:\/\/openlibrary\.org\/authors\//i, "")
      .replace(/^\/authors\//i, "")
      .replace(/\/+$/g, "")
      .trim();
  }

  if (source === "wikidata") {
    return candidate
      .replace(/^https?:\/\/www\.wikidata\.org\/wiki\//i, "")
      .replace(/^wd:/i, "")
      .trim()
      .toUpperCase();
  }

  return candidate.trim();
}

function extractAuthorNames(rawAuthor: Record<string, unknown>): {
  nameEn: string;
  nameAr: string;
  aliases: string[];
} {
  const wikidataNameEn = extractWikidataLangValue(rawAuthor, "labels", "en")[0] || "";
  const wikidataNameAr = extractWikidataLangValue(rawAuthor, "labels", "ar")[0] || "";
  const directNameEn =
    asNonEmptyString(rawAuthor.nameEn) ||
    asNonEmptyString(rawAuthor.name) ||
    asNonEmptyString(rawAuthor.personal_name) ||
    wikidataNameEn;
  const directNameAr = asNonEmptyString(rawAuthor.nameAr) || wikidataNameAr || directNameEn;

  const aliases = uniqueStrings([
    ...asStringArray(rawAuthor.aliases),
    ...asStringArray(rawAuthor.alternateNames),
    ...asStringArray(rawAuthor.alternate_names),
    ...asStringArray(rawAuthor.aka),
    ...extractWikidataLangValue(rawAuthor, "aliases", "en"),
    ...extractWikidataLangValue(rawAuthor, "aliases", "ar"),
  ]);

  return {
    nameEn: directNameEn || directNameAr || "Unknown",
    nameAr: directNameAr || directNameEn || "Unknown",
    aliases: aliases.filter((entry) => entry !== directNameEn && entry !== directNameAr),
  };
}

function extractAuthorBio(rawAuthor: Record<string, unknown>): {
  bioEn: string;
  bioAr: string;
} {
  const bioEn =
    asNonEmptyString(rawAuthor.bioEn) ||
    extractBioValue(rawAuthor.bio) ||
    extractWikidataLangValue(rawAuthor, "descriptions", "en")[0] ||
    "";
  const bioAr =
    asNonEmptyString(rawAuthor.bioAr) ||
    extractWikidataLangValue(rawAuthor, "descriptions", "ar")[0] ||
    "";

  return { bioEn, bioAr };
}

function extractAuthorYears(rawAuthor: Record<string, unknown>): {
  birthYear: string;
  deathYear: string;
} {
  const birthYear =
    normalizeAuthorYear(rawAuthor.birthYear as string | number | null) ||
    normalizeAuthorYear(asNonEmptyString(rawAuthor.birthDate)) ||
    normalizeAuthorYear(asNonEmptyString(rawAuthor.birth_date)) ||
    extractWikidataClaimYear(rawAuthor, "P569");
  const deathYear =
    normalizeAuthorYear(rawAuthor.deathYear as string | number | null) ||
    normalizeAuthorYear(asNonEmptyString(rawAuthor.deathDate)) ||
    normalizeAuthorYear(asNonEmptyString(rawAuthor.death_date)) ||
    extractWikidataClaimYear(rawAuthor, "P570");

  return { birthYear, deathYear };
}

function extractAuthorAvatarUrl(
  source: SupportedAuthorSource,
  externalId: string,
  rawAuthor: Record<string, unknown>
): string {
  const direct =
    asNonEmptyString(rawAuthor.avatarUrl) ||
    asNonEmptyString(rawAuthor.photoUrl) ||
    asNonEmptyString(rawAuthor.imageUrl);

  if (direct) {
    return direct;
  }

  if (source === "openLibrary" && /^OL\d+A$/i.test(externalId)) {
    return `https://covers.openlibrary.org/a/olid/${externalId}-L.jpg`;
  }

  return "";
}

function extractOfficialLinks(rawAuthor: Record<string, unknown>): string[] {
  const links = Array.isArray(rawAuthor.links) ? rawAuthor.links : [];
  const urls = links
    .map((entry) => asRecord(entry))
    .map((entry) => asNonEmptyString(entry?.url))
    .filter(Boolean);

  return uniqueStrings(urls, 12);
}

function extractTopWorks(rawAuthor: Record<string, unknown>): Array<{ workId: string; title: string }> {
  const works = Array.isArray(rawAuthor.topWorks) ? rawAuthor.topWorks : [];

  return works
    .map((entry) => asRecord(entry))
    .map((entry) => {
      const workId = asNonEmptyString(entry?.workId);
      const title = asNonEmptyString(entry?.title);
      if (!workId || !title) {
        return null;
      }

      return { workId, title };
    })
    .filter((entry): entry is { workId: string; title: string } => entry !== null)
    .slice(0, 12);
}

function buildLifespan(birthYear: string, deathYear: string): string {
  if (birthYear && deathYear) {
    return `${birthYear}-${deathYear}`;
  }

  if (birthYear) {
    return `${birthYear}-`;
  }

  if (deathYear) {
    return `-${deathYear}`;
  }

  return "";
}

function normalizeDateOnly(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  const match = normalized.match(/^(\d{4})(?:-(\d{2})-(\d{2}))?$/);
  if (!match) {
    return "";
  }

  if (match[2] && match[3]) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  return match[1];
}

function slugifyAuthorValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 120);
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized);
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizeLooseStringArray(value: unknown, max = 24): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim()),
      max
    );
  }

  if (typeof value === "string") {
    return uniqueStrings(
      value
        .split(/[,\n;]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
      max
    );
  }

  return [];
}

function buildAdminIdentityCandidates(params: {
  canonicalKey: string;
  normalizedName: string;
  slug: string;
  openLibraryId: string;
  wikidataId: string;
  goodreadsId: string;
  isni: string;
  viaf: string;
}): Array<{
  key: string;
  type: AuthorIdentityType;
  value: string;
  precedence: number;
}> {
  const entries = buildIdentityCandidates({
    canonicalKey: params.canonicalKey,
    sourceIds: {
      ...(params.openLibraryId ? { openLibrary: params.openLibraryId } : {}),
      ...(params.wikidataId ? { wikidata: params.wikidataId } : {}),
    },
  });

  if (params.slug) {
    entries.push({
      key: `slug:${params.slug}`,
      type: "slug",
      value: params.slug,
      precedence: 150,
    });
  }

  const authorityEntries: Array<[string, string]> = [
    ["goodreads", params.goodreadsId],
    ["isni", params.isni],
    ["viaf", params.viaf],
  ];

  authorityEntries.forEach(([kind, value], index) => {
    if (!value) return;
    entries.push({
      key: `authority:${kind}:${value}`,
      type: "authority",
      value: `${kind}:${value}`,
      precedence: 300 + index,
    });
  });

  return entries;
}

function buildIdentityCandidates(params: {
  canonicalKey: string;
  sourceIds: Partial<Record<SupportedAuthorSource, string>>;
}): Array<{
  key: string;
  type: AuthorIdentityType;
  value: string;
  precedence: number;
}> {
  const entries: Array<{
    key: string;
    type: AuthorIdentityType;
    value: string;
    precedence: number;
  }> = [
    {
      key: `canonical:${params.canonicalKey}`,
      type: "canonical",
      value: params.canonicalKey,
      precedence: 100,
    },
  ];

  const orderedProviders: SupportedAuthorSource[] = [
    "openLibrary",
    "wikidata",
    "googleBooks",
  ];

  for (const [index, provider] of orderedProviders.entries()) {
    const externalId = asNonEmptyString(params.sourceIds[provider]);
    if (!externalId) {
      continue;
    }

    entries.push({
      key: `provider:${provider}:${externalId}`,
      type: "provider",
      value: `${provider}:${externalId}`,
      precedence: 200 + index,
    });
  }

  return entries;
}

function resolvePrimarySource(
  existingPrimarySource: string,
  sourceIds: Record<string, unknown>,
  currentSource: SupportedAuthorSource
): string {
  const orderedSources: SupportedAuthorSource[] = [
    "openLibrary",
    "wikidata",
    "googleBooks",
    "booktown",
  ];

  for (const source of orderedSources) {
    const id = asNonEmptyString(sourceIds[source]);
    if (id) {
      return source;
    }
  }

  return existingPrimarySource || currentSource;
}

export function buildRawAuthorFromBookPayload(params: {
  source: "googleBooks" | "openLibrary";
  rawBook: Record<string, unknown>;
  primaryAuthor: string;
}): {
  providerExternalId?: string;
  rawAuthor: Record<string, unknown>;
} {
  const openLibraryAuthorKeys = asStringArray(
    params.rawBook.author_key || params.rawBook.authorKeys || params.rawBook.authorKey
  );
  const providerExternalId =
    params.source === "openLibrary"
      ? openLibraryAuthorKeys[0] || asNonEmptyString(params.rawBook.authorId) || undefined
      : undefined;

  return {
    providerExternalId,
    rawAuthor: {
      nameEn: asNonEmptyString(params.rawBook.authorEn) || params.primaryAuthor,
      nameAr: asNonEmptyString(params.rawBook.authorAr),
      aliases: asStringArray(params.rawBook.authors),
      sourceIds: providerExternalId ? { openLibrary: providerExternalId } : {},
    },
  };
}

export async function materializeCanonicalAuthorInTransaction(params: {
  tx: Transaction;
  source: SupportedAuthorSource;
  providerExternalId?: string | null;
  rawAuthor: Record<string, unknown>;
}): Promise<MaterializeCanonicalAuthorResult> {
  const { nameEn, nameAr, aliases } = extractAuthorNames(params.rawAuthor);
  const { bioEn, bioAr } = extractAuthorBio(params.rawAuthor);
  const { birthYear, deathYear } = extractAuthorYears(params.rawAuthor);
  const canonicalKey = buildCanonicalAuthorKey({
    name: nameEn || nameAr || "Unknown",
    birthYear,
  });
  const externalId = extractExternalId(
    params.source,
    asNonEmptyString(params.providerExternalId),
    params.rawAuthor
  );
  const providerIds = {
    ...extractProviderIdMap(params.rawAuthor),
    ...(externalId ? { [params.source]: externalId } : {}),
  } as Partial<Record<SupportedAuthorSource, string>>;
  const identityCandidates = buildIdentityCandidates({
    canonicalKey,
    sourceIds: providerIds,
  });
  const ingestionKey = `${params.source}:${externalId || `canonical:${canonicalKey}`}`;
  const ingestionRef = db.collection("author_ingestions").doc(ingestionKey);
  const ingestionSnap = await params.tx.get(ingestionRef);
  const existingIngestion = asRecord(ingestionSnap.data() || null);
  const ingestedAuthorId = asNonEmptyString(existingIngestion?.authorId);
  const ingestedState = asNonEmptyString(existingIngestion?.state);

  let completeAuthorSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null =
    null;

  if (ingestedAuthorId && ingestedState === "COMPLETE") {
    const authorRef = db.collection("authors").doc(ingestedAuthorId);
    completeAuthorSnap = await params.tx.get(authorRef);

    if (completeAuthorSnap.exists) {
      return {
        canonicalAuthorId: ingestedAuthorId,
        authorId: ingestedAuthorId,
        canonicalKey,
        status: "ALREADY_COMPLETE",
        source: params.source,
        ...(externalId ? { providerExternalId: externalId } : {}),
      };
    }
  }

  let resolvedAuthorId = ingestedAuthorId || "";
  const conflictingAuthorIds = new Set<string>();
  const identitySnapshotsByKey = new Map<
    string,
    FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
  >();

  for (const candidate of identityCandidates) {
    const identityRef = db.collection("author_identity").doc(candidate.key);
    const identitySnap = await params.tx.get(identityRef);
    identitySnapshotsByKey.set(candidate.key, identitySnap);
    const identityData = asRecord(identitySnap.data() || null);
    const mappedAuthorId = asNonEmptyString(identityData?.authorId);

    if (!mappedAuthorId) {
      continue;
    }

    conflictingAuthorIds.add(mappedAuthorId);
    if (!resolvedAuthorId) {
      resolvedAuthorId = mappedAuthorId;
    }
  }

  const authorId = resolvedAuthorId || uuidv4();
  const authorRef = db.collection("authors").doc(authorId);
  const authorSnap =
    completeAuthorSnap && authorId === ingestedAuthorId
      ? completeAuthorSnap
      : await params.tx.get(authorRef);
  const existingAuthor = asRecord(authorSnap.data() || null);
  const existingSourceIds = asRecord(existingAuthor?.sourceIds);
  const avatarUrl = extractAuthorAvatarUrl(params.source, externalId, params.rawAuthor);
  const officialLinks = uniqueStrings([
    ...asStringArray(existingAuthor?.officialLinks),
    ...extractOfficialLinks(params.rawAuthor),
  ], 12);
  const topWorks = extractTopWorks(params.rawAuthor);
  const existingRemoteIds = asRecord(existingAuthor?.remoteIds);
  const remoteIds = {
    ...(existingRemoteIds || {}),
    ...(asRecord(params.rawAuthor.remote_ids) || {}),
  };
  const mergedAliases = uniqueStrings([
    ...asStringArray(existingAuthor?.aliases),
    ...aliases,
  ]);
  const searchFields = buildSearchFieldsFromTextParts([
    nameEn,
    nameAr,
    ...mergedAliases,
  ]);
  const sourceIds = {
    openLibrary: providerIds.openLibrary || asNonEmptyString(existingSourceIds?.openLibrary),
    wikidata: providerIds.wikidata || asNonEmptyString(existingSourceIds?.wikidata),
    googleBooks: providerIds.googleBooks || asNonEmptyString(existingSourceIds?.googleBooks),
  };
  const hasProviderSourceId = Boolean(
    sourceIds.openLibrary || sourceIds.wikidata || sourceIds.googleBooks
  );
  const primarySource = resolvePrimarySource(
    asNonEmptyString(existingAuthor?.primarySource),
    sourceIds,
    params.source
  );
  const now = FieldValue.serverTimestamp();

  if (conflictingAuthorIds.size > 1) {
    logger.warn("[AUTHOR_INGEST][IDENTITY_CONFLICT_COLLAPSED]", {
      ingestionKey,
      resolvedAuthorId: authorId,
      candidates: Array.from(conflictingAuthorIds),
    });
  }

  params.tx.set(
    authorRef,
    {
      id: authorId,
      canonicalKey,
      nameEn: preferNonEmpty(nameEn, existingAuthor?.nameEn) || "Unknown",
      nameAr: preferNonEmpty(nameAr, existingAuthor?.nameAr) || nameEn || "Unknown",
      nameEnNormalized: normalizeSearchText(preferNonEmpty(nameEn, existingAuthor?.nameEn)),
      nameArNormalized: normalizeSearchText(preferNonEmpty(nameAr, existingAuthor?.nameAr)),
      aliases: mergedAliases,
      aliasesNormalized: uniqueStrings(
        mergedAliases.map((entry) => normalizeSearchText(entry)).filter(Boolean),
        50
      ),
      searchTokens: searchFields.tokens,
      searchPrefixes: searchFields.prefixes,
      bioEn: preferNonEmpty(bioEn, existingAuthor?.bioEn),
      bioAr: preferNonEmpty(bioAr, existingAuthor?.bioAr),
      avatarUrl: preferNonEmpty(avatarUrl, existingAuthor?.avatarUrl),
      lifespan:
        buildLifespan(birthYear, deathYear) ||
        asNonEmptyString(existingAuthor?.lifespan),
      birthYear: birthYear || asNonEmptyString(existingAuthor?.birthYear) || null,
      deathYear: deathYear || asNonEmptyString(existingAuthor?.deathYear) || null,
      countryEn: preferNonEmpty(asNonEmptyString(params.rawAuthor.countryEn), existingAuthor?.countryEn),
      countryAr: preferNonEmpty(asNonEmptyString(params.rawAuthor.countryAr), existingAuthor?.countryAr),
      languageEn: preferNonEmpty(asNonEmptyString(params.rawAuthor.languageEn), existingAuthor?.languageEn),
      languageAr: preferNonEmpty(asNonEmptyString(params.rawAuthor.languageAr), existingAuthor?.languageAr),
      sourceIds,
      sourceRecordType: hasProviderSourceId ? "provider" : asNonEmptyString(existingAuthor?.sourceRecordType),
      enrichmentEligible:
        hasProviderSourceId || existingAuthor?.enrichmentEligible === true,
      remoteIds,
      primarySource,
      officialLinks,
      workCount:
        typeof params.rawAuthor.workCount === "number" && Number.isFinite(params.rawAuthor.workCount)
          ? Math.max(0, Math.trunc(params.rawAuthor.workCount))
          : Number(existingAuthor?.workCount || topWorks.length),
      topWorks: topWorks.length > 0 ? topWorks : existingAuthor?.topWorks || [],
      metadataVersion: 1,
      popularityScore: Number(existingAuthor?.popularityScore || 0),
      createdAt: existingAuthor?.createdAt || now,
      updatedAt: now,
      ...(externalId
        ? {
            providerExternalIds: FieldValue.arrayUnion(`${params.source}:${externalId}`),
          }
        : {}),
    },
    { merge: true }
  );

  for (const candidate of identityCandidates) {
    const identityRef = db.collection("author_identity").doc(candidate.key);
    const existingIdentity = asRecord(identitySnapshotsByKey.get(candidate.key)?.data() || null);
    const identityRecord: AuthorIdentityRecord = {
      identityKey: candidate.key,
      identityType: candidate.type,
      value: candidate.value,
      precedence: candidate.precedence,
      authorId,
      updatedAt: now,
    };

    if (!existingIdentity) {
      identityRecord.createdAt = now;
    }

    params.tx.set(identityRef, identityRecord, { merge: true });
  }

  params.tx.set(
    ingestionRef,
    {
      ingestionKey,
      source: params.source,
      externalId: externalId || null,
      canonicalKey,
      identityKeys: identityCandidates.map((entry) => entry.key),
      authorId,
      state: "COMPLETE",
      createdAt: existingIngestion?.createdAt || now,
      updatedAt: now,
    },
    { merge: true }
  );

  return {
    canonicalAuthorId: authorId,
    authorId,
    canonicalKey,
    status: resolvedAuthorId ? "MERGED" : "CREATED",
    source: params.source,
    ...(externalId ? { providerExternalId: externalId } : {}),
  };
}

export async function upsertAdminAuthorInTransaction(params: {
  tx: Transaction;
  actorUid: string;
  input: AdminAuthorUpsertInput;
}): Promise<AdminAuthorUpsertResult> {
  const canonicalName = asNonEmptyString(params.input.canonicalName) || "Unknown";
  const displayName =
    asNonEmptyString(params.input.displayName) || canonicalName;
  const birthDate = normalizeDateOnly(params.input.birthDate);
  const deathDate = normalizeDateOnly(params.input.deathDate);
  const birthYear = normalizeAuthorYear(birthDate);
  const deathYear = normalizeAuthorYear(deathDate);
  const canonicalKey = buildCanonicalAuthorKey({
    name: canonicalName,
    birthYear,
  });
  const normalizedName = normalizeSearchText(canonicalName);
  const slug =
    asNonEmptyString(params.input.slug) ||
    slugifyAuthorValue(displayName) ||
    slugifyAuthorValue(canonicalName) ||
    `author-${uuidv4().slice(0, 12)}`;
  const openLibraryId = asNonEmptyString(params.input.openLibraryId);
  const wikidataId = asNonEmptyString(params.input.wikidataId).toUpperCase();
  const goodreadsId = asNonEmptyString(params.input.goodreadsId);
  const isni = asNonEmptyString(params.input.isni);
  const viaf = asNonEmptyString(params.input.viaf);
  const identityCandidates = buildAdminIdentityCandidates({
    canonicalKey,
    normalizedName,
    slug,
    openLibraryId,
    wikidataId,
    goodreadsId,
    isni,
    viaf,
  });

  const mappedAuthorIds = new Set<string>();
  const identitySnapshotsByKey = new Map<
    string,
    FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
  >();

  for (const candidate of identityCandidates) {
    const identityRef = db.collection("author_identity").doc(candidate.key);
    const identitySnap = await params.tx.get(identityRef);
    identitySnapshotsByKey.set(candidate.key, identitySnap);
    const identityData = asRecord(identitySnap.data() || null);
    const mappedAuthorId = asNonEmptyString(identityData?.authorId);
    if (mappedAuthorId) {
      mappedAuthorIds.add(mappedAuthorId);
    }
  }

  const requestedAuthorId = asNonEmptyString(params.input.authorId);
  if (requestedAuthorId) {
    mappedAuthorIds.delete(requestedAuthorId);
  }

  if (mappedAuthorIds.size > 1) {
    logger.error("[ADMIN_AUTHOR][IDENTITY_CONFLICT]", {
      actorUid: params.actorUid,
      candidateAuthorIds: Array.from(mappedAuthorIds),
      canonicalKey,
    });
    throw new Error("AUTHOR_IDENTITY_CONFLICT");
  }

  const conflictingAuthorId = Array.from(mappedAuthorIds)[0] || "";
  if (requestedAuthorId && conflictingAuthorId && conflictingAuthorId !== requestedAuthorId) {
    throw new Error("AUTHOR_DUPLICATE_CONFLICT");
  }

  const authorId = requestedAuthorId || conflictingAuthorId || uuidv4();
  const authorRef = db.collection("authors").doc(authorId);
  const authorSnap = await params.tx.get(authorRef);
  const existingAuthor = asRecord(authorSnap.data() || null);
  if (requestedAuthorId && !authorSnap.exists) {
    throw new Error("AUTHOR_NOT_FOUND");
  }

  const aliases = uniqueStrings([
    ...asStringArray(existingAuthor?.aliases),
    ...normalizeLooseStringArray(params.input.aliases),
  ]);
  const languages = uniqueStrings([
    ...normalizeLooseStringArray(existingAuthor?.languages, 12),
    ...normalizeLooseStringArray(params.input.languages, 12),
  ], 12);
  const genres = uniqueStrings([
    ...normalizeLooseStringArray(existingAuthor?.genres, 16),
    ...normalizeLooseStringArray(params.input.genres, 16),
  ], 16);
  const movements = uniqueStrings([
    ...normalizeLooseStringArray(existingAuthor?.movements, 16),
    ...normalizeLooseStringArray(params.input.movements, 16),
  ], 16);
  const themes = uniqueStrings([
    ...normalizeLooseStringArray(existingAuthor?.themes, 20),
    ...normalizeLooseStringArray(params.input.themes, 20),
  ], 20);
  const influenceTags = uniqueStrings([
    ...normalizeLooseStringArray(existingAuthor?.influenceTags, 20),
    ...normalizeLooseStringArray(params.input.influenceTags, 20),
  ], 20);
  const gallery = uniqueStrings([
    ...normalizeLooseStringArray(existingAuthor?.gallery, 12),
    ...normalizeLooseStringArray(params.input.gallery, 12),
  ], 12);
  const knownWorks = uniqueStrings([
    ...normalizeLooseStringArray(existingAuthor?.knownWorks, 24),
    ...normalizeLooseStringArray(params.input.knownWorks, 24),
  ], 24);
  const bookIds = uniqueStrings([
    ...normalizeLooseStringArray(existingAuthor?.bookIds, 48),
    ...normalizeLooseStringArray(params.input.bookIds, 48),
  ], 48);
  const officialLinks = uniqueStrings([
    ...asStringArray(existingAuthor?.officialLinks),
    normalizeUrl(params.input.wikipediaUrl),
  ], 12);
  const searchFields = buildSearchFieldsFromTextParts([
    canonicalName,
    displayName,
    ...aliases,
    ...genres,
    ...movements,
  ]);
  const sourceIds = {
    openLibrary:
      openLibraryId || asNonEmptyString(asRecord(existingAuthor?.sourceIds)?.openLibrary),
    wikidata:
      wikidataId || asNonEmptyString(asRecord(existingAuthor?.sourceIds)?.wikidata),
    googleBooks: asNonEmptyString(asRecord(existingAuthor?.sourceIds)?.googleBooks),
  };
  const hasProviderSourceId = Boolean(sourceIds.openLibrary || sourceIds.wikidata || sourceIds.googleBooks);
  const now = FieldValue.serverTimestamp();
  const status = params.input.status || (existingAuthor?.status === "archived" ? "archived" : "active");
  const portraitUrl =
    normalizeUrl(params.input.portraitUrl) ||
    asNonEmptyString(existingAuthor?.portraitUrl) ||
    asNonEmptyString(existingAuthor?.avatarUrl);
  const fullBio =
    asNonEmptyString(params.input.fullBio) ||
    asNonEmptyString(existingAuthor?.fullBio) ||
    asNonEmptyString(existingAuthor?.bioEn);
  const shortBio =
    asNonEmptyString(params.input.shortBio) ||
    asNonEmptyString(existingAuthor?.shortBio);
  const nationality =
    asNonEmptyString(params.input.nationality) ||
    asNonEmptyString(existingAuthor?.nationality) ||
    asNonEmptyString(existingAuthor?.countryEn);
  const authorityLinks = {
    wikipediaUrl:
      normalizeUrl(params.input.wikipediaUrl) ||
      asNonEmptyString(asRecord(existingAuthor?.authorityLinks)?.wikipediaUrl),
    goodreadsId:
      goodreadsId ||
      asNonEmptyString(asRecord(existingAuthor?.authorityLinks)?.goodreadsId),
    openLibraryId:
      openLibraryId ||
      asNonEmptyString(asRecord(existingAuthor?.authorityLinks)?.openLibraryId),
    isni:
      isni ||
      asNonEmptyString(asRecord(existingAuthor?.authorityLinks)?.isni),
    viaf:
      viaf ||
      asNonEmptyString(asRecord(existingAuthor?.authorityLinks)?.viaf),
    wikidataId:
      wikidataId ||
      asNonEmptyString(asRecord(existingAuthor?.authorityLinks)?.wikidataId),
  };
  const provenance = {
    ...(asRecord(existingAuthor?.provenance) || {}),
    ...(params.input.provenance || {}),
    source: asNonEmptyString(params.input.source) || asNonEmptyString(existingAuthor?.source) || "admin_manual",
    updatedBy: params.actorUid,
  };

  params.tx.set(
    authorRef,
    {
      id: authorId,
      authorId,
      canonicalKey,
      canonicalName,
      normalizedName,
      displayName,
      slug,
      nameEn: canonicalName,
      nameAr: asNonEmptyString(existingAuthor?.nameAr) || canonicalName,
      nameEnNormalized: normalizedName,
      nameArNormalized: normalizeSearchText(asNonEmptyString(existingAuthor?.nameAr) || canonicalName),
      aliases,
      aliasesNormalized: uniqueStrings(
        aliases.map((entry) => normalizeSearchText(entry)).filter(Boolean),
        50
      ),
      searchTokens: searchFields.tokens,
      searchPrefixes: searchFields.prefixes,
      shortBio,
      fullBio,
      bioEn: fullBio,
      bioAr: asNonEmptyString(existingAuthor?.bioAr),
      portraitUrl,
      avatarUrl: portraitUrl,
      birthDate: birthDate || existingAuthor?.birthDate || null,
      deathDate: deathDate || existingAuthor?.deathDate || null,
      birthYear: birthYear || asNonEmptyString(existingAuthor?.birthYear) || null,
      deathYear: deathYear || asNonEmptyString(existingAuthor?.deathYear) || null,
      lifespan:
        buildLifespan(
          birthYear || asNonEmptyString(existingAuthor?.birthYear),
          deathYear || asNonEmptyString(existingAuthor?.deathYear)
        ) || asNonEmptyString(existingAuthor?.lifespan),
      birthPlace:
        asNonEmptyString(params.input.birthPlace) ||
        asNonEmptyString(existingAuthor?.birthPlace),
      deathPlace:
        asNonEmptyString(params.input.deathPlace) ||
        asNonEmptyString(existingAuthor?.deathPlace),
      nationality,
      countryEn: nationality,
      countryAr: asNonEmptyString(existingAuthor?.countryAr),
      languages,
      languageEn: languages[0] || asNonEmptyString(existingAuthor?.languageEn),
      languageAr: asNonEmptyString(existingAuthor?.languageAr),
      genres,
      movements,
      period:
        asNonEmptyString(params.input.period) ||
        asNonEmptyString(existingAuthor?.period),
      themes,
      influenceTags,
      authorityLinks,
      sourceIds,
      sourceRecordType: hasProviderSourceId ? "provider" : "admin",
      enrichmentEligible: hasProviderSourceId || existingAuthor?.enrichmentEligible === true,
      remoteIds: {
        ...(asRecord(existingAuthor?.remoteIds) || {}),
        ...(goodreadsId ? { goodreads: goodreadsId } : {}),
        ...(isni ? { isni } : {}),
        ...(viaf ? { viaf } : {}),
      },
      primarySource:
        asNonEmptyString(params.input.primarySource) ||
        asNonEmptyString(params.input.source) ||
        asNonEmptyString(existingAuthor?.primarySource) ||
        "manual",
      officialLinks,
      gallery,
      knownWorks,
      topWorks:
        knownWorks.length > 0
          ? knownWorks.map((title, index) => ({
              workId: bookIds[index] || `${slug}:${index + 1}`,
              title,
            }))
          : existingAuthor?.topWorks || [],
      bookIds,
      workCount: Math.max(
        Number(existingAuthor?.workCount || 0),
        knownWorks.length,
        bookIds.length
      ),
      status,
      source:
        asNonEmptyString(params.input.source) ||
        asNonEmptyString(existingAuthor?.source) ||
        "admin_manual",
      provenance,
      createdBy: asNonEmptyString(existingAuthor?.createdBy) || params.actorUid,
      updatedBy: params.actorUid,
      archivedAt:
        status === "archived"
          ? existingAuthor?.archivedAt || now
          : null,
      archivedBy:
        status === "archived"
          ? asNonEmptyString(existingAuthor?.archivedBy) || params.actorUid
          : null,
      metadataVersion: 2,
      popularityScore: Number(existingAuthor?.popularityScore || 0),
      createdAt: existingAuthor?.createdAt || now,
      updatedAt: now,
      ...(openLibraryId || wikidataId
        ? {
            providerExternalIds: FieldValue.arrayUnion(
              ...(openLibraryId ? [`openLibrary:${openLibraryId}`] : []),
              ...(wikidataId ? [`wikidata:${wikidataId}`] : [])
            ),
          }
        : {}),
    },
    { merge: true }
  );

  for (const candidate of identityCandidates) {
    const identityRef = db.collection("author_identity").doc(candidate.key);
    const existingIdentity = asRecord(identitySnapshotsByKey.get(candidate.key)?.data() || null);
    const identityRecord: AuthorIdentityRecord = {
      identityKey: candidate.key,
      identityType: candidate.type,
      value: candidate.value,
      precedence: candidate.precedence,
      authorId,
      updatedAt: now,
    };

    if (!existingIdentity) {
      identityRecord.createdAt = now;
    }

    params.tx.set(identityRef, identityRecord, { merge: true });
  }

  return {
    authorId,
    canonicalKey,
    status: existingAuthor
      ? requestedAuthorId
        ? "UPDATED"
        : "MERGED"
      : "CREATED",
  };
}
