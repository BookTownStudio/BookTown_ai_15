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
  payloadBytes: number;
  operation: WriteChunkSnapshotOperation;
  causality: WriteOperationCausality;
  convergenceHash?: string;
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
