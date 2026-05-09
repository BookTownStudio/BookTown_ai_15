export const LITERARY_RELATIONSHIP_COLLECTIONS = {
  relationships: "literary_relationships",
} as const;

export type LiteraryRelationshipCollectionName =
  (typeof LITERARY_RELATIONSHIP_COLLECTIONS)[keyof typeof LITERARY_RELATIONSHIP_COLLECTIONS];