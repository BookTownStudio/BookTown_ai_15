import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "./shared/auth";

const PRESENCE_TTL_MS = 30_000;
const MIN_CURSOR_UPDATE_INTERVAL_MS = 750;
const MIN_IDENTICAL_UPDATE_INTERVAL_MS = 5_000;
const MAX_SELECTION_POSITION = 10_000_000;
const MAX_MOUNTED_SECTION_IDS = 128;
const MAX_CLEANUP_DOCS = 40;

type PresenceAction = "publish" | "remove";

type PresenceRecord = {
  schemaVersion: 1;
  projectId: string;
  ownerUid: string;
  actorId: string;
  deviceId: string;
  displayName?: string;
  updatedAt: number;
  expiresAt: number;
  status: "active" | "idle";
  selectionFrom?: number;
  selectionTo?: number;
  cursorBlockId?: string;
  cursorOffset?: number;
  anchorId?: string;
  chunkId?: string;
  sectionId?: string;
  mountedSectionIds?: string[];
  presenceSequence: number;
  validation: {
    schemaVersion: 1;
    validatedAt: number;
    coordinatorValidated: true;
    throttled: boolean;
  };
};

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

function normalizeOptionalId(value: unknown, max = 128): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.includes("/")) return undefined;
  return normalized.slice(0, max);
}

function normalizeAction(value: unknown): PresenceAction {
  if (value === "publish" || value === "remove") return value;
  throw new HttpsError("invalid-argument", "A valid presence action is required.");
}

function normalizeOptionalPosition(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_SELECTION_POSITION) {
    throw new HttpsError("invalid-argument", "Presence cursor position is out of bounds.");
  }
  return value;
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0 && !entry.includes("/"))
    .map((entry) => entry.trim().slice(0, maxLength))))
    .slice(0, maxItems);
}

function normalizePresencePayload(value: unknown, uid: string, projectId: string, deviceId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "A valid presence payload is required.");
  }
  const input = value as Record<string, unknown>;
  if (
    input.schemaVersion !== 1 ||
    input.projectId !== projectId ||
    input.ownerUid !== uid ||
    input.actorId !== uid ||
    input.deviceId !== deviceId ||
    (input.status !== "active" && input.status !== "idle")
  ) {
    throw new HttpsError("invalid-argument", "Invalid presence identity metadata.");
  }

  const selectionFrom = normalizeOptionalPosition(input.selectionFrom);
  const selectionTo = normalizeOptionalPosition(input.selectionTo);
  if (selectionFrom !== undefined && selectionTo !== undefined && selectionTo < selectionFrom) {
    throw new HttpsError("invalid-argument", "Presence selection range is invalid.");
  }

  return {
    displayName: typeof input.displayName === "string" ? input.displayName.trim().slice(0, 80) : undefined,
    status: input.status as "active" | "idle",
    selectionFrom,
    selectionTo,
    cursorBlockId: normalizeOptionalId(input.cursorBlockId, 128),
    cursorOffset: normalizeOptionalPosition(input.cursorOffset),
    anchorId: normalizeOptionalId(input.anchorId, 128),
    chunkId: normalizeOptionalId(input.chunkId, 120),
    sectionId: normalizeOptionalId(input.sectionId, 120),
    mountedSectionIds: normalizeStringList(input.mountedSectionIds, MAX_MOUNTED_SECTION_IDS, 120),
  };
}

function createPresenceSignature(value: ReturnType<typeof normalizePresencePayload>): string {
  return createHash({
    displayName: value.displayName,
    status: value.status,
    selectionFrom: value.selectionFrom,
    selectionTo: value.selectionTo,
    cursorBlockId: value.cursorBlockId,
    cursorOffset: value.cursorOffset,
    anchorId: value.anchorId,
    chunkId: value.chunkId,
    sectionId: value.sectionId,
    mountedSectionIds: value.mountedSectionIds,
  });
}

async function pruneExpiredPresence(params: {
  projectRef: FirebaseFirestore.DocumentReference;
  now: number;
}): Promise<number> {
  const snap = await params.projectRef
    .collection("collaborationPresence")
    .where("expiresAt", "<=", params.now)
    .limit(MAX_CLEANUP_DOCS)
    .get();
  if (snap.empty) return 0;
  const batch = admin.firestore().batch();
  snap.docs.forEach((entry) => batch.delete(entry.ref));
  await batch.commit();
  return snap.size;
}

export const syncWriteCollaborationPresence = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const data = request.data as Record<string, unknown>;
  const action = normalizeAction(data.action);
  const projectId = normalizeId(data.projectId, 120);
  const deviceId = normalizeId(data.deviceId, 96);
  const presenceId = createHash({ actorId: uid, deviceId });
  const db = admin.firestore();
  const projectRef = db.collection("users").doc(uid).collection("projects").doc(projectId);
  const presenceRef = projectRef.collection("collaborationPresence").doc(presenceId);
  const authorityRef = projectRef.collection("collaborationPresenceAuthority").doc(deviceId);
  const now = Date.now();
  const startedAt = now;

  if (action === "remove") {
    const result = await db.runTransaction(async (tx) => {
      const projectSnap = await tx.get(projectRef);
      if (!projectSnap.exists) {
        throw new HttpsError("not-found", "Project was not found.");
      }
      tx.delete(presenceRef);
      tx.set(authorityRef, {
        schemaVersion: 1,
        projectId,
        ownerUid: uid,
        deviceId,
        removedAt: now,
        updatedAt: now,
      }, { merge: true });
      return { removed: true };
    });

    logger.info("[WRITE][COLLABORATION_PRESENCE_REMOVED]", {
      uid,
      projectId,
      deviceId,
      durationMs: Date.now() - startedAt,
    });
    return {
      ...result,
      record: undefined,
      throttled: false,
      cleanupCount: 0,
    };
  }

  const payload = normalizePresencePayload(data.presence, uid, projectId, deviceId);
  const signature = createPresenceSignature(payload);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [projectSnap, authoritySnap, existingPresenceSnap] = await Promise.all([
        tx.get(projectRef),
        tx.get(authorityRef),
        tx.get(presenceRef),
      ]);
      if (!projectSnap.exists) {
        throw new HttpsError("not-found", "Project was not found.");
      }

      const lastPublishedAt = authoritySnap.exists && typeof authoritySnap.get("lastPublishedAt") === "number"
        ? authoritySnap.get("lastPublishedAt") as number
        : 0;
      const lastSignature = authoritySnap.exists && typeof authoritySnap.get("lastPresenceSignature") === "string"
        ? authoritySnap.get("lastPresenceSignature") as string
        : "";
      const previousSequence = authoritySnap.exists && typeof authoritySnap.get("presenceSequence") === "number"
        ? authoritySnap.get("presenceSequence") as number
        : 0;
      const elapsedMs = now - lastPublishedAt;
      const identical = lastSignature === signature;
      const throttled = lastPublishedAt > 0 && (
        (identical && elapsedMs < MIN_IDENTICAL_UPDATE_INTERVAL_MS) ||
        (!identical && elapsedMs < MIN_CURSOR_UPDATE_INTERVAL_MS)
      );

      if (throttled) {
        const suppressedCount = authoritySnap.exists && typeof authoritySnap.get("suppressedCount") === "number"
          ? authoritySnap.get("suppressedCount") as number
          : 0;
        tx.set(authorityRef, {
          schemaVersion: 1,
          projectId,
          ownerUid: uid,
          deviceId,
          lastRejectedAt: now,
          updatedAt: now,
          suppressedCount: Math.min(suppressedCount + 1, 1_000_000),
        }, { merge: true });
        return {
          record: existingPresenceSnap.exists ? existingPresenceSnap.data() as PresenceRecord : undefined,
          throttled: true,
          removed: false,
          presenceSequence: previousSequence,
        };
      }

      const presenceSequence = previousSequence + 1;
      const record: PresenceRecord = {
        schemaVersion: 1,
        projectId,
        ownerUid: uid,
        actorId: uid,
        deviceId,
        displayName: payload.displayName,
        updatedAt: now,
        expiresAt: now + PRESENCE_TTL_MS,
        status: payload.status,
        selectionFrom: payload.selectionFrom,
        selectionTo: payload.selectionTo,
        cursorBlockId: payload.cursorBlockId,
        cursorOffset: payload.cursorOffset,
        anchorId: payload.anchorId,
        chunkId: payload.chunkId,
        sectionId: payload.sectionId,
        mountedSectionIds: payload.mountedSectionIds,
        presenceSequence,
        validation: {
          schemaVersion: 1,
          validatedAt: now,
          coordinatorValidated: true,
          throttled: false,
        },
      };

      tx.set(presenceRef, record);
      tx.set(authorityRef, {
        schemaVersion: 1,
        projectId,
        ownerUid: uid,
        deviceId,
        lastPublishedAt: now,
        lastPresenceSignature: signature,
        presenceSequence,
        updatedAt: now,
        createdAt: authoritySnap.exists && typeof authoritySnap.get("createdAt") === "number"
          ? authoritySnap.get("createdAt")
          : now,
      }, { merge: true });
      return {
        record,
        throttled: false,
        removed: false,
        presenceSequence,
      };
    });

    const cleanupCount = await pruneExpiredPresence({ projectRef, now }).catch(() => 0);
    logger.info("[WRITE][COLLABORATION_PRESENCE_SYNCED]", {
      uid,
      projectId,
      deviceId,
      throttled: result.throttled,
      presenceSequence: result.presenceSequence,
      cleanupCount,
      durationMs: Date.now() - startedAt,
    });
    return {
      ...result,
      cleanupCount,
    };
  } catch (error) {
    logger.error("[WRITE][COLLABORATION_PRESENCE_REJECTED]", {
      uid,
      projectId,
      deviceId,
      error,
    });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to synchronize collaboration presence.");
  }
});
