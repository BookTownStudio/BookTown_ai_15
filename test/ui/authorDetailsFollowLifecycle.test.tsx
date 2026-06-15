import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthorDetailsScreen from "../../app/author-details.tsx";

const {
  currentViewState,
  followAuthorMock,
  unfollowAuthorMock,
  saveBookmarkMock,
  showToastMock,
  confirmMock,
  authorityViewState,
  booksByAuthorState,
  followStatusState,
  followMutationState,
  unfollowMutationState,
} = vi.hoisted(() => ({
  currentViewState: {
    type: "immersive",
    id: "authorDetails",
    params: { authorId: "route_author_id" },
  } as any,
  followAuthorMock: vi.fn(),
  unfollowAuthorMock: vi.fn(),
  saveBookmarkMock: vi.fn(),
  showToastMock: vi.fn(),
  confirmMock: vi.fn(),
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
  followMutationState: {
    isPending: false,
  },
  unfollowMutationState: {
    isPending: false,
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
    navigate: vi.fn(),
    navigateToSocialAndHighlight: vi.fn(),
  }),
}));

vi.mock("../../store/i18n.tsx", () => ({
  useI18n: () => ({ lang: "en", isRTL: false }),
}));

vi.mock("../../store/toast.tsx", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

vi.mock("../../lib/hooks/useAuthorDetailsAuthority.ts", () => ({
  useAuthorDetailsAuthority: () => authorityViewState,
}));

vi.mock("../../lib/hooks/useBooksByAuthor.ts", () => ({
  useBooksByAuthor: () => booksByAuthorState,
}));

vi.mock("../../lib/hooks/useDiscoverQuotes.ts", () => ({
  useDiscoverQuotes: () => ({ data: [], isLoading: false }),
}));

vi.mock("../../lib/hooks/useAuthorFollowStatus.ts", () => ({
  useAuthorFollowStatus: () => followStatusState,
}));

vi.mock("../../lib/hooks/useFollowAuthor.ts", () => ({
  useFollowAuthor: () => ({ mutate: followAuthorMock, isPending: followMutationState.isPending }),
}));

vi.mock("../../lib/hooks/useUnfollowAuthor.ts", () => ({
  useUnfollowAuthor: () => ({ mutate: unfollowAuthorMock, isPending: unfollowMutationState.isPending }),
}));

vi.mock("../../lib/hooks/useSaveQuote.ts", () => ({
  useSaveBookmark: () => ({ mutate: saveBookmarkMock, isPending: false }),
}));

vi.mock("../../lib/hooks/useAuthorReaderMemory.ts", () => ({
  useAuthorReaderMemory: () => ({
    data: {
      isSignedIn: false,
      isFollowed: false,
      booksRead: [],
      currentlyReading: [],
      savedQuotes: [],
      reviews: [],
      continuation: { book: null, reason: "none", label: "No continuation available" },
    },
    isLoading: false,
  }),
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
vi.mock("../../components/icons/BookOpenIcon.tsx", () => ({
  BookOpenIcon: () => <span>book-open</span>,
}));
vi.mock("../../components/icons/QuoteIcon.tsx", () => ({
  QuoteIcon: () => <span>quote</span>,
}));
vi.mock("../../components/icons/BookmarkIcon.tsx", () => ({
  BookmarkIcon: () => <span>bookmark</span>,
}));
vi.mock("../../components/icons/StarIcon.tsx", () => ({
  StarIcon: () => <span>star</span>,
}));

describe("Author Details follow lifecycle", () => {
  beforeEach(() => {
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
    followStatusState.data = false;
    followStatusState.isLoading = false;
    followMutationState.isPending = false;
    unfollowMutationState.isPending = false;
    followAuthorMock.mockReset();
    unfollowAuthorMock.mockReset();
    showToastMock.mockReset();
    confirmMock.mockReset();
    vi.stubGlobal("confirm", confirmMock);
  });

  it("follows with canonical Author ID", () => {
    render(<AuthorDetailsScreen />);

    fireEvent.click(screen.getByLabelText("Follow Author"));

    expect(followAuthorMock).toHaveBeenCalledWith("canonical_author_id", expect.any(Object));
    expect(unfollowAuthorMock).not.toHaveBeenCalled();
  });

  it("shows Following state and makes unfollow discoverable", () => {
    followStatusState.data = true;

    render(<AuthorDetailsScreen />);

    expect(screen.getByText("Following")).toBeTruthy();
    expect(screen.getByText("Tap to unfollow")).toBeTruthy();
    expect(screen.getByLabelText("Unfollow Author")).toBeTruthy();
  });

  it("requires confirmation before unfollowing", () => {
    followStatusState.data = true;
    confirmMock.mockReturnValue(false);

    render(<AuthorDetailsScreen />);

    fireEvent.click(screen.getByLabelText("Unfollow Author"));

    expect(confirmMock).toHaveBeenCalledWith("Unfollow this author?");
    expect(unfollowAuthorMock).not.toHaveBeenCalled();
  });

  it("unfollows with canonical Author ID after confirmation", () => {
    followStatusState.data = true;
    confirmMock.mockReturnValue(true);

    render(<AuthorDetailsScreen />);

    fireEvent.click(screen.getByLabelText("Unfollow Author"));

    expect(unfollowAuthorMock).toHaveBeenCalledWith("canonical_author_id", expect.any(Object));
    expect(followAuthorMock).not.toHaveBeenCalled();
  });

  it("disables repeated follow while mutation is pending", () => {
    followMutationState.isPending = true;

    render(<AuthorDetailsScreen />);

    const button = screen.getByLabelText("Follow Author") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(followAuthorMock).not.toHaveBeenCalled();
  });

  it("disables repeated unfollow while mutation is pending", () => {
    followStatusState.data = true;
    unfollowMutationState.isPending = true;

    render(<AuthorDetailsScreen />);

    const button = screen.getByLabelText("Unfollow Author") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(unfollowAuthorMock).not.toHaveBeenCalled();
  });

  it("surfaces follow mutation errors without changing authority behavior", () => {
    followAuthorMock.mockImplementation((_authorId, options) => {
      options.onError();
    });

    render(<AuthorDetailsScreen />);

    fireEvent.click(screen.getByLabelText("Follow Author"));

    expect(showToastMock).toHaveBeenCalledWith("Failed to follow author.");
  });

  it("surfaces unfollow mutation errors without changing authority behavior", () => {
    followStatusState.data = true;
    confirmMock.mockReturnValue(true);
    unfollowAuthorMock.mockImplementation((_authorId, options) => {
      options.onError();
    });

    render(<AuthorDetailsScreen />);

    fireEvent.click(screen.getByLabelText("Unfollow Author"));

    expect(showToastMock).toHaveBeenCalledWith("Failed to unfollow author.");
  });
});
