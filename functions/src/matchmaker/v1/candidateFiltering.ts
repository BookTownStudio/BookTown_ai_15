import type { MatchMakerInput } from "../../contracts/shared/entityPlatform/matchmaker";
import {
  isActiveV1AuthorityState,
  isV1WorkRef,
} from "./candidateGeneration";
import type {
  MatchMakerV1Candidate,
  MatchMakerV1SuppressionReason,
} from "./types";

export function filterMatchMakerV1Candidates(
  candidates: readonly MatchMakerV1Candidate[],
  _input: MatchMakerInput
): readonly MatchMakerV1Candidate[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      suppressedReasons: suppressionReasonsFor(candidate),
    }))
    .filter((candidate) => candidate.suppressedReasons.length === 0);
}

function suppressionReasonsFor(
  candidate: MatchMakerV1Candidate
): readonly MatchMakerV1SuppressionReason[] {
  const reasons: MatchMakerV1SuppressionReason[] = [];
  if (!isV1WorkRef(candidate.targetRef)) {
    reasons.push("non_work");
  }
  if (!isActiveV1AuthorityState(candidate.targetRef)) {
    reasons.push("inactive_authority");
  }
  if ((candidate.targetRef.canonicalId ?? candidate.targetRef.entityId).trim().length === 0) {
    reasons.push("missing_identity");
  }
  if (isNegativeOnly(candidate)) {
    reasons.push("negative_only");
  }
  if (
    candidate.availabilityConstraints.some(
      (constraint) => constraint.effect === "hard_block"
    )
  ) {
    reasons.push("hard_availability_block");
  }
  if (!hasSafeEvidence(candidate)) {
    reasons.push("no_safe_evidence");
  }
  return reasons.sort();
}

function isNegativeOnly(candidate: MatchMakerV1Candidate): boolean {
  const hasNegativeAffinity = candidate.affinities.some(
    (affinity) => affinity.affinityClass === "negative"
  );
  const hasPositiveSignal =
    candidate.affinities.some((affinity) => affinity.affinityClass !== "negative") ||
    candidate.interactions.some((interaction) => interaction.weightClass !== "negative") ||
    candidate.relationships.length > 0 ||
    candidate.sourceTypes.some(
      (source) => source === "entity_ref" || source === "entity_summary"
    );
  return hasNegativeAffinity && !hasPositiveSignal;
}

function hasSafeEvidence(candidate: MatchMakerV1Candidate): boolean {
  return (
    candidate.sourceTypes.length > 0 ||
    candidate.affinities.length > 0 ||
    candidate.interactions.length > 0 ||
    candidate.relationships.length > 0
  );
}
