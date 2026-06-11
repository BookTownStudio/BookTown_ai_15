export {
  generateMatchMakerV1Candidates,
  isActiveV1AuthorityState,
  isV1WorkRef,
  preferV1OutputRef,
  toMatchMakerV1EntityKey,
} from "./candidateGeneration";
export { filterMatchMakerV1Candidates } from "./candidateFiltering";
export {
  calculateMatchMakerV1Confidence,
  toMatchMakerV1ConfidenceBand,
} from "./confidence";
export { buildMatchMakerV1Explanation } from "./explanations";
export { runMatchMakerV1 } from "./matchmakerEngine";
export {
  assembleMatchMakerV1Evidence,
  toMatchMakerV1OutputId,
  toMatchMakerV1Recommendation,
} from "./outputAssembly";
export {
  rankMatchMakerV1Candidates,
  scoreMatchMakerV1Candidate,
} from "./scoring";
export type {
  MatchMakerV1Candidate,
  MatchMakerV1Options,
  MatchMakerV1ScoredCandidate,
  MatchMakerV1SuppressionReason,
} from "./types";

