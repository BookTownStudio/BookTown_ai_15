import { describe, expect, it } from "vitest";
import { apiContracts } from "./shared/apiContracts";

describe("searchBooks contract", () => {
  it("rejects simultaneous ebookOnly and availabilityOnly", () => {
    const parsed = apiContracts.rest.searchBooks.requestSchema.safeParse({
      q: "pride",
      ebookOnly: true,
      availabilityOnly: true,
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("expected searchBooks contract parse to fail");
    }

    expect(parsed.error.issues[0]?.message).toBe(
      "Search request cannot set both ebookOnly=true and availabilityOnly=true."
    );
  });
});
