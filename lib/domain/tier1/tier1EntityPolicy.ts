import type {
  EntityAuthorityState,
  LiteraryEntityRef,
  LiteraryEntityType,
} from "../../../contracts/entityPlatform";

export type Tier1LiteraryAtom = Extract<LiteraryEntityType, "work" | "author" | "quote">;

export interface Tier1EntityEligibility {
  readonly search: boolean;
  readonly identityGraph: boolean;
  readonly literaryGraph: boolean;
  readonly matchmaker: boolean;
  readonly reason: string;
}

const TIER1_AUTHORITY_SOURCE_BY_ATOM: Readonly<Record<Tier1LiteraryAtom, string>> = {
  work: "work_authority",
  author: "author_authority",
  quote: "quote_authority",
};

const ACTIVE_CANONICAL_STATES = new Set<EntityAuthorityState>([
  "canonical",
  "enriched",
]);

const READABLE_NON_CANONICAL_STATES = new Set<EntityAuthorityState>([
  "candidate",
  "resolved",
  "deprecated",
  "merged",
  "split",
  "superseded",
  "archived",
  "unresolved",
]);

export function isTier1LiteraryAtom(type: LiteraryEntityType): type is Tier1LiteraryAtom {
  return type === "work" || type === "author" || type === "quote";
}

export function isActiveCanonicalTier1Ref(ref: LiteraryEntityRef): boolean {
  return (
    isTier1LiteraryAtom(ref.entityType) &&
    ACTIVE_CANONICAL_STATES.has(ref.authorityState) &&
    ref.authoritySource === TIER1_AUTHORITY_SOURCE_BY_ATOM[ref.entityType] &&
    ref.entityId.trim().length > 0 &&
    !ref.mergeTarget
  );
}

export function isReadableButNonCanonicalTier1Ref(ref: LiteraryEntityRef): boolean {
  return (
    isTier1LiteraryAtom(ref.entityType) &&
    READABLE_NON_CANONICAL_STATES.has(ref.authorityState)
  );
}

export function getTier1EntityEligibility(ref: LiteraryEntityRef): Tier1EntityEligibility {
  if (!isTier1LiteraryAtom(ref.entityType)) {
    return {
      search: false,
      identityGraph: false,
      literaryGraph: false,
      matchmaker: false,
      reason: "not_tier1_literary_atom",
    };
  }

  if (isActiveCanonicalTier1Ref(ref)) {
    return {
      search: true,
      identityGraph: true,
      literaryGraph: true,
      matchmaker: true,
      reason: "active_canonical_tier1_entity",
    };
  }

  if (ref.authorityState === "merged" && ref.mergeTarget) {
    return {
      search: false,
      identityGraph: false,
      literaryGraph: false,
      matchmaker: false,
      reason: "merged_entity_requires_survivor_resolution",
    };
  }

  if (isReadableButNonCanonicalTier1Ref(ref)) {
    return {
      search: ref.authorityState === "resolved",
      identityGraph: false,
      literaryGraph: false,
      matchmaker: false,
      reason: "non_canonical_tier1_entity",
    };
  }

  return {
    search: false,
    identityGraph: false,
    literaryGraph: false,
    matchmaker: false,
    reason: "unsupported_authority_state",
  };
}
