import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import HomeScreen from "../../app/tabs/home.tsx";
import type { SearchResultDTO } from "../../types/bookSearch.ts";

const {
  mockedSearchState,
  navigateMock,
  toggleBookMock,
  enterReadingStateMock,
  ensureCanonicalBookMock,
  invalidateQueriesMock,
} = vi.hoisted(() => ({
  mockedSearchState: {
    response: { results: [] as SearchResultDTO[] },
  },
  navigateMock: vi.fn(),
  toggleBookMock: vi.fn(),
  enterReadingStateMock: vi.fn(),
  ensureCanonicalBookMock: vi.fn(),
  invalidateQueriesMock: vi.fn(),
}));

vi.mock("@lottiefiles/dotlottie-react", () => ({
  DotLottieReact: () => <div />,
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy({}, {
    get: (_target, tag: string) =>
      ({ children, ...props }: React.HTMLAttributes<HTMLElement>) =>
        React.createElement(tag, props, children),
  }),
}));

vi.mock("../../components/navigation/AppNav.tsx", () => ({
  default: () => <nav />,
}));

vi.mock("../../components/layout/PageShell.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/layout/LiteraryShell.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/content/HomeSearchBar.tsx", () => ({
  default: ({
    value,
    onChange,
    onFocus,
  }: {
    value: string;
    onChange: (value: string) => void;
    onFocus: () => void;
  }) => (
    <input
      aria-label="home-search"
      value={value}
      onFocus={onFocus}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

vi.mock("../../components/content/SearchResultCard.tsx", () => ({
  default: ({
    result,
    onOpen,
    actionSlot,
  }: {
    result: SearchResultDTO;
    onOpen?: (result: SearchResultDTO) => void;
    actionSlot?: React.ReactNode;
  }) => (
    <div data-testid="canonical-search-result-card">
      <button type="button" onClick={() => onOpen?.(result)}>
        open-{result.id}
      </button>
      {actionSlot}
    </div>
  ),
}));

vi.mock("../../components/content/UnifiedSearchFilterToggle.tsx", () => ({
  default: () => <div />,
}));

vi.mock("../../components/modals/CameraCaptureModal.tsx", () => ({
  default: () => null,
}));

vi.mock("../../components/modals/VoiceSearchModal.tsx", () => ({
  default: () => null,
}));

vi.mock("../../components/modals/AddBookModal.tsx", () => ({
  default: () => null,
}));

vi.mock("../../components/content/BookCard.tsx", () => ({
  default: () => <div />,
}));

vi.mock("../../components/content/CanonicalCoverArtwork.tsx", () => ({
  default: () => <div />,
}));

vi.mock("../../components/ui/CollapsibleSection.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
}));

vi.mock("../../components/ui/Skeletons.tsx", () => ({
  BookCardSkeleton: () => <div />,
}));

vi.mock("../../components/ui/Skeleton.tsx", () => ({
  default: () => <div />,
}));

vi.mock("../../components/ui/ErrorState.tsx", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../../components/ui/EmptyState.tsx", () => ({
  default: ({ titleEn }: { titleEn: string }) => <div>{titleEn}</div>,
}));

vi.mock("../../components/ui/PageTransition.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../components/ui/LoadingSpinner.tsx", () => ({
  default: () => <span>loading</span>,
}));

vi.mock("../../store/i18n.tsx", () => ({
  useI18n: () => ({ lang: "en", isRTL: false }),
}));

vi.mock("../../store/navigation.tsx", () => ({
  useNavigation: () => ({
    navigate: navigateMock,
    currentView: { type: "tab", id: "home" },
    resetTokens: { home: 0 },
  }),
}));

vi.mock("../../store/toast.tsx", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../store/home-search.tsx", () => ({
  useHomeSearchState: () => {
    const [query, setQuery] = React.useState("");
    const [isSearchActive, setSearchActive] = React.useState(false);
    return {
      query,
      isSearchActive,
      scrollTop: 0,
      setQuery,
      setSearchActive,
      setScrollTop: vi.fn(),
      clearSearch: () => {
        setQuery("");
        setSearchActive(false);
      },
    };
  },
}));

vi.mock("../../lib/hooks/useUnifiedBookSearch.ts", () => ({
  useUnifiedBookSearch: () => ({
    data: mockedSearchState.response,
    isLoading: false,
    error: null,
    ebookOnly: false,
    toggleEbookOnly: vi.fn(),
    dataUpdatedAt: 1,
  }),
}));

vi.mock("../../lib/hooks/useSearchHistory.ts", () => ({
  useSearchHistory: () => ({
    history: [],
    addToHistory: vi.fn(),
    removeFromHistory: vi.fn(),
  }),
}));

vi.mock("../../lib/hooks/useAiMutations.ts", () => ({
  useIdentifyBook: () => ({ isPending: false }),
}));

vi.mock("../../lib/hooks/useHomeDiscoveryConsole.ts", () => ({
  useHomeDiscoveryConsole: () => ({
    data: { rows: [] },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../../lib/hooks/useUserShelves.ts", () => ({
  useUserShelves: () => ({
    data: [
      {
        id: "user_1_want-to-read",
        titleEn: "Want to Read",
        titleAr: "أريد قراءته",
        isSystem: true,
      },
      {
        id: "custom_1",
        titleEn: "Favorites",
        titleAr: "المفضلة",
        isSystem: false,
      },
    ],
  }),
}));

vi.mock("../../lib/hooks/useToggleBookOnShelf.ts", () => ({
  useToggleBookOnShelf: () => ({
    mutate: toggleBookMock,
  }),
}));

vi.mock("../../lib/actions/enterReadingState.ts", () => ({
  enterReadingState: enterReadingStateMock,
}));

vi.mock("../../lib/react-query.ts", () => ({
  useQueryClient: () => ({
    invalidateQueries: invalidateQueriesMock,
  }),
}));

vi.mock("../../lib/books/ensureCanonicalBook.ts", () => ({
  ensureCanonicalBook: ensureCanonicalBookMock,
}));

vi.mock("../../lib/callable.ts", () => ({
  callCallableEndpoint: vi.fn(),
}));

vi.mock("../../lib/logging/bookEngineV2Log.ts", () => ({
  logBookEngineV2: vi.fn(),
}));

vi.mock("../../services/searchTelemetryService.ts", () => ({
  trackSearchClick: vi.fn(),
}));

vi.mock("../../lib/books/acquireExternalEbookForRead.ts", () => ({
  acquireExternalEbookForRead: vi.fn(),
  buildAcquireExternalReadParams: vi.fn(),
}));

function buildResult(): SearchResultDTO {
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
    available: false,
    acquired: false,
    readAccess: "none",
    readProvider: null,
    hasEbook: false,
    downloadable: false,
    isEbookAvailable: false,
    confidence: 0.9,
    rank: 1,
  };
}

describe("Home search shelf selector", () => {
  beforeEach(() => {
    mockedSearchState.response = { results: [buildResult()] };
    navigateMock.mockReset();
    toggleBookMock.mockReset();
    enterReadingStateMock.mockReset();
    ensureCanonicalBookMock.mockReset();
    ensureCanonicalBookMock.mockResolvedValue({ canonicalBookId: "book_1" });
    invalidateQueriesMock.mockReset();
    toggleBookMock.mockImplementation((_vars, callbacks) => {
      callbacks?.onSuccess?.();
      callbacks?.onSettled?.();
    });
    enterReadingStateMock.mockResolvedValue(undefined);
    invalidateQueriesMock.mockResolvedValue(undefined);
  });

  it("renders Home book results through SearchResultCard and opens an inline shelf selector", () => {
    render(<HomeScreen />);

    fireEvent.focus(screen.getByLabelText("home-search"));
    fireEvent.change(screen.getByLabelText("home-search"), {
      target: { value: "dune" },
    });

    expect(screen.getByTestId("canonical-search-result-card")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Add book to shelf"));

    expect(screen.getByRole("menu", { name: "Choose shelf" })).toBeInTheDocument();
    expect(screen.getByTestId("home-shelf-selector-panel").className).toContain("backdrop-blur-xl");
    expect(screen.getByTestId("home-shelf-selector-panel").className).toContain("origin-top-right");
    expect(screen.getByText("Currently Reading")).toBeInTheDocument();
    expect(screen.getByText("Want to Read")).toBeInTheDocument();
    expect(screen.getByText("Favorites")).toBeInTheDocument();
  });

  it("dismisses the inline selector on outside pointerdown without clearing Home search state", async () => {
    render(<HomeScreen />);

    fireEvent.focus(screen.getByLabelText("home-search"));
    fireEvent.change(screen.getByLabelText("home-search"), {
      target: { value: "dune" },
    });
    fireEvent.click(screen.getByLabelText("Add book to shelf"));

    expect(screen.getByRole("menu", { name: "Choose shelf" })).toBeInTheDocument();

    const outsideEvent = new Event("pointerdown", {
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      document.body.dispatchEvent(outsideEvent);
    });

    expect(outsideEvent.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Choose shelf" })).toBeNull();
    });
    expect(screen.getByLabelText("home-search")).toHaveValue("dune");
    expect(screen.getByTestId("canonical-search-result-card")).toBeInTheDocument();
  });

  it("routes Home normal shelf selection through the existing shelf mutation hook", async () => {
    render(<HomeScreen />);

    fireEvent.focus(screen.getByLabelText("home-search"));
    fireEvent.change(screen.getByLabelText("home-search"), {
      target: { value: "dune" },
    });
    fireEvent.click(screen.getByLabelText("Add book to shelf"));
    fireEvent.click(screen.getByText("Want to Read"));

    await waitFor(() => {
      expect(toggleBookMock).toHaveBeenCalledWith(
        expect.objectContaining({
          shelfId: "user_1_want-to-read",
          bookId: "book_1",
        }),
        expect.any(Object)
      );
    });
    expect(enterReadingStateMock).not.toHaveBeenCalled();
  });

  it("routes Home Currently Reading selection through reading continuity only", async () => {
    render(<HomeScreen />);

    fireEvent.focus(screen.getByLabelText("home-search"));
    fireEvent.change(screen.getByLabelText("home-search"), {
      target: { value: "dune" },
    });
    fireEvent.click(screen.getByLabelText("Add book to shelf"));
    fireEvent.click(screen.getByText("Currently Reading"));

    await waitFor(() => {
      expect(enterReadingStateMock).toHaveBeenCalledWith({
        bookId: "book_1",
        progress: 0,
        targetState: "reading",
      });
    });
    expect(toggleBookMock).not.toHaveBeenCalled();
  });
});
