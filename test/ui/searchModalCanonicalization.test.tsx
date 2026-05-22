import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AddBookModal from "../../components/modals/AddBookModal.tsx";
import SelectBookModal from "../../components/modals/SelectBookModal.tsx";
import type { SearchResultDTO } from "../../types/bookSearch.ts";

const {
  navigateMock,
  showToastMock,
  ensureCanonicalBookMock,
  toggleBookMock,
  enterReadingStateMock,
  mockedSearchState,
} = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  showToastMock: vi.fn(),
  ensureCanonicalBookMock: vi.fn(),
  toggleBookMock: vi.fn(),
  enterReadingStateMock: vi.fn(),
  mockedSearchState: {
    response: { results: [] as SearchResultDTO[] },
  },
}));

vi.mock("../../lib/hooks/useUnifiedBookSearch.ts", () => ({
  useUnifiedBookSearch: () => ({
    data: mockedSearchState.response,
    isLoading: false,
    error: null,
    ebookOnly: false,
    toggleEbookOnly: vi.fn(),
  }),
}));

vi.mock("../../components/content/UnifiedSearchFilterToggle.tsx", () => ({
  default: () => <div>filter-toggle</div>,
}));

vi.mock("../../store/navigation.tsx", () => ({
  useNavigation: () => ({
    navigate: navigateMock,
    currentView: { type: "tab", id: "home" },
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

vi.mock("../../lib/hooks/useUserShelves.ts", () => ({
  useUserShelves: () => ({
    data: [
      {
        id: "currently-reading",
        titleEn: "Currently Reading",
        titleAr: "أقرأ حاليًا",
      },
    ],
  }),
}));

vi.mock("../../lib/auth.tsx", () => ({
  useAuth: () => ({
    effectiveUid: "user_1",
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

vi.mock("../../lib/hooks/useBookUpload.ts", () => ({
  useBookUpload: () => ({
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("../../lib/react-query.ts", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("../../services/searchTelemetryService.ts", () => ({
  trackSearchClick: vi.fn(),
}));

vi.mock("../../lib/logging/bookEngineV2Log.ts", () => ({
  logBookEngineV2: vi.fn(),
}));

vi.mock("../../lib/books/ensureCanonicalBook.ts", () => ({
  ensureCanonicalBook: ensureCanonicalBookMock,
}));

vi.mock("../../components/ui/Modal.tsx", () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

vi.mock("../../components/ui/InputField.tsx", () => ({
  default: ({
    id,
    value,
    onChange,
    placeholder,
  }: {
    id: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={id}
      value={value}
      placeholder={placeholder}
      onChange={onChange}
    />
  ),
}));

vi.mock("../../components/ui/BilingualText.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/ui/Button.tsx", () => ({
  default: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  ),
}));

vi.mock("../../components/ui/LoadingSpinner.tsx", () => ({
  default: () => <div>loading</div>,
}));

vi.mock("../../components/content/SearchResultCard.tsx", () => ({
  default: ({
    result,
    onOpen,
    onAdd,
  }: {
    result: SearchResultDTO;
    onOpen?: (result: SearchResultDTO) => void;
    onAdd?: (result: SearchResultDTO) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onOpen?.(result)}>
        open-{result.id}
      </button>
      {onAdd ? (
        <button type="button" onClick={() => onAdd(result)}>
          add-{result.id}
        </button>
      ) : null}
    </div>
  ),
}));

function buildExternalResult(overrides?: Partial<SearchResultDTO>): SearchResultDTO {
  return {
    id: "gb_external_book",
    editionId: "gb_external_book",
    bookId: "gb_external_book",
    workId: null,
    externalId: "external_123",
    source: "googleBooks",
    resultType: "external",
    workType: "edition",
    editionPresence: "edition",
    ebookClass: "unavailable",
    sourceClass: "external_provider",
    languageTruth: "unknown",
    title: "External Book",
    titleEn: "External Book",
    titleAr: "",
    authors: ["External Author"],
    authorEn: "External Author",
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
    confidence: 0.8,
    rank: 2,
    rawBook: {
      id: "external_123",
      externalId: "external_123",
      source: "googleBooks",
      title: "External Book",
    },
    ...overrides,
  };
}

describe("search modal canonicalization guards", () => {
  beforeEach(() => {
    mockedSearchState.response = {
      results: [buildExternalResult()],
    };
    navigateMock.mockReset();
    showToastMock.mockReset();
    toggleBookMock.mockReset();
    enterReadingStateMock.mockReset();
    ensureCanonicalBookMock.mockReset();
    ensureCanonicalBookMock.mockResolvedValue({
      canonicalBookId: "book_canonical_1",
      status: "CREATED",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("AddBookModal resolves external results canonically before adding to Currently Reading", async () => {
    render(
      <AddBookModal
        isOpen
        onClose={vi.fn()}
        targetShelfId="currently-reading"
      />
    );

    fireEvent.change(screen.getByLabelText("book-search"), {
      target: { value: "external" },
    });
    fireEvent.click(screen.getByText("add-gb_external_book"));

    await waitFor(() => {
      expect(ensureCanonicalBookMock).toHaveBeenCalledWith(
        expect.objectContaining({
          providerExternalId: "external_123",
          source: "googleBooks",
        })
      );
    });

    expect(toggleBookMock).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    expect(enterReadingStateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        bookId: "book_canonical_1",
        progress: 0,
        targetState: "reading",
      })
    );
    expect(enterReadingStateMock.mock.calls[0][0]).not.toHaveProperty("sourceType");
  });

  it("SelectBookModal resolves external results canonically before attach flow even if synthetic bookId exists", async () => {
    const onBookSelect = vi.fn();

    render(
      <SelectBookModal
        isOpen
        onClose={vi.fn()}
        onBookSelect={onBookSelect}
      />
    );

    fireEvent.change(screen.getByLabelText("book-search-modal"), {
      target: { value: "external" },
    });
    fireEvent.click(screen.getByText("open-gb_external_book"));

    await waitFor(() => {
      expect(ensureCanonicalBookMock).toHaveBeenCalledWith(
        expect.objectContaining({
          providerExternalId: "external_123",
          source: "googleBooks",
        })
      );
    });

    expect(onBookSelect).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "bookDetails",
        params: expect.objectContaining({
          bookId: "book_canonical_1",
          pendingAction: "ATTACH_TO_POST",
        }),
      })
    );
  });
});
