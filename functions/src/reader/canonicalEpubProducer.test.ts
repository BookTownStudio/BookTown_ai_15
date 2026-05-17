import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_EPUB_LOCATION_GENERATION_CHARS,
  preprocessCanonicalEpub,
} from "./canonicalEpubProducer";

async function buildMinimalEpub(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
  );
  zip.file(
    "OEBPS/content.opf",
    '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="chapter-1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="chapter-1"/></spine></package>'
  );
  zip.file(
    "OEBPS/chapter-1.xhtml",
    '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title></head><body><h1>Chapter One</h1><p>BookTown canonical reader infrastructure test paragraph.</p></body></html>'
  );
  zip.file(
    "OEBPS/nav.xhtml",
    '<html xmlns="http://www.w3.org/1999/xhtml"><body><nav epub:type="toc"><ol><li><a href="chapter-1.xhtml">Chapter One</a></li></ol></nav></body></html>'
  );
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

describe("canonical EPUB producer", () => {
  it("generates reusable location and structural metadata for parseable EPUBs", async () => {
    const result = await preprocessCanonicalEpub(await buildMinimalEpub(), {
      bookId: "book-1",
      generationChars: CANONICAL_EPUB_LOCATION_GENERATION_CHARS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.locationCount).toBeGreaterThan(0);
    expect(JSON.parse(result.locationPayload).length).toBe(result.locationCount);
    expect(result.spineMap.itemCount).toBe(1);
    expect(result.sectionGraph.sections[0]?.title).toBe("Chapter One");
    expect(result.stableAnchorMap.anchorCount).toBe(result.locationCount);
    expect(result.navigationIndex.entries[0]?.label).toBe("Chapter One");
  });

  it("fails closed when required EPUB package structure is missing", async () => {
    const zip = new JSZip();
    zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
    const result = await preprocessCanonicalEpub(
      await zip.generateAsync({ type: "nodebuffer" }),
      { bookId: "book-1" }
    );

    expect(result).toEqual({ ok: false, reason: "missing_package_document" });
  });
});
