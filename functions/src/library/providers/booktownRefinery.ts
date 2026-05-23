export const BOOKTOWN_REFINERY_PROVIDER_ID = "booktownRefinery" as const;

export type BookTownRefineryProviderId = typeof BOOKTOWN_REFINERY_PROVIDER_ID;

export type BookTownRefineryArtifactSchemaVersion = 1;

export type BookTownRefineryArtifactStatus =
  | "candidate"
  | "validated"
  | "rejected";

export type BookTownRefineryConfidenceBand =
  | "low"
  | "medium"
  | "high";

export type BookTownRefineryEmbeddingDescriptor = {
  model: string;
  dimensions: number;
  vectorRef: string;
  contentHash: string;
  createdAt: string;
};

export type BookTownRefinerySemanticMetadata = {
  topics?: string[];
  motifs?: string[];
  movements?: string[];
  periods?: string[];
  regions?: string[];
};

export type BookTownRefineryOntologyProposal = {
  form?: string;
  subForm?: string;
  canonicalTradition?: string;
};

export type BookTownRefineryScores = {
  literaryQuality?: number;
  canonicalPotential?: number;
};

export type BookTownRefinerySemanticRefs = {
  schemaVersion: 1;
  traditionEntityId?: string;
  movementEntityIds?: string[];
  philosophyEntityIds?: string[];
  civilizationEntityIds?: string[];
  historicalPeriodEntityIds?: string[];
};

export type BookTownRefineryProvenance = {
  source: BookTownRefineryProviderId;
  artifactId: string;
  factoryVersion: string;
  contentHash: string;
  generatedAt: string;
};

export type BookTownRefineryArtifactDTO = {
  title: string;
  canonicalKey?: string;
  ontology?: BookTownRefineryOntologyProposal;
  literaryQuality?: number;
  canonicalPotential?: number;
  confidence?: BookTownRefineryConfidenceBand;
  semanticRefs?: BookTownRefinerySemanticRefs;
  embeddingDescriptor?: BookTownRefineryEmbeddingDescriptor;
  provenance: BookTownRefineryProvenance;
};

export type BookTownRefineryArtifact = {
  schemaVersion: BookTownRefineryArtifactSchemaVersion;
  provider: BookTownRefineryProviderId;
  artifactId: string;
  artifactStatus: BookTownRefineryArtifactStatus;
  sourceFactoryVersion: string;
  sourceContentHash: string;
  generatedAt: string;
  canonicalKey?: string;
  bookId?: string;
  ontology?: BookTownRefineryOntologyProposal;
  scores?: BookTownRefineryScores;
  confidence?: BookTownRefineryConfidenceBand;
  semanticMetadata?: BookTownRefinerySemanticMetadata;
  embedding?: BookTownRefineryEmbeddingDescriptor;
};

export const BOOKTOWN_REFINERY_AUTHORITY_RULES = {
  providerRole: "enrichment_only",
  mayEnterCanonicalBookWritePath: false,
  mayWriteFirestoreDirectly: false,
  mayOverrideCanonicalLocks: false,
  maySetCanonicalFieldTrust: false,
  mayCreateBookIdentityMappings: false,
  mustRouteAcceptedChangesThrough: "materializeBookAuthority",
} as const;

export const BOOKTOWN_REFINERY_FIELD_OWNERSHIP = {
  proposedOnly: [
    "ontology.form",
    "ontology.subForm",
    "ontology.canonicalTradition",
    "literaryQuality",
    "canonicalPotential",
    "semanticMetadata",
    "embedding.vectorRef",
  ],
  neverOwnedByRefinery: [
    "canonicalTitle",
    "canonicalAuthorIds",
    "canonicalKey",
    "originalLanguage",
    "workIdentity",
    "book_identity",
    "editions",
    "cover_jobs",
  ],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

export function validateBookTownRefineryArtifact(
  value: unknown
): value is BookTownRefineryArtifact {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.schemaVersion !== 1 ||
    value.provider !== BOOKTOWN_REFINERY_PROVIDER_ID ||
    !isNonEmptyString(value.artifactId) ||
    !isNonEmptyString(value.sourceFactoryVersion) ||
    !isNonEmptyString(value.sourceContentHash) ||
    !isNonEmptyString(value.generatedAt)
  ) {
    return false;
  }

  if (
    value.artifactStatus !== "candidate" &&
    value.artifactStatus !== "validated" &&
    value.artifactStatus !== "rejected"
  ) {
    return false;
  }

  if (
    value.confidence !== undefined &&
    value.confidence !== "low" &&
    value.confidence !== "medium" &&
    value.confidence !== "high"
  ) {
    return false;
  }

  if (value.scores !== undefined) {
    if (!isRecord(value.scores)) {
      return false;
    }
    if (
      value.scores.literaryQuality !== undefined &&
      !isScore(value.scores.literaryQuality)
    ) {
      return false;
    }
    if (
      value.scores.canonicalPotential !== undefined &&
      !isScore(value.scores.canonicalPotential)
    ) {
      return false;
    }
  }

  if (value.semanticMetadata !== undefined) {
    if (!isRecord(value.semanticMetadata)) {
      return false;
    }
    for (const field of ["topics", "motifs", "movements", "periods", "regions"]) {
      if (
        value.semanticMetadata[field] !== undefined &&
        !isStringArray(value.semanticMetadata[field])
      ) {
        return false;
      }
    }
  }

  if (value.embedding !== undefined) {
    if (
      !isRecord(value.embedding) ||
      !isNonEmptyString(value.embedding.model) ||
      !isNonEmptyString(value.embedding.vectorRef) ||
      !isNonEmptyString(value.embedding.contentHash) ||
      !isNonEmptyString(value.embedding.createdAt) ||
      typeof value.embedding.dimensions !== "number" ||
      !Number.isInteger(value.embedding.dimensions) ||
      value.embedding.dimensions <= 0
    ) {
      return false;
    }
  }

  return true;
}
