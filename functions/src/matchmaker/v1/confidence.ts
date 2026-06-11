import type {
  MatchMakerConfidence,
  MatchMakerConfidenceBand,
  MatchMakerEvidence,
} from "../../contracts/shared/entityPlatform/matchmakerOutputs";
import {
  applyMatchMakerV1ConfidenceToScore,
} from "./scoring";
import type { MatchMakerV1ScoredCandidate } from "./types";

export function calculateMatchMakerV1Confidence(
  candidate: MatchMakerV1ScoredCandidate,
  evidence: readonly MatchMakerEvidence[]
): MatchMakerConfidence {
  const sourceScores = evidence.map((item) => item.confidence.score);
  const sourceAverage =
    sourceScores.length === 0
      ? 0.2
      : sourceScores.reduce((total, score) => total + score, 0) /
        sourceScores.length;
  const sourceDiversity = new Set(evidence.map((item) => item.source)).size;
  const diversityScore = Math.min(1, sourceDiversity / 4);
  const snapshotScore = snapshotCompleteness(candidate);
  const availabilityScore = availabilityConfidence(evidence);
  const contradictionPenalty =
    candidate.components.contradictionPenalty > 0 ? 0.18 : 0;
  const negativePenalty = candidate.components.negativePenalty > 0 ? 0.12 : 0;
  const sparsePenalty = candidate.components.sparsePenalty > 0 ? 0.16 : 0;
  const rawScore =
    sourceAverage * 0.5 +
    diversityScore * 0.25 +
    snapshotScore * 0.15 +
    availabilityScore * 0.1 -
    contradictionPenalty -
    negativePenalty -
    sparsePenalty;
  const cappedScore = Math.min(
    confidenceCap(candidate, evidence),
    clamp(rawScore)
  );
  const score = round(cappedScore);
  return {
    band: toMatchMakerV1ConfidenceBand(score),
    score,
    rationale: rationaleFor(score, candidate),
    evidenceCoverage: `${evidence.length} privacy-safe evidence item${
      evidence.length === 1 ? "" : "s"
    } across ${sourceDiversity} source class${
      sourceDiversity === 1 ? "" : "es"
    }.`,
  };
}

export function withMatchMakerV1Confidence(
  candidate: MatchMakerV1ScoredCandidate,
  confidence: MatchMakerConfidence
): MatchMakerV1ScoredCandidate {
  return {
    ...applyMatchMakerV1ConfidenceToScore(candidate, confidence.score),
    confidence,
  };
}

export function toMatchMakerV1ConfidenceBand(
  score: number
): MatchMakerConfidenceBand {
  if (score >= 0.75) {
    return "high";
  }
  if (score >= 0.45) {
    return "medium";
  }
  return "low";
}

function snapshotCompleteness(candidate: MatchMakerV1ScoredCandidate): number {
  const sources = candidate.candidate.sourceTypes.length;
  const hasSummary = candidate.candidate.summary ? 1 : 0;
  const hasEvidence = candidate.evidence.length > 0 ? 1 : 0;
  return Math.min(1, sources * 0.2 + hasSummary * 0.25 + hasEvidence * 0.25 + 0.3);
}

function availabilityConfidence(
  evidence: readonly MatchMakerEvidence[]
): number {
  const availabilityEvidence = evidence.filter(
    (item) => item.source === "availability"
  );
  if (availabilityEvidence.length === 0) {
    return 0;
  }
  return (
    availabilityEvidence.reduce((total, item) => total + item.confidence.score, 0) /
    availabilityEvidence.length
  );
}

function confidenceCap(
  candidate: MatchMakerV1ScoredCandidate,
  evidence: readonly MatchMakerEvidence[]
): number {
  const evidenceSources = new Set(evidence.map((item) => item.source));
  if (evidence.length === 0) {
    return 0.3;
  }
  if (candidate.components.contradictionPenalty > 0) {
    return 0.66;
  }
  if (candidate.components.negativePenalty > 0) {
    return 0.7;
  }
  if (!evidenceSources.has("affinity") && !evidenceSources.has("interaction")) {
    return 0.62;
  }
  if (evidenceSources.size === 1) {
    return 0.72;
  }
  return 0.92;
}

function rationaleFor(
  score: number,
  candidate: MatchMakerV1ScoredCandidate
): string {
  if (candidate.components.contradictionPenalty > 0) {
    return "Confidence is capped because contradictory signals appear in the snapshot.";
  }
  if (candidate.components.negativePenalty > 0) {
    return "Confidence is limited because negative evidence is present.";
  }
  if (candidate.components.sparsePenalty > 0) {
    return "Confidence is limited by sparse snapshot evidence.";
  }
  if (score >= 0.75) {
    return "Confidence is high because multiple privacy-safe evidence sources agree.";
  }
  if (score >= 0.45) {
    return "Confidence is medium because evidence is present but not complete across all source classes.";
  }
  return "Confidence is low because available evidence is limited.";
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
