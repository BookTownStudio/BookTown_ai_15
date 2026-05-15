import { type EditorSnapshot } from './editorRuntimeTypes.ts';
import {
  type WriteChunkSnapshotOperation,
  type WriteOperationCausality,
} from './writeOperationalTypes.ts';

export type CollaborationConnectionState =
  | 'disabled'
  | 'connecting'
  | 'connected'
  | 'degraded';

export interface WriteCollaborationOperationRecord {
  schemaVersion: 1;
  projectId: string;
  ownerUid: string;
  operationId: string;
  actorId: string;
  deviceId: string;
  createdAt: number;
  coordinatorSequence?: number;
  payloadBytes: number;
  operation: WriteChunkSnapshotOperation;
  causality: WriteOperationCausality;
  convergenceHash?: string;
  validation?: {
    schemaVersion: 1;
    validatedAt?: unknown;
    operationLedgerValidated?: boolean;
    chunkMutationLedgerValidated?: boolean;
    chunkIds?: string[];
  };
}

export interface WriteCollaborationReplayCursor {
  schemaVersion: 1;
  projectId: string;
  ownerUid: string;
  deviceId: string;
  lastCoordinatorSequence: number;
  lastOperationId?: string;
  operationIds: string[];
  checkpointId?: string;
  checkpointHash?: string;
  updatedAt: number;
  createdAt: number;
}

export interface WriteCollaborationReplayCursorResult {
  cursor: WriteCollaborationReplayCursor;
  records: WriteCollaborationOperationRecord[];
  latestCoordinatorSequence: number;
  hasMore: boolean;
  windowGap: boolean;
  advanced: boolean;
  duplicate: boolean;
}

export interface WriteCollaboratorPresenceRecord {
  schemaVersion: 1;
  projectId: string;
  ownerUid: string;
  actorId: string;
  deviceId: string;
  displayName?: string;
  updatedAt: number;
  expiresAt: number;
  status: 'active' | 'idle';
  selectionFrom?: number;
  selectionTo?: number;
  cursorBlockId?: string;
  cursorOffset?: number;
  anchorId?: string;
  chunkId?: string;
  sectionId?: string;
  mountedSectionIds?: string[];
  presenceSequence?: number;
  validation?: {
    schemaVersion: 1;
    validatedAt?: number;
    coordinatorValidated?: boolean;
    throttled?: boolean;
  };
}

export interface WriteCollaborationPresenceResult {
  record?: WriteCollaboratorPresenceRecord;
  removed: boolean;
  throttled: boolean;
  cleanupCount: number;
  presenceSequence?: number;
}

export interface RemoteOperationIngestionResult {
  acceptedOperations: WriteChunkSnapshotOperation[];
  rejectedOperationIds: string[];
  duplicateOperationIds: string[];
  appliedSnapshot?: EditorSnapshot;
  latestRevision?: number;
}

export interface CollaborativeCursorOverlay {
  key: string;
  actorId: string;
  displayName: string;
  color: string;
  top: number;
  left: number;
  height: number;
}
