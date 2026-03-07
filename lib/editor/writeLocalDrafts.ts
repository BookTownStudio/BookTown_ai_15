import { WriteContentDoc } from '../../types/entities.ts';

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
    window.localStorage.setItem(
      getStorageKey(record.uid, record.scopeId),
      JSON.stringify(record)
    );
  },

  clear(uid: string, scopeId: string): void {
    window.localStorage.removeItem(getStorageKey(uid, scopeId));
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
