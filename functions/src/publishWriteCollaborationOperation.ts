import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "./shared/auth";

type WriteOperationCausality = {
  schemaVersion: 1;
  actorId: string;
  deviceId: string;
  sequence: number;
  parents: string[];
  vectorClock: Record<string, number>;
  chunkIds: string[];
  baseRevision?: number;
  createdAt: number;
};

type CollaborationOperation = {
  schemaVersion: 1;
  operationId: string;
  uid: string;
  projectId: string;
  type: "chunk_snapshot_save";
  status: string;
  sequence: number;
  createdAt: number;
  updatedAt: number;
  expectedRevision?: number;
  affectedChunkIds?: string[];
  mountedSectionIds?: string[];
  causality: WriteOperationCausality;
  convergenceHash?: string;
  conflictState?: "none" | "observed" | "resolved";
  conflictOperationIds?: string[];
  convergenceCheckpointId?: string;
  attempts: number;
  lastError?: string;
  appliedAt?: number;
  snapshot: Record<string, unknown>;
  serverRevision?: number;
};

const MAX_REMOTE_OPERATION_BYTES = 300_000;
const MAX_OPERATION_SCOPE_IDS = 256;
const MAX_MOUNTED_SECTION_IDS = 128;
const COORDINATOR_WINDOW_SIZE = 200;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function createHash(value: unknown): string {
  const source = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function byteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function normalizeId(value: unknown, max = 128): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.includes("/")) return undefined;
  return normalized.slice(0, max);
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, maxLength))))
    .slice(0, maxItems);
}

function normalizeVectorClock(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => (
        typeof key === "string" &&
        key.trim().length > 0 &&
        typeof entry === "number" &&
        Number.isInteger(entry) &&
        entry >= 0
      ))
      .slice(0, 64)
      .map(([key, entry]) => [key.slice(0, 96), entry as number])
  );
}

function normalizeContentDoc(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "operation.snapshot.contentDoc is required.");
  }
  const doc = value as Record<string, unknown>;
  if (doc.type !== "doc" || doc.version !== 1 || !Array.isArray(doc.content)) {
    throw new HttpsError("invalid-argument", "operation.snapshot.contentDoc must be a versioned doc.");
  }
  const serialized = JSON.stringify(doc);
  if (serialized.length > 2_000_000) {
    throw new HttpsError("invalid-argument", "operation.snapshot.contentDoc exceeds maximum allowed size.");
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

function normalizeOperation(value: unknown, uid: string, projectId: string): CollaborationOperation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "A valid collaboration operation is required.");
  }
  const input = value as Record<string, unknown>;
  const operationId = normalizeId(input.operationId);
  const causalityInput = input.causality && typeof input.causality === "object" && !Array.isArray(input.causality)
    ? input.causality as Record<string, unknown>
    : undefined;
  const actorId = normalizeId(causalityInput?.actorId);
  const deviceId = normalizeId(causalityInput?.deviceId, 96);
  const snapshot = input.snapshot && typeof input.snapshot === "object" && !Array.isArray(input.snapshot)
    ? input.snapshot as Record<string, unknown>
    : undefined;

  if (
    input.schemaVersion !== 1 ||
    input.type !== "chunk_snapshot_save" ||
    !operationId ||
    input.uid !== uid ||
    input.projectId !== projectId ||
    input.status !== "applied" ||
    typeof input.sequence !== "number" ||
    !Number.isInteger(input.sequence) ||
    input.sequence < 0 ||
    typeof input.createdAt !== "number" ||
    !Number.isFinite(input.createdAt) ||
    typeof input.updatedAt !== "number" ||
    !Number.isFinite(input.updatedAt) ||
    typeof input.attempts !== "number" ||
    !Number.isInteger(input.attempts) ||
    input.attempts < 0 ||
    !snapshot ||
    !actorId ||
    actorId !== uid ||
    !deviceId
  ) {
    throw new HttpsError("invalid-argument", "Invalid collaboration operation metadata.");
  }

  const contentDoc = normalizeContentDoc(snapshot.contentDoc);
  const causality: WriteOperationCausality = {
    schemaVersion: 1,
    actorId,
    deviceId,
    sequence: typeof causalityInput?.sequence === "number" && Number.isInteger(causalityInput.sequence)
      ? causalityInput.sequence
      : input.sequence,
    parents: normalizeStringList(causalityInput?.parents, 16, 128),
    vectorClock: normalizeVectorClock(causalityInput?.vectorClock),
    chunkIds: normalizeStringList(causalityInput?.chunkIds, MAX_OPERATION_SCOPE_IDS, 120),
    baseRevision: typeof causalityInput?.baseRevision === "number" && Number.isInteger(causalityInput.baseRevision)
      ? causalityInput.baseRevision
      : undefined,
    createdAt: typeof causalityInput?.createdAt === "number" && Number.isFinite(causalityInput.createdAt)
      ? causalityInput.createdAt
      : input.createdAt,
  };

  return {
    schemaVersion: 1,
    operationId,
    uid,
    projectId,
    type: "chunk_snapshot_save",
    status: "applied",
    sequence: input.sequence,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    expectedRevision: typeof input.expectedRevision === "number" && Number.isInteger(input.expectedRevision)
      ? input.expectedRevision
      : undefined,
    affectedChunkIds: normalizeStringList(input.affectedChunkIds, MAX_OPERATION_SCOPE_IDS, 120),
    mountedSectionIds: normalizeStringList(input.mountedSectionIds, MAX_MOUNTED_SECTION_IDS, 120),
    causality,
    convergenceHash: normalizeId(input.convergenceHash),
    conflictState: input.conflictState === "observed" || input.conflictState === "resolved"
      ? input.conflictState
      : input.conflictState === "none"
        ? "none"
        : undefined,
    conflictOperationIds: normalizeStringList(input.conflictOperationIds, 32, 128),
    convergenceCheckpointId: normalizeId(input.convergenceCheckpointId),
    attempts: input.attempts,
    lastError: typeof input.lastError === "string" ? input.lastError.slice(0, 512) : undefined,
    appliedAt: typeof input.appliedAt === "number" && Number.isFinite(input.appliedAt)
      ? input.appliedAt
      : undefined,
    snapshot: {
      ...snapshot,
      contentDoc,
    },
    serverRevision: typeof input.serverRevision === "number" && Number.isInteger(input.serverRevision)
      ? input.serverRevision
      : undefined,
  };
}

function extractOperationChunkIds(operation: CollaborationOperation): string[] {
  return Array.from(new Set([
    ...(operation.causality.chunkIds ?? []),
    ...(operation.affectedChunkIds ?? []),
    ...(
      Array.isArray((operation.snapshot as { affectedChunkIds?: unknown }).affectedChunkIds)
        ? normalizeStringList((operation.snapshot as { affectedChunkIds?: unknown }).affectedChunkIds, MAX_OPERATION_SCOPE_IDS, 120)
        : []
    ),
  ].filter(Boolean))).sort();
}

function createOperationConvergenceHash(operation: CollaborationOperation): string {
  return createHash({
    operationId: operation.operationId,
    uid: operation.uid,
    projectId: operation.projectId,
    type: operation.type,
    causality: operation.causality,
    chunkIds: extractOperationChunkIds(operation),
  });
}

function normalizeLedgerHash(value: FirebaseFirestore.DocumentSnapshot): string | undefined {
  const hash = value.exists ? value.get("convergenceHash") : undefined;
  return typeof hash === "string" && hash ? hash : undefined;
}

function normalizeOperationRecordForResponse(value: Record<string, unknown>): Record<string, unknown> {
  const operation = value.operation && typeof value.operation === "object" && !Array.isArray(value.operation)
    ? value.operation as Record<string, unknown>
    : {};
  return {
    ...value,
    operation: {
      ...operation,
      attempts: typeof operation.attempts === "number" && Number.isInteger(operation.attempts)
        ? operation.attempts
        : 0,
    },
  };
}

export const publishWriteCollaborationOperation = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const data = request.data as Record<string, unknown>;
  const projectId = normalizeId(data.projectId, 120);
  if (!projectId) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }

  const operation = normalizeOperation(data.operation, uid, projectId);
  const convergenceHash = operation.convergenceHash ?? createOperationConvergenceHash(operation);
  const expectedHash = createOperationConvergenceHash({ ...operation, convergenceHash });
  if (convergenceHash !== expectedHash) {
    throw new HttpsError("invalid-argument", "Collaboration operation convergence hash is invalid.");
  }

  const payloadBytes = byteLength(operation);
  if (!Number.isFinite(payloadBytes) || payloadBytes <= 0 || payloadBytes > MAX_REMOTE_OPERATION_BYTES) {
    throw new HttpsError("invalid-argument", "Collaboration operation payload exceeds bounded transport limits.");
  }

  const db = admin.firestore();
  const projectRef = db.collection("users").doc(uid).collection("projects").doc(projectId);
  const operationRef = projectRef.collection("collaborationOperations").doc(operation.operationId);
  const stateRef = projectRef.collection("collaborationCoordinator").doc("stream");
  const operationLedgerRef = projectRef.collection("operationLedger").doc(operation.operationId);
  const chunkMutationLedgerRef = projectRef.collection("chunkMutationLedger").doc(operation.operationId);
  const now = admin.firestore.Timestamp.now();

  try {
    const result = await db.runTransaction(async (tx) => {
      const [projectSnap, existingOperationSnap, stateSnap, operationLedgerSnap, chunkMutationLedgerSnap] = await Promise.all([
        tx.get(projectRef),
        tx.get(operationRef),
        tx.get(stateRef),
        tx.get(operationLedgerRef),
        tx.get(chunkMutationLedgerRef),
      ]);
      if (!projectSnap.exists) {
        throw new HttpsError("not-found", "Project was not found.");
      }

      if (existingOperationSnap.exists) {
        const existingHash = normalizeLedgerHash(existingOperationSnap);
        if (existingHash && existingHash !== convergenceHash) {
          throw new HttpsError("already-exists", "Collaboration operation id already exists with different convergence metadata.");
        }
        return {
          record: normalizeOperationRecordForResponse(existingOperationSnap.data() as Record<string, unknown>),
          duplicate: true,
        };
      }

      const operationLedgerHash = normalizeLedgerHash(operationLedgerSnap);
      const chunkMutationLedgerHash = normalizeLedgerHash(chunkMutationLedgerSnap);
      if (operationLedgerHash !== convergenceHash || chunkMutationLedgerHash !== convergenceHash) {
        throw new HttpsError(
          "failed-precondition",
          "Collaboration operation must reference acknowledged project and chunk mutation ledgers."
        );
      }

      const latestSequence = typeof stateSnap.get("latestCoordinatorSequence") === "number"
        ? stateSnap.get("latestCoordinatorSequence") as number
        : 0;
      const coordinatorSequence = latestSequence + 1;
      const previousOperationIds = normalizeStringList(
        stateSnap.exists ? stateSnap.get("operationIds") : [],
        COORDINATOR_WINDOW_SIZE,
        128
      );
      const operationIds = [...previousOperationIds, operation.operationId]
        .filter((value, index, values) => values.indexOf(value) === index)
        .slice(-COORDINATOR_WINDOW_SIZE);
      const record = {
        schemaVersion: 1,
        projectId,
        ownerUid: uid,
        operationId: operation.operationId,
        actorId: operation.causality.actorId,
        deviceId: operation.causality.deviceId,
        createdAt: Date.now(),
        coordinatorSequence,
        payloadBytes,
        operation: {
          ...operation,
          convergenceHash,
        },
        causality: operation.causality,
        convergenceHash,
        validation: {
          schemaVersion: 1,
          validatedAt: now,
          operationLedgerValidated: true,
          chunkMutationLedgerValidated: true,
          chunkIds: extractOperationChunkIds(operation),
        },
      };

      tx.set(operationRef, record);
      tx.set(stateRef, {
        schemaVersion: 1,
        projectId,
        ownerUid: uid,
        latestCoordinatorSequence: coordinatorSequence,
        latestOperationId: operation.operationId,
        operationIds,
        operationCount: operationIds.length,
        updatedAt: now,
      }, { merge: true });

      return { record, duplicate: false };
    });

    logger.info("[WRITE][COLLABORATION_OPERATION_PUBLISHED]", {
      uid,
      projectId,
      operationId: operation.operationId,
      duplicate: result.duplicate,
      coordinatorSequence: result.record.coordinatorSequence,
    });
    return {
      record: result.record,
      duplicate: result.duplicate,
    };
  } catch (error) {
    logger.error("[WRITE][COLLABORATION_OPERATION_REJECTED]", {
      uid,
      projectId,
      operationId: operation.operationId,
      error,
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to publish collaboration operation.");
  }
});
