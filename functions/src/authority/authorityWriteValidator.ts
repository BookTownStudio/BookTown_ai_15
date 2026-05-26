import { HttpsError } from "firebase-functions/v2/https";

export type AuthorityDomain =
  | "book_identity"
  | "edition_identity"
  | "attachment_ownership"
  | "review_ownership"
  | "quote_ownership"
  | "shelf_membership"
  | "reader_continuity";

export type AuthorityWriter =
  | "materializeBookAuthority"
  | "editionAuthority"
  | "attachmentAuthority"
  | "reviewAuthority"
  | "quoteAuthority"
  | "shelfMembershipAuthority"
  | "readerContinuityAuthority";

type AuthorityValidationInput = {
  domain: AuthorityDomain;
  writer: string;
  mutation: Record<string, unknown>;
  allowedFields?: readonly string[];
};

export const PROTECTED_AUTHORITY_FIELDS: Record<AuthorityDomain, readonly string[]> = {
  book_identity: [
    "canonicalBookId",
    "canonicalSlug",
    "identityKey",
    "mergedIntoBookId",
    "readerAuthority",
  ],
  edition_identity: [
    "editionId",
    "bookId",
    "canonicalBookId",
    "sourceEditionId",
    "format",
    "language",
  ],
  attachment_ownership: [
    "attachmentId",
    "ebookAttachmentId",
    "attachmentStatus",
    "storagePath",
    "ebookStoragePath",
    "epubStoragePath",
  ],
  review_ownership: [
    "uid",
    "bookId",
    "rating",
    "reviewText",
    "reviewTags",
    "status",
    "visibility",
  ],
  quote_ownership: [
    "quoteText",
    "bookId",
    "chapter",
    "page",
    "sourceType",
    "authorUid",
    "anchor",
    "provenance",
    "visibility",
    "status",
  ],
  shelf_membership: [
    "uid",
    "bookId",
    "shelfId",
    "readingState",
    "addedAt",
    "removedAt",
  ],
  reader_continuity: [
    "uid",
    "bookId",
    "sessionId",
    "sourceSignatureHash",
    "attachmentId",
    "manifestVersion",
    "anchor",
    "progress",
  ],
};

export const AUTHORITY_WRITERS: Record<AuthorityDomain, AuthorityWriter> = {
  book_identity: "materializeBookAuthority",
  edition_identity: "editionAuthority",
  attachment_ownership: "attachmentAuthority",
  review_ownership: "reviewAuthority",
  quote_ownership: "quoteAuthority",
  shelf_membership: "shelfMembershipAuthority",
  reader_continuity: "readerContinuityAuthority",
};

function mutationFields(mutation: Record<string, unknown>): string[] {
  return Object.keys(mutation).filter((field) => field.trim().length > 0).sort();
}

export function validateAuthorityMutation(input: AuthorityValidationInput): void {
  const expectedWriter = AUTHORITY_WRITERS[input.domain];
  if (!expectedWriter) {
    throw new HttpsError("failed-precondition", "Unknown authority domain.");
  }

  const fields = mutationFields(input.mutation);
  const protectedFields = new Set(PROTECTED_AUTHORITY_FIELDS[input.domain]);
  const protectedMutations = fields.filter((field) => protectedFields.has(field));

  if (input.writer !== expectedWriter && protectedMutations.length > 0) {
    throw new HttpsError("permission-denied", "Mutation attempts to write protected authority fields.", {
      domain: input.domain,
      writer: input.writer,
      protectedFields: protectedMutations,
    });
  }

  if (input.allowedFields) {
    const allowed = new Set(input.allowedFields);
    const unknownFields = fields.filter((field) => !allowed.has(field));
    if (unknownFields.length > 0) {
      throw new HttpsError("invalid-argument", "Mutation contains unknown fields.", {
        domain: input.domain,
        writer: input.writer,
        unknownFields,
      });
    }
  }
}
