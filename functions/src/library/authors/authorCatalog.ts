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

export type SupportedAuthorSource = "openLibrary" | "wikidata" | "googleBooks";

type AuthorIdentityType = "canonical" | "provider";

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
