import {
  AUTHOR_RECOMMENDATION_LIMITS,
  type AuthorRecommendation,
  type ScoredAuthorRecommendationCandidate,
} from "./types";

export function rankAuthorRecommendationCandidates(
  scored: readonly ScoredAuthorRecommendationCandidate[]
): readonly ScoredAuthorRecommendationCandidate[] {
  return [...scored].sort((left, right) => {
    if (right.finalScore !== left.finalScore) return right.finalScore - left.finalScore;
    const leftPattern =
      left.candidate.directAffinities.length > 0 && left.candidate.rolledAffinities.length > 0
        ? 3
        : left.candidate.directAffinities.length > 0
          ? 2
          : 1;
    const rightPattern =
      right.candidate.directAffinities.length > 0 && right.candidate.rolledAffinities.length > 0
        ? 3
        : right.candidate.directAffinities.length > 0
          ? 2
          : 1;
    if (rightPattern !== leftPattern) return rightPattern - leftPattern;
    if (left.candidate.negativeAffinities.length !== right.candidate.negativeAffinities.length) {
      return left.candidate.negativeAffinities.length - right.candidate.negativeAffinities.length;
    }
    if (left.candidate.evidence.length !== right.candidate.evidence.length) {
      return right.candidate.evidence.length - left.candidate.evidence.length;
    }
    return left.candidate.authorRef.entityId.localeCompare(right.candidate.authorRef.entityId);
  });
}

export function rankAuthorRecommendations(
  recommendations: readonly AuthorRecommendation[],
  maxResults: number = AUTHOR_RECOMMENDATION_LIMITS.defaultResults
): readonly AuthorRecommendation[] {
  const bounded = Math.min(
    AUTHOR_RECOMMENDATION_LIMITS.maxResults,
    Math.max(0, maxResults)
  );
  return recommendations.slice(0, bounded);
}
