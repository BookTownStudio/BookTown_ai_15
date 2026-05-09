import type {
  LiteraryRelationship,
  LiteraryRelationshipEntityType,
} from "./literaryRelationship";
import {
  normalizeLiteraryRelationshipType,
  type LiteraryRelationshipType,
} from "./literaryRelationshipTypes";

const ENTITY_TYPES: LiteraryRelationshipEntityType[] = [
  "book",
  "author",
  "movement",
  "tradition",
  "philosophy",
  "historical_period",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asEntityType(value: unknown): LiteraryRelationshipEntityType | null {
  return ENTITY_TYPES.includes(value as LiteraryRelationshipEntityType)
    ? (value as LiteraryRelationshipEntityType)
    : null;
}

function asConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0, Math.min(1, numeric));
}

export function readLiteraryRelationshipDocument(
  docId: string,
  value: unknown
): (LiteraryRelationship & { relationshipId: string }) | null {
  const record = asRecord(value);
  if (!record) return null;

  const relationshipType = normalizeLiteraryRelationshipType(
    record.relationshipType
  );
  if (!relationshipType) return null;

  const fromEntityType = asEntityType(record.fromEntityType);
  const toEntityType = asEntityType(record.toEntityType);
  const fromEntityId = asNonEmptyString(record.fromEntityId);
  const toEntityId = asNonEmptyString(record.toEntityId);

  if (fromEntityType && toEntityType && fromEntityId && toEntityId) {
    return {
      schemaVersion: 1,
      fromEntityType,
      fromEntityId,
      toEntityType,
      toEntityId,
      relationshipType,
      confidence: asConfidence(record.confidence),
      source:
        record.source === "editorial" ||
        record.source === "seed" ||
        record.source === "migration" ||
        record.source === "ai_assisted"
          ? record.source
          : "editorial",
      createdAt: record.createdAt as LiteraryRelationship["createdAt"],
      ...(asNonEmptyString(record.notes)
        ? { notes: asNonEmptyString(record.notes) }
        : {}),
      relationshipId: asNonEmptyString(record.relationshipId) || docId,
    };
  }

  const sourceBookId = asNonEmptyString(record.sourceBookId);
  const targetBookId = asNonEmptyString(record.targetBookId);
  if (!sourceBookId || !targetBookId) return null;

  return {
    schemaVersion: 1,
    fromEntityType: "book",
    fromEntityId: sourceBookId,
    toEntityType: "book",
    toEntityId: targetBookId,
    relationshipType: relationshipType as LiteraryRelationshipType,
    confidence: asConfidence(record.confidence),
    source: "editorial",
    createdAt: record.createdAt as LiteraryRelationship["createdAt"],
    relationshipId: docId,
  };
}
