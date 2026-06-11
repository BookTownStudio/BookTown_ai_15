import {
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityAffinity,
  type EntityPlatformPrivacyTier,
  type MatchMakerAffinityClass,
  type MatchMakerStrengthBand,
  type UserEntityInteraction,
} from "../../../contracts/entityPlatform";

const HIGH_CONFIDENCE = 0.9;
const MEDIUM_HIGH_CONFIDENCE = 0.75;
const MEDIUM_CONFIDENCE = 0.6;
const LOW_CONFIDENCE = 0.35;

function entityAggregationKey(interaction: UserEntityInteraction): string {
  return `${interaction.uid}:${interaction.entityRef.entityType}:${interaction.entityRef.entityId}`;
}

function strongestStrengthBand(
  a: MatchMakerStrengthBand,
  b: MatchMakerStrengthBand
): MatchMakerStrengthBand {
  const rank: Record<MatchMakerStrengthBand, number> = {
    weak: 1,
    moderate: 2,
    strong: 3,
    very_strong: 4,
  };
  return rank[b] > rank[a] ? b : a;
}

function strongestAffinityClass(
  a: MatchMakerAffinityClass,
  b: MatchMakerAffinityClass
): MatchMakerAffinityClass {
  const rank: Record<MatchMakerAffinityClass, number> = {
    behavioral: 1,
    derived_graph_near: 1,
    expressive: 2,
    explicit: 3,
    negative: 4,
  };
  return rank[b] > rank[a] ? b : a;
}

function narrowestPrivacyTier(
  a: EntityPlatformPrivacyTier,
  b: EntityPlatformPrivacyTier
): EntityPlatformPrivacyTier {
  const rank: Record<EntityPlatformPrivacyTier, number> = {
    public: 1,
    followers: 2,
    private: 3,
    system: 4,
    admin: 5,
  };
  return rank[b] > rank[a] ? b : a;
}

function uniqueSignals(signals: readonly string[]): readonly string[] {
  return Array.from(new Set(signals.filter((signal) => signal.trim().length > 0)));
}

export function toAffinityClassFromInteraction(
  interaction: UserEntityInteraction
): MatchMakerAffinityClass {
  if (interaction.weightClass === "negative") return "negative";
  if (interaction.interactionType === "shelving") return "explicit";
  if (interaction.interactionType === "bookmarking") return "explicit";
  if (interaction.interactionType === "reviewing") return "expressive";
  if (interaction.interactionType === "quoting") return "expressive";
  if (interaction.interactionType === "discussing") return "expressive";
  return "behavioral";
}

export function toStrengthBandFromInteraction(
  interaction: UserEntityInteraction
): MatchMakerStrengthBand {
  if (interaction.weightClass === "negative") return "weak";
  if (interaction.interactionType === "searching") return "weak";
  if (interaction.interactionType === "discovering") return "weak";
  if (interaction.interactionType === "reading") return "moderate";
  if (interaction.interactionType === "discussing") return "moderate";
  if (
    interaction.interactionType === "shelving" ||
    interaction.interactionType === "reviewing" ||
    interaction.interactionType === "quoting" ||
    interaction.interactionType === "bookmarking"
  ) {
    return "strong";
  }
  return "weak";
}

export function toConfidenceFromInteraction(interaction: UserEntityInteraction): number {
  if (interaction.weightClass === "negative") return MEDIUM_CONFIDENCE;
  if (interaction.interactionType === "searching") return LOW_CONFIDENCE;
  if (interaction.interactionType === "discovering") return LOW_CONFIDENCE;
  if (interaction.interactionType === "reading") return MEDIUM_HIGH_CONFIDENCE;
  if (interaction.interactionType === "discussing") return MEDIUM_CONFIDENCE;
  if (
    interaction.interactionType === "shelving" ||
    interaction.interactionType === "reviewing" ||
    interaction.interactionType === "quoting" ||
    interaction.interactionType === "bookmarking"
  ) {
    return HIGH_CONFIDENCE;
  }
  return LOW_CONFIDENCE;
}

export function toContributingSignalClasses(
  interaction: UserEntityInteraction
): readonly string[] {
  return uniqueSignals([
    `interaction:${interaction.interactionType}`,
    `surface:${interaction.sourceSurface}`,
    `weight:${interaction.weightClass}`,
    ...(interaction.provenance.sourceSystem
      ? [`source:${interaction.provenance.sourceSystem}`]
      : []),
  ]);
}

/**
 * Derives EntityAffinity from a UserEntityInteraction.
 *
 * This adapter is pure. It does not persist affinity, perform learned scoring,
 * integrate MatchMaker, expand graph-near entities, or roll affinity across
 * entity types.
 */
export function toEntityAffinityFromInteraction(
  interaction: UserEntityInteraction
): EntityAffinity {
  return {
    uid: interaction.uid,
    entityRef: interaction.entityRef,
    affinityClass: toAffinityClassFromInteraction(interaction),
    strengthBand: toStrengthBandFromInteraction(interaction),
    confidence: toConfidenceFromInteraction(interaction),
    contributingSignalClasses: toContributingSignalClasses(interaction),
    recency: interaction.occurredAt,
    provenance: {
      ...interaction.provenance,
      evidence: uniqueSignals([
        ...(interaction.provenance.evidence ?? []),
        `interactionId:${interaction.interactionId}`,
      ]),
    },
    privacyTier: interaction.privacyTier,
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

/**
 * Aggregates affinities only for the same user and exact same entity ref.
 *
 * The helper preserves contributing classes, narrows privacy to the strictest
 * tier encountered, and does not create cross-entity rollups.
 */
export function toEntityAffinitiesFromInteractions(
  interactions: readonly UserEntityInteraction[]
): readonly EntityAffinity[] {
  const byEntity = new Map<string, EntityAffinity>();

  for (const interaction of interactions) {
    const next = toEntityAffinityFromInteraction(interaction);
    const key = entityAggregationKey(interaction);
    const existing = byEntity.get(key);

    if (!existing) {
      byEntity.set(key, next);
      continue;
    }

    byEntity.set(key, {
      ...existing,
      affinityClass: strongestAffinityClass(existing.affinityClass, next.affinityClass),
      strengthBand: strongestStrengthBand(existing.strengthBand, next.strengthBand),
      confidence: Math.max(existing.confidence, next.confidence),
      contributingSignalClasses: uniqueSignals([
        ...existing.contributingSignalClasses,
        ...next.contributingSignalClasses,
      ]),
      recency:
        String(next.recency ?? "") > String(existing.recency ?? "")
          ? next.recency
          : existing.recency,
      provenance: {
        ...existing.provenance,
        evidence: uniqueSignals([
          ...(existing.provenance.evidence ?? []),
          ...(next.provenance.evidence ?? []),
        ]),
      },
      privacyTier: narrowestPrivacyTier(existing.privacyTier, next.privacyTier),
    });
  }

  return Array.from(byEntity.values());
}
