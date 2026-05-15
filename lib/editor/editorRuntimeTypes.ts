import { type Project, type WriteContentDoc } from '../../types/entities.ts';
import {
    type CursorMemoryPayload,
} from './cursorMemory.ts';
import {
    type WriteDraftReason,
    type WriteDraftRecord,
    type WriteDraftSnapshot,
} from './writeLocalDrafts.ts';

export type EditorSnapshot = WriteDraftSnapshot;

export type AuthorityStatus = 'ephemeral' | 'materializing' | 'persistent' | 'error';
export type SaveIssue = 'none' | 'offline' | 'conflict' | 'error';
export type SaveIndicator = 'local-only' | 'unsaved' | 'saving' | 'saved' | 'offline' | 'conflict' | 'error';

export type RecoveryBanner =
    | { mode: 'recovered'; draft: WriteDraftRecord }
    | { mode: 'available'; draft: WriteDraftRecord }
    | null;

export const EMPTY_SNAPSHOT: EditorSnapshot = {
    titleEn: '',
    titleAr: '',
    content: '<p></p>',
    contentDoc: undefined,
    wordCount: 0,
};

export const stripHtml = (html: string): string => html.replace(/<[^>]*>/g, ' ').trim();

export const serializeDoc = (doc?: WriteContentDoc): string => JSON.stringify(doc?.content ?? []);

export const getPerfNow = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

export function buildScopeId(projectId?: string, templateId?: string): string {
    if (projectId && projectId !== 'new') {
        return projectId;
    }
    return `new:${templateId || 'blank'}`;
}

export function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
    return (
        a.titleEn === b.titleEn &&
        a.titleAr === b.titleAr &&
        a.content === b.content &&
        a.wordCount === b.wordCount &&
        serializeDoc(a.contentDoc) === serializeDoc(b.contentDoc)
    );
}

export function snapshotFromProject(project: Project): EditorSnapshot {
    return {
        titleEn: project.titleEn || '',
        titleAr: project.titleAr || '',
        content: project.content || '<p></p>',
        contentDoc: project.contentDoc,
        wordCount: project.wordCount || 0,
    };
}

export function toDraftRecord(
    uid: string,
    scopeId: string,
    projectId: string | undefined,
    serverRevision: number | null,
    snapshot: EditorSnapshot,
    reason: WriteDraftReason
): WriteDraftRecord {
    return {
        schemaVersion: 1,
        uid,
        scopeId,
        projectId,
        serverRevision,
        savedAt: Date.now(),
        reason,
        snapshot,
    };
}

export function isRevisionMismatchError(error: unknown): boolean {
    return error instanceof Error && error.message.includes('Revision mismatch');
}

export function isOfflineWriteError(error: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return true;
    }

    if (!(error instanceof Error)) {
        return false;
    }

    const message = error.message.toLowerCase();
    return (
        message.includes('network') ||
        message.includes('offline') ||
        message.includes('unavailable') ||
        message.includes('failed to fetch')
    );
}

export function getProjectCursorMemory(project?: Project): CursorMemoryPayload | null {
    if (!project?.lastCursorBlockId) {
        return null;
    }

    return {
        lastCursorBlockId: project.lastCursorBlockId,
        lastCursorOffset:
            typeof project.lastCursorOffset === 'number' && Number.isInteger(project.lastCursorOffset)
                ? project.lastCursorOffset
                : 0,
        lastCursorSavedAt: project.lastCursorSavedAt || new Date(0).toISOString(),
    };
}
