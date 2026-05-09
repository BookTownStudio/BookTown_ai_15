import * as admin from "firebase-admin";

import type { LiteraryRelationship } from "./literaryRelationship";

import { validateLiteraryRelationship } from "./validateLiteraryRelationship";

import { buildLiteraryRelationshipId } from "./buildLiteraryRelationshipId";

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