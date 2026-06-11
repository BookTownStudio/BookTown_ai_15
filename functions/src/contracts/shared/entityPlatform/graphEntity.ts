import type {
  EntityPlatformContractVersion,
  EntityPlatformProvenance,
} from "./common";
import type { EntityLifecycleState } from "./lifecycle";
import type { LiteraryEntityRef } from "./entityRef";

export const GRAPH_RELATIONSHIP_DIRECTIONS = [
  "directional",
  "reciprocal",
  "undirected",
] as const;

export type GraphRelationshipDirection =
  (typeof GRAPH_RELATIONSHIP_DIRECTIONS)[number];

export const GRAPH_RELATIONSHIP_SOURCES = [
  "editorial",
  "seeded",
  "migration",
  "provider_derived",
  "ai_assisted",
  "derived_ontology",
  "derived_identity_graph",
] as const;

export type GraphRelationshipSource =
  (typeof GRAPH_RELATIONSHIP_SOURCES)[number];

/**
 * A LiteraryEntityRef that is eligible for Literary Knowledge Graph use.
 */
export interface GraphEntityReference {
  readonly ref: LiteraryEntityRef;
  readonly graphEligible: true;
  readonly eligibilityProvenance?: EntityPlatformProvenance;
}

export interface EntityRelationship {
  readonly relationshipId: string;
  readonly source: GraphEntityReference;
  readonly target: GraphEntityReference;
  readonly relationshipType: string;
  readonly direction: GraphRelationshipDirection;
  readonly relationshipSource: GraphRelationshipSource;
  readonly provenance: EntityPlatformProvenance;
  readonly confidence: number;
  readonly lifecycleState: EntityLifecycleState;
  readonly contractVersion: EntityPlatformContractVersion;
}

