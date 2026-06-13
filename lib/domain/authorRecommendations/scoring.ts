import type {
  EligibleAuthorRecommendationCandidate,
  ScoredAuthorRecommendationCandidate,
} from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function affinityScore(values: readonly { confidence: number }[]): number {
  if (values.length === 0) return 0;
  return clamp(Math.max(...values.map((value) => value.confidence)), 0, 1);
}

function evidenceDiversity(candidate: EligibleAuthorRecommendationCandidate): number {
  const classes = new Set(candidate.evidence.map((item) => item.source));
  return clamp(classes.size / 3, 0, 1);
}

function recencyScore(candidate: EligibleAuthorRecommendationCandidate): number {
  const hasRecency = [...candidate.directAffinities, ...candidate.rolledAffinities].some(
    (affinity) => Boolean(affinity.recency)
  );
  return hasRecency ? 1 : 0.5;
}

function scoreCap(candidate: EligibleAuthorRecommendationCandidate): number {
  if (candidate.negativeAffinities.length > 0) return 0.6;
  if (candidate.directAffinities.length > 0 && candidate.rolledAffinities.length > 0) {
    return 0.95;
  }
  if (candidate.directAffinities.length > 0) return 0.8;
  return candidate.privacyTier === "private" ? 0.65 : 0.7;
}

export function scoreAuthorRecommendationCandidate(
  candidate: EligibleAuthorRecommendationCandidate
): ScoredAuthorRecommendationCandidate {
  const directAffinity = affinityScore(candidate.directAffinities);
  const rolledAffinity = affinityScore(candidate.rolledAffinities);
  const diversity = evidenceDiversity(candidate);
  const recency = recencyScore(candidate);
  const agreement =
    candidate.directAffinities.length > 0 && candidate.rolledAffinities.length > 0 ? 1 : 0;
  const negativePenalty = candidate.negativeAffinities.length > 0 ? 0.15 : 0;
  const privacyPenalty = candidate.privacyTier === "private" ? 0.03 : 0;
  const penalties = negativePenalty + privacyPenalty;
  const baseScore =
    0.45 * directAffinity +
    0.3 * rolledAffinity +
    0.1 * diversity +
    0.07 * recency +
    0.08 * agreement;
  const cap = scoreCap(candidate);

  return {
    candidate,
    baseScore: round(baseScore),
    finalScore: round(clamp(baseScore - penalties, 0, cap)),
    scoreCap: cap,
    components: {
      directAffinity,
      rolledAffinity,
      evidenceDiversity: diversity,
      recency,
      agreement,
      penalties,
    },
  };
}

