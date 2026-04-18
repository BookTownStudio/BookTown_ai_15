export async function materializeEdition(
  searchResult: unknown
): Promise<{ bookId: string; editionId: string }> {
  void searchResult;

  throw new Error(
    "AUTHORITY_SPINE_REQUIRED: materializeEdition is disabled. Route Work and Edition writes through materializeBookAuthorityInTransaction."
  );
}
