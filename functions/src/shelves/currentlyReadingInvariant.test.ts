import { describe, expect, it } from "vitest";
import {
  assertShelfAllowsEntryMutation,
  isSemanticCurrentlyReadingShelf,
} from "./currentlyReadingInvariant";

describe("currentlyReadingInvariant", () => {
  it("rejects a bare semantic currently-reading system shelf", () => {
    expect(() =>
      assertShelfAllowsEntryMutation({
        physicalShelfId: "currently-reading",
        shelfData: {
          id: "currently-reading",
          isSystem: true,
        },
      })
    ).toThrowError(/CURRENTLY_READING_IS_PROGRESS_MANAGED/);
  });

  it("rejects a physical user-prefixed currently-reading system shelf", () => {
    expect(() =>
      assertShelfAllowsEntryMutation({
        physicalShelfId: "user123_currently-reading",
        shelfData: {
          id: "currently-reading",
          isSystem: true,
        },
      })
    ).toThrowError(/CURRENTLY_READING_IS_PROGRESS_MANAGED/);
  });

  it("allows non-currently-reading system shelves", () => {
    expect(
      isSemanticCurrentlyReadingShelf({
        physicalShelfId: "user123_want-to-read",
        shelfData: {
          id: "want-to-read",
          isSystem: true,
        },
      })
    ).toBe(false);

    expect(
      isSemanticCurrentlyReadingShelf({
        physicalShelfId: "user123_finished",
        shelfData: {
          id: "finished",
          isSystem: true,
        },
      })
    ).toBe(false);
  });

  it("allows non-system shelves even if their ids look similar", () => {
    expect(
      isSemanticCurrentlyReadingShelf({
        physicalShelfId: "user123_currently-reading",
        shelfData: {
          id: "currently-reading",
          isSystem: false,
        },
      })
    ).toBe(false);
  });
});
