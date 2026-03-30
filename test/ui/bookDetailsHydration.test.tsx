import React from "react";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookDetailsScreen from "../../app/book-details.tsx";
import type { SearchResultDTO } from "../../types/bookSearch.ts";

const {
  currentViewState,
  navigateMock,
  showToastMock,
  refetchMock,
  useBookCatalogMock,
  ensureCanonicalBookMock,
} = vi.hoisted(() => ({
  currentViewState: {
    type: "immersive",
    id: "bookDetails",
    params: {} as Record<string, unknown>,
  },
  navigateMock: vi.fn(),
  showToastMock: vi.fn(),
  refetchMock: vi.fn(),
  useBookCatalogMock: vi.fn(),
  ensureCanonicalBookMock: vi.fn(),
}));

vi.mock("../../store/navigation.tsx", () => ({
  useNavigation: () => ({
    currentView: currentViewState,
    navigate: navigateMock,
  }),
}));

vi.mock("../../store/i18n.tsx", () => ({
  useI18n: () => ({
    lang: "en",
    isRTL: false,
  }),
}));

vi.mock("../../store/toast.tsx", () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

vi.mock("../../lib/auth.tsx", () => ({
  useAuth: () => ({
    user: null,
  }),
}));

vi.mock("../../lib/hooks/useBookCatalog.ts", () => ({
  useBookCatalog: (bookId?: string) => useBookCatalogMock(bookId),
}));

vi.mock("../../lib/hooks/useBookReviews.ts", () => ({
  useBookReviews: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/useBookShelfStatus.ts", () => ({
  useBookShelfStatus: () => ({
    isSavedOnPhysicalShelf: false,
  }),
}));

vi.mock("../../lib/hooks/useRelatedBooks.ts", () => ({
  useRelatedBooks: vi.fn(),
}));

vi.mock("../../lib/hooks/useSubmitReview.ts", () => ({
  useSubmitReview: () => ({
    submitReviewAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("../../lib/hooks/useToggleBookOnShelf.ts", () => ({
  useToggleBookOnShelf: () => ({
    mutate: vi.fn(),
  }),
}));

vi.mock("../../lib/books/ensureCanonicalBook.ts", () => ({
  ensureCanonicalBook: ensureCanonicalBookMock,
}));

vi.mock("../../lib/logging/bookEngineV2Log.ts", () => ({
  logBookEngineV2: vi.fn(),
}));

vi.mock("../../components/ui/PageTransition.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/ui/ErrorState.tsx", () => ({
  default: ({
    title,
    message,
    onRetry,
  }: {
    title?: string;
    message?: string;
    onRetry?: () => void;
  }) => (
    <div>
      <div>{title}</div>
      <div>{message}</div>
      {onRetry ? <button onClick={onRetry}>Retry</button> : null}
    </div>
  ),
}));

vi.mock("../../components/ui/LoadingSpinner.tsx", () => ({
  default: () => <div>loading</div>,
}));

vi.mock("../../components/ui/BilingualText.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/ui/Button.tsx", () => ({
  default: ({
    children,
    onClick,
    disabled,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("../../components/ui/GlassCard.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/ui/StarRatingInput.tsx", () => ({
  default: () => <div>rating</div>,
}));

vi.mock("../../components/modals/SelectShelfModal.tsx", () => ({
  default: () => null,
}));

vi.mock("../../components/content/ReviewCard.tsx", () => ({
  default: () => <div>review</div>,
}));

vi.mock("../../components/content/CanonicalCoverArtwork.tsx", () => ({
  default: () => <div>cover</div>,
}));

vi.mock("../../components/icons", () => ({
  XIcon: () => <div>x</div>,
  ShareIcon: () => <div>share</div>,
  EyeIcon: () => <div>eye</div>,
  StarIcon: () => <div>star</div>,
  QuoteIcon: () => <div>quote</div>,
  EllipsisIcon: () => <div>ellipsis</div>,
  ShelvesIcon: () => <div>shelves</div>,
  SendIcon: () => <div>send</div>,
  EditIcon: () => <div>edit</div>,
}));

function buildSearchResult(overrides?: Partial<SearchResultDTO>): SearchResultDTO {
  return {
    id: "book_1",
    editionId: "edition_1",
    bookId: "book_1",
    workId: "book_1",
    externalId: "",
    source: "booktown",
    resultType: "canonical",
    workType: "work",
    editionPresence: "single",
    ebookClass: "unavailable",
    sourceClass: "canonical_catalog",
    languageTruth: "unknown",
    title: "Canonical Book",
    titleEn: "Canonical Book",
    titleAr: "",
    authors: ["Author One"],
    authorEn: "Author One",
    authorAr: "",
    description: "",
    descriptionEn: "",
    descriptionAr: "",
    coverUrl: "",
    language: "en",
    hasEbook: false,
    downloadable: false,
    isEbookAvailable: false,
    confidence: 0.9,
    rank: 1,
    ...overrides,
  };
}

function buildBook(id: string, title: string) {
  return {
    id,
    titleEn: title,
    titleAr: "",
    authorEn: "Author One",
    authorAr: "",
    coverUrl: "",
    coverMode: "image",
    fallbackCover: null,
    rating: 4.2,
    ratingsCount: 12,
    descriptionEn: "Description",
    descriptionAr: "",
  };
}

describe("BookDetailsScreen hydration guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentViewState.params = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads canonical edition clicks from the clicked Firestore book id", () => {
    currentViewState.params = {
      bookId: "edition_99",
      searchResult: buildSearchResult({
        id: "edition_99",
        bookId: "edition_99",
        workId: "work_42",
        workType: "edition",
        editionPresence: "edition",
      }),
    };

    useBookCatalogMock.mockImplementation((bookId?: string) => ({
      data: bookId === "edition_99" ? buildBook("edition_99", "Imported Edition") : null,
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    }));

    render(<BookDetailsScreen />);

    expect(useBookCatalogMock).toHaveBeenCalledWith("edition_99");
    expect(screen.getByText("Imported Edition")).toBeInTheDocument();
  });

  it("replaces an endless external hydration spinner with an explicit timeout error", async () => {
    vi.useFakeTimers();
    ensureCanonicalBookMock.mockReturnValue(new Promise(() => {}));
    currentViewState.params = {
      bookId: "gb_external_123",
      searchResult: buildSearchResult({
        id: "gb_external_123",
        bookId: "gb_external_123",
        editionId: "gb_external_123",
        externalId: "external_123",
        source: "googleBooks",
        resultType: "external",
        workType: "edition",
        sourceClass: "external_provider",
        rawBook: {
          id: "external_123",
          externalId: "external_123",
          source: "googleBooks",
          title: "External Book",
        },
      }),
    };

    useBookCatalogMock.mockImplementation(() => ({
      data: null,
      isLoading: false,
      isError: false,
      refetch: refetchMock,
    }));

    render(<BookDetailsScreen />);

    expect(screen.getByText("Preparing book…")).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(12050);
    });

    expect(screen.getByText("Book timed out")).toBeInTheDocument();
    expect(
      screen.getByText("This book took too long to prepare. Please try again or return to search.")
    ).toBeInTheDocument();
  });
});
