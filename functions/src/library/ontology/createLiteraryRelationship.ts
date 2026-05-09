import * as admin from "firebase-admin";

import type { LiteraryRelationship } from "./literaryRelationship";

import { validateLiteraryRelationship } from "./validateLiteraryRelationship";

import { buildLiteraryRelationshipId } from "./buildLiteraryRelationshipId";
import { buildCanonicalLiteraryRelationshipIdentity } from "./literaryRelationshipIdentity";

import { LITERARY_RELATIONSHIP_COLLECTIONS } from "./literaryRelationshipCollections";

const db = admin.firestore();

export async function createLiteraryRelationship(
  relationship: LiteraryRelationship
): Promise<{
  success: boolean;
  relationshipId?: string;
  errors?: string[];
}> {
  const errors = validateLiteraryRelationship(relationship);

  if (errors.length > 0) {
    return {
      success: false,
      errors,
    };
  }

  const relationshipId =
    buildLiteraryRelationshipId(relationship);
  const identity =
    buildCanonicalLiteraryRelationshipIdentity(relationship);

  const ref = db
    .collection(
      LITERARY_RELATIONSHIP_COLLECTIONS.relationships
    )
    .doc(relationshipId);

  const existing = await ref.get();

  if (existing.exists) {
    return {
      success: false,
      errors: ["Relationship already exists"],
    };
  }

  await ref.set({
    ...relationship,
    canonicalRelationshipId: relationshipId,
    canonicalFromEntityType: identity.fromEntityType,
    canonicalFromEntityId: identity.fromEntityId,
    canonicalRelationshipType: identity.relationshipType,
    canonicalToEntityType: identity.toEntityType,
    canonicalToEntityId: identity.toEntityId,
    directional: identity.directional,
    relationshipId,
    createdAt:
      relationship.createdAt ||
      admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    relationshipId,
  };
}
