import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "./shared/auth";

type SaveSource = "autosave" | "migration" | "publish" | "manual";
type SaveAuthority = "complete" | "partial";
type WriteContentNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: WriteContentNode[];
};
type WriteContentDoc = { version: 1; type: "doc"; content: WriteContentNode[] };
type SectionRecord = {
  schemaVersion: 1;
  projectId: string;
  sectionId: string;
  order: number;
  title: string;
  kind: "chapter" | "section";
  chunkCount: number;
  nodeCount: number;
  wordCount: number;
  revision: number;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
};
type ChunkRecord = {
  schemaVersion: 1;
  projectId: string;
  sectionId: string;
  chunkId: string;
  order: number;
  nodeCount: number;
  byteSize: number;
  plainTextSize: number;
  wordCount: number;
  contentHash: string;
  anchorIds?: string[];
  revision: number;
  contentDoc: WriteContentDoc;
  createdAt: string;
  updatedAt: string;
};
type OperationAckInput = {
  schemaVersion: 1;
  operationId: string;
  type: "chunk_snapshot_save";
  sequence: number;
  createdAt: number;
  updatedAt: number;
  expectedRevision?: number;
  affectedChunkIds?: string[];
  mountedSectionIds?: string[];
  causality: {
    schemaVersion: 1;
    actorId: string;
    deviceId: string;
    sequence: number;
    parents: string[];
    vectorClock: Record<string, number>;
    chunkIds: string[];
    baseRevision?: number;
    createdAt: number;
  };
  convergenceHash: string;
};

type ChunkMutationTraceContext = {
  uid: string;
  projectId?: string;
  source?: SaveSource;
  authority?: SaveAuthority;
  clientRevision?: number;
  serverRevision?: unknown;
  operation?: OperationAckInput;
};

const TARGET_CHUNK_BYTES = 120_000;
const TARGET_CHUNK_NODE_COUNT = 80;
const MAX_TRANSACTION_WRITES = 430;
const CHECKPOINT_WINDOW_SIZE = 200;
const STRUCTURAL_ANCHOR_ATTR = "btAnchorId";
const STRUCTURAL_SECTION_ATTR = "btSectionId";
const STRUCTURAL_CHUNK_ATTR = "btChunkId";
const STRUCTURAL_ATTRS = new Set([STRUCTURAL_ANCHOR_ATTR, STRUCTURAL_SECTION_ATTR, STRUCTURAL_CHUNK_ATTR]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function createHash(value: unknown): string {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function traceChunkMutation(event: string, context: ChunkMutationTraceContext, detail: Record<string, unknown> = {}): void {
  logger.info(`[WRITE][CHUNK_MUTATION_${event}]`, {
    uid: context.uid,
    projectId: context.projectId,
    source: context.source,
    authority: context.authority,
    clientRevision: context.clientRevision,
    serverRevision: context.serverRevision,
    operation: context.operation
      ? {
          operationId: context.operation.operationId,
          sequence: context.operation.sequence,
          expectedRevision: context.operation.expectedRevision,
          causalitySequence: context.operation.causality.sequence,
          causalityBaseRevision: context.operation.causality.baseRevision,
          causalityParentCount: context.operation.causality.parents.length,
          causalityChunkCount: context.operation.causality.chunkIds.length,
          vectorClockWidth: Object.keys(context.operation.causality.vectorClock).length,
          convergenceHash: context.operation.convergenceHash,
        }
      : null,
    ...detail,
  });
}

function traceChunkMutationRejection(
  reason: string,
  context: ChunkMutationTraceContext,
  detail: Record<string, unknown> = {}
): void {
  logger.warn("[WRITE][CHUNK_MUTATION_SEMANTIC_REJECTION]", {
    uid: context.uid,
    projectId: context.projectId,
    source: context.source,
    authority: context.authority,
    clientRevision: context.clientRevision,
    serverRevision: context.serverRevision,
    reason,
    operationId: context.operation?.operationId,
    operationExpectedRevision: context.operation?.expectedRevision,
    convergenceHash: context.operation?.convergenceHash,
    ...detail,
  });
}

function normalizeId(value: unknown, max = 128): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.includes("/")) return undefined;
  return normalized.slice(0, max);
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, maxLength))))
    .slice(0, maxItems);
}

function normalizeOperation(value: unknown, uid: string): OperationAckInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const causality = input.causality as Record<string, unknown> | undefined;
  const operationId = normalizeId(input.operationId);
  const actorId = normalizeId(causality?.actorId);
  const deviceId = normalizeId(causality?.deviceId, 96);
  const convergenceHash = normalizeId(input.convergenceHash);
  if (
    input.schemaVersion !== 1 ||
    input.type !== "chunk_snapshot_save" ||
    !operationId ||
    !actorId ||
    actorId !== uid ||
    !deviceId ||
    !convergenceHash ||
    typeof input.sequence !== "number" ||
    !Number.isInteger(input.sequence) ||
    input.sequence < 0 ||
    typeof input.createdAt !== "number" ||
    !Number.isFinite(input.createdAt) ||
    typeof input.updatedAt !== "number" ||
    !Number.isFinite(input.updatedAt)
  ) {
    throw new HttpsError("invalid-argument", "Invalid chunk mutation operation metadata.");
  }

  return {
    schemaVersion: 1,
    operationId,
    type: "chunk_snapshot_save",
    sequence: input.sequence,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    expectedRevision: typeof input.expectedRevision === "number" && Number.isInteger(input.expectedRevision)
      ? input.expectedRevision
      : undefined,
    affectedChunkIds: normalizeStringList(input.affectedChunkIds, 256, 120),
    mountedSectionIds: normalizeStringList(input.mountedSectionIds, 128, 120),
    causality: {
      schemaVersion: 1,
      actorId,
      deviceId,
      sequence: typeof causality?.sequence === "number" && Number.isInteger(causality.sequence)
        ? causality.sequence
        : input.sequence,
      parents: normalizeStringList(causality?.parents, 16, 128),
      vectorClock: Object.fromEntries(
        Object.entries((causality?.vectorClock ?? {}) as Record<string, unknown>)
          .filter(([, entry]) => typeof entry === "number" && Number.isInteger(entry) && entry >= 0)
          .slice(0, 64)
      ) as Record<string, number>,
      chunkIds: normalizeStringList(causality?.chunkIds, 256, 120),
      baseRevision: typeof causality?.baseRevision === "number" && Number.isInteger(causality.baseRevision)
        ? causality.baseRevision
        : undefined,
      createdAt: typeof causality?.createdAt === "number" && Number.isFinite(causality.createdAt)
        ? causality.createdAt
        : input.createdAt,
    },
    convergenceHash,
  };
}

function normalizeContentDoc(value: unknown): WriteContentDoc {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "snapshot.contentDoc is required.");
  }
  const doc = value as Partial<WriteContentDoc>;
  if (doc.type !== "doc" || doc.version !== 1 || !Array.isArray(doc.content)) {
    throw new HttpsError("invalid-argument", "snapshot.contentDoc must be a versioned doc.");
  }
  const serialized = JSON.stringify(doc);
  if (serialized.length > 2_000_000) {
    throw new HttpsError("invalid-argument", "snapshot.contentDoc exceeds maximum allowed size.");
  }
  return JSON.parse(serialized) as WriteContentDoc;
}

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function nodeText(node: WriteContentNode): string {
  const own = typeof node.text === "string" ? node.text : "";
  const child = Array.isArray(node.content) ? node.content.map(nodeText).join(" ") : "";
  return `${own} ${child}`.replace(/\s+/g, " ").trim();
}

function nodesText(nodes: WriteContentNode[]): string {
  return nodes.map(nodeText).filter(Boolean).join("\n");
}

function removeStructuralAttrs(attrs?: Record<string, unknown>): Record<string, unknown> {
  if (!attrs) return {};
  return Object.fromEntries(Object.entries(attrs).filter(([key]) => !STRUCTURAL_ATTRS.has(key)));
}

function isAnchorable(node: WriteContentNode): boolean {
  return node.type !== "text";
}

function ensureNodeAnchors(node: WriteContentNode, scopeId: string, path: number[], usedIds: Set<string>): WriteContentNode {
  if (!isAnchorable(node)) return node;
  const existing = typeof node.attrs?.[STRUCTURAL_ANCHOR_ATTR] === "string"
    ? String(node.attrs[STRUCTURAL_ANCHOR_ATTR]).trim()
    : "";
  let anchorId = existing && !usedIds.has(existing)
    ? existing
    : `anc_${createHash({ scopeId, path, type: node.type, attrs: removeStructuralAttrs(node.attrs), text: node.text ?? "" })}`;
  let suffix = 2;
  while (usedIds.has(anchorId)) {
    anchorId = `${anchorId}_${suffix}`;
    suffix += 1;
  }
  usedIds.add(anchorId);
  const content = Array.isArray(node.content)
    ? node.content.map((child, index) => ensureNodeAnchors(child, scopeId, [...path, index], usedIds))
    : undefined;
  return {
    ...node,
    attrs: { ...(node.attrs ?? {}), [STRUCTURAL_ANCHOR_ATTR]: anchorId },
    ...(content ? { content } : {}),
  };
}

function ensureStructuralAnchors(doc: WriteContentDoc, projectId: string): WriteContentDoc {
  const usedIds = new Set<string>();
  return {
    version: 1,
    type: "doc",
    content: doc.content.map((node, index) => ensureNodeAnchors(node, projectId, [index], usedIds)),
  };
}

function getAttr(node: WriteContentNode, attr: string): string | null {
  const value = node.attrs?.[attr];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dominantId(nodes: WriteContentNode[], attr: string, fallback: string): string {
  const counts = new Map<string, number>();
  nodes.forEach((node) => {
    const value = getAttr(node, attr);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? fallback;
}

function assignChunkIdentity(node: WriteContentNode, sectionId: string, chunkId: string): WriteContentNode {
  if (!isAnchorable(node)) return node;
  return {
    ...node,
    attrs: { ...(node.attrs ?? {}), [STRUCTURAL_SECTION_ATTR]: sectionId, [STRUCTURAL_CHUNK_ATTR]: chunkId },
    ...(Array.isArray(node.content)
      ? { content: node.content.map((child) => assignChunkIdentity(child, sectionId, chunkId)) }
      : {}),
  };
}

function splitSections(nodes: WriteContentNode[]): Array<{ nodes: WriteContentNode[]; title: string; kind: "chapter" }> {
  const sections: Array<{ nodes: WriteContentNode[]; title: string; kind: "chapter" }> = [];
  let current: WriteContentNode[] = [];
  const titleFor = (items: WriteContentNode[], fallback: string) => (
    nodeText(items.find((node) => node.type === "heading" && nodeText(node)) ?? {}) || fallback
  ).slice(0, 180);
  nodes.forEach((node) => {
    if (node.type === "horizontalRule" && current.length > 0) {
      sections.push({ nodes: current, title: titleFor(current, `Section ${sections.length + 1}`), kind: "chapter" });
      current = [node];
      return;
    }
    current.push(node);
  });
  if (current.length > 0 || sections.length === 0) {
    sections.push({ nodes: current, title: titleFor(current, `Section ${sections.length + 1}`), kind: "chapter" });
  }
  return sections;
}

function splitChunks(nodes: WriteContentNode[]): WriteContentNode[][] {
  const chunks: WriteContentNode[][] = [];
  let current: WriteContentNode[] = [];
  let bytes = 0;
  nodes.forEach((node) => {
    const nodeBytes = stableStringify(node).length;
    if (current.length > 0 && (current.length >= TARGET_CHUNK_NODE_COUNT || bytes + nodeBytes > TARGET_CHUNK_BYTES)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(node);
    bytes += nodeBytes;
  });
  if (current.length > 0 || chunks.length === 0) chunks.push(current);
  return chunks;
}

function chunkKey(chunk: Pick<ChunkRecord, "sectionId" | "chunkId">): string {
  return `${chunk.sectionId}/${chunk.chunkId}`;
}

function createChunkId(sectionId: string, order: number): string {
  return `${sectionId}_chunk_${String(order + 1).padStart(4, "0")}`;
}

function createDraft(params: {
  projectId: string;
  contentDoc: WriteContentDoc;
  wordCount: number;
  revision: number;
  source: SaveSource;
  now: string;
}) {
  const anchored = ensureStructuralAnchors(params.contentDoc, params.projectId);
  const sections: SectionRecord[] = [];
  const chunks: ChunkRecord[] = [];
  const chunkSectionIndexes: number[] = [];
  const sectionIdentityHints: Array<{ hasStructuralSectionId: boolean }> = [];
  splitSections(anchored.content).forEach((sectionDraft, sectionOrder) => {
    const sectionId = dominantId(sectionDraft.nodes, STRUCTURAL_SECTION_ATTR, `section_${String(sectionOrder + 1).padStart(4, "0")}`);
    sectionIdentityHints.push({
      hasStructuralSectionId: sectionDraft.nodes.some((node) => Boolean(getAttr(node, STRUCTURAL_SECTION_ATTR))),
    });
    const sectionChunks = splitChunks(sectionDraft.nodes);
    const sectionHash = createHash(sectionDraft.nodes);
    sections.push({
      schemaVersion: 1,
      projectId: params.projectId,
      sectionId,
      order: sectionOrder,
      title: sectionDraft.title,
      kind: sectionDraft.kind,
      chunkCount: sectionChunks.length,
      nodeCount: sectionDraft.nodes.length,
      wordCount: countWords(nodesText(sectionDraft.nodes)),
      revision: params.revision,
      contentHash: sectionHash,
      createdAt: params.now,
      updatedAt: params.now,
    });
    sectionChunks.forEach((chunkNodes, chunkOrder) => {
      const chunkId = dominantId(chunkNodes, STRUCTURAL_CHUNK_ATTR, `${sectionId}_chunk_${String(chunkOrder + 1).padStart(4, "0")}`);
      const content = chunkNodes.map((node) => assignChunkIdentity(node, sectionId, chunkId));
      const contentDoc: WriteContentDoc = { version: 1, type: "doc", content };
      const plainText = nodesText(content);
      chunks.push({
        schemaVersion: 1,
        projectId: params.projectId,
        sectionId,
        chunkId,
        order: chunkOrder,
        nodeCount: content.length,
        byteSize: stableStringify(contentDoc).length,
        plainTextSize: plainText.length,
        wordCount: countWords(plainText),
        contentHash: createHash(contentDoc),
        anchorIds: content
          .map((node) => typeof node.attrs?.[STRUCTURAL_ANCHOR_ATTR] === "string" ? String(node.attrs[STRUCTURAL_ANCHOR_ATTR]) : null)
          .filter((entry): entry is string => Boolean(entry)),
        revision: params.revision,
        contentDoc,
        createdAt: params.now,
        updatedAt: params.now,
      });
      chunkSectionIndexes.push(sectionOrder);
    });
  });
  const contentHash = createHash({ version: 1, type: "doc", content: chunks.flatMap((chunk) => chunk.contentDoc.content) });
  const snapshotId = `snapshot_${String(params.revision).padStart(8, "0")}_${params.now.replace(/[^0-9]/g, "").slice(0, 17)}_${contentHash}`;
  return {
    activeSectionId: sections[0]?.sectionId ?? "section_0001",
    sections,
    chunks,
    chunkSectionIndexes,
    sectionIdentityHints,
    contentHash,
    snapshot: {
      schemaVersion: 1,
      projectId: params.projectId,
      snapshotId,
      source: params.source,
      revision: params.revision,
      sectionCount: sections.length,
      chunkCount: chunks.length,
      wordCount: params.wordCount,
      contentHash,
      createdAt: params.now,
    },
  };
}

function mapSection(value: FirebaseFirestore.DocumentData): SectionRecord | null {
  if (typeof value.sectionId !== "string" || typeof value.projectId !== "string") return null;
  return {
    schemaVersion: 1,
    projectId: value.projectId,
    sectionId: value.sectionId,
    order: typeof value.order === "number" ? value.order : 0,
    title: typeof value.title === "string" ? value.title : "Section",
    kind: value.kind === "section" ? "section" : "chapter",
    chunkCount: typeof value.chunkCount === "number" ? value.chunkCount : 0,
    nodeCount: typeof value.nodeCount === "number" ? value.nodeCount : 0,
    wordCount: typeof value.wordCount === "number" ? value.wordCount : 0,
    revision: typeof value.revision === "number" ? value.revision : 1,
    contentHash: typeof value.contentHash === "string" ? value.contentHash : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

function mapChunk(value: FirebaseFirestore.DocumentData): ChunkRecord | null {
  const contentDoc = value.contentDoc as Partial<WriteContentDoc> | undefined;
  if (
    typeof value.chunkId !== "string" ||
    typeof value.sectionId !== "string" ||
    typeof value.projectId !== "string" ||
    contentDoc?.type !== "doc" ||
    contentDoc.version !== 1 ||
    !Array.isArray(contentDoc.content)
  ) return null;
  return {
    schemaVersion: 1,
    projectId: value.projectId,
    sectionId: value.sectionId,
    chunkId: value.chunkId,
    order: typeof value.order === "number" ? value.order : 0,
    nodeCount: typeof value.nodeCount === "number" ? value.nodeCount : contentDoc.content.length,
    byteSize: typeof value.byteSize === "number" ? value.byteSize : JSON.stringify(contentDoc).length,
    plainTextSize: typeof value.plainTextSize === "number" ? value.plainTextSize : 0,
    wordCount: typeof value.wordCount === "number" ? value.wordCount : 0,
    contentHash: typeof value.contentHash === "string" ? value.contentHash : "",
    anchorIds: Array.isArray(value.anchorIds) ? value.anchorIds.filter((entry: unknown): entry is string => typeof entry === "string") : undefined,
    revision: typeof value.revision === "number" ? value.revision : 1,
    contentDoc: { version: 1, type: "doc", content: contentDoc.content },
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
  };
}

function sameSection(a: SectionRecord, b: SectionRecord): boolean {
  return a.sectionId === b.sectionId && a.order === b.order && a.title === b.title && a.kind === b.kind &&
    a.chunkCount === b.chunkCount && a.nodeCount === b.nodeCount && a.wordCount === b.wordCount && a.contentHash === b.contentHash;
}

function sameChunk(a: ChunkRecord, b: ChunkRecord): boolean {
  return a.sectionId === b.sectionId && a.chunkId === b.chunkId && a.order === b.order &&
    a.nodeCount === b.nodeCount && a.byteSize === b.byteSize && a.plainTextSize === b.plainTextSize &&
    a.wordCount === b.wordCount && a.contentHash === b.contentHash;
}

function createCollisionSafeId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  let candidate = `${baseId}_${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${baseId}_${suffix}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function takeByContentHash<T extends { contentHash: string }>(
  index: Map<string, T[]>,
  contentHash: string,
  used: Set<T>
): T | null {
  const candidates = index.get(contentHash) ?? [];
  const match = candidates.find((candidate) => !used.has(candidate));
  if (!match) return null;
  used.add(match);
  return match;
}

function createContentHashIndex<T extends { contentHash: string }>(records: T[]): Map<string, T[]> {
  const index = new Map<string, T[]>();
  records.forEach((record) => {
    if (!record.contentHash) return;
    index.set(record.contentHash, [...(index.get(record.contentHash) ?? []), record]);
  });
  return index;
}

function countDraftSectionIds(sections: SectionRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  sections.forEach((section) => counts.set(section.sectionId, (counts.get(section.sectionId) ?? 0) + 1));
  return counts;
}

function reconcileSections(params: {
  draft: ReturnType<typeof createDraft>;
  existingSections: SectionRecord[];
  revision: number;
  now: string;
}): {
  sections: SectionRecord[];
  sectionIdByDraftIndex: Map<number, string>;
} {
  const existingById = new Map(params.existingSections.map((section) => [section.sectionId, section]));
  const existingByHash = createContentHashIndex(params.existingSections);
  const draftIdCounts = countDraftSectionIds(params.draft.sections);
  const usedExistingSections = new Set<SectionRecord>();
  const usedSectionIds = new Set<string>();
  const sectionIdByDraftIndex = new Map<number, string>();

  const matchedSections = params.draft.sections.map((section, index) => {
    const sameId = existingById.get(section.sectionId);
    const draftIdIsDuplicated = (draftIdCounts.get(section.sectionId) ?? 0) > 1;
    const hasAuthoritativeSectionIdentity = params.draft.sectionIdentityHints[index]?.hasStructuralSectionId === true;
    const matched =
      takeByContentHash(existingByHash, section.contentHash, usedExistingSections) ??
      (
        sameId &&
        !usedExistingSections.has(sameId) &&
        (!draftIdIsDuplicated || hasAuthoritativeSectionIdentity)
          ? sameId
          : null
      );
    if (matched) {
      usedExistingSections.add(matched);
      usedSectionIds.add(matched.sectionId);
    }
    return matched;
  });

  const sections = params.draft.sections.map((section, index) => {
    const matched = matchedSections[index];

    const sectionId = matched
      ? matched.sectionId
      : createCollisionSafeId(section.sectionId, usedSectionIds);
    sectionIdByDraftIndex.set(index, sectionId);
    const changed =
      !matched ||
      matched.order !== section.order ||
      matched.title !== section.title ||
      matched.kind !== section.kind ||
      matched.chunkCount !== section.chunkCount ||
      matched.nodeCount !== section.nodeCount ||
      matched.wordCount !== section.wordCount ||
      matched.contentHash !== section.contentHash;

    return {
      ...section,
      sectionId,
      revision: changed ? params.revision : matched?.revision ?? params.revision,
      createdAt: matched?.createdAt ?? section.createdAt,
      updatedAt: changed ? params.now : matched?.updatedAt ?? params.now,
    };
  });

  return { sections, sectionIdByDraftIndex };
}

function remapChunkToSection(params: {
  chunk: ChunkRecord;
  sectionId: string;
  chunkId: string;
  revision: number;
  now: string;
  matched?: ChunkRecord | null;
}): ChunkRecord {
  const content = params.chunk.contentDoc.content.map((node) => assignChunkIdentity(node, params.sectionId, params.chunkId));
  const contentDoc: WriteContentDoc = { version: 1, type: "doc", content };
  const plainText = nodesText(content);
  const contentHash = createHash(contentDoc);
  const nextChunk = {
    ...params.chunk,
    sectionId: params.sectionId,
    chunkId: params.chunkId,
    byteSize: stableStringify(contentDoc).length,
    plainTextSize: plainText.length,
    wordCount: countWords(plainText),
    contentHash,
    anchorIds: content
      .map((node) => typeof node.attrs?.[STRUCTURAL_ANCHOR_ATTR] === "string" ? String(node.attrs[STRUCTURAL_ANCHOR_ATTR]) : null)
      .filter((entry): entry is string => Boolean(entry)),
    contentDoc,
  };
  const changed = !params.matched || !sameChunk(params.matched, nextChunk);
  return {
    ...nextChunk,
    revision: changed ? params.revision : params.matched?.revision ?? params.revision,
    createdAt: params.matched?.createdAt ?? params.chunk.createdAt,
    updatedAt: changed ? params.now : params.matched?.updatedAt ?? params.now,
  };
}

function reconcile(params: {
  draft: ReturnType<typeof createDraft>;
  existingSections: SectionRecord[];
  existingChunks: ChunkRecord[];
  revision: number;
  authority: SaveAuthority;
  authoritativeSectionIds: string[];
  now: string;
}) {
  const { sections, sectionIdByDraftIndex } = reconcileSections({
    draft: params.draft,
    existingSections: params.existingSections,
    revision: params.revision,
    now: params.now,
  });
  const existingChunksByKey = new Map(params.existingChunks.map((chunk) => [chunkKey(chunk), chunk]));
  const existingChunksByHash = createContentHashIndex(params.existingChunks);
  const usedExistingChunks = new Set<ChunkRecord>();
  const usedChunkKeys = new Set<string>();
  const chunks = params.draft.chunks.map((chunk, index) => {
    const draftSectionIndex = params.draft.chunkSectionIndexes[index] ?? 0;
    const sectionId = sectionIdByDraftIndex.get(draftSectionIndex) ?? chunk.sectionId;
    const fallbackChunkId = chunk.sectionId === sectionId ? chunk.chunkId : createChunkId(sectionId, chunk.order);
    const proposedChunkId = fallbackChunkId || createChunkId(sectionId, chunk.order);
    const proposedKey = `${sectionId}/${proposedChunkId}`;
    const sameKey = existingChunksByKey.get(proposedKey);
    const matched =
      takeByContentHash(existingChunksByHash, chunk.contentHash, usedExistingChunks) ??
      (sameKey && !usedExistingChunks.has(sameKey) ? sameKey : null);
    if (matched) {
      usedExistingChunks.add(matched);
    }
    const baseChunkId = matched?.chunkId ?? proposedChunkId;
    const safeChunkKey = createCollisionSafeId(`${sectionId}/${baseChunkId}`, usedChunkKeys);
    const chunkId = safeChunkKey.slice(safeChunkKey.indexOf("/") + 1);
    return remapChunkToSection({
      chunk,
      sectionId,
      chunkId,
      revision: params.revision,
      now: params.now,
      matched,
    });
  });
  const nextSectionIds = new Set(sections.map((section) => section.sectionId));
  const nextChunkKeys = new Set(chunks.map(chunkKey));
  const authoritativeSectionSet = params.authority === "complete"
    ? new Set(params.existingSections.map((section) => section.sectionId))
    : new Set(params.authoritativeSectionIds);
  const authoritativeChunkDeleteScope = params.authority === "complete"
    ? new Set(params.existingChunks.map(chunkKey))
    : new Set(params.existingChunks.filter((chunk) => authoritativeSectionSet.has(chunk.sectionId)).map(chunkKey));
  const sectionUpserts = sections.filter((section) => {
    const existing = params.existingSections.find((entry) => entry.sectionId === section.sectionId);
    return !existing || !sameSection(existing, section);
  });
  const chunkUpserts = chunks.filter((chunk) => {
    const existing = existingChunksByKey.get(chunkKey(chunk));
    return !existing || !sameChunk(existing, chunk);
  });
  const chunkDeletes = params.existingChunks.filter((chunk) => authoritativeChunkDeleteScope.has(chunkKey(chunk)) && !nextChunkKeys.has(chunkKey(chunk)));
  const sectionDeletes = params.authority === "complete"
    ? params.existingSections.filter((section) => !nextSectionIds.has(section.sectionId))
    : [];
  return {
    activeSectionId: params.draft.activeSectionId,
    sections,
    chunks,
    sectionUpserts,
    chunkUpserts,
    chunkDeletes,
    sectionDeletes,
    dirtyChunkCount: chunkUpserts.length,
    unchangedChunkCount: chunks.length - chunkUpserts.length,
    savePayloadBytes: chunkUpserts.reduce((sum, chunk) => sum + chunk.byteSize, 0),
  };
}

function metadataFor(params: {
  reconciliation: ReturnType<typeof reconcile>;
  draft: ReturnType<typeof createDraft>;
  revision: number;
  source: SaveSource;
  authority: SaveAuthority;
  existingSections: SectionRecord[];
  existingChunks: ChunkRecord[];
  totalSectionCount?: number;
  totalChunkCount?: number;
}) {
  const writesSnapshot = params.authority === "complete";
  const nextChunkCount = params.authority === "complete"
    ? params.reconciliation.chunks.length
    : Math.max(0, params.totalChunkCount ?? params.existingChunks.length) -
      params.existingChunks.length +
      params.reconciliation.chunks.length;
  return {
    version: 1,
    mode: "chunked" as const,
    activeSectionId: params.reconciliation.activeSectionId,
    latestRevision: params.revision,
    ...(writesSnapshot ? { latestSnapshotId: params.draft.snapshot.snapshotId } : {}),
    sectionCount: params.authority === "complete"
      ? params.reconciliation.sections.length
      : Math.max(params.totalSectionCount ?? 0, params.existingSections.length, params.reconciliation.sections.length),
    chunkCount: nextChunkCount,
    ...(writesSnapshot ? { contentHash: params.draft.contentHash } : {}),
    ...(params.source === "migration" ? { migratedAt: new Date().toISOString() } : {}),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTitleMetadata(value: unknown): { title?: string; titleEn?: string; titleAr?: string } {
  if (!value || typeof value !== "object") {
    return {};
  }
  const source = value as Record<string, unknown>;
  const normalize = (entry: unknown): string | undefined => {
    if (typeof entry !== "string") {
      return undefined;
    }
    const trimmed = entry.trim();
    return trimmed.length > 180 ? trimmed.slice(0, 180) : trimmed;
  };
  const titleEn = normalize(source.titleEn);
  const titleAr = normalize(source.titleAr);
  const title = normalize(source.title) ?? titleEn ?? titleAr;
  return {
    ...(title ? { title } : {}),
    ...(titleEn ? { titleEn } : {}),
    ...(titleAr ? { titleAr } : {}),
  };
}

export const applyWriteChunkMutation = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const data = request.data as Record<string, unknown>;
  const projectId = normalizeId(data.projectId, 120);
  const revision = typeof data.revision === "number" && Number.isInteger(data.revision) && data.revision > 0 ? data.revision : undefined;
  const source = data.source === "migration" || data.source === "publish" || data.source === "manual" ? data.source : "autosave";
  const authority = data.authority === "complete" ? "complete" : "partial";
  traceChunkMutation("HANDLER_ENTRY", {
    uid,
    projectId,
    source,
    authority,
    clientRevision: revision,
  }, {
    rawSource: data.source,
    rawAuthority: data.authority,
    topLevelKeys: Object.keys(data),
    hasOperation: data.operation !== undefined,
  });
  let operation: OperationAckInput | undefined;
  try {
    operation = data.operation === undefined ? undefined : normalizeOperation(data.operation, uid);
  } catch (error) {
    traceChunkMutationRejection("invalid_operation_metadata", {
      uid,
      projectId,
      source,
      authority,
      clientRevision: revision,
    }, {
      errorCode: error instanceof HttpsError ? error.code : undefined,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  traceChunkMutation("VALIDATOR_SUCCESS_HANDLER_NORMALIZED", {
    uid,
    projectId,
    source,
    authority,
    clientRevision: revision,
    operation,
  }, {
    provenanceClass: source === "migration" ? "migration" : "live_write",
  });
  if (!projectId || !revision) {
    traceChunkMutationRejection("invalid_project_or_revision", {
      uid,
      projectId,
      source,
      authority,
      clientRevision: revision,
      operation,
    });
    throw new HttpsError("invalid-argument", "A valid projectId and revision are required.");
  }

  const snapshot = data.snapshot as Record<string, unknown> | undefined;
  const contentDoc = normalizeContentDoc(snapshot?.contentDoc);
  const wordCount = typeof snapshot?.wordCount === "number" && Number.isFinite(snapshot.wordCount) && snapshot.wordCount >= 0
    ? Math.floor(snapshot.wordCount)
    : 0;
  const authoritativeSectionIds = normalizeStringList(data.authoritativeSectionIds, 128, 120);
  const affectedChunkIds = normalizeStringList(data.affectedChunkIds, 256, 120);
  const titleMetadata = normalizeTitleMetadata(data.metadata);
  if (authority === "partial" && authoritativeSectionIds.length === 0) {
    traceChunkMutationRejection("partial_missing_authoritative_section_scope", {
      uid,
      projectId,
      source,
      authority,
      clientRevision: revision,
      operation,
    });
    throw new HttpsError("invalid-argument", "Partial chunk mutation requires an authoritative section scope.");
  }
  if (operation?.expectedRevision && operation.expectedRevision > revision) {
    traceChunkMutationRejection("operation_expected_revision_ahead_of_client_revision", {
      uid,
      projectId,
      source,
      authority,
      clientRevision: revision,
      operation,
    });
    throw new HttpsError("failed-precondition", "Chunk mutation operation is stale for the requested revision.");
  }
  traceChunkMutation("AUTHORITY_PROVENANCE_CHECK", {
    uid,
    projectId,
    source,
    authority,
    clientRevision: revision,
    operation,
  }, {
    authoritativeSectionCount: authoritativeSectionIds.length,
    affectedChunkCount: affectedChunkIds.length,
    migrationWithoutOperation: source === "migration" && !operation,
  });

  const db = admin.firestore();
  const projectRef = db.collection("users").doc(uid).collection("projects").doc(projectId);
  const ledgerRef = operation ? projectRef.collection("chunkMutationLedger").doc(operation.operationId) : null;
  const checkpointRef = projectRef.collection("chunkMutationCheckpoints").doc("latest");
  const now = new Date().toISOString();

  try {
    const result = await db.runTransaction(async (tx) => {
      if (operation && ledgerRef) {
        const ledgerSnap = await tx.get(ledgerRef);
        if (ledgerSnap.exists) {
          const ledger = ledgerSnap.data() as Record<string, unknown>;
          if (ledger.convergenceHash !== operation.convergenceHash) {
            traceChunkMutationRejection("duplicate_operation_convergence_mismatch", {
              uid,
              projectId,
              source,
              authority,
              clientRevision: revision,
              operation,
            }, {
              ledgerConvergenceHash: ledger.convergenceHash,
            });
            throw new HttpsError("already-exists", "Chunk mutation id was already acknowledged with different convergence metadata.");
          }
          traceChunkMutation("OPERATION_DUPLICATE_ACCEPTED", {
            uid,
            projectId,
            source,
            authority,
            clientRevision: revision,
            operation,
          }, {
            acknowledgedRevision: ledger.acknowledgedRevision,
            checkpointId: ledger.checkpointId,
          });
          return {
            metadata: ledger.metadata as Record<string, unknown>,
            projectPatch: (ledger.projectPatch && typeof ledger.projectPatch === "object")
              ? ledger.projectPatch as Record<string, unknown>
              : {
                revision: typeof ledger.acknowledgedRevision === "number" ? ledger.acknowledgedRevision : revision,
                updatedAt: typeof ledger.acknowledgedAt === "string" ? ledger.acknowledgedAt : now,
                wordCount,
                manuscriptStorage: ledger.metadata as Record<string, unknown>,
              },
            revision: typeof ledger.acknowledgedRevision === "number" ? ledger.acknowledgedRevision : revision,
            updatedAt: typeof ledger.acknowledgedAt === "string" ? ledger.acknowledgedAt : now,
            mutationAck: {
              schemaVersion: 1,
              operationId: operation.operationId,
              status: "duplicate",
              acknowledgedRevision: ledger.acknowledgedRevision,
              checkpointId: ledger.checkpointId,
              acknowledgedAt: ledger.acknowledgedAt,
              duplicate: true,
              chunkWriteCount: 0,
              sectionWriteCount: 0,
            },
          };
        }
      }

      const projectSnap = await tx.get(projectRef);
      if (!projectSnap.exists) {
        traceChunkMutationRejection("project_not_found", {
          uid,
          projectId,
          source,
          authority,
          clientRevision: revision,
          operation,
        });
        throw new HttpsError("not-found", "Project was not found.");
      }
      const currentRevision = projectSnap.get("revision");
      if (typeof currentRevision === "number" && currentRevision !== revision) {
        traceChunkMutationRejection("revision_mismatch", {
          uid,
          projectId,
          source,
          authority,
          clientRevision: revision,
          serverRevision: currentRevision,
          operation,
        }, {
          conflictResult: "rejected",
        });
        throw new HttpsError("failed-precondition", `Revision mismatch. Expected ${revision}, found ${currentRevision}.`);
      }
      traceChunkMutation("REVISION_CONFLICT_CHECK", {
        uid,
        projectId,
        source,
        authority,
        clientRevision: revision,
        serverRevision: currentRevision,
        operation,
      }, {
        conflictResult: "accepted",
      });

      const nextRevision = revision + 1;
      const draft = createDraft({ projectId, contentDoc, wordCount, revision: nextRevision, source, now });
      const scopedSectionIds = Array.from(new Set([
        ...authoritativeSectionIds,
        ...(authority === "partial" ? draft.sections.map((section) => section.sectionId) : []),
      ].filter(Boolean)));
      const sectionRefs = authority === "partial"
        ? scopedSectionIds.map((sectionId) => projectRef.collection("sections").doc(sectionId))
        : (await tx.get(projectRef.collection("sections"))).docs.map((entry) => entry.ref);
      const sectionSnaps = await Promise.all(sectionRefs.map((ref) => tx.get(ref)));
      const existingSections = sectionSnaps
        .filter((entry) => entry.exists)
        .map((entry) => mapSection(entry.data() ?? {}))
        .filter((entry): entry is SectionRecord => entry !== null)
        .sort((a, b) => a.order - b.order || a.sectionId.localeCompare(b.sectionId));

      const chunkSectionIds = authority === "partial" ? scopedSectionIds : existingSections.map((section) => section.sectionId);
      const chunkSnapsNested = await Promise.all(chunkSectionIds.map(async (sectionId) => (
        await tx.get(projectRef.collection("sections").doc(sectionId).collection("chunks"))
      ).docs));
      const existingChunks = chunkSnapsNested
        .flat()
        .map((entry) => mapChunk(entry.data()))
        .filter((entry): entry is ChunkRecord => entry !== null);
      const reconciliation = reconcile({
        draft,
        existingSections,
        existingChunks,
        revision: nextRevision,
        authority,
        authoritativeSectionIds: scopedSectionIds,
        now,
      });
      const writesSnapshot = authority === "complete";
      const writeCount = reconciliation.sectionUpserts.length +
        reconciliation.chunkUpserts.length +
        reconciliation.chunkDeletes.length +
        reconciliation.sectionDeletes.length +
        (writesSnapshot ? 1 : 0) +
        (operation ? 2 : 0);
      if (writeCount > MAX_TRANSACTION_WRITES) {
        traceChunkMutationRejection("bounded_write_limit_exceeded", {
          uid,
          projectId,
          source,
          authority,
          clientRevision: revision,
          serverRevision: currentRevision,
          operation,
        }, {
          writeCount,
          maxTransactionWrites: MAX_TRANSACTION_WRITES,
        });
        throw new HttpsError("resource-exhausted", "Chunk mutation exceeds bounded server write limits.");
      }
      const metadata = metadataFor({
        reconciliation,
        draft,
        revision: nextRevision,
        source,
        authority,
        existingSections,
        existingChunks,
        totalSectionCount: typeof snapshot?.totalSectionCount === "number" ? snapshot.totalSectionCount : undefined,
        totalChunkCount: typeof snapshot?.totalChunkCount === "number" ? snapshot.totalChunkCount : undefined,
      });
      const projectPatch = {
        ...titleMetadata,
        manuscriptStorage: metadata,
        ...(metadata.activeSectionId ? { activeSectionId: metadata.activeSectionId } : {}),
        wordCount,
        revision: nextRevision,
        updatedAt: now,
      };
      const checkpointSnap = operation ? await tx.get(checkpointRef) : null;
      const previousIds = normalizeStringList(
        checkpointSnap?.exists ? checkpointSnap.get("operationIds") : [],
        CHECKPOINT_WINDOW_SIZE,
        128
      );
      const checkpointId = operation
        ? `chunk_checkpoint_${createHash({ uid, projectId, revision: nextRevision, operationId: operation.operationId })}`
        : undefined;
      const operationIds = operation
        ? [...previousIds, operation.operationId]
          .filter((value, index, values) => values.indexOf(value) === index)
          .slice(-CHECKPOINT_WINDOW_SIZE)
        : [];

      reconciliation.sectionUpserts.forEach((section) => {
        tx.set(projectRef.collection("sections").doc(section.sectionId), section, { merge: true });
      });
      reconciliation.chunkUpserts.forEach((chunk) => {
        tx.set(projectRef.collection("sections").doc(chunk.sectionId).collection("chunks").doc(chunk.chunkId), chunk, { merge: true });
      });
      reconciliation.chunkDeletes.forEach((chunk) => {
        tx.delete(projectRef.collection("sections").doc(chunk.sectionId).collection("chunks").doc(chunk.chunkId));
      });
      reconciliation.sectionDeletes.forEach((section) => {
        tx.delete(projectRef.collection("sections").doc(section.sectionId));
      });
      if (writesSnapshot) {
        tx.set(projectRef.collection("snapshots").doc(draft.snapshot.snapshotId), {
          ...draft.snapshot,
          sectionCount: reconciliation.sections.length,
          chunkCount: reconciliation.chunks.length,
        });
      }

      let mutationAck;
      if (operation && ledgerRef) {
        tx.set(ledgerRef, {
          schemaVersion: 1,
          projectId,
          ownerUid: uid,
          operationId: operation.operationId,
          status: "acknowledged",
          type: operation.type,
          actorId: operation.causality.actorId,
          deviceId: operation.causality.deviceId,
          sequence: operation.sequence,
          expectedRevision: operation.expectedRevision ?? null,
          acknowledgedRevision: nextRevision,
          checkpointId: checkpointId as string,
          convergenceHash: operation.convergenceHash,
          causality: operation.causality,
          affectedChunkIds,
          mountedSectionIds: authoritativeSectionIds,
          metadata,
          projectPatch,
          dirtyChunkCount: reconciliation.dirtyChunkCount,
          chunkWriteCount: reconciliation.chunkUpserts.length + reconciliation.chunkDeletes.length,
          sectionWriteCount: reconciliation.sectionUpserts.length + reconciliation.sectionDeletes.length,
          savePayloadBytes: reconciliation.savePayloadBytes,
          createdAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now(),
          acknowledgedAt: now,
        });
        tx.set(checkpointRef, {
          schemaVersion: 1,
          projectId,
          ownerUid: uid,
          checkpointId: checkpointId as string,
          latestOperationId: operation.operationId,
          latestRevision: nextRevision,
          operationIds,
          operationCount: operationIds.length,
          chunkIds: Array.from(new Set([...affectedChunkIds, ...operation.causality.chunkIds])).slice(0, 256),
          updatedAt: admin.firestore.Timestamp.now(),
        }, { merge: true });
        mutationAck = {
          schemaVersion: 1,
          operationId: operation.operationId,
          status: "acknowledged",
          acknowledgedRevision: nextRevision,
          checkpointId: checkpointId as string,
          acknowledgedAt: now,
          duplicate: false,
          chunkWriteCount: reconciliation.chunkUpserts.length + reconciliation.chunkDeletes.length,
          sectionWriteCount: reconciliation.sectionUpserts.length + reconciliation.sectionDeletes.length,
        };
        traceChunkMutation("OPERATION_ACCEPTED", {
          uid,
          projectId,
          source,
          authority,
          clientRevision: revision,
          serverRevision: currentRevision,
          operation,
        }, {
          checkpointId,
          chunkWriteCount: reconciliation.chunkUpserts.length + reconciliation.chunkDeletes.length,
          sectionWriteCount: reconciliation.sectionUpserts.length + reconciliation.sectionDeletes.length,
          dirtyChunkCount: reconciliation.dirtyChunkCount,
        });
      }

      traceChunkMutation("MUTATION_APPLICATION_RESULT", {
        uid,
        projectId,
        source,
        authority,
        clientRevision: revision,
        serverRevision: currentRevision,
        operation,
      }, {
        sectionUpsertCount: reconciliation.sectionUpserts.length,
        chunkUpsertCount: reconciliation.chunkUpserts.length,
        sectionDeleteCount: reconciliation.sectionDeletes.length,
        chunkDeleteCount: reconciliation.chunkDeletes.length,
        writeCount,
        writesSnapshot,
        metadataMode: metadata.mode,
        metadataSectionCount: metadata.sectionCount,
        metadataChunkCount: metadata.chunkCount,
        migratedAtSet: "migratedAt" in metadata,
      });
      tx.update(projectRef, {
        ...titleMetadata,
        manuscriptStorage: metadata,
        activeSectionId: metadata.activeSectionId ?? admin.firestore.FieldValue.delete(),
        wordCount,
        revision: nextRevision,
        updatedAt: admin.firestore.Timestamp.fromDate(new Date(now)),
      });
      return { metadata, projectPatch, revision: nextRevision, updatedAt: now, mutationAck };
    });

    return result;
  } catch (error) {
    logger.error("[WRITE][CHUNK_MUTATION_FAILED]", {
      uid,
      projectId,
      source,
      authority,
      clientRevision: revision,
      operationId: operation?.operationId,
      operationExpectedRevision: operation?.expectedRevision,
      convergenceHash: operation?.convergenceHash,
      errorCode: error instanceof HttpsError ? error.code : undefined,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to apply chunk mutation.");
  }
});
