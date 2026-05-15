import {
  assembleChunkedContentDoc,
  type ManuscriptChunkRecord,
  type ManuscriptSectionRecord,
} from './chunkedManuscript.ts';
import { ChunkRuntimeCache, type ChunkRuntimeCacheStats } from './chunkRuntimeCache.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

const DEFAULT_VISIBLE_SECTION_RADIUS = 1;

export interface IncrementalHydrationRepository {
  loadSections(uid: string, projectId: string): Promise<ManuscriptSectionRecord[]>;
  loadChunksForSections(uid: string, projectId: string, sectionIds: string[]): Promise<ManuscriptChunkRecord[]>;
}

export interface HydrationWindow {
  activeSectionId: string;
  sections: ManuscriptSectionRecord[];
  loadedSectionIds: string[];
  chunks: ManuscriptChunkRecord[];
  isComplete: boolean;
  totalSectionCount: number;
  totalChunkCount: number;
  contentDoc: ReturnType<typeof assembleChunkedContentDoc>;
  cacheStats: ChunkRuntimeCacheStats;
}

interface HydrationParams {
  uid: string;
  projectId: string;
  activeSectionId?: string;
  sectionRadius?: number;
}

interface CompleteHydrationParams extends HydrationParams {
  seed?: HydrationWindow;
}

interface ShiftHydrationParams extends HydrationParams {
  direction: 'previous' | 'next';
}

function resolveActiveSectionId(
  sections: ManuscriptSectionRecord[],
  requestedSectionId?: string
): string {
  if (requestedSectionId && sections.some((section) => section.sectionId === requestedSectionId)) {
    return requestedSectionId;
  }
  return sections[0]?.sectionId ?? '';
}

function selectVisibleSectionIds(
  sections: ManuscriptSectionRecord[],
  activeSectionId: string,
  sectionRadius: number
): string[] {
  const activeIndex = Math.max(0, sections.findIndex((section) => section.sectionId === activeSectionId));
  const radius = Math.max(0, sectionRadius);
  const startIndex = Math.max(0, activeIndex - radius);
  const endIndex = Math.min(sections.length - 1, activeIndex + radius);
  return sections.slice(startIndex, endIndex + 1).map((section) => section.sectionId);
}

function sumChunkCount(sections: ManuscriptSectionRecord[]): number {
  return sections.reduce((sum, section) => sum + section.chunkCount, 0);
}

export class IncrementalHydrationController {
  constructor(
    private readonly repository: IncrementalHydrationRepository,
    private readonly cache = new ChunkRuntimeCache()
  ) {}

  async hydrateInitialWindow(params: HydrationParams): Promise<HydrationWindow> {
    const finish = writeEditorTelemetry.startTimer('hydration.initialWindow', {
      projectId: params.projectId,
    });
    const sections = await this.repository.loadSections(params.uid, params.projectId);
    if (sections.length === 0) {
      finish();
      return this.createWindow({
        activeSectionId: '',
        sections,
        loadedSectionIds: [],
        chunks: [],
      });
    }

    const activeSectionId = resolveActiveSectionId(sections, params.activeSectionId);
    const visibleSectionIds = selectVisibleSectionIds(
      sections,
      activeSectionId,
      params.sectionRadius ?? DEFAULT_VISIBLE_SECTION_RADIUS
    );
    const missingSectionIds = visibleSectionIds.filter((sectionId) => !this.cache.hasSection(sectionId));

    if (missingSectionIds.length > 0) {
      const chunks = await this.repository.loadChunksForSections(params.uid, params.projectId, missingSectionIds);
      this.cache.putChunks(chunks);
    }

    const loadedChunks = this.cache.getChunksForSections(visibleSectionIds);
    const window = this.createWindow({
      activeSectionId,
      sections,
      loadedSectionIds: visibleSectionIds,
      chunks: loadedChunks,
    });
    this.recordWindowTelemetry('initial', params.projectId, window);
    finish();
    return window;
  }

  async hydrateCompleteManuscript(params: CompleteHydrationParams): Promise<HydrationWindow> {
    const finish = writeEditorTelemetry.startTimer('hydration.completeExpansion', {
      projectId: params.projectId,
    });
    const sections = params.seed?.sections.length
      ? params.seed.sections
      : await this.repository.loadSections(params.uid, params.projectId);
    const activeSectionId = resolveActiveSectionId(sections, params.activeSectionId ?? params.seed?.activeSectionId);
    const allSectionIds = sections.map((section) => section.sectionId);
    const missingSectionIds = allSectionIds.filter((sectionId) => !this.cache.hasSection(sectionId));

    if (missingSectionIds.length > 0) {
      const chunks = await this.repository.loadChunksForSections(params.uid, params.projectId, missingSectionIds);
      this.cache.putChunks(chunks);
    }

    const window = this.createWindow({
      activeSectionId,
      sections,
      loadedSectionIds: allSectionIds,
      chunks: this.cache.getChunksForSections(allSectionIds),
    });
    this.recordWindowTelemetry('complete', params.projectId, window);
    finish();
    return window;
  }

  async hydrateShiftedWindow(params: ShiftHydrationParams): Promise<HydrationWindow | null> {
    const finish = writeEditorTelemetry.startTimer('hydration.windowShift', {
      projectId: params.projectId,
      direction: params.direction,
    });
    const sections = await this.repository.loadSections(params.uid, params.projectId);
    if (sections.length === 0) {
      finish();
      return null;
    }

    const currentActiveSectionId = resolveActiveSectionId(sections, params.activeSectionId);
    const currentIndex = sections.findIndex((section) => section.sectionId === currentActiveSectionId);
    const nextIndex = params.direction === 'next'
      ? Math.min(sections.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);

    if (nextIndex === currentIndex) {
      finish();
      return null;
    }

    const window = await this.hydrateInitialWindow({
      uid: params.uid,
      projectId: params.projectId,
      activeSectionId: sections[nextIndex].sectionId,
      sectionRadius: params.sectionRadius,
    });
    writeEditorTelemetry.log('hydration', 'runtime_window_shifted', {
      projectId: params.projectId,
      direction: params.direction,
      previousActiveSectionId: currentActiveSectionId,
      activeSectionId: window.activeSectionId,
      mountedSectionCount: window.loadedSectionIds.length,
      mountedChunkCount: window.chunks.length,
    }, 'debug');
    finish();
    return window;
  }

  evictOutsideVisibleWindow(sectionIds: string[]): void {
    this.cache.evictOutsideSections(sectionIds);
    const stats = this.cache.getStats();
    writeEditorTelemetry.gauge('hydration.cache.chunkCount', stats.chunkCount);
    writeEditorTelemetry.gauge('hydration.cache.evictions', stats.evictions);
  }

  getCacheStats(): ChunkRuntimeCacheStats {
    return this.cache.getStats();
  }

  private createWindow(params: {
    activeSectionId: string;
    sections: ManuscriptSectionRecord[];
    loadedSectionIds: string[];
    chunks: ManuscriptChunkRecord[];
  }): HydrationWindow {
    return {
      activeSectionId: params.activeSectionId,
      sections: params.sections,
      loadedSectionIds: params.loadedSectionIds,
      chunks: params.chunks,
      isComplete: params.loadedSectionIds.length === params.sections.length,
      totalSectionCount: params.sections.length,
      totalChunkCount: sumChunkCount(params.sections),
      contentDoc: assembleChunkedContentDoc(params.chunks),
      cacheStats: this.cache.getStats(),
    };
  }

  private recordWindowTelemetry(
    phase: 'initial' | 'complete',
    projectId: string,
    window: HydrationWindow
  ): void {
    writeEditorTelemetry.log('hydration', `chunk_hydration_${phase}`, {
      projectId,
      activeSectionId: window.activeSectionId,
      loadedSectionCount: window.loadedSectionIds.length,
      totalSectionCount: window.totalSectionCount,
      visibleChunkCount: window.chunks.length,
      totalChunkCount: window.totalChunkCount,
      cacheHitCount: window.cacheStats.hits,
      cacheMissCount: window.cacheStats.misses,
      cacheEvictionCount: window.cacheStats.evictions,
      isComplete: window.isComplete,
    }, 'debug');
    writeEditorTelemetry.gauge('hydration.visibleChunkCount', window.chunks.length);
    writeEditorTelemetry.gauge('hydration.loadedSectionCount', window.loadedSectionIds.length);
    writeEditorTelemetry.gauge('hydration.totalSectionCount', window.totalSectionCount);
    writeEditorTelemetry.gauge('hydration.cache.chunkCount', window.cacheStats.chunkCount);
    writeEditorTelemetry.gauge('hydration.cache.bytes', window.cacheStats.totalByteSize);
    writeEditorTelemetry.gauge('hydration.cache.hitCount', window.cacheStats.hits);
    writeEditorTelemetry.gauge('hydration.cache.missCount', window.cacheStats.misses);
    writeEditorTelemetry.gauge('hydration.cache.evictions', window.cacheStats.evictions);
  }
}
