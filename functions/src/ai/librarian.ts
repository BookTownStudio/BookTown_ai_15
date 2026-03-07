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
  MAX_BOOKS: 5,
  DEFAULT_BOOKS: 4,
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
  coverUrl?: string;
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
  uiLanguage?: string;
  messages?: LibrarianMemoryMessage[];
};

type LibrarianMemoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type RankedLibrarianBookCard = LibrarianBookCard & {
  mode: LibrarianMode;
  relevanceScore: number;
  diversityGenres?: string[];
  diversityThemes?: string[];
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
  bestBookIntent: boolean;
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
  explanation: string;
  themes: string[];
};

type CandidateBook = {
  id: string;
  title: string;
  author: string;
  genres: string[];
  rating: number | null;
  coverUrl?: string;
};

type VerifiedBook = CandidateBook & {
  sourceType: "canonical" | "lightweight";
  source: "booktown" | "googleBooks" | "openLibrary";
  externalId: string | null;
  canonicalBookId: string | null;
  proposedExplanation?: string;
  proposedThemes?: string[];
  coverUrl?: string;
  description?: string;
  externalIds?: {
    providerId: string | null;
    canonicalBookId: string | null;
  };
  verificationSource?: "canonical" | "external_verified";
};

type RecentSignalAffinity = {
  sampleCount: number;
  authorWeights: Record<string, number>;
  genreWeights: Record<string, number>;
  themeWeights: Record<string, number>;
};

type ReaderIntent =
  | "DISCOVERY"
  | "AUTHOR_EXPLORATION"
  | "GENRE_EXPLORATION"
  | "CANONICAL_WORKS"
  | "MOOD_READING"
  | "COMPARISON";

const LIBRARIAN_PROPOSAL_MODEL = "gemini-2.0-flash";
const LIBRARIAN_VERTEX_REGION = "us-central1";
const LIBRARIAN_MIN_LLM_CANDIDATES = 20;
const LIBRARIAN_MAX_LLM_CANDIDATES = 30;
const LIBRARIAN_DEFAULT_SELECTION_COUNT = 2;
const LIBRARIAN_MAX_REGENERATION_ATTEMPTS = 1;
const LIBRARIAN_LLM_TIMEOUT_MS = 3000;
const LIBRARIAN_PROMPT_TOKEN_LIMIT = 2000;
const LIBRARIAN_MAX_UNIFIED_SEARCH_CALLS = 8;
const LIBRARIAN_CACHE_SCHEMA_VERSION = "v3";
const LIBRARIAN_INTENT_TIMEOUT_MS = 1500;
const LIBRARIAN_EXPLANATION_TIMEOUT_MS = 1500;
const LIBRARIAN_MMR_LAMBDA = 0.65;
const LIBRARIAN_MMR_POOL_SIZE = 20;
const LIBRARIAN_MMR_SELECTION_SIZE = 5;
const CANONICAL_AUTHOR_BOOST = 0.08;
const CANONICAL_TITLE_BOOST = 0.1;
const CANONICAL_MOVEMENT_BOOST = 0.05;
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

let proposalClientSingleton: ProposalClient | undefined;

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

const CANONICAL_AUTHORS = [
  "dostoevsky",
  "tolstoy",
  "kafka",
  "camus",
  "borges",
  "umberto eco",
  "amin maalouf",
  "rumi",
  "kahlil gibran",
  "virginia woolf",
  "marcel proust",
  "james joyce",
  "gabriel garcia marquez",
  "milan kundera",
] as const;

const AUTHOR_ENTITY_ALIASES: Record<string, string> = {
  eco: "umberto eco",
  maalouf: "amin maalouf",
  rumi: "rumi",
  gibran: "kahlil gibran",
  jibran: "kahlil gibran",
  jubran: "kahlil gibran",
};

const CANONICAL_BOOKS = [
  "the trial",
  "the castle",
  "crime and punishment",
  "war and peace",
  "anna karenina",
  "the stranger",
  "ficciones",
  "in search of lost time",
  "ulysses",
  "one hundred years of solitude",
] as const;

const CANONICAL_MOVEMENTS = [
  "modernism",
  "existentialism",
  "magical realism",
  "latin american boom",
] as const;

type TopicAnchorEntry = {
  title: string;
  author: string;
};

const TOPIC_CANONICAL_ANCHORS: Record<string, TopicAnchorEntry[]> = {
  "greek philosophy": [
    { title: "The Republic", author: "Plato" },
    { title: "Nicomachean Ethics", author: "Aristotle" },
    { title: "Meditations", author: "Marcus Aurelius" },
    { title: "Enchiridion", author: "Epictetus" },
  ],
  existentialism: [
    { title: "Nausea", author: "Jean-Paul Sartre" },
    { title: "The Stranger", author: "Albert Camus" },
    { title: "The Myth of Sisyphus", author: "Albert Camus" },
  ],
};

const READER_INTENT_PATTERNS: Record<ReaderIntent, RegExp[]> = {
  AUTHOR_EXPLORATION: [
    /\bbooks by\b/,
    /\bworks by\b/,
    /\bwhat should i read from\b/,
    /\bnovels by\b/,
  ],
  DISCOVERY: [
    /\bbooks like\b/,
    /\bsimilar to\b/,
    /\brecommend books\b/,
  ],
  GENRE_EXPLORATION: [
    /\bbest\b/,
    /\btop\b/,
    /\bgreat\b/,
    /\bclassic\b/,
  ],
  CANONICAL_WORKS: [
    /\bcanonical\b/,
    /\bcanon\b/,
    /\bmasterpiece\b/,
    /\bmasterpieces\b/,
    /\bgreat works\b/,
  ],
  MOOD_READING: [
    /\bsomething sad\b/,
    /\bsomething deep\b/,
    /\bmelancholic\b/,
    /\bdark\b/,
  ],
  COMPARISON: [
    /\bsimilar to\b/,
    /\blike kafka\b/,
    /\blike borges\b/,
  ],
};

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
const DERIVATIVE_BOOK_TITLE_PATTERN =
  /\b(coloring|colouring|guide|workbook|summary|analysis|companion|journal|notebook|trivia|quiz|study guide)\b/i;
const AUTHOR_COLLECTION_TITLE_PATTERN =
  /\b(complete novels?|complete works?|collected works?|curated works?|selected works?|illustrated|box set|books set|omnibus|anthology|volumes?|vol\.|collection)\b/i;
const SIGNAL_THEME_STOPWORDS = new Set([
  "book",
  "books",
  "novel",
  "novels",
  "author",
  "authors",
  "read",
  "reading",
  "recommend",
  "recommended",
  "suggest",
  "about",
  "with",
  "from",
  "that",
  "this",
  "your",
  "strong",
  "clear",
  "next",
  "step",
  "path",
]);

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

const CANONICAL_AUTHOR_LOOKUP = new Set(
  CANONICAL_AUTHORS.map((value) => normalizeText(value)).filter((value) => value.length > 0)
);
const CANONICAL_BOOK_LOOKUP = new Set(
  CANONICAL_BOOKS.map((value) => normalizeText(value)).filter((value) => value.length > 0)
);
const CANONICAL_MOVEMENT_LOOKUP = CANONICAL_MOVEMENTS.map((value) => normalizeText(value)).filter(
  (value) => value.length > 0
);

function tokenize(value: string): string[] {
  if (!value) return [];
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .slice(0, 24);
}

function sanitizeMemoryMessages(messages: unknown): LibrarianMemoryMessage[] {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const record = row as Record<string, unknown>;
      const roleRaw = record.role;
      const role =
        roleRaw === "assistant" ? "assistant" : roleRaw === "user" ? "user" : null;
      if (!role) return null;
      const content = String(record.content || "").replace(/\s+/g, " ").trim().slice(0, 280);
      if (!content) return null;
      return { role, content } satisfies LibrarianMemoryMessage;
    })
    .filter((row): row is LibrarianMemoryMessage => row !== null)
    .slice(-6);
}

function formatConversationMemory(messages: LibrarianMemoryMessage[]): string {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "No recent conversation context.";
  }
  return messages
    .map((row) => `${row.role === "assistant" ? "assistant" : "user"}: ${row.content}`)
    .join(" | ");
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
    /(?:^|\b)(?:a|an|some)?\s*(?:book|books|novel|novels)\s+(?:bt|from)\s+(.+)$/i,
    /(?:^|\b)(?:suggest|recommend)\s+(?:me\s+)?(?:a|an|some)?\s*(?:book|books|novel|novels)?\s*by\s+(.+)$/i,
    /(?:^|\b)(?:suggest|recommend)\s+(?:me\s+)?(?:a|an|some)?\s*(?:book|books|novel|novels)?\s*(?:bt|from)\s+(.+)$/i,
    /^([a-z\p{L}][a-z\p{L}\s.'-]{1,120})\s+(?:books?|novels?)$/iu,
    /\b(?:books?|novels?)\s+for\s+([a-z\p{L}][a-z\p{L}\s.'-]{1,120})$/iu,
    /\bauthor\s+(?:is\s+)?([a-z\p{L}][a-z\p{L}\s.'-]{1,120})$/iu,
    /\bauthor\s+i\s+want\s+books\s+for\s+([a-z\p{L}][a-z\p{L}\s.'-]{1,120})$/iu,
    /\bby\s+([a-z\p{L}][a-z\p{L}\s.'-]{1,120})$/iu,
  ];
  for (const pattern of patterns) {
    const match = query.match(pattern);
    const candidate = match?.[1] ? normalizeText(match[1]) : "";
    if (candidate && isLikelyAuthorEntity(candidate)) return candidate;
  }
  const knownAuthor = findKnownAuthorInQuery(query);
  if (knownAuthor) return knownAuthor;
  return "";
}

const AUTHOR_ENTITY_STOPWORDS = new Set([
  "book",
  "books",
  "novel",
  "novels",
  "author",
  "authors",
  "read",
  "reading",
  "genre",
  "genres",
  "theme",
  "themes",
  "fiction",
  "nonfiction",
  "literature",
  "philosophy",
  "history",
  "psychology",
  "economics",
  "politics",
  "weather",
  "stock",
  "market",
  "news",
  "today",
  "latest",
]);

function isLikelyAuthorEntity(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (NON_AUTHOR_ENTITY_PATTERN.test(normalized)) return false;
  const tokens = tokenize(normalized);
  if (tokens.length === 0 || tokens.length > 6) return false;
  for (const token of tokens) {
    if (AUTHOR_ENTITY_STOPWORDS.has(token)) return false;
  }
  if (tokens.length === 1) {
    return CANONICAL_AUTHOR_LOOKUP.has(normalized);
  }
  return true;
}

function findKnownAuthorInQuery(query: string): string {
  const normalized = normalizeText(query);
  if (!normalized) return "";
  const haystack = ` ${normalized} `;
  const aliasEntries = Object.entries(AUTHOR_ENTITY_ALIASES)
    .map(([alias, canonical]) => [normalizeText(alias), normalizeText(canonical)] as const)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [alias, canonical] of aliasEntries) {
    if (!alias || !canonical) continue;
    if (haystack.includes(` ${alias} `)) return canonical;
  }
  for (const author of CANONICAL_AUTHOR_LOOKUP) {
    if (!author) continue;
    if (haystack.includes(` ${author} `)) return author;
  }
  return "";
}

function detectAuthorEntity(query: string): string {
  const extracted = extractAuthorFromByQuery(query);
  if (extracted) return extracted;
  return "";
}

function splitNormalizedWords(value: string): string[] {
  return value
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function tokenOverlapRatio(queryWords: string[], titleWords: string[]): number {
  if (queryWords.length === 0 || titleWords.length === 0) return 0;
  const titleSet = new Set(titleWords);
  let matches = 0;
  for (const word of queryWords) {
    if (titleSet.has(word)) matches += 1;
  }
  return matches / queryWords.length;
}

function isStrongDirectTitleMatch(query: string, title: string): boolean {
  const queryNorm = normalizeText(query);
  const titleNorm = normalizeText(title);
  if (!queryNorm || !titleNorm) return false;
  if (queryNorm === titleNorm) return true;

  const queryWords = splitNormalizedWords(queryNorm);
  const titleWords = splitNormalizedWords(titleNorm);
  return (
    queryWords.length >= 2 &&
    titleWords.length > queryWords.length &&
    titleNorm.endsWith(queryNorm) &&
    tokenOverlapRatio(queryWords, titleWords) >= 0.7
  );
}

function isDirectTitleStyleQuery(normalizedQuery: string): boolean {
  const query = normalizeText(normalizedQuery);
  if (!query) return false;
  if (hasTermFromSet(query, BOOK_CONTEXT_TERMS)) return false;
  if (hasTermFromSet(query, NON_BOOK_TERMS)) return false;
  if (/[?]/.test(normalizedQuery)) return false;
  const tokens = tokenize(query);
  return tokens.length >= 1 && tokens.length <= 6;
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

type AnchorLanguage = "en" | "ar" | "fr" | "es";

type AnchorSeedBuckets = {
  genres: string[];
  themes: string[];
  topics: string[];
  movements: string[];
  readerIntents: string[];
  periods: string[];
  philosophy: string[];
  psychology: string[];
  styles: string[];
  settings: string[];
};

const CLARITY_STRUCTURAL_PATTERNS: RegExp[] = [
  /\bbook by\b/,
  /\bbooks by\b/,
  /\bnovel by\b/,
  /\bnovels by\b/,
  /\bwork by\b/,
  /\bworks by\b/,
  /\bbook like\b/,
  /\bbooks like\b/,
  /\bsimilar to\b/,
  /\bnovel about\b/,
  /\bnovels about\b/,
  /\bbook about\b/,
  /\bbooks about\b/,
  /\brecommend book about\b/,
  /\brecommend books about\b/,
  /\bwhat should i read from\b/,
  /\bwhat should i read if i loved\b/,
];

const CLARIFICATION_TEMPLATES: Record<AnchorLanguage, string[]> = {
  en: [
    "Are you looking for fiction or nonfiction?",
    "Do you have a particular genre or author in mind?",
    "Are you interested in novels, essays, or something else?",
  ],
  ar: [
    "هل تفضّل روايات أم كتب غير روائية؟",
    "هل لديك نوع أدبي أو كاتب معيّن في بالك؟",
    "هل تريد روايات أم سيرًا أم شيئًا آخر؟",
  ],
  fr: [
    "Vous cherchez plutôt de la fiction ou de la non-fiction ?",
    "Avez-vous un genre ou un auteur précis en tête ?",
    "Vous préférez des romans, des essais, ou autre chose ?",
  ],
  es: [
    "¿Buscas ficción o no ficción?",
    "¿Tienes en mente un género o autor en particular?",
    "¿Te interesan novelas, ensayos o algo distinto?",
  ],
};

const CLARITY_ANCHOR_SEEDS: Record<AnchorLanguage, AnchorSeedBuckets> = {
  en: {
    genres: [
      "literary fiction",
      "historical fiction",
      "science fiction",
      "speculative fiction",
      "biopunk",
      "fantasy",
      "mystery",
      "thriller",
      "romance",
      "magical realism",
      "dystopian fiction",
      "memoir",
      "biography",
      "poetry",
    ],
    themes: [
      "exile",
      "memory",
      "identity",
      "grief",
      "love",
      "migration",
      "war",
      "family",
      "spirituality",
      "justice",
      "resistance",
      "solitude",
    ],
    topics: [
      "philosophy",
      "psychology",
      "politics",
      "economics",
      "climate",
      "technology",
      "colonialism",
      "feminism",
      "mythology",
      "religion",
      "ethics",
      "trauma",
    ],
    movements: [
      "modernism",
      "postmodernism",
      "realism",
      "surrealism",
      "existentialism",
      "romanticism",
      "symbolism",
      "naturalism",
      "absurdism",
      "beat generation",
      "harlem renaissance",
      "latin american boom",
    ],
    readerIntents: [
      "underrated",
      "beginner friendly",
      "short books",
      "long novels",
      "character driven",
      "plot driven",
      "thought provoking",
      "emotionally intense",
      "hopeful",
      "dark",
      "reflective",
      "escapist",
    ],
    periods: [
      "ancient world",
      "medieval era",
      "renaissance",
      "enlightenment",
      "19th century",
      "early 20th century",
      "postwar era",
      "contemporary",
      "cold war",
      "precolonial period",
      "industrial era",
      "digital age",
    ],
    philosophy: [
      "stoicism",
      "nihilism",
      "phenomenology",
      "ethics",
      "metaphysics",
      "epistemology",
      "humanism",
      "existential thought",
      "absurdity",
      "moral philosophy",
      "political philosophy",
      "social contract",
    ],
    psychology: [
      "attachment",
      "anxiety",
      "depression",
      "resilience",
      "trauma recovery",
      "childhood",
      "personality",
      "cognition",
      "behavior change",
      "loneliness",
      "motivation",
      "obsession",
    ],
    styles: [
      "lyrical prose",
      "fragmented narrative",
      "epistolary",
      "stream of consciousness",
      "nonlinear",
      "minimalist prose",
      "satirical tone",
      "allegorical",
      "intimate first person",
      "omniscient narration",
      "dialog heavy",
      "sparse style",
    ],
    settings: [
      "middle east",
      "north africa",
      "latin america",
      "east asia",
      "south asia",
      "europe",
      "postcolonial city",
      "rural village",
      "desert landscape",
      "coastal town",
      "war zone",
      "borderlands",
    ],
  },
  ar: {
    genres: [
      "رواية أدبية",
      "رواية تاريخية",
      "خيال علمي",
      "فانتازيا",
      "غموض",
      "تشويق",
      "رومانسية",
      "واقعية سحرية",
      "ديستوبيا",
      "سيرة ذاتية",
      "سيرة",
      "شعر",
    ],
    themes: [
      "المنفى",
      "الذاكرة",
      "الهوية",
      "الفقد",
      "الحب",
      "الهجرة",
      "الحرب",
      "العائلة",
      "الروحانية",
      "العدالة",
      "المقاومة",
      "العزلة",
    ],
    topics: [
      "فلسفة",
      "علم النفس",
      "سياسة",
      "اقتصاد",
      "المناخ",
      "التكنولوجيا",
      "الاستعمار",
      "النسوية",
      "الأسطورة",
      "الدين",
      "الأخلاق",
      "الصدمة",
    ],
    movements: [
      "الحداثة",
      "ما بعد الحداثة",
      "الواقعية",
      "السريالية",
      "الوجودية",
      "الرومانسية",
      "الرمزية",
      "الطبيعية",
      "العبثية",
      "نهضة أدبية",
      "تيار معاصر",
      "أدب ما بعد الاستعمار",
    ],
    readerIntents: [
      "كتب مغمورة",
      "مناسب للمبتدئين",
      "كتب قصيرة",
      "روايات طويلة",
      "تركيز على الشخصيات",
      "تركيز على الحبكة",
      "يفتح التفكير",
      "مكثف عاطفيا",
      "أمل",
      "داكن",
      "تأملي",
      "هروبي",
    ],
    periods: [
      "العالم القديم",
      "العصر الوسيط",
      "عصر النهضة",
      "عصر التنوير",
      "القرن التاسع عشر",
      "بداية القرن العشرين",
      "فترة ما بعد الحرب",
      "معاصر",
      "الحرب الباردة",
      "ما قبل الاستعمار",
      "العصر الصناعي",
      "العصر الرقمي",
    ],
    philosophy: [
      "الرواقية",
      "العدمية",
      "الظاهراتية",
      "الأخلاق",
      "الميتافيزيقا",
      "نظرية المعرفة",
      "الإنسانية",
      "الفكر الوجودي",
      "العبث",
      "الفلسفة الأخلاقية",
      "الفلسفة السياسية",
      "العقد الاجتماعي",
    ],
    psychology: [
      "التعلق",
      "القلق",
      "الاكتئاب",
      "المرونة",
      "التعافي من الصدمة",
      "الطفولة",
      "الشخصية",
      "الإدراك",
      "تغيير السلوك",
      "الوحدة",
      "الدافعية",
      "الهوس",
    ],
    styles: [
      "نثر شعري",
      "سرد متشظ",
      "رسائلي",
      "تيار الوعي",
      "سرد غير خطي",
      "نثر مكثف",
      "نبرة ساخرة",
      "رمزي",
      "ضمير المتكلم",
      "راو عليم",
      "حواري",
      "أسلوب مقتضب",
    ],
    settings: [
      "الشرق الأوسط",
      "شمال أفريقيا",
      "أميركا اللاتينية",
      "شرق آسيا",
      "جنوب آسيا",
      "أوروبا",
      "مدينة ما بعد الاستعمار",
      "قرية ريفية",
      "مشهد صحراوي",
      "مدينة ساحلية",
      "منطقة حرب",
      "مناطق حدودية",
    ],
  },
  fr: {
    genres: [
      "fiction littéraire",
      "roman historique",
      "science-fiction",
      "fantasy",
      "polar",
      "thriller",
      "romance",
      "réalisme magique",
      "fiction dystopique",
      "mémoire",
      "biographie",
      "poésie",
    ],
    themes: [
      "exil",
      "mémoire",
      "identité",
      "deuil",
      "amour",
      "migration",
      "guerre",
      "famille",
      "spiritualité",
      "justice",
      "résistance",
      "solitude",
    ],
    topics: [
      "philosophie",
      "psychologie",
      "politique",
      "économie",
      "climat",
      "technologie",
      "colonialisme",
      "féminisme",
      "mythologie",
      "religion",
      "éthique",
      "trauma",
    ],
    movements: [
      "modernisme",
      "postmodernisme",
      "réalisme",
      "surréalisme",
      "existentialisme",
      "romantisme",
      "symbolisme",
      "naturalisme",
      "absurde",
      "beat generation",
      "renaissance noire",
      "boom latino-américain",
    ],
    readerIntents: [
      "sous-estimé",
      "accessible débutant",
      "livres courts",
      "romans longs",
      "centré personnages",
      "centré intrigue",
      "stimulant intellectuel",
      "intense émotionnel",
      "lumineux",
      "sombre",
      "réflexif",
      "évasion",
    ],
    periods: [
      "antiquité",
      "moyen âge",
      "renaissance",
      "siècle des lumières",
      "xixe siècle",
      "début xxe siècle",
      "après-guerre",
      "contemporain",
      "guerre froide",
      "précolonial",
      "ère industrielle",
      "ère numérique",
    ],
    philosophy: [
      "stoïcisme",
      "nihilisme",
      "phénoménologie",
      "éthique",
      "métaphysique",
      "épistémologie",
      "humanisme",
      "pensée existentielle",
      "absurdité",
      "philosophie morale",
      "philosophie politique",
      "contrat social",
    ],
    psychology: [
      "attachement",
      "anxiété",
      "dépression",
      "résilience",
      "trauma",
      "enfance",
      "personnalité",
      "cognition",
      "changement comportemental",
      "solitude psychique",
      "motivation",
      "obsession",
    ],
    styles: [
      "prose lyrique",
      "récit fragmenté",
      "épistolaire",
      "flux de conscience",
      "narration non linéaire",
      "prose minimaliste",
      "ton satirique",
      "allégorique",
      "première personne intime",
      "narrateur omniscient",
      "dialogue soutenu",
      "style épuré",
    ],
    settings: [
      "moyen-orient",
      "afrique du nord",
      "amérique latine",
      "asie de l'est",
      "asie du sud",
      "europe",
      "ville postcoloniale",
      "village rural",
      "paysage désertique",
      "ville côtière",
      "zone de guerre",
      "régions frontalières",
    ],
  },
  es: {
    genres: [
      "ficción literaria",
      "novela histórica",
      "ciencia ficción",
      "fantasía",
      "misterio",
      "thriller",
      "romance",
      "realismo mágico",
      "ficción distópica",
      "memorias",
      "biografía",
      "poesía",
    ],
    themes: [
      "exilio",
      "memoria",
      "identidad",
      "duelo",
      "amor",
      "migración",
      "guerra",
      "familia",
      "espiritualidad",
      "justicia",
      "resistencia",
      "soledad",
    ],
    topics: [
      "filosofía",
      "psicología",
      "política",
      "economía",
      "clima",
      "tecnología",
      "colonialismo",
      "feminismo",
      "mitología",
      "religión",
      "ética",
      "trauma",
    ],
    movements: [
      "modernismo",
      "posmodernismo",
      "realismo",
      "surrealismo",
      "existencialismo",
      "romanticismo",
      "simbolismo",
      "naturalismo",
      "absurdismo",
      "generación beat",
      "renacimiento de harlem",
      "boom latinoamericano",
    ],
    readerIntents: [
      "infravalorado",
      "apto principiantes",
      "libros cortos",
      "novelas largas",
      "centrado en personajes",
      "centrado en trama",
      "provocador",
      "intenso emocional",
      "esperanzador",
      "oscuro",
      "reflexivo",
      "evasión",
    ],
    periods: [
      "mundo antiguo",
      "edad media",
      "renacimiento",
      "ilustración",
      "siglo xix",
      "inicios siglo xx",
      "posguerra",
      "contemporáneo",
      "guerra fría",
      "precolonial",
      "era industrial",
      "era digital",
    ],
    philosophy: [
      "estoicismo",
      "nihilismo",
      "fenomenología",
      "ética",
      "metafísica",
      "epistemología",
      "humanismo",
      "pensamiento existencial",
      "absurdo",
      "filosofía moral",
      "filosofía política",
      "contrato social",
    ],
    psychology: [
      "apego",
      "ansiedad",
      "depresión",
      "resiliencia",
      "trauma",
      "infancia",
      "personalidad",
      "cognición",
      "cambio de conducta",
      "soledad",
      "motivación",
      "obsesión",
    ],
    styles: [
      "prosa lírica",
      "narrativa fragmentada",
      "epistolar",
      "flujo de conciencia",
      "narración no lineal",
      "prosa minimalista",
      "tono satírico",
      "alegórico",
      "primera persona íntima",
      "narrador omnisciente",
      "mucho diálogo",
      "estilo sobrio",
    ],
    settings: [
      "oriente medio",
      "norte de áfrica",
      "américa latina",
      "asia oriental",
      "asia del sur",
      "europa",
      "ciudad poscolonial",
      "pueblo rural",
      "paisaje desértico",
      "ciudad costera",
      "zona de guerra",
      "fronteras",
    ],
  },
};

function normalizeAnchorEntry(value: string): string {
  return normalizeText(value).toLowerCase();
}

function combineAnchors(params: {
  left: string[];
  right: string[];
  max: number;
  localSet: Set<string>;
  globalSet: Set<string>;
}): void {
  let count = 0;
  for (const a of params.left) {
    for (const b of params.right) {
      if (count >= params.max) return;
      const combined = normalizeAnchorEntry(`${a} ${b}`);
      if (!combined || params.localSet.has(combined) || params.globalSet.has(combined)) continue;
      params.localSet.add(combined);
      params.globalSet.add(combined);
      count += 1;
    }
  }
}

function buildMultilingualAnchorVocabulary(): Record<AnchorLanguage, string[]> {
  const languages: AnchorLanguage[] = ["en", "ar", "fr", "es"];
  const globalSeen = new Set<string>();
  const vocabulary = {
    en: [] as string[],
    ar: [] as string[],
    fr: [] as string[],
    es: [] as string[],
  };

  for (const language of languages) {
    const seeds = CLARITY_ANCHOR_SEEDS[language];
    const localSeen = new Set<string>();
    const seedGroups = [
      seeds.genres,
      seeds.themes,
      seeds.topics,
      seeds.movements,
      seeds.readerIntents,
      seeds.periods,
      seeds.philosophy,
      seeds.psychology,
      seeds.styles,
      seeds.settings,
    ];

    for (const group of seedGroups) {
      for (const entry of group) {
        const normalized = normalizeAnchorEntry(entry);
        if (!normalized || localSeen.has(normalized) || globalSeen.has(normalized)) continue;
        localSeen.add(normalized);
        globalSeen.add(normalized);
      }
    }

    combineAnchors({
      left: seeds.genres.slice(0, 10),
      right: seeds.themes.slice(0, 8),
      max: 80,
      localSet: localSeen,
      globalSet: globalSeen,
    });
    combineAnchors({
      left: seeds.periods.slice(0, 8),
      right: seeds.topics.slice(0, 6),
      max: 48,
      localSet: localSeen,
      globalSet: globalSeen,
    });
    combineAnchors({
      left: seeds.styles.slice(0, 8),
      right: seeds.settings.slice(0, 6),
      max: 48,
      localSet: localSeen,
      globalSet: globalSeen,
    });
    combineAnchors({
      left: seeds.readerIntents.slice(0, 8),
      right: seeds.genres.slice(0, 8),
      max: 64,
      localSet: localSeen,
      globalSet: globalSeen,
    });

    vocabulary[language] = Array.from(localSeen);
  }

  return vocabulary;
}

const CLARITY_ANCHOR_VOCABULARY = buildMultilingualAnchorVocabulary();

const CLARITY_ANCHOR_LOOKUP = (() => {
  const out: Record<AnchorLanguage, { single: Set<string>; phrases: string[] }> = {
    en: { single: new Set<string>(), phrases: [] },
    ar: { single: new Set<string>(), phrases: [] },
    fr: { single: new Set<string>(), phrases: [] },
    es: { single: new Set<string>(), phrases: [] },
  };
  for (const language of ["en", "ar", "fr", "es"] as AnchorLanguage[]) {
    for (const entry of CLARITY_ANCHOR_VOCABULARY[language]) {
      if (entry.includes(" ")) {
        out[language].phrases.push(entry);
      } else {
        out[language].single.add(entry);
      }
    }
  }
  return out;
})();

function resolveAnchorLanguage(normalizedQuery: string, preferredLanguage?: string): AnchorLanguage {
  const preferred = String(preferredLanguage || "").trim().toLowerCase();
  if (preferred.startsWith("ar")) return "ar";
  if (preferred.startsWith("fr")) return "fr";
  if (preferred.startsWith("es")) return "es";
  if (preferred.startsWith("en")) return "en";
  if (/[\u0600-\u06FF]/.test(normalizedQuery)) return "ar";
  return "en";
}

function hasAnchorMatch(normalizedQuery: string, language: AnchorLanguage): boolean {
  const lookup = CLARITY_ANCHOR_LOOKUP[language] || CLARITY_ANCHOR_LOOKUP.en;
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 0);
  for (const token of tokens) {
    if (lookup.single.has(token)) return true;
  }
  for (const phrase of lookup.phrases) {
    if (normalizedQuery.includes(phrase)) return true;
  }
  return false;
}

function isQueryClear(params: { normalizedQuery: string; preferredLanguage?: string }): boolean {
  const query = normalizeText(params.normalizedQuery);
  if (!query) return false;
  const wordCount = query.split(/\s+/).filter((token) => token.length > 0).length;
  if (wordCount < 3) return false;
  for (const pattern of CLARITY_STRUCTURAL_PATTERNS) {
    if (pattern.test(query)) return true;
  }
  const language = resolveAnchorLanguage(query, params.preferredLanguage);
  if (hasAnchorMatch(query, language)) return true;
  return false;
}

function buildClarificationFollowUpQuestion(params: {
  normalizedQuery: string;
  preferredLanguage?: string;
}): string {
  const query = normalizeText(params.normalizedQuery);
  const language = resolveAnchorLanguage(query, params.preferredLanguage);
  const templates = CLARIFICATION_TEMPLATES[language] || CLARIFICATION_TEMPLATES.en;
  const digest = createHash("sha256").update(query || "clarification").digest();
  const index = digest[0] % templates.length;
  return templates[index];
}

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

function classifyReaderIntent(normalizedQuery: string): ReaderIntent {
  const query = normalizeText(normalizedQuery);
  if (!query) return "DISCOVERY";

  if (READER_INTENT_PATTERNS.COMPARISON.some((pattern) => pattern.test(query))) {
    return "COMPARISON";
  }
  if (READER_INTENT_PATTERNS.AUTHOR_EXPLORATION.some((pattern) => pattern.test(query))) {
    return "AUTHOR_EXPLORATION";
  }
  if (READER_INTENT_PATTERNS.MOOD_READING.some((pattern) => pattern.test(query))) {
    return "MOOD_READING";
  }
  if (READER_INTENT_PATTERNS.CANONICAL_WORKS.some((pattern) => pattern.test(query))) {
    return "CANONICAL_WORKS";
  }
  if (READER_INTENT_PATTERNS.GENRE_EXPLORATION.some((pattern) => pattern.test(query))) {
    return "GENRE_EXPLORATION";
  }
  if (READER_INTENT_PATTERNS.DISCOVERY.some((pattern) => pattern.test(query))) {
    return "DISCOVERY";
  }
  return "DISCOVERY";
}

function readerIntentPromptGuidance(intent: ReaderIntent): string {
  if (intent === "AUTHOR_EXPLORATION") {
    return "Prioritize strong works by the requested or closely related author.";
  }
  if (intent === "GENRE_EXPLORATION") {
    return "Prioritize foundational and high-signal works within the inferred genre.";
  }
  if (intent === "CANONICAL_WORKS") {
    return "Prioritize canon-defining literary works with long-term significance.";
  }
  if (intent === "MOOD_READING") {
    return "Prioritize emotionally aligned books that match the requested mood.";
  }
  if (intent === "COMPARISON") {
    return "Prioritize books with stylistic or thematic proximity to the referenced author/work.";
  }
  return "Prioritize broad but high-quality discovery recommendations.";
}

function isBestBookIntentQuery(normalizedQuery: string): boolean {
  const query = normalizeText(normalizedQuery);
  if (!query) return false;
  const hasBestSignal = /\b(best|better|strongest|greatest|top)\b/.test(query);
  const hasReadingSignal = /\b(book|books|novel|novels|read|start|starting point|first)\b/.test(query);
  return hasBestSignal && hasReadingSignal;
}

function classifyLibrarianIntent(normalizedQuery: string): IntentClassification {
  const query = normalizeText(normalizedQuery);
  const bestBookIntent = isBestBookIntentQuery(query);
  const authorName = extractAuthorFromOrderQuery(query);
  if (authorName) {
    return {
      intent: "AUTHOR_ORDER",
      topic: "",
      authorName,
      bestBookIntent,
    };
  }
  const authorByName = detectAuthorEntity(query);
  if (authorByName) {
    return {
      intent: "BOOK_RECOMMENDATION",
      topic: "",
      authorName: authorByName,
      bestBookIntent,
    };
  }

  const hasBookContext = hasTermFromSet(query, BOOK_CONTEXT_TERMS);
  const hasNonBookContext = hasTermFromSet(query, NON_BOOK_TERMS);
  if (hasNonBookContext && !hasBookContext) {
    return {
      intent: "OUT_OF_SCOPE",
      topic: extractTopicFromQuery(query),
      authorName: "",
      bestBookIntent,
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
      bestBookIntent,
    };
  }

  return {
    intent: "BOOK_RECOMMENDATION",
    topic: extractTopicFromQuery(query),
    authorName: "",
    bestBookIntent,
  };
}

function hasTopicEntity(query: string, preferredLanguage?: string): boolean {
  const normalized = normalizeText(query);
  if (!normalized) return false;
  const language = resolveAnchorLanguage(normalized, preferredLanguage);
  if (hasAnchorMatch(normalized, language)) return true;
  const topic = extractTopicFromQuery(normalized);
  if (!topic) return false;
  const topicTokens = tokenize(topic);
  if (topicTokens.length < 2) return false;
  // Prevent generic placeholders from bypassing clarification.
  if (topicTokens.every((token) => TOPIC_EXCLUDE_TERMS.has(token))) return false;
  return true;
}

function deriveCanonicalBookId(bookIdRaw: unknown): string | null {
  const bookId = String(bookIdRaw || "").trim();
  if (!bookId) return null;
  if (
    bookId.startsWith("fallback_") ||
    bookId.startsWith("topic_seed_") ||
    bookId.startsWith("ext_")
  ) {
    return null;
  }
  return bookId;
}

const BLOCKED_SIGNAL_VALUES = new Set([
  "",
  "uncategorized",
  "booktown librarian",
  "booktown catalog",
  "no verified books yet",
  "unknown",
]);

function isSignalEligibleSuggestion(record: Record<string, unknown>): boolean {
  const source = normalizeText(record.source);
  if (source === "fallback") return false;

  const title = normalizeText(record.title);
  if (!title || BLOCKED_SIGNAL_VALUES.has(title)) return false;

  const author = normalizeText(record.author);
  if (!author) return false;
  if (BLOCKED_SIGNAL_VALUES.has(author)) {
    return false;
  }

  const canonicalBookId = String(record.canonicalBookId || "").trim();
  if (!canonicalBookId) return false;
  const resolvedCanonicalId = deriveCanonicalBookId(canonicalBookId);
  if (!resolvedCanonicalId) return false;

  return true;
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

function isPreferredAuthorWorkTitle(title: string): boolean {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return false;
  if (DERIVATIVE_BOOK_TITLE_PATTERN.test(normalizedTitle)) return false;
  if (AUTHOR_COLLECTION_TITLE_PATTERN.test(normalizedTitle)) return false;
  return true;
}

function isExplanationEligibleBookCard(row: LibrarianBookCard): boolean {
  const bookId = String(row.bookId || "").trim();
  const title = normalizeText(row.title);
  const author = normalizeText(row.author);
  if (!bookId || bookId.startsWith("fallback_") || bookId.startsWith("topic_seed_")) return false;
  if (!title || BLOCKED_SIGNAL_VALUES.has(title)) return false;
  if (!author || BLOCKED_SIGNAL_VALUES.has(author)) return false;
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
  const cover = String(data.coverUrl || "").trim();

  return {
    id: docSnap.id,
    title,
    author,
    genres,
    rating,
    coverUrl: cover || undefined,
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

async function resolveDirectTitleCards(params: {
  normalizedQuery: string;
  anchor: CandidateBook | null;
  budget: UnifiedSearchBudget;
}): Promise<LibrarianBookCard[]> {
  const query = normalizeText(params.normalizedQuery);
  if (!query) return [];

  const cards: LibrarianBookCard[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: {
    id: string;
    title: string;
    author: string;
    coverUrl?: string;
    description?: string;
  }): void => {
    if (!isStrongDirectTitleMatch(query, candidate.title)) return;
    if (
      !isLikelyLiteraryCandidate({
        title: candidate.title,
        author: candidate.author,
        description: candidate.description,
      })
    ) {
      return;
    }
    const key = proposalKey(candidate.title, candidate.author);
    if (!key || seen.has(key)) return;
    seen.add(key);
    cards.push({
      bookId: candidate.id,
      title: candidate.title,
      author: candidate.author,
      ...(typeof candidate.coverUrl === "string" && candidate.coverUrl.trim().length > 0
        ? { coverUrl: candidate.coverUrl.trim() }
        : {}),
      short_reason: "A direct canonical match for your query and the strongest place to begin.",
    });
  };

  if (params.anchor) {
    pushCandidate(params.anchor);
  }
  if (cards.length > 0) {
    return cards.slice(0, 1);
  }

  const searchResponse = await unifiedSearchWithBudget({
    budget: params.budget,
    query: params.normalizedQuery,
    limit: 8,
    reason: "direct_title_resolution",
  });
  if (!searchResponse) return [];

  for (const result of searchResponse.results) {
    if (result.resultType !== "canonical") continue;
    const title = String(result.title || result.titleEn || "").trim();
    const author = String(
      result.authorEn || (Array.isArray(result.authors) && result.authors.length > 0 ? result.authors[0] : "")
    ).trim();
    const bookId = String(result.bookId || "").trim();
    if (!title || !author || !bookId) continue;
    pushCandidate({
      id: bookId,
      title,
      author,
      coverUrl: typeof result.coverUrl === "string" ? result.coverUrl : "",
      description: typeof result.description === "string" ? result.description : "",
    });
    if (cards.length >= 1) break;
  }

  return cards.slice(0, 1);
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

function normalizeProposalExplanation(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function normalizeProposalThemes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of value) {
    if (typeof row !== "string") continue;
    const theme = row.trim().slice(0, 40);
    if (!theme) continue;
    const key = normalizeText(theme);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(theme);
    if (out.length >= 5) break;
  }
  return out;
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
  const candidateRows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { candidates?: unknown }).candidates)
    ? (payload as { candidates: unknown[] }).candidates
    : [];
  if (!Array.isArray(candidateRows)) return [];
  const out: ProposedBook[] = [];
  const seen = new Set<string>();
  for (const row of candidateRows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const title = normalizeProposalTitle(record.title);
    const author = normalizeProposalAuthor(record.author);
    const explanation = sanitizeShortReason(
      normalizeProposalExplanation(record.explanation),
      "A strong thematic fit for your request with a clear reading path."
    );
    const themes = normalizeProposalThemes(record.themes);
    if (!title || !author) continue;
    const key = proposalKey(title, author);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, author, explanation, themes });
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
  readerIntent: ReaderIntent;
  context: AgentContextSnapshot;
  memoryMessages: LibrarianMemoryMessage[];
  anchorTitle: string;
  anchorAuthor: string;
  requestedAuthor: string;
  excludedKeys: string[];
  failedCandidates: string[];
}): string {
  const contextSummary = summarizeContextForProposal(params.context);
  const memorySummary = formatConversationMemory(params.memoryMessages);
  const intentGuidance = readerIntentPromptGuidance(params.readerIntent);
  const exclusions =
    params.excludedKeys.length > 0
      ? `Do not repeat these title|author keys: ${params.excludedKeys.join(", ")}`
      : "No exclusions.";
  const failed =
    params.failedCandidates.length > 0
      ? `These failed verification in a prior pass, do not repeat: ${params.failedCandidates.join(" | ")}`
      : "No failed candidates from prior pass.";

  return [
    "You are a neighborhood librarian recommending books only.",
    "",
    "Return JSON only with this exact shape:",
    "{\"candidates\":[{\"title\":\"...\",\"author\":\"...\",\"explanation\":\"...\",\"themes\":[\"...\"]}]}",
    "",
    `Return between ${LIBRARIAN_MIN_LLM_CANDIDATES} and ${LIBRARIAN_MAX_LLM_CANDIDATES} candidate books.`,
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
    "- explanation must be exactly one sentence and avoid awards, rankings, or publication-year claims.",
    "- themes must contain 1 to 3 short topic strings.",
    "",
    `Mode: ${params.mode}`,
    `Reader intent: ${params.readerIntent}`,
    `Intent guidance: ${intentGuidance}`,
    `User query: ${params.normalizedQuery}`,
    `Recent conversation memory (last up to 6 messages): ${memorySummary}`,
    `Anchor title (if relevant): ${params.anchorTitle || "No anchor title resolved."}`,
    `Anchor author (if relevant): ${params.anchorAuthor || "No anchor author resolved."}`,
    `Requested author (if provided): ${params.requestedAuthor || "None"}`,
    `Structured context: ${JSON.stringify(contextSummary)}`,
    exclusions,
    failed,
    "",
    "Return JSON object only. No markdown.",
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
          console.log("[AI][LIBRARIAN][VERTEX_CALL_START]");
          try {
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
            console.log("[AI][LIBRARIAN][VERTEX_CALL_SUCCESS]");
            return { text: extractVertexResponseText(result) };
          } catch (error) {
            console.error("[AI][LIBRARIAN][VERTEX_CALL_FAILED]", error);
            throw error;
          }
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
  if (proposalClientSingleton) {
    return proposalClientSingleton;
  }
  const client = buildProposalClient();
  if (!client) {
    return null;
  }
  proposalClientSingleton = client;
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
    out.push({
      title,
      author,
      explanation: "A verified thematic match for your request with a clear reading path.",
      themes: [],
    });
    if (out.length >= LIBRARIAN_MAX_LLM_CANDIDATES) break;
  }
  return out;
}

async function generateCandidateBooks(params: {
  normalizedQuery: string;
  mode: LibrarianMode;
  readerIntent: ReaderIntent;
  context: AgentContextSnapshot;
  memoryMessages: LibrarianMemoryMessage[];
  anchor: CandidateBook | null;
  requestedAuthor: string;
  excludedKeys: string[];
  failedCandidates: string[];
  budget: UnifiedSearchBudget;
}): Promise<ProposedBook[]> {
  const prompt = truncatePromptToTokenLimit(
    buildProposalPrompt({
      normalizedQuery: params.normalizedQuery,
      mode: params.mode,
      readerIntent: params.readerIntent,
      context: params.context,
      memoryMessages: params.memoryMessages,
      anchorTitle: params.anchor?.title || "",
      anchorAuthor: params.anchor?.author || "",
      requestedAuthor: params.requestedAuthor,
      excludedKeys: params.excludedKeys,
      failedCandidates: params.failedCandidates,
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
            maxOutputTokens: 1600,
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

function updateWeight(
  target: Record<string, number>,
  key: string,
  amount = 1
): void {
  const normalizedKey = key.trim();
  if (!normalizedKey) return;
  target[normalizedKey] = (target[normalizedKey] || 0) + amount;
}

function detectKnownGenres(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const out = new Set<string>();
  for (const genre of KNOWN_GENRES) {
    const key = normalizeText(genre);
    if (!key) continue;
    if (normalized.includes(key)) {
      out.add(key);
    }
  }
  return Array.from(out);
}

function extractSignalThemeTokens(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const out = new Set<string>();
  for (const token of tokenize(normalized)) {
    if (token.length < 3) continue;
    if (SIGNAL_THEME_STOPWORDS.has(token)) continue;
    out.add(token);
    if (out.size >= 20) break;
  }
  return Array.from(out);
}

function normalizeWeightMap(input: Record<string, number>): Record<string, number> {
  const values = Object.values(input).filter((value) => Number.isFinite(value) && value > 0);
  if (values.length === 0) return {};
  const maxValue = Math.max(...values);
  if (!Number.isFinite(maxValue) || maxValue <= 0) return {};

  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!Number.isFinite(value) || value <= 0) continue;
    out[key] = clamp(value / maxValue, 0, 1);
  }
  return out;
}

async function fetchRecentSignalAffinity(uid: string): Promise<RecentSignalAffinity> {
  const empty: RecentSignalAffinity = {
    sampleCount: 0,
    authorWeights: {},
    genreWeights: {},
    themeWeights: {},
  };

  try {
    const snap = await db
      .collection("librarian_suggestions")
      .where("uid", "==", uid)
      .limit(20)
      .get();
    if (snap.empty) return empty;

    const sessions = snap.docs
      .map((docSnap) => {
        const createdAtRaw = docSnap.get("createdAt");
        const createdAt = createdAtRaw instanceof Timestamp ? createdAtRaw.toMillis() : 0;
        const normalizedQuery = normalizeText(docSnap.get("normalizedQuery"));
        const booksRaw = docSnap.get("books");
        const books = Array.isArray(booksRaw) ? booksRaw.slice(0, 6) : [];
        return { createdAt, normalizedQuery, books };
      })
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);

    const authorWeightsRaw: Record<string, number> = {};
    const genreWeightsRaw: Record<string, number> = {};
    const themeWeightsRaw: Record<string, number> = {};

    for (const session of sessions) {
      for (const genre of detectKnownGenres(session.normalizedQuery)) {
        updateWeight(genreWeightsRaw, genre, 1);
      }
      for (const token of extractSignalThemeTokens(session.normalizedQuery)) {
        updateWeight(themeWeightsRaw, token, 1);
      }

      for (const row of session.books) {
        if (!row || typeof row !== "object") continue;
        const record = row as Record<string, unknown>;
        if (!isSignalEligibleSuggestion(record)) continue;
        const author = normalizeText(record.author);
        if (author) {
          updateWeight(authorWeightsRaw, author, 1);
        }
        const shortReason = typeof record.short_reason === "string" ? record.short_reason : "";
        for (const genre of detectKnownGenres(shortReason)) {
          updateWeight(genreWeightsRaw, genre, 0.5);
        }
        for (const token of extractSignalThemeTokens(shortReason)) {
          updateWeight(themeWeightsRaw, token, 0.5);
        }
      }
    }

    return {
      sampleCount: sessions.length,
      authorWeights: normalizeWeightMap(authorWeightsRaw),
      genreWeights: normalizeWeightMap(genreWeightsRaw),
      themeWeights: normalizeWeightMap(themeWeightsRaw),
    };
  } catch (error) {
    logger.warn("[AI][LIBRARIAN][SIGNAL_FETCH_FAILED]", {
      uid,
      error: String(error),
    });
    return empty;
  }
}

function computeSignalRankingBias(params: {
  candidate: VerifiedBook;
  affinity: RecentSignalAffinity;
}): number {
  if (params.affinity.sampleCount === 0) return 0;

  let boost = 0;

  const authorKey = normalizeText(params.candidate.author);
  const authorBoost = params.affinity.authorWeights[authorKey] || 0;
  boost += authorBoost * 0.07;

  let genreBoost = 0;
  for (const genre of params.candidate.genres) {
    const key = normalizeText(genre);
    if (!key) continue;
    genreBoost = Math.max(genreBoost, params.affinity.genreWeights[key] || 0);
  }
  boost += genreBoost * 0.08;

  const themeText = [
    params.candidate.title,
    params.candidate.author,
    params.candidate.genres.join(" "),
    params.candidate.proposedExplanation || "",
  ].join(" ");
  let themeBoost = 0;
  for (const token of extractSignalThemeTokens(themeText)) {
    themeBoost = Math.max(themeBoost, params.affinity.themeWeights[token] || 0);
  }
  boost += themeBoost * 0.05;

  return clamp(boost, 0, 0.2);
}

function computeCanonicalAnchorBoost(params: {
  candidate: VerifiedBook;
  readerIntent: ReaderIntent;
}): number {
  const authorKey = normalizeText(params.candidate.author);
  const titleKey = normalizeText(params.candidate.title);
  const movementText = normalizeText(
    [...params.candidate.genres, ...(params.candidate.proposedThemes || [])].join(" ")
  );

  let boost = 0;
  if (authorKey && CANONICAL_AUTHOR_LOOKUP.has(authorKey)) {
    boost += CANONICAL_AUTHOR_BOOST;
  }
  if (titleKey && CANONICAL_BOOK_LOOKUP.has(titleKey)) {
    boost += CANONICAL_TITLE_BOOST;
  }
  if (CANONICAL_MOVEMENT_LOOKUP.some((movement) => movementText.includes(movement))) {
    boost += CANONICAL_MOVEMENT_BOOST;
  }

  // Keep canonical boost supplemental and non-dominant.
  const capped = Math.min(boost, 0.099);
  if (params.readerIntent === "CANONICAL_WORKS" || params.readerIntent === "AUTHOR_EXPLORATION") {
    return capped;
  }
  return capped * 0.85;
}

function jaccardSimilarity(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) intersection += 1;
  }
  if (intersection === 0) return 0;
  const union = leftSet.size + rightSet.size - intersection;
  if (union <= 0) return 0;
  return clamp(intersection / union, 0, 1);
}

function normalizeThemeList(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => normalizeText(value))
    .filter((value) => value.length > 0)
    .slice(0, 6);
}

function computeDiversitySimilarity(
  candidate: RankedLibrarianBookCard,
  selected: RankedLibrarianBookCard
): number {
  const candidateAuthor = normalizeText(candidate.author);
  const selectedAuthor = normalizeText(selected.author);
  const authorSimilarity = candidateAuthor && selectedAuthor && candidateAuthor === selectedAuthor ? 1 : 0;

  const candidateGenres = (candidate.diversityGenres || [])
    .map((value) => normalizeText(value))
    .filter((value) => value.length > 0);
  const selectedGenres = (selected.diversityGenres || [])
    .map((value) => normalizeText(value))
    .filter((value) => value.length > 0);
  const genreSimilarity = jaccardSimilarity(candidateGenres, selectedGenres);

  const candidateThemes = normalizeThemeList(candidate.diversityThemes);
  const selectedThemes = normalizeThemeList(selected.diversityThemes);
  const themeSimilarity = jaccardSimilarity(candidateThemes, selectedThemes);

  // Author overlap is strongest penalty; genre/theme add medium penalties.
  return clamp(Math.max(authorSimilarity, genreSimilarity * 0.6 + themeSimilarity * 0.5), 0, 1);
}

function applyDiversityRerank(
  rankedCandidates: RankedLibrarianBookCard[],
  finalSelectionSize: number
): RankedLibrarianBookCard[] {
  const safeFinalSize = Math.max(1, Math.min(finalSelectionSize, LIBRARIAN_MMR_SELECTION_SIZE));
  if (rankedCandidates.length <= safeFinalSize) {
    return rankedCandidates.slice(0, safeFinalSize);
  }

  const pool = rankedCandidates.slice(0, Math.min(LIBRARIAN_MMR_POOL_SIZE, rankedCandidates.length));
  if (pool.length < safeFinalSize) {
    return pool;
  }

  const selected: RankedLibrarianBookCard[] = [pool[0]];
  const remaining = pool.slice(1);

  while (selected.length < safeFinalSize && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      let maxSimilarity = 0;
      for (const picked of selected) {
        maxSimilarity = Math.max(maxSimilarity, computeDiversitySimilarity(candidate, picked));
      }
      const mmrScore =
        LIBRARIAN_MMR_LAMBDA * candidate.relevanceScore -
        (1 - LIBRARIAN_MMR_LAMBDA) * maxSimilarity;

      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIndex = i;
        continue;
      }

      if (Math.abs(mmrScore - bestScore) <= 1e-9) {
        const currentBest = remaining[bestIndex];
        if (deterministicSort(candidate, currentBest) < 0) {
          bestIndex = i;
        }
      }
    }

    selected.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  return selected;
}

function toPublicCard(row: RankedLibrarianBookCard): LibrarianBookCard {
  return {
    bookId: row.bookId,
    title: row.title,
    author: row.author,
    ...(typeof row.coverUrl === "string" && row.coverUrl.trim().length > 0
      ? { coverUrl: row.coverUrl.trim() }
      : {}),
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

function dedupeBooksByTitle<T extends { title: string }>(rows: T[]): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = normalizeText(row.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function dedupeAuthorCards(rows: LibrarianAuthorCard[]): LibrarianAuthorCard[] {
  const out: LibrarianAuthorCard[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const key = normalizeText(row.name);
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
  const maxBooks = Math.max(2, Math.min(params.maxBooks ?? 5, LIBRARIAN_LIMITS.MAX_BOOKS));
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
  const maxBooks = Math.max(2, Math.min(params.maxBooks ?? 5, LIBRARIAN_LIMITS.MAX_BOOKS));
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

function resolveTopicAnchorKey(normalizedQuery: string, topic: string): string {
  const haystack = `${normalizeText(topic)} ${normalizeText(normalizedQuery)}`.trim();
  if (!haystack) return "";
  for (const key of Object.keys(TOPIC_CANONICAL_ANCHORS)) {
    if (haystack.includes(key)) return key;
  }
  return "";
}

async function resolveCanonicalTopicAnchorCards(params: {
  normalizedQuery: string;
  topic: string;
  budget: UnifiedSearchBudget;
  maxBooks?: number;
}): Promise<LibrarianBookCard[]> {
  const maxBooks = Math.max(3, Math.min(params.maxBooks ?? 5, LIBRARIAN_LIMITS.MAX_BOOKS));
  const anchorKey = resolveTopicAnchorKey(params.normalizedQuery, params.topic);
  if (!anchorKey) return [];

  const anchors = TOPIC_CANONICAL_ANCHORS[anchorKey] || [];
  if (anchors.length === 0) return [];

  const docs = await Promise.all(
    anchors.map(async (anchor) => {
      const titleKey = normalizeText(anchor.title);
      const snap = await db
        .collection("books")
        .where("normalizedTitle", "==", titleKey)
        .limit(12)
        .get();
      return { anchor, docs: snap.docs };
    })
  );

  const cards: LibrarianBookCard[] = [];
  const seen = new Set<string>();
  for (const row of docs) {
    const matched = row.docs
      .map((docSnap) => normalizeCandidate(docSnap))
      .filter((candidate): candidate is CandidateBook => candidate !== null)
      .filter((candidate) => authorMatchScore(candidate.author, row.anchor.author) >= 0.72)
      .sort(deterministicCandidateSort);
    const first = matched[0];
    if (!first) continue;
    const key = proposalKey(first.title, first.author);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cards.push({
      bookId: first.id,
      title: first.title,
      author: first.author,
      ...(typeof first.coverUrl === "string" && first.coverUrl.trim().length > 0
        ? { coverUrl: first.coverUrl.trim() }
        : {}),
      short_reason: toKnowledgeReason(anchorKey),
    });
    if (cards.length >= maxBooks) break;
  }

  if (cards.length >= Math.min(3, maxBooks)) {
    return dedupeCards(cards).slice(0, maxBooks);
  }

  for (const anchor of anchors) {
    if (cards.length >= maxBooks) break;
    const alreadyResolved = cards.some(
      (row) =>
        normalizeText(row.title) === normalizeText(anchor.title) &&
        authorMatchScore(row.author, anchor.author) >= 0.72
    );
    if (alreadyResolved) continue;

    // eslint-disable-next-line no-await-in-loop
    const searchResponse = await unifiedSearchWithBudget({
      budget: params.budget,
      query: `${anchor.title} ${anchor.author}`.trim(),
      limit: 8,
      reason: "topic_anchor_exact_resolution",
    });
    if (!searchResponse) continue;

    for (const row of searchResponse.results) {
      const title = String(row.title || row.titleEn || "").trim();
      const author = String(
        row.authorEn || (Array.isArray(row.authors) && row.authors.length > 0 ? row.authors[0] : "")
      ).trim();
      if (!title || !author) continue;
      if (normalizeText(title) !== normalizeText(anchor.title)) continue;
      if (authorMatchScore(author, anchor.author) < 0.72) continue;
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
        ...(typeof row.coverUrl === "string" && row.coverUrl.trim().length > 0
          ? { coverUrl: row.coverUrl.trim() }
          : {}),
        short_reason: toKnowledgeReason(anchorKey),
      });
      break;
    }
  }

  return dedupeCards(cards).slice(0, maxBooks);
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
  const authorTokens = tokenize(authorNorm).slice(0, 10);
  const canonicalQueries = [
    db.collection("books")
      .where("authorNamesNormalized", "array-contains", authorNorm)
      .limit(30)
      .get(),
  ];
  if (authorTokens.length > 0) {
    canonicalQueries.push(
      db.collection("books")
        .where("search.tokens", "array-contains-any", authorTokens)
        .limit(30)
        .get()
    );
  }

  const canonicalSnapshots = await Promise.all(canonicalQueries);
  const canonicalMerged = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  for (const snap of canonicalSnapshots) {
    for (const docSnap of snap.docs) {
      if (!canonicalMerged.has(docSnap.id)) canonicalMerged.set(docSnap.id, docSnap);
    }
  }

  const canonicalCards = Array.from(canonicalMerged.values())
    .map((docSnap) => {
      const candidate = normalizeCandidate(docSnap);
      if (!candidate) return null;
      if (authorMatchScore(candidate.author, authorName) < 0.75) return null;
      if (!isLikelyLiteraryCandidate({ title: candidate.title, author: candidate.author })) return null;
      if (!isPreferredAuthorWorkTitle(candidate.title)) return null;
      const publicationYearRaw = Number(docSnap.get("publicationYear") || 0);
      const publicationYear =
        Number.isFinite(publicationYearRaw) && publicationYearRaw > 0
          ? Math.trunc(publicationYearRaw)
          : 9999;
      return {
        publicationYear,
        card: {
          bookId: candidate.id,
          title: candidate.title,
          author: candidate.author,
          ...(typeof candidate.coverUrl === "string" && candidate.coverUrl.trim().length > 0
            ? { coverUrl: candidate.coverUrl.trim() }
            : {}),
          short_reason: `A key work by ${authorName} with strong literary relevance.`,
        } satisfies LibrarianBookCard,
      };
    })
    .filter((row): row is { publicationYear: number; card: LibrarianBookCard } => row !== null)
    .sort((a, b) => {
      if (a.publicationYear !== b.publicationYear) return a.publicationYear - b.publicationYear;
      const titleCmp = a.card.title.localeCompare(b.card.title);
      if (titleCmp !== 0) return titleCmp;
      return a.card.bookId.localeCompare(b.card.bookId);
    })
    .map((row) => row.card);

  if (canonicalCards.length >= 3) {
    return dedupeCards(canonicalCards).slice(0, maxBooks);
  }

  const searchQueries = [`books by ${authorName}`, `${authorName} novels`, `${authorName} books`];
  const cards: LibrarianBookCard[] = [...canonicalCards];
  const seen = new Set<string>();
  for (const row of canonicalCards) {
    const key = proposalKey(row.title, row.author);
    if (key) seen.add(key);
  }

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
      if (!isPreferredAuthorWorkTitle(title)) continue;
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

  return dedupeCards(cards).slice(0, maxBooks);
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
  context: AgentContextSnapshot;
  recentSignalAffinity?: RecentSignalAffinity | null;
  disagreement?: {
    requestedTitle: string;
    strongerTitle: string;
    strongerAuthor: string;
  } | null;
}): Promise<string> {
  const fallbackByIntent =
    params.intent === "out_of_scope"
      ? "I cannot answer real-time questions directly, but I can help you approach that topic through books."
      : params.intent === "clarification"
      ? "I can tailor recommendations precisely once you share one author, title, or theme."
      : "These books speak directly to your question and open a strong reading path.";

  if (params.intent === "out_of_scope" || params.intent === "clarification") {
    return sanitizeConversationExplanation(fallbackByIntent, fallbackByIntent);
  }

  if (params.disagreement) {
    const requestedTitle = params.disagreement.requestedTitle.trim();
    const strongerTitle = params.disagreement.strongerTitle.trim();
    const strongerAuthor = params.disagreement.strongerAuthor.trim();
    const respectfulDisagreement = strongerAuthor
      ? `While ${requestedTitle} is widely known, ${strongerTitle} by ${strongerAuthor} is usually a stronger starting point for this reading direction.`
      : `While ${requestedTitle} is widely known, ${strongerTitle} is usually a stronger starting point for this reading direction.`;
    return sanitizeConversationExplanation(respectfulDisagreement, fallbackByIntent);
  }

  const favoriteGenres = (params.context.genres.topGenres || [])
    .map((row) => String(row?.name || "").trim())
    .filter((row) => row.length > 0 && !BLOCKED_SIGNAL_VALUES.has(normalizeText(row)))
    .slice(0, 2);
  const dominantGenre = params.context.genres.dominantGenre.trim();
  if (
    favoriteGenres.length === 0 &&
    dominantGenre.length > 0 &&
    !BLOCKED_SIGNAL_VALUES.has(normalizeText(dominantGenre))
  ) {
    favoriteGenres.push(dominantGenre);
  }
  const favoriteAuthorsRaw = Object.entries(params.recentSignalAffinity?.authorWeights || {})
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([author]) => author.trim())
    .filter((author) => author.length > 0 && !BLOCKED_SIGNAL_VALUES.has(normalizeText(author)));
  const eligibleBooks = params.books.filter((row) => isExplanationEligibleBookCard(row));
  const favoriteAuthorDisplay = favoriteAuthorsRaw
    .map((author) => {
      const matched = eligibleBooks.find((row) => normalizeText(row.author) === author);
      return matched?.author?.trim() || author;
    })
    .find((author) => author.length > 0) || "";

  const topBooks = eligibleBooks
    .slice(0, 2)
    .map((row) => row.title.trim())
    .filter((row) => row.length > 0);
  if (topBooks.length === 0) {
    return sanitizeConversationExplanation("", fallbackByIntent);
  }

  const preferredGenre = favoriteGenres[0] || "";
  if (favoriteAuthorDisplay && preferredGenre) {
    return sanitizeConversationExplanation(
      `Since you often gravitate toward ${favoriteAuthorDisplay} and ${preferredGenre}, ${topBooks.join(" and ")} should resonate with your reading direction.`,
      fallbackByIntent
    );
  }
  if (favoriteAuthorDisplay) {
    return sanitizeConversationExplanation(
      `Since your recent reading leans toward ${favoriteAuthorDisplay}, ${topBooks.join(" and ")} should feel like a natural next step.`,
      fallbackByIntent
    );
  }
  if (preferredGenre) {
    return sanitizeConversationExplanation(
      `Because your profile leans toward ${preferredGenre}, ${topBooks.join(" and ")} offer a strong next reading path.`,
      fallbackByIntent
    );
  }

  const authorFocus =
    params.authorCards[0]?.name?.trim() ||
    eligibleBooks[0]?.author?.trim() ||
    "";
  const explanation = authorFocus
    ? `If you are exploring ${authorFocus}, ${topBooks.join(" and ")} make a strong starting path for this request.`
    : `${topBooks.join(" and ")} make a strong starting path for this request.`;
  return sanitizeConversationExplanation(explanation, fallbackByIntent);
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
        coverUrl: typeof record.coverUrl === "string" ? record.coverUrl : "",
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
    .map((row) => ({
      ...row,
      ...(row.coverUrl.trim().length > 0 ? { coverUrl: row.coverUrl.trim() } : {}),
    }))
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
      canonicalBookId: deriveCanonicalBookId(row.bookId),
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
  memoryMessages: LibrarianMemoryMessage[];
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

  const memoryMessages = sanitizeMemoryMessages(input.messages);
  const tokenEstimate = approximateTokens(
    JSON.stringify({
      normalizedQuery,
      intent: input.intent,
      messages: memoryMessages,
    })
  );
  if (tokenEstimate > LIBRARIAN_LIMITS.TOKEN_LIMIT_INPUT) {
    return { ok: false, reason: "INVALID_REQUEST:token_limit_input" };
  }

  return { ok: true, normalizedQuery, memoryMessages };
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
  if ("reason" in validation) {
    throw new Error(validation.reason);
  }

  const normalizedUid = normalizeUid(params.uid);
  if (!normalizedUid) {
    throw new Error("INVALID_REQUEST");
  }

  const deterministicIntent = classifyLibrarianIntent(validation.normalizedQuery);
  const readerIntent = classifyReaderIntent(validation.normalizedQuery);
  const intentClassification: IntentClassification = {
    intent: deterministicIntent.intent,
    topic: deterministicIntent.topic,
    authorName: deterministicIntent.authorName,
    bestBookIntent: deterministicIntent.bestBookIntent,
  };
  const conversationalIntent: LibrarianConversationIntent = mapScopeIntentToConversationIntent(
    intentClassification.intent
  );
  const explicitRoutingLocked = intentClassification.intent !== "BOOK_RECOMMENDATION";
  const followUpQuestion =
    "Share one author, one title you loved, or a specific theme and I will refine precisely.";
  const intentConfidence = 0.72;

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
  const unifiedSearchBudget: UnifiedSearchBudget = {
    used: 0,
    limit: LIBRARIAN_MAX_UNIFIED_SEARCH_CALLS,
  };
  const classifiedTopic = intentClassification.topic.trim();
  const directTitleCards =
    !requestedAuthor &&
    !classifiedTopic &&
    isDirectTitleStyleQuery(validation.normalizedQuery)
      ? await resolveDirectTitleCards({
          normalizedQuery: validation.normalizedQuery,
          anchor,
          budget: unifiedSearchBudget,
        })
      : [];
  const needsClarification =
    !explicitRoutingLocked &&
    !requestedAuthor &&
    !classifiedTopic &&
    !anchor &&
    directTitleCards.length === 0 &&
    isGenericClarificationQuery(validation.normalizedQuery);
  const queryTokens = tokenize(validation.normalizedQuery);
  let explanationSignalAffinity: RecentSignalAffinity | null = null;
  const excludedProposalKeys = new Set<string>();
  logger.info("[AI][LIBRARIAN][READER_INTENT]", {
    readerIntent,
  });

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
      suppressAuthorRecommendations?: boolean;
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
    const minRecommendationsRaw = Math.max(
      0,
      Math.min(options.minRecommendations ?? LIBRARIAN_DEFAULT_SELECTION_COUNT, LIBRARIAN_LIMITS.MAX_BOOKS)
    );
    const minRecommendations =
      allowCardFallback && minRecommendationsRaw > 0
        ? Math.max(3, minRecommendationsRaw)
        : minRecommendationsRaw;

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
    let attributedRecommendations = attachSuggestionAttribution({
      recommendations,
      mode: options.suggestionMode ?? mode,
      suggestionSessionId,
    });
    attributedRecommendations = dedupeBooksByTitle(attributedRecommendations)
      .slice(0, LIBRARIAN_LIMITS.MAX_BOOKS)
      .map((row, index) => ({
        ...row,
        rankPosition: index + 1,
      }));

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

    let authorRecommendations: LibrarianAuthorCard[] = [];
    if (!options.suppressAuthorRecommendations) {
      authorRecommendations = await buildAuthorRecommendations({
        normalizedQuery: validation.normalizedQuery,
        authorName: options.authorName || intentClassification.authorName,
        intent: options.intent,
        books: attributedRecommendations,
      });
      authorRecommendations = dedupeAuthorCards(authorRecommendations);
      if (attributedRecommendations.length >= 3) {
        authorRecommendations = [];
      } else if (attributedRecommendations.length > 0) {
        authorRecommendations = authorRecommendations
          .filter((row) => row.verification.source !== "internal")
          .slice(0, 2);
      } else {
        authorRecommendations = authorRecommendations.slice(0, 2);
      }
    }
    const requestedAnchorTitle = anchor?.title?.trim() || "";
    const topRecommendation = attributedRecommendations[0];
    const disagreementContext =
      options.intent === "book_recommendation" &&
      intentClassification.bestBookIntent &&
      requestedAnchorTitle.length > 0 &&
      topRecommendation &&
      normalizeText(topRecommendation.title) !== normalizeText(requestedAnchorTitle)
        ? {
            requestedTitle: requestedAnchorTitle,
            strongerTitle: topRecommendation.title,
            strongerAuthor: topRecommendation.author,
          }
        : null;
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
          context: params.context,
          recentSignalAffinity: explanationSignalAffinity,
          disagreement: disagreementContext,
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

    if (authorWorks.length >= 3) {
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

  const topicEntity = classifiedTopic || extractTopicFromQuery(validation.normalizedQuery);
  const topicAnchorCards = await resolveCanonicalTopicAnchorCards({
    normalizedQuery: validation.normalizedQuery,
    topic: topicEntity,
    budget: unifiedSearchBudget,
    maxBooks: LIBRARIAN_LIMITS.MAX_BOOKS,
  });
  if (topicAnchorCards.length >= 3) {
    return finalizeAndReturn(topicAnchorCards, {
      fromCache: false,
      remainingQuota: quota.remaining,
      intent: "theme_request",
      suggestionMode: mode,
      minRecommendations: 3,
      fallbackQuery: validation.normalizedQuery,
      fallbackReason: "topic_anchor_finalize",
      fallbackShortReason: toKnowledgeReason(topicEntity),
      confidence: Math.max(intentConfidence, 0.78),
      verifiedCount: topicAnchorCards.length,
      candidateCount: topicAnchorCards.length,
      authorName: intentClassification.authorName,
      });
  }

  if (directTitleCards.length > 0) {
    const directTitle = directTitleCards[0];
    return finalizeAndReturn(directTitleCards, {
      fromCache: false,
      remainingQuota: quota.remaining,
      intent: "book_recommendation",
      suggestionMode: "HighConfidencePrecision",
      minRecommendations: 1,
      allowCardFallback: false,
      suppressAuthorRecommendations: true,
      explanationOverride: `If you are looking for ${directTitle.title}, that is the direct match and the strongest place to begin.`,
      confidence: Math.max(intentConfidence, 0.84),
      verifiedCount: directTitleCards.length,
      candidateCount: directTitleCards.length,
      fallbackReason: "direct_title_match",
    });
  }

  const preferredLanguage =
    typeof params.request.uiLanguage === "string" ? params.request.uiLanguage : undefined;
  const normalizedForClarity = normalizeText(validation.normalizedQuery);
  const detectedAuthorEntity = detectAuthorEntity(normalizedForClarity);
  const detectedTopicEntity = hasTopicEntity(normalizedForClarity, preferredLanguage);
  const shouldRunClarityDetector =
    normalizedForClarity.split(/\s+/).filter((token) => token.length > 0).length >= 3 &&
    hasTermFromSet(normalizedForClarity, BOOK_CONTEXT_TERMS);
  if (
    shouldRunClarityDetector &&
    !detectedAuthorEntity &&
    !detectedTopicEntity &&
    !isQueryClear({
      normalizedQuery: validation.normalizedQuery,
      preferredLanguage,
    })
  ) {
    const clarityLanguage = resolveAnchorLanguage(normalizedForClarity, preferredLanguage);
    logger.info("[AI][LIBRARIAN][CLARITY_GATE]", {
      query: validation.normalizedQuery,
      language: clarityLanguage,
      reason: "no_anchor_detected",
      timestamp: new Date().toISOString(),
    });
    const clarificationQuestion = buildClarificationFollowUpQuestion({
      normalizedQuery: validation.normalizedQuery,
      preferredLanguage,
    });
    return finalizeAndReturn([], {
      fromCache: false,
      remainingQuota: quota.remaining,
      intent: "clarification",
      suggestionMode: mode,
      minRecommendations: 0,
      allowCardFallback: false,
      needsClarification: true,
      followUpQuestion: clarificationQuestion,
      explanationOverride:
        "I can tailor this much better once you share one genre, one author, or a clear reading theme.",
      confidence: Math.min(intentConfidence, 0.68),
      verifiedCount: 0,
      candidateCount: 0,
      authorName: intentClassification.authorName,
      fallbackReason: "clarity_detector_pre_llm",
    });
  }

  const verifiedPool: VerifiedBook[] = [];
  const failedCandidates: string[] = [];
  let regenerationCount = 0;

  for (let attempt = 0; attempt <= LIBRARIAN_MAX_REGENERATION_ATTEMPTS; attempt += 1) {
    const proposals = await generateCandidateBooks({
      normalizedQuery: validation.normalizedQuery,
      mode,
      readerIntent,
      context: params.context,
      memoryMessages: validation.memoryMessages,
      anchor,
      requestedAuthor,
      excludedKeys: Array.from(excludedProposalKeys),
      failedCandidates,
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
          const verified = await verifyProposedBook({
            proposal,
            normalizedQuery: validation.normalizedQuery,
            requiredAuthor: requestedAuthor || undefined,
            budget: unifiedSearchBudget,
          });
          if (verified) {
            const enriched: VerifiedBook = {
              ...verified,
              proposedExplanation: proposal.explanation,
              proposedThemes: proposal.themes,
            };
            return enriched;
          }
          failedCandidates.push(`${proposal.title} by ${proposal.author}`);
          return null;
        } catch (error) {
          logger.error("[AI][LIBRARIAN][VERIFICATION_FAILED]", {
            title: proposal.title,
            author: proposal.author,
            error: String(error),
          });
          failedCandidates.push(`${proposal.title} by ${proposal.author}`);
          return null;
        }
      })
    );

    verifiedPool.push(
      ...verifiedRows.filter((row): row is VerifiedBook => row !== null)
    );
    const uniqueVerified = dedupeVerifiedBooks(verifiedPool);
    if (uniqueVerified.length >= LIBRARIAN_LIMITS.MAX_BOOKS) {
      break;
    }
    if (attempt < LIBRARIAN_MAX_REGENERATION_ATTEMPTS) {
      regenerationCount += 1;
    }
  }

  const verified = dedupeVerifiedBooks(verifiedPool);
  const recentSignalAffinity = await fetchRecentSignalAffinity(normalizedUid);
  explanationSignalAffinity = recentSignalAffinity;
  if (recentSignalAffinity.sampleCount > 0) {
    logger.info("[AI][LIBRARIAN][SIGNAL_BIAS_CONTEXT]", {
      uid: normalizedUid,
      sampleCount: recentSignalAffinity.sampleCount,
      authorSignals: Object.keys(recentSignalAffinity.authorWeights).length,
      genreSignals: Object.keys(recentSignalAffinity.genreWeights).length,
      themeSignals: Object.keys(recentSignalAffinity.themeWeights).length,
    });
  }
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
      const signalBias = computeSignalRankingBias({
        candidate,
        affinity: recentSignalAffinity,
      });
      const canonicalAnchorBoost = computeCanonicalAnchorBoost({
        candidate,
        readerIntent,
      });
      const relevance = clamp(
        baseScore + sourceBoost + modeAdjustment + signalBias + canonicalAnchorBoost
      );
      const lowRated = candidate.rating !== null && candidate.rating < 3.5;
      const resolvedShortReason =
        sanitizeShortReason(
          candidate.proposedExplanation || "",
          candidate.sourceType === "canonical"
            ? buildShortReason({
                mode,
                dominantGenre,
                queryTokens,
                thematicOverlap,
                lowRated,
              })
            : "A strong thematic fit for your request with a clear reading path."
        );
      const short_reason =
        resolvedShortReason.trim().length > 0
          ? resolvedShortReason
          : "Verified book recommendation.";
      return {
        bookId: candidate.id,
        title: candidate.title,
        author: candidate.author,
        ...(typeof candidate.coverUrl === "string" && candidate.coverUrl.trim().length > 0
          ? { coverUrl: candidate.coverUrl.trim() }
          : {}),
        short_reason,
        mode,
        relevanceScore: round(relevance),
        diversityGenres: candidate.genres.slice(0, 6),
        diversityThemes: (candidate.proposedThemes || []).slice(0, 6),
      } satisfies RankedLibrarianBookCard;
    })
    .sort(deterministicSort);

  const selectedCount = Math.max(1, Math.min(LIBRARIAN_MMR_SELECTION_SIZE, scored.length));
  const limitedRanked = applyDiversityRerank(scored, selectedCount);
  const recommendations = limitedRanked.map((row) => toPublicCard(row));

  logger.info("[AI][LIBRARIAN][ORCHESTRATOR]", {
    proposalCount: excludedProposalKeys.size,
    verifiedCount: verified.length,
    selectedCount: recommendations.length,
    diversityPoolSize: Math.min(scored.length, LIBRARIAN_MMR_POOL_SIZE),
    diversityLambda: LIBRARIAN_MMR_LAMBDA,
    regenerationCount,
    mode,
    readerIntent,
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
