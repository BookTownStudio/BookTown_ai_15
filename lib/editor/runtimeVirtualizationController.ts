import { type Project } from '../../types/entities.ts';
import { type EditorSnapshot } from './editorRuntimeTypes.ts';
import { type HydrationWindow } from './incrementalHydrationController.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

export interface RuntimeVirtualizationSnapshotResult {
  snapshot: EditorSnapshot;
  mountedSectionIds: string[];
  mountedChunkCount: number;
  totalSectionCount: number;
  totalChunkCount: number;
  isPartial: boolean;
}

export function createVirtualizedEditorSnapshot(
  project: Project,
  window: HydrationWindow
): RuntimeVirtualizationSnapshotResult {
  const isPartial = !window.isComplete;
  const snapshot: EditorSnapshot = {
    titleEn: project.titleEn || '',
    titleAr: project.titleAr || '',
    content: project.content || '<p></p>',
    contentDoc: window.contentDoc,
    wordCount: project.wordCount || window.chunks.reduce((sum, chunk) => sum + chunk.wordCount, 0),
    isPartialManuscript: isPartial,
    mountedSectionIds: window.loadedSectionIds,
    activeSectionId: window.activeSectionId,
    totalSectionCount: window.totalSectionCount,
    totalChunkCount: window.totalChunkCount,
  };

  writeEditorTelemetry.log('hydration', 'runtime_virtualization_window_mounted', {
    activeSectionId: window.activeSectionId,
    mountedSectionCount: window.loadedSectionIds.length,
    mountedChunkCount: window.chunks.length,
    totalSectionCount: window.totalSectionCount,
    totalChunkCount: window.totalChunkCount,
    isPartial,
  }, 'debug');
  writeEditorTelemetry.gauge('virtualization.mountedSectionCount', window.loadedSectionIds.length);
  writeEditorTelemetry.gauge('virtualization.mountedChunkCount', window.chunks.length);
  writeEditorTelemetry.gauge('virtualization.totalSectionCount', window.totalSectionCount);
  writeEditorTelemetry.gauge('virtualization.totalChunkCount', window.totalChunkCount);
  writeEditorTelemetry.gauge('virtualization.windowCoverageRatio', window.totalChunkCount > 0
    ? Math.round((window.chunks.length / window.totalChunkCount) * 10000) / 100
    : 100);

  return {
    snapshot,
    mountedSectionIds: window.loadedSectionIds,
    mountedChunkCount: window.chunks.length,
    totalSectionCount: window.totalSectionCount,
    totalChunkCount: window.totalChunkCount,
    isPartial,
  };
}
