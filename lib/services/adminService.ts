import { httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase.ts';

export type DeletionRequestStatus = 'pending' | 'approved' | 'rejected' | 'executed';
export type DeletionReviewDecision = Extract<DeletionRequestStatus, 'approved' | 'rejected'>;
export type AdminUserRole = 'user' | 'moderator' | 'superadmin';

export type AdminUserSearchResult = {
  uid: string;
  email: string;
  displayName: string;
  role: AdminUserRole;
  status: string;
};

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

type ListDeletionRequestsPayload = {
  targetType: 'deletion_request';
  targetId: 'list';
};

type ListDeletionRequestsResponse = {
  requests: unknown;
};

type SearchUsersPayload = {
  query: string;
  targetType: 'user_search';
  targetId: string;
};

type SearchUsersResponse = {
  users: unknown;
};

let functionsInstance: Functions | null = null;

function getFunctionsOnce(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFirebaseFunctions();
  }
  return functionsInstance;
}

function readRequiredString(value: unknown, field: string, context: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[adminService] Invalid ${field} in ${context}.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`[adminService] Empty ${field} in ${context}.`);
  }
  return normalized;
}

function readNullableString(value: unknown, field: string, context: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') {
    throw new Error(`[adminService] Invalid ${field} in ${context}.`);
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readStatus(value: unknown, context: string): DeletionRequestStatus {
  if (
    value === 'pending' ||
    value === 'approved' ||
    value === 'rejected' ||
    value === 'executed'
  ) {
    return value;
  }
  throw new Error(`[adminService] Invalid status in ${context}.`);
}

function toIsoString(value: unknown, field: string, context: string, required: boolean): string | null {
  if (value == null) {
    if (required) {
      throw new Error(`[adminService] Missing ${field} in ${context}.`);
    }
    return null;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`[adminService] Invalid ${field} in ${context}.`);
    }
    return parsed.toISOString();
  }

  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === 'function') {
      const parsed = (candidate.toDate as () => Date)();
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`[adminService] Invalid ${field} in ${context}.`);
      }
      return parsed.toISOString();
    }
  }

  throw new Error(`[adminService] Invalid ${field} in ${context}.`);
}

function mapDeletionRequestItem(item: unknown, index: number): DeletionRequest {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`[adminService] Invalid deletion request at index ${index}.`);
  }

  const data = item as DeletionRequestDoc & { id?: unknown };
  const id = readRequiredString(data.id, 'id', `deletion request #${index}`);
  const context = `deletion_requests/${id}`;
  return {
    id,
    targetUid: readRequiredString(data.targetUid, 'targetUid', context),
    reason: readRequiredString(data.reason, 'reason', context),
    raisedByUid: readRequiredString(data.raisedByUid, 'raisedByUid', context),
    status: readStatus(data.status, context),
    reviewedByUid: readNullableString(data.reviewedByUid, 'reviewedByUid', context),
    reviewedAt: toIsoString(data.reviewedAt, 'reviewedAt', context, false),
    executedAt: toIsoString(data.executedAt, 'executedAt', context, false),
    createdAt: toIsoString(data.createdAt, 'createdAt', context, true) as string,
  };
}

function parseListDeletionRequestsResponse(payload: unknown): DeletionRequest[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('[adminService] Invalid listDeletionRequests response.');
  }

  const response = payload as ListDeletionRequestsResponse;
  if (!Array.isArray(response.requests)) {
    throw new Error('[adminService] listDeletionRequests response missing requests array.');
  }

  return response.requests.map((item, index) => mapDeletionRequestItem(item, index));
}

function readRole(value: unknown, context: string): AdminUserRole {
  if (value === 'user' || value === 'moderator' || value === 'superadmin') {
    return value;
  }
  throw new Error(`[adminService] Invalid role in ${context}.`);
}

function mapAdminUserSearchItem(item: unknown, index: number): AdminUserSearchResult {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`[adminService] Invalid user search result at index ${index}.`);
  }

  const data = item as {
    uid?: unknown;
    email?: unknown;
    displayName?: unknown;
    role?: unknown;
    status?: unknown;
  };

  const context = `user search result #${index}`;
  return {
    uid: readRequiredString(data.uid, 'uid', context),
    email: readRequiredString(data.email, 'email', context),
    displayName: readRequiredString(data.displayName, 'displayName', context),
    role: readRole(data.role, context),
    status: readRequiredString(data.status, 'status', context),
  };
}

function parseSearchUsersResponse(payload: unknown): AdminUserSearchResult[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('[adminService] Invalid searchUsersForAdmin response.');
  }

  const response = payload as SearchUsersResponse;
  if (!Array.isArray(response.users)) {
    throw new Error('[adminService] searchUsersForAdmin response missing users array.');
  }

  return response.users.map((item, index) => mapAdminUserSearchItem(item, index));
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
    const fn = httpsCallable<ListDeletionRequestsPayload, ListDeletionRequestsResponse>(
      getFunctionsOnce(),
      'listDeletionRequests'
    );

    const result = await fn({
      targetType: 'deletion_request',
      targetId: 'list',
    });

    return parseListDeletionRequestsResponse(result.data);
  },

  async searchUsers(query: string): Promise<AdminUserSearchResult[]> {
    const normalized = query.trim();
    if (!normalized) {
      return [];
    }

    const fn = httpsCallable<SearchUsersPayload, SearchUsersResponse>(
      getFunctionsOnce(),
      'searchUsersForAdmin'
    );

    const result = await fn({
      query: normalized,
      targetType: 'user_search',
      targetId: normalized.slice(0, 120),
    });

    return parseSearchUsersResponse(result.data);
  },
};
