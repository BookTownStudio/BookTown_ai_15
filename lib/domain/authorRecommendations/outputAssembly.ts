import { ENTITY_PLATFORM_CONTRACT_VERSION } from "../../../contracts/entityPlatform";
import {
  AUTHOR_RECOMMENDATION_ENGINE_VERSION,
  type AuthorRecommendation,
  type AuthorRecommendationConfidence,
  type AuthorRecommendationConstraint,
  type AuthorRecommendationExplanation,
  type ScoredAuthorRecommendationCandidate,
} from "./types";
import { reasonForCandidate } from "./explanations";

const BASE_CONSTRAINTS: readonly AuthorRecommendationConstraint[] = [
  {
    constraintId: "author_recommendation:scope:author_only",
    constraintType: "scope",
    description: "Outputs are canonical Author recommendations only.",
    enforced: true,
  },
  {
    constraintId: "author_recommendation:authority:derived_intelligence",
    constraintType: "authority",
    description:
      "Outputs are derived intelligence and do not change entity, affinity, graph, identity, search, or MatchMaker truth.",
    enforced: true,
  },
  {
    constraintId: "author_recommendation:privacy:aggregate_evidence_only",
    constraintType: "privacy",
    description: "Raw private evidence is not exposed.",
    enforced: true,
  },
  {
    constraintId: "author_recommendation:safety:no_popularity_graph_search_single_work",
    constraintType: "safety",
    description:
      "Popularity-only, graph-only, search-only, display-name-only, and single-Work-only recommendations are forbidden.",
    enforced: true,
  },
];

export function assembleAuthorRecommendation(
  scored: ScoredAuthorRecommendationCandidate,
  confidence: AuthorRecommendationConfidence,
  explanation: AuthorRecommendationExplanation,
  generatedAt: string
): AuthorRecommendation | null {
  const candidate = scored.candidate;
  if (candidate.evidence.length === 0) return null;
  if (!explanation.summary.trim()) return null;
  if (candidate.authorRef.entityType !== "author") return null;
  if (candidate.authorRef.authorityState !== "canonical") return null;
  if (candidate.authorRef.authoritySource !== "author_authority") return null;

  return {
    metadata: {
      outputId: `${AUTHOR_RECOMMENDATION_ENGINE_VERSION}:output:${candidate.authorRef.entityId}`,
      outputType: "author_recommendation",
      contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
      generatedAt,
      provenance: {
        sourceClass: "system",
        sourceSystem: AUTHOR_RECOMMENDATION_ENGINE_VERSION,
        sourceId: candidate.authorRef.entityId,
      },
      privacyTier: candidate.privacyTier,
      sourceInputContractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    },
    targetAuthorRef: candidate.authorRef,
    targetSummary: candidate.summary,
    reason: reasonForCandidate(candidate),
    evidence: candidate.evidence,
    explanation,
    confidence,
    constraints: BASE_CONSTRAINTS,
  };
}

