import {
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityAffinity,
  type EntityPlatformPrivacyTier,
  type EntityPlatformProvenance,
  type LiteraryEntityRef,
  type MatchMakerAffinityClass,
  type MatchMakerStrengthBand,
  type UserEntityInteractionLifecycleState,
} from "../../../contracts/entityPlatform";

export type WorkToAuthorRollupSignalClass =
  | "completed_reading"
  | "shelving"
  | "bookmarking"
  | "reviewing"
  | "quoting"
  | "discussing"
  | "work_affinity";

export type WorkToAuthorRollupPolarity = "positive" | "neutral" | "negative";

export interface WorkToAuthorRollupSignal {
  readonly workRef: LiteraryEntityRef;
  readonly canonicalAuthorRefs: readonly LiteraryEntityRef[];
  readonly signalSource: "interaction" | "affinity";
  readonly signalClass: WorkToAuthorRollupSignalClass;
  readonly workAffinityClass?: MatchMakerAffinityClass;
  readonly polarity: WorkToAuthorRollupPolarity;
  readonly lifecycleState: UserEntityInteractionLifecycleState;
  readonly privacyTier: EntityPlatformPrivacyTier;
  readonly occurredAt: string;
  readonly confidence: number;
  readonly provenance: EntityPlatformProvenance;
}

export interface WorkToAuthorRollupInput {
  readonly uid: string;
  readonly authorRef: LiteraryEntityRef;
  readonly workSignals: readonly WorkToAuthorRollupSignal[];
  readonly generatedAt: string;
}

const MIN_DISTINCT_WORKS = 3;
const MIN_POSITIVE_SIGNALS = 3;
const MIN_WEIGHTED_SCORE = 2.2;
const DERIVED_CONFIDENCE_CAP = 0.7;

const PRIVACY_TIER_ORDER: readonly EntityPlatformPrivacyTier[] = [
  "public",
  "followers",
  "private",
  "system",
  "admin",
];

function isCanonicalAuthorRef(ref: LiteraryEntityRef): boolean {
  return (
    ref.entityType === "author" &&
    ref.authorityState === "canonical" &&
    ref.authoritySource === "author_authority" &&
    ref.entityId.trim().length > 0
  );
}

function isCanonicalWorkRef(ref: LiteraryEntityRef): boolean {
  return (
    ref.entityType === "work" &&
    ref.authorityState === "canonical" &&
    ref.authoritySource === "work_authority" &&
    ref.entityId.trim().length > 0
  );
}

function sameEntityRef(left: LiteraryEntityRef, right: LiteraryEntityRef): boolean {
  return left.entityType === right.entityType && left.entityId === right.entityId;
}

function signalTargetsAuthor(
  signal: WorkToAuthorRollupSignal,
  authorRef: LiteraryEntityRef
): boolean {
  return signal.canonicalAuthorRefs.some(
    (candidate) => isCanonicalAuthorRef(candidate) && sameEntityRef(candidate, authorRef)
  );
}

function isRecorded(signal: WorkToAuthorRollupSignal): boolean {
  return signal.lifecycleState === "recorded";
}

function isPositiveRollupSignal(signal: WorkToAuthorRollupSignal): boolean {
  return (
    isRecorded(signal) &&
    (signal.polarity === "positive" || signal.polarity === "neutral") &&
    signalWeight(signal) > 0
  );
}

function isNegativeRollupSignal(signal: WorkToAuthorRollupSignal): boolean {
  return isRecorded(signal) && signal.polarity === "negative";
}

function signalWeight(signal: WorkToAuthorRollupSignal): number {
  if (signal.signalClass === "shelving") return 1;
  if (signal.signalClass === "bookmarking") return 1;
  if (signal.signalClass === "reviewing") return 0.9;
  if (signal.signalClass === "completed_reading") return 0.7;
  if (signal.signalClass === "quoting") return 0.6;
  if (signal.signalClass === "discussing") return 0.55;
  if (signal.signalClass === "work_affinity") {
    return signal.workAffinityClass === "explicit" ? 0.9 : 0.5;
  }
  return 0;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function strictestPrivacyTier(
  signals: readonly WorkToAuthorRollupSignal[]
): EntityPlatformPrivacyTier {
  return signals.reduce<EntityPlatformPrivacyTier>((strictest, signal) => {
    return PRIVACY_TIER_ORDER.indexOf(signal.privacyTier) >
      PRIVACY_TIER_ORDER.indexOf(strictest)
      ? signal.privacyTier
      : strictest;
  }, "public");
}

function hasMaterialPrivateEvidence(
  signals: readonly WorkToAuthorRollupSignal[]
): boolean {
  return signals.some((signal) =>
    ["private", "system", "admin"].includes(signal.privacyTier)
  );
}

function dominantAffinityClass(
  signals: readonly WorkToAuthorRollupSignal[]
): MatchMakerAffinityClass {
  const explicitWeight = signals
    .filter(
      (signal) =>
        signal.signalClass === "shelving" ||
        signal.signalClass === "bookmarking" ||
        (signal.signalClass === "work_affinity" &&
          signal.workAffinityClass === "explicit")
    )
    .reduce((total, signal) => total + signalWeight(signal), 0);
  const expressiveWeight = signals
    .filter((signal) =>
      ["reviewing", "quoting", "discussing"].includes(signal.signalClass)
    )
    .reduce((total, signal) => total + signalWeight(signal), 0);

  if (explicitWeight >= expressiveWeight && explicitWeight > 0) return "explicit";
  if (expressiveWeight > 0) return "expressive";
  return "behavioral";
}

function strengthBand(
  weightedScore: number,
  distinctWorkCount: number
): MatchMakerStrengthBand {
  return weightedScore >= 3 && distinctWorkCount >= 4 ? "strong" : "moderate";
}

function confidenceForRollup(params: {
  readonly weightedScore: number;
  readonly distinctWorkCount: number;
  readonly signalClassCount: number;
  readonly negativeSignals: readonly WorkToAuthorRollupSignal[];
  readonly positiveSignals: readonly WorkToAuthorRollupSignal[];
  readonly materialPrivateEvidence: boolean;
}): number {
  let confidence = Math.min(
    DERIVED_CONFIDENCE_CAP,
    0.45 + params.weightedScore * 0.08
  );

  if (params.distinctWorkCount >= 4) confidence += 0.03;
  if (params.signalClassCount >= 2) confidence += 0.03;
  if (params.negativeSignals.length > 0) confidence -= 0.1;
  if (params.materialPrivateEvidence) confidence -= 0.1;

  const allCompletion = params.positiveSignals.every(
    (signal) => signal.signalClass === "completed_reading"
  );
  const allQuotes = params.positiveSignals.every(
    (signal) => signal.signalClass === "quoting"
  );

  let cap = DERIVED_CONFIDENCE_CAP;
  if (params.negativeSignals.length > 0) cap = Math.min(cap, 0.55);
  if (allCompletion) cap = Math.min(cap, 0.55);
  if (allQuotes) cap = Math.min(cap, 0.5);
  if (params.materialPrivateEvidence) cap = Math.min(cap, 0.6);

  return round(clamp(confidence, 0, cap));
}

function recency(signals: readonly WorkToAuthorRollupSignal[]): string | undefined {
  return signals
    .map((signal) => signal.occurredAt)
    .filter(Boolean)
    .sort()
    .at(-1);
}

function signalKey(signal: WorkToAuthorRollupSignal): string {
  return signal.signalClass === "work_affinity" && signal.workAffinityClass
    ? `signal:work_affinity:${signal.workAffinityClass}`
    : `signal:${signal.signalClass}`;
}

export function toAuthorAffinityFromWorkSignals(
  input: WorkToAuthorRollupInput
): EntityAffinity | null {
  if (!input.uid.trim() || !isCanonicalAuthorRef(input.authorRef)) {
    return null;
  }

  const eligibleByIdentity = input.workSignals.filter(
    (signal) =>
      isCanonicalWorkRef(signal.workRef) &&
      signalTargetsAuthor(signal, input.authorRef)
  );
  const positiveSignals = eligibleByIdentity.filter(isPositiveRollupSignal);
  const negativeSignals = eligibleByIdentity.filter(isNegativeRollupSignal);
  const distinctWorkIds = uniqueStrings(
    positiveSignals.map((signal) => signal.workRef.entityId)
  );
  const weightedScore = positiveSignals.reduce(
    (total, signal) => total + signalWeight(signal),
    0
  );

  if (distinctWorkIds.length < MIN_DISTINCT_WORKS) return null;
  if (positiveSignals.length < MIN_POSITIVE_SIGNALS) return null;
  if (weightedScore < MIN_WEIGHTED_SCORE) return null;
  if (negativeSignals.length >= positiveSignals.length) return null;

  const signalClasses = uniqueStrings(positiveSignals.map(signalKey));
  const materialPrivateEvidence = hasMaterialPrivateEvidence(positiveSignals);
  const confidence = confidenceForRollup({
    weightedScore,
    distinctWorkCount: distinctWorkIds.length,
    signalClassCount: signalClasses.length,
    negativeSignals,
    positiveSignals,
    materialPrivateEvidence,
  });

  return {
    uid: input.uid,
    entityRef: input.authorRef,
    affinityClass: dominantAffinityClass(positiveSignals),
    strengthBand: strengthBand(weightedScore, distinctWorkIds.length),
    confidence,
    contributingSignalClasses: uniqueStrings([
      "rollup:work_to_author",
      ...signalClasses,
    ]),
    recency: recency(positiveSignals),
    provenance: {
      sourceClass: "derived_identity_graph",
      sourceSystem: "work_to_author_rollup",
      sourceId: input.authorRef.entityId,
      evidence: uniqueStrings([
        `authorId:${input.authorRef.entityId}`,
        `distinctWorks:${distinctWorkIds.length}`,
        `eligibleSignals:${positiveSignals.length}`,
        `weightedScore:${round(weightedScore)}`,
        ...positiveSignals.map(
          (signal) => `workSignal:${signal.workRef.entityId}:${signal.signalClass}`
        ),
      ]),
    },
    privacyTier: strictestPrivacyTier(positiveSignals),
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}
