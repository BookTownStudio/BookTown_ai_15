import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthorDetailsScreen from "../../app/author-details.tsx";

const {
  currentViewState,
  navigateMock,
  followAuthorMock,
  unfollowAuthorMock,
  authorityViewState,
  booksByAuthorState,
  followStatusState,
} = vi.hoisted(() => ({
  currentViewState: {
    type: "immersive",
    id: "authorDetails",
    params: { authorId: "route_author_id" },
  } as any,
  navigateMock: vi.fn(),
  followAuthorMock: vi.fn(),
  unfollowAuthorMock: vi.fn(),
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
  followStatusState: {
    data: false,
    isLoading: false,
  },
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
  useDiscoverQuotes: () => ({ data: [] }),
}));

vi.mock("../../lib/hooks/useAuthorFollowStatus.ts", () => ({
  useAuthorFollowStatus: () => followStatusState,
}));

vi.mock("../../lib/hooks/useFollowAuthor.ts", () => ({
  useFollowAuthor: () => ({ mutate: followAuthorMock, isPending: false }),
}));

vi.mock("../../lib/hooks/useUnfollowAuthor.ts", () => ({
  useUnfollowAuthor: () => ({ mutate: unfollowAuthorMock, isPending: false }),
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
  default: () => <div>quote</div>,
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

describe("Author Details authority hardening", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    followAuthorMock.mockReset();
    unfollowAuthorMock.mockReset();
    followStatusState.data = false;
    followStatusState.isLoading = false;
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
  });

  it("uses canonical Author ID for follow action", () => {
    render(<AuthorDetailsScreen />);

    fireEvent.click(screen.getByLabelText("Follow Author"));

    expect(followAuthorMock).toHaveBeenCalledWith("canonical_author_id", expect.any(Object));
  });

  it("uses canonical Author ID for share action", () => {
    render(<AuthorDetailsScreen />);

    fireEvent.click(screen.getByLabelText("Share Author"));

    expect(navigateMock).toHaveBeenCalledWith({
      type: "immersive",
      id: "postComposer",
      params: {
        from: currentViewState,
        attachment: { type: "author", id: "canonical_author_id" },
      },
    });
  });

  it("uses canonical Author ID for quote navigation", () => {
    render(<AuthorDetailsScreen />);

    fireEvent.click(screen.getByLabelText("View Quotes"));

    expect(navigateMock).toHaveBeenCalledWith({
      type: "immersive",
      id: "quotes",
      params: { authorId: "canonical_author_id", from: currentViewState },
    });
  });

  it("renders not found state for non-canonical or missing authority state", () => {
    authorityViewState.data = null;
    authorityViewState.author = null;
    authorityViewState.authorityState = "not_found";

    render(<AuthorDetailsScreen />);

    expect(screen.getByText("Author not found.")).toBeTruthy();
  });

  it("keeps canonical and repair bibliography visibly separated with authority metadata", () => {
    booksByAuthorState.data = [
      { id: "canonical_work" },
      { id: "repair_work" },
    ];
    booksByAuthorState.bibliographyAuthority = "mixed";
    booksByAuthorState.bibliography = {
      canonicalWorks: [{ id: "canonical_work" }],
      repairWorks: [{ id: "repair_work" }],
      authoritySource: "mixed",
      totalCanonicalCount: 1,
      totalRepairCount: 1,
      hasMore: true,
    };

    render(<AuthorDetailsScreen />);

    expect(screen.getByText("book:canonical_work")).toBeTruthy();
    expect(screen.getByText("Legacy catalog matches")).toBeTruthy();
    expect(screen.getByText("book:repair_work")).toBeTruthy();
    expect(screen.getByText("View all")).toBeTruthy();
    expect(screen.getByText(/Bibliography authority: mixed/)).toBeTruthy();
  });
});
