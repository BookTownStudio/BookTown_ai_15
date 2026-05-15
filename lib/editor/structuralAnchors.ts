import { type WriteContentDoc, type WriteContentNode } from '../../types/entities.ts';

export const STRUCTURAL_ANCHOR_ATTR = 'btAnchorId';
export const STRUCTURAL_SECTION_ATTR = 'btSectionId';
export const STRUCTURAL_CHUNK_ATTR = 'btChunkId';

const STRUCTURAL_ATTRS = new Set([
  STRUCTURAL_ANCHOR_ATTR,
  STRUCTURAL_SECTION_ATTR,
  STRUCTURAL_CHUNK_ATTR,
]);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function createStableHash(value: unknown): string {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isAnchorableNode(node: WriteContentNode): boolean {
  return node.type !== 'text';
}

function removeStructuralAttrs(attrs?: WriteContentNode['attrs']): Record<string, unknown> {
  if (!attrs) return {};
  return Object.fromEntries(
    Object.entries(attrs).filter(([key]) => !STRUCTURAL_ATTRS.has(key))
  );
}

function getExistingAnchorId(node: WriteContentNode): string | null {
  const value = node.attrs?.[STRUCTURAL_ANCHOR_ATTR];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createAnchorId(params: {
  node: WriteContentNode;
  scopeId: string;
  path: number[];
  usedIds: Set<string>;
}): string {
  const structuralShape = {
    scopeId: params.scopeId,
    path: params.path,
    type: params.node.type,
    attrs: removeStructuralAttrs(params.node.attrs),
    text: params.node.text ?? '',
  };
  const base = `anc_${createStableHash(structuralShape)}`;
  if (!params.usedIds.has(base)) {
    params.usedIds.add(base);
    return base;
  }

  let suffix = 2;
  let candidate = `${base}_${suffix}`;
  while (params.usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${base}_${suffix}`;
  }
  params.usedIds.add(candidate);
  return candidate;
}

function ensureNodeAnchors(params: {
  node: WriteContentNode;
  scopeId: string;
  path: number[];
  usedIds: Set<string>;
}): WriteContentNode {
  if (!isAnchorableNode(params.node)) {
    return params.node;
  }

  const existingAnchorId = getExistingAnchorId(params.node);
  const anchorId = existingAnchorId && !params.usedIds.has(existingAnchorId)
    ? existingAnchorId
    : createAnchorId(params);
  params.usedIds.add(anchorId);

  const content = Array.isArray(params.node.content)
    ? params.node.content.map((child, index) => ensureNodeAnchors({
      node: child,
      scopeId: params.scopeId,
      path: [...params.path, index],
      usedIds: params.usedIds,
    }))
    : params.node.content;

  return {
    ...params.node,
    attrs: {
      ...(params.node.attrs ?? {}),
      [STRUCTURAL_ANCHOR_ATTR]: anchorId,
    },
    ...(content ? { content } : {}),
  };
}

export function ensureStructuralAnchorsInDoc(
  contentDoc: WriteContentDoc,
  scopeId: string
): WriteContentDoc {
  const usedIds = new Set<string>();
  return {
    ...contentDoc,
    content: contentDoc.content.map((node, index) => ensureNodeAnchors({
      node,
      scopeId,
      path: [index],
      usedIds,
    })),
  };
}

function applyChunkIdentityToNode(
  node: WriteContentNode,
  sectionId: string,
  chunkId: string
): WriteContentNode {
  if (!isAnchorableNode(node)) {
    return node;
  }

  return {
    ...node,
    attrs: {
      ...(node.attrs ?? {}),
      [STRUCTURAL_SECTION_ATTR]: sectionId,
      [STRUCTURAL_CHUNK_ATTR]: chunkId,
    },
    ...(Array.isArray(node.content)
      ? {
        content: node.content.map((child) => applyChunkIdentityToNode(child, sectionId, chunkId)),
      }
      : {}),
  };
}

export function assignChunkIdentityToNodes(
  nodes: WriteContentNode[],
  sectionId: string,
  chunkId: string
): WriteContentNode[] {
  return nodes.map((node) => applyChunkIdentityToNode(node, sectionId, chunkId));
}

export function getNodeChunkId(node: WriteContentNode): string | null {
  const value = node.attrs?.[STRUCTURAL_CHUNK_ATTR];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getNodeSectionId(node: WriteContentNode): string | null {
  const value = node.attrs?.[STRUCTURAL_SECTION_ATTR];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getNodeAnchorId(node: WriteContentNode): string | null {
  return getExistingAnchorId(node);
}

export function resolveDominantSectionId(
  nodes: WriteContentNode[],
  fallbackSectionId: string
): string {
  const counts = new Map<string, number>();
  nodes.forEach((node) => {
    const sectionId = getNodeSectionId(node);
    if (!sectionId) return;
    counts.set(sectionId, (counts.get(sectionId) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
    ?? fallbackSectionId;
}

export function resolveDominantChunkId(
  nodes: WriteContentNode[],
  fallbackChunkId: string
): string {
  const counts = new Map<string, number>();
  nodes.forEach((node) => {
    const chunkId = getNodeChunkId(node);
    if (!chunkId) return;
    counts.set(chunkId, (counts.get(chunkId) ?? 0) + 1);
  });

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
    ?? fallbackChunkId;
}
