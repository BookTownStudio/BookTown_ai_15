import type {
  AuthorRecommendationConfidence,
  AuthorRecommendationExplanation,
  AuthorRecommendationReason,
  EligibleAuthorRecommendationCandidate,
} from "./types";

export function reasonForCandidate(
  candidate: EligibleAuthorRecommendationCandidate
): AuthorRecommendationReason {
  if (candidate.directAffinities.length > 0 && candidate.rolledAffinities.length > 0) {
    return "direct_and_rolled_author_affinity";
  }
  if (candidate.directAffinities.length > 0) return "direct_author_affinity";
  return "rolled_author_affinity";
}

export function generateAuthorRecommendationExplanation(
  candidate: EligibleAuthorRecommendationCandidate,
  confidence: AuthorRecommendationConfidence
): AuthorRecommendationExplanation {
  const reason = reasonForCandidate(candidate);
  const summary =
    reason === "direct_and_rolled_author_affinity"
      ? `Recommended with ${confidence.band} confidence because direct author activity and repeated work-level activity both support this author.`
      : reason === "direct_author_affinity"
        ? `Recommended with ${confidence.band} confidence because you have direct activity with this author.`
        : `Recommended with ${confidence.band} confidence because repeated activity across several works by this author supports the suggestion.`;

  return {
    summary,
    evidenceSourceClasses: Array.from(
      new Set(candidate.evidence.map((item) => item.source))
    ).sort(),
    confidenceBand: confidence.band,
    confidenceRationale: confidence.rationale,
    privacyBoundary:
      "Only privacy-safe aggregate evidence classes are used in this explanation.",
    authorityBoundary:
      "This recommendation is derived intelligence and does not change canonical Author, affinity, graph, identity, search, or MatchMaker truth.",
    contradictionNote:
      candidate.negativeAffinities.length > 0
        ? "Some evidence is mixed, so confidence is limited."
        : undefined,
  };
}

