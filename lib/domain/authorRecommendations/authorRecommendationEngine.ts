import { generateAuthorRecommendationCandidates } from "./candidateGeneration";
import { filterAuthorRecommendationCandidates } from "./candidateFiltering";
import { generateAuthorRecommendationConfidence } from "./confidence";
import { generateAuthorRecommendationExplanation } from "./explanations";
import { assembleAuthorRecommendation } from "./outputAssembly";
import { rankAuthorRecommendationCandidates, rankAuthorRecommendations } from "./ranking";
import { scoreAuthorRecommendationCandidate } from "./scoring";
import type {
  AuthorRecommendation,
  AuthorRecommendationInput,
  AuthorRecommendationResult,
  ScoredAuthorRecommendationCandidate,
} from "./types";

function confidenceSort(value: AuthorRecommendation): number {
  if (value.confidence.band === "high") return 3;
  if (value.confidence.band === "medium") return 2;
  return 1;
}

function evidencePatternSort(scored: ScoredAuthorRecommendationCandidate): number {
  if (
    scored.candidate.directAffinities.length > 0 &&
    scored.candidate.rolledAffinities.length > 0
  ) {
    return 3;
  }
  if (scored.candidate.directAffinities.length > 0) return 2;
  return 1;
}

function recencySort(scored: ScoredAuthorRecommendationCandidate): string {
  return [...scored.candidate.directAffinities, ...scored.candidate.rolledAffinities]
    .map((affinity) => affinity.recency)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? "";
}

function rankAssembled(
  pairs: readonly {
    readonly scored: ScoredAuthorRecommendationCandidate;
    readonly recommendation: AuthorRecommendation;
  }[]
): readonly AuthorRecommendation[] {
  return [...pairs]
    .sort((left, right) => {
      if (right.scored.finalScore !== left.scored.finalScore) {
        return right.scored.finalScore - left.scored.finalScore;
      }
      const pattern = evidencePatternSort(right.scored) - evidencePatternSort(left.scored);
      if (pattern !== 0) return pattern;
      const confidence =
        confidenceSort(right.recommendation) - confidenceSort(left.recommendation);
      if (confidence !== 0) return confidence;
      if (
        left.scored.candidate.negativeAffinities.length !==
        right.scored.candidate.negativeAffinities.length
      ) {
        return (
          left.scored.candidate.negativeAffinities.length -
          right.scored.candidate.negativeAffinities.length
        );
      }
      if (left.recommendation.evidence.length !== right.recommendation.evidence.length) {
        return right.recommendation.evidence.length - left.recommendation.evidence.length;
      }
      const recency = recencySort(right.scored).localeCompare(recencySort(left.scored));
      if (recency !== 0) return recency;
      return left.recommendation.targetAuthorRef.entityId.localeCompare(
        right.recommendation.targetAuthorRef.entityId
      );
    })
    .map((pair) => pair.recommendation);
}

export function runAuthorRecommendationEngine(
  input: AuthorRecommendationInput
): AuthorRecommendationResult {
  const scored = rankAuthorRecommendationCandidates(
    filterAuthorRecommendationCandidates(
      generateAuthorRecommendationCandidates(input)
    ).map(scoreAuthorRecommendationCandidate)
  );
  const recommendations = rankAssembled(scored
    .map((candidate) => {
      const confidence = generateAuthorRecommendationConfidence(candidate.candidate);
      const explanation = generateAuthorRecommendationExplanation(
        candidate.candidate,
        confidence
      );
      const recommendation = assembleAuthorRecommendation(
        candidate,
        confidence,
        explanation,
        input.generatedAt
      );
      return recommendation ? { scored: candidate, recommendation } : null;
    })
    .filter((value): value is NonNullable<typeof value> => value !== null));

  return {
    recommendations: rankAuthorRecommendations(recommendations, input.maxResults),
  };
}
