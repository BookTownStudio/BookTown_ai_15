import { httpsCallable, type Functions } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase.ts';

export type DeletionRequestStatus = 'pending' | 'approved' | 'rejected' | 'executed';
export type DeletionReviewDecision = Extract<DeletionRequestStatus, 'approved' | 'rejected'>;
export type AdminUserRole = 'user' | 'moderator' | 'superadmin';
export type SystemMetricsDailyRangeParams = {
  from?: string;
  to?: string;
  limit?: number;
};
export type RecentSystemEventsParams = {
  limit?: number;
  afterCursor?: string;
};

export type SystemMetricsBucket = {
  totalUsers: number;
  totalPosts: number;
  totalReviews: number;
  totalQuotes: number;
  totalFollows: number;
  totalDeletionRequests: number;
  executedDeletions: number;
  updatedAt: string | null;
};

export type SystemMetricsSnapshot = {
  global: SystemMetricsBucket;
  growth: SystemMetricsBucket;
  engagement: SystemMetricsBucket;
  moderation: SystemMetricsBucket;
};

export type SystemMetricsDailyEntry = SystemMetricsBucket & {
  dateKey: string;
};

export type AdminSystemEvent = {
  id: string;
  createdAt: string | null;
  type: string;
  uid: string;
  entityId: string | null;
};

export type SystemEventsPage = {
  events: AdminSystemEvent[];
  nextCursor: string | null;
  totalCountEstimate: number;
};

export type SystemHealthSnapshot = {
  globalUpdatedAt: string | null;
  latestDailyBucketDate: string | null;
  totalEventsCount: number;
  latestEventType: string | null;
  latestEventCreatedAt: string | null;
  lastPostCreatedAt: string | null;
};

export type FeedbackPipelineStub = {
  connected: false;
  message: string;
};

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
  analyticsSnapshot: ['admin', 'analytics', 'snapshot'] as const,
  analyticsDailyRange: (params: SystemMetricsDailyRangeParams = {}) =>
    [
      'admin',
      'analytics',
      'dailyRange',
      params.from ?? null,
      params.to ?? null,
      params.limit ?? null,
    ] as const,
  systemEvents: (params: RecentSystemEventsParams = {}) =>
    ['admin', 'events', 'recent', params.limit ?? 50] as const,
  systemHealthSnapshot: ['admin', 'health', 'snapshot'] as const,
  feedbackPipelineStub: ['admin', 'feedback', 'pipelineStub'] as const,
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

type GetSystemMetricsSnapshotPayload = {
  targetType: 'system_metrics_snapshot';
  targetId: 'system_metrics';
};

type GetSystemMetricsSnapshotResponse = {
  snapshot: unknown;
};

type GetSystemMetricsDailyRangePayload = {
  from?: string;
  to?: string;
  limit?: number;
  targetType: 'system_metrics_daily_range';
  targetId: string;
};

type GetSystemMetricsDailyRangeResponse = {
  days: unknown;
};

type GetRecentSystemEventsPayload = {
  limit?: number;
  afterCursor?: string;
  targetType: 'system_events';
  targetId: string;
};

type GetRecentSystemEventsResponse = {
  events: unknown;
  nextCursor: unknown;
  totalCountEstimate: unknown;
};

type GetSystemHealthSnapshotPayload = {
  targetType: 'system_health_snapshot';
  targetId: 'system_health';
};

type GetSystemHealthSnapshotResponse = {
  health: unknown;
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

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function readRequiredFiniteNumber(value: unknown, field: string, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[adminService] Invalid ${field} in ${context}.`);
  }
  return value;
}

function parseSystemMetricsBucket(payload: unknown, context: string): SystemMetricsBucket {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`[adminService] Invalid metrics bucket in ${context}.`);
  }

  const source = payload as Record<string, unknown>;
  return {
    totalUsers: readRequiredFiniteNumber(source.totalUsers, 'totalUsers', context),
    totalPosts: readRequiredFiniteNumber(source.totalPosts, 'totalPosts', context),
    totalReviews: readRequiredFiniteNumber(source.totalReviews, 'totalReviews', context),
    totalQuotes: readRequiredFiniteNumber(source.totalQuotes, 'totalQuotes', context),
    totalFollows: readRequiredFiniteNumber(source.totalFollows, 'totalFollows', context),
    totalDeletionRequests: readRequiredFiniteNumber(
      source.totalDeletionRequests,
      'totalDeletionRequests',
      context
    ),
    executedDeletions: readRequiredFiniteNumber(
      source.executedDeletions,
      'executedDeletions',
      context
    ),
    updatedAt: toIsoString(source.updatedAt, 'updatedAt', context, false),
  };
}

function parseSystemMetricsSnapshotResponse(payload: unknown): SystemMetricsSnapshot {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('[adminService] Invalid getSystemMetricsSnapshot response.');
  }

  const response = payload as GetSystemMetricsSnapshotResponse;
  if (!response.snapshot || typeof response.snapshot !== 'object' || Array.isArray(response.snapshot)) {
    throw new Error('[adminService] getSystemMetricsSnapshot response missing snapshot object.');
  }

  const snapshot = response.snapshot as Record<string, unknown>;
  return {
    global: parseSystemMetricsBucket(snapshot.global, 'snapshot.global'),
    growth: parseSystemMetricsBucket(snapshot.growth, 'snapshot.growth'),
    engagement: parseSystemMetricsBucket(snapshot.engagement, 'snapshot.engagement'),
    moderation: parseSystemMetricsBucket(snapshot.moderation, 'snapshot.moderation'),
  };
}

function parseSystemMetricsDailyRangeResponse(payload: unknown): SystemMetricsDailyEntry[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('[adminService] Invalid getSystemMetricsDailyRange response.');
  }

  const response = payload as GetSystemMetricsDailyRangeResponse;
  if (!Array.isArray(response.days)) {
    throw new Error('[adminService] getSystemMetricsDailyRange response missing days array.');
  }

  return response.days.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`[adminService] Invalid daily metrics row at index ${index}.`);
    }

    const context = `daily metrics row #${index}`;
    const row = item as Record<string, unknown>;
    const dateKey = readRequiredString(row.dateKey, 'dateKey', context);
    if (!DATE_KEY_REGEX.test(dateKey)) {
      throw new Error(`[adminService] Invalid dateKey in ${context}.`);
    }

    return {
      dateKey,
      ...parseSystemMetricsBucket(row, context),
    };
  });
}

function normalizeDateKeyParam(value: unknown, field: 'from' | 'to'): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`[adminService] ${field} must be a YYYY-MM-DD string.`);
  }

  const normalized = value.trim();
  if (!DATE_KEY_REGEX.test(normalized)) {
    throw new Error(`[adminService] ${field} must match YYYY-MM-DD.`);
  }
  return normalized;
}

function normalizeDailyRangeParams(
  params: SystemMetricsDailyRangeParams | undefined
): { from?: string; to?: string; limit: number } {
  const from = normalizeDateKeyParam(params?.from, 'from');
  const to = normalizeDateKeyParam(params?.to, 'to');
  if (from && to && from > to) {
    throw new Error('[adminService] from must be less than or equal to to.');
  }

  const rawLimit = params?.limit;
  const limit = rawLimit == null ? 30 : rawLimit;
  if (!Number.isFinite(limit) || Math.trunc(limit) !== limit || limit <= 0 || limit > 180) {
    throw new Error('[adminService] limit must be an integer between 1 and 180.');
  }

  return { from, to, limit };
}

function mapSystemEventItem(item: unknown, index: number): AdminSystemEvent {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`[adminService] Invalid system event at index ${index}.`);
  }

  const data = item as {
    id?: unknown;
    createdAt?: unknown;
    type?: unknown;
    uid?: unknown;
    entityId?: unknown;
  };

  const context = `system event #${index}`;
  return {
    id: readRequiredString(data.id, 'id', context),
    createdAt: toIsoString(data.createdAt, 'createdAt', context, false),
    type: readRequiredString(data.type, 'type', context),
    uid: readRequiredString(data.uid, 'uid', context),
    entityId: readNullableString(data.entityId, 'entityId', context),
  };
}

function parseRecentSystemEventsResponse(payload: unknown): SystemEventsPage {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('[adminService] Invalid getRecentSystemEvents response.');
  }

  const response = payload as GetRecentSystemEventsResponse;
  if (!Array.isArray(response.events)) {
    throw new Error('[adminService] getRecentSystemEvents response missing events array.');
  }

  const totalCountEstimate = readRequiredFiniteNumber(
    response.totalCountEstimate,
    'totalCountEstimate',
    'getRecentSystemEvents'
  );
  if (Math.trunc(totalCountEstimate) !== totalCountEstimate || totalCountEstimate < 0) {
    throw new Error('[adminService] Invalid totalCountEstimate in getRecentSystemEvents.');
  }

  return {
    events: response.events.map((item, index) => mapSystemEventItem(item, index)),
    nextCursor: readNullableString(response.nextCursor, 'nextCursor', 'getRecentSystemEvents'),
    totalCountEstimate,
  };
}

function parseSystemHealthSnapshotResponse(payload: unknown): SystemHealthSnapshot {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('[adminService] Invalid getSystemHealthSnapshot response.');
  }

  const response = payload as GetSystemHealthSnapshotResponse;
  if (!response.health || typeof response.health !== 'object' || Array.isArray(response.health)) {
    throw new Error('[adminService] getSystemHealthSnapshot response missing health object.');
  }

  const source = response.health as Record<string, unknown>;
  const latestDailyBucketDateRaw = source.latestDailyBucketDate;
  const latestDailyBucketDate = readNullableString(
    latestDailyBucketDateRaw,
    'latestDailyBucketDate',
    'getSystemHealthSnapshot'
  );
  if (latestDailyBucketDate && !DATE_KEY_REGEX.test(latestDailyBucketDate)) {
    throw new Error('[adminService] Invalid latestDailyBucketDate in getSystemHealthSnapshot.');
  }

  const totalEventsCount = readRequiredFiniteNumber(
    source.totalEventsCount,
    'totalEventsCount',
    'getSystemHealthSnapshot'
  );
  if (Math.trunc(totalEventsCount) !== totalEventsCount || totalEventsCount < 0) {
    throw new Error('[adminService] Invalid totalEventsCount in getSystemHealthSnapshot.');
  }

  return {
    globalUpdatedAt: toIsoString(
      source.globalUpdatedAt,
      'globalUpdatedAt',
      'getSystemHealthSnapshot',
      false
    ),
    latestDailyBucketDate,
    totalEventsCount,
    latestEventType: readNullableString(
      source.latestEventType,
      'latestEventType',
      'getSystemHealthSnapshot'
    ),
    latestEventCreatedAt: toIsoString(
      source.latestEventCreatedAt,
      'latestEventCreatedAt',
      'getSystemHealthSnapshot',
      false
    ),
    lastPostCreatedAt: toIsoString(
      source.lastPostCreatedAt,
      'lastPostCreatedAt',
      'getSystemHealthSnapshot',
      false
    ),
  };
}

function normalizeSystemEventsParams(
  params: RecentSystemEventsParams | undefined
): { limit: number; afterCursor?: string } {
  const rawLimit = params?.limit;
  const limit = rawLimit == null ? 50 : rawLimit;
  if (!Number.isFinite(limit) || Math.trunc(limit) !== limit || limit <= 0 || limit > 200) {
    throw new Error('[adminService] limit must be an integer between 1 and 200.');
  }

  const rawAfterCursor = params?.afterCursor;
  if (rawAfterCursor == null) {
    return { limit };
  }

  if (typeof rawAfterCursor !== 'string') {
    throw new Error('[adminService] afterCursor must be a string.');
  }

  const afterCursor = rawAfterCursor.trim();
  if (!afterCursor) {
    throw new Error('[adminService] afterCursor cannot be empty.');
  }
  if (afterCursor.length > 200) {
    throw new Error('[adminService] afterCursor exceeds maximum length.');
  }

  return { limit, afterCursor };
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

  async getSystemMetricsSnapshot(): Promise<SystemMetricsSnapshot> {
    const fn = httpsCallable<GetSystemMetricsSnapshotPayload, GetSystemMetricsSnapshotResponse>(
      getFunctionsOnce(),
      'getSystemMetricsSnapshot'
    );

    const result = await fn({
      targetType: 'system_metrics_snapshot',
      targetId: 'system_metrics',
    });

    return parseSystemMetricsSnapshotResponse(result.data);
  },

  async getSystemMetricsDailyRange(
    params: SystemMetricsDailyRangeParams = {}
  ): Promise<SystemMetricsDailyEntry[]> {
    const normalized = normalizeDailyRangeParams(params);
    const targetId = `${normalized.from ?? 'latest'}:${normalized.to ?? 'latest'}:${normalized.limit}`;

    const fn = httpsCallable<
      GetSystemMetricsDailyRangePayload,
      GetSystemMetricsDailyRangeResponse
    >(
      getFunctionsOnce(),
      'getSystemMetricsDailyRange'
    );

    const payload: GetSystemMetricsDailyRangePayload = {
      targetType: 'system_metrics_daily_range',
      targetId,
      limit: normalized.limit,
    };
    if (normalized.from) {
      payload.from = normalized.from;
    }
    if (normalized.to) {
      payload.to = normalized.to;
    }

    const result = await fn(payload);
    return parseSystemMetricsDailyRangeResponse(result.data);
  },

  async getRecentSystemEvents(
    params: RecentSystemEventsParams = {}
  ): Promise<SystemEventsPage> {
    const normalized = normalizeSystemEventsParams(params);
    const targetId = `${normalized.afterCursor ?? 'origin'}:${normalized.limit}`;

    const fn = httpsCallable<GetRecentSystemEventsPayload, GetRecentSystemEventsResponse>(
      getFunctionsOnce(),
      'getRecentSystemEvents'
    );

    const payload: GetRecentSystemEventsPayload = {
      limit: normalized.limit,
      targetType: 'system_events',
      targetId,
    };
    if (normalized.afterCursor) {
      payload.afterCursor = normalized.afterCursor;
    }

    const result = await fn(payload);
    return parseRecentSystemEventsResponse(result.data);
  },

  async getSystemHealthSnapshot(): Promise<SystemHealthSnapshot> {
    const fn = httpsCallable<GetSystemHealthSnapshotPayload, GetSystemHealthSnapshotResponse>(
      getFunctionsOnce(),
      'getSystemHealthSnapshot'
    );

    const result = await fn({
      targetType: 'system_health_snapshot',
      targetId: 'system_health',
    });

    return parseSystemHealthSnapshotResponse(result.data);
  },

  async getFeedbackPipelineStub(): Promise<FeedbackPipelineStub> {
    return {
      connected: false,
      message: 'Feedback pipeline not connected yet.',
    };
  },
};
