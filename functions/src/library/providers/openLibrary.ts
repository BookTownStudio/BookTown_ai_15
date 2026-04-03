import * as logger from "firebase-functions/logger";
import type {
  ExternalReadableSourceRecord,
  ExternalReadableCandidate,
  ProviderLookupContext,
} from "./types";

const OPEN_LIBRARY_TIMEOUT_MS = 15_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function extractLanguageCode(entry: unknown): string {
  const key = asNonEmptyString(asRecord(entry)?.key);
  if (!key) return "";
  return key.replace(/^\/languages\//, "").trim().toLowerCase();
}

function extractDescription(value: unknown): string {
  if (typeof value === "string") return value.trim();
  return asNonEmptyString(asRecord(value)?.value);
}

function extractProviderIds(book: Record<string, unknown>, prefix: string): string[] {
  const providerExternalIds = asStringArray(book.providerExternalIds);
  return providerExternalIds
    .filter((entry) => entry.startsWith(`${prefix}:`))
    .map((entry) => entry.slice(prefix.length + 1))
    .filter((entry) => entry.length > 0);
}

function extractPersistedSources(
  book: Record<string, unknown>,
  provider: "openLibrary"
): ExternalReadableSourceRecord[] {
  const raw = Array.isArray(book.externalReadableSources)
    ? book.externalReadableSources
    : [];
  const persisted: ExternalReadableSourceRecord[] = [];

  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;

    const persistedProvider = asNonEmptyString(record.provider);
    const providerExternalId = asNonEmptyString(record.providerExternalId);
    const trust = asNonEmptyString(record.trust);
    if (
      persistedProvider !== provider ||
      !providerExternalId ||
      trust !== "trusted"
    ) {
      continue;
    }

    const lendingEditionId = asNonEmptyString(record.lendingEditionId);
    const lendingIdentifier = asNonEmptyString(record.lendingIdentifier);

    persisted.push({
      provider,
      providerExternalId,
      ...(lendingEditionId ? { lendingEditionId } : {}),
      ...(lendingIdentifier ? { lendingIdentifier } : {}),
      trust: "trusted",
    });
  }

  return persisted;
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasReadableSearchSignal(doc: Record<string, unknown>): boolean {
  return (
    doc.has_fulltext === true &&
    Boolean(
      asNonEmptyString(doc.lending_edition_s) ||
      asNonEmptyString(doc.lending_identifier_s)
    )
  );
}

function buildSearchCandidateFromDoc(
  doc: Record<string, unknown>
): ExternalReadableSourceRecord | null {
  const key = asNonEmptyString(doc.key).replace(/^\/works\//, "");
  if (!key || !hasReadableSearchSignal(doc)) {
    return null;
  }

  const lendingEditionId = asNonEmptyString(doc.lending_edition_s);
  const lendingIdentifier = asNonEmptyString(doc.lending_identifier_s);

  return {
    provider: "openLibrary",
    providerExternalId: key,
    ...(lendingEditionId ? { lendingEditionId } : {}),
    ...(lendingIdentifier ? { lendingIdentifier } : {}),
    trust: "trusted",
  };
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPEN_LIBRARY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "BookTownBot/2.0",
        Accept: "application/json,text/plain,*/*",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn("[ACQUIRE][OPENLIB][FETCH_FAILED]", {
        url,
        status: response.status,
      });
      return null;
    }

    const payload = await response.json();
    return asRecord(payload);
  } catch (error) {
    logger.warn("[ACQUIRE][OPENLIB][FETCH_ERROR]", {
      url,
      error: String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAuthorName(authorKey: string): Promise<string> {
  const payload = await fetchJson(`https://openlibrary.org${authorKey}.json`);
  return asNonEmptyString(payload?.name);
}

function collectIaIds(edition: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const ocaid = asNonEmptyString(edition.ocaid);
  if (ocaid) ids.add(ocaid);

  for (const sourceRecord of asStringArray(edition.source_records)) {
    if (!sourceRecord.startsWith("ia:")) continue;
    const iaId = sourceRecord.slice(3).trim();
    if (iaId) ids.add(iaId);
  }

  return Array.from(ids);
}

function resolveOpenLibraryIds(ctx: ProviderLookupContext): string[] {
  const ids = new Set<string>();
  for (const source of extractPersistedSources(ctx.book, "openLibrary")) {
    ids.add(source.providerExternalId);
  }
  if (ctx.sourceHint?.source === "openLibrary" && ctx.sourceHint.providerExternalId) {
    ids.add(ctx.sourceHint.providerExternalId);
  }
  for (const providerId of extractProviderIds(ctx.book, "openLibrary")) {
    ids.add(providerId);
  }
  return Array.from(ids);
}

async function searchOpenLibraryReadableSource(
  ctx: ProviderLookupContext
): Promise<ExternalReadableSourceRecord | null> {
  const title =
    asNonEmptyString(ctx.book.titleEn) ||
    asNonEmptyString(ctx.book.title) ||
    "";
  const author =
    asNonEmptyString(ctx.book.authorEn) ||
    asStringArray(ctx.book.authors)[0] ||
    "";

  if (!title) return null;

  const normalizedTitle = normalizeSearchText(title);
  const normalizedAuthor = normalizeSearchText(author);
  const url = new URL("https://openlibrary.org/search.json");
  url.searchParams.set("title", title);
  if (author) {
    url.searchParams.set("author", author);
  }
  url.searchParams.set("limit", "10");

  const payload = await fetchJson(url.toString());
  const docs = Array.isArray(payload?.docs)
    ? payload.docs
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];

  for (const doc of docs) {
    const candidate = buildSearchCandidateFromDoc(doc);
    if (!candidate) continue;

    const docTitle = normalizeSearchText(asNonEmptyString(doc.title));
    if (!docTitle) continue;
    const docAuthors = asStringArray(doc.author_name).map((entry) => normalizeSearchText(entry));

    const titleMatches =
      docTitle === normalizedTitle ||
      docTitle.includes(normalizedTitle) ||
      normalizedTitle.includes(docTitle);
    const authorMatches =
      !normalizedAuthor || docAuthors.some((entry) => entry === normalizedAuthor);

    if (!titleMatches || !authorMatches) {
      continue;
    }

    return candidate;
  }

  return null;
}

export async function fetchOpenLibraryCanonicalMetadata(
  workId: string
): Promise<Record<string, unknown> | null> {
  const normalizedWorkId = asNonEmptyString(workId).replace(/^\/works\//, "");
  if (!normalizedWorkId) return null;

  const [work, editionsPayload] = await Promise.all([
    fetchJson(`https://openlibrary.org/works/${normalizedWorkId}.json`),
    fetchJson(`https://openlibrary.org/works/${normalizedWorkId}/editions.json?limit=10`),
  ]);

  if (!work) return null;

  const authorsRaw = Array.isArray(work.authors) ? work.authors : [];
  const authorKeys = authorsRaw
    .map((entry) => asNonEmptyString(asRecord(asRecord(entry)?.author)?.key))
    .filter((entry) => entry.length > 0)
    .slice(0, 4);
  const authorNames = (await Promise.all(authorKeys.map((entry) => fetchAuthorName(entry)))).filter(
    (entry) => entry.length > 0
  );

  const editions = Array.isArray(editionsPayload?.entries)
    ? editionsPayload.entries
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry !== null)
    : [];
  const primaryEdition = editions[0] || {};

  const coverIds = Array.isArray(work.covers)
    ? work.covers
    : Array.isArray(primaryEdition.covers)
      ? primaryEdition.covers
      : [];
  const coverId = asNonEmptyString(coverIds[0]);
  const description = extractDescription(work.description);
  const language =
    extractLanguageCode((Array.isArray(primaryEdition.languages) ? primaryEdition.languages : [])[0]) ||
    "en";

  return {
    ...work,
    ...primaryEdition,
    id: normalizedWorkId,
    externalId: normalizedWorkId,
    source: "openLibrary",
    key: `/works/${normalizedWorkId}`,
    title: asNonEmptyString(work.title) || asNonEmptyString(primaryEdition.title),
    authors: authorNames,
    author_name: authorNames,
    description,
    descriptionEn: description,
    language,
    cover_i: coverId,
    coverId,
    coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : "",
    isbn_13: asStringArray(primaryEdition.isbn_13),
    isbn_10: asStringArray(primaryEdition.isbn_10),
    firstPublishYear:
      typeof work.first_publish_date === "string" && /^\d{4}/.test(work.first_publish_date)
        ? Number(work.first_publish_date.slice(0, 4))
        : undefined,
  };
}

export async function resolveOpenLibraryReadableCandidate(
  ctx: ProviderLookupContext
): Promise<ExternalReadableCandidate | null> {
  const persistedSources = extractPersistedSources(ctx.book, "openLibrary");
  const directSource =
    persistedSources[0] ||
    (ctx.sourceHint?.source === "openLibrary"
      ? {
          provider: "openLibrary" as const,
          providerExternalId: ctx.sourceHint.providerExternalId,
          trust: "trusted" as const,
        }
      : null) ||
    (await searchOpenLibraryReadableSource(ctx));

  const workIds = resolveOpenLibraryIds(ctx);
  if (directSource && !workIds.includes(directSource.providerExternalId)) {
    workIds.unshift(directSource.providerExternalId);
  }

  for (const workId of workIds) {
    const editionsPayload = await fetchJson(
      `https://openlibrary.org/works/${workId}/editions.json?limit=20`
    );
    if (!editionsPayload) continue;

    const editions = Array.isArray(editionsPayload.entries)
      ? editionsPayload.entries
          .map((entry) => asRecord(entry))
          .filter((entry): entry is Record<string, unknown> => entry !== null)
      : [];

    for (const edition of editions) {
      const editionKey = asNonEmptyString(edition.key).replace(/^\/books\//, "");
      if (
        directSource?.providerExternalId === workId &&
        directSource.lendingEditionId &&
        editionKey &&
        directSource.lendingEditionId !== editionKey
      ) {
        continue;
      }

      const iaIds = collectIaIds(edition);
      if (iaIds.length === 0) continue;

      const candidates = iaIds.flatMap((iaId) => [
        {
          format: "epub" as const,
          url: `https://archive.org/download/${iaId}/${iaId}.epub`,
          mimeType: "application/epub+zip",
        },
        {
          format: "pdf" as const,
          url: `https://archive.org/download/${iaId}/${iaId}.pdf`,
          mimeType: "application/pdf",
        },
      ]);

      if (candidates.length === 0) continue;

      return {
        provider: "openLibrary",
        providerExternalId: workId,
        title: asNonEmptyString(edition.title) || asNonEmptyString(ctx.book.titleEn),
        language:
          extractLanguageCode((Array.isArray(edition.languages) ? edition.languages : [])[0]) ||
          asNonEmptyString(ctx.book.language) ||
          "en",
        trust: {
          availabilityTrust: true,
          acquisitionTrust: true,
        },
        candidates,
        persistedSource:
          directSource?.providerExternalId === workId
            ? directSource
            : {
                provider: "openLibrary",
                providerExternalId: workId,
                trust: "trusted",
              },
      };
    }
  }

  return null;
}
