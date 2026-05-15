import { type Editor } from '@tiptap/react';
import { type EditorSnapshot } from './editorRuntimeTypes.ts';
import {
  createOperationConvergenceHash,
  planDistributedOperationReplay,
} from './writeConvergenceSemantics.ts';
import {
  type CollaborativeCursorOverlay,
  type RemoteOperationIngestionResult,
  type WriteCollaboratorPresenceRecord,
  type WriteCollaborationOperationRecord,
} from './writeCollaborationTypes.ts';
import {
  type WriteChunkSnapshotOperation,
  type WriteConvergenceCheckpoint,
} from './writeOperationalTypes.ts';

const MAX_REMOTE_OPERATION_BYTES = 300_000;
const CURSOR_COLORS = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#c2410c',
];

function stableColor(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash, 31) + value.charCodeAt(index);
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

function byteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value ?? null);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(serialized).length;
    }
    return serialized.length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function validateRemoteCollaborationOperation(params: {
  record: WriteCollaborationOperationRecord;
  projectId: string;
  localDeviceId: string;
}): WriteChunkSnapshotOperation | null {
  const { record } = params;
  if (
    record.schemaVersion !== 1 ||
    record.projectId !== params.projectId ||
    record.deviceId === params.localDeviceId ||
    record.operation?.type !== 'chunk_snapshot_save' ||
    record.operation.projectId !== params.projectId ||
    record.operation.operationId !== record.operationId ||
    !record.operation.causality ||
    record.operation.causality.deviceId !== record.deviceId ||
    record.operation.causality.actorId !== record.actorId
  ) {
    return null;
  }

  const actualPayloadBytes = byteLength(record.operation);
  if (
    !isFinitePositiveNumber(record.payloadBytes) ||
    record.payloadBytes > MAX_REMOTE_OPERATION_BYTES ||
    actualPayloadBytes > MAX_REMOTE_OPERATION_BYTES
  ) {
    return null;
  }

  const expectedHash = createOperationConvergenceHash(record.operation);
  if (record.convergenceHash && record.convergenceHash !== expectedHash) {
    return null;
  }

  return {
    ...record.operation,
    convergenceHash: record.operation.convergenceHash ?? expectedHash,
  };
}

export function ingestRemoteCollaborationOperations(params: {
  uid: string;
  projectId: string;
  localDeviceId: string;
  records: WriteCollaborationOperationRecord[];
  previousCheckpoint?: WriteConvergenceCheckpoint | null;
}): RemoteOperationIngestionResult {
  const rejectedOperationIds: string[] = [];
  const operations = params.records
    .map((record) => {
      const operation = validateRemoteCollaborationOperation({
        record,
        projectId: params.projectId,
        localDeviceId: params.localDeviceId,
      });
      if (!operation) {
        rejectedOperationIds.push(record.operationId);
      }
      return operation;
    })
    .filter((operation): operation is WriteChunkSnapshotOperation => operation !== null);

  const replayPlan = planDistributedOperationReplay({
    uid: params.uid,
    projectId: params.projectId,
    operations,
    appliedOperationIds: params.previousCheckpoint?.operationIds,
  });
  const latestOperation = replayPlan.replayableOperations[replayPlan.replayableOperations.length - 1];

  return {
    acceptedOperations: replayPlan.replayableOperations,
    rejectedOperationIds,
    duplicateOperationIds: replayPlan.duplicateOperationIds,
    appliedSnapshot: latestOperation?.snapshot,
    latestRevision: latestOperation?.serverRevision ?? latestOperation?.expectedRevision,
  };
}

export function captureCollaborativePresence(params: {
  editor: Editor;
  uid: string;
  projectId: string;
  deviceId: string;
  displayName?: string;
  mountedSectionIds?: string[];
  now?: number;
}): WriteCollaboratorPresenceRecord {
  const selection = params.editor.state.selection;
  const parentAttrs = selection.$from.parent.attrs as Record<string, unknown>;
  const now = params.now ?? Date.now();

  return {
    schemaVersion: 1,
    projectId: params.projectId,
    ownerUid: params.uid,
    actorId: params.uid,
    deviceId: params.deviceId,
    displayName: params.displayName?.slice(0, 80),
    updatedAt: now,
    expiresAt: now + 30_000,
    status: params.editor.isFocused ? 'active' : 'idle',
    selectionFrom: selection.from,
    selectionTo: selection.to,
    anchorId: typeof parentAttrs.btAnchorId === 'string' ? parentAttrs.btAnchorId : undefined,
    chunkId: typeof parentAttrs.btChunkId === 'string' ? parentAttrs.btChunkId : undefined,
    sectionId: typeof parentAttrs.btSectionId === 'string' ? parentAttrs.btSectionId : undefined,
    mountedSectionIds: params.mountedSectionIds,
  };
}

function resolveAnchorPosition(
  editor: Editor,
  presence: WriteCollaboratorPresenceRecord
): number | null {
  if (!presence.anchorId && typeof presence.selectionFrom !== 'number') {
    return null;
  }

  let fallbackPosition: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    const attrs = node.attrs as Record<string, unknown>;
    if (presence.anchorId && attrs.btAnchorId === presence.anchorId) {
      fallbackPosition = Math.min(pos + 1 + Math.max(0, presence.cursorOffset ?? 0), pos + node.nodeSize - 1);
      return false;
    }
    return true;
  });

  if (fallbackPosition !== null) {
    return fallbackPosition;
  }

  if (typeof presence.selectionFrom === 'number') {
    return Math.max(1, Math.min(presence.selectionFrom, editor.state.doc.content.size));
  }

  return null;
}

export function createCollaborativeCursorOverlays(params: {
  editor: Editor | null;
  scrollElement: HTMLElement | null;
  collaborators: WriteCollaboratorPresenceRecord[];
  localDeviceId: string;
  now?: number;
}): CollaborativeCursorOverlay[] {
  if (!params.editor || !params.scrollElement) {
    return [];
  }

  const now = params.now ?? Date.now();
  const containerRect = params.scrollElement.getBoundingClientRect();
  return params.collaborators
    .filter((presence) => (
      presence.deviceId !== params.localDeviceId &&
      presence.expiresAt > now
    ))
    .map((presence) => {
      const position = resolveAnchorPosition(params.editor as Editor, presence);
      if (position === null) {
        return null;
      }

      try {
        const coords = (params.editor as Editor).view.coordsAtPos(position);
        return {
          key: `${presence.actorId}:${presence.deviceId}`,
          actorId: presence.actorId,
          displayName: presence.displayName || 'Collaborator',
          color: stableColor(`${presence.actorId}:${presence.deviceId}`),
          top: coords.top - containerRect.top + params.scrollElement.scrollTop,
          left: coords.left - containerRect.left + params.scrollElement.scrollLeft,
          height: Math.max(16, coords.bottom - coords.top),
        };
      } catch {
        return null;
      }
    })
    .filter((overlay): overlay is CollaborativeCursorOverlay => overlay !== null);
}

export function shouldApplyRemoteSnapshot(params: {
  snapshot: EditorSnapshot;
  hasLocalEdits: boolean;
  mountedSectionIds?: string[];
}): boolean {
  if (params.hasLocalEdits) {
    return false;
  }
  if (!params.snapshot.isPartialManuscript) {
    return true;
  }
  const remoteMounted = params.snapshot.mountedSectionIds ?? [];
  if (remoteMounted.length === 0 || !params.mountedSectionIds || params.mountedSectionIds.length === 0) {
    return true;
  }
  return remoteMounted.some((sectionId) => params.mountedSectionIds?.includes(sectionId));
}
