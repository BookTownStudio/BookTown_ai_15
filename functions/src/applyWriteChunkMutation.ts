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
  splitSections(anchored.content).forEach((sectionDraft, sectionOrder) => {
    const sectionId = dominantId(sectionDraft.nodes, STRUCTURAL_SECTION_ATTR, `section_${String(sectionOrder + 1).padStart(4, "0")}`);
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
    });
  });
  const contentHash = createHash({ version: 1, type: "doc", content: chunks.flatMap((chunk) => chunk.contentDoc.content) });
  const snapshotId = `snapshot_${String(params.revision).padStart(8, "0")}_${params.now.replace(/[^0-9]/g, "").slice(0, 17)}_${contentHash}`;
  return {
    activeSectionId: sections[0]?.sectionId ?? "section_0001",
    sections,
    chunks,
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

function reconcile(params: {
  draft: ReturnType<typeof createDraft>;
  existingSections: SectionRecord[];
  existingChunks: ChunkRecord[];
  revision: number;
  authority: SaveAuthority;
  authoritativeSectionIds: string[];
  now: string;
}) {
  const existingSectionsById = new Map(params.existingSections.map((section) => [section.sectionId, section]));
  const sections = params.draft.sections.map((section) => {
    const existing = existingSectionsById.get(section.sectionId);
    const changed = !existing || !sameSection(existing, section);
    return {
      ...section,
      revision: changed ? params.revision : existing.revision,
      createdAt: existing?.createdAt ?? section.createdAt,
      updatedAt: changed ? params.now : existing?.updatedAt ?? params.now,
    };
  });
  const existingChunksByKey = new Map(params.existingChunks.map((chunk) => [chunkKey(chunk), chunk]));
  const chunks = params.draft.chunks.map((chunk) => {
    const existing = existingChunksByKey.get(chunkKey(chunk));
    const changed = !existing || !sameChunk(existing, chunk);
    return {
      ...chunk,
      revision: changed ? params.revision : existing.revision,
      createdAt: existing?.createdAt ?? chunk.createdAt,
      updatedAt: changed ? params.now : existing?.updatedAt ?? params.now,
    };
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
    const existing = existingSectionsById.get(section.sectionId);
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

export const applyWriteChunkMutation = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const data = request.data as Record<string, unknown>;
  const projectId = normalizeId(data.projectId, 120);
  const revision = typeof data.revision === "number" && Number.isInteger(data.revision) && data.revision > 0 ? data.revision : undefined;
  const source = data.source === "migration" || data.source === "publish" || data.source === "manual" ? data.source : "autosave";
  const authority = data.authority === "complete" ? "complete" : "partial";
  const operation = data.operation === undefined ? undefined : normalizeOperation(data.operation, uid);
  if (!projectId || !revision) throw new HttpsError("invalid-argument", "A valid projectId and revision are required.");

  const snapshot = data.snapshot as Record<string, unknown> | undefined;
  const contentDoc = normalizeContentDoc(snapshot?.contentDoc);
  const wordCount = typeof snapshot?.wordCount === "number" && Number.isFinite(snapshot.wordCount) && snapshot.wordCount >= 0
    ? Math.floor(snapshot.wordCount)
    : 0;
  const authoritativeSectionIds = normalizeStringList(data.authoritativeSectionIds, 128, 120);
  const affectedChunkIds = normalizeStringList(data.affectedChunkIds, 256, 120);
  if (authority === "partial" && authoritativeSectionIds.length === 0) {
    throw new HttpsError("invalid-argument", "Partial chunk mutation requires an authoritative section scope.");
  }
  if (operation?.expectedRevision && operation.expectedRevision > revision) {
    throw new HttpsError("failed-precondition", "Chunk mutation operation is stale for the requested revision.");
  }

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
            throw new HttpsError("already-exists", "Chunk mutation id was already acknowledged with different convergence metadata.");
          }
          return {
            metadata: ledger.metadata as Record<string, unknown>,
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
      if (!projectSnap.exists) throw new HttpsError("not-found", "Project was not found.");
      const currentRevision = projectSnap.get("revision");
      if (typeof currentRevision === "number" && currentRevision !== revision) {
        throw new HttpsError("failed-precondition", `Revision mismatch. Expected ${revision}, found ${currentRevision}.`);
      }

      const draft = createDraft({ projectId, contentDoc, wordCount, revision, source, now });
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
        revision,
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
        throw new HttpsError("resource-exhausted", "Chunk mutation exceeds bounded server write limits.");
      }
      const metadata = metadataFor({
        reconciliation,
        draft,
        revision,
        source,
        authority,
        existingSections,
        existingChunks,
        totalSectionCount: typeof snapshot?.totalSectionCount === "number" ? snapshot.totalSectionCount : undefined,
        totalChunkCount: typeof snapshot?.totalChunkCount === "number" ? snapshot.totalChunkCount : undefined,
      });
      const checkpointSnap = operation ? await tx.get(checkpointRef) : null;
      const previousIds = normalizeStringList(
        checkpointSnap?.exists ? checkpointSnap.get("operationIds") : [],
        CHECKPOINT_WINDOW_SIZE,
        128
      );
      const checkpointId = operation
        ? `chunk_checkpoint_${createHash({ uid, projectId, revision, operationId: operation.operationId })}`
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
          acknowledgedRevision: revision,
          checkpointId: checkpointId as string,
          convergenceHash: operation.convergenceHash,
          causality: operation.causality,
          affectedChunkIds,
          mountedSectionIds: authoritativeSectionIds,
          metadata,
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
          latestRevision: revision,
          operationIds,
          operationCount: operationIds.length,
          chunkIds: Array.from(new Set([...affectedChunkIds, ...operation.causality.chunkIds])).slice(0, 256),
          updatedAt: admin.firestore.Timestamp.now(),
        }, { merge: true });
        mutationAck = {
          schemaVersion: 1,
          operationId: operation.operationId,
          status: "acknowledged",
          acknowledgedRevision: revision,
          checkpointId: checkpointId as string,
          acknowledgedAt: now,
          duplicate: false,
          chunkWriteCount: reconciliation.chunkUpserts.length + reconciliation.chunkDeletes.length,
          sectionWriteCount: reconciliation.sectionUpserts.length + reconciliation.sectionDeletes.length,
        };
      }

      return { metadata, mutationAck };
    });

    return result;
  } catch (error) {
    logger.error("[WRITE][CHUNK_MUTATION_FAILED]", { uid, projectId, error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to apply chunk mutation.");
  }
});
