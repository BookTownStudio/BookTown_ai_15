import { describe, expect, it } from "vitest";
import {
  toEntitySummaryFromBookmark,
  toEntitySummaryFromCompatIdentity,
  toEntitySummaryFromDirectMessageAttachment,
  toEntitySummaryFromPostAttachment,
  toLiteraryEntityRefFromCompatIdentity,
} from "../../../types/entityPlatformCompatibility";
import type { DirectMessage, PostAttachment } from "../../../types/entities";

describe("Entity Platform compatibility adapters", () => {
  it("maps supported legacy identities to LiteraryEntityRef without changing ids", () => {
    expect(toLiteraryEntityRefFromCompatIdentity({ type: "book", entityId: " book_1 " })).toMatchObject({
      entityType: "work",
      entityId: " book_1 ",
      authoritySource: "work_authority",
    });
    expect(toLiteraryEntityRefFromCompatIdentity({ type: "author", entityId: "author_1" })).toMatchObject({
      entityType: "author",
      entityId: "author_1",
    });
    expect(toLiteraryEntityRefFromCompatIdentity({ type: "quote", entityId: "quote_1" })).toMatchObject({
      entityType: "quote",
      entityId: "quote_1",
    });
    expect(toLiteraryEntityRefFromCompatIdentity({ type: "publication", entityId: "publication_1" })).toMatchObject({
      entityType: "publication",
      entityId: "publication_1",
    });
  });

  it("does not create canonical Theme or Concept refs through Wave 3 adapters", () => {
    expect(toLiteraryEntityRefFromCompatIdentity({ type: "theme", entityId: "exile" })).toBeNull();
    expect(toLiteraryEntityRefFromCompatIdentity({ type: "concept", entityId: "memory" })).toBeNull();
  });

  it("builds EntitySummary from social attachments", () => {
    const attachment: PostAttachment = {
      type: "book",
      bookId: "book_1",
      bookTitle: "Book Title",
      bookAuthor: "Author Name",
      bookCover: "https://example.test/cover.jpg",
      bookRating: 4,
    };

    expect(toEntitySummaryFromPostAttachment(attachment)).toMatchObject({
      title: "Book Title",
      subtitle: "Author Name",
      image: { url: "https://example.test/cover.jpg" },
      ref: {
        entityType: "work",
        entityId: "book_1",
      },
    });
  });

  it("builds EntitySummary from DM attachments and bookmarks without changing payloads", () => {
    const attachment: DirectMessage["attachment"] = {
      type: "author",
      entityId: "author_1",
      title: "Author Name",
      author: "Country",
      coverUrl: "https://example.test/author.jpg",
    };

    expect(toEntitySummaryFromDirectMessageAttachment(attachment)).toMatchObject({
      title: "Author Name",
      subtitle: "Country",
      ref: {
        entityType: "author",
        entityId: "author_1",
      },
    });
    expect(toEntitySummaryFromBookmark({ type: "quote", entityId: "quote_1" })).toMatchObject({
      title: "Quote",
      ref: {
        entityType: "quote",
        entityId: "quote_1",
      },
    });
  });

  it("returns null for unsupported social/product entities", () => {
    expect(toEntitySummaryFromCompatIdentity({ type: "shelf", entityId: "shelf_1" })).toBeNull();
    expect(toEntitySummaryFromCompatIdentity({ type: "venue", entityId: "venue_1" })).toBeNull();
    expect(toEntitySummaryFromCompatIdentity({ type: "post", entityId: "post_1" })).toBeNull();
  });
});
