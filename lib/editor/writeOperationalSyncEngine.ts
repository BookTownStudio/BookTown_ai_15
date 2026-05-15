import { type EditorSnapshot, getPerfNow } from './editorRuntimeTypes.ts';
import { indexedDbOperationalStore } from './indexedDbOperationalStore.ts';
import {
  createOperationCausality,
  createOperationConvergenceHash,
  extractOperationChunkIds,
  planDistributedOperationReplay,
} from './writeConvergenceSemantics.ts';
import {
  createChunkSnapshotOperationId,
  type WriteChunkSnapshotOperation,
  type WriteConvergenceCheckpoint,
  type WriteOperationalRecord,
  type WriteProjectOperationAckResult,
} from './writeOperationalTypes.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';
import { requestWriteOperationCompaction } from './writeOperationRetention.ts';
import { getWriteRuntimeDeviceId } from './writeRuntimeIdentity.ts';

export type ApplyWriteOperation = (
  operation: WriteChunkSnapshotOperation
) => Promise<{ revision: number; updatedAt?: string; operationAck?: WriteProjectOperationAckResult }>;

export interface EnqueueSnapshotOperationParams {
  uid: string;
  projectId: string;
  expectedRevision?: number;
  snapshot: EditorSnapshot;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const CONVERGENCE_CHECKPOINT_KEY = 'convergenceCheckpoint';
const MAX_REPLAY_BATCH_SIZE = 8;
const MAX_LOCAL_APPLIED_RETAINED = 200;
const REPLAY_BACKPRESSURE_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const writeOperationalSyncEngine = {
  async createCommittedChunkSnapshotOperation(params: EnqueueSnapshotOperationParams & {
    serverRevision?: number;
  }): Promise<WriteChunkSnapshotOperation> {
    const operationId = createChunkSnapshotOperationId(params);
    const now = Date.now();
    const sequence = await indexedDbOperationalStore.allocateSequence();
    const pendingOperations = await indexedDbOperationalStore.getPending(params.uid, params.projectId);
    const causality = createOperationCausality({
      actorId: params.uid,
      deviceId: getWriteRuntimeDeviceId(params.uid),
      sequence,
      createdAt: now,
      operationId,
      chunkIds: extractOperationChunkIds({
        schemaVersion: 1,
        operationId,
        uid: params.uid,
        projectId: params.projectId,
        type: 'chunk_snapshot_save',
        status: 'applied',
        sequence,
        createdAt: now,
        updatedAt: now,
        expectedRevision: params.expectedRevision,
        snapshot: params.snapshot,
        affectedChunkIds: params.snapshot.affectedChunkIds,
        mountedSectionIds: params.snapshot.mountedSectionIds,
        attempts: 0,
      }),
      baseRevision: params.expectedRevision,
      parents: pendingOperations as WriteChunkSnapshotOperation[],
    });
    const operation: WriteChunkSnapshotOperation = {
      schemaVersion: 1,
      operationId,
      uid: params.uid,
      projectId: params.projectId,
      type: 'chunk_snapshot_save',
      status: 'applied',
      sequence,
      createdAt: now,
      updatedAt: now,
      expectedRevision: params.expectedRevision,
      snapshot: params.snapshot,
      affectedChunkIds: params.snapshot.affectedChunkIds,
      mountedSectionIds: params.snapshot.mountedSectionIds,
      causality,
      convergenceHash: undefined,
      conflictState: 'none',
      attempts: 0,
      appliedAt: now,
      serverRevision: params.serverRevision,
    };
    operation.convergenceHash = createOperationConvergenceHash(operation);
    return operation;
  },

  async enqueueChunkSnapshotOperation(
    params: EnqueueSnapshotOperationParams
  ): Promise<WriteChunkSnapshotOperation> {
    const finish = writeEditorTelemetry.startTimer('sync.operationEnqueue', {
      projectId: params.projectId,
    });
    const operationId = createChunkSnapshotOperationId(params);
    const existing = await indexedDbOperationalStore.get(operationId);
    if (existing?.type === 'chunk_snapshot_save') {
      writeEditorTelemetry.log('sync', 'operation_enqueue_deduped', {
        projectId: params.projectId,
        operationId,
        status: existing.status,
      }, 'debug');
      finish();
      return existing;
    }

    const now = Date.now();
    const sequence = await indexedDbOperationalStore.allocateSequence();
    const pendingOperations = await indexedDbOperationalStore.getPending(params.uid, params.projectId);
    const causality = createOperationCausality({
      actorId: params.uid,
      deviceId: getWriteRuntimeDeviceId(params.uid),
      sequence,
      createdAt: now,
      operationId,
      chunkIds: extractOperationChunkIds({
        schemaVersion: 1,
        operationId,
        uid: params.uid,
        projectId: params.projectId,
        type: 'chunk_snapshot_save',
        status: 'pending',
        sequence,
        createdAt: now,
        updatedAt: now,
        expectedRevision: params.expectedRevision,
        snapshot: params.snapshot,
        affectedChunkIds: params.snapshot.affectedChunkIds,
        mountedSectionIds: params.snapshot.mountedSectionIds,
        attempts: 0,
      }),
      baseRevision: params.expectedRevision,
      parents: pendingOperations as WriteChunkSnapshotOperation[],
    });
    const operation: WriteChunkSnapshotOperation = {
      schemaVersion: 1,
      operationId,
      uid: params.uid,
      projectId: params.projectId,
      type: 'chunk_snapshot_save',
      status: 'pending',
      sequence,
      createdAt: now,
      updatedAt: now,
      expectedRevision: params.expectedRevision,
      snapshot: params.snapshot,
      affectedChunkIds: params.snapshot.affectedChunkIds,
      mountedSectionIds: params.snapshot.mountedSectionIds,
      causality,
      conflictState: 'none',
      attempts: 0,
    };
    operation.convergenceHash = createOperationConvergenceHash(operation);

    await indexedDbOperationalStore.put(operation);
    const pendingCount = await indexedDbOperationalStore.countPending(params.uid, params.projectId);
    writeEditorTelemetry.log('sync', 'operation_enqueued', {
      projectId: params.projectId,
      operationId,
      sequence: operation.sequence,
      pendingCount,
      affectedChunkCount: operation.affectedChunkIds?.length ?? 0,
      mountedSectionCount: operation.mountedSectionIds?.length ?? 0,
      parentCount: operation.causality?.parents.length ?? 0,
      vectorClockWidth: Object.keys(operation.causality?.vectorClock ?? {}).length,
    }, 'debug');
    writeEditorTelemetry.gauge('sync.pendingOperationCount', pendingCount);
    writeEditorTelemetry.gauge('sync.operationLineageParentCount', operation.causality.parents.length);
    writeEditorTelemetry.gauge('sync.operationVectorClockWidth', Object.keys(operation.causality.vectorClock).length);
    writeEditorTelemetry.increment('sync.offlineMutation');
    finish();
    return operation;
  },

  async replayPendingOperations(params: {
    uid: string;
    projectId: string;
    applyOperation: ApplyWriteOperation;
  }): Promise<{ appliedCount: number; failedCount: number; latestRevision?: number }> {
    const finish = writeEditorTelemetry.startTimer('sync.replayCycle', {
      projectId: params.projectId,
    });
    const operations = await indexedDbOperationalStore.getPending(params.uid, params.projectId);
    const previousCheckpoint = await indexedDbOperationalStore.getProjectMeta<WriteConvergenceCheckpoint>(
      params.uid,
      params.projectId,
      CONVERGENCE_CHECKPOINT_KEY
    );
    const replayPlan = planDistributedOperationReplay({
      uid: params.uid,
      projectId: params.projectId,
      operations: operations as WriteChunkSnapshotOperation[],
      appliedOperationIds: previousCheckpoint?.operationIds,
    });
    writeEditorTelemetry.gauge('sync.pendingOperationCount', operations.length);
    writeEditorTelemetry.gauge('sync.replayableOperationCount', replayPlan.replayableOperations.length);
    writeEditorTelemetry.gauge('sync.causalityGraphOperationCount', replayPlan.graph.operationCount);
    writeEditorTelemetry.gauge('sync.causalityGraphEdgeCount', replayPlan.graph.edgeCount);
    writeEditorTelemetry.gauge('sync.causalityGraphChunkCount', replayPlan.graph.chunkCount);
    writeEditorTelemetry.gauge('sync.causalityConcurrentPairCount', replayPlan.graph.concurrentPairCount);
    writeEditorTelemetry.gauge('sync.conflictCount', replayPlan.conflicts.length);
    if (replayPlan.conflicts.length > 0) {
      writeEditorTelemetry.log('sync', 'distributed_conflicts_arbitrated', {
        projectId: params.projectId,
        conflictCount: replayPlan.conflicts.length,
        conflicts: replayPlan.conflicts,
      }, 'warn');
    }

    let appliedCount = 0;
    let failedCount = 0;
    let latestRevision: number | undefined;

    const replayableOperations = replayPlan.replayableOperations;
    const backpressureActive = replayPlan.replayableOperations.length > MAX_REPLAY_BATCH_SIZE;
    if (backpressureActive) {
      writeEditorTelemetry.increment('sync.replayBackpressureActivated');
      writeEditorTelemetry.log('sync', 'replay_backpressure_activated', {
        projectId: params.projectId,
        replayableCount: replayPlan.replayableOperations.length,
        batchSize: MAX_REPLAY_BATCH_SIZE,
      }, 'warn');
    }
    writeEditorTelemetry.gauge('sync.replayBatchSize', Math.min(replayableOperations.length, MAX_REPLAY_BATCH_SIZE));

    for (const [index, operation] of replayableOperations.entries()) {
      if (index > 0 && index % MAX_REPLAY_BATCH_SIZE === 0) {
        await delay(REPLAY_BACKPRESSURE_DELAY_MS);
      }
      const startedAt = getPerfNow();
      const conflict = replayPlan.conflicts.find((entry) => (
        entry.operationIds.includes(operation.operationId)
      ));
      await indexedDbOperationalStore.updateStatus(operation.operationId, 'applying', {
        attempts: operation.attempts + 1,
        conflictState: conflict ? 'observed' : 'none',
        conflictOperationIds: conflict?.operationIds,
      });

      try {
        const result = await params.applyOperation(operation as WriteChunkSnapshotOperation);
        latestRevision = result.revision;
        appliedCount += 1;
        await indexedDbOperationalStore.updateStatus(operation.operationId, 'applied', {
          appliedAt: Date.now(),
          serverRevision: result.revision,
          lastError: undefined,
          conflictState: conflict ? 'resolved' : 'none',
          convergenceCheckpointId: result.operationAck?.checkpointId ?? replayPlan.checkpoint.checkpointId,
        });
        if (result.operationAck?.duplicate) {
          writeEditorTelemetry.increment('sync.duplicateReplayRejected');
          writeEditorTelemetry.log('sync', 'server_duplicate_replay_acknowledged', {
            projectId: params.projectId,
            operationId: operation.operationId,
            acknowledgedRevision: result.operationAck.acknowledgedRevision,
            checkpointId: result.operationAck.checkpointId,
          }, 'debug');
        }
        writeEditorTelemetry.timing('sync.operationAcknowledgement', getPerfNow() - startedAt, {
          projectId: params.projectId,
          operationId: operation.operationId,
        });
        writeEditorTelemetry.increment('sync.operationApplied');
      } catch (error) {
        failedCount += 1;
        await indexedDbOperationalStore.updateStatus(operation.operationId, 'failed', {
          lastError: getErrorMessage(error),
        } as Partial<WriteOperationalRecord>);
        writeEditorTelemetry.log('sync', 'operation_replay_failed', {
          projectId: params.projectId,
          operationId: operation.operationId,
          error: getErrorMessage(error),
        }, 'warn');
        break;
      }
    }

    if (failedCount === 0) {
      await indexedDbOperationalStore.setProjectMeta(
        params.uid,
        params.projectId,
        CONVERGENCE_CHECKPOINT_KEY,
        replayPlan.checkpoint
      );
      writeEditorTelemetry.log('sync', 'convergence_checkpoint_recorded', {
        projectId: params.projectId,
        checkpointId: replayPlan.checkpoint.checkpointId,
        operationCount: replayPlan.checkpoint.operationIds.length,
        chunkCount: replayPlan.checkpoint.chunkIds.length,
      }, 'debug');
      writeEditorTelemetry.gauge('sync.convergenceCheckpointOperationCount', replayPlan.checkpoint.operationIds.length);
      const compaction = await indexedDbOperationalStore.compactApplied({
        uid: params.uid,
        projectId: params.projectId,
        retain: MAX_LOCAL_APPLIED_RETAINED,
        preserveOperationIds: replayPlan.checkpoint.operationIds,
      });
      writeEditorTelemetry.log('sync', 'indexeddb_operation_compaction_completed', {
        projectId: params.projectId,
        beforeCount: compaction.beforeCount,
        afterCount: compaction.afterCount,
        prunedCount: compaction.prunedCount,
      }, 'debug');
      writeEditorTelemetry.gauge('sync.indexedDbOperationCount', compaction.afterCount);
      writeEditorTelemetry.increment('sync.indexedDbCompaction');
      void requestWriteOperationCompaction({
        projectId: params.projectId,
        reason: 'replay',
      });
    }

    writeEditorTelemetry.log('sync', 'replay_cycle_completed', {
      projectId: params.projectId,
      appliedCount,
      failedCount,
      latestRevision,
      duplicateOperationCount: replayPlan.duplicateOperationIds.length,
      remainingReplayableCount: Math.max(0, replayPlan.replayableOperations.length - appliedCount),
      checkpointId: replayPlan.checkpoint.checkpointId,
    }, failedCount > 0 ? 'warn' : 'debug');
    finish();
    return { appliedCount, failedCount, latestRevision };
  },
};
