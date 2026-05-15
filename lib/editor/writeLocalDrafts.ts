import { WriteContentDoc } from '../../types/entities.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

export type WriteDraftReason =
  | 'unsaved'
  | 'offline'
  | 'conflict'
  | 'error'
  | 'exit'
  | 'recovered';

export interface WriteDraftSnapshot {
  titleEn: string;
  titleAr: string;
  content: string;
  contentDoc?: WriteContentDoc;
  wordCount: number;
  affectedChunkIds?: string[];
  affectedAnchorIds?: string[];
  isPartialManuscript?: boolean;
  mountedSectionIds?: string[];
  activeSectionId?: string;
  totalSectionCount?: number;
  totalChunkCount?: number;
}

export interface WriteDraftRecord {
  schemaVersion: 1;
  uid: string;
  scopeId: string;
  projectId?: string;
  serverRevision: number | null;
  savedAt: number;
  reason: WriteDraftReason;
  snapshot: WriteDraftSnapshot;
}

function getStorageKey(uid: string, scopeId: string): string {
  return `booktown_write_draft:${uid}:${scopeId}`;
}

function isWriteDraftRecord(value: unknown): value is WriteDraftRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    typeof record.uid === 'string' &&
    typeof record.scopeId === 'string' &&
    typeof record.savedAt === 'number' &&
    typeof record.reason === 'string' &&
    typeof record.snapshot === 'object' &&
    record.snapshot !== null
  );
}

export const writeLocalDrafts = {
  load(uid: string, scopeId: string): WriteDraftRecord | null {
    try {
      const raw = window.localStorage.getItem(getStorageKey(uid, scopeId));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!isWriteDraftRecord(parsed)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  },

  save(record: WriteDraftRecord): void {
    const serialized = JSON.stringify(record);
    writeEditorTelemetry.recordSnapshotSizes({
      localDraft: record,
      contentDoc: record.snapshot.contentDoc,
      html: record.snapshot.content,
      label: 'editor.localDraft',
    });
    writeEditorTelemetry.log('recovery', 'local_draft_saved', {
      reason: record.reason,
      scopeId: record.scopeId,
      bytes: serialized.length,
    }, 'debug');

    try {
      window.localStorage.setItem(getStorageKey(record.uid, record.scopeId), serialized);
    } catch (error) {
      writeEditorTelemetry.log('recovery', 'local_draft_save_failed', {
        scopeId: record.scopeId,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn');
      throw error;
    }
  },

  clear(uid: string, scopeId: string): void {
    window.localStorage.removeItem(getStorageKey(uid, scopeId));
    writeEditorTelemetry.log('recovery', 'local_draft_cleared', { scopeId }, 'debug');
  },

  migrate(uid: string, fromScopeId: string, toScopeId: string): void {
    const record = this.load(uid, fromScopeId);
    if (!record) {
      return;
    }

    this.save({
      ...record,
      scopeId: toScopeId,
    });
    this.clear(uid, fromScopeId);
  },
};
