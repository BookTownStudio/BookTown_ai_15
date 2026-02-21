import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { withControlAuth } from "./withControlAuth";

const db = admin.firestore();
const auth = admin.auth();

const DELETION_REQUESTS_COLLECTION = "deletion_requests";

type DeletionRequestStatus = "pending" | "approved" | "rejected" | "executed";
type ReviewDecision = Extract<DeletionRequestStatus, "approved" | "rejected">;
type ControlPayload = Record<string, unknown> | null | undefined;

interface DeletionRequestDoc {
  targetUid: string;
  reason: string;
  raisedByUid: string;
  status: DeletionRequestStatus;
  reviewedByUid: string | null;
  reviewedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  executedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp | null;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

interface SerializableDeletionRequest {
  id: string;
  targetUid: string;
  reason: string;
  raisedByUid: string;
  status: DeletionRequestStatus;
  reviewedByUid: string | null;
  reviewedAt: string | null;
  executedAt: string | null;
  createdAt: string;
}

function readPayload(caller: CallableRequest<ControlPayload>): Record<string, unknown> {
  const payload = caller.data;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpsError("invalid-argument", "Callable payload must be an object.");
  }
  return payload as Record<string, unknown>;
}

function readRequiredString(
  source: Record<string, unknown>,
  key: string,
  maxLength: number
): string {
  const raw = source[key];
  if (typeof raw !== "string") {
    throw new HttpsError("invalid-argument", `Missing required field: ${key}.`);
  }

  const normalized = raw.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new HttpsError("invalid-argument", `Invalid field value: ${key}.`);
  }

  return normalized;
}

function isReviewDecision(value: string): value is ReviewDecision {
  return value === "approved" || value === "rejected";
}

function toRequestDoc(data: FirebaseFirestore.DocumentData): DeletionRequestDoc {
  return data as DeletionRequestDoc;
}

function readDocString(
  value: unknown,
  field: string,
  requestId: string
): string {
  if (typeof value !== "string") {
    throw new HttpsError(
      "failed-precondition",
      `Deletion request ${requestId} has invalid ${field}.`
    );
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      `Deletion request ${requestId} has empty ${field}.`
    );
  }

  return normalized;
}

function readDocStatus(
  value: unknown,
  requestId: string
): DeletionRequestStatus {
  if (
    value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "executed"
  ) {
    return value;
  }

  throw new HttpsError(
    "failed-precondition",
    `Deletion request ${requestId} has invalid status.`
  );
}

function toIsoTimestamp(
  value: unknown,
  field: string,
  requestId: string,
  required: boolean
): string | null {
  if (value == null) {
    if (required) {
      throw new HttpsError(
        "failed-precondition",
        `Deletion request ${requestId} is missing ${field}.`
      );
    }
    return null;
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new HttpsError(
        "failed-precondition",
        `Deletion request ${requestId} has invalid ${field}.`
      );
    }
    return parsed.toISOString();
  }

  if (typeof value === "object") {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") {
      const parsed = (candidate.toDate as () => Date)();
      if (Number.isNaN(parsed.getTime())) {
        throw new HttpsError(
          "failed-precondition",
          `Deletion request ${requestId} has invalid ${field}.`
        );
      }
      return parsed.toISOString();
    }
  }

  throw new HttpsError(
    "failed-precondition",
    `Deletion request ${requestId} has unsupported ${field}.`
  );
}

function serializeRequest(
  requestId: string,
  request: DeletionRequestDoc
): SerializableDeletionRequest {
  return {
    id: requestId,
    targetUid: readDocString(request.targetUid, "targetUid", requestId),
    reason: readDocString(request.reason, "reason", requestId),
    raisedByUid: readDocString(request.raisedByUid, "raisedByUid", requestId),
    status: readDocStatus(request.status, requestId),
    reviewedByUid:
      typeof request.reviewedByUid === "string" && request.reviewedByUid.trim().length > 0
        ? request.reviewedByUid.trim()
        : null,
    reviewedAt: toIsoTimestamp(request.reviewedAt, "reviewedAt", requestId, false),
    executedAt: toIsoTimestamp(request.executedAt, "executedAt", requestId, false),
    createdAt: toIsoTimestamp(request.createdAt, "createdAt", requestId, true) as string,
  };
}

function isAuthUserNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "auth/user-not-found";
}

export const listDeletionRequests = withControlAuth<
  ControlPayload,
  { requests: SerializableDeletionRequest[] }
>("moderator", "listDeletionRequests", async () => {
  const requestsSnap = await db
    .collection(DELETION_REQUESTS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(100)
    .get();

  const requests = requestsSnap.docs.map((doc) =>
    serializeRequest(doc.id, toRequestDoc(doc.data()))
  );

  return { requests };
});

export const createDeletionRequest = withControlAuth<ControlPayload, { requestId: string }>(
  "moderator",
  "DELETE_REQUEST_CREATED",
  async (caller) => {
    const payload = readPayload(caller);
    const targetUid = readRequiredString(payload, "targetUid", 128);
    const reason = readRequiredString(payload, "reason", 2000);
    const actorUid = caller.auth?.uid;

    if (!actorUid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }
    if (targetUid === actorUid) {
      throw new HttpsError("failed-precondition", "Self-deletion requests are not allowed.");
    }

    try {
      await auth.getUser(targetUid);
    } catch (error) {
      if (isAuthUserNotFound(error)) {
        throw new HttpsError("not-found", "Target user not found.");
      }
      throw error;
    }

    const existingRequests = await db
      .collection(DELETION_REQUESTS_COLLECTION)
      .where("targetUid", "==", targetUid)
      .limit(20)
      .get();

    const hasPendingRequest = existingRequests.docs.some(
      (doc) => toRequestDoc(doc.data()).status === "pending"
    );

    if (hasPendingRequest) {
      throw new HttpsError(
        "already-exists",
        "A pending deletion request already exists for this user."
      );
    }

    const ref = await db.collection(DELETION_REQUESTS_COLLECTION).add({
      targetUid,
      reason,
      raisedByUid: actorUid,
      status: "pending",
      reviewedByUid: null,
      reviewedAt: null,
      executedAt: null,
      createdAt: FieldValue.serverTimestamp(),
    } satisfies DeletionRequestDoc);

    return { requestId: ref.id };
  }
);

export const reviewDeletionRequest = withControlAuth<
  ControlPayload,
  { success: true; requestId: string; status: ReviewDecision }
>("superadmin", "DELETE_REQUEST_REVIEWED", async (caller) => {
  const payload = readPayload(caller);
  const requestId = readRequiredString(payload, "requestId", 128);
  const decisionRaw = readRequiredString(payload, "decision", 32).toLowerCase();
  const reviewerUid = caller.auth?.uid;

  if (!reviewerUid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  if (!isReviewDecision(decisionRaw)) {
    throw new HttpsError("invalid-argument", "Decision must be approved or rejected.");
  }

  const requestRef = db.collection(DELETION_REQUESTS_COLLECTION).doc(requestId);

  await db.runTransaction(async (tx) => {
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists) {
      throw new HttpsError("not-found", "Deletion request not found.");
    }

    const request = toRequestDoc(requestSnap.data() ?? {});
    if (request.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "Only pending requests can be reviewed."
      );
    }

    tx.update(requestRef, {
      status: decisionRaw,
      reviewedByUid: reviewerUid,
      reviewedAt: FieldValue.serverTimestamp(),
    } as Partial<DeletionRequestDoc>);
  });

  return { success: true, requestId, status: decisionRaw };
});

export const executeDeletion = withControlAuth<
  ControlPayload,
  { success: true; requestId: string; targetUid: string }
>("superadmin", "DELETE_EXECUTED", async (caller) => {
  const payload = readPayload(caller);
  const requestId = readRequiredString(payload, "requestId", 128);
  const actorUid = caller.auth?.uid;

  if (!actorUid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const requestRef = db.collection(DELETION_REQUESTS_COLLECTION).doc(requestId);
  const requestSnap = await requestRef.get();

  if (!requestSnap.exists) {
    throw new HttpsError("not-found", "Deletion request not found.");
  }

  const request = toRequestDoc(requestSnap.data() ?? {});
  if (request.status !== "approved") {
    throw new HttpsError("failed-precondition", "Deletion request is not approved.");
  }

  const targetUid = request.targetUid;
  if (typeof targetUid !== "string" || targetUid.trim().length === 0) {
    throw new HttpsError("failed-precondition", "Deletion request target is invalid.");
  }
  if (targetUid === actorUid) {
    throw new HttpsError("failed-precondition", "Self-deletion execution is not allowed.");
  }

  await db
    .collection("users")
    .doc(targetUid)
    .set(
      {
        status: "deleted",
        deletedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

  try {
    await auth.updateUser(targetUid, { disabled: true });
  } catch (error) {
    if (!isAuthUserNotFound(error)) {
      throw error;
    }
  }

  await db.runTransaction(async (tx) => {
    const latestSnap = await tx.get(requestRef);
    if (!latestSnap.exists) {
      throw new HttpsError("not-found", "Deletion request not found.");
    }

    const latestRequest = toRequestDoc(latestSnap.data() ?? {});
    if (latestRequest.status !== "approved") {
      throw new HttpsError(
        "failed-precondition",
        "Deletion request was already processed."
      );
    }

    tx.update(requestRef, {
      status: "executed",
      executedAt: FieldValue.serverTimestamp(),
      reviewedByUid: latestRequest.reviewedByUid ?? actorUid,
      reviewedAt: latestRequest.reviewedAt ?? FieldValue.serverTimestamp(),
    } as Partial<DeletionRequestDoc>);
  });

  return { success: true, requestId, targetUid };
});
