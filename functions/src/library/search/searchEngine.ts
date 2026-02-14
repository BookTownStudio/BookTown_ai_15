import { getFirestore } from "firebase-admin/firestore";
import { LibraryEdition } from "../types/library.types";

export interface SearchOptions {
  ebookOnly?: boolean;
  language?: string;
}

type CanonicalSource = "googleBooks" | "openLibrary";

type SearchCandidate = {
  id: string;
  editionId: string;
  bookId: string;
  externalId: string;
  source: CanonicalSource;
  title: string;
  titleEn: string;
  titleAr: string;
  authors: string[];
  authorEn: string;
  authorAr: string;
  description: string;
  descriptionEn: string;
  descriptionAr: string;
  coverUrl: string;
  language: string;
  hasEbook: boolean;
  downloadable: boolean;
  isEbookAvailable: boolean;
  searchTitleNormalized: string;
  searchAuthorNormalized: string;
};

const TARGET_MAX_RESULTS = 20;
const MAX_CANDIDATES = 80;
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

function normalizeSearchText(value?: string | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value?: string | null): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

function normalizeSource(raw: unknown): CanonicalSource | null {
  const source = String(raw || "").trim().toLowerCase();
  if (
    source === "googlebooks" ||
    source === "google_books"
  ) {
    return "googleBooks";
  }
  if (
    source === "openlibrary" ||
    source === "open_library"
  ) {
    return "openLibrary";
  }
  return null;
}

function normalizeExternalId(raw: unknown, source: CanonicalSource): string {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (source === "googleBooks") {
    return value.replace(/^gb_/i, "");
  }
  return value.replace(/^ol_/i, "");
}

function createSearchId(source: CanonicalSource, externalId: string, fallback: string): string {
  if (externalId) {
    return source === "googleBooks" ? `gb_${externalId}` : `ol_${externalId}`;
  }
  return fallback;
}

function isNonBookDocument(title: string): boolean {
  const normalized = normalizeSearchText(title);
  if (!normalized) return true;

  return /\b(in re|v|vs|estate|conference|proceedings?|hearing|hearings|report|reports)\b/.test(
    normalized
  );
}

function mapEditionDoc(data: Record<string, unknown>, docId: string): SearchCandidate | null {
  const source = normalizeSource(data.source);
  if (!source) return null;

  const title = String(data.title || data.titleEn || "").trim();
  if (!title) return null;
  if (isNonBookDocument(title)) return null;

  const authors = Array.isArray(data.authors)
    ? (data.authors.filter((v) => typeof v === "string" && v.trim().length > 0) as string[])
    : [];

  const authorFromLegacy = String(data.authorEn || "").trim();
  const effectiveAuthors =
    authors.length > 0 ? authors : authorFromLegacy ? [authorFromLegacy] : ["Unknown"];

  const primaryAuthor = effectiveAuthors[0];
  const externalId = normalizeExternalId(data.externalId || data.id || docId, source);
  const editionId = String(data.editionId || docId).trim();
  const bookId = String(data.bookId || docId).trim();
  const normalizedTitle = normalizeSearchText(
    String(data.searchTitleNormalized || title)
  );
  const normalizedAuthor = normalizeSearchText(
    String(data.searchAuthorNormalized || primaryAuthor)
  );

  const downloadable = Boolean(data.downloadable);
  const hasEbook = downloadable;

  return {
    id: createSearchId(source, externalId, editionId),
    editionId,
    bookId,
    externalId,
    source,
    title,
    titleEn: String(data.titleEn || title),
    titleAr: String(data.titleAr || ""),
    authors: effectiveAuthors,
    authorEn: String(data.authorEn || primaryAuthor),
    authorAr: String(data.authorAr || ""),
    description: String(data.description || data.descriptionEn || ""),
    descriptionEn: String(data.descriptionEn || data.description || ""),
    descriptionAr: String(data.descriptionAr || ""),
    coverUrl: String(data.coverUrl || ""),
    language: String(data.language || "en"),
    hasEbook,
    downloadable,
    isEbookAvailable: hasEbook,
    searchTitleNormalized: normalizedTitle,
    searchAuthorNormalized: normalizedAuthor,
  };
}

function computeLexicalScore(queryNorm: string, queryTokens: string[], candidate: SearchCandidate): number {
  const titleNorm = candidate.searchTitleNormalized;
  const authorNorm = candidate.searchAuthorNormalized;
  const titleTokenSet = new Set(tokenize(titleNorm));
  const authorTokenSet = new Set(tokenize(authorNorm));

  let score = 0;

  if (titleNorm === queryNorm) score += 1000;
  else if (titleNorm.startsWith(queryNorm)) score += 700;
  else if (titleNorm.includes(queryNorm)) score += 400;

  if (authorNorm === queryNorm) score += 900;
  else if (authorNorm.startsWith(queryNorm)) score += 650;
  else if (authorNorm.includes(queryNorm)) score += 500;

  let titleHits = 0;
  let authorHits = 0;
  for (const token of queryTokens) {
    if (titleTokenSet.has(token)) titleHits += 1;
    if (authorTokenSet.has(token)) authorHits += 1;
  }

  score += titleHits * 120;
  score += authorHits * 180;

  // Author-intent clamp: single-token author queries must prioritize matching authors.
  if (queryTokens.length === 1) {
    if (authorHits > 0) score += 500;
    else score -= 200;
  }

  if (queryTokens.length > 0 && authorHits === queryTokens.length) {
    score += 300;
  }
  if (queryTokens.length > 1 && titleHits === queryTokens.length) {
    score += 250;
  }

  return score;
}

/**
 * Authoritative local-only search.
 * External federation is intentionally disabled until full schema/capability parity.
 */
export async function unifiedSearch(
  query: string,
  options: SearchOptions = {}
): Promise<LibraryEdition[]> {
  const queryNorm = normalizeSearchText(query);
  const queryTokens = tokenize(queryNorm);
  if (queryTokens.length === 0) return [];

  const db = getFirestore();
  const editionsRef = db.collection("editions");

  let baseQuery = editionsRef
    .where("searchTokens", "array-contains-any", queryTokens.slice(0, 10))
    .limit(MAX_CANDIDATES);

  if (options.ebookOnly) {
    baseQuery = baseQuery.where("downloadable", "==", true) as any;
  }

  const snap = await baseQuery.get();
  const candidates: SearchCandidate[] = [];
  const seen = new Set<string>();

  snap.forEach((doc) => {
    const mapped = mapEditionDoc(doc.data() as Record<string, unknown>, doc.id);
    if (!mapped) return;

    if (options.ebookOnly && !mapped.downloadable) return;
    if (options.language && mapped.language !== options.language) return;
    if (seen.has(mapped.editionId)) return;

    seen.add(mapped.editionId);
    candidates.push(mapped);
  });

  const ranked = [...candidates].sort((a, b) => {
    const scoreA = computeLexicalScore(queryNorm, queryTokens, a);
    const scoreB = computeLexicalScore(queryNorm, queryTokens, b);
    if (scoreB !== scoreA) return scoreB - scoreA;

    const titleCompare = a.searchTitleNormalized.localeCompare(b.searchTitleNormalized);
    if (titleCompare !== 0) return titleCompare;

    const authorCompare = a.searchAuthorNormalized.localeCompare(b.searchAuthorNormalized);
    if (authorCompare !== 0) return authorCompare;

    return a.editionId.localeCompare(b.editionId);
  });

  let ordered = ranked;
  if (queryTokens.length === 1) {
    const token = queryTokens[0];
    const authorMatches = ranked.filter((candidate) =>
      tokenize(candidate.searchAuthorNormalized).includes(token)
    );

    if (authorMatches.length >= 2) {
      const remainder = ranked.filter(
        (candidate) => !authorMatches.some((match) => match.editionId === candidate.editionId)
      );
      ordered = [...authorMatches, ...remainder];
    }
  }

  return ordered.slice(0, TARGET_MAX_RESULTS) as unknown as LibraryEdition[];
}
