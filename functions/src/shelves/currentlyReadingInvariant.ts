import { HttpsError } from "firebase-functions/v2/https";

const CURRENTLY_READING_SHELF_ID = "currently-reading";

function sanitizeString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function normalizeShelfId(value: unknown): string {
  return sanitizeString(value, 190).toLowerCase();
}

export function isSemanticCurrentlyReadingShelf(params: {
  physicalShelfId: string;
  shelfData: Record<string, unknown>;
}): boolean {
  if (params.shelfData.isSystem !== true) {
    return false;
  }

  const semanticShelfId = normalizeShelfId(params.shelfData.id);
  if (semanticShelfId === CURRENTLY_READING_SHELF_ID) {
    return true;
  }

  const physicalShelfId = normalizeShelfId(params.physicalShelfId);
  return (
    physicalShelfId === CURRENTLY_READING_SHELF_ID ||
    physicalShelfId.endsWith(`_${CURRENTLY_READING_SHELF_ID}`)
  );
}

export function assertShelfAllowsEntryMutation(params: {
  physicalShelfId: string;
  shelfData: Record<string, unknown>;
}): void {
  if (isSemanticCurrentlyReadingShelf(params)) {
    throw new HttpsError("failed-precondition", "CURRENTLY_READING_IS_PROGRESS_MANAGED");
  }
}
