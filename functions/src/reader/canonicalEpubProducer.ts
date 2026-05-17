import JSZip from "jszip";

export const CANONICAL_EPUB_PIPELINE_VERSION = "canonical_epub_preprocess_v1";
export const CANONICAL_EPUB_LOCATION_GENERATION_CHARS = 1200;
const MAX_INLINE_LOCATION_PAYLOAD_BYTES = 1_000_000;

export interface CanonicalEpubPreprocessResult {
  ok: true;
  locationPayload: string;
  locationCount: number;
  spineMap: CanonicalSpineMap;
  sectionGraph: CanonicalSectionGraph;
  stableAnchorMap: CanonicalStableAnchorMap;
  navigationIndex: CanonicalNavigationIndex;
  paginationHints: CanonicalPaginationHints;
}

export interface CanonicalEpubPreprocessFailure {
  ok: false;
  reason: string;
}

export type CanonicalEpubPreprocessOutcome =
  | CanonicalEpubPreprocessResult
  | CanonicalEpubPreprocessFailure;

export interface CanonicalSpineMap {
  schemaVersion: "v1";
  itemCount: number;
  items: Array<{
    spineIndex: number;
    idref: string;
    href: string;
    linear: boolean;
    mediaType: string;
  }>;
}

export interface CanonicalSectionGraph {
  schemaVersion: "v1";
  rootSectionIds: string[];
  sections: Array<{
    sectionId: string;
    spineIndex: number;
    href: string;
    title: string | null;
    parentSectionId: string | null;
    childSectionIds: string[];
  }>;
}

export interface CanonicalStableAnchorMap {
  schemaVersion: "v1";
  anchorCount: number;
  anchors: Array<{
    anchorId: string;
    spineIndex: number;
    href: string;
    cfi: string;
    textHash: string;
  }>;
}

export interface CanonicalNavigationIndex {
  schemaVersion: "v1";
  entries: Array<{
    label: string;
    href: string;
    spineIndex: number | null;
  }>;
}

export interface CanonicalPaginationHints {
  schemaVersion: "v1";
  generationChars: number;
  locationCount: number;
  averageCharsPerLocation: number;
}

type ManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties: string | null;
};

type SpineItem = {
  idref: string;
  linear: boolean;
};

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readAttr(source: string, attr: string): string | null {
  const match = source.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
  return match ? decodeXmlEntities(match[1]) : null;
}

function dirname(filePath: string): string {
  const index = filePath.lastIndexOf("/");
  return index >= 0 ? filePath.slice(0, index + 1) : "";
}

function normalizePath(basePath: string, href: string): string {
  const parts = `${basePath}${href}`.split("/");
  const output: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") output.pop();
    else output.push(part);
  }
  return output.join("/");
}

function stripTags(value: string): string {
  return decodeXmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) return null;
  return entry.async("text");
}

async function resolvePackagePath(zip: JSZip): Promise<string | null> {
  const container = await readZipText(zip, "META-INF/container.xml");
  if (!container) return null;
  const rootfile = container.match(/<rootfile\b[^>]*>/i)?.[0] ?? "";
  return readAttr(rootfile, "full-path");
}

function parseManifestItems(opf: string): Map<string, ManifestItem> {
  const items = new Map<string, ManifestItem>();
  const manifestBlock = opf.match(/<manifest\b[^>]*>([\s\S]*?)<\/manifest>/i)?.[1] ?? "";
  for (const match of manifestBlock.matchAll(/<item\b[^>]*>/gi)) {
    const tag = match[0];
    const id = readAttr(tag, "id");
    const href = readAttr(tag, "href");
    const mediaType = readAttr(tag, "media-type") ?? "";
    if (!id || !href) continue;
    items.set(id, {
      id,
      href,
      mediaType,
      properties: readAttr(tag, "properties"),
    });
  }
  return items;
}

function parseSpineItems(opf: string): SpineItem[] {
  const spineBlock = opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i)?.[1] ?? "";
  const items: SpineItem[] = [];
  for (const match of spineBlock.matchAll(/<itemref\b[^>]*>/gi)) {
    const tag = match[0];
    const idref = readAttr(tag, "idref");
    if (!idref) continue;
    items.push({
      idref,
      linear: readAttr(tag, "linear") !== "no",
    });
  }
  return items;
}

function extractTitle(xhtml: string): string | null {
  const heading = xhtml.match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
  if (heading) return stripTags(heading) || null;
  const title = xhtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? stripTags(title) || null : null;
}

function extractNavigationEntries(navXhtml: string, spineByHref: Map<string, number>) {
  const entries: CanonicalNavigationIndex["entries"] = [];
  for (const match of navXhtml.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeXmlEntities(match[1]).split("#")[0];
    entries.push({
      href,
      label: stripTags(match[2]) || href,
      spineIndex: spineByHref.has(href) ? spineByHref.get(href)! : null,
    });
  }
  return entries;
}

function buildSyntheticCfi(spineIndex: number, locationIndex: number): string {
  const packageStep = (spineIndex + 1) * 2;
  const paragraphStep = Math.max(2, (locationIndex + 1) * 2);
  return `epubcfi(/6/${packageStep}!/4/${paragraphStep}/1:0)`;
}

export async function preprocessCanonicalEpub(
  buffer: Buffer,
  options: { bookId: string; generationChars?: number }
): Promise<CanonicalEpubPreprocessOutcome> {
  const generationChars =
    options.generationChars && options.generationChars > 0
      ? Math.trunc(options.generationChars)
      : CANONICAL_EPUB_LOCATION_GENERATION_CHARS;

  const zip = await JSZip.loadAsync(buffer);
  const packagePath = await resolvePackagePath(zip);
  if (!packagePath) {
    return { ok: false, reason: "missing_package_document" };
  }

  const opf = await readZipText(zip, packagePath);
  if (!opf) {
    return { ok: false, reason: "missing_opf" };
  }

  const packageDir = dirname(packagePath);
  const manifestItems = parseManifestItems(opf);
  const spineRefs = parseSpineItems(opf);
  if (spineRefs.length === 0) {
    return { ok: false, reason: "empty_spine" };
  }

  const spineItems: CanonicalSpineMap["items"] = [];
  const sections: CanonicalSectionGraph["sections"] = [];
  const anchors: CanonicalStableAnchorMap["anchors"] = [];
  const locations: string[] = [];
  const spineByHref = new Map<string, number>();

  for (const [spineIndex, spineRef] of spineRefs.entries()) {
    const manifestItem = manifestItems.get(spineRef.idref);
    if (!manifestItem || !/xhtml|html/i.test(manifestItem.mediaType)) {
      continue;
    }
    const href = normalizePath(packageDir, manifestItem.href);
    const displayHref = manifestItem.href;
    spineByHref.set(displayHref, spineIndex);
    spineItems.push({
      spineIndex,
      idref: spineRef.idref,
      href: displayHref,
      linear: spineRef.linear,
      mediaType: manifestItem.mediaType,
    });

    const xhtml = await readZipText(zip, href);
    if (!xhtml) continue;

    const text = stripTags(xhtml);
    const sectionId = `section_${spineIndex}_${stableHash(displayHref)}`;
    sections.push({
      sectionId,
      spineIndex,
      href: displayHref,
      title: extractTitle(xhtml),
      parentSectionId: null,
      childSectionIds: [],
    });

    const locationCount = Math.max(1, Math.ceil(text.length / generationChars));
    for (let index = 0; index < locationCount; index += 1) {
      const cfi = buildSyntheticCfi(spineIndex, index);
      locations.push(cfi);
      anchors.push({
        anchorId: `epub_anchor_${spineIndex}_${index}_${stableHash(cfi)}`,
        spineIndex,
        href: displayHref,
        cfi,
        textHash: stableHash(text.slice(index * generationChars, (index + 1) * generationChars)),
      });
    }
  }

  if (spineItems.length === 0 || locations.length === 0) {
    return { ok: false, reason: "no_readable_spine_items" };
  }

  const locationPayload = JSON.stringify(locations);
  if (Buffer.byteLength(locationPayload, "utf8") > MAX_INLINE_LOCATION_PAYLOAD_BYTES) {
    return { ok: false, reason: "location_payload_too_large" };
  }

  const navItem = Array.from(manifestItems.values()).find((item) =>
    (item.properties || "").split(/\s+/).includes("nav")
  );
  const navText = navItem ? await readZipText(zip, normalizePath(packageDir, navItem.href)) : null;

  return {
    ok: true,
    locationPayload,
    locationCount: locations.length,
    spineMap: {
      schemaVersion: "v1",
      itemCount: spineItems.length,
      items: spineItems,
    },
    sectionGraph: {
      schemaVersion: "v1",
      rootSectionIds: sections.map((section) => section.sectionId),
      sections,
    },
    stableAnchorMap: {
      schemaVersion: "v1",
      anchorCount: anchors.length,
      anchors,
    },
    navigationIndex: {
      schemaVersion: "v1",
      entries: navText ? extractNavigationEntries(navText, spineByHref) : [],
    },
    paginationHints: {
      schemaVersion: "v1",
      generationChars,
      locationCount: locations.length,
      averageCharsPerLocation: generationChars,
    },
  };
}
