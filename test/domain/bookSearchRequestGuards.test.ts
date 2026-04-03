// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/firebase.ts", () => ({
  isFirebaseInitialized: () => true,
  getFirebaseAuth: () => ({
    currentUser: null,
  }),
  getFirebaseAppCheckToken: async () => "app-check-token",
}));

import {
  BookSearchRequestError,
  SEARCH_FILTER_CONFLICT_CODE,
  SEARCH_FILTER_CONFLICT_MESSAGE,
  bookSearchService,
} from "../../services/bookSearchService.ts";

describe("book search request guards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects conflicting filters on the client boundary before dispatch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      bookSearchService.searchBooks({
        query: "pride",
        ebookOnly: true,
        availabilityOnly: true,
      })
    ).rejects.toEqual(
      expect.objectContaining<BookSearchRequestError>({
        message: SEARCH_FILTER_CONFLICT_MESSAGE,
        code: SEARCH_FILTER_CONFLICT_CODE,
        status: 400,
      })
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
