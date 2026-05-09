import {
  LITERARY_RELATIONSHIP_TYPES,
} from "./literaryRelationshipTypes";

import type {
  LiteraryRelationship,
  LiteraryRelationshipEntityType,
} from "./literaryRelationship";

const VALID_ENTITY_TYPES: LiteraryRelationshipEntityType[] = [
  "book",
  "author",
  "movement",
  "tradition",
  "philosophy",
  "historical_period",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateLiteraryRelationship(
  relationship: LiteraryRelationship
): string[] {
  const errors: string[] = [];

  if (!VALID_ENTITY_TYPES.includes(relationship.fromEntityType)) {
    errors.push("Invalid fromEntityType");
  }

  if (!VALID_ENTITY_TYPES.includes(relationship.toEntityType)) {
    errors.push("Invalid toEntityType");
  }

  if (!isNonEmptyString(relationship.fromEntityId)) {
    errors.push("Missing fromEntityId");
  }

  if (!isNonEmptyString(relationship.toEntityId)) {
    errors.push("Missing toEntityId");
  }

  if (
    !LITERARY_RELATIONSHIP_TYPES.includes(
      relationship.relationshipType
    )
  ) {
    errors.push("Invalid relationshipType");
  }

  if (
    typeof relationship.confidence !== "number" ||
    relationship.confidence < 0 ||
    relationship.confidence > 1
  ) {
    errors.push("Invalid confidence");
  }

  if (
    relationship.fromEntityType === relationship.toEntityType &&
    relationship.fromEntityId === relationship.toEntityId
  ) {
    errors.push("Self-referencing relationships are not allowed");
  }

  return errors;
}