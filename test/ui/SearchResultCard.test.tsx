import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import SearchResultCard from "../../components/content/SearchResultCard.tsx";
import type { SearchResultDTO } from "../../types/bookSearch.ts";

vi.mock("../../components/ui/BilingualText.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/ui/Button.tsx", () => ({
  default: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("../../components/ui/LoadingSpinner.tsx", () => ({
  default: () => <div>loading</div>,
}));

function buildResult(overrides?: Partial<SearchResultDTO>): SearchResultDTO {
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
    ...overrides,
  };
}

describe("SearchResultCard", () => {
  it("does not render an add button when no real add mutation exists", () => {
    render(
      <SearchResultCard
        result={buildResult()}
        lang="en"
        onOpen={vi.fn()}
      />
    );

    expect(screen.queryByLabelText("Add book")).toBeNull();
  });

  it("does not render search-level Read or Get actions", () => {
    const onRead = vi.fn();
    const onOpen = vi.fn();
    render(
      <SearchResultCard
        result={buildResult({
          ebookClass: "in_app",
          hasEbook: true,
          acquired: true,
          downloadable: true,
          isEbookAvailable: true,
          readerAuthority: {
            hasReadableAttachment: true,
          },
        })}
        lang="en"
        onOpen={onOpen}
        onRead={onRead}
      />
    );

    expect(screen.queryByRole("button", { name: "Read" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Get" })).toBeNull();

    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onRead).not.toHaveBeenCalled();
  });

  it("renders add button only when a real mutation handler is provided", () => {
    const onAdd = vi.fn();
    render(
      <SearchResultCard
        result={buildResult()}
        lang="en"
        onOpen={vi.fn()}
        onAdd={onAdd}
      />
    );

    fireEvent.click(screen.getByLabelText("Add book"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("keeps card navigation separate from the add action", () => {
    const onOpen = vi.fn();
    const onAdd = vi.fn();
    render(
      <SearchResultCard
        result={buildResult()}
        lang="en"
        onOpen={onOpen}
        onAdd={onAdd}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /canonical book/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Add book"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("uses the canonical 40px add action target", () => {
    render(
      <SearchResultCard
        result={buildResult()}
        lang="en"
        onOpen={vi.fn()}
        onAdd={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Add book").className).toContain("!h-10");
    expect(screen.getByLabelText("Add book").className).toContain("!w-10");
    expect(screen.getByLabelText("Add book").querySelector("svg")?.className.baseVal).toContain("h-8");
    expect(screen.getByLabelText("Add book").querySelector("svg")?.className.baseVal).toContain("w-8");
  });

  it("renders semantic truth badges from the existing DTO fields", () => {
    render(
      <SearchResultCard
        result={buildResult({
          workType: "work",
          editionPresence: "grouped",
          readerAuthority: {
            hasReadableAttachment: true,
          },
          sourceClass: "external_provider",
          languageTruth: "mismatch",
          hasEbook: true,
          downloadable: true,
          isEbookAvailable: true,
        })}
        lang="en"
        onOpen={vi.fn()}
      />
    );

    expect(screen.getByText("Canonical")).toBeInTheDocument();
    expect(screen.getByText("Available in BookTown")).toBeInTheDocument();
    expect(screen.getByText("External")).toBeInTheDocument();
    expect(screen.getByText("Other language")).toBeInTheDocument();
    expect(screen.getByText("Other editions available")).toBeInTheDocument();
  });

  it("renders edition badge without canonical badge for edition rows", () => {
    render(
      <SearchResultCard
        result={buildResult({
          workType: "edition",
          editionPresence: "edition",
        })}
        lang="en"
        onOpen={vi.fn()}
      />
    );

    expect(screen.getByText("Edition")).toBeInTheDocument();
    expect(screen.queryByText("Canonical")).toBeNull();
  });
});
