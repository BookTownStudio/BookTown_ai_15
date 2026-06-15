import { admin } from "../firebaseAdmin";
import {
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type CanonicalGraphRelationship,
  type GraphEntityReference,
  type GraphRelationshipDirection,
  type GraphRelationshipEvidence,
  type GraphRelationshipLifecycleState,
  type GraphRelationshipProvenanceClass,
  type LiteraryEntityRef,
} from "../contracts/shared/entityPlatform";

export const GRAPH_RELATIONSHIPS_COLLECTION = "graph_relationships";

const ACTIVE_CANONICAL_STATES = new Set(["canonical", "enriched"]);
const TIER1_AUTHORITY_SOURCE_BY_TYPE: Readonly<Record<string, string>> = {
  work: "work_authority",
  author: "author_authority",
  quote: "quote_authority",
};
const ADMISSIBLE_LIFECYCLE_STATES = new Set<GraphRelationshipLifecycleState>([
  "candidate",
  "accepted",
  "canonical",
  "derived",
  "evidence_only",
]);
const ENTITY_COLLECTION_BY_TYPE: Readonly<Record<string, string>> = {
  work: "books",
  author: "authors",
  quote: "quotes",
};
const CLOSED_ENTITY_STATES = new Set([
  "archived",
  "candidate",
  "deprecated",
  "disputed",
  "duplicate",
  "merged",
  "paraphrase",
  "reader_highlight",
  "split",
  "superseded",
  "unresolved",
  "variant",
]);

type FirestoreWriter = {
  set: (ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>, options: { merge: true }) => unknown;
};

export interface RuntimeEntityAuthorityResolution {
  readonly eligible: boolean;
  readonly reason: string;
  readonly ref: LiteraryEntityRef;
}

export type RuntimeEntityAuthorityResolver = (
  ref: LiteraryEntityRef
) => RuntimeEntityAuthorityResolution | Promise<RuntimeEntityAuthorityResolution>;

export interface GraphRelationshipAdmissionInput {
  readonly source: GraphEntityReference;
  readonly target: GraphEntityReference;
  readonly relationshipType: string;
  readonly direction: GraphRelationshipDirection;
  readonly lifecycleState: GraphRelationshipLifecycleState;
  readonly provenanceClass: GraphRelationshipProvenanceClass;
  readonly evidence: readonly GraphRelationshipEvidence[];
  readonly admittedBy: string;
  readonly admittedAt: string;
  readonly relationshipId?: string;
  readonly supersedesRelationshipId?: string;
  readonly sourceAuthorityResolver?: RuntimeEntityAuthorityResolver;
  readonly targetAuthorityResolver?: RuntimeEntityAuthorityResolver;
}

function normalizeIdPart(value: string): string {
  return value.trim().replace(/[/:]/g, "_").slice(0, 190);
}

function stableRelationshipId(input: GraphRelationshipAdmissionInput): string {
  return [
    normalizeIdPart(input.source.ref.entityType),
    normalizeIdPart(input.source.ref.entityId),
    normalizeIdPart(input.relationshipType),
    normalizeIdPart(input.target.ref.entityType),
    normalizeIdPart(input.target.ref.entityId),
    normalizeIdPart(input.direction),
  ].join(":");
}

function isActiveCanonicalTier1Ref(ref: LiteraryEntityRef): boolean {
  const expectedAuthority = TIER1_AUTHORITY_SOURCE_BY_TYPE[ref.entityType];
  return (
    typeof expectedAuthority === "string" &&
    ACTIVE_CANONICAL_STATES.has(ref.authorityState) &&
    ref.authoritySource === expectedAuthority &&
    ref.entityId.trim().length > 0 &&
    !ref.mergeTarget
  );
}

export function resolveRuntimeEntityAuthority(
  ref: LiteraryEntityRef
): RuntimeEntityAuthorityResolution {
  if (!isActiveCanonicalTier1Ref(ref)) {
    return {
      eligible: false,
      reason: "entity_ref_not_active_canonical_tier1",
      ref,
    };
  }

  return {
    eligible: true,
    reason: "active_canonical_tier1_entity",
    ref,
  };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasClosedEntityState(data: Record<string, unknown>): boolean {
  const lifecycleState =
    readString(data.lifecycleState) ||
    readString(data.authorityState) ||
    readString(data.quoteLifecycleState) ||
    readString(data.status);
  return CLOSED_ENTITY_STATES.has(lifecycleState);
}

function hasMergeOrReplacementPointer(data: Record<string, unknown>): boolean {
  return Boolean(
    readString(data.mergeTargetAuthorId) ||
      readString(data.mergeTargetQuoteId) ||
      readString(data.mergedIntoBookId) ||
      readString(data.duplicateOfQuoteId) ||
      readString(data.supersededByAuthorId)
  );
}

export async function resolveRuntimeEntityAuthorityFromFirestore(
  db: FirebaseFirestore.Firestore,
  ref: LiteraryEntityRef
): Promise<RuntimeEntityAuthorityResolution> {
  const structural = resolveRuntimeEntityAuthority(ref);
  if (!structural.eligible) {
    return structural;
  }

  const collection = ENTITY_COLLECTION_BY_TYPE[ref.entityType];
  if (!collection) {
    return {
      eligible: false,
      reason: "entity_type_not_runtime_resolvable",
      ref,
    };
  }

  const snap = await db.collection(collection).doc(ref.entityId).get();
  if (!snap.exists) {
    return {
      eligible: false,
      reason: "entity_authority_document_not_found",
      ref,
    };
  }

  const data = snap.data() ?? {};
  if (hasClosedEntityState(data) || hasMergeOrReplacementPointer(data)) {
    return {
      eligible: false,
      reason: "entity_authority_document_not_active",
      ref,
    };
  }

  return {
    eligible: true,
    reason: "persisted_active_canonical_tier1_entity",
    ref,
  };
}

export function createFirestoreRuntimeEntityAuthorityResolver(
  db: FirebaseFirestore.Firestore
): RuntimeEntityAuthorityResolver {
  return (ref) => resolveRuntimeEntityAuthorityFromFirestore(db, ref);
}

function validateGraphEndpoint(endpoint: GraphEntityReference, label: "source" | "target"): void {
  if (endpoint.graphEligible !== true) {
    throw new Error(`Graph relationship ${label} endpoint is not graph eligible.`);
  }
  if (!endpoint.ref || endpoint.ref.entityId.trim().length === 0) {
    throw new Error(`Graph relationship ${label} endpoint requires a stable entity ref.`);
  }
}

function validateEvidence(evidence: readonly GraphRelationshipEvidence[]): void {
  if (evidence.length === 0) {
    throw new Error("Canonical graph relationship admission requires evidence.");
  }

  for (const item of evidence) {
    if (item.evidenceId.trim().length === 0) {
      throw new Error("Graph relationship evidence requires a stable evidenceId.");
    }
    if (item.confidence < 0 || item.confidence > 1) {
      throw new Error("Graph relationship evidence confidence must be between 0 and 1.");
    }
  }
}

async function resolveEndpoint(
  ref: LiteraryEntityRef,
  resolver: RuntimeEntityAuthorityResolver | undefined
): Promise<RuntimeEntityAuthorityResolution> {
  return resolver ? resolver(ref) : resolveRuntimeEntityAuthority(ref);
}

export async function admitCanonicalGraphRelationship(
  input: GraphRelationshipAdmissionInput
): Promise<CanonicalGraphRelationship> {
  validateGraphEndpoint(input.source, "source");
  validateGraphEndpoint(input.target, "target");
  validateEvidence(input.evidence);

  if (input.relationshipType.trim().length === 0) {
    throw new Error("Canonical graph relationship requires a relationshipType.");
  }
  if (!ADMISSIBLE_LIFECYCLE_STATES.has(input.lifecycleState)) {
    throw new Error("Canonical graph relationship admission cannot create closed lifecycle states.");
  }

  const [sourceAuthority, targetAuthority] = await Promise.all([
    resolveEndpoint(input.source.ref, input.sourceAuthorityResolver),
    resolveEndpoint(input.target.ref, input.targetAuthorityResolver),
  ]);
  const eligible = sourceAuthority.eligible && targetAuthority.eligible;

  if (!eligible) {
    throw new Error(
      `Canonical graph relationship requires active canonical Tier-1 endpoints: ${sourceAuthority.reason}, ${targetAuthority.reason}.`
    );
  }

  const relationshipId = input.relationshipId?.trim() || stableRelationshipId(input);
  const confidence = Math.min(
    1,
    Math.max(0, input.evidence.reduce((max, item) => Math.max(max, item.confidence), 0))
  );

  return {
    relationshipId,
    source: input.source,
    target: input.target,
    relationshipType: input.relationshipType.trim(),
    direction: input.direction,
    lifecycleState: input.lifecycleState,
    provenanceClass: input.provenanceClass,
    provenance: {
      sourceClass: "system",
      sourceSystem: "literary_graph_authority",
      sourceId: relationshipId,
      evidence: input.evidence.map((item) => item.evidenceId),
    },
    evidence: input.evidence,
    eligibility: {
      eligible: true,
      reason: "active_canonical_tier1_endpoints",
      checkedAt: input.admittedAt,
      sourceEntityEligible: true,
      targetEntityEligible: true,
    },
    confidence,
    ...(input.supersedesRelationshipId ? { supersedesRelationshipId: input.supersedesRelationshipId } : {}),
    admittedBy: input.admittedBy,
    admittedAt: input.admittedAt,
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
  };
}

export function writeCanonicalGraphRelationship(
  writer: FirestoreWriter,
  db: FirebaseFirestore.Firestore,
  relationship: CanonicalGraphRelationship
): void {
  const ref = db.collection(GRAPH_RELATIONSHIPS_COLLECTION).doc(relationship.relationshipId);
  writer.set(
    ref,
    {
      ...relationship,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      version: 1,
    },
    { merge: true }
  );
}

export async function writeCanonicalGraphRelationshipDirect(
  db: FirebaseFirestore.Firestore,
  relationship: CanonicalGraphRelationship
): Promise<void> {
  const ref = db.collection(GRAPH_RELATIONSHIPS_COLLECTION).doc(relationship.relationshipId);
  await ref.set(
    {
      ...relationship,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      version: 1,
    },
    { merge: true }
  );
}
