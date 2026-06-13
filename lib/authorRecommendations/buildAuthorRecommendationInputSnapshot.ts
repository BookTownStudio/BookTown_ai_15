import type {
  EntityAffinity,
  EntitySummary,
  LiteraryEntityRef,
} from "../../contracts/entityPlatform";
import type { AuthorRecommendationInput } from "../domain/authorRecommendations";

export const AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS = {
  maxDirectAffinities: 100,
  maxRolledAffinities: 100,
  maxAuthors: 100,
} as const;

export interface AuthorRecommendationInputSnapshotSources {
  readonly uid: string;
  readonly generatedAt: string;
  readonly directAuthorAffinities?: readonly EntityAffinity[];
  readonly rolledAuthorAffinities?: readonly EntityAffinity[];
  readonly authorSummaries?: readonly EntitySummary[];
  readonly maxResults?: number;
}

type LifecycleLike = "recorded" | "withdrawn" | "deleted" | "anonymized";

function lifecycleState(value: EntityAffinity): LifecycleLike {
  const raw = (value as unknown as { readonly lifecycleState?: unknown }).lifecycleState;
  return raw === "withdrawn" || raw === "deleted" || raw === "anonymized"
    ? raw
    : "recorded";
}

function stableAffinityFingerprint(affinity: EntityAffinity): string {
  return [
    affinity.entityRef.entityId,
    affinity.affinityClass,
    affinity.strengthBand,
    affinity.confidence.toFixed(6),
    affinity.recency ?? "",
    affinity.provenance.sourceSystem ?? "",
    affinity.contributingSignalClasses.slice().sort().join(","),
  ].join(":");
}

function isCanonicalAuthorRef(ref: LiteraryEntityRef): boolean {
  return (
    ref.entityType === "author" &&
    ref.authorityState === "canonical" &&
    ref.authoritySource === "author_authority" &&
    ref.entityId.trim().length > 0
  );
}

function isCanonicalAuthorSummary(summary: EntitySummary): boolean {
  return (
    isCanonicalAuthorRef(summary.ref) &&
    summary.authorityState === "canonical" &&
    summary.title.trim().length > 0
  );
}

function isActiveAffinity(affinity: EntityAffinity): boolean {
  return lifecycleState(affinity) === "recorded" && isCanonicalAuthorRef(affinity.entityRef);
}

function isDirectAuthorAffinity(affinity: EntityAffinity): boolean {
  return (
    affinity.affinityClass === "explicit" &&
    (affinity.provenance.sourceSystem === "author_follow" ||
      affinity.contributingSignalClasses.includes("interaction:following") ||
      affinity.contributingSignalClasses.includes("source:author_follow"))
  );
}

function isRolledAuthorAffinity(affinity: EntityAffinity): boolean {
  return (
    affinity.provenance.sourceSystem === "work_to_author_rollup" ||
    affinity.contributingSignalClasses.includes("rollup:work_to_author")
  );
}

function byAuthorId(left: { entityRef: LiteraryEntityRef }, right: { entityRef: LiteraryEntityRef }): number {
  return left.entityRef.entityId.localeCompare(right.entityRef.entityId);
}

function bySummaryAuthorId(left: EntitySummary, right: EntitySummary): number {
  return left.ref.entityId.localeCompare(right.ref.entityId);
}

function uniqueByAuthorId(values: readonly EntityAffinity[]): readonly EntityAffinity[] {
  const byId = new Map<string, EntityAffinity>();
  for (const affinity of values) {
    if (!byId.has(affinity.entityRef.entityId)) {
      byId.set(affinity.entityRef.entityId, affinity);
    }
  }
  return Array.from(byId.values()).sort(byAuthorId);
}

function uniqueAuthorIds(values: readonly EntityAffinity[]): readonly string[] {
  return Array.from(new Set(values.map((affinity) => affinity.entityRef.entityId))).sort();
}

export function buildAuthorRecommendationInputSnapshot(
  sources: AuthorRecommendationInputSnapshotSources
): AuthorRecommendationInput {
  const canonicalSummaries = new Map(
    [...(sources.authorSummaries ?? [])]
      .filter(isCanonicalAuthorSummary)
      .sort(bySummaryAuthorId)
      .slice(0, AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS.maxAuthors)
      .map((summary) => [summary.ref.entityId, summary])
  );

  const direct = uniqueByAuthorId(
    [...(sources.directAuthorAffinities ?? [])]
      .filter(isActiveAffinity)
      .filter(isDirectAuthorAffinity)
      .filter((affinity) => canonicalSummaries.has(affinity.entityRef.entityId))
      .sort(byAuthorId)
  ).slice(0, AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS.maxDirectAffinities);

  const rolled = uniqueByAuthorId(
    [...(sources.rolledAuthorAffinities ?? [])]
      .filter(isActiveAffinity)
      .filter(isRolledAuthorAffinity)
      .filter((affinity) => canonicalSummaries.has(affinity.entityRef.entityId))
      .sort(byAuthorId)
  ).slice(0, AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS.maxRolledAffinities);

  const includedAuthorIds = new Set(
    uniqueAuthorIds([...direct, ...rolled]).slice(
      0,
      AUTHOR_RECOMMENDATION_DISCOVERY_INPUT_LIMITS.maxAuthors
    )
  );

  return {
    uid: sources.uid,
    generatedAt: sources.generatedAt,
    ...(typeof sources.maxResults === "number" ? { maxResults: sources.maxResults } : {}),
    authorSummaries: Array.from(canonicalSummaries.values()).filter((summary) =>
      includedAuthorIds.has(summary.ref.entityId)
    ),
    authorAffinities: [...direct, ...rolled].filter((affinity) =>
      includedAuthorIds.has(affinity.entityRef.entityId)
    ),
    constraints: [
      {
        constraintId: "discovery_author_recommendations:privacy:approved_affinity_sources_only",
        constraintType: "privacy",
        description:
          "Discovery Author Recommendation snapshots include only approved direct and rolled Author affinity plus canonical Author summaries.",
        enforced: true,
      },
      {
        constraintId: "discovery_author_recommendations:scope:no_raw_activity",
        constraintType: "scope",
        description:
          "Raw reading, review, quote, shelf, search, AI, MatchMaker, and interaction payloads are excluded.",
        enforced: true,
      },
    ],
  };
}

export function authorRecommendationInputSnapshotFingerprint(
  input: AuthorRecommendationInput
): string {
  const authorIds = input.authorSummaries
    .map((summary) => summary.ref.entityId)
    .sort()
    .join(",");
  const affinityFingerprint = input.authorAffinities
    .map(stableAffinityFingerprint)
    .sort()
    .join("|");

  return [
    input.uid,
    input.generatedAt,
    input.maxResults ?? "default",
    authorIds,
    affinityFingerprint,
    input.constraints?.length ?? 0,
  ].join("#");
}
