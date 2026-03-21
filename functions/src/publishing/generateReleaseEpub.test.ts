import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { generateReleaseEpub } from "./generateReleaseEpub";

describe("generateReleaseEpub", () => {
  it("preserves unit titles, order, and language metadata", async () => {
    const buffer = await generateReleaseEpub({
      normalizedContent: {
        units: [
          {
            index: 1,
            title: "Chapter 1 — Beginning",
            type: "chapter",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Opening text." }],
              },
            ],
          },
          {
            index: 2,
            title: "Chapter 2 — Change Appears",
            type: "chapter",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Second chapter text." }],
              },
            ],
          },
        ],
      },
      metadata: {
        title: "Test Novel",
        author: "BookTown Author",
        language: "ar",
        identifier: "urn:booktown:release:test",
      },
    });

    const zip = await JSZip.loadAsync(buffer);
    const opf = await zip.file("OEBPS/content.opf")?.async("string");
    const firstUnit = await zip.file("OEBPS/Text/unit_0.xhtml")?.async("string");
    const secondUnit = await zip.file("OEBPS/Text/unit_1.xhtml")?.async("string");

    expect(opf).toContain("<dc:language>ar</dc:language>");
    expect(opf).toContain("<dc:title>Test Novel</dc:title>");
    expect(firstUnit).toContain("Chapter 1 — Beginning");
    expect(firstUnit).toContain("Opening text.");
    expect(secondUnit).toContain("Chapter 2 — Change Appears");
    expect(secondUnit).toContain("Second chapter text.");
  });
});
