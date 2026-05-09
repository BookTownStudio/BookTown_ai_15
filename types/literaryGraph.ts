import type { Book } from "./entities.ts";

export type LiteraryRelationshipType =
  | "influenced_by"
  | "influenced"
  | "same_tradition"
  | "same_movement"
  | "same_period"
  | "responds_to"
  | "similar_theme"
  | "philosophical_relation"
  | "historical_relation"
  | "thematic_affinity"
  | "same_cycle"
  | "literary_response_to"
  | "contemporary_of";

export type GraphRelationshipType =
  | LiteraryRelationshipType
  | "same_form"
  | "same_subform";

export type BookSemanticGraphDirection =
  | "outgoing"
  | "incoming"
  | "undirected";

export type BookSemanticGraphSource =
  | "explicit_relationship"
  | "same_tradition"
  | "same_form"
  | "same_subform"
  | "same_movement";

export type BookSemanticGraphOntology = {
  form: string;
  subForm: string;
  canonicalTradition: string;
};

export type BookSemanticRefs = {
  schemaVersion: 1;
  traditionEntityId?: string;
  movementEntityIds?: string[];
  philosophyEntityIds?: string[];
  civilizationEntityIds?: string[];
  historicalPeriodEntityIds?: string[];
};

export type RelatedWorkGraphItem = {
  bookId: string;
  relationshipType: GraphRelationshipType;
  direction: BookSemanticGraphDirection;
  source: BookSemanticGraphSource;
  confidence: number;
  relationshipId?: string;
  book: Book;
};

export type BookSemanticGraph = {
  bookId: string;
  ontology: BookSemanticGraphOntology;
  semanticRefs: BookSemanticRefs | null;
  relatedWorks: RelatedWorkGraphItem[];
  groups: {
    explicitRelationshipCount: number;
    relationshipCounts: Record<string, number>;
    sameTraditionCount: number;
    sameFormCount: number;
    sameSubformCount: number;
    sameMovementCount: number;
  };
};
