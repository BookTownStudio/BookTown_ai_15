import type { Shelf } from '../../types/entities.ts';

const CURRENTLY_READING_SHELF_ID = 'currently-reading';
const WANT_TO_READ_SHELF_ID = 'want-to-read';
const FINISHED_SHELF_ID = 'finished';

type SystemShelfSemanticId =
  | typeof CURRENTLY_READING_SHELF_ID
  | typeof WANT_TO_READ_SHELF_ID
  | typeof FINISHED_SHELF_ID;

function normalizeShelfId(value: string): string {
  return value.trim().toLowerCase();
}

function matchesSemanticSystemShelfId(
  physicalShelfId: string,
  semanticShelfId: SystemShelfSemanticId
): boolean {
  const normalizedPhysicalId = normalizeShelfId(physicalShelfId);
  return (
    normalizedPhysicalId === semanticShelfId ||
    normalizedPhysicalId.endsWith(`_${semanticShelfId}`)
  );
}

export function isSystemShelf(shelf: Pick<Shelf, 'isSystem'> | null | undefined): boolean {
  return shelf?.isSystem === true;
}

export function getSemanticSystemShelfId(
  shelf: Pick<Shelf, 'id' | 'isSystem'> | null | undefined
): SystemShelfSemanticId | null {
  if (!isSystemShelf(shelf)) {
    return null;
  }

  if (matchesSemanticSystemShelfId(shelf.id, CURRENTLY_READING_SHELF_ID)) {
    return CURRENTLY_READING_SHELF_ID;
  }
  if (matchesSemanticSystemShelfId(shelf.id, WANT_TO_READ_SHELF_ID)) {
    return WANT_TO_READ_SHELF_ID;
  }
  if (matchesSemanticSystemShelfId(shelf.id, FINISHED_SHELF_ID)) {
    return FINISHED_SHELF_ID;
  }

  return null;
}

export function isCurrentlyReadingShelf(
  shelf: Pick<Shelf, 'id' | 'isSystem'> | null | undefined
): boolean {
  return getSemanticSystemShelfId(shelf) === CURRENTLY_READING_SHELF_ID;
}

export function isSelectableOrganizationalShelf(
  shelf: Pick<Shelf, 'id' | 'isSystem'> | null | undefined
): boolean {
  return !isCurrentlyReadingShelf(shelf);
}

export function getSelectableOrganizationalShelves<T extends Pick<Shelf, 'id' | 'isSystem'>>(
  shelves: readonly T[] | null | undefined
): T[] {
  return (shelves || []).filter(isSelectableOrganizationalShelf);
}

export function getSystemShelfSortRank(
  shelf: Pick<Shelf, 'id' | 'isSystem'> | null | undefined
): number {
  const semanticShelfId = getSemanticSystemShelfId(shelf);
  if (semanticShelfId === CURRENTLY_READING_SHELF_ID) return 0;
  if (semanticShelfId === WANT_TO_READ_SHELF_ID) return 1;
  if (semanticShelfId === FINISHED_SHELF_ID) return 2;
  if (isSystemShelf(shelf)) return 3;
  return Number.MAX_SAFE_INTEGER;
}
