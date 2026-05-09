import type { Timestamp, FieldValue } from "firebase-admin/firestore";

import type { LiteraryRelationshipType } from "./literaryRelationshipTypes";

export type LiteraryRelationshipEntityType =
  | "book"
  | "author"
  | "movement"
  | "tradition"
  | "philosophy"
  | "historical_period";

export type LiteraryRelationship = {
  schemaVersion: 1;

  fromEntityType: LiteraryRelationshipEntityType;
  fromEntityId: string;

  toEntityType: LiteraryRelationshipEntityType;
  toEntityId: string;

  relationshipType: LiteraryRelationshipType;

  confidence: number;

  source:
    | "editorial"
    | "seed"
    | "migration"
    | "ai_assisted";

  createdAt: Timestamp | FieldValue | Date;

  notes?: string;
};

export function isValidRelationshipConfidence(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}