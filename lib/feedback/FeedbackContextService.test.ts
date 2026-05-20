import { describe, expect, it } from "vitest";
import { FeedbackContextService } from "./FeedbackContextService.ts";

describe("FeedbackContextService", () => {
  it("captures lightweight navigation, entity, filter, and runtime context", () => {
    window.history.pushState({}, "", "/books/book-1?status=open&ignoredLongContent=secret");
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const context = FeedbackContextService.capture({
      locale: "en",
      currentView: {
        type: "immersive",
        id: "bookDetails",
        params: { bookId: "book-1" },
      },
    });

    expect(context).toMatchObject({
      route: "/books/book-1?status=open&ignoredLongContent=secret",
      viewId: "bookDetails",
      navigationType: "immersive",
      immersiveView: "bookDetails",
      entity: { type: "book", id: "book-1" },
      activeFilters: { status: "open" },
      layoutMode: "compact",
      viewportClass: "mobile",
      locale: "en",
    });
    expect(context).not.toHaveProperty("content");
  });
});
