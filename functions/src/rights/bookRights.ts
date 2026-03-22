export type BookRightsMode = "public_free" | "private" | "paid" | "premium_only";

export type AttachmentVisibility = "public" | "restricted" | "private";

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function normalizeBookRightsMode(value: unknown): BookRightsMode {
  const normalized = asNonEmptyString(value).toLowerCase();
  if (normalized === "private") return "private";
  if (normalized === "paid") return "paid";
  if (normalized === "premium_only") return "premium_only";
  return "public_free";
}

export function resolveBookOwnerUid(book: Record<string, unknown>): string {
  return (
    asNonEmptyString(book.ownerUid) ||
    asNonEmptyString(book.ownerId) ||
    asNonEmptyString(book.createdBy) ||
    asNonEmptyString(book.uploadedByUid)
  );
}

export function isBookVisibleToPublic(book: Record<string, unknown>): boolean {
  const rightsMode = normalizeBookRightsMode(book.rightsMode);
  const visibility = asNonEmptyString(book.visibility).toLowerCase();
  if (rightsMode === "private") return false;
  if (visibility === "private") return false;
  return true;
}

export function canUserReadBook(
  book: Record<string, unknown>,
  uid?: string | null
): boolean {
  const ownerUid = resolveBookOwnerUid(book);
  if (ownerUid && ownerUid === uid) {
    return true;
  }
  return normalizeBookRightsMode(book.rightsMode) === "public_free" && isBookVisibleToPublic(book);
}

export function attachmentVisibilityForRightsMode(
  rightsMode: BookRightsMode
): AttachmentVisibility {
  if (rightsMode === "private") return "private";
  if (rightsMode === "paid" || rightsMode === "premium_only") return "restricted";
  return "public";
}

export function bookVisibilityForRightsMode(rightsMode: BookRightsMode): "public" | "private" {
  return rightsMode === "private" ? "private" : "public";
}
