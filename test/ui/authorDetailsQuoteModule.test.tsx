import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthorDetailsScreen from "../../app/author-details.tsx";

const {
  currentViewState,
  navigateMock,
  authorityViewState,
  booksByAuthorState,
  quotesState,
  useDiscoverQuotesMock,
} = vi.hoisted(() => ({
  currentViewState: {
    type: "immersive",
    id: "authorDetails",
    params: { authorId: "route_author_id" },
  } as any,
  navigateMock: vi.fn(),
  authorityViewState: {
    data: null as any,
    author: null as any,
    isLoading: false,
    isError: false,
    authorityState: "canonical",
  },
  booksByAuthorState: {
    data: [] as any[],
    isLoading: false,
    bibliographyAuthority: "canonical_author_id",
    bibliography: {
      canonicalWorks: [] as any[],
      repairWorks: [] as any[],
      authoritySource: "canonical_author_id",
      totalCanonicalCount: 0,
      totalRepairCount: 0,
      hasMore: false,
    },
  },
  quotesState: {
    data: [] as any[],
    isLoading: false,
  },
  useDiscoverQuotesMock: vi.fn(),
}));

function buildAuthorityView() {
  const author = {
    id: "legacy_author_id",
    nameEn: "Canonical Author",
    nameAr: "المؤلف",
    avatarUrl: "https://example.com/a.jpg",
    bioEn: "Biography",
    bioAr: "سيرة",
    lifespan: "1900-2000",
    countryEn: "Country",
    countryAr: "بلد",
    languageEn: "Language",
    languageAr: "لغة",
  };
  return {
    author,
    authorRef: {
      contractVersion: 1,
      entityType: "author",
      entityId: "canonical_author_id",
      authorityState: "canonical",
      authoritySource: "author_authority",
    },
    authorSummary: {
      ref: {
        contractVersion: 1,
        entityType: "author",
        entityId: "canonical_author_id",
        authorityState: "canonical",
        authoritySource: "author_authority",
      },
      title: "Canonical Author",
      authorityState: "canonical",
      summaryVersion: 1,
    },
    authorityState: "canonical",
    bibliographyAuthority: "canonical_author_id",
  };
}

function quote(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    textEn: `Quote text ${id}`,
    textAr: `نص ${id}`,
    sourceEn: `Book ${id}`,
    sourceAr: `كتاب ${id}`,
    authorId: "canonical_author_id",
    ...overrides,
  };
}

vi.mock("../../store/navigation.tsx", () => ({
  useNavigation: () => ({
    currentView: currentViewState,
    navigate: navigateMock,
    navigateToSocialAndHighlight: vi.fn(),
  }),
}));

vi.mock("../../store/i18n.tsx", () => ({
  useI18n: () => ({ lang: "en", isRTL: false }),
}));

vi.mock("../../lib/hooks/useAuthorDetailsAuthority.ts", () => ({
  useAuthorDetailsAuthority: () => authorityViewState,
}));

vi.mock("../../lib/hooks/useBooksByAuthor.ts", () => ({
  useBooksByAuthor: () => booksByAuthorState,
}));

vi.mock("../../lib/hooks/useDiscoverQuotes.ts", () => ({
  useDiscoverQuotes: useDiscoverQuotesMock,
}));

vi.mock("../../lib/hooks/useAuthorFollowStatus.ts", () => ({
  useAuthorFollowStatus: () => ({ data: false, isLoading: false }),
}));

vi.mock("../../lib/hooks/useFollowAuthor.ts", () => ({
  useFollowAuthor: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../lib/hooks/useUnfollowAuthor.ts", () => ({
  useUnfollowAuthor: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../store/toast.tsx", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../components/ui/LoadingSpinner.tsx", () => ({
  default: () => <div>loading</div>,
}));

vi.mock("../../components/ui/BilingualText.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("../../components/ui/Button.tsx", () => ({
  default: ({
    children,
    onClick,
    "aria-label": ariaLabel,
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  ),
}));

vi.mock("../../components/content/BookCard.tsx", () => ({
  default: ({ bookId }: { bookId: string }) => <div>book:{bookId}</div>,
}));

vi.mock("../../components/content/QuoteSnippetCard.tsx", () => ({
  default: ({ quote }: { quote: any }) => (
    <article>
      <p>{quote.textEn}</p>
      <p>{quote.sourceEn}</p>
    </article>
  ),
}));

vi.mock("../../components/icons/ChevronLeftIcon.tsx", () => ({
  ChevronLeftIcon: () => <span>back</span>,
}));
vi.mock("../../components/icons/PlusIcon.tsx", () => ({
  PlusIcon: () => <span>plus</span>,
}));
vi.mock("../../components/icons/ShareIcon.tsx", () => ({
  ShareIcon: () => <span>share</span>,
}));
vi.mock("../../components/icons/BookIcon.tsx", () => ({
  BookIcon: () => <span>book</span>,
}));
vi.mock("../../components/icons/QuoteIcon.tsx", () => ({
  QuoteIcon: () => <span>quote</span>,
}));

describe("Author Details quote module", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    currentViewState.params = { authorId: "route_author_id" };
    const view = buildAuthorityView();
    authorityViewState.data = view;
    authorityViewState.author = view.author;
    authorityViewState.isLoading = false;
    authorityViewState.isError = false;
    authorityViewState.authorityState = "canonical";
    booksByAuthorState.data = [];
    booksByAuthorState.isLoading = false;
    booksByAuthorState.bibliographyAuthority = "canonical_author_id";
    booksByAuthorState.bibliography = {
      canonicalWorks: [],
      repairWorks: [],
      authoritySource: "canonical_author_id",
      totalCanonicalCount: 0,
      totalRepairCount: 0,
      hasMore: false,
    };
    quotesState.data = [];
    quotesState.isLoading = false;
    useDiscoverQuotesMock.mockReset();
    useDiscoverQuotesMock.mockReturnValue(quotesState);
  });

  it("renders multiple bounded quotes by canonical Author", () => {
    quotesState.data = [
      quote("quote_1"),
      quote("quote_2"),
      quote("quote_3"),
      quote("quote_4"),
      quote("quote_5"),
      quote("quote_6"),
      quote("quote_7"),
    ];

    render(<AuthorDetailsScreen />);

    expect(useDiscoverQuotesMock).toHaveBeenCalledWith({
      authorId: "canonical_author_id",
      limit: 6,
    });
    expect(screen.getByText("Quotes by this Author")).toBeTruthy();
    expect(screen.getByText("Quote text quote_1")).toBeTruthy();
    expect(screen.getByText("Quote text quote_6")).toBeTruthy();
    expect(screen.queryByText("Quote text quote_7")).toBeNull();
  });

  it("renders a quote loading state separately from empty state", () => {
    quotesState.isLoading = true;

    render(<AuthorDetailsScreen />);

    expect(screen.getAllByText("loading").length).toBeGreaterThan(0);
    expect(screen.queryByText("No public quotes are attached to this author yet.")).toBeNull();
  });

  it("renders a public quotes empty state without fabricating quotes", () => {
    render(<AuthorDetailsScreen />);

    expect(screen.getByText("No public quotes are attached to this author yet.")).toBeTruthy();
    expect(screen.queryByText(/Quote text/)).toBeNull();
  });

  it("navigates to View All Quotes with canonical Author identity", () => {
    quotesState.data = [quote("quote_1"), quote("quote_2"), quote("quote_3")];

    render(<AuthorDetailsScreen />);

    fireEvent.click(screen.getByText("View all"));

    expect(navigateMock).toHaveBeenCalledWith({
      type: "immersive",
      id: "quotes",
      params: { authorId: "canonical_author_id", from: currentViewState },
    });
  });

  it("preserves Quote Details navigation by canonical quote identity", () => {
    quotesState.data = [quote("canonical_quote_id")];

    render(<AuthorDetailsScreen />);

    fireEvent.click(screen.getByText("Quote text canonical_quote_id"));

    expect(navigateMock).toHaveBeenCalledWith({
      type: "immersive",
      id: "quoteDetails",
      params: { quoteId: "canonical_quote_id", from: currentViewState },
    });
  });

  it("shows source work and preserves Book Details navigation when available", () => {
    quotesState.data = [quote("quote_1", { bookId: "canonical_book_id", sourceEn: "Canonical Book" })];

    render(<AuthorDetailsScreen />);

    expect(screen.getByText("Canonical Book")).toBeTruthy();
    fireEvent.click(screen.getByText("From Canonical Book"));

    expect(navigateMock).toHaveBeenCalledWith({
      type: "immersive",
      id: "bookDetails",
      params: { bookId: "canonical_book_id", from: currentViewState },
    });
  });

  it("does not expose private quote metadata or authority internals", () => {
    quotesState.data = [
      quote("quote_1", {
        ownerId: "private_owner_id",
        provenance: {
          sourceType: "manual",
          verificationStatus: "canonical_linked",
          providerRecordId: "provider_record_id",
        },
      }),
    ];

    const { container } = render(<AuthorDetailsScreen />);

    expect(container.textContent).not.toContain("private_owner_id");
    expect(container.textContent).not.toContain("provider_record_id");
    expect(container.textContent).not.toContain("canonical_linked");
    expect(container.textContent).not.toContain("manual");
  });
});
