import type { WriteContentDoc, WriteContentNode } from '../../types/entities.ts';
import type { EditorSnapshot } from './editorRuntimeTypes.ts';
import type { WriteChunkSnapshotOperation } from './writeOperationalTypes.ts';

type JsonPlainObject = { [key: string]: unknown };

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export function normalizeJsonPlainValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonPlainValue(entry)) as T;
  }

  if (!isObjectLike(value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString() as T;
  }

  const output: JsonPlainObject = {};
  Object.keys(value).forEach((key) => {
    const normalizedEntry = normalizeJsonPlainValue((value as Record<string, unknown>)[key]);
    if (normalizedEntry !== undefined) {
      output[key] = normalizedEntry;
    }
  });
  return output as T;
}

function normalizeWriteContentAttrsForTransport(
  attrs: WriteContentNode['attrs'] | undefined
): WriteContentNode['attrs'] | undefined {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
    return undefined;
  }

  const normalizedAttrs = normalizeJsonPlainValue(attrs) as Record<string, unknown>;
  const output: JsonPlainObject = {};
  Object.keys(normalizedAttrs).forEach((key) => {
    const value = normalizedAttrs[key];
    if (value !== null && value !== undefined) {
      output[key] = value;
    }
  });

  return Object.keys(output).length > 0
    ? output as WriteContentNode['attrs']
    : undefined;
}

function normalizeWriteContentNodeForTransport(node: WriteContentNode): WriteContentNode {
  const normalizedNode = normalizeJsonPlainValue(node) as WriteContentNode;
  const output: JsonPlainObject = {};

  Object.keys(normalizedNode).forEach((key) => {
    if (key === 'attrs') {
      const attrs = normalizeWriteContentAttrsForTransport(normalizedNode.attrs);
      if (attrs) {
        output.attrs = attrs;
      }
      return;
    }

    if (key === 'content') {
      if (Array.isArray(normalizedNode.content)) {
        output.content = normalizedNode.content.map(normalizeWriteContentNodeForTransport);
      }
      return;
    }

    const value = (normalizedNode as unknown as Record<string, unknown>)[key];
    if (value !== undefined) {
      output[key] = value;
    }
  });

  return output as unknown as WriteContentNode;
}

export function normalizeWriteContentDocForTransport(
  contentDoc: WriteContentDoc | undefined
): WriteContentDoc | undefined {
  if (!contentDoc) {
    return undefined;
  }

  const normalizedDoc = normalizeJsonPlainValue(contentDoc) as WriteContentDoc;
  const output: JsonPlainObject = {};
  Object.keys(normalizedDoc).forEach((key) => {
    if (key === 'content') {
      output.content = Array.isArray(normalizedDoc.content)
        ? normalizedDoc.content.map(normalizeWriteContentNodeForTransport)
        : [];
      return;
    }

    const value = (normalizedDoc as unknown as Record<string, unknown>)[key];
    if (value !== undefined) {
      output[key] = value;
    }
  });

  return output as unknown as WriteContentDoc;
}

export function normalizeEditorSnapshotForTransport<T extends EditorSnapshot>(snapshot: T): T {
  return {
    ...snapshot,
    contentDoc: normalizeWriteContentDocForTransport(snapshot.contentDoc),
    affectedChunkIds: snapshot.affectedChunkIds ? [...snapshot.affectedChunkIds] : undefined,
    affectedAnchorIds: snapshot.affectedAnchorIds ? [...snapshot.affectedAnchorIds] : undefined,
    mountedSectionIds: snapshot.mountedSectionIds ? [...snapshot.mountedSectionIds] : undefined,
  };
}

export function normalizeWriteOperationForTransport<T extends WriteChunkSnapshotOperation>(
  operation: T
): T {
  return normalizeJsonPlainValue({
    ...operation,
    snapshot: normalizeEditorSnapshotForTransport(operation.snapshot),
  }) as T;
}
