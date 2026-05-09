export const LITERARY_RELATIONSHIP_TYPES = {
  influenced_by: {
    directional: true,
  },

  influenced: {
    directional: true,
  },

  same_tradition: {
    directional: false,
  },

  same_movement: {
    directional: false,
  },

  same_period: {
    directional: false,
  },

  responds_to: {
    directional: true,
  },

  similar_theme: {
    directional: false,
  },

  philosophical_relation: {
    directional: false,
  },

  historical_relation: {
    directional: false,
  },

  thematic_affinity: {
    directional: false,
  },

  same_cycle: {
    directional: false,
  },

  literary_response_to: {
    directional: true,
  },

  contemporary_of: {
    directional: false,
  },
} as const;

export type LiteraryRelationshipType =
  keyof typeof LITERARY_RELATIONSHIP_TYPES;

export const DIRECTIONAL_LITERARY_RELATIONSHIP_TYPES: LiteraryRelationshipType[] = [
  "influenced_by",
  "influenced",
  "responds_to",
  "literary_response_to",
];

export const NON_DIRECTIONAL_LITERARY_RELATIONSHIP_TYPES: LiteraryRelationshipType[] = [
  "same_tradition",
  "same_movement",
  "same_period",
  "same_cycle",
  "similar_theme",
  "thematic_affinity",
  "philosophical_relation",
  "historical_relation",
  "contemporary_of",
];

export const LITERARY_RELATIONSHIP_TYPE_LIST: LiteraryRelationshipType[] =
  Object.keys(
    LITERARY_RELATIONSHIP_TYPES
  ) as LiteraryRelationshipType[];

export function isLiteraryRelationshipType(
  value: unknown
): value is LiteraryRelationshipType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(
      LITERARY_RELATIONSHIP_TYPES,
      value
    )
  );
}

export function normalizeLiteraryRelationshipType(
  value: unknown
): LiteraryRelationshipType | null {
  return isLiteraryRelationshipType(value) ? value : null;
}

export function isDirectionalLiteraryRelationshipType(
  relationshipType: LiteraryRelationshipType
): boolean {
  return LITERARY_RELATIONSHIP_TYPES[relationshipType].directional;
}

export function getCanonicalRelationshipTypeForIdentity(
  relationshipType: LiteraryRelationshipType
): LiteraryRelationshipType {
  if (relationshipType === "influenced_by") {
    return "influenced";
  }

  if (relationshipType === "literary_response_to") {
    return "responds_to";
  }

  return relationshipType;
}
