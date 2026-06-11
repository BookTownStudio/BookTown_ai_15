import type {
  MatchMakerConfidence,
  MatchMakerEvidence,
  MatchMakerExplanation,
  MatchMakerReasonClass,
} from "../../../../contracts/entityPlatform/matchmakerOutputs";
import type { MatchMakerV1ScoredCandidate } from "./types";

export function buildMatchMakerV1Explanation(
  candidate: MatchMakerV1ScoredCandidate,
  evidence: readonly MatchMakerEvidence[],
  confidence: MatchMakerConfidence
): MatchMakerExplanation {
  const primaryReasonClass = primaryReasonFor(candidate);
  const reasonClasses = uniqueReasonClasses([
    primaryReasonClass,
    ...evidence.map(reasonClassForEvidence),
    ...(candidate.components.negativePenalty > 0 ? ["contrast" as const] : []),
  ]);

  return {
    primaryReasonClass,
    reasonClasses,
    summary: explanationSummary(candidate, confidence),
    evidenceIds: evidence.map((item) => item.evidenceId),
    sourceBoundaries: [...new Set(evidence.map((item) => item.source))].sort(),
    privacyBoundary:
      "Only privacy-safe evidence summaries are disclosed; raw searches, reading history, private reviews, shelves, bookmarks, quotes, messages, hidden weights, embeddings, vectors, and reasoning traces are excluded.",
    authorityBoundary: "derived_intelligence_not_canonical_truth",
    constraintIds: [
      "matchmaker_v1:scope:work_only",
      "matchmaker_v1:authority:derived_intelligence",
      "matchmaker_v1:privacy:snapshot_only",
      "matchmaker_v1:safety:bounded_deterministic",
    ],
  };
}

function primaryReasonFor(
  candidate: MatchMakerV1ScoredCandidate
): MatchMakerReasonClass {
  if (candidate.components.affinity > 0) {
    return "affinity";
  }
  if (candidate.components.interaction > 0) {
    return "reinforcement";
  }
  if (candidate.components.graph > 0) {
    return "graph_context";
  }
  if (candidate.components.availability > 0) {
    return "availability";
  }
  return "exploration";
}

function reasonClassForEvidence(
  evidence: MatchMakerEvidence
): MatchMakerReasonClass {
  switch (evidence.source) {
    case "affinity":
      return "affinity";
    case "interaction":
      return "reinforcement";
    case "graph":
      return "graph_context";
    case "availability":
      return "availability";
    case "discovery_context":
      return "discovery";
    case "profile_context":
      return "identity";
    case "entity":
    default:
      return "exploration";
  }
}

function uniqueReasonClasses(
  reasonClasses: readonly MatchMakerReasonClass[]
): readonly MatchMakerReasonClass[] {
  return [...new Set(reasonClasses)].sort();
}

function explanationSummary(
  candidate: MatchMakerV1ScoredCandidate,
  confidence: MatchMakerConfidence
): string {
  if (candidate.components.contradictionPenalty > 0) {
    return `This work is recommended with ${confidence.band} confidence because supportive evidence is present, but the snapshot also contains contradictory signals.`;
  }
  if (candidate.components.negativePenalty > 0) {
    return `This work is recommended with ${confidence.band} confidence because supportive evidence remains after a negative signal is accounted for.`;
  }
  if (candidate.components.affinity > 0) {
    return `This work is recommended with ${confidence.band} confidence because privacy-safe affinity evidence aligns with the snapshot.`;
  }
  if (candidate.components.graph > 0) {
    return `This work is recommended with ${confidence.band} confidence because it is adjacent to a known Work in the provided graph snapshot.`;
  }
  return `This work is recommended with ${confidence.band} confidence from the bounded input snapshot.`;
}
