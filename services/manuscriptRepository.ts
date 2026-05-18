import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDb, getFirebaseFunctions } from '../lib/firebase.ts';
import { type Project, type WriteContentDoc } from '../types/entities.ts';
import {
  assembleChunkedContentDoc,
  createChunkedManuscriptDraft,
  type ChunkedManuscriptDraft,
  type ManuscriptChunkRecord,
  type ManuscriptSectionRecord,
  type ManuscriptStorageMetadata,
} from '../lib/editor/chunkedManuscript.ts';
import {
  type EditorSnapshot,
  snapshotFromProject,
} from '../lib/editor/editorRuntimeTypes.ts';
import {
  type ManuscriptSaveAuthority,
} from '../lib/editor/chunkAuthority.ts';
import { writeEditorTelemetry } from '../lib/editor/writeEditorTelemetry.ts';
import type {
  WriteProjectOperationAckInput,
  WriteProjectOperationAckResult,
} from '../lib/editor/writeOperationalTypes.ts';
import {
  normalizeEditorSnapshotForTransport,
  normalizeJsonPlainValue,
} from '../lib/editor/writeTransportSerialization.ts';

type CallableEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

type ChunkMutationResult = {
  metadata: ManuscriptStorageMetadata;
  projectPatch: Partial<Project> & {
    revision: number;
    updatedAt: string;
    wordCount: number;
    manuscriptStorage: ManuscriptStorageMetadata;
  };
  revision: number;
  updatedAt: string;
  mutationAck?: WriteProjectOperationAckResult & {
    chunkWriteCount: number;
    sectionWriteCount: number;
  };
};

type ChunkMutationRequest = {
  projectId: string;
  revision: number;
  source: 'autosave' | 'migration' | 'publish' | 'manual';
  authority: ManuscriptSaveAuthority;
  authoritativeSectionIds?: string[];
  affectedChunkIds?: string[];
  operation?: WriteProjectOperationAckInput;
  metadata?: {
    title?: string;
    titleEn?: string;
    titleAr?: string;
  };
  snapshot: {
    wordCount: number;
    contentDoc: WriteContentDoc;
    totalSectionCount?: number;
    totalChunkCount?: number;
  };
};

type StructuralPayloadSnapshot = {
  topLevelKeys: string[];
  nestedKeys: string[];
  undefinedPaths: string[];
  nullPaths: string[];
  enumValues: Record<string, unknown>;
  payloadHash: string;
};

function getProjectRef(uid: string, projectId: string) {
  return doc(getFirebaseDb(), 'users', uid, 'projects', projectId);
}

function pathToString(path: readonly (string | number)[]): string {
  return path.length > 0 ? path.map(String).join('.') : '<root>';
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashStructuralPayload(value: unknown): string {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isSensitivePayloadPath(path: readonly (string | number)[]): boolean {
  const joined = path.map(String).join('.').toLowerCase();
  return (
    joined.includes('plaintext') ||
    joined.includes('prose') ||
    joined.includes('body') ||
    joined.endsWith('.content') ||
    joined.endsWith('.text') ||
    joined === 'text' ||
    (joined.includes('.content.') && joined.endsWith('.text'))
  );
}

function captureStructuralPayloadSnapshot(payload: unknown): StructuralPayloadSnapshot {
  const nestedKeys: string[] = [];
  const undefinedPaths: string[] = [];
  const nullPaths: string[] = [];
  const enumValues: Record<string, unknown> = {};
  const visited = new WeakSet<object>();

  function walk(value: unknown, path: (string | number)[]): unknown {
    const pathName = pathToString(path);
    if (value === undefined) {
      undefinedPaths.push(pathName);
      return { type: 'undefined' };
    }
    if (value === null) {
      nullPaths.push(pathName);
      return { type: 'null' };
    }
    if (typeof value === 'string') {
      if (['source', 'authority', 'type', 'status', 'mode'].includes(String(path[path.length - 1]))) {
        enumValues[pathName] = value;
      }
      return isSensitivePayloadPath(path)
        ? { type: 'string', length: value.length, redacted: true }
        : { type: 'string', length: value.length };
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return { type: typeof value, value };
    }
    if (Array.isArray(value)) {
      nestedKeys.push(`${pathName}[]`);
      if (isSensitivePayloadPath(path)) {
        return { type: 'array', length: value.length, redacted: true };
      }
      return {
        type: 'array',
        length: value.length,
        sample: value.slice(0, 8).map((entry, index) => walk(entry, [...path, index])),
      };
    }
    if (value && typeof value === 'object') {
      if (visited.has(value)) {
        return { type: 'circular' };
      }
      visited.add(value);
      const entries = Object.entries(value as Record<string, unknown>);
      nestedKeys.push(...entries.map(([key]) => pathToString([...path, key])));
      if (isSensitivePayloadPath(path)) {
        return { type: 'object', keys: entries.map(([key]) => key), redacted: true };
      }
      return Object.fromEntries(entries.map(([key, entry]) => [key, walk(entry, [...path, key])]));
    }
    return { type: typeof value };
  }

  const structuralProjection = walk(payload, []);
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return {
    topLevelKeys: Object.keys(root),
    nestedKeys: nestedKeys.slice(0, 512),
    undefinedPaths: undefinedPaths.slice(0, 256),
    nullPaths: nullPaths.slice(0, 256),
    enumValues,
    payloadHash: hashStructuralPayload(structuralProjection),
  };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function logAutosaveInvariantFailure(projectId: string, reason: string, detail: Record<string, unknown>): void {
  console.warn('[WRITE][AUTOSAVE_RUNTIME_INVARIANT_FAILURE]', {
    projectId,
    reason,
    ...detail,
  });
  writeEditorTelemetry.log('autosave', 'runtime_invariant_failure', {
    projectId,
    reason,
    ...detail,
  }, 'warn');
}

function buildChunkMutationRequest(params: {
  projectId: string;
  revision: number;
  source: 'autosave' | 'migration' | 'publish' | 'manual';
  authority: ManuscriptSaveAuthority;
  scopedSectionIds: string[];
  affectedChunkIds?: string[];
  operation?: WriteProjectOperationAckInput;
  snapshot: EditorSnapshot;
}): ChunkMutationRequest {
  if (!isPositiveInteger(params.revision)) {
    logAutosaveInvariantFailure(params.projectId, 'invalid_revision', { revision: params.revision });
    throw new Error('Chunk mutation requires a positive integer revision.');
  }

  if (!params.snapshot.contentDoc) {
    logAutosaveInvariantFailure(params.projectId, 'missing_content_doc', {});
    throw new Error('Chunk mutation requires a content document.');
  }

  if (!isNonNegativeInteger(params.snapshot.wordCount)) {
    logAutosaveInvariantFailure(params.projectId, 'invalid_word_count', { wordCount: params.snapshot.wordCount });
    throw new Error('Chunk mutation requires a non-negative integer word count.');
  }

  if (params.authority === 'partial') {
    if (!isStringArray(params.scopedSectionIds) || params.scopedSectionIds.length === 0) {
      logAutosaveInvariantFailure(params.projectId, 'missing_authoritative_sections', {
        scopedSectionIds: params.scopedSectionIds,
      });
      throw new Error('Partial chunk mutation requires hydrated authoritative sections.');
    }

    if (!isStringArray(params.affectedChunkIds)) {
      logAutosaveInvariantFailure(params.projectId, 'missing_affected_chunks', {
        affectedChunkIds: params.affectedChunkIds,
      });
      throw new Error('Partial chunk mutation requires hydrated affected chunk ids.');
    }

    if (!isNonNegativeInteger(params.snapshot.totalSectionCount) || !isNonNegativeInteger(params.snapshot.totalChunkCount)) {
      logAutosaveInvariantFailure(params.projectId, 'missing_partial_runtime_counts', {
        totalSectionCount: params.snapshot.totalSectionCount,
        totalChunkCount: params.snapshot.totalChunkCount,
      });
      throw new Error('Partial chunk mutation requires hydrated manuscript runtime counts.');
    }
  }

  if (params.source === 'autosave' && !params.operation) {
    logAutosaveInvariantFailure(params.projectId, 'missing_operation', {});
    throw new Error('Autosave chunk mutation requires a distributed operation.');
  }

  const request: ChunkMutationRequest = {
    projectId: params.projectId,
    revision: params.revision,
    source: params.source,
    authority: params.authority,
    ...(params.scopedSectionIds.length > 0 ? { authoritativeSectionIds: params.scopedSectionIds } : {}),
    ...(params.affectedChunkIds ? { affectedChunkIds: params.affectedChunkIds } : {}),
    ...(params.operation ? { operation: params.operation } : {}),
    metadata: {
      title: params.snapshot.titleEn,
      titleEn: params.snapshot.titleEn,
      titleAr: params.snapshot.titleAr,
    },
    snapshot: {
      wordCount: params.snapshot.wordCount,
      contentDoc: params.snapshot.contentDoc,
      ...(isNonNegativeInteger(params.snapshot.totalSectionCount)
        ? { totalSectionCount: params.snapshot.totalSectionCount }
        : {}),
      ...(isNonNegativeInteger(params.snapshot.totalChunkCount)
        ? { totalChunkCount: params.snapshot.totalChunkCount }
        : {}),
    },
  };

  return normalizeJsonPlainValue(request) as ChunkMutationRequest;
}

function normalizeRecord<T extends { createdAt?: string; updatedAt?: string }>(value: T): T {
  return {
    ...value,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}

function mapSection(value: Record<string, unknown>): ManuscriptSectionRecord | null {
  if (typeof value.sectionId !== 'string' || typeof value.projectId !== 'string') return null;
  return normalizeRecord({
    schemaVersion: 1,
    projectId: value.projectId,
    sectionId: value.sectionId,
    order: typeof value.order === 'number' ? value.order : 0,
    title: typeof value.title === 'string' ? value.title : 'Section',
    kind: value.kind === 'section' ? 'section' : 'chapter',
    chunkCount: typeof value.chunkCount === 'number' ? value.chunkCount : 0,
    nodeCount: typeof value.nodeCount === 'number' ? value.nodeCount : 0,
    wordCount: typeof value.wordCount === 'number' ? value.wordCount : 0,
    revision: typeof value.revision === 'number' ? value.revision : 1,
    contentHash: typeof value.contentHash === 'string' ? value.contentHash : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
  });
}

function mapChunk(value: Record<string, unknown>): ManuscriptChunkRecord | null {
  const contentDoc = value.contentDoc as Partial<WriteContentDoc> | undefined;
  if (
    typeof value.chunkId !== 'string' ||
    typeof value.sectionId !== 'string' ||
    typeof value.projectId !== 'string' ||
    contentDoc?.type !== 'doc' ||
    contentDoc.version !== 1 ||
    !Array.isArray(contentDoc.content)
  ) {
    return null;
  }

  return normalizeRecord({
    schemaVersion: 1,
    projectId: value.projectId,
    sectionId: value.sectionId,
    chunkId: value.chunkId,
    order: typeof value.order === 'number' ? value.order : 0,
    nodeCount: typeof value.nodeCount === 'number' ? value.nodeCount : contentDoc.content.length,
    byteSize: typeof value.byteSize === 'number' ? value.byteSize : JSON.stringify(contentDoc).length,
    plainTextSize: typeof value.plainTextSize === 'number' ? value.plainTextSize : 0,
    wordCount: typeof value.wordCount === 'number' ? value.wordCount : 0,
    contentHash: typeof value.contentHash === 'string' ? value.contentHash : '',
    anchorIds: Array.isArray(value.anchorIds)
      ? value.anchorIds.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    revision: typeof value.revision === 'number' ? value.revision : 1,
    contentDoc: {
      version: 1,
      type: 'doc',
      content: contentDoc.content,
    },
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : undefined,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : undefined,
  });
}

async function callChunkMutation(request: Record<string, unknown>): Promise<ChunkMutationResult> {
  const payloadSnapshot = captureStructuralPayloadSnapshot(request);
  console.info('[WRITE][CHUNK_MUTATION_PAYLOAD_SNAPSHOT]', {
    callableName: 'applyWriteChunkMutation',
    schemaName: 'writeChunkMutationRequestSchema',
    projectId: request.projectId,
    revisionId: request.revision,
    payloadStructure: payloadSnapshot,
  });
  const callable = httpsCallable<Record<string, unknown>, CallableEnvelope<ChunkMutationResult> | ChunkMutationResult>(
    getFirebaseFunctions(),
    'applyWriteChunkMutation'
  );
  const response = await callable(request);
  const value = response.data;
  if (value && typeof value === 'object' && 'success' in value) {
    if ((value as CallableEnvelope<ChunkMutationResult>).success) {
      return (value as { success: true; data: ChunkMutationResult }).data;
    }
    const error = (value as { success: false; error: { message: string; code?: string; details?: unknown } }).error;
    if (error.code === 'INVALID_REQUEST_SCHEMA') {
      console.error('[WRITE][CHUNK_MUTATION_CONTRACT_REJECTION]', {
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }
    throw new Error(error.message || 'Chunk mutation failed.');
  }
  return value as ChunkMutationResult;
}

export const ManuscriptRepository = {
  async loadSections(uid: string, projectId: string): Promise<ManuscriptSectionRecord[]> {
    const sectionsQuery = query(
      collection(getProjectRef(uid, projectId), 'sections'),
      orderBy('order', 'asc')
    );
    const snap = await getDocs(sectionsQuery);
    return snap.docs
      .map((entry) => mapSection(entry.data() as Record<string, unknown>))
      .filter((entry): entry is ManuscriptSectionRecord => entry !== null);
  },

  async loadSectionsByIds(
    uid: string,
    projectId: string,
    sectionIds: string[]
  ): Promise<ManuscriptSectionRecord[]> {
    const uniqueSectionIds = Array.from(new Set(sectionIds)).filter(Boolean);
    const sections = await Promise.all(
      uniqueSectionIds.map(async (sectionId) => {
        const snap = await getDoc(doc(getProjectRef(uid, projectId), 'sections', sectionId));
        return snap.exists()
          ? mapSection(snap.data() as Record<string, unknown>)
          : null;
      })
    );
    return sections
      .filter((entry): entry is ManuscriptSectionRecord => entry !== null)
      .sort((a, b) => a.order - b.order || a.sectionId.localeCompare(b.sectionId));
  },

  async loadChunks(uid: string, projectId: string): Promise<ManuscriptChunkRecord[]> {
    const sections = await this.loadSections(uid, projectId);
    return this.loadChunksForSections(uid, projectId, sections.map((section) => section.sectionId));
  },

  async loadChunksForSections(
    uid: string,
    projectId: string,
    sectionIds: string[]
  ): Promise<ManuscriptChunkRecord[]> {
    const uniqueSectionIds = Array.from(new Set(sectionIds)).filter(Boolean);
    const chunksBySection = await Promise.all(
      uniqueSectionIds.map(async (sectionId) => {
        const chunksQuery = query(
          collection(getProjectRef(uid, projectId), 'sections', sectionId, 'chunks'),
          orderBy('order', 'asc')
        );
        const snap = await getDocs(chunksQuery);
        return snap.docs
          .map((entry) => mapChunk(entry.data() as Record<string, unknown>))
          .filter((entry): entry is ManuscriptChunkRecord => entry !== null);
      })
    );
    return chunksBySection.flat();
  },

  async loadChunkWindow(params: {
    uid: string;
    projectId: string;
    activeSectionId?: string;
    sectionRadius?: number;
  }): Promise<{
    sections: ManuscriptSectionRecord[];
    chunks: ManuscriptChunkRecord[];
    activeSectionId: string;
    loadedSectionIds: string[];
    totalChunkCount: number;
  }> {
    const sections = await this.loadSections(params.uid, params.projectId);
    if (sections.length === 0) {
      return {
        sections,
        chunks: [],
        activeSectionId: '',
        loadedSectionIds: [],
        totalChunkCount: 0,
      };
    }

    const activeSectionId =
      params.activeSectionId && sections.some((section) => section.sectionId === params.activeSectionId)
        ? params.activeSectionId
        : sections[0].sectionId;
    const activeIndex = Math.max(0, sections.findIndex((section) => section.sectionId === activeSectionId));
    const sectionRadius = Math.max(0, params.sectionRadius ?? 1);
    const loadedSectionIds = sections
      .slice(Math.max(0, activeIndex - sectionRadius), Math.min(sections.length, activeIndex + sectionRadius + 1))
      .map((section) => section.sectionId);
    const chunks = await this.loadChunksForSections(params.uid, params.projectId, loadedSectionIds);

    return {
      sections,
      chunks,
      activeSectionId,
      loadedSectionIds,
      totalChunkCount: sections.reduce((sum, section) => sum + section.chunkCount, 0),
    };
  },

  async loadSnapshot(uid: string, project: Project): Promise<{ snapshot: EditorSnapshot; source: 'chunked' | 'legacy' }> {
    const chunks = await this.loadChunks(uid, project.id);
    if (chunks.length > 0) {
      const contentDoc = assembleChunkedContentDoc(chunks);
      return {
        source: 'chunked',
        snapshot: {
          titleEn: project.titleEn || '',
          titleAr: project.titleAr || '',
          content: project.content || '<p></p>',
          contentDoc,
          wordCount: project.wordCount || chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0),
        },
      };
    }

    return {
      source: 'legacy',
      snapshot: snapshotFromProject(project),
    };
  },

  createDraft(params: {
    projectId: string;
    snapshot: EditorSnapshot;
    revision: number;
    source: 'autosave' | 'migration' | 'publish' | 'manual';
  }): ChunkedManuscriptDraft {
    return createChunkedManuscriptDraft(params);
  },

  async saveSnapshot(params: {
    uid: string;
    projectId: string;
    snapshot: EditorSnapshot;
    revision: number;
    source: 'autosave' | 'migration' | 'publish' | 'manual';
    authority?: ManuscriptSaveAuthority;
    authoritativeSectionIds?: string[];
    affectedChunkIds?: string[];
    operation?: WriteProjectOperationAckInput;
  }): Promise<ManuscriptStorageMetadata & {
    revision: number;
    updatedAt: string;
    projectPatch: ChunkMutationResult['projectPatch'];
    operationAck?: WriteProjectOperationAckResult;
  }> {
    const authority = params.authority ?? 'complete';
    const finish = writeEditorTelemetry.startTimer('manuscript.chunkSave', {
      projectId: params.projectId,
      source: params.source,
      authority,
    });
    const scopedSectionIds = Array.from(new Set([
      ...(params.authoritativeSectionIds ?? []),
      ...(params.snapshot.mountedSectionIds ?? []),
    ].filter(Boolean)));
    if (authority === 'partial' && scopedSectionIds.length === 0) {
      finish();
      throw new Error('Partial manuscript save requires an authoritative section scope.');
    }
    const startedAt = Date.now();
    const snapshot = normalizeEditorSnapshotForTransport(params.snapshot);
    const operation = params.operation
      ? normalizeJsonPlainValue(params.operation)
      : undefined;
    const request = buildChunkMutationRequest({
      projectId: params.projectId,
      revision: params.revision,
      source: params.source,
      authority,
      scopedSectionIds,
      affectedChunkIds: params.affectedChunkIds ?? snapshot.affectedChunkIds,
      operation,
      snapshot,
    });
    const result = await callChunkMutation(request);
    const metadata = result.metadata;

    writeEditorTelemetry.log('manuscript', 'chunk_save_completed', {
      projectId: params.projectId,
      source: params.source,
      authority,
      serverAuthoritative: true,
      readBounded: true,
      sectionScopeCount: scopedSectionIds.length,
      sectionCount: metadata.sectionCount,
      chunkCount: metadata.chunkCount,
      mutationAckStatus: result.mutationAck?.status,
      operationId: result.mutationAck?.operationId,
      chunkWriteCount: result.mutationAck?.chunkWriteCount,
      sectionWriteCount: result.mutationAck?.sectionWriteCount,
      duplicate: result.mutationAck?.duplicate,
    }, 'debug');
    writeEditorTelemetry.timing('manuscript.serverChunkMutationAcknowledgement', Date.now() - startedAt, {
      projectId: params.projectId,
      authority,
      operationId: result.mutationAck?.operationId,
    });
    if (result.mutationAck?.duplicate) {
      writeEditorTelemetry.increment('manuscript.duplicateChunkReplayRejected');
    }
    writeEditorTelemetry.increment('manuscript.partialSave');
    finish();
    return {
      ...metadata,
      revision: result.revision,
      updatedAt: result.updatedAt,
      projectPatch: result.projectPatch,
      operationAck: result.mutationAck,
    };
  },

  async deleteChunkedManuscript(uid: string, projectId: string): Promise<void> {
    const sections = await this.loadSections(uid, projectId);
    for (const section of sections) {
      const chunks = await this.loadChunks(uid, projectId);
      await Promise.all(
        chunks
          .filter((chunk) => chunk.sectionId === section.sectionId)
          .map((chunk) => deleteDoc(doc(getProjectRef(uid, projectId), 'sections', chunk.sectionId, 'chunks', chunk.chunkId)))
      );
      await deleteDoc(doc(getProjectRef(uid, projectId), 'sections', section.sectionId));
    }
  },
};
