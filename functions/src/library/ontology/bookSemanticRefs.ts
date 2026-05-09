export type BookSemanticRefs = {
  schemaVersion: 1;

  traditionEntityId?: string;

  movementEntityIds?: string[];

  philosophyEntityIds?: string[];

  civilizationEntityIds?: string[];

  historicalPeriodEntityIds?: string[];
};

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0
    )
  );
}

export function readBookSemanticRefs(
  value: unknown
): BookSemanticRefs | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const record =
    value as Record<string, unknown>;

  if (record.schemaVersion !== 1) {
    return null;
  }

  return {
    schemaVersion: 1,

    ...(typeof record.traditionEntityId === "string"
      ? {
          traditionEntityId:
            record.traditionEntityId,
        }
      : {}),

    ...(isStringArray(record.movementEntityIds)
      ? {
          movementEntityIds:
            record.movementEntityIds,
        }
      : {}),

    ...(isStringArray(record.philosophyEntityIds)
      ? {
          philosophyEntityIds:
            record.philosophyEntityIds,
        }
      : {}),

    ...(isStringArray(record.civilizationEntityIds)
      ? {
          civilizationEntityIds:
            record.civilizationEntityIds,
        }
      : {}),

    ...(isStringArray(
      record.historicalPeriodEntityIds
    )
      ? {
          historicalPeriodEntityIds:
            record.historicalPeriodEntityIds,
        }
      : {}),
  };
}