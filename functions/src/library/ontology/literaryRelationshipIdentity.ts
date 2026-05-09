import type {
  LiteraryRelationship,
  LiteraryRelationshipEntityType,
} from "./literaryRelationship";
import type { LiteraryRelationshipType } from "./literaryRelationshipTypes";
import {
  getCanonicalRelationshipTypeForIdentity,
  isDirectionalLiteraryRelationshipType,
} from "./literaryRelationshipTypes";

export type LiteraryRelationshipEndpoint = {
  entityType: LiteraryRelationshipEntityType;
  entityId: string;
};

export type CanonicalLiteraryRelationshipIdentity = {
  fromEntityType: LiteraryRelationshipEntityType;
  fromEntityId: string;
  relationshipType: LiteraryRelationshipType;
  toEntityType: LiteraryRelationshipEntityType;
  toEntityId: string;
  directional: boolean;
};

function normalizeIdentityPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/gu, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
}

function compareEndpoints(
  a: LiteraryRelationshipEndpoint,
  b: LiteraryRelationshipEndpoint
): number {
  const left = `${normalizeIdentityPart(a.entityType)}:${normalizeIdentityPart(a.entityId)}`;
  const right = `${normalizeIdentityPart(b.entityType)}:${normalizeIdentityPart(b.entityId)}`;
  return left.localeCompare(right);
}

export function buildCanonicalLiteraryRelationshipIdentity(
  relationship: Pick<
    LiteraryRelationship,
    | "fromEntityType"
    | "fromEntityId"
    | "relationshipType"
    | "toEntityType"
    | "toEntityId"
  >
): CanonicalLiteraryRelationshipIdentity {
  const canonicalType = getCanonicalRelationshipTypeForIdentity(
    relationship.relationshipType
  );
  const directional = isDirectionalLiteraryRelationshipType(canonicalType);

  let from: LiteraryRelationshipEndpoint = {
    entityType: relationship.fromEntityType,
    entityId: relationship.fromEntityId,
  };
  let to: LiteraryRelationshipEndpoint = {
    entityType: relationship.toEntityType,
    entityId: relationship.toEntityId,
  };

  if (relationship.relationshipType === "influenced_by") {
    from = {
      entityType: relationship.toEntityType,
      entityId: relationship.toEntityId,
    };
    to = {
      entityType: relationship.fromEntityType,
      entityId: relationship.fromEntityId,
    };
  }

  if (!directional && compareEndpoints(from, to) > 0) {
    [from, to] = [to, from];
  }

  return {
    fromEntityType: from.entityType,
    fromEntityId: from.entityId,
    relationshipType: canonicalType,
    toEntityType: to.entityType,
    toEntityId: to.entityId,
    directional,
  };
}

export function buildCanonicalLiteraryRelationshipId(
  relationship: Pick<
    LiteraryRelationship,
    | "fromEntityType"
    | "fromEntityId"
    | "relationshipType"
    | "toEntityType"
    | "toEntityId"
  >
): string {
  const identity = buildCanonicalLiteraryRelationshipIdentity(relationship);
  return [
    normalizeIdentityPart(identity.fromEntityType),
    normalizeIdentityPart(identity.fromEntityId),
    normalizeIdentityPart(identity.relationshipType),
    normalizeIdentityPart(identity.toEntityType),
    normalizeIdentityPart(identity.toEntityId),
  ].join("__");
}
