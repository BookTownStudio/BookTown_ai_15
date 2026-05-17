import JSZip from "jszip";

export const CANONICAL_EPUB_PIPELINE_VERSION = "canonical_epub_preprocess_v1";
export const CANONICAL_EPUB_LOCATION_GENERATION_CHARS = 1200;
const MAX_INLINE_LOCATION_PAYLOAD_BYTES = 1_000_000;
const MAX_CANONICAL_PASSAGE_REFERENCES = 10_000;

export const CANONICAL_LITERARY_COORDINATE_SCHEMA = "canonical_literary_coordinate_v1";
export const CANONICAL_PASSAGE_REFERENCE_SCHEMA = "canonical_passage_reference_v1";
export const CANONICAL_ANNOTATION_IDENTITY_SCHEMA = "canonical_annotation_identity_v1";
export const CANONICAL_LITERARY_MEMORY_SCHEMA = "canonical_literary_memory_v1";

export interface CanonicalEpubPreprocessResult {
  ok: true;
  cfiFidelity: "syntactic_epub_cfi_v1";
  warnings: string[];
  locationPayload: string;
  locationCount: number;
  spineMap: CanonicalSpineMap;
  sectionGraph: CanonicalSectionGraph;
  stableAnchorMap: CanonicalStableAnchorMap;
  navigationIndex: CanonicalNavigationIndex;
  paginationHints: CanonicalPaginationHints;
  literaryCoordinateMap: CanonicalLiteraryCoordinateMap;
  passageIndex: CanonicalPassageIndex;
  annotationIdentityIndex: CanonicalAnnotationIdentityIndex;
  literaryMemoryPrimitives: CanonicalLiteraryMemoryPrimitives;
}

export interface CanonicalEpubPreprocessFailure {
  ok: false;
  reason: string;
  classification: "blocker" | "recoverable";
  warnings: string[];
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
    blockIndex: number;
    textHash: string;
    confidence: "syntactic";
  }>;
}

type BlockAnchor = {
  blockIndex: number;
  tagName: string;
  text: string;
};

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

export interface CanonicalLiteraryCoordinateMap {
  schemaVersion: "v1";
  coordinateSchema: typeof CANONICAL_LITERARY_COORDINATE_SCHEMA;
  authority: "server_precomputed";
  coverage: "complete" | "bounded_partial";
  coordinateCount: number;
  coordinates: Array<{
    coordinateId: string;
    passageId: string;
    sectionId: string;
    spineIndex: number;
    href: string;
    ordinal: number;
    startCfi: string;
    endCfi: string;
    startBlockIndex: number;
    endBlockIndex: number;
    textHash: string;
    charLength: number;
  }>;
}

export interface CanonicalPassageIndex {
  schemaVersion: "v1";
  passageReferenceSchema: typeof CANONICAL_PASSAGE_REFERENCE_SCHEMA;
  authority: "server_precomputed";
  passageCount: number;
  passages: Array<{
    passageId: string;
    coordinateId: string;
    sectionId: string;
    spineIndex: number;
    href: string;
    ordinal: number;
    textHash: string;
    charLength: number;
    extractableForSearch: boolean;
    quoteReferenceReady: boolean;
  }>;
}

export interface CanonicalAnnotationIdentityIndex {
  schemaVersion: "v1";
  annotationIdentitySchema: typeof CANONICAL_ANNOTATION_IDENTITY_SCHEMA;
  authority: "server_precomputed";
  targetCount: number;
  targets: Array<{
    annotationTargetId: string;
    coordinateId: string;
    passageId: string;
    sectionId: string;
    spineIndex: number;
    href: string;
    startCfi: string;
    endCfi: string;
    textHash: string;
    renderIndependent: true;
  }>;
}

export interface CanonicalLiteraryMemoryPrimitives {
  schemaVersion: "v1";
  memorySchema: typeof CANONICAL_LITERARY_MEMORY_SCHEMA;
  authority: "server_precomputed";
  feedCoupling: "none";
  memoryUnitCount: number;
  memoryUnits: Array<{
    memoryUnitId: string;
    kind: "section";
    sectionId: string;
    spineIndex: number;
    href: string;
    title: string | null;
    firstCoordinateId: string | null;
    passageCount: number;
  }>;
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

function hasBodyElement(value: string): boolean {
  return /<body\b[^>]*>[\s\S]*<\/body>/i.test(value);
}

function hasDangerouslyUnbalancedMarkup(value: string): boolean {
  const tags = ["html", "body", "p", "li", "blockquote", "section", "article"];
  return tags.some((tag) => {
    const opens = value.match(new RegExp(`<${tag}(\\s|>|/)`, "gi"))?.length ?? 0;
    const closes = value.match(new RegExp(`</${tag}>`, "gi"))?.length ?? 0;
    return closes > opens || opens - closes > 12;
  });
}

function extractBlockAnchors(xhtml: string): BlockAnchor[] {
  const blocks: BlockAnchor[] = [];
  const pattern = /<(p|li|blockquote|h[1-6]|section|article)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of xhtml.matchAll(pattern)) {
    const text = stripTags(match[2]);
    if (!text) continue;
    blocks.push({
      blockIndex: blocks.length,
      tagName: match[1].toLowerCase(),
      text,
    });
  }
  if (blocks.length > 0) return blocks;

  const text = stripTags(xhtml);
  return text
    ? [{
        blockIndex: 0,
        tagName: "body",
        text,
      }]
    : [];
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

function buildSyntheticCfi(spineIndex: number, blockIndex: number, locationIndex: number): string {
  const packageStep = (spineIndex + 1) * 2;
  const blockStep = Math.max(2, (blockIndex + 1) * 2);
  const textStep = Math.max(1, locationIndex + 1);
  return `epubcfi(/6/${packageStep}!/4/${blockStep}/${textStep}:0)`;
}

function isValidSyntheticCfi(value: string): boolean {
  return /^epubcfi\(\/6\/\d+!\/4\/\d+\/\d+:0\)$/.test(value);
}

function failPreprocess(
  reason: string,
  classification: "blocker" | "recoverable",
  warnings: string[]
): CanonicalEpubPreprocessFailure {
  return { ok: false, reason, classification, warnings };
}

export async function preprocessCanonicalEpub(
  buffer: Buffer,
  options: { bookId: string; generationChars?: number }
): Promise<CanonicalEpubPreprocessOutcome> {
  const warnings: string[] = [];
  const generationChars =
    options.generationChars && options.generationChars > 0
      ? Math.trunc(options.generationChars)
      : CANONICAL_EPUB_LOCATION_GENERATION_CHARS;

  const zip = await JSZip.loadAsync(buffer);
  const packagePath = await resolvePackagePath(zip);
  if (!packagePath) {
    return failPreprocess("missing_package_document", "blocker", warnings);
  }

  const opf = await readZipText(zip, packagePath);
  if (!opf) {
    return failPreprocess("missing_opf", "blocker", warnings);
  }

  const packageDir = dirname(packagePath);
  const manifestItems = parseManifestItems(opf);
  const spineRefs = parseSpineItems(opf);
  if (spineRefs.length === 0) {
    return failPreprocess("empty_spine", "blocker", warnings);
  }

  const spineItems: CanonicalSpineMap["items"] = [];
  const sections: CanonicalSectionGraph["sections"] = [];
  const anchors: CanonicalStableAnchorMap["anchors"] = [];
  const coordinates: CanonicalLiteraryCoordinateMap["coordinates"] = [];
  const passages: CanonicalPassageIndex["passages"] = [];
  const annotationTargets: CanonicalAnnotationIdentityIndex["targets"] = [];
  const memoryUnits: CanonicalLiteraryMemoryPrimitives["memoryUnits"] = [];
  const locations: string[] = [];
  const seenCfis = new Set<string>();
  const spineByHref = new Map<string, number>();
  let missingSpineItemCount = 0;
  let malformedXhtmlCount = 0;
  let semanticCoordinateOverflow = false;

  for (const [spineIndex, spineRef] of spineRefs.entries()) {
    const manifestItem = manifestItems.get(spineRef.idref);
    if (!manifestItem || !/xhtml|html/i.test(manifestItem.mediaType)) {
      missingSpineItemCount += 1;
      warnings.push(`missing_or_unsupported_spine_item:${spineRef.idref}`);
      continue;
    }
    const href = normalizePath(packageDir, manifestItem.href);
    const displayHref = manifestItem.href;

    const xhtml = await readZipText(zip, href);
    if (!xhtml) {
      missingSpineItemCount += 1;
      warnings.push(`missing_spine_asset:${displayHref}`);
      continue;
    }
    if (!hasBodyElement(xhtml) || hasDangerouslyUnbalancedMarkup(xhtml)) {
      malformedXhtmlCount += 1;
      warnings.push(`malformed_xhtml:${displayHref}`);
      continue;
    }

    const blockAnchors = extractBlockAnchors(xhtml);
    const text = blockAnchors.map((block) => block.text).join(" ");
    if (!text) {
      warnings.push(`empty_spine_text:${displayHref}`);
      continue;
    }
    spineByHref.set(displayHref, spineIndex);
    spineItems.push({
      spineIndex,
      idref: spineRef.idref,
      href: displayHref,
      linear: spineRef.linear,
      mediaType: manifestItem.mediaType,
    });
    const sectionId = `section_${spineIndex}_${stableHash(displayHref)}`;
    const title = extractTitle(xhtml);
    sections.push({
      sectionId,
      spineIndex,
      href: displayHref,
      title,
      parentSectionId: null,
      childSectionIds: [],
    });

    const sectionCoordinateIds: string[] = [];
    for (const block of blockAnchors) {
      if (coordinates.length >= MAX_CANONICAL_PASSAGE_REFERENCES) {
        semanticCoordinateOverflow = true;
        break;
      }

      const passageCfi = buildSyntheticCfi(spineIndex, block.blockIndex, 0);
      if (!isValidSyntheticCfi(passageCfi)) {
        return failPreprocess("unstable_passage_coordinate_generation", "blocker", warnings);
      }

      const textHash = stableHash(block.text);
      const passageId = `passage_${spineIndex}_${block.blockIndex}_${textHash}`;
      const coordinateId = `lit_coord_${spineIndex}_${block.blockIndex}_${stableHash(`${displayHref}:${textHash}`)}`;
      const annotationTargetId = `annotation_target_${stableHash(`${coordinateId}:${passageCfi}`)}`;

      sectionCoordinateIds.push(coordinateId);
      coordinates.push({
        coordinateId,
        passageId,
        sectionId,
        spineIndex,
        href: displayHref,
        ordinal: coordinates.length,
        startCfi: passageCfi,
        endCfi: passageCfi,
        startBlockIndex: block.blockIndex,
        endBlockIndex: block.blockIndex,
        textHash,
        charLength: block.text.length,
      });
      passages.push({
        passageId,
        coordinateId,
        sectionId,
        spineIndex,
        href: displayHref,
        ordinal: passages.length,
        textHash,
        charLength: block.text.length,
        extractableForSearch: true,
        quoteReferenceReady: true,
      });
      annotationTargets.push({
        annotationTargetId,
        coordinateId,
        passageId,
        sectionId,
        spineIndex,
        href: displayHref,
        startCfi: passageCfi,
        endCfi: passageCfi,
        textHash,
        renderIndependent: true,
      });
    }
    if (semanticCoordinateOverflow) {
      warnings.push(`semantic_coordinate_overflow:${MAX_CANONICAL_PASSAGE_REFERENCES}`);
    }
    memoryUnits.push({
      memoryUnitId: `memory_section_${spineIndex}_${stableHash(displayHref)}`,
      kind: "section",
      sectionId,
      spineIndex,
      href: displayHref,
      title,
      firstCoordinateId: sectionCoordinateIds[0] ?? null,
      passageCount: sectionCoordinateIds.length,
    });

    let locationIndex = 0;
    let charsSinceLocation = 0;
    for (const block of blockAnchors) {
      charsSinceLocation += block.text.length;
      if (charsSinceLocation < generationChars && locationIndex > 0) {
        continue;
      }
      const cfi = buildSyntheticCfi(spineIndex, block.blockIndex, locationIndex);
      if (!isValidSyntheticCfi(cfi) || seenCfis.has(cfi)) {
        return failPreprocess("unstable_cfi_generation", "blocker", warnings);
      }
      seenCfis.add(cfi);
      locations.push(cfi);
      anchors.push({
        anchorId: `epub_anchor_${spineIndex}_${locationIndex}_${stableHash(cfi)}`,
        spineIndex,
        href: displayHref,
        cfi,
        blockIndex: block.blockIndex,
        textHash: stableHash(block.text),
        confidence: "syntactic",
      });
      locationIndex += 1;
      charsSinceLocation = 0;
    }
  }

  if (spineItems.length === 0 || locations.length === 0) {
    return failPreprocess("no_readable_spine_items", "blocker", warnings);
  }
  if (missingSpineItemCount > 0 && spineItems.length < Math.ceil(spineRefs.length * 0.5)) {
    return failPreprocess("too_many_missing_spine_items", "blocker", warnings);
  }
  if (malformedXhtmlCount > 0 && sections.length < Math.ceil(spineRefs.length * 0.5)) {
    return failPreprocess("too_many_malformed_sections", "blocker", warnings);
  }

  const locationPayload = JSON.stringify(locations);
  if (Buffer.byteLength(locationPayload, "utf8") > MAX_INLINE_LOCATION_PAYLOAD_BYTES) {
    return failPreprocess("location_payload_too_large", "recoverable", warnings);
  }

  const navItem = Array.from(manifestItems.values()).find((item) =>
    (item.properties || "").split(/\s+/).includes("nav")
  );
  const navText = navItem ? await readZipText(zip, normalizePath(packageDir, navItem.href)) : null;

  return {
    ok: true,
    cfiFidelity: "syntactic_epub_cfi_v1",
    warnings,
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
    literaryCoordinateMap: {
      schemaVersion: "v1",
      coordinateSchema: CANONICAL_LITERARY_COORDINATE_SCHEMA,
      authority: "server_precomputed",
      coverage: semanticCoordinateOverflow ? "bounded_partial" : "complete",
      coordinateCount: coordinates.length,
      coordinates,
    },
    passageIndex: {
      schemaVersion: "v1",
      passageReferenceSchema: CANONICAL_PASSAGE_REFERENCE_SCHEMA,
      authority: "server_precomputed",
      passageCount: passages.length,
      passages,
    },
    annotationIdentityIndex: {
      schemaVersion: "v1",
      annotationIdentitySchema: CANONICAL_ANNOTATION_IDENTITY_SCHEMA,
      authority: "server_precomputed",
      targetCount: annotationTargets.length,
      targets: annotationTargets,
    },
    literaryMemoryPrimitives: {
      schemaVersion: "v1",
      memorySchema: CANONICAL_LITERARY_MEMORY_SCHEMA,
      authority: "server_precomputed",
      feedCoupling: "none",
      memoryUnitCount: memoryUnits.length,
      memoryUnits,
    },
  };
}
