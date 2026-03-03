import { createHash } from "crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { GoogleGenAI } from "@google/genai";
import type { AgentContextSnapshot } from "../intelligence/types";
import { enqueueIntelligenceSignal } from "../intelligence/signalQueue";
import { admin } from "../firebaseAdmin";
import {
  unifiedSearch,
  type UnifiedSearchResponse,
  type UnifiedSearchResult,
} from "../library/search/searchEngine";

const db = admin.firestore();

export const LIBRARIAN_LIMITS = {
  MAX_BOOKS: 3,
  DEFAULT_BOOKS: 1,
  TOKEN_LIMIT_INPUT: 2200,
  TOKEN_LIMIT_OUTPUT: 500,
  DAILY_QUOTA: 30,
  RETRY_BUDGET: 1,
  CACHE_TTL_DAYS: 7,
  HIGH_RELEVANCE_SCORE: 0.82,
  STRONG_ALIGNMENT: 0.8,
  HIGH_THEMATIC_OVERLAP: 0.75,
  LOW_ALIGNMENT_THRESHOLD: 0.55,
  MIN_REREAD_DAYS: 180,
} as const;

type LibrarianMode =
  | "Reinforcement"
  | "AdjacentExpansion"
  | "StructuredContrast"
  | "HighConfidencePrecision"
  | "ReReadingReflection";

export type LibrarianBookCard = {
  bookId: string;
  title: string;
  author: string;
  short_reason: string;
  mode: LibrarianMode;
  relevanceScore: number;
};

type LibrarianRequest = {
  normalizedQuery: string;
  intent: string;
};

type ProposedBook = {
  title: string;
  author: string;
};

type CandidateBook = {
  id: string;
  title: string;
  author: string;
  genres: string[];
  rating: number | null;
};

type VerifiedBook = CandidateBook & {
  sourceType: "canonical" | "lightweight";
  source: "booktown" | "googleBooks" | "openLibrary";
  externalId: string | null;
  canonicalBookId: string | null;
};

const LIBRARIAN_PROPOSAL_MODEL = "gemini-2.0-flash";
const LIBRARIAN_MAX_LLM_CANDIDATES = 6;
const LIBRARIAN_DEFAULT_SELECTION_COUNT = 2;
const LIBRARIAN_MAX_REGENERATION_ATTEMPTS = 1;
const LIBRARIAN_LLM_TIMEOUT_MS = 5000;
const LIBRARIAN_PROMPT_TOKEN_LIMIT = 2000;
const LIBRARIAN_MAX_UNIFIED_SEARCH_CALLS = 8;

type UnifiedSearchBudget = {
  used: number;
  limit: number;
};

const KNOWN_GENRES = [
  "Literary Fiction",
  "Philosophy",
  "History",
  "Mystery",
  "Fantasy",
  "Sci-Fi",
  "Biography",
  "Memoir",
  "Poetry",
  "Psychology",
  "Business",
  "Travel",
];

const GENRE_ADJACENCY: Record<string, string[]> = {
  "Literary Fiction": ["History", "Philosophy", "Mystery"],
  Philosophy: ["History", "Psychology", "Literary Fiction"],
  History: ["Biography", "Philosophy", "Literary Fiction"],
  Mystery: ["Literary Fiction", "Psychology", "Fantasy"],
  Fantasy: ["Sci-Fi", "Mystery", "Literary Fiction"],
  "Sci-Fi": ["Fantasy", "Psychology", "Literary Fiction"],
  Biography: ["History", "Memoir", "Philosophy"],
  Memoir: ["Biography", "Literary Fiction", "Psychology"],
  Poetry: ["Literary Fiction", "Philosophy", "History"],
  Psychology: ["Philosophy", "Memoir", "Mystery"],
  Business: ["Psychology", "Biography", "History"],
  Travel: ["Memoir", "History", "Literary Fiction"],
};

const EXCLUDED_TYPE_PATTERN =
  /\b(academic journal|research paper|conference proceedings?|technical manual|whitepaper|government report|report|reports|thesis|magazine issue|in re|\bvs\b|hearing|hearings)\b/i;

function normalizeUid(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  return normalized.slice(0, 128);
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

function tokenize(value: string): string[] {
  if (!value) return [];
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .slice(0, 24);
}

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function approximateTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

function truncatePromptToTokenLimit(prompt: string): string {
  const estimatedTokens = approximateTokens(prompt);
  if (estimatedTokens <= LIBRARIAN_PROMPT_TOKEN_LIMIT) {
    return prompt;
  }

  const maxChars = LIBRARIAN_PROMPT_TOKEN_LIMIT * 4;
  const truncated = prompt.slice(0, maxChars);
  logger.warn("[AI][LIBRARIIN][PROMPT_TRUNCATED]", {
    tokenEstimate: estimatedTokens,
    tokenLimit: LIBRARIAN_PROMPT_TOKEN_LIMIT,
    truncatedTokenEstimate: approximateTokens(truncated),
  });
  return truncated;
}

async function withTimeout<T>(params: {
  timeoutMs: number;
  stage: string;
  payload?: Record<string, unknown>;
  work: () => Promise<T>;
}): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      logger.warn("[AI][LIBRARIAN][TIMEOUT]", {
        stage: params.stage,
        timeoutMs: params.timeoutMs,
        ...(params.payload || {}),
      });
      reject(new Error(`TIMEOUT:${params.stage}`));
    }, params.timeoutMs);
  });

  try {
    return await Promise.race([params.work(), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function unifiedSearchWithBudget(params: {
  budget: UnifiedSearchBudget;
  query: string;
  limit: number;
  reason: string;
}): Promise<UnifiedSearchResponse | null> {
  if (params.budget.used >= params.budget.limit) {
    logger.warn("[AI][LIBRARIAN][CALL_CAP]", {
      maxUnifiedSearchCalls: params.budget.limit,
      usedUnifiedSearchCalls: params.budget.used,
      reason: params.reason,
      queryHash: createHash("sha256").update(params.query).digest("hex"),
    });
    return null;
  }

  params.budget.used += 1;
  return unifiedSearch(params.query, {
    limit: params.limit,
    language: "en",
    ebookOnly: false,
  });
}

function resolveMode(intentRaw: string, context: AgentContextSnapshot, query: string): LibrarianMode {
  const intent = intentRaw.trim().toLowerCase();
  if (intent.includes("precision")) return "HighConfidencePrecision";
  if (intent.includes("adjacent") || intent.includes("expand")) return "AdjacentExpansion";
  if (intent.includes("contrast") || intent.includes("boundary")) return "StructuredContrast";
  if (intent.includes("reread") || intent.includes("reflection")) return "ReReadingReflection";
  if (intent.includes("reinforce")) return "Reinforcement";

  // Boundary expansion trigger proxy: low novelty + high abandonment + explicit stuck intent.
  if (
    context.behavior.noveltyTolerance < 0.35 &&
    context.behavior.abandonmentRate > 0.45 &&
    (intent.includes("stuck") || query.includes("something different"))
  ) {
    return "StructuredContrast";
  }

  if (query.length > 0 && context.indices.explorationIndex < 0.45) {
    return "HighConfidencePrecision";
  }

  return "Reinforcement";
}

function topGenreWeights(context: AgentContextSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of context.genres.topGenres || []) {
    if (!row || typeof row.name !== "string") continue;
    const key = row.name.trim();
    if (!key) continue;
    out[key] = clamp(Number(row.weight) / 10, 0, 1);
  }
  if (Object.keys(out).length === 0 && context.genres.dominantGenre) {
    out[context.genres.dominantGenre] = 1;
  }
  return out;
}

function normalizeCandidate(docSnap: QueryDocumentSnapshot<DocumentData>): CandidateBook | null {
  const data = docSnap.data() || {};
  const title = String(data.titleEn || data.title || "").trim().slice(0, 300);
  if (!title) return null;
  const author = String(data.authorEn || data.author || "Unknown").trim().slice(0, 180);
  const genresRaw = Array.isArray(data.genresEn)
    ? data.genresEn
    : Array.isArray(data.categories)
    ? data.categories
    : [];
  const genres = genresRaw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .slice(0, 6);

  const titleLower = title.toLowerCase();
  if (EXCLUDED_TYPE_PATTERN.test(titleLower)) return null;

  const ratingRaw = Number(
    data.averageRating ?? data.rating ?? data.ratingsAverage ?? Number.NaN
  );
  const rating = Number.isFinite(ratingRaw) ? clamp(ratingRaw / 5, 0, 1) * 5 : null;

  return {
    id: docSnap.id,
    title,
    author,
    genres,
    rating,
  };
}

function deterministicCandidateSort(a: CandidateBook, b: CandidateBook): number {
  if (a.title !== b.title) return a.title.localeCompare(b.title);
  if (a.author !== b.author) return a.author.localeCompare(b.author);
  return a.id.localeCompare(b.id);
}

function looksLikeCanonicalKey(value: string): boolean {
  return /^[a-z0-9][a-z0-9:_-]{2,127}$/.test(value) && !value.includes(" ");
}

function buildAnchorTitleCandidates(normalizedQuery: string): string[] {
  const out = new Set<string>();
  if (normalizedQuery) out.add(normalizedQuery);

  const tokens = tokenize(normalizedQuery).slice(0, 8);
  if (tokens.length <= 1) {
    return Array.from(out);
  }

  const maxPhraseLength = Math.min(4, tokens.length);
  for (let phraseLength = maxPhraseLength; phraseLength >= 1; phraseLength -= 1) {
    for (let start = 0; start + phraseLength <= tokens.length; start += 1) {
      const phrase = tokens.slice(start, start + phraseLength).join(" ").trim();
      if (phrase.length > 0) out.add(phrase);
      if (out.size >= 20) {
        return Array.from(out);
      }
    }
  }

  return Array.from(out);
}

async function resolveAnchorByIndexedField(
  field: "normalizedTitle" | "canonicalKey" | "searchableTitleAuthor",
  value: string
): Promise<CandidateBook | null> {
  if (!value) return null;
  const snap = await db.collection("books").where(field, "==", value).limit(5).get();
  if (snap.empty) return null;
  const candidates = snap.docs
    .map((docSnap) => normalizeCandidate(docSnap))
    .filter((row): row is CandidateBook => row !== null)
    .sort(deterministicCandidateSort);
  return candidates.length > 0 ? candidates[0] : null;
}

async function resolveAnchorBook(normalizedQuery: string): Promise<CandidateBook | null> {
  const query = normalizeText(normalizedQuery);
  if (!query) return null;

  const titleCandidates = buildAnchorTitleCandidates(query);
  for (const titleKey of titleCandidates) {
    // eslint-disable-next-line no-await-in-loop
    const exactTitle = await resolveAnchorByIndexedField("normalizedTitle", titleKey);
    if (exactTitle) return exactTitle;
  }

  if (looksLikeCanonicalKey(query)) {
    const canonical = await resolveAnchorByIndexedField("canonicalKey", query);
    if (canonical) return canonical;
  }

  return resolveAnchorByIndexedField("searchableTitleAuthor", query);
}

function proposalKey(title: string, author: string): string {
  return `${normalizeText(title)}|${normalizeText(author)}`;
}

function normalizeProposalAuthor(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 180);
}

function normalizeProposalTitle(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 300);
}

function parseProposalPayload(payload: unknown): ProposedBook[] {
  if (!Array.isArray(payload)) return [];
  const out: ProposedBook[] = [];
  const seen = new Set<string>();
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const title = normalizeProposalTitle(record.title);
    const author = normalizeProposalAuthor(record.author);
    if (!title || !author) continue;
    const key = proposalKey(title, author);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, author });
    if (out.length >= LIBRARIAN_MAX_LLM_CANDIDATES) {
      break;
    }
  }
  return out;
}

function parseProposalsFromModelText(text: string): ProposedBook[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    return parseProposalPayload(JSON.parse(trimmed));
  } catch {
    // Continue with bracket extraction.
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return [];
  const jsonSlice = trimmed.slice(start, end + 1);
  try {
    return parseProposalPayload(JSON.parse(jsonSlice));
  } catch {
    return [];
  }
}

function summarizeContextForProposal(context: AgentContextSnapshot): Record<string, unknown> {
  return {
    profileVersion: context.profileVersion,
    dominantGenre: context.genres.dominantGenre || "",
    topGenres: context.genres.topGenres.slice(0, 4).map((row) => row.name),
    explorationIndex: context.indices.explorationIndex,
    completionConsistency: context.indices.completionConsistency,
    culturalDepthIndex: context.indices.culturalDepthIndex,
    noveltyTolerance: context.behavior.noveltyTolerance,
  };
}

function buildProposalPrompt(params: {
  normalizedQuery: string;
  mode: LibrarianMode;
  context: AgentContextSnapshot;
  anchorTitle: string;
  anchorAuthor: string;
  excludedKeys: string[];
}): string {
  const contextSummary = summarizeContextForProposal(params.context);
  const exclusions =
    params.excludedKeys.length > 0
      ? `Do not repeat these title|author keys: ${params.excludedKeys.join(", ")}.`
      : "No exclusions.";

  return [
    "You are a neighborhood librarian recommending books only.",
    "Return JSON only. Format: [{\"title\":\"...\",\"author\":\"...\"}].",
    `Return between 3 and ${LIBRARIAN_MAX_LLM_CANDIDATES} candidates.`,
    "Do not include essays, papers, podcasts, lectures, or non-book media.",
    "Do not include explanations or markdown.",
    `Mode: ${params.mode}.`,
    `User query: ${params.normalizedQuery}`,
    params.anchorTitle ? `Anchor title (if relevant): ${params.anchorTitle}` : "No anchor title resolved.",
    params.anchorAuthor ? `Anchor author (if relevant): ${params.anchorAuthor}` : "No anchor author resolved.",
    `Structured context: ${JSON.stringify(contextSummary)}`,
    exclusions,
  ].join("\n");
}

function createProposalClient(): GoogleGenAI | null {
  const apiKey =
    String(process.env.GEMINI_API_KEY || "").trim() ||
    String(process.env.GOOGLE_GENAI_API_KEY || "").trim() ||
    String(process.env.GOOGLE_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

async function searchBackedProposals(params: {
  normalizedQuery: string;
  budget: UnifiedSearchBudget;
  reason: string;
}): Promise<ProposedBook[]> {
  const response = await unifiedSearchWithBudget({
    budget: params.budget,
    query: params.normalizedQuery,
    limit: LIBRARIAN_MAX_LLM_CANDIDATES,
    reason: params.reason,
  });
  if (!response) return [];

  const out: ProposedBook[] = [];
  const seen = new Set<string>();
  for (const row of response.results) {
    const title = normalizeProposalTitle(row.title || row.titleEn);
    const author =
      normalizeProposalAuthor(row.authorEn) ||
      normalizeProposalAuthor(Array.isArray(row.authors) ? row.authors[0] : "");
    if (!title || !author) continue;
    const key = proposalKey(title, author);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, author });
    if (out.length >= LIBRARIAN_MAX_LLM_CANDIDATES) break;
  }
  return out;
}

async function proposeBooks(params: {
  normalizedQuery: string;
  mode: LibrarianMode;
  context: AgentContextSnapshot;
  anchor: CandidateBook | null;
  excludedKeys: string[];
  budget: UnifiedSearchBudget;
}): Promise<ProposedBook[]> {
  const prompt = truncatePromptToTokenLimit(
    buildProposalPrompt({
      normalizedQuery: params.normalizedQuery,
      mode: params.mode,
      context: params.context,
      anchorTitle: params.anchor?.title || "",
      anchorAuthor: params.anchor?.author || "",
      excludedKeys: params.excludedKeys,
    })
  );

  const client = createProposalClient();
  if (!client) {
    logger.warn("[AI][LIBRARIAN][PROPOSAL_MODEL_UNAVAILABLE]", {
      reason: "missing_api_key",
    });
    return searchBackedProposals({
      normalizedQuery: params.normalizedQuery,
      budget: params.budget,
      reason: "proposal_model_unavailable",
    });
  }

  try {
    const response = await withTimeout({
      timeoutMs: LIBRARIAN_LLM_TIMEOUT_MS,
      stage: "proposal_model_generate",
      payload: { model: LIBRARIAN_PROPOSAL_MODEL },
      work: () =>
        client.models.generateContent({
          model: LIBRARIAN_PROPOSAL_MODEL,
          contents: prompt,
          config: {
            temperature: 0.2,
            topP: 0.9,
            maxOutputTokens: 380,
            responseMimeType: "application/json",
          },
        }),
    });
    const parsed = parseProposalsFromModelText(response.text || "");
    if (parsed.length > 0) {
      return parsed;
    }
    logger.warn("[AI][LIBRARIAN][PROPOSAL_PARSE_EMPTY]", {
      model: LIBRARIAN_PROPOSAL_MODEL,
    });
  } catch (error) {
    logger.error("[AI][LIBRARIAN][PROPOSAL_MODEL_FAILED]", {
      error: String(error),
      model: LIBRARIAN_PROPOSAL_MODEL,
    });
  }
  return searchBackedProposals({
    normalizedQuery: params.normalizedQuery,
    budget: params.budget,
    reason: "proposal_model_failed_or_empty",
  });
}

function authorMatchScore(candidateAuthor: string, requestedAuthor: string): number {
  const a = normalizeText(candidateAuthor);
  const b = normalizeText(requestedAuthor);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const aTokens = tokenize(a);
  const bTokens = new Set(tokenize(b));
  if (aTokens.length === 0 || bTokens.size === 0) return 0;
  let matches = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) matches += 1;
  }
  return clamp(matches / Math.max(1, Math.max(aTokens.length, bTokens.size)));
}

function mapCanonicalDocsToCandidates(
  docs: Array<QueryDocumentSnapshot<DocumentData>>
): CandidateBook[] {
  return docs
    .map((docSnap) => normalizeCandidate(docSnap))
    .filter((row): row is CandidateBook => row !== null)
    .sort(deterministicCandidateSort);
}

async function verifyCanonicalByTitleAuthor(proposal: ProposedBook): Promise<CandidateBook | null> {
  const titleKey = normalizeText(proposal.title);
  const authorKey = normalizeText(proposal.author);
  if (!titleKey || !authorKey) return null;

  const byTitle = await db.collection("books").where("normalizedTitle", "==", titleKey).limit(12).get();
  if (!byTitle.empty) {
    const candidates = mapCanonicalDocsToCandidates(byTitle.docs);
    const ranked = candidates
      .map((row) => ({ row, score: authorMatchScore(row.author, proposal.author) }))
      .sort((a, b) => (b.score === a.score ? deterministicCandidateSort(a.row, b.row) : b.score - a.score));
    if (ranked.length > 0 && ranked[0].score >= 0.65) {
      return ranked[0].row;
    }
  }

  const titleAuthorKey = normalizeText(`${proposal.title} ${proposal.author}`);
  const bySearchable = await db
    .collection("books")
    .where("searchableTitleAuthor", "==", titleAuthorKey)
    .limit(5)
    .get();
  if (bySearchable.empty) return null;
  const mapped = mapCanonicalDocsToCandidates(bySearchable.docs);
  return mapped.length > 0 ? mapped[0] : null;
}

function normalizedAuthorFromSearchResult(result: UnifiedSearchResult): string {
  const direct = normalizeProposalAuthor(result.authorEn);
  if (direct) return direct;
  const fromArray = Array.isArray(result.authors) && result.authors.length > 0 ? result.authors[0] : "";
  return normalizeProposalAuthor(fromArray);
}

function pickBestSearchResult(
  proposal: ProposedBook,
  results: UnifiedSearchResult[]
): UnifiedSearchResult | null {
  const titleKey = normalizeText(proposal.title);
  const authorKey = normalizeText(proposal.author);
  const ranked = results
    .map((result) => {
      const resultTitle = normalizeText(result.title || result.titleEn);
      const resultAuthor = normalizeText(normalizedAuthorFromSearchResult(result));
      const titleScore = resultTitle === titleKey ? 1 : resultTitle.includes(titleKey) || titleKey.includes(resultTitle) ? 0.85 : 0;
      const authorScore = authorMatchScore(resultAuthor, authorKey);
      const sourceBoost = result.resultType === "canonical" ? 0.08 : 0;
      const score = round(clamp(titleScore * 0.75 + authorScore * 0.25 + sourceBoost));
      return { result, score };
    })
    .filter((row) => row.score >= 0.6)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.result.resultType !== b.result.resultType) {
        return a.result.resultType === "canonical" ? -1 : 1;
      }
      return a.result.bookId.localeCompare(b.result.bookId);
    });
  return ranked.length > 0 ? ranked[0].result : null;
}

function extractSearchGenres(row: UnifiedSearchResult): string[] {
  const raw = row.rawBook && typeof row.rawBook === "object" ? (row.rawBook as Record<string, unknown>) : {};
  const genresRaw = Array.isArray(raw.genresEn)
    ? raw.genresEn
    : Array.isArray(raw.categories)
    ? raw.categories
    : [];
  return genresRaw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, 6);
}

function extractSearchRating(row: UnifiedSearchResult): number | null {
  const raw = row.rawBook && typeof row.rawBook === "object" ? (row.rawBook as Record<string, unknown>) : {};
  const ratingRaw = Number(raw.averageRating ?? raw.rating ?? Number.NaN);
  return Number.isFinite(ratingRaw) ? clamp(ratingRaw / 5, 0, 1) * 5 : null;
}

async function storeLightweightVerifiedBook(params: {
  verified: VerifiedBook;
  normalizedQuery: string;
}): Promise<void> {
  const normalizedTitle = normalizeText(params.verified.title);
  const normalizedAuthor = normalizeText(params.verified.author);
  if (!normalizedTitle || !normalizedAuthor) return;
  const docId = createHash("sha256")
    .update(
      `${normalizedTitle}|${normalizedAuthor}|${params.verified.source}|${params.verified.externalId || params.verified.canonicalBookId || ""}`
    )
    .digest("hex");
  await db
    .collection("ai_librarian_lightweight_books")
    .doc(docId)
    .set(
      {
        title: params.verified.title,
        author: params.verified.author,
        normalizedTitle,
        normalizedAuthor,
        genresEn: params.verified.genres,
        averageRating: params.verified.rating,
        source: params.verified.source,
        sourceType: params.verified.sourceType,
        externalId: params.verified.externalId,
        canonicalBookId: params.verified.canonicalBookId,
        normalizedQuery: params.normalizedQuery,
        updatedAt: FieldValue.serverTimestamp(),
        verifiedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

async function verifyProposedBook(params: {
  proposal: ProposedBook;
  normalizedQuery: string;
  budget: UnifiedSearchBudget;
}): Promise<VerifiedBook | null> {
  const canonical = await verifyCanonicalByTitleAuthor(params.proposal);
  if (canonical) {
    const verified: VerifiedBook = {
      ...canonical,
      sourceType: "canonical",
      source: "booktown",
      externalId: null,
      canonicalBookId: canonical.id,
    };
    await storeLightweightVerifiedBook({
      verified,
      normalizedQuery: params.normalizedQuery,
    });
    return verified;
  }

  const verificationQuery = `${params.proposal.title} ${params.proposal.author}`.trim();
  const searchResponse = await unifiedSearchWithBudget({
    budget: params.budget,
    query: verificationQuery,
    limit: 12,
    reason: "proposal_verification",
  });
  if (!searchResponse) return null;

  const best = pickBestSearchResult(params.proposal, searchResponse.results);
  if (!best) return null;

  if (best.resultType === "canonical") {
    const snap = await db.collection("books").doc(best.bookId).get();
    if (snap.exists) {
      const normalized = normalizeCandidate(snap as QueryDocumentSnapshot<DocumentData>);
      if (normalized) {
        const verified: VerifiedBook = {
          ...normalized,
          sourceType: "canonical",
          source: "booktown",
          externalId: best.externalId || null,
          canonicalBookId: best.bookId,
        };
        await storeLightweightVerifiedBook({
          verified,
          normalizedQuery: params.normalizedQuery,
        });
        return verified;
      }
    }
  }

  const externalAuthor = normalizedAuthorFromSearchResult(best) || params.proposal.author;
  const externalTitle = normalizeProposalTitle(best.title || best.titleEn) || params.proposal.title;
  const lightweightId = `lw_${createHash("sha256")
    .update(`${best.source}|${best.externalId || best.bookId}|${externalTitle}|${externalAuthor}`)
    .digest("hex")
    .slice(0, 28)}`;
  const verified: VerifiedBook = {
    id: lightweightId,
    title: externalTitle,
    author: externalAuthor,
    genres: extractSearchGenres(best),
    rating: extractSearchRating(best),
    sourceType: "lightweight",
    source: best.source,
    externalId: best.externalId || best.bookId || null,
    canonicalBookId: best.resultType === "canonical" ? best.bookId : null,
  };
  await storeLightweightVerifiedBook({
    verified,
    normalizedQuery: params.normalizedQuery,
  });
  return verified;
}

function dedupeVerifiedBooks(rows: VerifiedBook[]): VerifiedBook[] {
  const out: VerifiedBook[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.canonicalBookId || proposalKey(row.title, row.author) || row.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function fetchGenreCandidates(genres: string[], perGenreLimit: number): Promise<CandidateBook[]> {
  const tasks = genres
    .filter((genre) => genre.trim().length > 0)
    .slice(0, 4)
    .map(async (genre) => {
      const snap = await db
        .collection("books")
        .where("genresEn", "array-contains", genre)
        .limit(perGenreLimit)
        .get();
      return snap.docs
        .map((docSnap) => normalizeCandidate(docSnap))
        .filter((row): row is CandidateBook => row !== null);
    });

  const rows = await Promise.all(tasks);
  return rows.flat();
}

async function fetchFallbackCandidates(limit: number): Promise<CandidateBook[]> {
  const snap = await db.collection("books").limit(limit).get();
  return snap.docs
    .map((docSnap) => normalizeCandidate(docSnap))
    .filter((row): row is CandidateBook => row !== null);
}

function lexicalSimilarity(queryTokens: string[], candidate: CandidateBook): number {
  if (queryTokens.length === 0) return 0;
  const target = normalizeText(`${candidate.title} ${candidate.author}`);
  if (!target) return 0;
  let matched = 0;
  for (const token of queryTokens) {
    if (target.includes(token)) matched += 1;
  }
  return clamp(matched / queryTokens.length);
}

function genreAlignmentScore(
  bookGenres: string[],
  topWeights: Record<string, number>
): { alignment: number; thematicOverlap: number } {
  if (bookGenres.length === 0) {
    return { alignment: 0, thematicOverlap: 0 };
  }

  let matched = 0;
  let totalWeight = 0;
  for (const genre of bookGenres) {
    const weight = topWeights[genre] || 0;
    if (weight > 0) {
      matched += 1;
      totalWeight += weight;
    }
  }

  const thematicOverlap = clamp(matched / Math.max(1, Math.min(3, bookGenres.length)));
  const alignment = clamp(totalWeight / Math.max(1, matched || 1));
  return { alignment, thematicOverlap };
}

function modeBonus(
  mode: LibrarianMode,
  bookGenres: string[],
  dominantGenre: string,
  queryScore: number
): number {
  if (mode === "HighConfidencePrecision") {
    return queryScore * 0.18;
  }
  if (mode === "Reinforcement") {
    return bookGenres.includes(dominantGenre) ? 0.14 : 0;
  }
  if (mode === "AdjacentExpansion") {
    const adjacent = new Set(GENRE_ADJACENCY[dominantGenre] || []);
    const hit = bookGenres.some((genre) => adjacent.has(genre));
    return hit ? 0.12 : 0;
  }
  if (mode === "StructuredContrast") {
    const adjacent = new Set(GENRE_ADJACENCY[dominantGenre] || []);
    const contrastHit = bookGenres.some(
      (genre) => genre !== dominantGenre && !adjacent.has(genre)
    );
    return contrastHit ? 0.12 : 0;
  }
  return 0;
}

function buildShortReason(params: {
  mode: LibrarianMode;
  dominantGenre: string;
  queryTokens: string[];
  thematicOverlap: number;
  lowRated: boolean;
}): string {
  const { mode, dominantGenre, queryTokens, thematicOverlap, lowRated } = params;
  const queryMention =
    queryTokens.length > 0
      ? ` It directly matches your request for ${queryTokens.slice(0, 3).join(" ")}.`
      : "";

  let sentenceOne = "";
  if (mode === "HighConfidencePrecision") {
    sentenceOne = "This is a strong precision match for what you asked.";
  } else if (mode === "Reinforcement") {
    sentenceOne = dominantGenre
      ? `This deepens your ${dominantGenre} reading lane with high profile alignment.`
      : "This reinforces your current reading lane with high profile alignment.";
  } else if (mode === "AdjacentExpansion") {
    sentenceOne = "This sits near your usual genres while extending your boundary safely.";
  } else if (mode === "StructuredContrast") {
    sentenceOne =
      "This is a deliberate contrast pick to expand breadth without breaking your core taste.";
  } else {
    sentenceOne = "This invites a reflective re-read based on your long-term reading pattern.";
  }

  const sentenceTwo =
    lowRated
      ? "Its rating is lower than average, but thematic alignment is unusually strong for your profile."
      : thematicOverlap >= LIBRARIAN_LIMITS.HIGH_THEMATIC_OVERLAP
      ? "The thematic overlap with your profile is high."
      : "The match is the closest high-confidence fit from your current profile snapshot.";

  const merged = `${sentenceOne}${queryMention} ${sentenceTwo}`
    .replace(/\s+/g, " ")
    .trim();

  const sentences = merged
    .split(".")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 2);
  return `${sentences.join(". ")}.`;
}

async function findRereadCandidate(uid: string): Promise<CandidateBook | null> {
  const cutoff = Timestamp.fromMillis(
    Date.now() - LIBRARIAN_LIMITS.MIN_REREAD_DAYS * 24 * 60 * 60 * 1000
  );

  const [userIdSnap, uidSnap] = await Promise.all([
    db
      .collection("reading_progress")
      .where("userId", "==", uid)
      .where("status_state", "==", "completed")
      .where("updatedAt", "<=", cutoff)
      .limit(20)
      .get(),
    db
      .collection("reading_progress")
      .where("uid", "==", uid)
      .where("status_state", "==", "completed")
      .where("updatedAt", "<=", cutoff)
      .limit(20)
      .get(),
  ]);

  const merged = new Map<string, Record<string, unknown>>();
  for (const docSnap of userIdSnap.docs) {
    merged.set(docSnap.id, docSnap.data() as Record<string, unknown>);
  }
  for (const docSnap of uidSnap.docs) {
    if (!merged.has(docSnap.id)) {
      merged.set(docSnap.id, docSnap.data() as Record<string, unknown>);
    }
  }

  const finished = Array.from(merged.values()).sort((a, b) => {
    const aMs =
      a.updatedAt && typeof (a.updatedAt as { toMillis?: unknown }).toMillis === "function"
        ? Number((a.updatedAt as { toMillis: () => number }).toMillis())
        : 0;
    const bMs =
      b.updatedAt && typeof (b.updatedAt as { toMillis?: unknown }).toMillis === "function"
        ? Number((b.updatedAt as { toMillis: () => number }).toMillis())
        : 0;
    return aMs - bMs;
  });

  for (const row of finished) {
    const bookId = typeof row.bookId === "string" ? row.bookId.trim() : "";
    if (!bookId) continue;
    // eslint-disable-next-line no-await-in-loop
    const snap = await db.collection("books").doc(bookId).get();
    if (!snap.exists) continue;
    const normalized = normalizeCandidate(
      snap as unknown as QueryDocumentSnapshot<DocumentData>
    );
    if (normalized) return normalized;
  }

  return null;
}

function cacheDocId(uid: string, profileVersion: number, intent: string, normalizedQuery: string): string {
  const hash = createHash("sha256")
    .update(`${uid}|${profileVersion}|${intent}|${normalizedQuery}`)
    .digest("hex");
  return `librarian_${hash}`;
}

async function consumeDailyQuota(uid: string): Promise<{ ok: true; remaining: number } | { ok: false }> {
  const dateKey = new Date().toISOString().slice(0, 10);
  const docId = `librarian_${uid}_${dateKey}`;
  const ref = db.collection("_ai_librarian_quota").doc(docId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count =
      snap.exists && typeof snap.get("count") === "number"
        ? Math.max(0, Math.trunc(Number(snap.get("count"))))
        : 0;

    if (count >= LIBRARIAN_LIMITS.DAILY_QUOTA) {
      return { ok: false } as const;
    }

    const next = count + 1;
    tx.set(
      ref,
      {
        uid,
        dateKey,
        count: next,
        limit: LIBRARIAN_LIMITS.DAILY_QUOTA,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true, remaining: LIBRARIAN_LIMITS.DAILY_QUOTA - next } as const;
  });
}

async function getDailyQuotaRemaining(uid: string): Promise<number> {
  const dateKey = new Date().toISOString().slice(0, 10);
  const docId = `librarian_${uid}_${dateKey}`;
  const ref = db.collection("_ai_librarian_quota").doc(docId);
  const snap = await ref.get();
  const count =
    snap.exists && typeof snap.get("count") === "number"
      ? Math.max(0, Math.trunc(Number(snap.get("count"))))
      : 0;
  return Math.max(0, LIBRARIAN_LIMITS.DAILY_QUOTA - count);
}

async function getCachedRecommendations(params: {
  uid: string;
  profileVersion: number;
  intent: string;
  normalizedQuery: string;
}): Promise<LibrarianBookCard[] | null> {
  const docId = cacheDocId(
    params.uid,
    params.profileVersion,
    params.intent,
    params.normalizedQuery
  );
  const ref = db.collection("ai_librarian_cache").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const expiresAt = snap.get("expiresAt") as Timestamp | undefined;
  if (!expiresAt || expiresAt.toMillis() < Date.now()) return null;

  const recommendations = snap.get("recommendations");
  if (!Array.isArray(recommendations)) return null;

  const parsed = recommendations
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        bookId: typeof record.bookId === "string" ? record.bookId : "",
        title: typeof record.title === "string" ? record.title : "",
        author: typeof record.author === "string" ? record.author : "",
        short_reason: typeof record.short_reason === "string" ? record.short_reason : "",
        mode: typeof record.mode === "string" ? (record.mode as LibrarianMode) : "Reinforcement",
        relevanceScore: Number(record.relevanceScore || 0),
      };
    })
    .filter(
      (row) =>
        row.bookId.length > 0 &&
        row.title.length > 0 &&
        row.author.length > 0 &&
        row.short_reason.length > 0
    )
    .slice(0, LIBRARIAN_LIMITS.MAX_BOOKS)
    .map((row) => ({ ...row, relevanceScore: round(clamp(row.relevanceScore)) }));

  return parsed.length > 0 ? parsed : null;
}

async function storeCachedRecommendations(params: {
  uid: string;
  profileVersion: number;
  intent: string;
  normalizedQuery: string;
  recommendations: LibrarianBookCard[];
}): Promise<void> {
  const docId = cacheDocId(
    params.uid,
    params.profileVersion,
    params.intent,
    params.normalizedQuery
  );
  const ref = db.collection("ai_librarian_cache").doc(docId);
  const expiresAt = Timestamp.fromMillis(
    Date.now() + LIBRARIAN_LIMITS.CACHE_TTL_DAYS * 24 * 60 * 60 * 1000
  );
  await ref.set(
    {
      uid: params.uid,
      profileVersion: params.profileVersion,
      intent: params.intent,
      normalizedQuery: params.normalizedQuery,
      recommendations: params.recommendations,
      expiresAt,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function emitHomeFeedSignal(params: {
  uid: string;
  profileVersion: number;
  normalizedQuery: string;
  recommendationCount: number;
}): Promise<void> {
  const dedupeKey = createHash("sha256")
    .update(`${params.uid}${params.profileVersion}${params.normalizedQuery}`)
    .digest("hex");
  await enqueueIntelligenceSignal({
    uid: params.uid,
    signalType: "librarian_recommendation",
    signalFamily: "agent",
    sourceEventId: dedupeKey,
    payload: {
      profileVersion: params.profileVersion,
      normalizedQuery: params.normalizedQuery,
      recommendationCount: params.recommendationCount,
    },
    sourcePath: "api/ai/librarian",
  });
}

function validateRequest(input: LibrarianRequest): {
  ok: true;
  normalizedQuery: string;
} | {
  ok: false;
  reason: string;
} {
  const normalizedQuery = normalizeText(input.normalizedQuery);
  if (!normalizedQuery) {
    return { ok: false, reason: "INVALID_REQUEST:normalizedQuery" };
  }
  if (typeof input.intent !== "string" || input.intent.trim().length === 0) {
    return { ok: false, reason: "INVALID_REQUEST:intent" };
  }

  const tokenEstimate = approximateTokens(
    JSON.stringify({
      normalizedQuery,
      intent: input.intent,
    })
  );
  if (tokenEstimate > LIBRARIAN_LIMITS.TOKEN_LIMIT_INPUT) {
    return { ok: false, reason: "INVALID_REQUEST:token_limit_input" };
  }

  return { ok: true, normalizedQuery };
}

function deterministicSort(a: LibrarianBookCard, b: LibrarianBookCard): number {
  if (b.relevanceScore !== a.relevanceScore) {
    return b.relevanceScore - a.relevanceScore;
  }
  if (a.title !== b.title) return a.title.localeCompare(b.title);
  return a.bookId.localeCompare(b.bookId);
}

function buildFallbackCard(params: {
  context: AgentContextSnapshot;
  mode: LibrarianMode;
  effectiveDominant?: string;
}): LibrarianBookCard {
  const dominant =
    params.effectiveDominant ||
    params.context.genres.dominantGenre ||
    "Literary Fiction";

  return {
    bookId: "",
    title: "No verified recommendations",
    author: "BookTown Catalog",
    mode: params.mode,
    relevanceScore: round(
      clamp(params.context.indices.explorationIndex * 0.6 + 0.3)
    ),
    short_reason: dominant
      ? `Verification failed for all candidates. Try one concrete ${dominant} title or author.`
      : "Verification failed for all candidates. Try one concrete title or author.",
  };
}

export async function runLibrarianRecommendation(params: {
  uid: string;
  request: LibrarianRequest;
  context: AgentContextSnapshot;
}): Promise<{
  recommendations: LibrarianBookCard[];
  fromCache: boolean;
  remainingQuota: number;
  normalizedQuery: string;
}> {
  const validation = validateRequest(params.request);
  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  const normalizedUid = normalizeUid(params.uid);
  if (!normalizedUid) {
    throw new Error("INVALID_REQUEST");
  }

  const anchor = await resolveAnchorBook(validation.normalizedQuery);
  logger.info("[AI][LIBRARIAN][ANCHOR_RESOLUTION]", {
    resolved: Boolean(anchor),
    anchorBookId: anchor?.id || null,
    queryHash: createHash("sha256").update(validation.normalizedQuery).digest("hex"),
  });

  const mode = resolveMode(
    params.request.intent,
    params.context,
    validation.normalizedQuery
  );
  const anchorGenres = (anchor?.genres || [])
    .filter((genre) => genre.trim().length > 0)
    .slice(0, 3);
  const topWeights = topGenreWeights(params.context);
  const dominantGenre =
    params.context.genres.dominantGenre ||
    (anchorGenres.length > 0 ? anchorGenres[0] : "");
  const queryTokens = tokenize(validation.normalizedQuery);
  const unifiedSearchBudget: UnifiedSearchBudget = {
    used: 0,
    limit: LIBRARIAN_MAX_UNIFIED_SEARCH_CALLS,
  };

  const cache = await getCachedRecommendations({
    uid: normalizedUid,
    profileVersion: params.context.profileVersion,
    intent: params.request.intent,
    normalizedQuery: validation.normalizedQuery,
  });
  if (cache) {
    const remainingFromCache = await getDailyQuotaRemaining(normalizedUid);
    return {
      recommendations: cache,
      fromCache: true,
      remainingQuota: remainingFromCache,
      normalizedQuery: validation.normalizedQuery,
    };
  }

  const quota = await consumeDailyQuota(normalizedUid);
  if (!quota.ok) {
    throw new Error("QUOTA_EXCEEDED");
  }

  const excludedProposalKeys = new Set<string>();
  const verifiedPool: VerifiedBook[] = [];
  let regenerationCount = 0;

  for (let attempt = 0; attempt <= LIBRARIAN_MAX_REGENERATION_ATTEMPTS; attempt += 1) {
    const proposals = await proposeBooks({
      normalizedQuery: validation.normalizedQuery,
      mode,
      context: params.context,
      anchor,
      excludedKeys: Array.from(excludedProposalKeys),
      budget: unifiedSearchBudget,
    });

    const freshProposals = proposals.filter((row) => {
      const key = proposalKey(row.title, row.author);
      if (!key || excludedProposalKeys.has(key)) return false;
      excludedProposalKeys.add(key);
      return true;
    });
    if (freshProposals.length === 0) {
      break;
    }

    const verifiedRows = await Promise.all(
      freshProposals.map(async (proposal) => {
        try {
          return await verifyProposedBook({
            proposal,
            normalizedQuery: validation.normalizedQuery,
            budget: unifiedSearchBudget,
          });
        } catch (error) {
          logger.error("[AI][LIBRARIAN][VERIFICATION_FAILED]", {
            title: proposal.title,
            author: proposal.author,
            error: String(error),
          });
          return null;
        }
      })
    );

    verifiedPool.push(
      ...verifiedRows.filter((row): row is VerifiedBook => row !== null)
    );
    const uniqueVerified = dedupeVerifiedBooks(verifiedPool);
    if (uniqueVerified.length >= LIBRARIAN_DEFAULT_SELECTION_COUNT) {
      break;
    }
    if (attempt < LIBRARIAN_MAX_REGENERATION_ATTEMPTS) {
      regenerationCount += 1;
    }
  }

  const verified = dedupeVerifiedBooks(verifiedPool);
  const scored = verified
    .map((candidate) => {
      const queryScore = lexicalSimilarity(queryTokens, candidate);
      const canonicalWeighted = candidate.sourceType === "canonical";
      const { alignment, thematicOverlap } = canonicalWeighted
        ? genreAlignmentScore(candidate.genres, topWeights)
        : { alignment: 0, thematicOverlap: 0 };
      const baseScore = queryScore * 0.62 + alignment * 0.26 + thematicOverlap * 0.12;
      const sourceBoost = canonicalWeighted ? 0.1 : 0.05;
      const modeAdjustment = canonicalWeighted
        ? modeBonus(mode, candidate.genres, dominantGenre, queryScore)
        : 0;
      const relevance = clamp(baseScore + sourceBoost + modeAdjustment);
      const lowRated = candidate.rating !== null && candidate.rating < 3.5;
      const short_reason =
        candidate.sourceType === "canonical"
          ? buildShortReason({
              mode,
              dominantGenre,
              queryTokens,
              thematicOverlap,
              lowRated,
            })
          : `Verified from ${candidate.source} and aligned with your request. This remains a recommendation-only lightweight record.`;
      return {
        bookId: candidate.id,
        title: candidate.title,
        author: candidate.author,
        short_reason,
        mode,
        relevanceScore: round(relevance),
      } satisfies LibrarianBookCard;
    })
    .sort(deterministicSort);

  const requestedCount =
    mode === "HighConfidencePrecision" && queryTokens.length >= 2
      ? LIBRARIAN_LIMITS.MAX_BOOKS
      : LIBRARIAN_DEFAULT_SELECTION_COUNT;

  const limited = scored.slice(
    0,
    Math.max(1, Math.min(requestedCount, LIBRARIAN_LIMITS.MAX_BOOKS))
  );
  const recommendations =
    limited.length > 0
      ? limited
      : [
          buildFallbackCard({
            context: params.context,
            mode,
            effectiveDominant: dominantGenre,
          }),
        ];

  logger.info("[AI][LIBRARIAN][ORCHESTRATOR]", {
    proposalCount: excludedProposalKeys.size,
    verifiedCount: verified.length,
    selectedCount: recommendations.length,
    regenerationCount,
    mode,
    anchorResolved: Boolean(anchor),
  });

  const outputTokens = approximateTokens(JSON.stringify(recommendations));
  if (outputTokens > LIBRARIAN_LIMITS.TOKEN_LIMIT_OUTPUT) {
    recommendations.splice(1);
  }

  await storeCachedRecommendations({
    uid: normalizedUid,
    profileVersion: params.context.profileVersion,
    intent: params.request.intent,
    normalizedQuery: validation.normalizedQuery,
    recommendations,
  });

  await emitHomeFeedSignal({
    uid: normalizedUid,
    profileVersion: params.context.profileVersion,
    normalizedQuery: validation.normalizedQuery,
    recommendationCount: recommendations.length,
  });

  return {
    recommendations,
    fromCache: false,
    remainingQuota: quota.remaining,
    normalizedQuery: validation.normalizedQuery,
  };
}
