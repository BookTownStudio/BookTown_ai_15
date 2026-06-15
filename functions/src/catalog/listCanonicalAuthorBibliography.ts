import { HttpsError, onCall } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { buildCatalogBookView, isPublicReadableBook } from "./catalogBookView";

const db = admin.firestore();
const AUTHOR_BOOKS_LIMIT = 60;
const AUDIT_LIMIT = 60;

function asNonEmptyString(value: unknown, maxLen = 256): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function publicationSortKey(book: Record<string, unknown>): string {
  return asNonEmptyString(book.publicationDate, 64) || "9999-99-99";
}

function titleSortKey(book: Record<string, unknown>): string {
  return (
    asNonEmptyString(book.titleEn, 300) ||
    asNonEmptyString(book.title, 300) ||
    asNonEmptyString(book.titleAr, 300)
  ).toLocaleLowerCase();
}

function sortEntries<T extends { data: Record<string, unknown>; bookId: string }>(entries: T[]): T[] {
  return [...entries].sort((left, right) => {
    const publication = publicationSortKey(left.data).localeCompare(publicationSortKey(right.data));
    if (publication !== 0) return publication;
    const title = titleSortKey(left.data).localeCompare(titleSortKey(right.data));
    if (title !== 0) return title;
    return left.bookId.localeCompare(right.bookId);
  });
}

function auditTitle(data: Record<string, unknown>, bookId: string): string {
  return asNonEmptyString(data.titleEn, 300) || asNonEmptyString(data.title, 300) || bookId;
}

export async function listCanonicalAuthorBibliographyHandler(
  data: { authorId?: unknown },
  firestore: FirebaseFirestore.Firestore = db
) {
  const authorId = asNonEmptyString(data.authorId);
  if (!authorId) {
    throw new HttpsError("invalid-argument", "A valid authorId is required.");
  }

  const authorSnap = await firestore.collection("authors").doc(authorId).get();
  if (!authorSnap.exists) {
    throw new HttpsError("not-found", "Author not found.");
  }

  const author = (authorSnap.data() || {}) as Record<string, unknown>;
  const lifecycleState =
    asNonEmptyString(author.lifecycleState, 64) ||
    asNonEmptyString(author.authorityState, 64) ||
    asNonEmptyString(author.status, 64);
  if (
    author.requiresCanonicalization === true ||
    lifecycleState === "candidate" ||
    lifecycleState === "merged" ||
    lifecycleState === "split" ||
    lifecycleState === "superseded" ||
    lifecycleState === "archived" ||
    asNonEmptyString(author.mergeTargetAuthorId) ||
    asNonEmptyString(author.supersededByAuthorId)
  ) {
    throw new HttpsError("failed-precondition", "Author is not an active canonical authority.");
  }

  const canonicalSnap = await firestore
    .collection("books")
    .where("authorId", "==", authorId)
    .limit(AUTHOR_BOOKS_LIMIT)
    .get();

  const canonicalEntries = sortEntries(
    canonicalSnap.docs
      .map((doc) => ({ bookId: doc.id, data: (doc.data() || {}) as Record<string, unknown> }))
      .filter((entry) => isPublicReadableBook(entry.data))
  );

  const canonicalWorks = await Promise.all(
    canonicalEntries.map((entry) => buildCatalogBookView(entry.bookId, entry.data))
  );

  const authorNameEn = asNonEmptyString(author.nameEn, 300);
  let unlinkedNameMatches: Array<{
    bookId: string;
    title: string;
    currentAuthorId: string;
    reason: "author_name_match_author_id_mismatch";
  }> = [];

  if (authorNameEn) {
    const repairSnap = await firestore
      .collection("books")
      .where("authorEn", "==", authorNameEn)
      .limit(AUDIT_LIMIT)
      .get();
    const canonicalIds = new Set(canonicalEntries.map((entry) => entry.bookId));
    unlinkedNameMatches = sortEntries(
      repairSnap.docs
        .map((doc) => ({ bookId: doc.id, data: (doc.data() || {}) as Record<string, unknown> }))
        .filter((entry) => !canonicalIds.has(entry.bookId))
        .filter((entry) => asNonEmptyString(entry.data.authorId) !== authorId)
        .filter((entry) => isPublicReadableBook(entry.data))
    ).map((entry) => ({
      bookId: entry.bookId,
      title: auditTitle(entry.data, entry.bookId),
      currentAuthorId: asNonEmptyString(entry.data.authorId),
      reason: "author_name_match_author_id_mismatch" as const,
    }));
  }

  return {
    books: canonicalWorks,
    canonicalWorks,
    repairWorks: [],
    bibliographyAuthority: canonicalWorks.length > 0 ? "canonical_author_id" : "none",
    totalCanonicalCount: canonicalWorks.length,
    totalRepairCount: 0,
    suppressedRepairCount: unlinkedNameMatches.length,
    hasMore: canonicalSnap.size >= AUTHOR_BOOKS_LIMIT,
    audit: {
      mode: "dry_run",
      unlinkedNameMatchCount: unlinkedNameMatches.length,
      unlinkedNameMatches,
    },
  };
}

export const listCanonicalAuthorBibliography = onCall({ cors: true }, async (request) => {
  return listCanonicalAuthorBibliographyHandler(
    (request.data as { authorId?: unknown } | undefined) ?? {}
  );
});
