import {
  createWriteOperationHash,
  type OperationVectorClock,
  type WriteChunkSnapshotOperation,
  type WriteConvergenceCheckpoint,
  type WriteOperationCausality,
} from './writeOperationalTypes.ts';

export type VectorClockRelation = 'equal' | 'before' | 'after' | 'concurrent';

export interface ChunkConflictArbitration {
  chunkId: string;
  operationIds: string[];
  winnerOperationId: string;
  deferredOperationIds: string[];
  relation: VectorClockRelation;
  resolution: 'deterministic_order';
}

export interface OperationCausalityGraph {
  operationCount: number;
  edgeCount: number;
  chunkCount: number;
  concurrentPairCount: number;
  maxVectorClockWidth: number;
}

export interface DistributedReplayPlan {
  replayableOperations: WriteChunkSnapshotOperation[];
  duplicateOperationIds: string[];
  conflicts: ChunkConflictArbitration[];
  graph: OperationCausalityGraph;
  checkpoint: WriteConvergenceCheckpoint;
}

type CausalOperation = WriteChunkSnapshotOperation & {
  causality: WriteOperationCausality;
  convergenceHash: string;
};

function sortedUnique(values: Array<string | undefined | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();
}

function comparePrimitive(a: number | string, b: number | string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function extractOperationChunkIds(operation: WriteChunkSnapshotOperation): string[] {
  return sortedUnique([
    ...(operation.causality?.chunkIds ?? []),
    ...(operation.affectedChunkIds ?? []),
    ...(operation.snapshot.affectedChunkIds ?? []),
  ]);
}

export function compareVectorClocks(
  first: OperationVectorClock,
  second: OperationVectorClock
): VectorClockRelation {
  const devices = sortedUnique([...Object.keys(first), ...Object.keys(second)]);
  let firstGreater = false;
  let secondGreater = false;

  devices.forEach((deviceId) => {
    const firstValue = first[deviceId] ?? 0;
    const secondValue = second[deviceId] ?? 0;
    if (firstValue > secondValue) firstGreater = true;
    if (secondValue > firstValue) secondGreater = true;
  });

  if (!firstGreater && !secondGreater) return 'equal';
  if (firstGreater && !secondGreater) return 'after';
  if (!firstGreater && secondGreater) return 'before';
  return 'concurrent';
}

export function createOperationCausality(params: {
  actorId: string;
  deviceId: string;
  sequence: number;
  createdAt: number;
  operationId: string;
  chunkIds: string[];
  baseRevision?: number;
  parents?: WriteChunkSnapshotOperation[];
}): WriteOperationCausality {
  const parents = [...(params.parents ?? [])]
    .sort(compareOperationsByReplayOrder)
    .slice(-3);
  const vectorClock = parents.reduce<OperationVectorClock>((clock, parent) => {
    Object.entries(parent.causality?.vectorClock ?? {}).forEach(([deviceId, value]) => {
      clock[deviceId] = Math.max(clock[deviceId] ?? 0, value);
    });
    return clock;
  }, {});
  vectorClock[params.deviceId] = Math.max(vectorClock[params.deviceId] ?? 0, params.sequence);

  return {
    schemaVersion: 1,
    actorId: params.actorId,
    deviceId: params.deviceId,
    sequence: params.sequence,
    parents: parents.map((parent) => parent.operationId),
    vectorClock,
    chunkIds: sortedUnique(params.chunkIds),
    baseRevision: params.baseRevision,
    createdAt: params.createdAt,
  };
}

export function createOperationConvergenceHash(operation: WriteChunkSnapshotOperation): string {
  return createWriteOperationHash({
    operationId: operation.operationId,
    uid: operation.uid,
    projectId: operation.projectId,
    type: operation.type,
    causality: operation.causality,
    chunkIds: extractOperationChunkIds(operation),
  });
}

export function normalizeOperationCausality(
  operation: WriteChunkSnapshotOperation
): CausalOperation {
  const causality = operation.causality ?? createOperationCausality({
    actorId: operation.uid,
    deviceId: `legacy_${operation.uid}`,
    sequence: operation.sequence,
    createdAt: operation.createdAt,
    operationId: operation.operationId,
    chunkIds: extractOperationChunkIds(operation),
    baseRevision: operation.expectedRevision,
  });
  const normalized = {
    ...operation,
    causality,
    convergenceHash: operation.convergenceHash,
  };
  return {
    ...normalized,
    convergenceHash: normalized.convergenceHash ?? createOperationConvergenceHash(normalized),
  };
}

export function compareOperationsByReplayOrder(
  first: Pick<WriteChunkSnapshotOperation, 'operationId' | 'sequence' | 'createdAt' | 'causality'>,
  second: Pick<WriteChunkSnapshotOperation, 'operationId' | 'sequence' | 'createdAt' | 'causality'>
): number {
  if (first.causality?.parents.includes(second.operationId)) return 1;
  if (second.causality?.parents.includes(first.operationId)) return -1;

  if (first.causality && second.causality) {
    const relation = compareVectorClocks(first.causality.vectorClock, second.causality.vectorClock);
    if (relation === 'before') return -1;
    if (relation === 'after') return 1;
  }

  return (
    comparePrimitive(first.sequence, second.sequence) ||
    comparePrimitive(first.createdAt, second.createdAt) ||
    comparePrimitive(first.operationId, second.operationId)
  );
}

export function buildOperationCausalityGraph(
  operations: WriteChunkSnapshotOperation[]
): OperationCausalityGraph {
  const normalized = operations.map(normalizeOperationCausality);
  const operationIds = new Set(normalized.map((operation) => operation.operationId));
  const chunkIds = new Set<string>();
  let edgeCount = 0;
  let concurrentPairCount = 0;
  let maxVectorClockWidth = 0;

  normalized.forEach((operation, index) => {
    extractOperationChunkIds(operation).forEach((chunkId) => chunkIds.add(chunkId));
    edgeCount += operation.causality.parents.filter((parentId) => operationIds.has(parentId)).length;
    maxVectorClockWidth = Math.max(
      maxVectorClockWidth,
      Object.keys(operation.causality.vectorClock).length
    );

    normalized.slice(index + 1).forEach((nextOperation) => {
      if (
        compareVectorClocks(
          operation.causality.vectorClock,
          nextOperation.causality.vectorClock
        ) === 'concurrent'
      ) {
        concurrentPairCount += 1;
      }
    });
  });

  return {
    operationCount: normalized.length,
    edgeCount,
    chunkCount: chunkIds.size,
    concurrentPairCount,
    maxVectorClockWidth,
  };
}

export function arbitrateChunkConflicts(
  operations: WriteChunkSnapshotOperation[]
): ChunkConflictArbitration[] {
  const operationsByChunk = new Map<string, CausalOperation[]>();
  operations.map(normalizeOperationCausality).forEach((operation) => {
    extractOperationChunkIds(operation).forEach((chunkId) => {
      const existing = operationsByChunk.get(chunkId) ?? [];
      existing.push(operation);
      operationsByChunk.set(chunkId, existing);
    });
  });

  const conflicts: ChunkConflictArbitration[] = [];
  operationsByChunk.forEach((chunkOperations, chunkId) => {
    if (chunkOperations.length < 2) return;

    let conflictRelation: VectorClockRelation | null = null;
    chunkOperations.forEach((operation, index) => {
      chunkOperations.slice(index + 1).forEach((nextOperation) => {
        const nextRelation = compareVectorClocks(
          operation.causality.vectorClock,
          nextOperation.causality.vectorClock
        );
        if (nextRelation === 'concurrent' || nextRelation === 'equal') {
          conflictRelation = nextRelation;
        }
      });
    });

    if (!conflictRelation) return;

    const ordered = [...chunkOperations].sort(compareOperationsByReplayOrder);
    const winner = ordered[ordered.length - 1];
    conflicts.push({
      chunkId,
      operationIds: ordered.map((operation) => operation.operationId),
      winnerOperationId: winner.operationId,
      deferredOperationIds: ordered
        .slice(0, -1)
        .map((operation) => operation.operationId),
      relation: conflictRelation,
      resolution: 'deterministic_order',
    });
  });

  return conflicts.sort((first, second) => comparePrimitive(first.chunkId, second.chunkId));
}

export function createConvergenceCheckpoint(params: {
  uid: string;
  projectId: string;
  operations: WriteChunkSnapshotOperation[];
  createdAt: number;
}): WriteConvergenceCheckpoint {
  const normalized = params.operations
    .map(normalizeOperationCausality)
    .sort(compareOperationsByReplayOrder);
  const operationIds = normalized.map((operation) => operation.operationId);
  const chunkIds = sortedUnique(normalized.flatMap(extractOperationChunkIds));
  const causalityHash = createWriteOperationHash(normalized.map((operation) => ({
    operationId: operation.operationId,
    causality: operation.causality,
    convergenceHash: operation.convergenceHash,
  })));

  return {
    schemaVersion: 1,
    checkpointId: `write_checkpoint_${createWriteOperationHash({
      uid: params.uid,
      projectId: params.projectId,
      operationIds,
      causalityHash,
    })}`,
    uid: params.uid,
    projectId: params.projectId,
    operationIds,
    chunkIds,
    createdAt: params.createdAt,
    causalityHash,
  };
}

export function planDistributedOperationReplay(params: {
  uid: string;
  projectId: string;
  operations: WriteChunkSnapshotOperation[];
  appliedOperationIds?: string[];
  now?: number;
}): DistributedReplayPlan {
  const appliedOperationIds = new Set(params.appliedOperationIds ?? []);
  const duplicateOperationIds: string[] = [];
  const replayableOperations = params.operations
    .map(normalizeOperationCausality)
    .sort(compareOperationsByReplayOrder)
    .filter((operation) => {
      if (appliedOperationIds.has(operation.operationId)) {
        duplicateOperationIds.push(operation.operationId);
        return false;
      }
      appliedOperationIds.add(operation.operationId);
      return true;
    });

  return {
    replayableOperations,
    duplicateOperationIds,
    conflicts: arbitrateChunkConflicts(replayableOperations),
    graph: buildOperationCausalityGraph(replayableOperations),
    checkpoint: createConvergenceCheckpoint({
      uid: params.uid,
      projectId: params.projectId,
      operations: replayableOperations,
      createdAt: params.now ?? Date.now(),
    }),
  };
}
