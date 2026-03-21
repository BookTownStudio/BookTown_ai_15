import { describe, expect, it } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import { normalizeProjectManuscript } from "./normalizeProjectManuscript";

describe("normalizeProjectManuscript", () => {
  it("collapses separator plus first heading into chapter units", () => {
    const normalized = normalizeProjectManuscript({
      projectTitle: "Novel",
      contentDoc: {
        version: 1,
        type: "doc",
        content: [
          { type: "horizontalRule" },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Chapter 1 — Beginning" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Opening text." }],
          },
          { type: "horizontalRule" },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Chapter 2 — Change Appears" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Second unit text." }],
          },
        ],
      },
    });

    expect(normalized.units).toHaveLength(2);
    expect(normalized.units[0]).toMatchObject({
      index: 1,
      title: "Chapter 1 — Beginning",
      type: "chapter",
    });
    expect(normalized.units[0].content).toEqual([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Opening text." }],
      },
    ]);
  });

  it("uses heading sections when no separators exist", () => {
    const normalized = normalizeProjectManuscript({
      projectTitle: "Article",
      contentDoc: {
        version: 1,
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Introduction" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Intro text." }],
          },
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Conclusion" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Wrap up." }],
          },
        ],
      },
    });

    expect(normalized.units.map((unit) => unit.title)).toEqual([
      "Introduction",
      "Conclusion",
    ]);
    expect(normalized.units.map((unit) => unit.type)).toEqual([
      "section",
      "section",
    ]);
  });

  it("fails when a separator is not followed by a heading", () => {
    expect(() =>
      normalizeProjectManuscript({
        projectTitle: "Broken",
        contentDoc: {
          version: 1,
          type: "doc",
          content: [
            { type: "horizontalRule" },
            {
              type: "paragraph",
              content: [{ type: "text", text: "No heading here." }],
            },
          ],
        },
      })
    ).toThrowError(HttpsError);
  });
});
