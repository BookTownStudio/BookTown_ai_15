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

export const GRAPH_RELATIONSHIP_LIFECYCLE_STATES = [
  "candidate",
  "accepted",
  "canonical",
  "derived",
  "evidence_only",
  "rejected",
  "deprecated",
  "superseded",
  "archived",
] as const;

export type GraphRelationshipLifecycleState =
  (typeof GRAPH_RELATIONSHIP_LIFECYCLE_STATES)[number];

export const GRAPH_RELATIONSHIP_PROVENANCE_CLASSES = [
  "editorial",
  "seeded",
  "migration",
  "provider_evidence",
  "ai_evidence",
  "publishing_evidence",
  "identity_signal",
  "derived_ontology",
  "derived_graph",
] as const;

export type GraphRelationshipProvenanceClass =
  (typeof GRAPH_RELATIONSHIP_PROVENANCE_CLASSES)[number];

export interface GraphRelationshipEligibility {
  readonly eligible: boolean;
  readonly reason: string;
  readonly checkedAt: string;
  readonly sourceEntityEligible: boolean;
  readonly targetEntityEligible: boolean;
}

export interface GraphRelationshipEvidence {
  readonly evidenceId: string;
  readonly provenanceClass: GraphRelationshipProvenanceClass;
  readonly provenance: EntityPlatformProvenance;
  readonly confidence: number;
  readonly observedAt: string;
  readonly claim?: string;
  readonly sourceRef?: string;
}

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

export interface CanonicalGraphRelationship {
  readonly relationshipId: string;
  readonly source: GraphEntityReference;
  readonly target: GraphEntityReference;
  readonly relationshipType: string;
  readonly direction: GraphRelationshipDirection;
  readonly lifecycleState: GraphRelationshipLifecycleState;
  readonly provenanceClass: GraphRelationshipProvenanceClass;
  readonly provenance: EntityPlatformProvenance;
  readonly evidence: readonly GraphRelationshipEvidence[];
  readonly eligibility: GraphRelationshipEligibility;
  readonly confidence: number;
  readonly supersedesRelationshipId?: string;
  readonly supersededByRelationshipId?: string;
  readonly admittedBy: string;
  readonly admittedAt: string;
  readonly contractVersion: EntityPlatformContractVersion;
}
