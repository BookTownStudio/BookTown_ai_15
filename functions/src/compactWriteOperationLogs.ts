import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "./firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "./shared/auth";

const RETAIN_LEDGER_DOCS = 200;
const RETAIN_COLLABORATION_OPS = 120;
const MAX_DELETE_BATCH = 350;

function normalizeProjectId(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("/")) {
    throw new HttpsError("invalid-argument", "A valid projectId is required.");
  }
  return value.trim().slice(0, 120);
}

async function pruneCollection(params: {
  collection: FirebaseFirestore.CollectionReference;
  orderField: string;
  retain: number;
  maxDelete: number;
  canDelete?: (doc: FirebaseFirestore.QueryDocumentSnapshot) => boolean;
}): Promise<number> {
  const snap = await params.collection
    .orderBy(params.orderField, "desc")
    .limit(params.retain + params.maxDelete)
    .get();
  const staleDocs = snap.docs
    .slice(params.retain, params.retain + params.maxDelete)
    .filter((docSnap) => params.canDelete?.(docSnap) ?? true);
  if (staleDocs.length === 0) return 0;
  const batch = admin.firestore().batch();
  staleDocs.forEach((entry) => batch.delete(entry.ref));
  await batch.commit();
  return staleDocs.length;
}

async function resolveReplayCursorFloor(
  projectRef: FirebaseFirestore.DocumentReference
): Promise<number | null> {
  const snap = await projectRef
    .collection("collaborationReplayCursors")
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();
  const sequences = snap.docs
    .map((entry) => entry.get("lastCoordinatorSequence"))
    .filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0);
  if (sequences.length === 0) return null;
  return Math.min(...sequences);
}

async function pruneExpiredPresence(params: {
  collection: FirebaseFirestore.CollectionReference;
  now: number;
}): Promise<number> {
  const snap = await params.collection
    .where("expiresAt", "<=", params.now)
    .limit(MAX_DELETE_BATCH)
    .get();
  if (snap.empty) return 0;
  const batch = admin.firestore().batch();
  snap.docs.forEach((entry) => batch.delete(entry.ref));
  await batch.commit();
  return snap.size;
}

export const compactWriteOperationLogs = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const projectId = normalizeProjectId((request.data as Record<string, unknown>)?.projectId);
  const db = admin.firestore();
  const projectRef = db.collection("users").doc(uid).collection("projects").doc(projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) {
    throw new HttpsError("not-found", "Project was not found.");
  }

  const startedAt = Date.now();
  try {
    const replayCursorFloor = await resolveReplayCursorFloor(projectRef);
    const [
      operationLedgerPruned,
      chunkMutationLedgerPruned,
      collaborationOperationsPruned,
      presencePruned,
    ] = await Promise.all([
      pruneCollection({
        collection: projectRef.collection("operationLedger"),
        orderField: "createdAt",
        retain: RETAIN_LEDGER_DOCS,
        maxDelete: MAX_DELETE_BATCH,
      }),
      pruneCollection({
        collection: projectRef.collection("chunkMutationLedger"),
        orderField: "createdAt",
        retain: RETAIN_LEDGER_DOCS,
        maxDelete: MAX_DELETE_BATCH,
      }),
      pruneCollection({
        collection: projectRef.collection("collaborationOperations"),
        orderField: "createdAt",
        retain: RETAIN_COLLABORATION_OPS,
        maxDelete: MAX_DELETE_BATCH,
        canDelete: (docSnap) => {
          if (replayCursorFloor === null) return true;
          const sequence = docSnap.get("coordinatorSequence");
          return typeof sequence === "number" && Number.isInteger(sequence) && sequence <= replayCursorFloor;
        },
      }),
      pruneExpiredPresence({
        collection: projectRef.collection("collaborationPresence"),
        now: Date.now(),
      }),
    ]);

    const result = {
      projectId,
      operationLedgerPruned,
      chunkMutationLedgerPruned,
      collaborationOperationsPruned,
      presencePruned,
      durationMs: Date.now() - startedAt,
    };
    logger.info("[WRITE][OPERATION_COMPACTION_COMPLETED]", { uid, ...result });
    return result;
  } catch (error) {
    logger.error("[WRITE][OPERATION_COMPACTION_FAILED]", { uid, projectId, error });
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to compact write operation logs.");
  }
});
