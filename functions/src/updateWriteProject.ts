import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "./shared/auth";

type WriteStatus = "Idea" | "Draft" | "Revision" | "Final";
type OperationVectorClock = Record<string, number>;

type WriteOperationAckInput = {
  schemaVersion: 1;
  operationId: string;
  type: "chunk_snapshot_save";
  sequence: number;
  createdAt: number;
  updatedAt: number;
  expectedRevision?: number;
  affectedChunkIds?: string[];
  mountedSectionIds?: string[];
  causality: {
    schemaVersion: 1;
    actorId: string;
    deviceId: string;
    sequence: number;
    parents: string[];
    vectorClock: OperationVectorClock;
    chunkIds: string[];
    baseRevision?: number;
    createdAt: number;
  };
  convergenceHash: string;
};

type OperationAckResult = {
  schemaVersion: 1;
  operationId: string;
  status: "acknowledged" | "duplicate";
  acknowledgedRevision: number;
  checkpointId: string;
  acknowledgedAt: string;
  duplicate: boolean;
};

const CHECKPOINT_WINDOW_SIZE = 200;
const MAX_OPERATION_SCOPE_IDS = 256;

function normalizeString(value: unknown, max = 300): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, max);
}

function normalizeContent(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, 2_000_000);
}

function normalizeContentDoc(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const doc = value as Record<string, unknown>;
  if (doc.type !== "doc" || doc.version !== 1 || !Array.isArray(doc.content)) {
    return undefined;
  }
  const serialized = JSON.stringify(doc);
  if (serialized.length > 2_000_000) {
    throw new HttpsError("invalid-argument", "contentDoc exceeds maximum allowed size.");
  }
  return JSON.parse(serialized) as Record<string, unknown>;
}

function normalizeWordCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeStatus(value: unknown): WriteStatus | undefined {
  if (value === "Idea" || value === "Draft" || value === "Revision" || value === "Final") {
    return value;
  }
  return undefined;
}

function normalizeCoverUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString().slice(0, 2048);
  } catch {
    return undefined;
  }
}

function normalizeCursorBlockId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 64);
}

function normalizeCursorOffset(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

function normalizeCursorSavedAt(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized.slice(0, 128);
}

function normalizeManuscriptStorage(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const mode = input.mode === "legacy" || input.mode === "chunked" || input.mode === "hybrid"
    ? input.mode
    : undefined;
  if (!mode) return undefined;

  const output: Record<string, unknown> = {
    version: 1,
    mode,
  };

  if (typeof input.activeSectionId === "string" && input.activeSectionId.trim()) {
    output.activeSectionId = input.activeSectionId.trim().slice(0, 80);
  }
  if (typeof input.latestRevision === "number" && Number.isInteger(input.latestRevision) && input.latestRevision > 0) {
    output.latestRevision = input.latestRevision;
  }
  if (typeof input.latestSnapshotId === "string" && input.latestSnapshotId.trim()) {
    output.latestSnapshotId = input.latestSnapshotId.trim().slice(0, 120);
  }
  if (typeof input.sectionCount === "number" && Number.isInteger(input.sectionCount) && input.sectionCount >= 0) {
    output.sectionCount = input.sectionCount;
  }
  if (typeof input.chunkCount === "number" && Number.isInteger(input.chunkCount) && input.chunkCount >= 0) {
    output.chunkCount = input.chunkCount;
  }
  if (typeof input.contentHash === "string" && input.contentHash.trim()) {
    output.contentHash = input.contentHash.trim().slice(0, 64);
  }
  if (typeof input.migratedAt === "string" && input.migratedAt.trim()) {
    output.migratedAt = input.migratedAt.trim().slice(0, 128);
  }
  if (typeof input.updatedAt === "string" && input.updatedAt.trim()) {
    output.updatedAt = input.updatedAt.trim().slice(0, 128);
  }

  return output;
}

function normalizeIdentifier(value: unknown, max = 128): string | undefined {
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

function normalizeVectorClock(value: unknown): OperationVectorClock {
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
      .map(([key, entry]) => [key.slice(0, 128), entry as number])
  );
}

function createCheckpointId(params: {
  uid: string;
  projectId: string;
  revision: number;
  operationId: string;
}): string {
  return `write_checkpoint_${Buffer.from(
    `${params.uid}:${params.projectId}:${params.revision}:${params.operationId}`
  ).toString("base64url").slice(0, 64)}`;
}

function normalizeOperationAckInput(value: unknown, uid: string): WriteOperationAckInput | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const operationId = normalizeIdentifier(input.operationId);
  if (
    input.schemaVersion !== 1 ||
    input.type !== "chunk_snapshot_save" ||
    !operationId ||
    typeof input.sequence !== "number" ||
    !Number.isInteger(input.sequence) ||
    input.sequence < 0 ||
    typeof input.createdAt !== "number" ||
    !Number.isFinite(input.createdAt) ||
    typeof input.updatedAt !== "number" ||
    !Number.isFinite(input.updatedAt)
  ) {
    return undefined;
  }

  const causalityInput = input.causality && typeof input.causality === "object" && !Array.isArray(input.causality)
    ? input.causality as Record<string, unknown>
    : undefined;
  const actorId = causalityInput ? normalizeIdentifier(causalityInput.actorId) : undefined;
  const deviceId = causalityInput ? normalizeIdentifier(causalityInput.deviceId, 96) : undefined;
  const causality = causalityInput && actorId === uid && deviceId
    ? {
        schemaVersion: 1 as const,
        actorId,
        deviceId,
        sequence: typeof causalityInput.sequence === "number" && Number.isInteger(causalityInput.sequence)
          ? causalityInput.sequence
          : input.sequence,
        parents: normalizeStringList(causalityInput.parents, 16, 128),
        vectorClock: normalizeVectorClock(causalityInput.vectorClock),
        chunkIds: normalizeStringList(causalityInput.chunkIds, MAX_OPERATION_SCOPE_IDS, 120),
        baseRevision: typeof causalityInput.baseRevision === "number" && Number.isInteger(causalityInput.baseRevision)
          ? causalityInput.baseRevision
          : undefined,
        createdAt: typeof causalityInput.createdAt === "number" && Number.isFinite(causalityInput.createdAt)
          ? causalityInput.createdAt
          : input.createdAt,
      }
    : undefined;

  if (!causality) {
    throw new HttpsError("invalid-argument", "Operation causality must be owner-authored and include a valid device.");
  }

  const expectedRevision = typeof input.expectedRevision === "number" && Number.isInteger(input.expectedRevision) && input.expectedRevision > 0
    ? input.expectedRevision
    : undefined;
  const convergenceHash = normalizeIdentifier(input.convergenceHash);
  if (!convergenceHash) {
    throw new HttpsError("invalid-argument", "Operation convergenceHash is required for replay acknowledgement.");
  }

  return {
    schemaVersion: 1,
    operationId,
    type: "chunk_snapshot_save",
    sequence: input.sequence,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    expectedRevision,
    affectedChunkIds: normalizeStringList(input.affectedChunkIds, MAX_OPERATION_SCOPE_IDS, 120),
    mountedSectionIds: normalizeStringList(input.mountedSectionIds, 128, 120),
    causality,
    convergenceHash,
  };
}

function buildOperationAck(params: {
  operationId: string;
  revision: number;
  checkpointId: string;
  acknowledgedAt: string;
  duplicate: boolean;
}): OperationAckResult {
  return {
    schemaVersion: 1,
    operationId: params.operationId,
    status: params.duplicate ? "duplicate" : "acknowledged",
    acknowledgedRevision: params.revision,
    checkpointId: params.checkpointId,
    acknowledgedAt: params.acknowledgedAt,
    duplicate: params.duplicate,
  };
}

/**
 * updateWriteProject
 * Deterministic project update with revision precondition.
 */
export const updateWriteProject = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const { projectId, updates, expectedRevision, operation } = request.data as {
    projectId?: unknown;
    updates?: Record<string, unknown>;
    expectedRevision?: unknown;
    operation?: unknown;
  };

  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }

  if (!updates || typeof updates !== "object") {
    throw new HttpsError("invalid-argument", "A non-empty updates object is required.");
  }

  if (!Number.isInteger(expectedRevision) || Number(expectedRevision) < 1) {
    throw new HttpsError(
      "invalid-argument",
      "expectedRevision must be a positive integer."
    );
  }

  const normalizedUpdates: Record<string, unknown> = {};

  const titleEn = normalizeString(updates.titleEn, 180);
  const titleAr = normalizeString(updates.titleAr, 180);
  const content = normalizeContent(updates.content);
  const contentDoc = normalizeContentDoc(updates.contentDoc);
  const wordCount = normalizeWordCount(updates.wordCount);
  const status = normalizeStatus(updates.status);
  const typeEn = normalizeString(updates.typeEn, 80);
  const typeAr = normalizeString(updates.typeAr, 80);
  const coverUrl = normalizeCoverUrl(updates.coverUrl);
  const lastCursorBlockId = normalizeCursorBlockId(updates.lastCursorBlockId);
  const lastCursorOffset = normalizeCursorOffset(updates.lastCursorOffset);
  const lastCursorSavedAt = normalizeCursorSavedAt(updates.lastCursorSavedAt);
  const activeSectionId = normalizeString(updates.activeSectionId, 80);
  const manuscriptStorage = normalizeManuscriptStorage(updates.manuscriptStorage);

  if (titleEn !== undefined) {
    normalizedUpdates.titleEn = titleEn;
    normalizedUpdates.title = titleEn;
  }
  if (titleAr !== undefined) normalizedUpdates.titleAr = titleAr;
  if (content !== undefined) normalizedUpdates.content = content;
  if (contentDoc !== undefined) normalizedUpdates.contentDoc = contentDoc;
  if (wordCount !== undefined) normalizedUpdates.wordCount = wordCount;
  if (status !== undefined) normalizedUpdates.status = status;
  if (typeEn !== undefined) normalizedUpdates.typeEn = typeEn;
  if (typeAr !== undefined) normalizedUpdates.typeAr = typeAr;
  if (coverUrl !== undefined) normalizedUpdates.coverUrl = coverUrl;
  if (lastCursorBlockId !== undefined) normalizedUpdates.lastCursorBlockId = lastCursorBlockId;
  if (lastCursorOffset !== undefined) normalizedUpdates.lastCursorOffset = lastCursorOffset;
  if (lastCursorSavedAt !== undefined) normalizedUpdates.lastCursorSavedAt = lastCursorSavedAt;
  if (activeSectionId !== undefined) normalizedUpdates.activeSectionId = activeSectionId;
  if (manuscriptStorage !== undefined) normalizedUpdates.manuscriptStorage = manuscriptStorage;

  if (Object.keys(normalizedUpdates).length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "No writable fields were provided in updates."
    );
  }

  const db = admin.firestore();
  const normalizedProjectId = projectId.trim();
  const operationAckInput = normalizeOperationAckInput(operation, uid);
  if (operation !== undefined && !operationAckInput) {
    throw new HttpsError("invalid-argument", "Invalid operation acknowledgement metadata.");
  }
  const projectRef = db.collection("users").doc(uid).collection("projects").doc(normalizedProjectId);
  const checkpointRef = projectRef.collection("operationCheckpoints").doc("latest");
  const ledgerRef = operationAckInput
    ? projectRef.collection("operationLedger").doc(operationAckInput.operationId)
    : null;
  const now = admin.firestore.Timestamp.now();
  const nowIso = now.toDate().toISOString();

  try {
    const transactionResult = await db.runTransaction(async (tx) => {
      if (operationAckInput && ledgerRef) {
        const ledgerSnap = await tx.get(ledgerRef);
        if (ledgerSnap.exists) {
          const ledger = ledgerSnap.data() as Record<string, unknown>;
          if (
            typeof ledger.convergenceHash === "string" &&
            ledger.convergenceHash !== operationAckInput.convergenceHash
          ) {
            throw new HttpsError(
              "already-exists",
              "Operation id was already acknowledged with different convergence metadata."
            );
          }
          const acknowledgedRevision = typeof ledger.acknowledgedRevision === "number" && Number.isInteger(ledger.acknowledgedRevision)
            ? ledger.acknowledgedRevision
            : undefined;
          const checkpointId = typeof ledger.checkpointId === "string" && ledger.checkpointId
            ? ledger.checkpointId
            : createCheckpointId({
                uid,
                projectId: normalizedProjectId,
                revision: acknowledgedRevision ?? Number(expectedRevision),
                operationId: operationAckInput.operationId,
              });
          if (!acknowledgedRevision) {
            throw new HttpsError("failed-precondition", "Operation ledger entry is missing acknowledgement state.");
          }
          return {
            revision: acknowledgedRevision,
            operationAck: buildOperationAck({
              operationId: operationAckInput.operationId,
              revision: acknowledgedRevision,
              checkpointId,
              acknowledgedAt: typeof ledger.acknowledgedAt === "string" ? ledger.acknowledgedAt : nowIso,
              duplicate: true,
            }),
          };
        }
      }

      const snap = await tx.get(projectRef);
      if (!snap.exists) {
        throw new HttpsError("not-found", "Project was not found.");
      }

      const data = snap.data() as Record<string, unknown>;
      const currentRevision =
        typeof data.revision === "number" && Number.isInteger(data.revision)
          ? data.revision
          : 1;

      if (currentRevision !== expectedRevision) {
        throw new HttpsError(
          "failed-precondition",
          `Revision mismatch. Expected ${expectedRevision}, found ${currentRevision}.`
        );
      }

      const revision = currentRevision + 1;
      const checkpointSnap = operationAckInput ? await tx.get(checkpointRef) : null;
      const checkpoint = checkpointSnap?.exists ? checkpointSnap.data() as Record<string, unknown> : {};
      tx.update(projectRef, {
        ...normalizedUpdates,
        revision,
        updatedAt: now,
      });

      let operationAck: OperationAckResult | undefined;
      if (operationAckInput && ledgerRef) {
        const previousOperationIds = normalizeStringList(
          checkpoint.operationIds,
          CHECKPOINT_WINDOW_SIZE,
          128
        );
        const nextOperationIds = [...previousOperationIds, operationAckInput.operationId]
          .filter((value, index, values) => values.indexOf(value) === index)
          .slice(-CHECKPOINT_WINDOW_SIZE);
        const scopedChunkIds = normalizeStringList([
          ...(operationAckInput.affectedChunkIds ?? []),
          ...(operationAckInput.causality?.chunkIds ?? []),
        ], MAX_OPERATION_SCOPE_IDS, 120);
        const checkpointId = createCheckpointId({
          uid,
          projectId: normalizedProjectId,
          revision,
          operationId: operationAckInput.operationId,
        });

        tx.set(ledgerRef, {
          schemaVersion: 1,
          projectId: normalizedProjectId,
          ownerUid: uid,
          operationId: operationAckInput.operationId,
          type: operationAckInput.type,
          status: "acknowledged",
          actorId: operationAckInput.causality.actorId,
          deviceId: operationAckInput.causality.deviceId,
          sequence: operationAckInput.sequence,
          expectedRevision: operationAckInput.expectedRevision ?? null,
          acknowledgedRevision: revision,
          checkpointId,
          convergenceHash: operationAckInput.convergenceHash,
          causality: operationAckInput.causality,
          affectedChunkIds: operationAckInput.affectedChunkIds ?? [],
          mountedSectionIds: operationAckInput.mountedSectionIds ?? [],
          chunkIds: scopedChunkIds,
          createdAt: now,
          updatedAt: now,
          acknowledgedAt: nowIso,
          retentionTier: "hot",
        });

        tx.set(checkpointRef, {
          schemaVersion: 1,
          projectId: normalizedProjectId,
          ownerUid: uid,
          checkpointId,
          latestOperationId: operationAckInput.operationId,
          latestRevision: revision,
          operationIds: nextOperationIds,
          operationCount: nextOperationIds.length,
          chunkIds: scopedChunkIds,
          checkpointWindowSize: CHECKPOINT_WINDOW_SIZE,
          updatedAt: now,
        }, { merge: true });

        operationAck = buildOperationAck({
          operationId: operationAckInput.operationId,
          revision,
          checkpointId,
          acknowledgedAt: nowIso,
          duplicate: false,
        });
      }

      return { revision, operationAck };
    });

    return {
      projectId: normalizedProjectId,
      revision: transactionResult.revision,
      updatedAt: nowIso,
      ...(transactionResult.operationAck ? { operationAck: transactionResult.operationAck } : {}),
    };
  } catch (error) {
    logger.error("[WRITE][UPDATE_FAILED]", { uid, projectId, error });
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to update project.");
  }
});
