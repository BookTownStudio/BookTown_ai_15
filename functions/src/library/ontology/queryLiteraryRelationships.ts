import * as admin from "firebase-admin";

import {
  LITERARY_RELATIONSHIP_COLLECTIONS,
} from "./literaryRelationshipCollections";

import type {
  LiteraryRelationship,
  LiteraryRelationshipEntityType,
} from "./literaryRelationship";

const db = admin.firestore();

export async function queryLiteraryRelationships(params: {
  entityType: LiteraryRelationshipEntityType;
  entityId: string;
  relationshipType?: string;
}): Promise<LiteraryRelationship[]> {
  let query = db
    .collection(
      LITERARY_RELATIONSHIP_COLLECTIONS.relationships
    )
    .where("fromEntityType", "==", params.entityType)
    .where("fromEntityId", "==", params.entityId);

  if (params.relationshipType) {
    query = query.where(
      "relationshipType",
      "==",
      params.relationshipType
    );
  }

  const snapshot = await query.get();

  return snapshot.docs.map((doc) => {
    return doc.data() as LiteraryRelationship;
  });
}