import { useMemo } from "react";
import type { Book, Bookmark, Quote, Review } from "../../types/entities.ts";
import { dataService } from "../../services/dataService.ts";
import { callCallableEndpoint } from "../callable.ts";
import { useAuth } from "../auth.tsx";
import { useQuery } from "../react-query.ts";
import { formatPublicationLabel } from "../authors/authorCanon.ts";

const AUTHOR_MEMORY_WORK_LIMIT = 20;

type ReadingStatus = "reading" | "paused" | "abandoned" | "completed" | "rereading" | null;

interface BookShelfMembershipProjection {
  readonly readingState?: {
    readonly exists?: boolean;
    readonly status_state?: ReadingStatus;
  };
}

export interface AuthorReaderMemoryBook {
  readonly book: Book;
  readonly readingStatus: ReadingStatus;
  readonly userReview: Review | null;
}

export interface AuthorReaderMemoryModel {
  readonly isSignedIn: boolean;
  readonly isFollowed: boolean;
  readonly booksRead: readonly AuthorReaderMemoryBook[];
  readonly currentlyReading: readonly AuthorReaderMemoryBook[];
  readonly savedQuotes: readonly Quote[];
  readonly reviews: readonly Review[];
  readonly continuation: {
    readonly book: Book | null;
    readonly reason:
      | "currently_reading"
      | "next_unread_chronological"
      | "major_work"
      | "available_booktown_work"
      | "none";
    readonly label: string;
  };
}

function publicationYear(book: Book): number | null {
  const source = book.publicationDate || book.rawBook?.first_publish_year || book.rawBook?.firstPublishedYear;
  if (typeof source === "number" && Number.isFinite(source)) return source;
  if (typeof source !== "string") return null;
  const match = source.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

function byChronology(left: Book, right: Book): number {
  const leftYear = publicationYear(left);
  const rightYear = publicationYear(right);
  if (leftYear !== null && rightYear !== null && leftYear !== rightYear) return leftYear - rightYear;
  if (leftYear !== null && rightYear === null) return -1;
  if (leftYear === null && rightYear !== null) return 1;
  return (left.titleEn || left.titleAr || left.id).localeCompare(right.titleEn || right.titleAr || right.id);
}

function byProminence(left: Book, right: Book): number {
  const leftScore = (left.rating || 0) * 1000 + (left.ratingsCount || 0) + (left.reviewCount || 0);
  const rightScore = (right.rating || 0) * 1000 + (right.ratingsCount || 0) + (right.reviewCount || 0);
  if (leftScore !== rightScore) return rightScore - leftScore;
  return byChronology(left, right);
}

function isCurrentlyReading(status: ReadingStatus): boolean {
  return status === "reading" || status === "paused" || status === "rereading";
}

function hasBookTownAvailability(book: Book): boolean {
  return Boolean(
    book.isEbookAvailable ||
      book.manifestationAvailability?.canReadInApp ||
      book.manifestationAvailability?.acquisitionEligible ||
      book.externalReadableSources?.length
  );
}

async function loadShelfMembership(uid: string, bookId: string): Promise<BookShelfMembershipProjection> {
  return callCallableEndpoint<{ uid: string; bookId: string }, BookShelfMembershipProjection>(
    "getBookShelfMembership",
    { uid, bookId }
  ).catch(() => ({}));
}

async function loadBookMemory(uid: string, book: Book): Promise<AuthorReaderMemoryBook> {
  const [membership, reviewsPage] = await Promise.all([
    loadShelfMembership(uid, book.id),
    dataService.catalog.getReviewsPage(book.id, { limit: 20 }).catch(() => ({ items: [] as Review[] })),
  ]);
  const status = membership.readingState?.status_state ?? null;
  const userReview = reviewsPage.items.find((review) => review.userId === uid) ?? null;
  return { book, readingStatus: status, userReview };
}

function selectContinuation(books: readonly Book[], memoryBooks: readonly AuthorReaderMemoryBook[]) {
  const reading = memoryBooks.find((entry) => isCurrentlyReading(entry.readingStatus))?.book;
  if (reading) {
    return {
      book: reading,
      reason: "currently_reading" as const,
      label: "Continue reading",
    };
  }

  const readIds = new Set(memoryBooks.filter((entry) => entry.readingStatus === "completed").map((entry) => entry.book.id));
  const chronologicalUnread = [...books].sort(byChronology).find((book) => !readIds.has(book.id));
  if (chronologicalUnread) {
    return {
      book: chronologicalUnread,
      reason: "next_unread_chronological" as const,
      label: `Next chronological work (${formatPublicationLabel(chronologicalUnread)})`,
    };
  }

  const majorWork = [...books].sort(byProminence)[0] ?? null;
  if (majorWork) {
    return {
      book: majorWork,
      reason: "major_work" as const,
      label: "Return to a major work",
    };
  }

  const available = books.find(hasBookTownAvailability) ?? null;
  if (available) {
    return {
      book: available,
      reason: "available_booktown_work" as const,
      label: "Available in BookTown",
    };
  }

  return {
    book: null,
    reason: "none" as const,
    label: "No continuation available",
  };
}

export function useAuthorReaderMemory(params: {
  readonly authorId: string | undefined;
  readonly canonicalWorks: readonly Book[];
  readonly quotes: readonly Quote[];
  readonly isFollowed: boolean;
}) {
  const { user } = useAuth();
  const uid = user?.uid;
  const canonicalWorks = useMemo(
    () => params.canonicalWorks.slice(0, AUTHOR_MEMORY_WORK_LIMIT),
    [params.canonicalWorks]
  );

  return useQuery<AuthorReaderMemoryModel>({
    queryKey: [
      "authorReaderMemory",
      uid || "anon",
      params.authorId || "none",
      canonicalWorks.map((book) => book.id).join("|"),
      params.quotes.map((quote) => quote.id).join("|"),
      params.isFollowed,
    ],
    enabled: Boolean(params.authorId),
    staleTime: 30_000,
    queryFn: async () => {
      if (!uid) {
        return {
          isSignedIn: false,
          isFollowed: params.isFollowed,
          booksRead: [],
          currentlyReading: [],
          savedQuotes: [],
          reviews: [],
          continuation: selectContinuation(canonicalWorks, []),
        };
      }

      const [bookMemory, bookmarks] = await Promise.all([
        Promise.all(canonicalWorks.map((book) => loadBookMemory(uid, book))),
        dataService.users.getBookmarks(uid).catch(() => [] as Bookmark[]),
      ]);

      const bookmarkedQuoteIds = new Set(
        bookmarks
          .filter((bookmark) => bookmark.type === "quote")
          .map((bookmark) => bookmark.entityId)
          .filter(Boolean)
      );
      const savedQuotes = params.quotes.filter((quote) => bookmarkedQuoteIds.has(quote.id));
      const reviews = bookMemory.map((entry) => entry.userReview).filter((review): review is Review => Boolean(review));

      return {
        isSignedIn: true,
        isFollowed: params.isFollowed,
        booksRead: bookMemory.filter((entry) => entry.readingStatus === "completed"),
        currentlyReading: bookMemory.filter((entry) => isCurrentlyReading(entry.readingStatus)),
        savedQuotes,
        reviews,
        continuation: selectContinuation(canonicalWorks, bookMemory),
      };
    },
  });
}
