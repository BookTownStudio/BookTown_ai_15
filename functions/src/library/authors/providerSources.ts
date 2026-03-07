import * as logger from "firebase-functions/logger";

const PROVIDER_TIMEOUT_MS = 4000;
const OPEN_LIBRARY_BASE_URL = "https://openlibrary.org";
const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const MAX_OPEN_LIBRARY_WORKS = 12;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function fetchJsonWithTimeout(url: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      logger.warn("[AUTHOR_PROVIDER][HTTP_ERROR]", {
        url,
        status: response.status,
      });
      return null;
    }

    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    logger.warn("[AUTHOR_PROVIDER][FETCH_FAILED]", {
      url,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      error: String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeMissingFields(
  preferred: Record<string, unknown>,
  fallback: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...preferred };

  for (const [key, value] of Object.entries(fallback)) {
    const existing = merged[key];

    if (existing === undefined || existing === null || existing === "") {
      merged[key] = value;
      continue;
    }

    if (Array.isArray(existing) && Array.isArray(value)) {
      merged[key] = Array.from(new Set([...existing, ...value]));
      continue;
    }

    if (
      existing &&
      value &&
      typeof existing === "object" &&
      typeof value === "object" &&
      !Array.isArray(existing) &&
      !Array.isArray(value)
    ) {
      merged[key] = mergeMissingFields(
        existing as Record<string, unknown>,
        value as Record<string, unknown>
      );
    }
  }

  return merged;
}

function normalizeOpenLibraryWorkEntries(payload: Record<string, unknown>): Record<string, unknown> {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const topWorks = entries
    .map((entry) => asRecord(entry))
    .map((entry) => {
      const title = asString(entry?.title);
      const key = asString(entry?.key).replace(/^\/works\//, "");
      if (!title || !key) {
        return null;
      }

      return {
        workId: key,
        title,
      };
    })
    .filter((entry): entry is { workId: string; title: string } => entry !== null)
    .slice(0, MAX_OPEN_LIBRARY_WORKS);

  return {
    workCount:
      typeof payload.size === "number" && Number.isFinite(payload.size)
        ? Math.max(0, Math.trunc(payload.size))
        : topWorks.length,
    topWorks,
  };
}

export async function fetchOpenLibraryAuthorAuthoritativeData(
  authorId: string
): Promise<Record<string, unknown> | null> {
  const normalizedId = asString(authorId).replace(/^\/authors\//, "").toUpperCase();
  if (!/^OL\d+A$/.test(normalizedId)) {
    return null;
  }

  const authorUrl = `${OPEN_LIBRARY_BASE_URL}/authors/${normalizedId}.json`;
  const worksUrl = `${OPEN_LIBRARY_BASE_URL}/authors/${normalizedId}/works.json?limit=${MAX_OPEN_LIBRARY_WORKS}`;

  const [authorPayload, worksPayload] = await Promise.all([
    fetchJsonWithTimeout(authorUrl),
    fetchJsonWithTimeout(worksUrl),
  ]);

  if (!authorPayload) {
    return null;
  }

  return {
    ...authorPayload,
    ...(worksPayload ? normalizeOpenLibraryWorkEntries(worksPayload) : {}),
  };
}

function normalizeWikidataEntitiesPayload(
  payload: Record<string, unknown>,
  qid: string
): Record<string, unknown> | null {
  const entities = asRecord(payload.entities);
  const entity = asRecord(entities?.[qid]);

  return entity;
}

export async function fetchWikidataAuthorAuthoritativeData(
  qid: string
): Promise<Record<string, unknown> | null> {
  const normalizedQid = asString(qid).toUpperCase();
  if (!/^Q\d+$/.test(normalizedQid)) {
    return null;
  }

  const url = new URL(WIKIDATA_API_URL);
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("ids", normalizedQid);
  url.searchParams.set("languages", "en|ar");
  url.searchParams.set("props", "labels|descriptions|aliases|claims|sitelinks");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const payload = await fetchJsonWithTimeout(url.toString());
  if (!payload) {
    return null;
  }

  return normalizeWikidataEntitiesPayload(payload, normalizedQid);
}

export async function resolveAuthorProviderPayload(params: {
  source: "openLibrary" | "wikidata" | "googleBooks";
  providerExternalId?: string | null;
  rawAuthor: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const providerExternalId = asString(params.providerExternalId);
  let resolved = { ...params.rawAuthor };

  if (params.source === "openLibrary" && providerExternalId) {
    const openLibraryPayload = await fetchOpenLibraryAuthorAuthoritativeData(providerExternalId);
    if (openLibraryPayload) {
      resolved = mergeMissingFields(openLibraryPayload, resolved);
    }

    const wikidataId =
      asString(asRecord(resolved.remote_ids)?.wikidata) ||
      asString(resolved.wikidataQid) ||
      asString(asRecord(asRecord(resolved.sourceIds)?.wikidata));

    if (wikidataId) {
      const wikidataPayload = await fetchWikidataAuthorAuthoritativeData(wikidataId);
      if (wikidataPayload) {
        resolved = mergeMissingFields(
          {
            ...resolved,
            sourceIds: {
              ...(asRecord(resolved.sourceIds) || {}),
              wikidata: wikidataId,
            },
          },
          resolved
        );
        resolved = mergeMissingFields(wikidataPayload, resolved);
      }
    }
  }

  if (params.source === "wikidata" && providerExternalId) {
    const wikidataPayload = await fetchWikidataAuthorAuthoritativeData(providerExternalId);
    if (wikidataPayload) {
      resolved = mergeMissingFields(wikidataPayload, resolved);
    }
  }

  return resolved;
}
