import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import { admin } from "../firebaseAdmin";
import { normalizeSearchText } from "../search/normalization";
import { searchOpenLibraryAuthors } from "./authors/providerSources";

const db = admin.firestore();
const MAX_DISCOVER_AUTHORS_LIMIT = 12;

type DiscoverAuthorsRequest = {
  query?: string;
  limit?: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 8;
  }

  return Math.max(1, Math.min(MAX_DISCOVER_AUTHORS_LIMIT, Math.trunc(parsed)));
}

function buildLocalAuthorResult(
  id: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const sourceIds = asRecord(data.sourceIds);
  const openLibraryId = asString(sourceIds?.openLibrary).toUpperCase();
  const wikidataId = asString(sourceIds?.wikidata).toUpperCase();

  return {
    id,
    nameEn: asString(data.nameEn) || asString(data.name) || "Unknown",
    nameAr: asString(data.nameAr) || asString(data.nameEn) || asString(data.name) || "Unknown",
    avatarUrl: asString(data.avatarUrl),
    bioEn: asString(data.bioEn),
    bioAr: asString(data.bioAr),
    lifespan: asString(data.lifespan),
    countryEn: asString(data.countryEn),
    countryAr: asString(data.countryAr),
    languageEn: asString(data.languageEn),
    languageAr: asString(data.languageAr),
    ...(openLibraryId
      ? {
          providerSource: "openLibrary",
          providerExternalId: openLibraryId,
          requiresCanonicalization: false,
        }
      : wikidataId
        ? {
            providerSource: "wikidata",
            providerExternalId: wikidataId,
            requiresCanonicalization: false,
          }
        : {}),
  };
}

function buildProviderAuthorResult(rawAuthor: Record<string, unknown>): Record<string, unknown> | null {
  const sourceIds = asRecord(rawAuthor.sourceIds);
  const openLibraryId = asString(sourceIds?.openLibrary).toUpperCase();
  const nameEn = asString(rawAuthor.nameEn) || asString(rawAuthor.name);

  if (!openLibraryId || !nameEn) {
    return null;
  }

  return {
    id: `ol_author_${openLibraryId}`,
    nameEn,
    nameAr: asString(rawAuthor.nameAr) || nameEn,
    avatarUrl: asString(rawAuthor.avatarUrl),
    bioEn: asString(rawAuthor.bioEn),
    bioAr: asString(rawAuthor.bioAr),
    lifespan: asString(rawAuthor.lifespan),
    countryEn: "",
    countryAr: "",
    languageEn: "",
    languageAr: "",
    providerSource: "openLibrary",
    providerExternalId: openLibraryId,
    requiresCanonicalization: true,
  };
}

function buildAuthorDedupKey(author: Record<string, unknown>): string {
  const providerSource = asString(author.providerSource);
  const providerExternalId = asString(author.providerExternalId);
  if (providerSource && providerExternalId) {
    return `provider:${providerSource}:${providerExternalId}`;
  }

  return `name:${normalizeSearchText(asString(author.nameEn) || asString(author.nameAr))}`;
}

async function searchLocalAuthors(queryText: string, limit: number): Promise<Record<string, unknown>[]> {
  const authorsRef = db.collection("authors");
  const normalizedQuery = normalizeSearchText(queryText);

  if (!normalizedQuery) {
    return [];
  }

  let docs = await authorsRef
    .where("searchPrefixes", "array-contains", normalizedQuery)
    .limit(limit)
    .get();

  if (docs.empty) {
    docs = await authorsRef
      .orderBy("nameEnNormalized")
      .startAt(normalizedQuery)
      .endAt(`${normalizedQuery}\uf8ff`)
      .limit(limit)
      .get();
  }

  return docs.docs.map((docSnap) => buildLocalAuthorResult(docSnap.id, asRecord(docSnap.data()) || {}));
}

export const discoverAuthors = onCall<DiscoverAuthorsRequest>({ cors: true }, async (request) => {
  const data =
    request.data && typeof request.data === "object" && "data" in request.data
      ? (request.data as { data: DiscoverAuthorsRequest }).data
      : request.data;
  const query = asString(data?.query);
  const limit = normalizeLimit(data?.limit);

  if (!query) {
    return {
      authors: [],
    };
  }

  try {
    const localAuthors = await searchLocalAuthors(query, limit);
    let providerAuthorsRaw: Record<string, unknown>[] = [];

    try {
      providerAuthorsRaw = await searchOpenLibraryAuthors(query, limit);
    } catch (error) {
      logger.warn("[AUTHORS][DISCOVER][PROVIDER_SEARCH_FAILED]", {
        query,
        limit,
        error: String(error),
      });
    }

    const providerAuthors = providerAuthorsRaw
      .map((candidate) => buildProviderAuthorResult(candidate))
      .filter((candidate): candidate is Record<string, unknown> => candidate !== null);

    const dedupKeys = new Set<string>();
    const merged: Record<string, unknown>[] = [];

    for (const candidate of [...localAuthors, ...providerAuthors]) {
      const dedupKey = buildAuthorDedupKey(candidate);
      if (!dedupKey || dedupKeys.has(dedupKey)) {
        continue;
      }

      dedupKeys.add(dedupKey);
      merged.push(candidate);

      if (merged.length >= limit) {
        break;
      }
    }

    return {
      authors: merged,
    };
  } catch (error) {
    logger.error("[AUTHORS][DISCOVER][FAILED]", {
      query,
      limit,
      error: String(error),
    });
    throw new HttpsError("internal", "Failed to discover authors.");
  }
});
