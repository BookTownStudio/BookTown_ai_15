import {
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityAffinity,
  type EntityPlatformPrivacyTier,
  type EntitySummary,
  type LiteraryEntityRef,
} from "../../../contracts/entityPlatform";
import {
  AUTHOR_RECOMMENDATION_LIMITS,
  AUTHOR_RECOMMENDATION_ENGINE_VERSION,
  type AuthorRecommendationCandidate,
  type AuthorRecommendationEvidence,
  type AuthorRecommendationInput,
} from "./types";

const PRIVACY_ORDER: readonly EntityPlatformPrivacyTier[] = [
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

function strictest(
  left: EntityPlatformPrivacyTier,
  right: EntityPlatformPrivacyTier
): EntityPlatformPrivacyTier {
  return PRIVACY_ORDER.indexOf(right) > PRIVACY_ORDER.indexOf(left) ? right : left;
}

function stableEvidenceId(source: string, authorId: string, index: number): string {
  return `${AUTHOR_RECOMMENDATION_ENGINE_VERSION}:evidence:${source}:${authorId}:${index}`;
}

function isRolledAffinity(affinity: EntityAffinity): boolean {
  return (
    affinity.provenance.sourceSystem === "work_to_author_rollup" ||
    affinity.contributingSignalClasses.includes("rollup:work_to_author")
  );
}

function isDirectAffinity(affinity: EntityAffinity): boolean {
  return (
    affinity.affinityClass === "explicit" &&
    (affinity.provenance.sourceSystem === "author_follow" ||
      affinity.contributingSignalClasses.includes("interaction:following"))
  );
}

function isNegativeAffinity(affinity: EntityAffinity): boolean {
  return affinity.affinityClass === "negative";
}

function evidenceFromAffinity(
  affinity: EntityAffinity,
  source: "direct_author_affinity" | "rolled_author_affinity",
  index: number
): AuthorRecommendationEvidence {
  const authorId = affinity.entityRef.entityId;
  return {
    evidenceId: stableEvidenceId(source, authorId, index),
    source,
    signalClass:
      source === "direct_author_affinity"
        ? "author_follow"
        : "work_to_author_rollup",
    description:
      source === "direct_author_affinity"
        ? "Direct author activity supports this suggestion."
        : "Repeated activity across several works supports this suggestion.",
    privacyTier: affinity.privacyTier,
    provenance: affinity.provenance,
  };
}

function summaryEvidence(
  summary: EntitySummary,
  index: number
): AuthorRecommendationEvidence {
  return {
    evidenceId: stableEvidenceId("author_summary", summary.ref.entityId, index),
    source: "author_summary",
    signalClass: "canonical_author_summary",
    description: "Canonical Author summary is available for safe display.",
    privacyTier: "public",
    provenance: {
      sourceClass: "canonical_authority",
      sourceSystem: "author_authority",
      sourceId: summary.ref.entityId,
    },
  };
}

export function generateAuthorRecommendationCandidates(
  input: AuthorRecommendationInput
): readonly AuthorRecommendationCandidate[] {
  const summaries = new Map(
    input.authorSummaries
      .filter((summary) => isCanonicalAuthorRef(summary.ref))
      .map((summary) => [summary.ref.entityId, summary])
  );
  const grouped = new Map<
    string,
    {
      ref: LiteraryEntityRef;
      direct: EntityAffinity[];
      rolled: EntityAffinity[];
      negative: EntityAffinity[];
      privacyTier: EntityPlatformPrivacyTier;
    }
  >();

  for (const affinity of input.authorAffinities) {
    if (!isCanonicalAuthorRef(affinity.entityRef)) continue;
    const accepted =
      isDirectAffinity(affinity) || isRolledAffinity(affinity) || isNegativeAffinity(affinity);
    if (!accepted) continue;

    const key = affinity.entityRef.entityId;
    const existing =
      grouped.get(key) ??
      {
        ref: affinity.entityRef,
        direct: [],
        rolled: [],
        negative: [],
        privacyTier: "public" as EntityPlatformPrivacyTier,
      };

    if (isDirectAffinity(affinity)) existing.direct.push(affinity);
    if (isRolledAffinity(affinity)) existing.rolled.push(affinity);
    if (isNegativeAffinity(affinity)) existing.negative.push(affinity);
    existing.privacyTier = strictest(existing.privacyTier, affinity.privacyTier);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, AUTHOR_RECOMMENDATION_LIMITS.maxCandidates)
    .map(([authorId, value]) => {
      const summary = summaries.get(authorId);
      const evidence = [
        ...value.direct.map((affinity, index) =>
          evidenceFromAffinity(affinity, "direct_author_affinity", index)
        ),
        ...value.rolled.map((affinity, index) =>
          evidenceFromAffinity(affinity, "rolled_author_affinity", index)
        ),
        ...(summary ? [summaryEvidence(summary, 0)] : []),
      ];
      return {
        key: `author:${authorId}`,
        authorRef: value.ref,
        summary,
        directAffinities: value.direct,
        rolledAffinities: value.rolled,
        negativeAffinities: value.negative,
        privacyTier: value.privacyTier,
        evidence,
      };
    })
    .filter((candidate) => candidate.directAffinities.length + candidate.rolledAffinities.length > 0)
    .map((candidate) => ({
      ...candidate,
      authorRef: {
        ...candidate.authorRef,
        contractVersion:
          candidate.authorRef.contractVersion ?? ENTITY_PLATFORM_CONTRACT_VERSION,
      },
    }));
}

