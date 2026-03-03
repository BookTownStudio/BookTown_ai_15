import { createHash } from "crypto";
import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import type { AgentContextSnapshot } from "../intelligence/types";
import { enqueueIntelligenceSignal } from "../intelligence/signalQueue";
import { admin } from "../firebaseAdmin";

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

type CandidateBook = {
  id: string;
  title: string;
  author: string;
  genres: string[];
  rating: number | null;
};

type SelectionMode = LibrarianMode | "anchor";

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
}): LibrarianBookCard {
  const dominant = params.context.genres.dominantGenre || "Literary Fiction";
  return {
    bookId: "",
    title: "No precise catalog match",
    author: "BookTown Catalog",
    mode: params.mode,
    relevanceScore: round(clamp(params.context.indices.explorationIndex * 0.6 + 0.3)),
    short_reason:
      dominant
        ? `Your profile currently anchors on ${dominant}. Add one concrete title in your next message for a direct match.`
        : "Your profile is sparse right now. Add one concrete title in your next message for a direct match.",
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
  const selectionMode: SelectionMode = anchor ? "anchor" : mode;

  const anchorGenres = (anchor?.genres || []).filter((genre) => genre.trim().length > 0).slice(0, 3);

  const baseTopWeights = topGenreWeights(params.context);
  const hasProfileGenreSignals =
    Object.keys(baseTopWeights).length > 0 || params.context.genres.dominantGenre.trim().length > 0;
  const topWeights =
    !hasProfileGenreSignals && anchorGenres.length > 0
      ? Object.fromEntries(
          anchorGenres.map((genre, index) => [genre, round(clamp(1 - index * 0.15))])
        )
      : baseTopWeights;

  const quota = await consumeDailyQuota(normalizedUid);
  if (!quota.ok) {
    throw new Error("QUOTA_EXCEEDED");
  }

  const cache = await getCachedRecommendations({
    uid: normalizedUid,
    profileVersion: params.context.profileVersion,
    intent: params.request.intent,
    normalizedQuery: validation.normalizedQuery,
  });
  if (cache) {
    return {
      recommendations: cache,
      fromCache: true,
      remainingQuota: quota.remaining,
      normalizedQuery: validation.normalizedQuery,
    };
  }

  if (mode === "ReReadingReflection") {
    const reread = await findRereadCandidate(normalizedUid);
    if (reread) {
      const card: LibrarianBookCard = {
        bookId: reread.id,
        title: reread.title,
        author: reread.author,
        mode: "ReReadingReflection",
        relevanceScore: 0.84,
        short_reason:
          "This is a deliberate re-reading pick after a long interval, aimed at deeper reflection on a familiar text.",
      };
      await storeCachedRecommendations({
        uid: normalizedUid,
        profileVersion: params.context.profileVersion,
        intent: params.request.intent,
        normalizedQuery: validation.normalizedQuery,
        recommendations: [card],
      });
      await emitHomeFeedSignal({
        uid: normalizedUid,
        profileVersion: params.context.profileVersion,
        normalizedQuery: validation.normalizedQuery,
        recommendationCount: 1,
      });
      return {
        recommendations: [card],
        fromCache: false,
        remainingQuota: quota.remaining,
        normalizedQuery: validation.normalizedQuery,
      };
    }
  }

  const dominantGenre =
    params.context.genres.dominantGenre ||
    (!hasProfileGenreSignals && anchorGenres.length > 0 ? anchorGenres[0] : "");
  const topGenres = Object.keys(topWeights);

  const queryTokens = tokenize(validation.normalizedQuery);
  const candidateRows: CandidateBook[] = [];

  const selectedGenres = (() => {
    if (selectionMode === "anchor" && anchorGenres.length > 0) {
      return anchorGenres;
    }
    if (mode === "StructuredContrast" && dominantGenre) {
      const adjacent = new Set(GENRE_ADJACENCY[dominantGenre] || []);
      return KNOWN_GENRES.filter(
        (genre) => genre !== dominantGenre && !adjacent.has(genre)
      ).slice(0, 3);
    }
    if (mode === "AdjacentExpansion" && dominantGenre) {
      return (GENRE_ADJACENCY[dominantGenre] || []).slice(0, 3);
    }
    if (topGenres.length > 0) return topGenres.slice(0, 3);
    return [dominantGenre || "Literary Fiction"];
  })();

  candidateRows.push(...(await fetchGenreCandidates(selectedGenres, 40)));
  candidateRows.push(...(await fetchFallbackCandidates(90)));

  const seen = new Set<string>();
  const uniqueCandidates = candidateRows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });

  const scored = uniqueCandidates
    .map((candidate) => {
      const queryScore = lexicalSimilarity(queryTokens, candidate);
      const { alignment, thematicOverlap } = genreAlignmentScore(candidate.genres, topWeights);
      const scoreBase = alignment * 0.62 + queryScore * 0.38;
      const relevance = clamp(
        scoreBase + modeBonus(mode, candidate.genres, dominantGenre, queryScore)
      );
      const lowRated = candidate.rating !== null && candidate.rating < 3.5;
      if (
        lowRated &&
        !(
          alignment >= LIBRARIAN_LIMITS.STRONG_ALIGNMENT &&
          thematicOverlap >= LIBRARIAN_LIMITS.HIGH_THEMATIC_OVERLAP
        )
      ) {
        return null;
      }
      if (relevance < LIBRARIAN_LIMITS.LOW_ALIGNMENT_THRESHOLD) {
        return null;
      }
      const short_reason = buildShortReason({
        mode,
        dominantGenre,
        queryTokens,
        thematicOverlap,
        lowRated,
      });
      return {
        bookId: candidate.id,
        title: candidate.title,
        author: candidate.author,
        short_reason,
        mode,
        relevanceScore: round(relevance),
      } satisfies LibrarianBookCard;
    })
    .filter((row): row is LibrarianBookCard => row !== null)
    .sort(deterministicSort);

  const defaultCount =
    mode === "StructuredContrast" || mode === "ReReadingReflection"
      ? 1
      : LIBRARIAN_LIMITS.DEFAULT_BOOKS;
  const requestedCount =
    mode === "HighConfidencePrecision" && queryTokens.length >= 2
      ? LIBRARIAN_LIMITS.MAX_BOOKS
      : defaultCount;

  const limited = scored.slice(0, Math.max(1, Math.min(requestedCount, LIBRARIAN_LIMITS.MAX_BOOKS)));
  const recommendations =
    limited.length > 0
      ? limited
      : [buildFallbackCard({ context: params.context, mode })];

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
