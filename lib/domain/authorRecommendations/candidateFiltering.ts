import type {
  AuthorRecommendationCandidate,
  EligibleAuthorRecommendationCandidate,
} from "./types";

function hasValidSummary(candidate: AuthorRecommendationCandidate): boolean {
  return Boolean(
    candidate.summary &&
      candidate.summary.title.trim().length > 0 &&
      candidate.summary.ref.entityType === "author" &&
      candidate.summary.ref.entityId === candidate.authorRef.entityId
  );
}

export function filterAuthorRecommendationCandidates(
  candidates: readonly AuthorRecommendationCandidate[]
): readonly EligibleAuthorRecommendationCandidate[] {
  return candidates.filter((candidate): candidate is EligibleAuthorRecommendationCandidate => {
    if (candidate.authorRef.entityType !== "author") return false;
    if (candidate.authorRef.authorityState !== "canonical") return false;
    if (candidate.authorRef.authoritySource !== "author_authority") return false;
    if (!hasValidSummary(candidate)) return false;
    const positiveCount =
      candidate.directAffinities.length + candidate.rolledAffinities.length;
    if (positiveCount === 0) return false;
    if (candidate.negativeAffinities.length >= positiveCount) return false;
    if (candidate.evidence.length === 0) return false;
    return true;
  });
}

