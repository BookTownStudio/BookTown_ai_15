import { normalizeSearchText } from "../search/normalization";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export type AuthorityAuthorReference = {
  canonicalAuthorIds: string[];
  normalizedAuthorNames: string[];
};

export function extractAuthorityAuthorReference(
  value: Record<string, unknown> | null | undefined
): AuthorityAuthorReference {
  const record = asRecord(value);
  if (!record) {
    return {
      canonicalAuthorIds: [],
      normalizedAuthorNames: [],
    };
  }

  const canonicalAuthorIds = uniqueStrings([
    asNonEmptyString(record.authorId),
    ...asStringArray(record.canonicalAuthorIds),
  ]);

  const normalizedAuthorNames = uniqueStrings([
    ...asStringArray(record.authorNamesNormalized),
    normalizeSearchText(asNonEmptyString(record.authorEn)),
    normalizeSearchText(asNonEmptyString(record.author)),
    normalizeSearchText(asNonEmptyString(record.authorAr)),
    ...asStringArray(record.authors).map((entry) => normalizeSearchText(entry)),
    ...asStringArray(record.author_name).map((entry) => normalizeSearchText(entry)),
  ]);

  return {
    canonicalAuthorIds,
    normalizedAuthorNames,
  };
}

export function areAuthorityAuthorsEquivalent(
  left: Record<string, unknown> | null | undefined,
  right: Record<string, unknown> | null | undefined
): boolean {
  const leftAuthor = extractAuthorityAuthorReference(left);
  const rightAuthor = extractAuthorityAuthorReference(right);

  if (leftAuthor.canonicalAuthorIds.length > 0 && rightAuthor.canonicalAuthorIds.length > 0) {
    return leftAuthor.canonicalAuthorIds.some((authorId) =>
      rightAuthor.canonicalAuthorIds.includes(authorId)
    );
  }

  if (leftAuthor.normalizedAuthorNames.length > 0 && rightAuthor.normalizedAuthorNames.length > 0) {
    return leftAuthor.normalizedAuthorNames.some((name) =>
      rightAuthor.normalizedAuthorNames.includes(name)
    );
  }

  return false;
}
