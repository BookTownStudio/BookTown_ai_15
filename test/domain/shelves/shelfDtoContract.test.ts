import { describe, expect, it } from "vitest";
import { apiContracts } from "../../../contracts/apiContracts";

const shelf = {
  id: "shelf_1",
  ownerId: "user_1",
  membershipAuthority: "shelf_books" as const,
  membershipBookIds: ["book_1"],
  titleEn: "Favorites",
  titleAr: "Favorites",
  descriptionEn: "",
  descriptionAr: "",
  bookIds: ["book_1"],
  orderedBookIds: ["book_1"],
  userCoverUrl: "https://example.com/cover.jpg",
  visibility: "private" as const,
  bookCount: 1,
  isSystem: false,
  copiedFrom: {
    shelfId: "source_shelf",
    ownerId: "source_user",
    createdAt: "2026-01-01T00:00:00.000Z",
    copiedAt: "2026-01-02T00:00:00.000Z",
  },
  createdAt: "2026-01-03T00:00:00.000Z",
  updatedAt: "2026-01-04T00:00:00.000Z",
};

describe("shelf DTO callable contracts", () => {
  it("accepts listUserShelves shelf_books projections", () => {
    const parsed = apiContracts.callable.listUserShelves.responseSchema.parse({
      success: true,
      data: {
        items: [shelf],
        hasMore: false,
      },
    });

    expect(parsed.data.items[0].membershipAuthority).toBe("shelf_books");
  });

  it("accepts getShelf shelf_books projections", () => {
    expect(
      apiContracts.callable.getShelf.responseSchema.parse({
        success: true,
        data: shelf,
      }).data.membershipBookIds
    ).toEqual(["book_1"]);
  });

  it("accepts createShelf empty shelf_books projection", () => {
    const createdShelf = {
      ...shelf,
      id: "created_shelf",
      membershipBookIds: [],
      bookIds: [],
      orderedBookIds: undefined,
      userCoverUrl: undefined,
      copiedFrom: undefined,
      bookCount: 0,
    };

    expect(
      apiContracts.callable.createShelf.responseSchema.parse({
        success: true,
        data: createdShelf,
      }).data.membershipBookIds
    ).toEqual([]);
  });

  it("rejects duplicateShelf legacy entries payload drift", () => {
    expect(() =>
      apiContracts.callable.duplicateShelf.responseSchema.parse({
        success: true,
        data: {
          ...shelf,
          entries: {
            book_1: { bookId: "book_1" },
          },
        },
      })
    ).toThrow();
  });

  it("accepts normalized duplicateShelf payload", () => {
    expect(
      apiContracts.callable.duplicateShelf.responseSchema.parse({
        success: true,
        data: shelf,
      }).data.bookCount
    ).toBe(1);
  });
});
