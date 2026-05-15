import { type EditorSnapshot } from './editorRuntimeTypes.ts';

export type WriteOperationStatus = 'pending' | 'applying' | 'applied' | 'failed';

export type OperationVectorClock = Record<string, number>;

export type WriteOperationConflictState = 'none' | 'observed' | 'resolved';

export interface WriteOperationCausality {
  schemaVersion: 1;
  actorId: string;
  deviceId: string;
  sequence: number;
  parents: string[];
  vectorClock: OperationVectorClock;
  chunkIds: string[];
  baseRevision?: number;
  createdAt: number;
}

export interface WriteConvergenceCheckpoint {
  schemaVersion: 1;
  checkpointId: string;
  uid: string;
  projectId: string;
  operationIds: string[];
  chunkIds: string[];
  createdAt: number;
  causalityHash: string;
}

export interface WriteChunkSnapshotOperation {
  schemaVersion: 1;
  operationId: string;
  uid: string;
  projectId: string;
  type: 'chunk_snapshot_save';
  status: WriteOperationStatus;
  sequence: number;
  createdAt: number;
  updatedAt: number;
  expectedRevision?: number;
  snapshot: EditorSnapshot;
  affectedChunkIds?: string[];
  mountedSectionIds?: string[];
  causality?: WriteOperationCausality;
  convergenceHash?: string;
  conflictState?: WriteOperationConflictState;
  conflictOperationIds?: string[];
  convergenceCheckpointId?: string;
  attempts: number;
  lastError?: string;
  appliedAt?: number;
  serverRevision?: number;
}

export type WriteOperationalRecord = WriteChunkSnapshotOperation;

export interface WriteProjectOperationAckInput {
  schemaVersion: 1;
  operationId: string;
  type: 'chunk_snapshot_save';
  sequence: number;
  createdAt: number;
  updatedAt: number;
  expectedRevision?: number;
  affectedChunkIds?: string[];
  mountedSectionIds?: string[];
  causality?: WriteOperationCausality;
  convergenceHash?: string;
}

export interface WriteProjectOperationAckResult {
  schemaVersion: 1;
  operationId: string;
  status: 'acknowledged' | 'duplicate';
  acknowledgedRevision: number;
  checkpointId: string;
  acknowledgedAt: string;
  duplicate: boolean;
}

export function toWriteProjectOperationAckInput(
  operation: WriteChunkSnapshotOperation
): WriteProjectOperationAckInput {
  return {
    schemaVersion: 1,
    operationId: operation.operationId,
    type: operation.type,
    sequence: operation.sequence,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    expectedRevision: operation.expectedRevision,
    affectedChunkIds: operation.affectedChunkIds,
    mountedSectionIds: operation.mountedSectionIds,
    causality: operation.causality,
    convergenceHash: operation.convergenceHash,
  };
}

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

export function createWriteOperationHash(value: unknown): string {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createChunkSnapshotOperationId(params: {
  uid: string;
  projectId: string;
  expectedRevision?: number;
  snapshot: EditorSnapshot;
}): string {
  return `writeop_${createWriteOperationHash({
    uid: params.uid,
    projectId: params.projectId,
    expectedRevision: params.expectedRevision ?? null,
    content: params.snapshot.content,
    contentDoc: params.snapshot.contentDoc,
    titleEn: params.snapshot.titleEn,
    titleAr: params.snapshot.titleAr,
    affectedChunkIds: params.snapshot.affectedChunkIds ?? [],
    mountedSectionIds: params.snapshot.mountedSectionIds ?? [],
  })}`;
}
