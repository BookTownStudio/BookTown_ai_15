import { useCallback, useMemo, useRef } from 'react';
import { type Project } from '../../types/entities.ts';
import { ManuscriptRepository } from '../../services/manuscriptRepository.ts';
import { snapshotFromProject, type EditorSnapshot } from './editorRuntimeTypes.ts';
import { IncrementalHydrationController, type HydrationWindow } from './incrementalHydrationController.ts';
import { createVirtualizedEditorSnapshot } from './runtimeVirtualizationController.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';
import type { WriteProjectOperationAckInput } from './writeOperationalTypes.ts';

interface UseChunkedManuscriptControllerParams {
    uid?: string;
    projectId?: string;
}

function createVirtualizedResult(project: Project, window: HydrationWindow) {
    const virtualizedSnapshot = createVirtualizedEditorSnapshot(project, window);
    return {
        source: 'chunked' as const,
        snapshot: virtualizedSnapshot.snapshot,
        runtime: {
            hydrationMode: 'virtualized-window' as const,
            activeSectionId: window.activeSectionId,
            loadedSectionIds: window.loadedSectionIds,
            totalSectionCount: window.totalSectionCount,
            totalChunkCount: window.totalChunkCount,
            visibleChunkCount: window.chunks.length,
            mountedChunkCount: virtualizedSnapshot.mountedChunkCount,
            isPartial: virtualizedSnapshot.isPartial,
            cacheStats: window.cacheStats,
        },
    };
}

export function useChunkedManuscriptController({
    uid,
    projectId,
}: UseChunkedManuscriptControllerParams) {
    const hydrationController = useMemo(
        () => new IncrementalHydrationController(ManuscriptRepository),
        []
    );
    const authoritativeSectionIdsRef = useRef<string[] | null>(null);

    const loadProjectSnapshot = useCallback(async (project: Project) => {
        if (!uid || !projectId || projectId === 'new') {
            authoritativeSectionIdsRef.current = null;
            return {
                source: 'legacy' as const,
                snapshot: snapshotFromProject(project),
            };
        }

        const activeSectionId = project.activeSectionId ?? project.manuscriptStorage?.activeSectionId;
        const initialWindow = await hydrationController.hydrateInitialWindow({
            uid,
            projectId,
            activeSectionId,
            sectionRadius: 1,
        });

        if (initialWindow.totalSectionCount === 0 || initialWindow.chunks.length === 0) {
            const fallback = {
                source: 'legacy' as const,
                snapshot: snapshotFromProject(project),
            };
            authoritativeSectionIdsRef.current = null;
            writeEditorTelemetry.log('manuscript', 'snapshot_loaded', {
                projectId,
                source: fallback.source,
                reason: 'chunked_storage_empty',
                contentDocNodeCount: fallback.snapshot.contentDoc?.content?.length ?? 0,
            }, 'debug');
            return fallback;
        }

        const mountedWindow = initialWindow;
        if (!initialWindow.isComplete) {
            hydrationController.evictOutsideVisibleWindow(initialWindow.loadedSectionIds);
        }

        const result = createVirtualizedResult(project, mountedWindow);
        authoritativeSectionIdsRef.current = mountedWindow.loadedSectionIds;
        writeEditorTelemetry.log('manuscript', 'snapshot_loaded', {
            projectId,
            source: result.source,
            hydrationMode: result.runtime.hydrationMode,
            initialLoadedSectionCount: initialWindow.loadedSectionIds.length,
            loadedSectionCount: result.runtime.loadedSectionIds.length,
            mountedChunkCount: result.runtime.mountedChunkCount,
            totalSectionCount: result.runtime.totalSectionCount,
            totalChunkCount: result.runtime.totalChunkCount,
            isPartial: result.runtime.isPartial,
            cacheHitCount: result.runtime.cacheStats.hits,
            cacheMissCount: result.runtime.cacheStats.misses,
            contentDocNodeCount: result.snapshot.contentDoc?.content?.length ?? 0,
        }, 'debug');
        return result;
    }, [hydrationController, projectId, uid]);

    const shiftRuntimeWindow = useCallback(async (
        project: Project,
        direction: 'previous' | 'next',
        activeSectionId?: string
    ) => {
        if (!uid || !projectId || projectId === 'new') {
            return null;
        }

        const window = await hydrationController.hydrateShiftedWindow({
            uid,
            projectId,
            activeSectionId: activeSectionId ?? project.activeSectionId ?? project.manuscriptStorage?.activeSectionId,
            direction,
            sectionRadius: 1,
        });

        if (!window) {
            return null;
        }

        hydrationController.evictOutsideVisibleWindow(window.loadedSectionIds);
        authoritativeSectionIdsRef.current = window.loadedSectionIds;
        const result = createVirtualizedResult(project, window);
        writeEditorTelemetry.log('hydration', 'runtime_window_mounted', {
            projectId,
            direction,
            activeSectionId: result.runtime.activeSectionId,
            mountedSectionCount: result.runtime.loadedSectionIds.length,
            mountedChunkCount: result.runtime.mountedChunkCount,
        }, 'debug');
        return result;
    }, [hydrationController, projectId, uid]);

    const migrateLegacySnapshot = useCallback(async (
        snapshot: EditorSnapshot,
        revision: number | null
    ) => {
        if (!uid || !projectId || projectId === 'new' || !snapshot.contentDoc) {
            return null;
        }

        try {
            const metadata = await ManuscriptRepository.saveSnapshot({
                uid,
                projectId,
                snapshot,
                revision: revision ?? 1,
                source: 'migration',
            });
            writeEditorTelemetry.log('manuscript', 'legacy_migration_completed', {
                projectId,
                sectionCount: metadata.sectionCount,
                chunkCount: metadata.chunkCount,
            });
            return metadata;
        } catch (error) {
            writeEditorTelemetry.log('manuscript', 'legacy_migration_failed', {
                projectId,
                error: error instanceof Error ? error.message : String(error),
            }, 'warn');
            return null;
        }
    }, [projectId, uid]);

    const saveSnapshot = useCallback(async (
        snapshot: EditorSnapshot,
        revision: number,
        operation?: WriteProjectOperationAckInput
    ) => {
        if (!uid || !projectId || projectId === 'new') {
            return null;
        }

        const authoritativeSectionIds = authoritativeSectionIdsRef.current ?? snapshot.mountedSectionIds ?? null;
        return ManuscriptRepository.saveSnapshot({
            uid,
            projectId,
            snapshot,
            revision,
            source: 'autosave',
            authority: authoritativeSectionIds ? 'partial' : 'complete',
            authoritativeSectionIds: authoritativeSectionIds ?? undefined,
            affectedChunkIds: snapshot.affectedChunkIds,
            operation,
        });
    }, [projectId, uid]);

    return {
        loadProjectSnapshot,
        shiftRuntimeWindow,
        migrateLegacySnapshot,
        saveSnapshot,
        getRuntimeCacheStats: () => hydrationController.getCacheStats(),
    };
}
