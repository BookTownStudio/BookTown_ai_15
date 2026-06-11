import type { LiteraryEntityRef } from "../../../../contracts/entityPlatform/entityRef";
import type { EntitySummary } from "../../../../contracts/entityPlatform/entitySummary";
import type { EntityRelationship } from "../../../../contracts/entityPlatform/graphEntity";
import type { MatchMakerInput } from "../../../../contracts/entityPlatform/matchmaker";
import type {
  MatchMakerRecommendationTargetRef,
} from "../../../../contracts/entityPlatform/matchmakerOutputs";
import type { UserEntityInteraction } from "../../../../contracts/entityPlatform/userInteraction";
import {
  MATCHMAKER_V1_LIMITS,
  type MatchMakerV1AvailabilityConstraint,
  type MatchMakerV1AvailabilityEffect,
  type MatchMakerV1Candidate,
  type MatchMakerV1CandidateMap,
  type MatchMakerV1CandidateSource,
  type MutableMatchMakerV1Candidate,
} from "./types";

const ACTIVE_AUTHORITY_STATES = new Set([
  "candidate",
  "resolved",
  "canonical",
  "enriched",
]);

const INACTIVE_INTERACTION_STATES = new Set([
  "withdrawn",
  "expired",
  "anonymized",
  "deleted",
]);

const ALLOWED_DISCOVERY_REF_FIELDS = [
  "allowedWorkRefs",
  "canonicalWorkRefs",
  "workRefs",
] as const;

export function toMatchMakerV1EntityKey(ref: LiteraryEntityRef): string {
  const identity = ref.canonicalId ?? ref.entityId;
  return `${ref.entityType}:${identity}`;
}

export function isActiveV1AuthorityState(ref: LiteraryEntityRef): boolean {
  return ACTIVE_AUTHORITY_STATES.has(ref.authorityState);
}

export function isV1WorkRef(
  ref: LiteraryEntityRef
): ref is MatchMakerRecommendationTargetRef {
  return (
    ref.entityType === "work" &&
    ref.entityId.trim().length > 0 &&
    isActiveV1AuthorityState(ref)
  );
}

export function preferV1OutputRef(
  refs: readonly LiteraryEntityRef[]
): MatchMakerRecommendationTargetRef | undefined {
  const workRefs = refs.filter(isV1WorkRef);
  return (
    workRefs.find((ref) => ref.authorityState === "canonical") ??
    workRefs.find((ref) => ref.authorityState === "enriched") ??
    workRefs.find((ref) => ref.authorityState === "resolved") ??
    workRefs[0]
  );
}

export function generateMatchMakerV1Candidates(
  input: MatchMakerInput
): readonly MatchMakerV1Candidate[] {
  const candidates: MatchMakerV1CandidateMap = new Map();

  for (const ref of bounded(input.entityRefs)) {
    addRefCandidate(candidates, ref, "entity_ref");
  }

  for (const summary of bounded(input.entitySummaries)) {
    addSummaryCandidate(candidates, summary);
  }

  for (const affinity of bounded(input.userAffinitySummaries)) {
    if (isV1WorkRef(affinity.entityRef)) {
      const candidate = ensureCandidate(candidates, affinity.entityRef, "affinity");
      candidate.affinities.push(affinity);
    }
  }

  for (const interaction of bounded(input.interactionSummaries)) {
    if (isActiveInteraction(interaction) && isV1WorkRef(interaction.entityRef)) {
      const candidate = ensureCandidate(
        candidates,
        interaction.entityRef,
        "interaction"
      );
      candidate.interactions.push(interaction);
    }
  }

  addOneHopGraphCandidates(candidates, bounded(input.graphRelationshipSummaries));
  addStructuredDiscoveryCandidates(candidates, input.searchOrDiscoveryContext);
  applyAvailabilityConstraints(candidates, input.availabilityConstraints);

  return Array.from(candidates.values())
    .slice(0, MATCHMAKER_V1_LIMITS.maxCandidates)
    .map(freezeCandidate)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function bounded<T>(items: readonly T[] | undefined): readonly T[] {
  return (items ?? []).slice(0, MATCHMAKER_V1_LIMITS.maxInputRefs);
}

function addRefCandidate(
  candidates: MatchMakerV1CandidateMap,
  ref: LiteraryEntityRef,
  source: MatchMakerV1CandidateSource
): void {
  if (!isV1WorkRef(ref)) {
    return;
  }
  ensureCandidate(candidates, ref, source);
}

function addSummaryCandidate(
  candidates: MatchMakerV1CandidateMap,
  summary: EntitySummary
): void {
  if (!isV1WorkRef(summary.ref)) {
    return;
  }
  const candidate = ensureCandidate(candidates, summary.ref, "entity_summary");
  candidate.summary ??= summary;
  candidate.availabilityState ??= summary.availability?.state;
}

function ensureCandidate(
  candidates: MatchMakerV1CandidateMap,
  ref: MatchMakerRecommendationTargetRef,
  source: MatchMakerV1CandidateSource
): MutableMatchMakerV1Candidate {
  const key = toMatchMakerV1EntityKey(ref);
  const existing = candidates.get(key);
  if (existing) {
    existing.sourceTypes.add(source);
    if (!existing.refs.some((candidateRef) => sameRef(candidateRef, ref))) {
      existing.refs.push(ref);
      existing.targetRef = preferV1OutputRef(existing.refs) ?? existing.targetRef;
    }
    return existing;
  }

  const candidate: MutableMatchMakerV1Candidate = {
    key,
    targetRef: ref,
    refs: [ref],
    sourceTypes: new Set([source]),
    affinities: [],
    interactions: [],
    relationships: [],
    availabilityConstraints: [],
    suppressedReasons: new Set(),
  };
  candidates.set(key, candidate);
  return candidate;
}

function sameRef(
  left: MatchMakerRecommendationTargetRef,
  right: MatchMakerRecommendationTargetRef
): boolean {
  return toMatchMakerV1EntityKey(left) === toMatchMakerV1EntityKey(right);
}

function isActiveInteraction(interaction: UserEntityInteraction): boolean {
  return !INACTIVE_INTERACTION_STATES.has(interaction.lifecycleState);
}

function addOneHopGraphCandidates(
  candidates: MatchMakerV1CandidateMap,
  relationships: readonly EntityRelationship[]
): void {
  const seededKeys = new Set(candidates.keys());
  for (const relationship of relationships) {
    if (isInactiveRelationshipState(relationship.lifecycleState)) {
      continue;
    }
    const sourceRef = relationship.source.ref;
    const targetRef = relationship.target.ref;
    const sourceKey = toMatchMakerV1EntityKey(sourceRef);
    const targetKey = toMatchMakerV1EntityKey(targetRef);
    const sourceIsSeed = seededKeys.has(sourceKey);
    const targetIsSeed = seededKeys.has(targetKey);

    if (sourceIsSeed && isV1WorkRef(targetRef)) {
      ensureCandidate(candidates, targetRef, "graph").relationships.push(
        relationship
      );
    }
    if (targetIsSeed && isV1WorkRef(sourceRef)) {
      ensureCandidate(candidates, sourceRef, "graph").relationships.push(
        relationship
      );
    }
    if (sourceIsSeed && isV1WorkRef(sourceRef)) {
      const candidate = candidates.get(sourceKey);
      candidate?.relationships.push(relationship);
    }
    if (targetIsSeed && isV1WorkRef(targetRef)) {
      const candidate = candidates.get(targetKey);
      candidate?.relationships.push(relationship);
    }
  }
}

function isInactiveRelationshipState(lifecycleState: string): boolean {
  return ["deprecated", "merged", "archived", "unresolved"].includes(
    lifecycleState
  );
}

function addStructuredDiscoveryCandidates(
  candidates: MatchMakerV1CandidateMap,
  context: Readonly<Record<string, unknown>> | undefined
): void {
  if (!context) {
    return;
  }
  const refs = collectAllowedDiscoveryRefs(context).slice(
    0,
    MATCHMAKER_V1_LIMITS.maxInputRefs
  );
  for (const ref of refs) {
    addRefCandidate(candidates, ref, "discovery_context");
  }
}

function collectAllowedDiscoveryRefs(
  context: Readonly<Record<string, unknown>>
): readonly LiteraryEntityRef[] {
  const refs: LiteraryEntityRef[] = [];
  for (const field of ALLOWED_DISCOVERY_REF_FIELDS) {
    const value = context[field];
    if (Array.isArray(value)) {
      refs.push(...value.filter(isExplicitDiscoveryWorkRef));
    } else if (isExplicitDiscoveryWorkRef(value)) {
      refs.push(value);
    }
  }
  return refs;
}

function isStructuredEntityRef(value: unknown): value is LiteraryEntityRef {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const ref = value as Partial<LiteraryEntityRef>;
  return (
    typeof ref.entityType === "string" &&
    typeof ref.entityId === "string" &&
    typeof ref.authorityState === "string" &&
    typeof ref.authoritySource === "string" &&
    typeof ref.contractVersion === "number"
  );
}

function isExplicitDiscoveryWorkRef(
  value: unknown
): value is MatchMakerRecommendationTargetRef {
  return (
    isStructuredEntityRef(value) &&
    value.authorityState === "canonical" &&
    isV1WorkRef(value)
  );
}

function applyAvailabilityConstraints(
  candidates: MatchMakerV1CandidateMap,
  availabilityConstraints: Readonly<Record<string, unknown>> | undefined
): void {
  if (!availabilityConstraints) {
    return;
  }
  for (const candidate of candidates.values()) {
    const constraints = availabilityConstraintsForCandidate(
      candidate.key,
      candidate.targetRef,
      availabilityConstraints
    );
    candidate.availabilityConstraints.push(...constraints);
    candidate.availabilityState ??= constraints.find(
      (constraint) => constraint.state
    )?.state;
  }
}

export function availabilityConstraintsForCandidate(
  candidateKey: string,
  targetRef: LiteraryEntityRef,
  availabilityConstraints: Readonly<Record<string, unknown>> | undefined
): readonly MatchMakerV1AvailabilityConstraint[] {
  if (!availabilityConstraints) {
    return [];
  }
  const constraints: MatchMakerV1AvailabilityConstraint[] = [];
  constraints.push(
    ...constraintsFromIdList(
      "hardBlockedWorkIds",
      availabilityConstraints.hardBlockedWorkIds,
      "hard_block",
      candidateKey,
      targetRef
    ),
    ...constraintsFromIdList(
      "blockedWorkIds",
      availabilityConstraints.blockedWorkIds,
      "hard_block",
      candidateKey,
      targetRef
    ),
    ...constraintsFromIdList(
      "softBoostWorkIds",
      availabilityConstraints.softBoostWorkIds,
      "soft_boost",
      candidateKey,
      targetRef
    ),
    ...constraintsFromIdList(
      "boostWorkIds",
      availabilityConstraints.boostWorkIds,
      "soft_boost",
      candidateKey,
      targetRef
    ),
    ...constraintsFromIdList(
      "softPenaltyWorkIds",
      availabilityConstraints.softPenaltyWorkIds,
      "soft_penalty",
      candidateKey,
      targetRef
    ),
    ...constraintsFromIdList(
      "limitedWorkIds",
      availabilityConstraints.limitedWorkIds,
      "soft_penalty",
      candidateKey,
      targetRef
    ),
    ...constraintsFromObjects(
      availabilityConstraints.constraints,
      candidateKey,
      targetRef
    ),
    ...constraintsFromWorkMap(
      availabilityConstraints.workConstraints,
      candidateKey,
      targetRef
    )
  );
  return constraints.sort((a, b) => a.constraintId.localeCompare(b.constraintId));
}

function constraintsFromIdList(
  sourceId: string,
  value: unknown,
  effect: MatchMakerV1AvailabilityEffect,
  candidateKey: string,
  targetRef: LiteraryEntityRef
): readonly MatchMakerV1AvailabilityConstraint[] {
  const ids = Array.isArray(value) ? value : [];
  if (!ids.some((id) => matchesCandidateIdentity(id, candidateKey, targetRef))) {
    return [];
  }
  return [
    toAvailabilityConstraint(
      `${sourceId}:${candidateKey}`,
      effect,
      stateForEffect(effect),
      descriptionForEffect(effect)
    ),
  ];
}

function constraintsFromObjects(
  value: unknown,
  candidateKey: string,
  targetRef: LiteraryEntityRef
): readonly MatchMakerV1AvailabilityConstraint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .filter((item) => objectMatchesCandidate(item, candidateKey, targetRef))
    .map((item, index) => {
      const effect = effectFromObject(item);
      return toAvailabilityConstraint(
        stringValue(item.constraintId) ??
          stringValue(item.id) ??
          `constraint:${candidateKey}:${index}`,
        effect,
        stringValue(item.state) ?? stateForEffect(effect),
        stringValue(item.description) ?? descriptionForEffect(effect)
      );
    });
}

function constraintsFromWorkMap(
  value: unknown,
  candidateKey: string,
  targetRef: LiteraryEntityRef
): readonly MatchMakerV1AvailabilityConstraint[] {
  if (!isRecord(value)) {
    return [];
  }
  const matchingEntry = Object.entries(value).find(([key]) =>
    matchesCandidateIdentity(key, candidateKey, targetRef)
  );
  if (!matchingEntry || !isRecord(matchingEntry[1])) {
    return [];
  }
  const effect = effectFromObject(matchingEntry[1]);
  return [
    toAvailabilityConstraint(
      `workConstraints:${candidateKey}`,
      effect,
      stringValue(matchingEntry[1].state) ?? stateForEffect(effect),
      stringValue(matchingEntry[1].description) ?? descriptionForEffect(effect)
    ),
  ];
}

function objectMatchesCandidate(
  value: Record<string, unknown>,
  candidateKey: string,
  targetRef: LiteraryEntityRef
): boolean {
  return [
    value.candidateKey,
    value.key,
    value.workId,
    value.entityId,
    value.canonicalId,
  ].some((identity) => matchesCandidateIdentity(identity, candidateKey, targetRef)) ||
    [value.entityRef, value.workRef, value.targetEntityRef].some(
      (ref) =>
        isStructuredEntityRef(ref) &&
        matchesCandidateIdentity(toMatchMakerV1EntityKey(ref), candidateKey, targetRef)
    );
}

function matchesCandidateIdentity(
  value: unknown,
  candidateKey: string,
  targetRef: LiteraryEntityRef
): boolean {
  if (typeof value !== "string") {
    return false;
  }
  return (
    value === candidateKey ||
    value === targetRef.entityId ||
    value === targetRef.canonicalId ||
    value === `${targetRef.entityType}:${targetRef.entityId}` ||
    value === `${targetRef.entityType}:${targetRef.canonicalId ?? targetRef.entityId}`
  );
}

function effectFromObject(
  value: Record<string, unknown>
): MatchMakerV1AvailabilityEffect {
  const mode = [
    stringValue(value.effect),
    stringValue(value.mode),
    stringValue(value.type),
    stringValue(value.state),
  ]
    .filter(Boolean)
    .join(":")
    .toLowerCase();
  if (value.hard === true || value.blocked === true || mode.includes("hard") || mode.includes("block")) {
    return "hard_block";
  }
  if (mode.includes("boost") || mode.includes("available")) {
    return "soft_boost";
  }
  if (mode.includes("penalty") || mode.includes("limited") || mode.includes("unavailable")) {
    return "soft_penalty";
  }
  return "neutral";
}

function toAvailabilityConstraint(
  id: string,
  effect: MatchMakerV1AvailabilityEffect,
  state: string | undefined,
  description: string
): MatchMakerV1AvailabilityConstraint {
  return {
    constraintId: `matchmaker_v1:availability:${stableIdPart(id)}`,
    effect,
    description,
    state,
    enforced: effect === "hard_block",
  };
}

function stateForEffect(
  effect: MatchMakerV1AvailabilityEffect
): string | undefined {
  if (effect === "hard_block") {
    return "blocked";
  }
  if (effect === "soft_boost") {
    return "available";
  }
  if (effect === "soft_penalty") {
    return "limited";
  }
  return undefined;
}

function descriptionForEffect(effect: MatchMakerV1AvailabilityEffect): string {
  if (effect === "hard_block") {
    return "A hard availability constraint blocks this Work.";
  }
  if (effect === "soft_boost") {
    return "A soft availability constraint supports this Work.";
  }
  if (effect === "soft_penalty") {
    return "A soft availability constraint limits this Work.";
  }
  return "An availability constraint was considered for this Work.";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableIdPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "_")
    .replace(/_+/g, "_");
}

function freezeCandidate(
  candidate: MutableMatchMakerV1Candidate
): MatchMakerV1Candidate {
  return {
    key: candidate.key,
    targetRef: candidate.targetRef,
    refs: [...candidate.refs].sort((a, b) =>
      toMatchMakerV1EntityKey(a).localeCompare(toMatchMakerV1EntityKey(b))
    ),
    summary: candidate.summary,
    sourceTypes: [...candidate.sourceTypes].sort(),
    affinities: [...candidate.affinities],
    interactions: [...candidate.interactions],
    relationships: dedupeRelationships(candidate.relationships),
    availabilityState: candidate.availabilityState,
    availabilityConstraints: [...candidate.availabilityConstraints],
    suppressedReasons: [...candidate.suppressedReasons].sort(),
  };
}

function dedupeRelationships(
  relationships: readonly EntityRelationship[]
): readonly EntityRelationship[] {
  const byId = new Map<string, EntityRelationship>();
  for (const relationship of relationships) {
    byId.set(relationship.relationshipId, relationship);
  }
  return [...byId.values()].sort((a, b) =>
    a.relationshipId.localeCompare(b.relationshipId)
  );
}
