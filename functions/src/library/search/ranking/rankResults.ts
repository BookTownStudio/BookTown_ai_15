// functions/src/library/search/ranking/rankResults.ts

import { ConfidenceResult } from "../confidence/computeConfidence";

/**
 * Minimal ranking surface.
 * Intentionally decoupled from transport DTOs.
 *
 * 🔒 B1.1 LOCK:
 * confidence.score === canonicalConfidence
 * - Server-computed
 * - Deterministic
 * - Stable across requests
 * - Never client-derived
 */
export type RankCandidate = {
  id: string;                       // stable internal id
  canonicalKey?: string;            // authoritative identity fallback
  confidence: ConfidenceResult;     // canonical confidence (B1.1)
  publishedYear?: number | null;    // recency signal
  ratingsCount?: number | null;     // popularity signal
  hasEbook?: boolean;               // capability fit
  sourcePriority: number;           // lower = better (deterministic tie-break)
};

/**
 * Ranking context allows controlled boosts
 * without branching logic in the sorter.
 */
export type RankingContext = {
  requireEbook?: boolean;           // capability-aware ordering
  currentYear?: number;             // injected for testability
};

/**
 * Compute a normalized recency score ∈ [0,1]
 * Penalizes very old editions without deleting them.
 */
function computeRecencyScore(
  publishedYear?: number | null,
  currentYear: number = new Date().getFullYear()
): number {
  if (!publishedYear) return 0;

  const age = Math.max(0, currentYear - publishedYear);

  // 0–10 years → strong boost
  if (age <= 10) return 1;

  // 10–30 years → linear decay
  if (age <= 30) return 1 - (age - 10) / 20;

  // >30 years → minimal signal (classics handled elsewhere)
  return 0.1;
}

/**
 * Popularity normalization.
 * Uses log scale to avoid domination by extreme counts.
 */
function computePopularityScore(ratingsCount?: number | null): number {
  if (!ratingsCount || ratingsCount <= 0) return 0;
  return Math.min(1, Math.log10(ratingsCount + 1) / 5);
}

/**
 * Composite ranking score.
 *
 * 🔒 WEIGHTS LOCKED (B1.x):
 * - Canonical confidence dominates
 * - Secondary signals refine, never override
 */
function computeCompositeScore(
  c: RankCandidate,
  ctx: RankingContext
): number {
  const recency = computeRecencyScore(
    c.publishedYear,
    ctx.currentYear
  );

  const popularity = computePopularityScore(c.ratingsCount);

  const capabilityBoost =
    ctx.requireEbook && c.hasEbook ? 0.15 : 0;

  return (
    // 1️⃣ Canonical authority (B1.1)
    c.confidence.score * 0.6 +
    // 2️⃣ Modernity signal
    recency * 0.2 +
    // 3️⃣ Social proof
    popularity * 0.15 +
    // 4️⃣ Capability fit (bounded boost)
    capabilityBoost
  );
}

/**
 * Deterministic ranking.
 *
 * Rules (LOCKED):
 * 1. Composite score (desc)
 * 2. Canonical confidence score (desc)
 * 3. Source priority (asc)
 * 4. Lexical canonicalKey (asc) — absolute stability
 */
export function rankResults<T extends RankCandidate>(
  candidates: T[],
  ctx: RankingContext = {}
): T[] {
  const scored = candidates.map((c) => ({
    candidate: c,
    score: computeCompositeScore(c, ctx),
  }));

  scored.sort((a, b) => {
    // 1. Composite score
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    // 2. Canonical confidence
    if (b.candidate.confidence.score !== a.candidate.confidence.score) {
      return (
        b.candidate.confidence.score -
        a.candidate.confidence.score
      );
    }

    // 3. Source priority
    if (
      a.candidate.sourcePriority !==
      b.candidate.sourcePriority
    ) {
      return (
        a.candidate.sourcePriority -
        b.candidate.sourcePriority
      );
    }

    // 4. Absolute deterministic fallback
    return (a.candidate.canonicalKey ?? "").localeCompare(
      b.candidate.canonicalKey ?? ""
    );
  });

  return scored.map((s) => s.candidate);
}
