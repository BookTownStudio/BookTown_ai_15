import type { LiteraryRelationship } from "./literaryRelationship";
import { buildCanonicalLiteraryRelationshipId } from "./literaryRelationshipIdentity";

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
  return buildCanonicalLiteraryRelationshipId(relationship);
}
