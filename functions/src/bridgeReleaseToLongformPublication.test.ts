import { describe, expect, it } from "vitest";
import {
  deriveEstimatedReadingMinutes,
  deriveExcerpt,
  deriveWordCount,
} from "./publishing/releaseDerivedFields";
import {
  slugifyTitle,
} from "./bridgeReleaseToLongformPublication";

describe("bridgeReleaseToLongformPublication helpers", () => {
  const normalizedContent = {
    units: [
      {
        index: 1,
        title: "Introduction",
        type: "section" as const,
        content: [
          {
            type: "paragraph" as const,
            content: [
              {
                type: "text" as const,
                text: "This is the first meaningful block of the publication.",
              },
            ],
          },
        ],
      },
      {
        index: 2,
        title: "Conclusion",
        type: "section" as const,
        content: [
          {
            type: "paragraph" as const,
            content: [
              {
                type: "text" as const,
                text: "Closing thoughts remain concise.",
              },
            ],
          },
        ],
      },
    ],
  };

  it("creates a deterministic lowercase slug", () => {
    expect(slugifyTitle("Factual Writing: Core Question")).toBe(
      "factual-writing-core-question"
    );
  });

  it("derives excerpt from first meaningful text block", () => {
    expect(deriveExcerpt(normalizedContent)).toBe(
      "This is the first meaningful block of the publication."
    );
  });

  it("counts words from normalized content only", () => {
    expect(deriveWordCount(normalizedContent)).toBe(15);
  });

  it("uses deterministic reading minutes", () => {
    expect(deriveEstimatedReadingMinutes(0)).toBe(1);
    expect(deriveEstimatedReadingMinutes(220)).toBe(1);
    expect(deriveEstimatedReadingMinutes(221)).toBe(2);
  });
});
