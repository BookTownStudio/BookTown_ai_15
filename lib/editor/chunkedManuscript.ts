import { type WriteContentDoc, type WriteContentNode } from '../../types/entities.ts';
import { type EditorSnapshot, serializeDoc } from './editorRuntimeTypes.ts';
import {
    assignChunkIdentityToNodes,
    ensureStructuralAnchorsInDoc,
    resolveDominantChunkId,
    resolveDominantSectionId,
} from './structuralAnchors.ts';

export const MANUSCRIPT_STORAGE_VERSION = 1;
export const DEFAULT_MANUSCRIPT_SECTION_ID = 'section_0001';
export const TARGET_CHUNK_BYTES = 120_000;
export const TARGET_CHUNK_NODE_COUNT = 80;

export interface ManuscriptStorageMetadata {
    version: 1;
    mode: 'legacy' | 'chunked' | 'hybrid';
    activeSectionId?: string;
    latestRevision?: number;
    latestSnapshotId?: string;
    sectionCount?: number;
    chunkCount?: number;
    contentHash?: string;
    migratedAt?: string;
    updatedAt?: string;
}

export interface ManuscriptSectionRecord {
    schemaVersion: 1;
    projectId: string;
    sectionId: string;
    order: number;
    title: string;
    kind: 'chapter' | 'section';
    summary?: string;
    chunkCount: number;
    nodeCount: number;
    wordCount: number;
    revision: number;
    contentHash: string;
    createdAt: string;
    updatedAt: string;
}

export interface ManuscriptChunkRecord {
    schemaVersion: 1;
    projectId: string;
    sectionId: string;
    chunkId: string;
    order: number;
    nodeCount: number;
    byteSize: number;
    plainTextSize: number;
    wordCount: number;
    contentHash: string;
    anchorIds?: string[];
    revision: number;
    contentDoc: WriteContentDoc;
    createdAt: string;
    updatedAt: string;
}

export interface ManuscriptSnapshotRecord {
    schemaVersion: 1;
    projectId: string;
    snapshotId: string;
    source: 'autosave' | 'migration' | 'publish' | 'manual';
    revision: number;
    sectionCount: number;
    chunkCount: number;
    wordCount: number;
    contentHash: string;
    createdAt: string;
}

export interface ChunkedManuscriptDraft {
    activeSectionId: string;
    sections: ManuscriptSectionRecord[];
    chunks: ManuscriptChunkRecord[];
    snapshot: ManuscriptSnapshotRecord;
    contentHash: string;
    contentDoc: WriteContentDoc;
}

interface SectionDraft {
    nodes: WriteContentNode[];
    title: string;
    kind: 'chapter' | 'section';
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

export function createManuscriptHash(value: unknown): string {
    const source = stableStringify(value);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function countTextWords(value: string): number {
    return value.trim().split(/\s+/).filter(Boolean).length;
}

function extractNodeText(node: WriteContentNode): string {
    const ownText = typeof node.text === 'string' ? node.text : '';
    const childText = Array.isArray(node.content)
        ? node.content.map((child) => extractNodeText(child)).join(' ')
        : '';
    return `${ownText} ${childText}`.replace(/\s+/g, ' ').trim();
}

function extractNodesText(nodes: WriteContentNode[]): string {
    return nodes.map((node) => extractNodeText(node)).filter(Boolean).join('\n');
}

function extractSectionTitle(nodes: WriteContentNode[], fallback: string): string {
    const heading = nodes.find((node) => node.type === 'heading' && extractNodeText(node));
    return (heading ? extractNodeText(heading) : fallback).slice(0, 180);
}

function createSectionId(order: number): string {
    return `section_${String(order + 1).padStart(4, '0')}`;
}

function createChunkId(sectionId: string, order: number): string {
    return `${sectionId}_chunk_${String(order + 1).padStart(4, '0')}`;
}

function normalizeContentDoc(contentDoc?: WriteContentDoc): WriteContentDoc {
    if (contentDoc?.type === 'doc' && Array.isArray(contentDoc.content)) {
        return {
            version: 1,
            type: 'doc',
            content: contentDoc.content,
        };
    }

    return {
        version: 1,
        type: 'doc',
        content: [],
    };
}

function splitSections(nodes: WriteContentNode[]): SectionDraft[] {
    const sections: SectionDraft[] = [];
    let current: WriteContentNode[] = [];

    nodes.forEach((node) => {
        if (node.type === 'horizontalRule' && current.length > 0) {
            sections.push({
                nodes: current,
                title: extractSectionTitle(current, `Section ${sections.length + 1}`),
                kind: 'chapter',
            });
            current = [node];
            return;
        }

        current.push(node);
    });

    if (current.length > 0 || sections.length === 0) {
        sections.push({
            nodes: current,
            title: extractSectionTitle(current, `Section ${sections.length + 1}`),
            kind: 'chapter',
        });
    }

    return sections;
}

function splitChunks(nodes: WriteContentNode[]): WriteContentNode[][] {
    const chunks: WriteContentNode[][] = [];
    let current: WriteContentNode[] = [];
    let currentBytes = 0;

    nodes.forEach((node) => {
        const nodeBytes = stableStringify(node).length;
        const shouldStartNext =
            current.length > 0 &&
            (current.length >= TARGET_CHUNK_NODE_COUNT || currentBytes + nodeBytes > TARGET_CHUNK_BYTES);

        if (shouldStartNext) {
            chunks.push(current);
            current = [];
            currentBytes = 0;
        }

        current.push(node);
        currentBytes += nodeBytes;
    });

    if (current.length > 0 || chunks.length === 0) {
        chunks.push(current);
    }

    return chunks;
}

export function createChunkedManuscriptDraft(params: {
    projectId: string;
    snapshot: EditorSnapshot;
    revision: number;
    source: ManuscriptSnapshotRecord['source'];
    now?: string;
}): ChunkedManuscriptDraft {
    const now = params.now ?? new Date().toISOString();
    const anchoredContentDoc = ensureStructuralAnchorsInDoc(
        normalizeContentDoc(params.snapshot.contentDoc),
        params.projectId
    );
    const sectionDrafts = splitSections(anchoredContentDoc.content);
    const sections: ManuscriptSectionRecord[] = [];
    const chunks: ManuscriptChunkRecord[] = [];

    sectionDrafts.forEach((sectionDraft, sectionOrder) => {
        const sectionId = resolveDominantSectionId(sectionDraft.nodes, createSectionId(sectionOrder));
        const sectionChunks = splitChunks(sectionDraft.nodes);
        const sectionText = extractNodesText(sectionDraft.nodes);
        const sectionHash = createManuscriptHash(sectionDraft.nodes);

        sections.push({
            schemaVersion: MANUSCRIPT_STORAGE_VERSION,
            projectId: params.projectId,
            sectionId,
            order: sectionOrder,
            title: sectionDraft.title,
            kind: sectionDraft.kind,
            chunkCount: sectionChunks.length,
            nodeCount: sectionDraft.nodes.length,
            wordCount: countTextWords(sectionText),
            revision: params.revision,
            contentHash: sectionHash,
            createdAt: now,
            updatedAt: now,
        });

        sectionChunks.forEach((chunkNodes, chunkOrder) => {
            const fallbackChunkId = createChunkId(sectionId, chunkOrder);
            const chunkId = resolveDominantChunkId(chunkNodes, fallbackChunkId);
            const chunkContent = assignChunkIdentityToNodes(chunkNodes, sectionId, chunkId);
            const chunkDoc: WriteContentDoc = {
                version: 1,
                type: 'doc',
                content: chunkContent,
            };
            const plainText = extractNodesText(chunkNodes);
            chunks.push({
                schemaVersion: MANUSCRIPT_STORAGE_VERSION,
                projectId: params.projectId,
                sectionId,
                chunkId,
                order: chunkOrder,
                nodeCount: chunkContent.length,
                byteSize: stableStringify(chunkDoc).length,
                plainTextSize: plainText.length,
                wordCount: countTextWords(plainText),
                contentHash: createManuscriptHash(chunkDoc),
                anchorIds: chunkContent
                    .map((node) => typeof node.attrs?.btAnchorId === 'string' ? node.attrs.btAnchorId : null)
                    .filter((anchorId): anchorId is string => Boolean(anchorId)),
                revision: params.revision,
                contentDoc: chunkDoc,
                createdAt: now,
                updatedAt: now,
            });
        });
    });

    const contentDoc = assembleChunkedContentDoc(chunks);
    const contentHash = createManuscriptHash(contentDoc);
    const snapshotTime = now.replace(/[^0-9]/g, '').slice(0, 17) || String(Date.now());
    const snapshotId = `snapshot_${String(params.revision).padStart(8, '0')}_${snapshotTime}_${contentHash}`;
    return {
        activeSectionId: sections[0]?.sectionId ?? DEFAULT_MANUSCRIPT_SECTION_ID,
        sections,
        chunks,
        contentHash,
        contentDoc,
        snapshot: {
            schemaVersion: MANUSCRIPT_STORAGE_VERSION,
            projectId: params.projectId,
            snapshotId,
            source: params.source,
            revision: params.revision,
            sectionCount: sections.length,
            chunkCount: chunks.length,
            wordCount: params.snapshot.wordCount,
            contentHash,
            createdAt: now,
        },
    };
}

export function assembleChunkedContentDoc(chunks: ManuscriptChunkRecord[]): WriteContentDoc {
    const orderedChunks = [...chunks].sort((a, b) => {
        if (a.sectionId === b.sectionId) {
            return a.order - b.order;
        }
        return a.sectionId.localeCompare(b.sectionId);
    });
    return {
        version: 1,
        type: 'doc',
        content: orderedChunks.flatMap((chunk) => chunk.contentDoc.content),
    };
}

export function snapshotsHaveSameDocument(a: EditorSnapshot, b: EditorSnapshot): boolean {
    return serializeDoc(a.contentDoc) === serializeDoc(b.contentDoc);
}
