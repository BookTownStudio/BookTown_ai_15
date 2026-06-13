import type {
  AuthorRecommendationConfidence,
  AuthorRecommendationConfidenceBand,
  EligibleAuthorRecommendationCandidate,
} from "./types";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function band(score: number): AuthorRecommendationConfidenceBand {
  if (score >= 0.75) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function evidenceTrust(values: readonly { confidence: number }[]): number {
  if (values.length === 0) return 0;
  return clamp(Math.max(...values.map((value) => value.confidence)), 0, 1);
}

function cap(candidate: EligibleAuthorRecommendationCandidate): number {
  if (candidate.negativeAffinities.length > 0) return 0.55;
  if (candidate.directAffinities.length > 0 && candidate.rolledAffinities.length > 0) {
    return 0.9;
  }
  if (candidate.directAffinities.length > 0) return 0.74;
  return candidate.privacyTier === "private" ? 0.6 : 0.7;
}

export function generateAuthorRecommendationConfidence(
  candidate: EligibleAuthorRecommendationCandidate
): AuthorRecommendationConfidence {
  const directEvidenceTrust = evidenceTrust(candidate.directAffinities);
  const rolledEvidenceTrust = evidenceTrust(candidate.rolledAffinities);
  const evidenceDiversity = Math.min(
    1,
    new Set(candidate.evidence.map((item) => item.source)).size / 3
  );
  const lifecycleTrust = 1;
  const explanationCompleteness = candidate.evidence.length > 0 ? 1 : 0;
  const penalties =
    (candidate.negativeAffinities.length > 0 ? 0.15 : 0) +
    (candidate.privacyTier === "private" ? 0.05 : 0);
  const raw =
    0.4 * directEvidenceTrust +
    0.25 * rolledEvidenceTrust +
    0.15 * evidenceDiversity +
    0.1 * lifecycleTrust +
    0.1 * explanationCompleteness -
    penalties;
  const score = round(clamp(raw, 0, cap(candidate)));
  const confidenceBand = band(score);

  return {
    score,
    band: confidenceBand,
    rationale:
      confidenceBand === "high"
        ? "Evidence is strong and consistent."
        : confidenceBand === "medium"
          ? "Evidence supports this suggestion, with some limits."
          : "Evidence is limited or mixed.",
  };
}

