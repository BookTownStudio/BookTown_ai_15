import * as admin from "firebase-admin";

import {
  LITERARY_RELATIONSHIP_COLLECTIONS,
} from "./literaryRelationshipCollections";

import type {
  LiteraryRelationship,
  LiteraryRelationshipEntityType,
} from "./literaryRelationship";
import { readLiteraryRelationshipDocument } from "./readLiteraryRelationship";

const db = admin.firestore();

export async function queryLiteraryRelationships(params: {
  entityType: LiteraryRelationshipEntityType;
  entityId: string;
  relationshipType?: string;
  direction?: "from" | "to" | "both";
  limit?: number;
}): Promise<LiteraryRelationship[]> {
  const direction = params.direction || "from";
  const pageSize = Math.max(1, Math.min(params.limit || 50, 100));
  const collection = db.collection(
    LITERARY_RELATIONSHIP_COLLECTIONS.relationships
  );

  const queries: FirebaseFirestore.Query[] = [];
  if (direction === "from" || direction === "both") {
    let query = collection
      .where("fromEntityType", "==", params.entityType)
      .where("fromEntityId", "==", params.entityId)
      .limit(pageSize);
    if (params.relationshipType) {
      query = query.where("relationshipType", "==", params.relationshipType);
    }
    queries.push(query);
  }

  if (direction === "to" || direction === "both") {
    let query = collection
      .where("toEntityType", "==", params.entityType)
      .where("toEntityId", "==", params.entityId)
      .limit(pageSize);
    if (params.relationshipType) {
      query = query.where("relationshipType", "==", params.relationshipType);
    }
    queries.push(query);
  }

  const snapshots = await Promise.all(queries.map((query) => query.get()));
  const relationships: LiteraryRelationship[] = [];
  const seen = new Set<string>();

  for (const snapshot of snapshots) {
    for (const doc of snapshot.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      const relationship = readLiteraryRelationshipDocument(doc.id, doc.data());
      if (relationship) {
        relationships.push(relationship);
      }
    }
  }

  return relationships;
}
