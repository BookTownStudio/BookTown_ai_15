import type { MatchMakerInput } from "../../contracts/shared/entityPlatform/matchmaker";
import type { MatchMakerRecommendation } from "../../contracts/shared/entityPlatform/matchmakerOutputs";
import { generateMatchMakerV1Candidates } from "./candidateGeneration";
import { filterMatchMakerV1Candidates } from "./candidateFiltering";
import {
  calculateMatchMakerV1Confidence,
  withMatchMakerV1Confidence,
} from "./confidence";
import { buildMatchMakerV1Explanation } from "./explanations";
import {
  assembleMatchMakerV1Evidence,
  toMatchMakerV1Recommendation,
} from "./outputAssembly";
import {
  rankMatchMakerV1Candidates,
  scoreMatchMakerV1Candidate,
} from "./scoring";
import {
  MATCHMAKER_V1_DEFAULT_GENERATED_AT,
  MATCHMAKER_V1_LIMITS,
  type MatchMakerV1Options,
  type MatchMakerV1ResolvedOptions,
  type MatchMakerV1ScoredCandidate,
} from "./types";

export function runMatchMakerV1(
  input: MatchMakerInput,
  options?: MatchMakerV1Options
): readonly MatchMakerRecommendation[] {
  const resolvedOptions = resolveMatchMakerV1Options(options);
  const candidates = filterMatchMakerV1Candidates(
    generateMatchMakerV1Candidates(input),
    input
  );
  const scoredCandidates = candidates.map((candidate) => {
    const evidence = assembleMatchMakerV1Evidence(candidate);
    return scoreMatchMakerV1Candidate(candidate, evidence);
  });
  const confidenceApplied = scoredCandidates.map((scoredCandidate) => {
    const confidence = calculateMatchMakerV1Confidence(
      scoredCandidate,
      scoredCandidate.evidence
    );
    return withMatchMakerV1Confidence(scoredCandidate, confidence);
  });

  return rankMatchMakerV1Candidates(confidenceApplied)
    .slice(0, resolvedOptions.maxRecommendations)
    .map((scoredCandidate) =>
      recommendationFromScoredCandidate(scoredCandidate, resolvedOptions)
    );
}

function recommendationFromScoredCandidate(
  scoredCandidate: MatchMakerV1ScoredCandidate,
  options: MatchMakerV1ResolvedOptions
): MatchMakerRecommendation {
  const confidence =
    scoredCandidate.confidence ??
    calculateMatchMakerV1Confidence(scoredCandidate, scoredCandidate.evidence);
  const explanation = buildMatchMakerV1Explanation(
    scoredCandidate,
    scoredCandidate.evidence,
    confidence
  );
  return toMatchMakerV1Recommendation(
    scoredCandidate,
    scoredCandidate.evidence,
    confidence,
    explanation,
    options
  );
}

function resolveMatchMakerV1Options(
  options: MatchMakerV1Options | undefined
): MatchMakerV1ResolvedOptions {
  const requestedMax = options?.maxRecommendations;
  const maxRecommendations =
    typeof requestedMax === "number" && Number.isFinite(requestedMax)
      ? Math.max(
          0,
          Math.min(
            MATCHMAKER_V1_LIMITS.maxRecommendations,
            Math.floor(requestedMax)
          )
        )
      : MATCHMAKER_V1_LIMITS.defaultRecommendations;
  return {
    generatedAt: options?.generatedAt ?? MATCHMAKER_V1_DEFAULT_GENERATED_AT,
    maxRecommendations,
  };
}

export type { MatchMakerV1Options };

