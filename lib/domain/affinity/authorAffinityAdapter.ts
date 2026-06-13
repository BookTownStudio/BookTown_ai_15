import {
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityAffinity,
  type UserEntityInteraction,
} from "../../../contracts/entityPlatform";

function isActiveAuthorFollowInteraction(
  interaction: UserEntityInteraction
): boolean {
  return (
    interaction.interactionType === "following" &&
    interaction.entityRef.entityType === "author" &&
    interaction.entityRef.authorityState === "canonical" &&
    interaction.entityRef.authoritySource === "author_authority" &&
    interaction.lifecycleState === "recorded"
  );
}

export function toAuthorAffinityFromFollowInteraction(
  interaction: UserEntityInteraction
): EntityAffinity | null {
  if (!isActiveAuthorFollowInteraction(interaction)) {
    return null;
  }

  return {
    uid: interaction.uid,
    entityRef: interaction.entityRef,
    affinityClass: "explicit",
    strengthBand: "strong",
    confidence: 0.9,
    contributingSignalClasses: [
      "interaction:following",
      "surface:author_details",
      "weight:durable",
      "source:author_follow",
    ],
    recency: interaction.occurredAt,
    provenance: {
      ...interaction.provenance,
      evidence: [
        ...(interaction.provenance.evidence ?? []),
        `interactionId:${interaction.interactionId}`,
      ],
    },
    privacyTier: "private",
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}
