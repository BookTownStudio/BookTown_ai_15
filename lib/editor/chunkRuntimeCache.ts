import { type ManuscriptChunkRecord } from './chunkedManuscript.ts';

const DEFAULT_MAX_CHUNKS = 5_000;
const DEFAULT_MAX_BYTES = 96 * 1024 * 1024;

export interface ChunkRuntimeCacheLimits {
  maxChunks?: number;
  maxBytes?: number;
}

export interface ChunkRuntimeCacheStats {
  chunkCount: number;
  loadedSectionCount: number;
  loadedSectionIds: string[];
  totalByteSize: number;
  totalNodeCount: number;
  hits: number;
  misses: number;
  evictions: number;
}

interface CacheEntry {
  chunk: ManuscriptChunkRecord;
  lastAccessedAt: number;
  sequence: number;
}

function createChunkKey(sectionId: string, chunkId: string): string {
  return `${sectionId}/${chunkId}`;
}

function sortChunks(a: ManuscriptChunkRecord, b: ManuscriptChunkRecord): number {
  if (a.sectionId === b.sectionId) {
    return a.order - b.order;
  }
  return a.sectionId.localeCompare(b.sectionId);
}

export class ChunkRuntimeCache {
  private readonly maxChunks: number;

  private readonly maxBytes: number;

  private readonly entries = new Map<string, CacheEntry>();

  private readonly sectionIndex = new Map<string, Set<string>>();

  private sequence = 0;

  private hits = 0;

  private misses = 0;

  private evictions = 0;

  constructor(limits: ChunkRuntimeCacheLimits = {}) {
    this.maxChunks = limits.maxChunks ?? DEFAULT_MAX_CHUNKS;
    this.maxBytes = limits.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  getChunk(sectionId: string, chunkId: string): ManuscriptChunkRecord | null {
    const entry = this.entries.get(createChunkKey(sectionId, chunkId));
    if (!entry) {
      this.misses += 1;
      return null;
    }

    this.hits += 1;
    entry.lastAccessedAt = Date.now();
    entry.sequence = ++this.sequence;
    return entry.chunk;
  }

  putChunks(chunks: ManuscriptChunkRecord[]): void {
    chunks.forEach((chunk) => {
      const key = createChunkKey(chunk.sectionId, chunk.chunkId);
      const existing = this.entries.get(key);
      if (!existing) {
        const sectionKeys = this.sectionIndex.get(chunk.sectionId) ?? new Set<string>();
        sectionKeys.add(key);
        this.sectionIndex.set(chunk.sectionId, sectionKeys);
      }

      this.entries.set(key, {
        chunk,
        lastAccessedAt: Date.now(),
        sequence: ++this.sequence,
      });
    });

    this.enforceLimits();
  }

  hasSection(sectionId: string): boolean {
    return (this.sectionIndex.get(sectionId)?.size ?? 0) > 0;
  }

  getChunksForSections(sectionIds: string[]): ManuscriptChunkRecord[] {
    const chunks: ManuscriptChunkRecord[] = [];
    sectionIds.forEach((sectionId) => {
      const keys = this.sectionIndex.get(sectionId);
      if (!keys) {
        this.misses += 1;
        return;
      }

      keys.forEach((key) => {
        const entry = this.entries.get(key);
        if (!entry) return;
        this.hits += 1;
        entry.lastAccessedAt = Date.now();
        entry.sequence = ++this.sequence;
        chunks.push(entry.chunk);
      });
    });

    return chunks.sort(sortChunks);
  }

  evictOutsideSections(retainedSectionIds: string[]): void {
    const retained = new Set(retainedSectionIds);
    Array.from(this.sectionIndex.keys()).forEach((sectionId) => {
      if (retained.has(sectionId)) return;
      this.deleteSection(sectionId);
    });
  }

  clear(): void {
    this.entries.clear();
    this.sectionIndex.clear();
  }

  getStats(): ChunkRuntimeCacheStats {
    const chunks = Array.from(this.entries.values()).map((entry) => entry.chunk);
    return {
      chunkCount: this.entries.size,
      loadedSectionCount: this.sectionIndex.size,
      loadedSectionIds: Array.from(this.sectionIndex.keys()).sort(),
      totalByteSize: chunks.reduce((sum, chunk) => sum + chunk.byteSize, 0),
      totalNodeCount: chunks.reduce((sum, chunk) => sum + chunk.nodeCount, 0),
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
    };
  }

  private enforceLimits(): void {
    while (this.entries.size > this.maxChunks || this.getStats().totalByteSize > this.maxBytes) {
      const oldest = Array.from(this.entries.entries()).sort(([, a], [, b]) => a.sequence - b.sequence)[0];
      if (!oldest) return;
      this.deleteChunk(oldest[0], oldest[1].chunk.sectionId);
    }
  }

  private deleteSection(sectionId: string): void {
    const keys = this.sectionIndex.get(sectionId);
    if (!keys) return;
    keys.forEach((key) => this.deleteChunk(key, sectionId));
  }

  private deleteChunk(key: string, sectionId: string): void {
    if (!this.entries.delete(key)) return;
    const sectionKeys = this.sectionIndex.get(sectionId);
    sectionKeys?.delete(key);
    if (sectionKeys && sectionKeys.size === 0) {
      this.sectionIndex.delete(sectionId);
    }
    this.evictions += 1;
  }
}
