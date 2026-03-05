import { createHash, randomUUID } from "crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { VertexAI } from "@google-cloud/vertexai";
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
  DEFAULT_BOOKS: 2,
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
  source?: "librarian";
  suggestionSessionId?: string;
  suggestionId?: string;
  rankPosition?: number;
  mode?: LibrarianMode;
};

type LibrarianRequest = {
  normalizedQuery: string;
  intent: string;
};

type RankedLibrarianBookCard = LibrarianBookCard & {
  mode: LibrarianMode;
  relevanceScore: number;
};

type SuggestionAttributedCard = LibrarianBookCard & {
  source: "librarian";
  suggestionSessionId: string;
  suggestionId: string;
  rankPosition: number;
  mode: LibrarianMode;
};

type LibrarianScopeIntent =
  | "BOOK_RECOMMENDATION"
  | "AUTHOR_ORDER"
  | "BOOK_KNOWLEDGE"
  | "OUT_OF_SCOPE";

type IntentClassification = {
  intent: LibrarianScopeIntent;
  topic: string;
  authorName: string;
};

type LibrarianConversationIntent =
  | "book_recommendation"
  | "author_request"
  | "theme_request"
  | "clarification"
  | "out_of_scope";

type LibrarianConversation = {
  explanation: string;
  tone: "warm" | "intellectual" | "neutral";
  follow_up_question: string | null;
  needs_clarification: boolean;
};

export type LibrarianAuthorCard = {
  id: string;
  type: "author";
  name: string;
  photo_url: string;
  birth_year: number;
  death_year: number | null;
  nationality: string;
  short_bio: string;
  notable_books: string[];
  why_recommended: string;
  verification: {
    source: "openlibrary" | "wikidata" | "internal";
  };
};

type LibrarianResponseMetadata = {
  suggestionSessionId: string;
  verified: boolean;
  source: "vertex_llm + external_verification";
  confidence: number;
};

type LlmIntentInterpretation = {
  intent: LibrarianConversationIntent;
  topic: string;
  authorName: string;
  needsClarification: boolean;
  followUpQuestion: string | null;
  confidence: number;
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
  coverUrl?: string;
  description?: string;
  externalIds?: {
    providerId: string | null;
    canonicalBookId: string | null;
  };
  verificationSource?: "canonical" | "external_verified";
};

const LIBRARIAN_PROPOSAL_MODEL = "gemini-2.0-flash";
const LIBRARIAN_VERTEX_REGION = "us-central1";
const LIBRARIAN_MAX_LLM_CANDIDATES = 12;
const LIBRARIAN_DEFAULT_SELECTION_COUNT = 2;
const LIBRARIAN_MAX_REGENERATION_ATTEMPTS = 1;
const LIBRARIAN_LLM_TIMEOUT_MS = 3000;
const LIBRARIAN_PROMPT_TOKEN_LIMIT = 2000;
const LIBRARIAN_MAX_UNIFIED_SEARCH_CALLS = 8;
const LIBRARIAN_CACHE_SCHEMA_VERSION = "v3";
const LIBRARIAN_INTENT_TIMEOUT_MS = 1500;
const LIBRARIAN_EXPLANATION_TIMEOUT_MS = 1500;
// Debug mode: bypass cache in all non-test runtimes so every request exercises full pipeline.
const LIBRARIAN_CACHE_DISABLED = process.env.NODE_ENV !== "test";

type UnifiedSearchBudget = {
  used: number;
  limit: number;
};

type ProposalClientConfig = {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
};

type ProposalClientRequest = {
  model: string;
  contents: string;
  config?: ProposalClientConfig;
};

type ProposalClient = {
  models: {
    generateContent: (params: ProposalClientRequest) => Promise<{ text: string }>;
  };
};

let proposalClientSingleton: ProposalClient | null | undefined;

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
const NON_LITERARY_TITLE_PATTERN =
  /\b(planning area|wilderness|district|county|municipality|zoning|ordinance|statute|regulation|code section|impact statement)\b/i;
const NON_AUTHOR_ENTITY_PATTERN =
  /\b(publisher|publishing|press|editorial|edition|editions|ministry|department|committee|council|institute|university|association|agency|office|bureau|llc|inc|ltd|corp|corporation)\b/i;

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

const BOOK_CONTEXT_TERMS = new Set([
  "book",
  "books",
  "read",
  "reading",
  "novel",
  "novels",
  "author",
  "authors",
  "fiction",
  "nonfiction",
  "biography",
  "memoir",
  "poetry",
  "literature",
  "recommend",
  "recommendation",
  "bibliography",
]);

const NON_BOOK_TERMS = new Set([
  "weather",
  "forecast",
  "stock",
  "stocks",
  "nasdaq",
  "dow",
  "bitcoin",
  "crypto",
  "election",
  "politics",
  "president",
  "football",
  "soccer",
  "basketball",
  "nba",
  "recipe",
  "recipes",
  "flight",
  "flights",
  "hotel",
  "hotels",
  "tax",
  "visa",
  "programming",
  "javascript",
  "react",
  "typescript",
]);

function hasTermFromSet(query: string, terms: Set<string>): boolean {
  if (!query) return false;
  for (const token of tokenize(query)) {
    if (terms.has(token)) return true;
  }
  return false;
}

function extractAuthorFromOrderQuery(query: string): string {
  const patterns = [
    /(?:in what|in which|what)\s+order\s+(?:should i|do i|to)?\s*read\s+(.+)/i,
    /read\s+(.+)\s+in order/i,
    /(?:where|how)\s+(?:should i|do i)\s+start\s+with\s+(.+)/i,
    /(?:best order to read)\s+(.+)/i,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    const candidate = match?.[1] ? normalizeText(match[1]) : "";
    if (candidate) return candidate;
  }
  return "";
}

function extractAuthorFromByQuery(query: string): string {
  const patterns = [
    /(?:^|\b)(?:a|an|some)?\s*(?:book|books|novel|novels)\s+by\s+(.+)$/i,
    /(?:^|\b)(?:suggest|recommend)\s+(?:me\s+)?(?:a|an|some)?\s*(?:book|books|novel|novels)?\s*by\s+(.+)$/i,
    /\bby\s+([a-z\p{L}][a-z\p{L}\s.'-]{1,120})$/iu,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    const candidate = match?.[1] ? normalizeText(match[1]) : "";
    if (candidate) return candidate;
  }
  return "";
}

const TOPIC_EXCLUDE_TERMS = new Set([
  "what",
  "whats",
  "is",
  "the",
  "a",
  "an",
  "are",
  "do",
  "does",
  "can",
  "you",
  "please",
  "tell",
  "me",
  "show",
  "latest",
  "news",
  "today",
  "tonight",
  "now",
  "currently",
  "right",
  "this",
  "week",
  "month",
  "year",
  "in",
  "on",
  "at",
  "for",
  "about",
  "of",
  "to",
  "from",
  "how",
  "why",
  "should",
  "would",
  "could",
  "my",
  "your",
  "with",
  "without",
  "books",
  "book",
  "read",
  "reading",
  "recommend",
  "recommendation",
  "recommendations",
]);

function extractTopicFromQuery(normalizedQuery: string): string {
  const query = normalizeText(normalizedQuery);
  if (!query) return "";

  const matchedSubjectPattern =
    query.match(/\b(?:books|book)\s+(?:about|on)\s+(.+)$/i)?.[1] ||
    query.match(
      /\b(?:what is|what s|tell me about|show me|explain|learn about|help me understand)\s+(.+)$/i
    )?.[1] ||
    query.match(/\b(?:latest|news)\s+(?:on|about)\s+(.+)$/i)?.[1] ||
    "";

  const candidateBase = matchedSubjectPattern || query;
  const withoutTemporal = candidateBase
    .replace(/\b(today|tonight|now|currently|right now|this week|this month|this year)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = tokenize(withoutTemporal);
  const contentTokens = tokens.filter((token) => !TOPIC_EXCLUDE_TERMS.has(token));
  const phrase = contentTokens.slice(0, 4).join(" ").trim();
  return phrase || withoutTemporal || query;
}

function classifyLibrarianIntent(normalizedQuery: string): IntentClassification {
  const query = normalizeText(normalizedQuery);
  const authorName = extractAuthorFromOrderQuery(query);
  if (authorName) {
    return {
      intent: "AUTHOR_ORDER",
      topic: "",
      authorName,
    };
  }
  const authorByName = extractAuthorFromByQuery(query);
  if (authorByName) {
    return {
      intent: "BOOK_RECOMMENDATION",
      topic: "",
      authorName: authorByName,
    };
  }

  const hasBookContext = hasTermFromSet(query, BOOK_CONTEXT_TERMS);
  const hasNonBookContext = hasTermFromSet(query, NON_BOOK_TERMS);
  if (hasNonBookContext && !hasBookContext) {
    return {
      intent: "OUT_OF_SCOPE",
      topic: extractTopicFromQuery(query),
      authorName: "",
    };
  }

  if (
    /\b(books|book)\s+(about|on)\b/.test(query) ||
    /\b(introduction to|history of|guide to|learn)\b/.test(query)
  ) {
    return {
      intent: "BOOK_KNOWLEDGE",
      topic: extractTopicFromQuery(query),
      authorName: "",
    };
  }

  return {
    intent: "BOOK_RECOMMENDATION",
    topic: extractTopicFromQuery(query),
    authorName: "",
  };
}

function mapScopeIntentToConversationIntent(intent: LibrarianScopeIntent): LibrarianConversationIntent {
  if (intent === "AUTHOR_ORDER") return "author_request";
  if (intent === "BOOK_KNOWLEDGE") return "theme_request";
  if (intent === "OUT_OF_SCOPE") return "out_of_scope";
  return "book_recommendation";
}

function mapConversationIntentToScope(intent: LibrarianConversationIntent): LibrarianScopeIntent {
  if (intent === "author_request") return "AUTHOR_ORDER";
  if (intent === "theme_request") return "BOOK_KNOWLEDGE";
  if (intent === "out_of_scope") return "OUT_OF_SCOPE";
  return "BOOK_RECOMMENDATION";
}

function isLikelyLiteraryCandidate(params: {
  title: string;
  author: string;
  description?: string;
}): boolean {
  const title = normalizeText(params.title);
  const author = normalizeText(params.author);
  const description = normalizeText(params.description || "");
  if (!title || !author) return false;
  if (author === "unknown") return false;
  if (NON_AUTHOR_ENTITY_PATTERN.test(author)) return false;
  const authorTokens = tokenize(author);
  if (authorTokens.length === 0 || authorTokens.length > 8) return false;
  if (title.length > 180) return false;
  if (EXCLUDED_TYPE_PATTERN.test(title) || EXCLUDED_TYPE_PATTERN.test(description)) return false;
  if (NON_LITERARY_TITLE_PATTERN.test(title) || NON_LITERARY_TITLE_PATTERN.test(description)) return false;
  return true;
}

function sanitizeOptionalText(value: unknown, maxLen = 160): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maxLen);
  return normalized.length > 0 ? normalized : null;
}

function sanitizeConversationExplanation(value: string, fallback: string): string {
  const normalized = value
    .replace(/These verified recommendations align with your reading direction\.?/gi, "")
    .replace(/catalog includes \d+ listed works\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const base = normalized || fallback;
  const sentences = base
    .split(/[.!?]+/)
    .map((row) => row.trim())
    .filter((row) => row.length > 0)
    .slice(0, 2);
  if (sentences.length === 0) {
    return `${fallback.trim().replace(/[.!?]+$/g, "")}.`;
  }
  return `${sentences.join(". ")}.`;
}

function isGenericClarificationQuery(normalizedQuery: string): boolean {
  const query = normalizeText(normalizedQuery);
  if (!query) return true;
  const tokens = tokenize(query);
  if (tokens.length <= 1) return true;
  if (tokens.length <= 3 && hasTermFromSet(query, BOOK_CONTEXT_TERMS)) {
    const hasConcrete = /(by|about|like|similar|novel|novels|author|authors)/.test(query);
    return !hasConcrete;
  }
  return /^(recommend|suggest)\s+(me\s+)?(a\s+)?book$/.test(query);
}

function buildIntentInterpretationPrompt(normalizedQuery: string): string {
  return [
    "You are BookTown's Librarian intent interpreter.",
    "Classify query intent and extract entities for routing.",
    "Return strict JSON object only with keys:",
    "{\"intent\":\"book_recommendation|author_request|theme_request|clarification|out_of_scope\",\"topic\":\"string\",\"authorName\":\"string\",\"needsClarification\":boolean,\"followUpQuestion\":\"string|null\",\"confidence\":number}",
    "Rules:",
    "- clarification: query is too generic to recommend responsibly.",
    "- out_of_scope: query is not asking for books.",
    "- author_request: asks for books by a specific author.",
    "- theme_request: asks for books on a topic/theme/domain.",
    "- book_recommendation: clear recommendation request.",
    "- confidence must be 0..1.",
    `Query: ${normalizedQuery}`,
  ].join("\n");
}

function parseIntentInterpretationPayload(payload: unknown): LlmIntentInterpretation | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  const intentRaw = normalizeText(row.intent);
  const intent: LibrarianConversationIntent =
    intentRaw === "author request"
      ? "author_request"
      : intentRaw === "theme request"
      ? "theme_request"
      : intentRaw === "clarification"
      ? "clarification"
      : intentRaw === "out of scope"
      ? "out_of_scope"
      : intentRaw === "book recommendation"
      ? "book_recommendation"
      : "book_recommendation";
  const topic = normalizeText(row.topic);
  const authorName = normalizeText(row.authorName);
  const followUpQuestion = sanitizeOptionalText(row.followUpQuestion, 220);
  const confidenceRaw = Number(row.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? clamp(confidenceRaw, 0, 1) : 0.68;
  const needsClarification = Boolean(row.needsClarification);
  return {
    intent,
    topic,
    authorName,
    needsClarification,
    followUpQuestion,
    confidence,
  };
}

function parseIntentInterpretationFromText(text: string): LlmIntentInterpretation | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return parseIntentInterpretationPayload(JSON.parse(trimmed));
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return parseIntentInterpretationPayload(JSON.parse(trimmed.slice(start, end + 1)));
    } catch {
      return null;
    }
  }
}

async function interpretConversationalIntent(normalizedQuery: string): Promise<LlmIntentInterpretation | null> {
  const client = createProposalClient();
  if (!client) return null;
  try {
    const response = await withTimeout({
      timeoutMs: LIBRARIAN_INTENT_TIMEOUT_MS,
      stage: "intent_interpretation",
      work: () =>
        client.models.generateContent({
          model: LIBRARIAN_PROPOSAL_MODEL,
          contents: buildIntentInterpretationPrompt(normalizedQuery),
          config: {
            temperature: 0.1,
            topP: 0.8,
            maxOutputTokens: 180,
            responseMimeType: "application/json",
          },
        }),
    });
    return parseIntentInterpretationFromText(response.text || "");
  } catch (error) {
    logger.warn("[AI][LIBRARIAN][INTENT_LLM_FAILED]", {
      error: String(error),
    });
    return null;
  }
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

function sanitizeBookIdPart(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

function buildExternalSyntheticBookId(params: {
  provider: "booktown" | "googleBooks" | "openLibrary";
  externalId?: string | null;
  fallbackSeed?: string;
}): string {
  const providerKey = sanitizeBookIdPart(params.provider) || "external";
  const externalKey = sanitizeBookIdPart(String(params.externalId || ""));
  if (externalKey) {
    return `ext_${providerKey}_${externalKey}`;
  }
  const fallbackKey =
    sanitizeBookIdPart(String(params.fallbackSeed || "")) ||
    createHash("sha256")
      .update(`${params.provider}|${params.externalId || ""}|${params.fallbackSeed || ""}`)
      .digest("hex")
      .slice(0, 24);
  return `ext_${providerKey}_${fallbackKey}`;
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
  requestedAuthor: string;
  excludedKeys: string[];
}): string {
  const contextSummary = summarizeContextForProposal(params.context);
  const exclusions =
    params.excludedKeys.length > 0
      ? `Do not repeat these title|author keys: ${params.excludedKeys.join(", ")}`
      : "No exclusions.";

  return [
    "You are a neighborhood librarian recommending books only.",
    "",
    "Return JSON only. Format: [{\"title\":\"...\",\"author\":\"...\"}].",
    "",
    `Return between 10 and ${LIBRARIAN_MAX_LLM_CANDIDATES} candidate books.`,
    "",
    "Requirements:",
    "- Only real published books.",
    "- Prefer well-known canonical works.",
    "- Prefer novels, memoirs, and literary non-fiction over technical manuals.",
    "- Avoid academic papers, essays, lectures, or non-book media.",
    "- Do not invent titles.",
    "- Do not return organizations, ministries, publishers, or institutions as authors.",
    "- If requested author is present, every candidate author must match that author.",
    "- Do not repeat titles listed in exclusions.",
    "",
    `Mode: ${params.mode}`,
    `User query: ${params.normalizedQuery}`,
    `Anchor title (if relevant): ${params.anchorTitle || "No anchor title resolved."}`,
    `Anchor author (if relevant): ${params.anchorAuthor || "No anchor author resolved."}`,
    `Requested author (if provided): ${params.requestedAuthor || "None"}`,
    `Structured context: ${JSON.stringify(contextSummary)}`,
    exclusions,
    "",
    "Return JSON array only.",
  ].join("\n");
}

function extractVertexResponseText(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const directText = (payload as { text?: unknown }).text;
    if (typeof directText === "string" && directText.trim().length > 0) {
      return directText;
    }
  }
  const response = payload && typeof payload === "object"
    ? (payload as { response?: unknown }).response
    : null;
  if (!response || typeof response !== "object") return "";
  const responseRecord = response as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: unknown }>;
      };
    }>;
  };
  const candidates = Array.isArray(responseRecord.candidates) ? responseRecord.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim().length > 0) {
        return part.text;
      }
    }
  }
  return "";
}

function buildProposalClient(): ProposalClient | null {
  const projectId =
    String(process.env.GCP_PROJECT || "").trim() ||
    String(process.env.GCLOUD_PROJECT || "").trim() ||
    String(process.env.GOOGLE_CLOUD_PROJECT || "").trim() ||
    "booktown-ai";
  try {
    const vertexAI = new VertexAI({
      project: projectId,
      location: LIBRARIAN_VERTEX_REGION,
    });
    const model = vertexAI.getGenerativeModel({ model: LIBRARIAN_PROPOSAL_MODEL });
    return {
      models: {
        generateContent: async (params: ProposalClientRequest) => {
          const result = await model.generateContent({
            contents: [
              {
                role: "user",
                parts: [{ text: params.contents }],
              },
            ],
            generationConfig: {
              temperature: params.config?.temperature,
              topP: params.config?.topP,
              maxOutputTokens: params.config?.maxOutputTokens,
              responseMimeType: params.config?.responseMimeType,
            },
          });
          return { text: extractVertexResponseText(result) };
        },
      },
    };
  } catch (error) {
    logger.error("[AI][LIBRARIAN][VERTEX_CLIENT_INIT_FAILED]", {
      error: String(error),
      projectId,
      location: LIBRARIAN_VERTEX_REGION,
    });
    return null;
  }
}

function createProposalClient(): ProposalClient | null {
  if (proposalClientSingleton !== undefined) {
    return proposalClientSingleton;
  }
  proposalClientSingleton = buildProposalClient();
  return proposalClientSingleton;
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
  requestedAuthor: string;
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
      requestedAuthor: params.requestedAuthor,
      excludedKeys: params.excludedKeys,
    })
  );

  const client = createProposalClient();
  if (!client) {
    logger.warn("[AI][LIBRARIAN][PROPOSAL_MODEL_UNAVAILABLE]", {
      reason: "vertex_client_unavailable",
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
  requiredAuthor?: string;
  budget: UnifiedSearchBudget;
}): Promise<VerifiedBook | null> {
  const requiredAuthor = normalizeText(params.requiredAuthor || "");
  const canonical = await verifyCanonicalByTitleAuthor(params.proposal);
  if (
    canonical &&
    isLikelyLiteraryCandidate({ title: canonical.title, author: canonical.author }) &&
    (!requiredAuthor || authorMatchScore(canonical.author, requiredAuthor) >= 0.72)
  ) {
    const verified: VerifiedBook = {
      ...canonical,
      sourceType: "canonical",
      source: "booktown",
      externalId: null,
      canonicalBookId: canonical.id,
      verificationSource: "canonical",
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
  const externalDescription = String(best.description || best.descriptionEn || "").trim();
  if (
    !isLikelyLiteraryCandidate({
      title: externalTitle,
      author: externalAuthor,
      description: externalDescription,
    })
  ) {
    return null;
  }
  if (requiredAuthor && authorMatchScore(externalAuthor, requiredAuthor) < 0.72) {
    return null;
  }
  const externalCoverUrl = String(best.coverUrl || "").trim();
  const externalProviderId = best.externalId || best.bookId || null;
  const syntheticBookId = buildExternalSyntheticBookId({
    provider: best.source,
    externalId: externalProviderId,
    fallbackSeed: `${externalTitle}|${externalAuthor}`,
  });
  const verified: VerifiedBook = {
    id: syntheticBookId,
    title: externalTitle,
    author: externalAuthor,
    genres: extractSearchGenres(best),
    rating: extractSearchRating(best),
    sourceType: "lightweight",
    source: best.source,
    externalId: externalProviderId,
    canonicalBookId: best.resultType === "canonical" ? best.bookId : null,
    coverUrl: externalCoverUrl || undefined,
    description: externalDescription || undefined,
    externalIds: {
      providerId: externalProviderId,
      canonicalBookId: best.resultType === "canonical" ? best.bookId : null,
    },
    verificationSource: "external_verified",
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

function toPublicCard(row: RankedLibrarianBookCard): LibrarianBookCard {
  return {
    bookId: row.bookId,
    title: row.title,
    author: row.author,
    short_reason: row.short_reason,
  };
}

function toBoundaryReason(topic: string): string {
  const safeTopic = topic.trim().slice(0, 60);
  if (safeTopic) {
    return `I focus on books, so these are strong starting points on ${safeTopic}.`;
  }
  return "I focus on books, so these are strong starting points to begin with.";
}

function toKnowledgeReason(topic: string): string {
  const safeTopic = topic.trim().slice(0, 60);
  if (safeTopic) {
    return `These are clear starting books for understanding ${safeTopic}.`;
  }
  return "These are clear starting books to build a solid foundation.";
}

function sanitizeShortReason(value: string, fallback: string): string {
  const normalized = value
    .replace(/\bverification\b/gi, "")
    .replace(/\bcandidate\b/gi, "")
    .replace(/\bprofile lane\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const base = normalized || fallback;
  const sentences = base
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .slice(0, 2);
  if (sentences.length === 0) {
    return `${fallback.trim().replace(/[.!?]+$/g, "")}.`;
  }
  return `${sentences.join(". ")}.`;
}

function dedupeCards(rows: LibrarianBookCard[]): LibrarianBookCard[] {
  const out: LibrarianBookCard[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = proposalKey(row.title, row.author) || row.bookId.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function buildSuggestionSessionId(): string {
  return `ls_${randomUUID().replace(/-/g, "")}`;
}

function attachSuggestionAttribution(params: {
  recommendations: LibrarianBookCard[];
  mode: LibrarianMode;
  suggestionSessionId: string;
}): SuggestionAttributedCard[] {
  return params.recommendations.map((row, index) => ({
    ...row,
    source: "librarian",
    suggestionSessionId: params.suggestionSessionId,
    suggestionId: randomUUID(),
    rankPosition: index + 1,
    mode: params.mode,
  }));
}

function buildTopicSeedCards(params: {
  topic: string;
  maxBooks?: number;
  reason: "out_of_scope" | "book_knowledge";
}): LibrarianBookCard[] {
  const normalizedTopic = normalizeText(params.topic);
  const maxBooks = Math.max(2, Math.min(params.maxBooks ?? 3, LIBRARIAN_LIMITS.MAX_BOOKS));
  const reasonText =
    params.reason === "out_of_scope"
      ? toBoundaryReason(params.topic)
      : toKnowledgeReason(params.topic);
  const finance = [
    { title: "A Random Walk Down Wall Street", author: "Burton G. Malkiel" },
    { title: "The Intelligent Investor", author: "Benjamin Graham" },
    { title: "The Little Book of Common Sense Investing", author: "John C. Bogle" },
  ];
  const weather = [
    { title: "The Weather Machine", author: "Andrew Blum" },
    { title: "The Signal and the Noise", author: "Nate Silver" },
    { title: "Weather: A Very Short Introduction", author: "Storm Dunlop" },
  ];
  const technology = [
    { title: "Clean Code", author: "Robert C. Martin" },
    { title: "Designing Data-Intensive Applications", author: "Martin Kleppmann" },
    { title: "The Pragmatic Programmer", author: "Andrew Hunt and David Thomas" },
  ];
  const politics = [
    { title: "Prisoners of Geography", author: "Tim Marshall" },
    { title: "The Origins of Political Order", author: "Francis Fukuyama" },
    { title: "On Tyranny", author: "Timothy Snyder" },
  ];

  let shelf = politics;
  if (
    normalizedTopic.includes("stock") ||
    normalizedTopic.includes("finance") ||
    normalizedTopic.includes("market") ||
    normalizedTopic.includes("nasdaq") ||
    normalizedTopic.includes("dow") ||
    normalizedTopic.includes("bitcoin") ||
    normalizedTopic.includes("crypto")
  ) {
    shelf = finance;
  } else if (
    normalizedTopic.includes("weather") ||
    normalizedTopic.includes("forecast") ||
    normalizedTopic.includes("climate")
  ) {
    shelf = weather;
  } else if (
    normalizedTopic.includes("programming") ||
    normalizedTopic.includes("javascript") ||
    normalizedTopic.includes("react") ||
    normalizedTopic.includes("typescript")
  ) {
    shelf = technology;
  }

  return shelf.slice(0, maxBooks).map((row, index) => ({
    bookId: `topic_seed_${normalizeText(row.title).replace(/\s+/g, "_")}_${index + 1}`,
    title: row.title,
    author: row.author,
    short_reason: reasonText,
  }));
}

async function resolveTopicBooks(params: {
  topic: string;
  budget: UnifiedSearchBudget;
  reason: string;
  maxBooks?: number;
}): Promise<LibrarianBookCard[]> {
  const maxBooks = Math.max(2, Math.min(params.maxBooks ?? 3, LIBRARIAN_LIMITS.MAX_BOOKS));
  const query = `books about ${params.topic}`.trim();
  const searchResponse = await unifiedSearchWithBudget({
    budget: params.budget,
    query,
    limit: 12,
    reason: params.reason,
  });

  const cards: LibrarianBookCard[] = [];
  const seen = new Set<string>();
  for (const row of searchResponse?.results || []) {
    const bookId = String(row.bookId || "").trim();
    const title = String(row.title || row.titleEn || "").trim();
    const author = String(row.authorEn || (Array.isArray(row.authors) ? row.authors[0] : "") || "").trim();
    if (!bookId || !title || !author) continue;
    if (!isLikelyLiteraryCandidate({ title, author, description: String(row.description || "").trim() })) continue;
    const dedupeKey = `${bookId}|${title}|${author}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    cards.push({
      bookId,
      title,
      author,
      short_reason: params.reason === "out_of_scope"
        ? toBoundaryReason(params.topic)
        : toKnowledgeReason(params.topic),
    });
    if (cards.length >= maxBooks) break;
  }
  return cards;
}

function externalFallbackBookId(row: UnifiedSearchResult): string {
  if (row.resultType === "canonical") {
    const direct = String(row.bookId || "").trim();
    if (direct) return direct;
  }
  return buildExternalSyntheticBookId({
    provider: row.source,
    externalId: row.externalId || row.bookId || null,
    fallbackSeed: `${row.title || row.titleEn || ""}|${row.authorEn || ""}`,
  });
}

async function resolveExternalFallbackCards(params: {
  query: string;
  budget: UnifiedSearchBudget;
  reason: string;
  maxBooks?: number;
  requiredAuthor?: string;
  excludeKeys?: Iterable<string>;
  shortReason: string;
}): Promise<LibrarianBookCard[]> {
  const requestedCount = Math.max(
    1,
    Math.min(params.maxBooks ?? LIBRARIAN_DEFAULT_SELECTION_COUNT, LIBRARIAN_LIMITS.MAX_BOOKS)
  );
  const searchResponse = await unifiedSearchWithBudget({
    budget: params.budget,
    query: params.query,
    limit: 20,
    reason: params.reason,
  });
  if (!searchResponse) return [];

  const excluded = new Set<string>();
  for (const key of params.excludeKeys || []) {
    if (typeof key !== "string") continue;
    const normalized = key.trim();
    if (normalized) excluded.add(normalized);
  }

  const rows: LibrarianBookCard[] = [];
  for (const row of searchResponse.results) {
    const title = String(row.title || row.titleEn || "").trim();
    const author = String(
      row.authorEn || (Array.isArray(row.authors) && row.authors.length > 0 ? row.authors[0] : "")
    ).trim();
    if (!title || !author) continue;
    if (!isLikelyLiteraryCandidate({ title, author, description: String(row.description || "").trim() })) continue;
    if (params.requiredAuthor && authorMatchScore(author, params.requiredAuthor) < 0.72) continue;
    const key = proposalKey(title, author);
    if (key && excluded.has(key)) continue;
    if (key) excluded.add(key);
    rows.push({
      bookId: externalFallbackBookId(row),
      title,
      author,
      short_reason: params.shortReason,
    });
    if (rows.length >= requestedCount) break;
  }

  return rows;
}

type AuthorOrderedCandidate = {
  id: string;
  title: string;
  author: string;
  publicationYear: number;
};

async function resolveAuthorOrderCards(params: {
  authorName: string;
  budget: UnifiedSearchBudget;
}): Promise<LibrarianBookCard[]> {
  const authorName = params.authorName;
  const authorNorm = normalizeText(authorName);
  if (!authorNorm) return [];

  const [byNormalizedName, byTokens] = await Promise.all([
    db.collection("books")
      .where("authorNamesNormalized", "array-contains", authorNorm)
      .limit(30)
      .get(),
    db.collection("books")
      .where("search.tokens", "array-contains-any", tokenize(authorNorm).slice(0, 10))
      .limit(30)
      .get(),
  ]);

  const merged = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  for (const docSnap of byNormalizedName.docs) {
    merged.set(docSnap.id, docSnap);
  }
  for (const docSnap of byTokens.docs) {
    if (!merged.has(docSnap.id)) {
      merged.set(docSnap.id, docSnap);
    }
  }

  const canonical = Array.from(merged.values())
    .map((docSnap) => {
      const candidate = normalizeCandidate(docSnap);
      if (!candidate) return null;
      const authorScore = authorMatchScore(candidate.author, authorName);
      if (authorScore < 0.78) return null;
      const data = docSnap.data() || {};
      const publicationYear = Number(data.publicationYear || 0);
      return {
        id: candidate.id,
        title: candidate.title,
        author: candidate.author,
        publicationYear: Number.isFinite(publicationYear) ? Math.trunc(publicationYear) : 0,
      } satisfies AuthorOrderedCandidate;
    })
    .filter((row): row is AuthorOrderedCandidate => row !== null)
    .sort((a, b) => {
      if (a.publicationYear !== b.publicationYear) {
        if (a.publicationYear === 0) return 1;
        if (b.publicationYear === 0) return -1;
        return a.publicationYear - b.publicationYear;
      }
      if (a.title !== b.title) return a.title.localeCompare(b.title);
      return a.id.localeCompare(b.id);
    });

  const canonicalCards = canonical.map((row, index) => ({
    bookId: row.id,
    title: row.title,
    author: row.author,
    short_reason:
      index === 0
        ? "Start here for a clean entry point into this author’s work."
        : "Follow this next to continue in a clear reading order.",
  }));

  if (canonicalCards.length >= LIBRARIAN_LIMITS.DEFAULT_BOOKS) {
    return dedupeCards(canonicalCards).slice(0, LIBRARIAN_LIMITS.MAX_BOOKS);
  }

  const query = `books by ${authorName}`;
  const searchResponse = await unifiedSearchWithBudget({
    budget: params.budget,
    query,
    limit: 12,
    reason: "author_order_external",
  });
  const externalCards = (searchResponse?.results || [])
    .map((row) => {
      const bookId = String(row.bookId || "").trim();
      const title = String(row.title || row.titleEn || "").trim();
      const author = String(row.authorEn || (Array.isArray(row.authors) ? row.authors[0] : "") || "").trim();
      if (!bookId || !title || !author) return null;
      if (authorMatchScore(author, authorName) < 0.78) return null;
      if (!isLikelyLiteraryCandidate({ title, author, description: String(row.description || "").trim() })) {
        return null;
      }
      return {
        bookId,
        title,
        author,
        short_reason: "A strong starting point while I build a fuller reading order.",
      } satisfies LibrarianBookCard;
    })
    .filter((row): row is LibrarianBookCard => row !== null)
    .sort((a, b) => a.title.localeCompare(b.title));

  return dedupeCards([...canonicalCards, ...externalCards]).slice(0, LIBRARIAN_LIMITS.MAX_BOOKS);
}

async function resolveAuthorWorksCards(params: {
  authorName: string;
  budget: UnifiedSearchBudget;
  maxBooks?: number;
}): Promise<LibrarianBookCard[]> {
  const authorName = params.authorName.trim();
  const authorNorm = normalizeText(authorName);
  if (!authorNorm) return [];

  const maxBooks = Math.max(
    LIBRARIAN_LIMITS.DEFAULT_BOOKS,
    Math.min(params.maxBooks ?? LIBRARIAN_LIMITS.MAX_BOOKS, LIBRARIAN_LIMITS.MAX_BOOKS)
  );
  const searchQueries = [`books by ${authorName}`, `${authorName} novels`, `${authorName} books`];
  const cards: LibrarianBookCard[] = [];
  const seen = new Set<string>();

  for (const query of searchQueries) {
    // eslint-disable-next-line no-await-in-loop
    const searchResponse = await unifiedSearchWithBudget({
      budget: params.budget,
      query,
      limit: 20,
      reason: "author_books_retrieval",
    });
    if (!searchResponse) continue;

    for (const row of searchResponse.results) {
      const title = String(row.title || row.titleEn || "").trim();
      const author = String(
        row.authorEn || (Array.isArray(row.authors) && row.authors.length > 0 ? row.authors[0] : "")
      ).trim();
      if (!title || !author) continue;
      if (authorMatchScore(author, authorName) < 0.75) continue;
      if (!isLikelyLiteraryCandidate({ title, author, description: String(row.description || "").trim() })) {
        continue;
      }
      const key = proposalKey(title, author);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const bookId = row.resultType === "canonical" ? String(row.bookId || "").trim() : externalFallbackBookId(row);
      if (!bookId) continue;
      cards.push({
        bookId,
        title,
        author,
        short_reason:
          cards.length === 0
            ? `If you're exploring ${authorName}, this is a strong place to begin.`
            : `A key work by ${authorName} that deepens the same literary thread.`,
      });
      if (cards.length >= maxBooks) {
        return cards;
      }
    }
  }

  return cards;
}

function parseYearFromUnknown(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value !== "string") return 0;
  const match = value.match(/\b(\d{4})\b/);
  if (!match) return 0;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

async function fetchJsonWithAbort(url: string, timeoutMs: number): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    logger.warn("[AI][LIBRARIAN][AUTHOR_PROVIDER_TIMEOUT]", {
      timeoutMs,
      error: String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichAuthorCard(params: {
  authorName: string;
  notableBooks: string[];
  query: string;
}): Promise<LibrarianAuthorCard> {
  const fallbackId =
    sanitizeBookIdPart(params.authorName) ||
    createHash("sha256").update(params.authorName).digest("hex").slice(0, 24);
  const fallbackCard: LibrarianAuthorCard = {
    id: `author_${fallbackId}`,
    type: "author",
    name: params.authorName,
    photo_url: "",
    birth_year: 0,
    death_year: null,
    nationality: "",
    short_bio: "Notable author relevant to your reading direction.",
    notable_books: params.notableBooks.slice(0, 5),
    why_recommended: `This author aligns with your request for "${params.query}".`,
    verification: {
      source: "internal",
    },
  };

  if (!params.authorName) return fallbackCard;
  const url = new URL("https://openlibrary.org/search/authors.json");
  url.searchParams.set("q", params.authorName);
  const payload = await fetchJsonWithAbort(url.toString(), 3000);
  const docsRaw = payload && Array.isArray(payload.docs) ? payload.docs : [];
  if (docsRaw.length === 0) return fallbackCard;

  const first = docsRaw[0] && typeof docsRaw[0] === "object" ? (docsRaw[0] as Record<string, unknown>) : null;
  if (!first) return fallbackCard;

  const keyRaw = typeof first.key === "string" ? first.key.trim() : "";
  const authorId = keyRaw.replace(/^\/authors\//, "").trim();
  const photoUrl =
    authorId.length > 0 ? `https://covers.openlibrary.org/a/olid/${authorId}-M.jpg` : fallbackCard.photo_url;
  const topWork = sanitizeOptionalText(first.top_work, 180);
  const workCountRaw = Number(first.work_count);
  const workCount = Number.isFinite(workCountRaw) ? Math.max(0, Math.trunc(workCountRaw)) : 0;
  const notableBooks = [
    ...params.notableBooks,
    ...(topWork ? [topWork] : []),
  ]
    .map((row) => row.trim())
    .filter((row, idx, arr) => row.length > 0 && arr.indexOf(row) === idx)
    .slice(0, 5);

  const shortBio =
    topWork && workCount > 0
      ? `Known for ${topWork}; the body of work spans about ${workCount} listed titles.`
      : topWork
      ? `Known for ${topWork}.`
      : fallbackCard.short_bio;

  return {
    id: authorId ? `author_${authorId}` : fallbackCard.id,
    type: "author",
    name: sanitizeOptionalText(first.name, 120) || params.authorName,
    photo_url: photoUrl,
    birth_year: parseYearFromUnknown(first.birth_date),
    death_year: parseYearFromUnknown(first.death_date) || null,
    nationality: sanitizeOptionalText(first.top_subjects, 80) || "",
    short_bio: shortBio,
    notable_books: notableBooks,
    why_recommended: `This author is a strong match for your request about ${params.query}.`,
    verification: {
      source: "openlibrary",
    },
  };
}

async function buildAuthorRecommendations(params: {
  normalizedQuery: string;
  authorName: string;
  intent: LibrarianConversationIntent;
  books: LibrarianBookCard[];
}): Promise<LibrarianAuthorCard[]> {
  const authorCandidates: string[] = [];
  if (params.authorName) {
    authorCandidates.push(params.authorName);
  }
  for (const row of params.books) {
    if (row.author.trim().length > 0 && !authorCandidates.includes(row.author.trim())) {
      authorCandidates.push(row.author.trim());
    }
    if (authorCandidates.length >= 2) break;
  }

  if (authorCandidates.length === 0 && params.intent !== "author_request") {
    return [];
  }

  const selected = authorCandidates.slice(0, 2);
  const cards = await Promise.all(
    selected.map(async (authorName) => {
      const notableBooks = params.books
        .filter((row) => normalizeText(row.author) === normalizeText(authorName))
        .map((row) => row.title)
        .slice(0, 3);
      return enrichAuthorCard({
        authorName,
        notableBooks,
        query: params.normalizedQuery,
      });
    })
  );
  return cards.slice(0, 3);
}

function buildExplanationPrompt(params: {
  normalizedQuery: string;
  intent: LibrarianConversationIntent;
  books: LibrarianBookCard[];
  authorCards: LibrarianAuthorCard[];
}): string {
  const compactBooks = params.books.slice(0, 3).map((row) => `${row.title} by ${row.author}`);
  const compactAuthors = params.authorCards.slice(0, 2).map((row) => row.name);
  return [
    "You are BookTown's neighborhood librarian.",
    "Write a warm, thoughtful, literary explanation in 1-2 sentences.",
    "No markdown. No bullet points.",
    "Avoid system language like 'verified recommendations align with your reading direction'.",
    "Avoid administrative phrasing like 'catalog includes'.",
    `Intent: ${params.intent}`,
    `User query: ${params.normalizedQuery}`,
    `Books: ${compactBooks.join("; ") || "none"}`,
    `Authors: ${compactAuthors.join("; ") || "none"}`,
  ].join("\n");
}

async function generateConversationalExplanation(params: {
  normalizedQuery: string;
  intent: LibrarianConversationIntent;
  books: LibrarianBookCard[];
  authorCards: LibrarianAuthorCard[];
}): Promise<string> {
  const fallback =
    params.intent === "out_of_scope"
      ? "I cannot answer real-time questions directly, but I can help you approach that topic through books."
      : params.intent === "clarification"
      ? "I can tailor recommendations precisely once you share one author, title, or theme."
      : "These books speak directly to your question and open a strong reading path.";

  const client = createProposalClient();
  if (!client) return sanitizeConversationExplanation("", fallback);
  try {
    const response = await withTimeout({
      timeoutMs: LIBRARIAN_EXPLANATION_TIMEOUT_MS,
      stage: "conversation_explanation",
      work: () =>
        client.models.generateContent({
          model: LIBRARIAN_PROPOSAL_MODEL,
          contents: buildExplanationPrompt(params),
          config: {
            temperature: 0.35,
            topP: 0.9,
            maxOutputTokens: 120,
          },
        }),
    });
    return sanitizeConversationExplanation(response.text || "", fallback);
  } catch (error) {
    logger.warn("[AI][LIBRARIAN][EXPLANATION_LLM_FAILED]", {
      error: String(error),
    });
    return sanitizeConversationExplanation("", fallback);
  }
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
      ? `This deepens your ${dominantGenre} reading direction with strong alignment.`
      : "This reinforces your current reading direction with strong alignment.";
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
      ? "Its rating is lower than average, but the thematic fit is unusually strong."
      : thematicOverlap >= LIBRARIAN_LIMITS.HIGH_THEMATIC_OVERLAP
      ? "The thematic overlap is high."
      : "This is the closest high-confidence fit for your current request.";

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
    .update(
      `${LIBRARIAN_CACHE_SCHEMA_VERSION}|${uid}|${profileVersion}|${intent}|${normalizedQuery}`
    )
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
      };
    })
    .filter(
      (row) =>
        row.bookId.length > 0 &&
        row.title.length > 0 &&
        row.author.length > 0 &&
        row.short_reason.length > 0
    )
    .slice(0, LIBRARIAN_LIMITS.MAX_BOOKS);

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
      cacheVersion: LIBRARIAN_CACHE_SCHEMA_VERSION,
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

async function persistSuggestionSession(params: {
  uid: string;
  suggestionSessionId: string;
  normalizedQuery: string;
  intent: string;
  mode: LibrarianMode;
  books: SuggestionAttributedCard[];
  fromCache: boolean;
}): Promise<void> {
  const ref = db.collection("librarian_suggestions").doc(params.suggestionSessionId);
  await ref.create({
    uid: params.uid,
    normalizedQuery: params.normalizedQuery,
    intent: params.intent,
    mode: params.mode,
    books: params.books.map((row) => ({
      suggestionId: row.suggestionId,
      rankPosition: row.rankPosition,
      mode: row.mode,
      bookId: row.bookId,
      title: row.title,
      author: row.author,
      short_reason: row.short_reason,
    })),
    createdAt: FieldValue.serverTimestamp(),
    fromCache: params.fromCache,
  });
}

async function emitHomeFeedSignal(params: {
  uid: string;
  profileVersion: number;
  normalizedQuery: string;
  recommendationCount: number;
  suggestionSessionId: string;
  suggestionIds: string[];
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
      suggestionSessionId: params.suggestionSessionId,
      suggestionIds: params.suggestionIds.slice(0, LIBRARIAN_LIMITS.MAX_BOOKS),
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

function deterministicSort(a: RankedLibrarianBookCard, b: RankedLibrarianBookCard): number {
  if (b.relevanceScore !== a.relevanceScore) {
    return b.relevanceScore - a.relevanceScore;
  }
  if (a.title !== b.title) return a.title.localeCompare(b.title);
  return a.bookId.localeCompare(b.bookId);
}

function buildFallbackCard(params: {
  context: AgentContextSnapshot;
  effectiveDominant?: string;
}): LibrarianBookCard {
  return {
    bookId: "fallback_librarian_prompt",
    title: "No verified books yet",
    author: "BookTown Librarian",
    short_reason:
      "I could not verify a reliable match for that request. Share one author or a clearer theme and I will refine precisely.",
  };
}

export async function runLibrarianRecommendation(params: {
  uid: string;
  request: LibrarianRequest;
  context: AgentContextSnapshot;
}): Promise<{
  recommendations: LibrarianBookCard[];
  intent: LibrarianConversationIntent;
  conversation: LibrarianConversation;
  authorRecommendations: LibrarianAuthorCard[];
  metadata: LibrarianResponseMetadata;
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

  const deterministicIntent = classifyLibrarianIntent(validation.normalizedQuery);
  const llmIntent = await interpretConversationalIntent(validation.normalizedQuery);
  const llmScopeIntent = llmIntent ? mapConversationIntentToScope(llmIntent.intent) : deterministicIntent.intent;
  const llmIntentConfidence = llmIntent?.confidence ?? 0;
  const preferDeterministicRouting =
    deterministicIntent.intent === "OUT_OF_SCOPE" ||
    deterministicIntent.intent === "AUTHOR_ORDER" ||
    deterministicIntent.authorName.length > 0;
  const resolvedScopeIntent =
    llmIntent && llmIntentConfidence >= 0.62 && !preferDeterministicRouting
      ? llmScopeIntent
      : deterministicIntent.intent;
  const intentClassification: IntentClassification = {
    intent: resolvedScopeIntent,
    topic:
      (llmIntentConfidence >= 0.62 && llmIntent?.topic ? llmIntent.topic : "") ||
      deterministicIntent.topic,
    authorName:
      (llmIntentConfidence >= 0.62 && llmIntent?.authorName ? llmIntent.authorName : "") ||
      deterministicIntent.authorName,
  };
  const conversationalIntent: LibrarianConversationIntent =
    llmIntentConfidence >= 0.62 && llmIntent?.intent
      ? llmIntent.intent
      : mapScopeIntentToConversationIntent(intentClassification.intent);
  const explicitRoutingLocked = intentClassification.intent !== "BOOK_RECOMMENDATION";
  const needsClarification = !explicitRoutingLocked && (
    (llmIntentConfidence >= 0.62 && Boolean(llmIntent?.needsClarification)) ||
    isGenericClarificationQuery(validation.normalizedQuery)
  );
  const followUpQuestion =
    llmIntent?.followUpQuestion ||
    "Share one author, one title you loved, or a specific theme and I will refine precisely.";
  const intentConfidence = llmIntentConfidence || 0.72;

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
  const cacheIntent = `${intentClassification.intent}:${params.request.intent.trim()}`;
  const anchorGenres = (anchor?.genres || [])
    .filter((genre) => genre.trim().length > 0)
    .slice(0, 3);
  const topWeights = topGenreWeights(params.context);
  const dominantGenre =
    params.context.genres.dominantGenre ||
    (anchorGenres.length > 0 ? anchorGenres[0] : "");
  const requestedAuthor = intentClassification.authorName;
  const queryTokens = tokenize(validation.normalizedQuery);
  const unifiedSearchBudget: UnifiedSearchBudget = {
    used: 0,
    limit: LIBRARIAN_MAX_UNIFIED_SEARCH_CALLS,
  };
  const excludedProposalKeys = new Set<string>();

  const finalizeAndReturn = async (
    inputRecommendations: LibrarianBookCard[],
    options: {
      fromCache: boolean;
      remainingQuota: number;
      intent: LibrarianConversationIntent;
      suggestionMode?: LibrarianMode;
      excludedKeys?: Iterable<string>;
      minRecommendations?: number;
      fallbackQuery?: string;
      fallbackReason?: string;
      fallbackShortReason?: string;
      allowCardFallback?: boolean;
      needsClarification?: boolean;
      followUpQuestion?: string | null;
      explanationOverride?: string;
      confidence?: number;
      verifiedCount?: number;
      candidateCount?: number;
      authorName?: string;
    }
  ) => {
    const normalizeCards = (rows: LibrarianBookCard[]): LibrarianBookCard[] =>
      dedupeCards(rows)
        .slice(0, LIBRARIAN_LIMITS.MAX_BOOKS)
        .map((row) => {
          const defaultReason = "A strong next step based on your request.";
          return {
            ...row,
            short_reason: sanitizeShortReason(row.short_reason, defaultReason),
          };
        });

    let recommendations = normalizeCards(inputRecommendations);
    const allowCardFallback = options.allowCardFallback !== false;
    const minRecommendations = Math.max(
      0,
      Math.min(options.minRecommendations ?? LIBRARIAN_DEFAULT_SELECTION_COUNT, LIBRARIAN_LIMITS.MAX_BOOKS)
    );

    if (
      !options.fromCache &&
      allowCardFallback &&
      minRecommendations > 0 &&
      recommendations.length < minRecommendations
    ) {
      const excludeKeys = new Set<string>();
      for (const row of recommendations) {
        const key = proposalKey(row.title, row.author);
        if (key) excludeKeys.add(key);
      }
      for (const key of options.excludedKeys || []) {
        if (typeof key !== "string") continue;
        const normalized = key.trim();
        if (normalized) excludeKeys.add(normalized);
      }

      const fallbackCards = await resolveExternalFallbackCards({
        query: options.fallbackQuery || validation.normalizedQuery,
        budget: unifiedSearchBudget,
        reason: options.fallbackReason || "verified_recommendation_topup",
        maxBooks: minRecommendations,
        requiredAuthor: requestedAuthor || undefined,
        excludeKeys,
        shortReason:
          options.fallbackShortReason ||
          "A verified match for your request and a strong next reading step.",
      });

      recommendations = normalizeCards([...recommendations, ...fallbackCards]);
    }

    if (allowCardFallback && recommendations.length === 0) {
      recommendations = [
        buildFallbackCard({
          context: params.context,
          effectiveDominant: dominantGenre,
        }),
      ];
      recommendations = normalizeCards(recommendations).slice(0, 1).map((row) => {
        const defaultReason = "A strong next step based on your request.";
        return {
          ...row,
          short_reason: sanitizeShortReason(row.short_reason, defaultReason),
        };
      });
    }

    const outputTokens = approximateTokens(JSON.stringify(recommendations));
    if (outputTokens > LIBRARIAN_LIMITS.TOKEN_LIMIT_OUTPUT) {
      recommendations = recommendations.slice(0, 1);
    }

    const suggestionSessionId = buildSuggestionSessionId();
    const attributedRecommendations = attachSuggestionAttribution({
      recommendations,
      mode: options.suggestionMode ?? mode,
      suggestionSessionId,
    });

    if (!options.fromCache && recommendations.length > 0) {
      if (!LIBRARIAN_CACHE_DISABLED) {
        await storeCachedRecommendations({
          uid: normalizedUid,
          profileVersion: params.context.profileVersion,
          intent: cacheIntent,
          normalizedQuery: validation.normalizedQuery,
          recommendations,
        });
      } else {
        logger.info("[AI][LIBRARIAN][CACHE_BYPASS]", {
          action: "write_skip",
          uid: normalizedUid,
        });
      }

      await emitHomeFeedSignal({
        uid: normalizedUid,
        profileVersion: params.context.profileVersion,
        normalizedQuery: validation.normalizedQuery,
        recommendationCount: recommendations.length,
        suggestionSessionId,
        suggestionIds: attributedRecommendations.map((row) => row.suggestionId),
      });
    }

    const authorRecommendations = await buildAuthorRecommendations({
      normalizedQuery: validation.normalizedQuery,
      authorName: options.authorName || intentClassification.authorName,
      intent: options.intent,
      books: attributedRecommendations,
    });
    const explanation = options.explanationOverride
      ? sanitizeConversationExplanation(
          options.explanationOverride,
          "These verified recommendations align with your reading direction."
        )
      : await generateConversationalExplanation({
          normalizedQuery: validation.normalizedQuery,
          intent: options.intent,
          books: attributedRecommendations,
          authorCards: authorRecommendations,
        });
    const conversation: LibrarianConversation = {
      explanation,
      tone: options.intent === "clarification" ? "warm" : "intellectual",
      follow_up_question:
        typeof options.followUpQuestion === "string" && options.followUpQuestion.trim().length > 0
          ? options.followUpQuestion.trim()
          : options.needsClarification === true
          ? options.followUpQuestion || followUpQuestion
          : null,
      needs_clarification: options.needsClarification === true,
    };
    const fallbackOnly =
      attributedRecommendations.length === 0 ||
      attributedRecommendations.every(
        (row) =>
          row.bookId.startsWith("fallback_") || row.bookId.startsWith("topic_seed_")
      );
    const metadata: LibrarianResponseMetadata = {
      suggestionSessionId,
      verified:
        typeof options.verifiedCount === "number"
          ? options.verifiedCount > 0
          : !fallbackOnly,
      source: "vertex_llm + external_verification",
      confidence: clamp(
        Number.isFinite(Number(options.confidence))
          ? Number(options.confidence)
          : attributedRecommendations.length / Math.max(1, LIBRARIAN_LIMITS.MAX_BOOKS),
        0,
        1
      ),
    };

    try {
      await persistSuggestionSession({
        uid: normalizedUid,
        suggestionSessionId,
        normalizedQuery: validation.normalizedQuery,
        intent: params.request.intent.trim(),
        mode: options.suggestionMode ?? mode,
        books: attributedRecommendations,
        fromCache: options.fromCache,
      });
    } catch (error) {
      logger.error("[AI][LIBRARIAN][SUGGESTION_SESSION_WRITE_FAILED]", {
        uid: normalizedUid,
        suggestionSessionId,
        error: String(error),
      });
      throw new Error("ENGINE_FAILURE:suggestion_session_write_failed");
    }

    logger.info("[AI][LIBRARIAN][CONVERSATION_PAYLOAD]", {
      intent: options.intent,
      candidate_count:
        typeof options.candidateCount === "number"
          ? options.candidateCount
          : inputRecommendations.length,
      verified_count:
        typeof options.verifiedCount === "number"
          ? options.verifiedCount
          : attributedRecommendations.length,
      fallback_reason:
        recommendations.length === 0
          ? (options.fallbackReason || "none")
          : allowCardFallback
          ? options.fallbackReason || "none"
          : "clarification",
      suggestionSessionId,
    });

    return {
      recommendations: attributedRecommendations,
      intent: options.intent,
      conversation,
      authorRecommendations,
      metadata,
      fromCache: options.fromCache,
      remainingQuota: options.remainingQuota,
      normalizedQuery: validation.normalizedQuery,
    };
  };

  const cache = LIBRARIAN_CACHE_DISABLED
    ? null
    : await getCachedRecommendations({
      uid: normalizedUid,
      profileVersion: params.context.profileVersion,
      intent: cacheIntent,
      normalizedQuery: validation.normalizedQuery,
    });
  if (LIBRARIAN_CACHE_DISABLED) {
    logger.info("[AI][LIBRARIAN][CACHE_BYPASS]", {
      action: "read_skip",
      uid: normalizedUid,
    });
  }
  if (needsClarification) {
    const clarificationRemainingQuota = await getDailyQuotaRemaining(normalizedUid);
    return finalizeAndReturn([], {
      fromCache: false,
      remainingQuota: clarificationRemainingQuota,
      intent: "clarification",
      suggestionMode: mode,
      minRecommendations: 0,
      allowCardFallback: false,
      needsClarification: true,
      followUpQuestion,
      explanationOverride:
        "I can recommend much better if you share one author, one book you liked, or a theme.",
      confidence: intentConfidence,
      verifiedCount: 0,
      candidateCount: 0,
      authorName: intentClassification.authorName,
      fallbackReason: "clarification_required",
    });
  }

  if (cache) {
    if (intentClassification.intent !== "BOOK_RECOMMENDATION") {
      logger.info("[AI][LIBRARIAN][INTENT_GATE]", {
        routeIntent: intentClassification.intent,
        hasTopic: Boolean(intentClassification.topic),
        hasAuthorName: Boolean(intentClassification.authorName),
        source: "cache_hit",
      });
    }
    const remainingFromCache = await getDailyQuotaRemaining(normalizedUid);
    return finalizeAndReturn(cache, {
      fromCache: true,
      remainingQuota: remainingFromCache,
      intent: conversationalIntent,
      suggestionMode: mode,
      confidence: intentConfidence,
      verifiedCount: cache.length,
      candidateCount: cache.length,
      authorName: intentClassification.authorName,
    });
  }

  const quota = await consumeDailyQuota(normalizedUid);
  if (!quota.ok) {
    throw new Error("QUOTA_EXCEEDED");
  }

  if (intentClassification.intent === "OUT_OF_SCOPE") {
    logger.info("[AI][LIBRARIAN][INTENT_GATE]", {
      routeIntent: intentClassification.intent,
      hasTopic: Boolean(intentClassification.topic),
      hasAuthorName: Boolean(intentClassification.authorName),
    });

    const topicPhrase = intentClassification.topic.trim();
    const outOfScopeExplanation = topicPhrase
      ? `I cannot answer that directly, but I can help you explore ${topicPhrase} through books.`
      : "I cannot answer that directly, but I can still help you through books.";
    const outOfScopeFollowUp = topicPhrase
      ? `If you want, I can suggest two or three strong books about ${topicPhrase}.`
      : "If you want, I can suggest two or three strong books on the topic.";

    return finalizeAndReturn([], {
      fromCache: false,
      remainingQuota: quota.remaining,
      intent: "out_of_scope",
      suggestionMode: mode,
      minRecommendations: 0,
      allowCardFallback: false,
      needsClarification: false,
      followUpQuestion: outOfScopeFollowUp,
      explanationOverride: outOfScopeExplanation,
      confidence: intentConfidence,
      verifiedCount: 0,
      candidateCount: 0,
      authorName: intentClassification.authorName,
      fallbackReason: "out_of_scope_explanation_only",
    });
  }

  if (intentClassification.intent === "AUTHOR_ORDER") {
    logger.info("[AI][LIBRARIAN][INTENT_GATE]", {
      routeIntent: intentClassification.intent,
      hasTopic: Boolean(intentClassification.topic),
      hasAuthorName: Boolean(intentClassification.authorName),
    });

    let routed: LibrarianBookCard[] = [];
    routed = await resolveAuthorOrderCards({
      authorName: intentClassification.authorName,
      budget: unifiedSearchBudget,
    });
    if (routed.length < 2) {
      const topicCards = await resolveTopicBooks({
        topic: intentClassification.authorName,
        budget: unifiedSearchBudget,
        reason: "book_knowledge",
        maxBooks: 3,
      });
      routed.push(...topicCards);
    }

    if (routed.length < 2) {
      const filler = await resolveExternalFallbackCards({
        query: intentClassification.authorName
          ? `books by ${intentClassification.authorName}`
          : validation.normalizedQuery,
        budget: unifiedSearchBudget,
        reason: "structured_route_topup",
        maxBooks: 2,
        requiredAuthor: intentClassification.authorName || undefined,
        excludeKeys: excludedProposalKeys,
        shortReason: toKnowledgeReason(intentClassification.topic || intentClassification.authorName),
      });
      const needed = Math.max(0, 2 - routed.length);
      routed.push(
        ...filler.slice(0, needed).map((row) => ({
          ...row,
          short_reason: toKnowledgeReason(intentClassification.topic || intentClassification.authorName),
        }))
      );
    }
    return finalizeAndReturn(routed, {
      fromCache: false,
      remainingQuota: quota.remaining,
      intent:
        intentClassification.intent === "AUTHOR_ORDER"
          ? "author_request"
          : "theme_request",
      suggestionMode: mode,
      minRecommendations: LIBRARIAN_DEFAULT_SELECTION_COUNT,
      fallbackQuery: validation.normalizedQuery,
      fallbackReason: "structured_route_finalize",
      fallbackShortReason: toKnowledgeReason(intentClassification.topic || intentClassification.authorName),
      confidence: intentConfidence,
      verifiedCount: routed.length,
      candidateCount: routed.length,
      authorName: intentClassification.authorName,
    });
  }

  if (requestedAuthor) {
    const authorWorks = await resolveAuthorWorksCards({
      authorName: requestedAuthor,
      budget: unifiedSearchBudget,
      maxBooks: LIBRARIAN_LIMITS.MAX_BOOKS,
    });

    if (authorWorks.length > 0) {
      return finalizeAndReturn(authorWorks, {
        fromCache: false,
        remainingQuota: quota.remaining,
        intent: "author_request",
        suggestionMode: "HighConfidencePrecision",
        minRecommendations: LIBRARIAN_DEFAULT_SELECTION_COUNT,
        fallbackQuery: `books by ${requestedAuthor}`,
        fallbackReason: "author_works_finalize",
        fallbackShortReason: `A key work by ${requestedAuthor} with strong literary relevance.`,
        confidence: Math.max(intentConfidence, 0.78),
        verifiedCount: authorWorks.length,
        candidateCount: authorWorks.length,
        authorName: requestedAuthor,
      });
    }
  }

  const verifiedPool: VerifiedBook[] = [];
  let regenerationCount = 0;

  for (let attempt = 0; attempt <= LIBRARIAN_MAX_REGENERATION_ATTEMPTS; attempt += 1) {
    const proposals = await proposeBooks({
      normalizedQuery: validation.normalizedQuery,
      mode,
      context: params.context,
      anchor,
      requestedAuthor,
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
            requiredAuthor: requestedAuthor || undefined,
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
      const resolvedShortReason =
        candidate.sourceType === "canonical"
          ? buildShortReason({
              mode,
              dominantGenre,
              queryTokens,
              thematicOverlap,
              lowRated,
            })
          : "A strong thematic fit for your request with a clear reading path.";
      const short_reason =
        resolvedShortReason.trim().length > 0
          ? resolvedShortReason
          : "Verified book recommendation.";
      return {
        bookId: candidate.id,
        title: candidate.title,
        author: candidate.author,
        short_reason,
        mode,
        relevanceScore: round(relevance),
      } satisfies RankedLibrarianBookCard;
    })
    .sort(deterministicSort);

  const requestedCount =
    mode === "HighConfidencePrecision" && queryTokens.length >= 2
      ? LIBRARIAN_LIMITS.MAX_BOOKS
      : LIBRARIAN_DEFAULT_SELECTION_COUNT;

  const limitedRanked = scored.slice(
    0,
    Math.max(1, Math.min(requestedCount, LIBRARIAN_LIMITS.MAX_BOOKS))
  );
  const recommendations = limitedRanked.map((row) => toPublicCard(row));

  logger.info("[AI][LIBRARIAN][ORCHESTRATOR]", {
    proposalCount: excludedProposalKeys.size,
    verifiedCount: verified.length,
    selectedCount: recommendations.length,
    regenerationCount,
    mode,
    anchorResolved: Boolean(anchor),
  });

  return finalizeAndReturn(recommendations, {
    fromCache: false,
    remainingQuota: quota.remaining,
    intent: conversationalIntent,
    suggestionMode: mode,
    excludedKeys: excludedProposalKeys,
    minRecommendations: LIBRARIAN_LIMITS.MAX_BOOKS,
    fallbackQuery: requestedAuthor
      ? `books by ${requestedAuthor}`
      : validation.normalizedQuery,
    fallbackReason: "book_recommendation_finalize",
    fallbackShortReason: "A verified match for your request and a strong next reading step.",
    confidence: intentConfidence,
    verifiedCount: verified.length,
    candidateCount: excludedProposalKeys.size,
    authorName: intentClassification.authorName,
  });
}
