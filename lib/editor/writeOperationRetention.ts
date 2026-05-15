import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

type CallableEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

export interface WriteOperationCompactionResult {
  projectId: string;
  operationLedgerPruned: number;
  chunkMutationLedgerPruned: number;
  collaborationOperationsPruned: number;
  presencePruned: number;
  durationMs: number;
}

const MIN_COMPACTION_INTERVAL_MS = 5 * 60 * 1000;
const lastCompactionAtByProject = new Map<string, number>();

export async function requestWriteOperationCompaction(params: {
  projectId: string;
  reason: 'replay' | 'collaboration' | 'presence' | 'manual';
  force?: boolean;
}): Promise<WriteOperationCompactionResult | null> {
  const now = Date.now();
  const lastRunAt = lastCompactionAtByProject.get(params.projectId) ?? 0;
  if (!params.force && now - lastRunAt < MIN_COMPACTION_INTERVAL_MS) {
    return null;
  }
  lastCompactionAtByProject.set(params.projectId, now);

  const finish = writeEditorTelemetry.startTimer('sync.operationLogCompaction', {
    projectId: params.projectId,
    reason: params.reason,
  });
  try {
    const callable = httpsCallable<
      { projectId: string },
      CallableEnvelope<WriteOperationCompactionResult> | WriteOperationCompactionResult
    >(getFirebaseFunctions(), 'compactWriteOperationLogs');
    const response = await callable({ projectId: params.projectId });
    const value = response.data;
    const result = value && typeof value === 'object' && 'success' in value
      ? (value as CallableEnvelope<WriteOperationCompactionResult>).success
        ? (value as { success: true; data: WriteOperationCompactionResult }).data
        : null
      : value as WriteOperationCompactionResult;
    if (!result) {
      return null;
    }
    writeEditorTelemetry.log('sync', 'operation_log_compaction_completed', {
      ...result,
      reason: params.reason,
    }, 'debug');
    writeEditorTelemetry.gauge('sync.operationLedgerPrunedCount', result.operationLedgerPruned);
    writeEditorTelemetry.gauge('sync.chunkMutationLedgerPrunedCount', result.chunkMutationLedgerPruned);
    writeEditorTelemetry.gauge('sync.collaborationOperationPrunedCount', result.collaborationOperationsPruned);
    writeEditorTelemetry.gauge('sync.presencePrunedCount', result.presencePruned);
    return result;
  } catch (error) {
    writeEditorTelemetry.log('sync', 'operation_log_compaction_failed', {
      projectId: params.projectId,
      reason: params.reason,
      error: error instanceof Error ? error.message : String(error),
    }, 'warn');
    return null;
  } finally {
    finish();
  }
}
