import {
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntityAffinity,
  type EntityRelationship,
  type EntitySummary,
  type LiteraryEntityRef,
  type MatchMakerInput,
  type UserEntityInteraction,
} from "../../../contracts/entityPlatform";

export const MATCHMAKER_SNAPSHOT_LIMITS = {
  maxAffinitySummaries: 50,
  maxInteractionSummaries: 50,
  maxEntityRefs: 50,
  maxEntitySummaries: 50,
  maxGraphRelationshipSummaries: 50,
} as const;

export interface MatchMakerSnapshotInput {
  readonly affinitySummaries?: readonly EntityAffinity[];
  readonly interactionSummaries?: readonly UserEntityInteraction[];
  readonly entityRefs?: readonly LiteraryEntityRef[];
  readonly entitySummaries?: readonly EntitySummary[];
  readonly graphRelationshipSummaries?: readonly EntityRelationship[];
  readonly profileContext?: Readonly<Record<string, unknown>>;
  readonly searchDiscoveryContext?: Readonly<Record<string, unknown>>;
  readonly availabilityConstraints?: Readonly<Record<string, unknown>>;
}

const BLOCKED_CONTEXT_KEY_PATTERNS = [
  "query",
  "raw",
  "history",
  "readinghistory",
  "searchhistory",
  "event",
  "events",
  "notification",
  "notifications",
  "recommendation",
  "recommendations",
] as const;

function takeBounded<T>(items: readonly T[] | undefined, limit: number): readonly T[] {
  return (items ?? []).slice(0, limit);
}

function shouldExcludeContextKey(key: string): boolean {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return BLOCKED_CONTEXT_KEY_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function isSafeContextValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.length <= 240;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) {
    return value.length <= 20 && value.every((item) => isSafeContextValue(item));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length <= 20 && entries.every(([key, nested]) => (
      !shouldExcludeContextKey(key) && isSafeContextValue(nested)
    ));
  }
  return false;
}

function toSafeContext(
  context: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined {
  if (!context) return undefined;

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (shouldExcludeContextKey(key)) continue;
    if (!isSafeContextValue(value)) continue;
    output[key] = value;
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

export function toBoundedAffinitySummaries(
  affinities: readonly EntityAffinity[] | undefined
): readonly EntityAffinity[] {
  return takeBounded(affinities, MATCHMAKER_SNAPSHOT_LIMITS.maxAffinitySummaries);
}

export function toBoundedInteractionSummaries(
  interactions: readonly UserEntityInteraction[] | undefined
): readonly UserEntityInteraction[] {
  return takeBounded(interactions, MATCHMAKER_SNAPSHOT_LIMITS.maxInteractionSummaries);
}

export function toBoundedEntityRefs(
  refs: readonly LiteraryEntityRef[] | undefined
): readonly LiteraryEntityRef[] {
  return takeBounded(refs, MATCHMAKER_SNAPSHOT_LIMITS.maxEntityRefs);
}

export function toBoundedEntitySummaries(
  summaries: readonly EntitySummary[] | undefined
): readonly EntitySummary[] {
  return takeBounded(summaries, MATCHMAKER_SNAPSHOT_LIMITS.maxEntitySummaries);
}

export function toBoundedGraphRelationshipSummaries(
  relationships: readonly EntityRelationship[] | undefined
): readonly EntityRelationship[] {
  return takeBounded(
    relationships,
    MATCHMAKER_SNAPSHOT_LIMITS.maxGraphRelationshipSummaries
  );
}

export function toPrivacySafeProfileContext(
  context: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined {
  return toSafeContext(context);
}

export function toSearchDiscoveryContext(
  context: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined {
  return toSafeContext(context);
}

/**
 * Builds a bounded MatchMakerInput compatibility snapshot.
 *
 * This adapter is pure. It does not retrieve data, generate recommendations,
 * rank entities, expand graph relationships, persist snapshots, or mutate
 * MatchMaker behavior.
 */
export function toMatchMakerInput(input: MatchMakerSnapshotInput): MatchMakerInput {
  const entityRefs = toBoundedEntityRefs(input.entityRefs);
  const entitySummaries = toBoundedEntitySummaries(input.entitySummaries);
  const graphRelationshipSummaries = toBoundedGraphRelationshipSummaries(
    input.graphRelationshipSummaries
  );
  const userAffinitySummaries = toBoundedAffinitySummaries(input.affinitySummaries);
  const interactionSummaries = toBoundedInteractionSummaries(input.interactionSummaries);
  const searchOrDiscoveryContext = toSearchDiscoveryContext(input.searchDiscoveryContext);
  const privacySafeProfileContext = toPrivacySafeProfileContext(input.profileContext);
  const availabilityConstraints = toSafeContext(input.availabilityConstraints);

  return {
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    ...(entityRefs.length > 0 ? { entityRefs } : {}),
    ...(entitySummaries.length > 0 ? { entitySummaries } : {}),
    ...(graphRelationshipSummaries.length > 0 ? { graphRelationshipSummaries } : {}),
    ...(userAffinitySummaries.length > 0 ? { userAffinitySummaries } : {}),
    ...(interactionSummaries.length > 0 ? { interactionSummaries } : {}),
    ...(searchOrDiscoveryContext ? { searchOrDiscoveryContext } : {}),
    ...(availabilityConstraints ? { availabilityConstraints } : {}),
    ...(privacySafeProfileContext ? { privacySafeProfileContext } : {}),
  };
}
