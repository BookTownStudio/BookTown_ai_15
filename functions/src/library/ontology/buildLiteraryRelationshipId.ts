import type { LiteraryRelationship } from "./literaryRelationship";

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "");
}

export function buildLiteraryRelationshipId(
  relationship: Pick<
    LiteraryRelationship,
    | "fromEntityType"
    | "fromEntityId"
    | "relationshipType"
    | "toEntityType"
    | "toEntityId"
  >
): string {
  return [
    normalize(relationship.fromEntityType),
    normalize(relationship.fromEntityId),
    normalize(relationship.relationshipType),
    normalize(relationship.toEntityType),
    normalize(relationship.toEntityId),
  ].join("__");
}