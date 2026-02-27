import { SearchResultDTO } from '../../types/bookSearch.ts';
import { View } from '../../types/navigation.ts';

export type PendingBookDetailsAction =
  | 'NONE'
  | 'ADD_TO_SHELF'
  | 'ATTACH_TO_POST';

export function resolveIngestionSource(
  result: SearchResultDTO
): 'googleBooks' | 'openLibrary' | null {
  if (result.source === 'googleBooks') return 'googleBooks';
  if (result.source === 'openLibrary') return 'openLibrary';
  return null;
}

export function buildBookDetailsParams(
  result: SearchResultDTO,
  from: View,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  if (result.resultType === 'canonical') {
    return {
      bookId: result.bookId,
      from,
      ...extra,
    };
  }

  return {
    bookId: result.id,
    from,
    searchResult: result,
    ...extra,
  };
}
