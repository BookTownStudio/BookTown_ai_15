import { httpsCallable, type Functions } from 'firebase/functions';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { getFirebaseDb, getFirebaseFunctions } from '../firebase.ts';

export type DeletionRequestStatus = 'pending' | 'approved' | 'rejected' | 'executed';
export type DeletionReviewDecision = Extract<DeletionRequestStatus, 'approved' | 'rejected'>;

export type DeletionRequest = {
  id: string;
  targetUid: string;
  reason: string;
  raisedByUid: string;
  status: DeletionRequestStatus;
  reviewedByUid: string | null;
  reviewedAt: string | null;
  executedAt: string | null;
  createdAt: string;
};

export const adminServiceQueryKeys = {
  deletionRequests: ['admin', 'deletionRequests'] as const,
};

type DeletionRequestDoc = {
  targetUid?: unknown;
  reason?: unknown;
  raisedByUid?: unknown;
  status?: unknown;
  reviewedByUid?: unknown;
  reviewedAt?: unknown;
  executedAt?: unknown;
  createdAt?: unknown;
};

type CreateDeletionRequestPayload = {
  targetUid: string;
  reason: string;
  targetType: 'user';
  targetId: string;
};

type ReviewDeletionRequestPayload = {
  requestId: string;
  decision: DeletionReviewDecision;
  note?: string;
  targetType: 'deletion_request';
  targetId: string;
};

type ExecuteDeletionPayload = {
  requestId: string;
  targetType: 'deletion_request';
  targetId: string;
};

let functionsInstance: Functions | null = null;

function getFunctionsOnce(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFirebaseFunctions();
  }
  return functionsInstance;
}

function readRequiredString(value: unknown, field: string, docId: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[adminService] Invalid ${field} in deletion_requests/${docId}.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`[adminService] Empty ${field} in deletion_requests/${docId}.`);
  }
  return normalized;
}

function readNullableString(value: unknown, field: string, docId: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new Error(`[adminService] Invalid ${field} in deletion_requests/${docId}.`);
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readStatus(value: unknown, docId: string): DeletionRequestStatus {
  if (
    value === 'pending' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'executed'
  ) {
    return value;
  }
  throw new Error(`[adminService] Invalid status in deletion_requests/${docId}.`);
}

function toIsoString(value: unknown, field: string, docId: string, required: boolean): string | null {
  if (value == null) {
    if (required) {
      throw new Error(`[adminService] Missing ${field} in deletion_requests/${docId}.`);
    }
    return null;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`[adminService] Invalid ${field} in deletion_requests/${docId}.`);
    }
    return parsed.toISOString();
  }

  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === 'function') {
      const parsed = (candidate.toDate as () => Date)();
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`[adminService] Invalid ${field} in deletion_requests/${docId}.`);
      }
      return parsed.toISOString();
    }
  }

  throw new Error(`[adminService] Invalid ${field} in deletion_requests/${docId}.`);
}

function mapDeletionRequestDoc(doc: QueryDocumentSnapshot): DeletionRequest {
  const data = doc.data() as DeletionRequestDoc;

  return {
    id: doc.id,
    targetUid: readRequiredString(data.targetUid, 'targetUid', doc.id),
    reason: readRequiredString(data.reason, 'reason', doc.id),
    raisedByUid: readRequiredString(data.raisedByUid, 'raisedByUid', doc.id),
    status: readStatus(data.status, doc.id),
    reviewedByUid: readNullableString(data.reviewedByUid, 'reviewedByUid', doc.id),
    reviewedAt: toIsoString(data.reviewedAt, 'reviewedAt', doc.id, false),
    executedAt: toIsoString(data.executedAt, 'executedAt', doc.id, false),
    createdAt: toIsoString(data.createdAt, 'createdAt', doc.id, true) as string,
  };
}

export const adminService = {
  async createDeletionRequest(targetUid: string, reason: string): Promise<void> {
    const normalizedTargetUid = targetUid.trim();
    const normalizedReason = reason.trim();
    if (!normalizedTargetUid) {
      throw new Error('Target UID is required.');
    }
    if (!normalizedReason) {
      throw new Error('Reason is required.');
    }

    const fn = httpsCallable<CreateDeletionRequestPayload, { requestId: string }>(
      getFunctionsOnce(),
      'createDeletionRequest'
    );

    await fn({
      targetUid: normalizedTargetUid,
      reason: normalizedReason,
      targetType: 'user',
      targetId: normalizedTargetUid,
    });
  },

  async reviewDeletionRequest(
    requestId: string,
    decision: DeletionReviewDecision,
    note?: string
  ): Promise<void> {
    const normalizedRequestId = requestId.trim();
    if (!normalizedRequestId) {
      throw new Error('Request ID is required.');
    }

    const payload: ReviewDeletionRequestPayload = {
      requestId: normalizedRequestId,
      decision,
      targetType: 'deletion_request',
      targetId: normalizedRequestId,
    };

    if (typeof note === 'string' && note.trim().length > 0) {
      payload.note = note.trim();
    }

    const fn = httpsCallable<ReviewDeletionRequestPayload, { success: true }>(
      getFunctionsOnce(),
      'reviewDeletionRequest'
    );

    await fn(payload);
  },

  async executeDeletion(requestId: string): Promise<void> {
    const normalizedRequestId = requestId.trim();
    if (!normalizedRequestId) {
      throw new Error('Request ID is required.');
    }

    const fn = httpsCallable<ExecuteDeletionPayload, { success: true }>(
      getFunctionsOnce(),
      'executeDeletion'
    );

    await fn({
      requestId: normalizedRequestId,
      targetType: 'deletion_request',
      targetId: normalizedRequestId,
    });
  },

  async listDeletionRequests(): Promise<DeletionRequest[]> {
    const db = getFirebaseDb();
    const requestsQuery = query(
      collection(db, 'deletion_requests'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const snapshot = await getDocs(requestsQuery);
    return snapshot.docs.map(mapDeletionRequestDoc);
  },
};
