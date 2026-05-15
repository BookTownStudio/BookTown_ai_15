import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "./shared/auth";

const MAX_REPLAY_WINDOW = 80;
const MAX_CURSOR_OPERATION_IDS = 240;

type ReplayCursorAction = "recover" | "advance";

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

function normalizeId(value: unknown, max = 128): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "A valid identifier is required.");
  }
  const normalized = value.trim();
  if (!normalized || normalized.includes("/")) {
    throw new HttpsError("invalid-argument", "A valid identifier is required.");
  }
  return normalized.slice(0, max);
}

function normalizeAction(value: unknown): ReplayCursorAction {
  if (value === "recover" || value === "advance") return value;
  throw new HttpsError("invalid-argument", "A valid replay cursor action is required.");
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return MAX_REPLAY_WINDOW;
  }
  return Math.min(value, MAX_REPLAY_WINDOW);
}

function normalizeOperationIds(value: unknown, maxItems = MAX_REPLAY_WINDOW): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0 && !entry.includes("/"))
    .map((entry) => entry.trim().slice(0, 128))))
    .slice(0, maxItems);
}

function readPositiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new HttpsError("invalid-argument", "A valid coordinator sequence is required.");
  }
  return value;
}

function normalizeCursorData(params: {
  uid: string;
  projectId: string;
  deviceId: string;
  data?: FirebaseFirestore.DocumentData;
}) {
  const data = params.data ?? {};
  return {
    schemaVersion: 1,
    projectId: params.projectId,
    ownerUid: params.uid,
    deviceId: params.deviceId,
    lastCoordinatorSequence: typeof data.lastCoordinatorSequence === "number" && Number.isInteger(data.lastCoordinatorSequence)
      ? Math.max(0, data.lastCoordinatorSequence)
      : 0,
    lastOperationId: typeof data.lastOperationId === "string" ? data.lastOperationId : undefined,
    operationIds: Array.isArray(data.operationIds)
      ? normalizeOperationIds(data.operationIds, MAX_CURSOR_OPERATION_IDS).slice(-MAX_CURSOR_OPERATION_IDS)
      : [],
    checkpointId: typeof data.checkpointId === "string" ? data.checkpointId : undefined,
    checkpointHash: typeof data.checkpointHash === "string" ? data.checkpointHash : undefined,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
  };
}

function latestCoordinatorSequence(stateSnap: FirebaseFirestore.DocumentSnapshot): number {
  const value = stateSnap.exists ? stateSnap.get("latestCoordinatorSequence") : 0;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function mapOperationRecords(
  snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
): Record<string, unknown>[] {
  return snap.docs.map((entry) => {
    const record = entry.data() as Record<string, unknown>;
    const operation = record.operation && typeof record.operation === "object" && !Array.isArray(record.operation)
      ? record.operation as Record<string, unknown>
      : {};
    return {
      ...record,
      operation: {
        ...operation,
        attempts: typeof operation.attempts === "number" && Number.isInteger(operation.attempts)
          ? operation.attempts
          : 0,
      },
    };
  });
}

export const syncWriteCollaborationReplayCursor = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const data = request.data as Record<string, unknown>;
  const projectId = normalizeId(data.projectId, 120);
  const deviceId = normalizeId(data.deviceId, 96);
  const action = normalizeAction(data.action);
  const limit = normalizeLimit(data.limit);
  const db = admin.firestore();
  const projectRef = db.collection("users").doc(uid).collection("projects").doc(projectId);
  const stateRef = projectRef.collection("collaborationCoordinator").doc("stream");
  const cursorRef = projectRef.collection("collaborationReplayCursors").doc(deviceId);
  const operationsRef = projectRef.collection("collaborationOperations");

  if (action === "recover") {
    const startedAt = Date.now();
    const [projectSnap, stateSnap, cursorSnap] = await Promise.all([
      projectRef.get(),
      stateRef.get(),
      cursorRef.get(),
    ]);
    if (!projectSnap.exists) {
      throw new HttpsError("not-found", "Project was not found.");
    }

    const cursor = normalizeCursorData({
      uid,
      projectId,
      deviceId,
      data: cursorSnap.exists ? cursorSnap.data() : undefined,
    });
    const latestSequence = latestCoordinatorSequence(stateSnap);
    const operationsSnap = await operationsRef
      .where("coordinatorSequence", ">", cursor.lastCoordinatorSequence)
      .orderBy("coordinatorSequence", "asc")
      .limit(limit)
      .get();
    const records = mapOperationRecords(operationsSnap);
    const firstSequence = records.length > 0 && typeof records[0].coordinatorSequence === "number"
      ? records[0].coordinatorSequence as number
      : undefined;
    const lastSequence = records.length > 0 && typeof records[records.length - 1].coordinatorSequence === "number"
      ? records[records.length - 1].coordinatorSequence as number
      : cursor.lastCoordinatorSequence;
    const windowGap = latestSequence > cursor.lastCoordinatorSequence && (
      records.length === 0 ||
      (typeof firstSequence === "number" && firstSequence > cursor.lastCoordinatorSequence + 1)
    );

    logger.info("[WRITE][COLLABORATION_REPLAY_WINDOW_RECOVERED]", {
      uid,
      projectId,
      deviceId,
      recordCount: records.length,
      fromSequence: cursor.lastCoordinatorSequence,
      lastSequence,
      latestSequence,
      windowGap,
      durationMs: Date.now() - startedAt,
    });

    return {
      cursor,
      records,
      latestCoordinatorSequence: latestSequence,
      hasMore: lastSequence < latestSequence,
      windowGap,
      advanced: false,
      duplicate: false,
    };
  }

  const upToCoordinatorSequence = readPositiveInteger(data.upToCoordinatorSequence);
  const requestedOperationIds = normalizeOperationIds(data.operationIds);
  const now = Date.now();
  const startedAt = now;

  try {
    const result = await db.runTransaction(async (tx) => {
      const [projectSnap, stateSnap, cursorSnap] = await Promise.all([
        tx.get(projectRef),
        tx.get(stateRef),
        tx.get(cursorRef),
      ]);
      if (!projectSnap.exists) {
        throw new HttpsError("not-found", "Project was not found.");
      }

      const latestSequence = latestCoordinatorSequence(stateSnap);
      if (upToCoordinatorSequence > latestSequence) {
        throw new HttpsError("failed-precondition", "Replay cursor cannot advance past the coordinator stream.");
      }

      const previousCursor = normalizeCursorData({
        uid,
        projectId,
        deviceId,
        data: cursorSnap.exists ? cursorSnap.data() : undefined,
      });
      if (upToCoordinatorSequence <= previousCursor.lastCoordinatorSequence) {
        return {
          cursor: previousCursor,
          latestCoordinatorSequence: latestSequence,
          advanced: false,
          duplicate: true,
        };
      }

      const operationsSnap = await tx.get(
        operationsRef
          .where("coordinatorSequence", ">", previousCursor.lastCoordinatorSequence)
          .where("coordinatorSequence", "<=", upToCoordinatorSequence)
          .orderBy("coordinatorSequence", "asc")
          .limit(MAX_REPLAY_WINDOW + 1)
      );
      if (operationsSnap.size > MAX_REPLAY_WINDOW) {
        throw new HttpsError("failed-precondition", "Replay cursor advance exceeds the bounded replay window.");
      }
      const records = operationsSnap.docs.map((entry) => entry.data() as Record<string, unknown>);
      if (records.length === 0) {
        throw new HttpsError("failed-precondition", "Replay cursor advance has no coordinator records.");
      }
      const firstSequence = records[0].coordinatorSequence;
      const lastRecord = records[records.length - 1];
      const lastSequence = lastRecord.coordinatorSequence;
      if (
        typeof firstSequence !== "number" ||
        typeof lastSequence !== "number" ||
        firstSequence > previousCursor.lastCoordinatorSequence + 1 ||
        lastSequence !== upToCoordinatorSequence
      ) {
        throw new HttpsError("failed-precondition", "Replay cursor advance detected a corrupted replay window.");
      }

      const recordOperationIds = records
        .map((entry) => typeof entry.operationId === "string" ? entry.operationId : "")
        .filter(Boolean);
      const requestedSet = new Set(requestedOperationIds);
      const unknownRequestedIds = requestedOperationIds.filter((operationId) => !recordOperationIds.includes(operationId));
      if (unknownRequestedIds.length > 0) {
        throw new HttpsError("failed-precondition", "Replay cursor advance references operations outside the coordinator window.");
      }

      const mergedOperationIds = Array.from(new Set([
        ...previousCursor.operationIds,
        ...recordOperationIds.filter((operationId) => requestedSet.size === 0 || requestedSet.has(operationId)),
      ])).slice(-MAX_CURSOR_OPERATION_IDS);
      const checkpointHash = createHash({
        uid,
        projectId,
        deviceId,
        lastCoordinatorSequence: upToCoordinatorSequence,
        operationIds: mergedOperationIds,
      });
      const checkpointId = `collab_replay_${checkpointHash}`;
      const cursor = {
        schemaVersion: 1,
        projectId,
        ownerUid: uid,
        deviceId,
        lastCoordinatorSequence: upToCoordinatorSequence,
        lastOperationId: typeof lastRecord.operationId === "string" ? lastRecord.operationId : undefined,
        operationIds: mergedOperationIds,
        checkpointId,
        checkpointHash,
        updatedAt: now,
        createdAt: previousCursor.createdAt || now,
      };
      const checkpoint = {
        ...cursor,
        checkpointCreatedAt: now,
        replayWindowOperationIds: recordOperationIds,
        requestedOperationIds,
      };

      tx.set(cursorRef, cursor, { merge: true });
      tx.set(projectRef.collection("collaborationReplayCheckpoints").doc(checkpointId), checkpoint);
      return {
        cursor,
        latestCoordinatorSequence: latestSequence,
        advanced: true,
        duplicate: false,
      };
    });

    logger.info("[WRITE][COLLABORATION_REPLAY_CURSOR_ADVANCED]", {
      uid,
      projectId,
      deviceId,
      lastCoordinatorSequence: result.cursor.lastCoordinatorSequence,
      advanced: result.advanced,
      duplicate: result.duplicate,
      durationMs: Date.now() - startedAt,
    });

    return {
      ...result,
      records: [],
      hasMore: result.cursor.lastCoordinatorSequence < result.latestCoordinatorSequence,
      windowGap: false,
    };
  } catch (error) {
    logger.error("[WRITE][COLLABORATION_REPLAY_CURSOR_REJECTED]", {
      uid,
      projectId,
      deviceId,
      upToCoordinatorSequence,
      error,
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to synchronize collaboration replay cursor.");
  }
});
