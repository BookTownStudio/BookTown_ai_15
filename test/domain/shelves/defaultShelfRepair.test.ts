import { describe, expect, it } from "vitest";
import { hasRequiredDefaultShelves } from "../../../lib/hooks/useUserShelves";
import type { Shelf } from "../../../types/entities";

const baseShelf = {
  ownerId: "user_1",
  titleAr: "",
  bookIds: [],
  isSystem: true,
} satisfies Partial<Shelf>;

describe("default shelf repair detection", () => {
  it("requires both Want to Read and Finished for historical users", () => {
    const shelves = [
      {
        ...baseShelf,
        id: "user_1_want-to-read",
        titleEn: "Want to Read",
      },
    ] as Shelf[];

    expect(hasRequiredDefaultShelves(shelves, "user_1")).toBe(false);
  });

  it("accepts both default system shelves by semantic ids", () => {
    const shelves = [
      {
        ...baseShelf,
        id: "user_1_want-to-read",
        titleEn: "Want to Read",
      },
      {
        ...baseShelf,
        id: "user_1_finished",
        titleEn: "Finished",
      },
    ] as Shelf[];

    expect(hasRequiredDefaultShelves(shelves, "user_1")).toBe(true);
  });
});
