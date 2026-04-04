import { httpsCallable, type Functions } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { getFirebaseAuth, getFirebaseFunctions, getFirebaseStorage } from '../firebase.ts';
import { callCallableEndpoint } from '../callable.ts';

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

export type AdminAuthorRecord = {
  authorId: string;
  canonicalName: string;
  normalizedName: string;
  displayName: string;
  aliases: string[];
  slug?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  deathPlace?: string;
  nationality?: string;
  languages: string[];
  genres: string[];
  movements: string[];
  period?: string;
  themes: string[];
  influenceTags: string[];
  shortBio?: string;
  fullBio?: string;
  wikipediaUrl?: string;
  goodreadsId?: string;
  openLibraryId?: string;
  wikidataId?: string;
  isni?: string;
  viaf?: string;
  portraitUrl?: string;
  gallery: string[];
  knownWorks: string[];
  bookIds: string[];
  status: 'active' | 'archived';
  source?: string;
  primarySource?: string;
  provenance?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
};

export type AdminQuoteRecord = {
  quoteId: string;
  canonicalQuoteId: string;
  canonicalQuoteHash?: string;
  slug?: string;
  canonicalText: string;
  normalizedText: string;
  textEn: string;
  textAr: string;
  sourceEn: string;
  sourceAr: string;
  authorId?: string;
  authorName?: string;
  bookId?: string;
  bookTitle?: string;
  chapter?: string;
  page?: number;
  section?: string;
  year?: number;
  language?: string;
  originalLanguage?: string;
  translatedFrom?: string;
  translationStatus?: string;
  themes: string[];
  mood?: string;
  concepts: string[];
  keywords: string[];
  tags: string[];
  attributionConfidence?: number;
  sourceType?: string;
  sourceReference?: string;
  provenance?: Record<string, unknown>;
  status: 'active' | 'archived';
  isPublic: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
};

export type AdminQuoteImportJob = {
  status: 'registered' | 'running' | 'completed' | 'failed';
  storagePath: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  totalRows: number;
  processedRows: number;
  createdRows: number;
  duplicateRows: number;
  skippedRows: number;
  failedRows: number;
  lastProcessedRow: number;
  completed: boolean;
  lastRunAt?: string;
  createdAt?: string;
  updatedAt?: string;
  registeredBy: string;
  lastError?: string;
  dailyRowLimit: number;
  dailyWriteBudget: number;
  batchRowLimit: number;
  estimatedCompletionDays: number;
};

export type AdminAuthorImportCandidate = {
  id: string;
  nameEn: string;
  nameAr: string;
  avatarUrl: string;
  bioEn: string;
  bioAr: string;
  lifespan: string;
  countryEn: string;
  countryAr: string;
  languageEn: string;
  languageAr: string;
  providerSource?: 'openLibrary' | 'wikidata';
  providerExternalId?: string;
  requiresCanonicalization?: boolean;
};

export const adminServiceQueryKeys = {
  deletionRequests: ['admin', 'deletionRequests'] as const,
  authors: (params: { query?: string | null; status?: string | null; limit?: number | null } = {}) =>
    ['admin', 'authors', params.query ?? null, params.status ?? null, params.limit ?? null] as const,
  author: (authorId: string | null | undefined) => ['admin', 'author', authorId ?? null] as const,
  quotes: (params: {
    query?: string | null;
    status?: string | null;
    authorId?: string | null;
    bookId?: string | null;
    limit?: number | null;
  } = {}) =>
    [
      'admin',
      'quotes',
      params.query ?? null,
      params.status ?? null,
      params.authorId ?? null,
      params.bookId ?? null,
      params.limit ?? null,
    ] as const,
  quote: (quoteId: string | null | undefined) => ['admin', 'quote', quoteId ?? null] as const,
  quoteImportStatus: ['admin', 'quoteImportStatus'] as const,
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

function readString(value: unknown, field: string, context: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[adminService] Invalid ${field} in ${context}.`);
  }
  return value.trim();
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

function readStringArray(value: unknown, field: string, context: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`[adminService] Invalid ${field} in ${context}.`);
  }

  return value.map((entry, index) =>
    readRequiredString(entry, `${field}[${index}]`, context)
  );
}

function readOptionalNumber(value: unknown, field: string, context: string): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[adminService] Invalid ${field} in ${context}.`);
  }
  return value;
}

function readOptionalObject(
  value: unknown,
  field: string,
  context: string
): Record<string, unknown> | undefined {
  if (value == null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`[adminService] Invalid ${field} in ${context}.`);
  }
  return value as Record<string, unknown>;
}

function readAuthorStatus(value: unknown, context: string): AdminAuthorRecord['status'] {
  if (value === 'active' || value === 'archived') {
    return value;
  }
  throw new Error(`[adminService] Invalid author status in ${context}.`);
}

function readQuoteStatus(value: unknown, context: string): AdminQuoteRecord['status'] {
  if (value === 'active' || value === 'archived') {
    return value;
  }
  throw new Error(`[adminService] Invalid quote status in ${context}.`);
}

function mapAdminAuthorItem(item: unknown, index: number): AdminAuthorRecord {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`[adminService] Invalid admin author at index ${index}.`);
  }
  const data = item as Record<string, unknown>;
  const context = `admin author #${index}`;
  return {
    authorId: readRequiredString(data.authorId, 'authorId', context),
    canonicalName: readRequiredString(data.canonicalName, 'canonicalName', context),
    normalizedName: readRequiredString(data.normalizedName, 'normalizedName', context),
    displayName: readRequiredString(data.displayName, 'displayName', context),
    aliases: readStringArray(data.aliases, 'aliases', context),
    slug: readNullableString(data.slug, 'slug', context) ?? undefined,
    birthDate: readNullableString(data.birthDate, 'birthDate', context) ?? undefined,
    deathDate: readNullableString(data.deathDate, 'deathDate', context) ?? undefined,
    birthPlace: readNullableString(data.birthPlace, 'birthPlace', context) ?? undefined,
    deathPlace: readNullableString(data.deathPlace, 'deathPlace', context) ?? undefined,
    nationality: readNullableString(data.nationality, 'nationality', context) ?? undefined,
    languages: readStringArray(data.languages, 'languages', context),
    genres: readStringArray(data.genres, 'genres', context),
    movements: readStringArray(data.movements, 'movements', context),
    period: readNullableString(data.period, 'period', context) ?? undefined,
    themes: readStringArray(data.themes, 'themes', context),
    influenceTags: readStringArray(data.influenceTags, 'influenceTags', context),
    shortBio: readNullableString(data.shortBio, 'shortBio', context) ?? undefined,
    fullBio: readNullableString(data.fullBio, 'fullBio', context) ?? undefined,
    wikipediaUrl: readNullableString(data.wikipediaUrl, 'wikipediaUrl', context) ?? undefined,
    goodreadsId: readNullableString(data.goodreadsId, 'goodreadsId', context) ?? undefined,
    openLibraryId: readNullableString(data.openLibraryId, 'openLibraryId', context) ?? undefined,
    wikidataId: readNullableString(data.wikidataId, 'wikidataId', context) ?? undefined,
    isni: readNullableString(data.isni, 'isni', context) ?? undefined,
    viaf: readNullableString(data.viaf, 'viaf', context) ?? undefined,
    portraitUrl: readNullableString(data.portraitUrl, 'portraitUrl', context) ?? undefined,
    gallery: readStringArray(data.gallery, 'gallery', context),
    knownWorks: readStringArray(data.knownWorks, 'knownWorks', context),
    bookIds: readStringArray(data.bookIds, 'bookIds', context),
    status: readAuthorStatus(data.status, context),
    source: readNullableString(data.source, 'source', context) ?? undefined,
    primarySource: readNullableString(data.primarySource, 'primarySource', context) ?? undefined,
    provenance: readOptionalObject(data.provenance, 'provenance', context),
    createdAt: toIsoString(data.createdAt, 'createdAt', context, false) ?? undefined,
    updatedAt: toIsoString(data.updatedAt, 'updatedAt', context, false) ?? undefined,
    createdBy: readNullableString(data.createdBy, 'createdBy', context) ?? undefined,
    updatedBy: readNullableString(data.updatedBy, 'updatedBy', context) ?? undefined,
  };
}

function mapAdminQuoteItem(item: unknown, index: number): AdminQuoteRecord {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`[adminService] Invalid admin quote at index ${index}.`);
  }
  const data = item as Record<string, unknown>;
  const context = `admin quote #${index}`;
  return {
    quoteId: readRequiredString(data.quoteId, 'quoteId', context),
    canonicalQuoteId: readRequiredString(data.canonicalQuoteId, 'canonicalQuoteId', context),
    canonicalQuoteHash:
      readNullableString(data.canonicalQuoteHash, 'canonicalQuoteHash', context) ?? undefined,
    slug: readNullableString(data.slug, 'slug', context) ?? undefined,
    canonicalText: readRequiredString(data.canonicalText, 'canonicalText', context),
    normalizedText: readRequiredString(data.normalizedText, 'normalizedText', context),
    textEn: readRequiredString(data.textEn, 'textEn', context),
    textAr: readString(data.textAr, 'textAr', context),
    sourceEn: readRequiredString(data.sourceEn, 'sourceEn', context),
    sourceAr: readString(data.sourceAr, 'sourceAr', context),
    authorId: readNullableString(data.authorId, 'authorId', context) ?? undefined,
    authorName: readNullableString(data.authorName, 'authorName', context) ?? undefined,
    bookId: readNullableString(data.bookId, 'bookId', context) ?? undefined,
    bookTitle: readNullableString(data.bookTitle, 'bookTitle', context) ?? undefined,
    chapter: readNullableString(data.chapter, 'chapter', context) ?? undefined,
    page: readOptionalNumber(data.page, 'page', context),
    section: readNullableString(data.section, 'section', context) ?? undefined,
    year: readOptionalNumber(data.year, 'year', context),
    language: readNullableString(data.language, 'language', context) ?? undefined,
    originalLanguage:
      readNullableString(data.originalLanguage, 'originalLanguage', context) ?? undefined,
    translatedFrom:
      readNullableString(data.translatedFrom, 'translatedFrom', context) ?? undefined,
    translationStatus:
      readNullableString(data.translationStatus, 'translationStatus', context) ?? undefined,
    themes: readStringArray(data.themes ?? [], 'themes', context),
    mood: readNullableString(data.mood, 'mood', context) ?? undefined,
    concepts: readStringArray(data.concepts ?? [], 'concepts', context),
    keywords: readStringArray(data.keywords ?? [], 'keywords', context),
    tags: readStringArray(data.tags ?? [], 'tags', context),
    attributionConfidence: readOptionalNumber(
      data.attributionConfidence,
      'attributionConfidence',
      context
    ),
    sourceType: readNullableString(data.sourceType, 'sourceType', context) ?? undefined,
    sourceReference:
      readNullableString(data.sourceReference, 'sourceReference', context) ?? undefined,
    provenance: readOptionalObject(data.provenance, 'provenance', context),
    status: readQuoteStatus(data.status, context),
    isPublic: data.isPublic === true,
    createdAt: toIsoString(data.createdAt, 'createdAt', context, false) ?? undefined,
    updatedAt: toIsoString(data.updatedAt, 'updatedAt', context, false) ?? undefined,
    createdBy: readNullableString(data.createdBy, 'createdBy', context) ?? undefined,
    updatedBy: readNullableString(data.updatedBy, 'updatedBy', context) ?? undefined,
  };
}

function parseAdminQuoteImportJob(payload: unknown): AdminQuoteImportJob {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('[adminService] Invalid quote import job payload.');
  }

  const data = payload as Record<string, unknown>;
  const context = 'quote import job';
  const status = readRequiredString(data.status, 'status', context);
  if (
    status !== 'registered' &&
    status !== 'running' &&
    status !== 'completed' &&
    status !== 'failed'
  ) {
    throw new Error('[adminService] Invalid quote import job status.');
  }

  return {
    status,
    storagePath: readRequiredString(data.storagePath, 'storagePath', context),
    fileName: readRequiredString(data.fileName, 'fileName', context),
    fileSize: readRequiredFiniteNumber(data.fileSize, 'fileSize', context),
    contentType: readString(data.contentType, 'contentType', context),
    totalRows: readRequiredFiniteNumber(data.totalRows, 'totalRows', context),
    processedRows: readRequiredFiniteNumber(data.processedRows, 'processedRows', context),
    createdRows: readRequiredFiniteNumber(data.createdRows, 'createdRows', context),
    duplicateRows: readRequiredFiniteNumber(data.duplicateRows, 'duplicateRows', context),
    skippedRows: readRequiredFiniteNumber(data.skippedRows, 'skippedRows', context),
    failedRows: readRequiredFiniteNumber(data.failedRows, 'failedRows', context),
    lastProcessedRow: readRequiredFiniteNumber(data.lastProcessedRow, 'lastProcessedRow', context),
    completed: data.completed === true,
    lastRunAt: readNullableString(data.lastRunAt, 'lastRunAt', context) ?? undefined,
    createdAt: readNullableString(data.createdAt, 'createdAt', context) ?? undefined,
    updatedAt: readNullableString(data.updatedAt, 'updatedAt', context) ?? undefined,
    registeredBy: readRequiredString(data.registeredBy, 'registeredBy', context),
    lastError: readNullableString(data.lastError, 'lastError', context) ?? undefined,
    dailyRowLimit: readRequiredFiniteNumber(data.dailyRowLimit, 'dailyRowLimit', context),
    dailyWriteBudget: readRequiredFiniteNumber(data.dailyWriteBudget, 'dailyWriteBudget', context),
    batchRowLimit: readRequiredFiniteNumber(data.batchRowLimit, 'batchRowLimit', context),
    estimatedCompletionDays: readRequiredFiniteNumber(
      data.estimatedCompletionDays,
      'estimatedCompletionDays',
      context
    ),
  };
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

  async discoverAuthorCandidates(query: string, limit = 12): Promise<AdminAuthorImportCandidate[]> {
    const normalized = query.trim();
    if (!normalized) {
      return [];
    }
    const data = await callCallableEndpoint<{ query: string; limit?: number }, { authors: unknown[] }>(
      'discoverAuthors',
      { query: normalized, limit }
    );
    if (!Array.isArray(data.authors)) {
      throw new Error('[discoverAuthors] Invalid authors payload.');
    }
    return data.authors.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`[adminService] Invalid import candidate at index ${index}.`);
      }
      const row = item as Record<string, unknown>;
      const context = `import candidate #${index}`;
      return {
        id: readRequiredString(row.id, 'id', context),
        nameEn: readRequiredString(row.nameEn, 'nameEn', context),
        nameAr: readRequiredString(row.nameAr, 'nameAr', context),
        avatarUrl: readNullableString(row.avatarUrl, 'avatarUrl', context) ?? '',
        bioEn: readNullableString(row.bioEn, 'bioEn', context) ?? '',
        bioAr: readNullableString(row.bioAr, 'bioAr', context) ?? '',
        lifespan: readNullableString(row.lifespan, 'lifespan', context) ?? '',
        countryEn: readNullableString(row.countryEn, 'countryEn', context) ?? '',
        countryAr: readNullableString(row.countryAr, 'countryAr', context) ?? '',
        languageEn: readNullableString(row.languageEn, 'languageEn', context) ?? '',
        languageAr: readNullableString(row.languageAr, 'languageAr', context) ?? '',
        providerSource:
          row.providerSource === 'openLibrary' || row.providerSource === 'wikidata'
            ? row.providerSource
            : undefined,
        providerExternalId:
          readNullableString(row.providerExternalId, 'providerExternalId', context) ?? undefined,
        requiresCanonicalization: row.requiresCanonicalization === true,
      };
    });
  },

  async importAuthorCandidate(payload: {
    source: 'openLibrary' | 'wikidata';
    providerExternalId: string;
    rawAuthor: Record<string, unknown>;
  }): Promise<{ authorId: string; canonicalAuthorId: string; canonicalKey: string; status: string }> {
    return callCallableEndpoint<typeof payload, {
      authorId: string;
      canonicalAuthorId: string;
      canonicalKey: string;
      status: string;
    }>('ingestAuthor', payload);
  },

  async listAuthors(params: {
    query?: string;
    status?: 'active' | 'archived' | 'all';
    limit?: number;
  } = {}): Promise<AdminAuthorRecord[]> {
    const data = await callCallableEndpoint<typeof params, { authors: unknown[] }>(
      'adminListAuthors',
      params
    );
    if (!Array.isArray(data.authors)) {
      throw new Error('[adminListAuthors] Invalid authors payload.');
    }
    return data.authors.map((item, index) => mapAdminAuthorItem(item, index));
  },

  async getAuthor(authorId: string): Promise<AdminAuthorRecord> {
    const normalizedAuthorId = authorId.trim();
    if (!normalizedAuthorId) {
      throw new Error('Author ID is required.');
    }
    const data = await callCallableEndpoint<{ authorId: string }, { author: unknown }>(
      'adminGetAuthor',
      { authorId: normalizedAuthorId }
    );
    return mapAdminAuthorItem(data.author, 0);
  },

  async createAuthor(payload: {
    canonicalName: string;
    displayName?: string;
    aliases?: string[];
    slug?: string;
    birthDate?: string;
    deathDate?: string;
    birthPlace?: string;
    deathPlace?: string;
    nationality?: string;
    languages?: string[];
    genres?: string[];
    movements?: string[];
    period?: string;
    themes?: string[];
    influenceTags?: string[];
    shortBio?: string;
    fullBio?: string;
    wikipediaUrl?: string;
    goodreadsId?: string;
    openLibraryId?: string;
    wikidataId?: string;
    isni?: string;
    viaf?: string;
    portraitUrl?: string;
    gallery?: string[];
    knownWorks?: string[];
    bookIds?: string[];
    status?: 'active' | 'archived';
    source?: string;
    primarySource?: string;
    provenance?: Record<string, unknown>;
  }): Promise<{ author: AdminAuthorRecord; status: 'CREATED' | 'UPDATED' | 'MERGED' }> {
    const data = await callCallableEndpoint<typeof payload, { author: unknown; status: 'CREATED' | 'UPDATED' | 'MERGED' }>(
      'adminAuthorCreate',
      payload
    );
    return {
      author: mapAdminAuthorItem(data.author, 0),
      status: data.status,
    };
  },

  async updateAuthor(payload: {
    authorId: string;
    canonicalName: string;
    displayName?: string;
    aliases?: string[];
    slug?: string;
    birthDate?: string;
    deathDate?: string;
    birthPlace?: string;
    deathPlace?: string;
    nationality?: string;
    languages?: string[];
    genres?: string[];
    movements?: string[];
    period?: string;
    themes?: string[];
    influenceTags?: string[];
    shortBio?: string;
    fullBio?: string;
    wikipediaUrl?: string;
    goodreadsId?: string;
    openLibraryId?: string;
    wikidataId?: string;
    isni?: string;
    viaf?: string;
    portraitUrl?: string;
    gallery?: string[];
    knownWorks?: string[];
    bookIds?: string[];
    status?: 'active' | 'archived';
    source?: string;
    primarySource?: string;
    provenance?: Record<string, unknown>;
  }): Promise<{ author: AdminAuthorRecord; status: 'CREATED' | 'UPDATED' | 'MERGED' }> {
    const data = await callCallableEndpoint<typeof payload, { author: unknown; status: 'CREATED' | 'UPDATED' | 'MERGED' }>(
      'adminAuthorUpdate',
      payload
    );
    return {
      author: mapAdminAuthorItem(data.author, 0),
      status: data.status,
    };
  },

  async archiveAuthor(authorId: string): Promise<AdminAuthorRecord> {
    const normalizedAuthorId = authorId.trim();
    if (!normalizedAuthorId) {
      throw new Error('Author ID is required.');
    }
    const data = await callCallableEndpoint<{ authorId: string }, { author: unknown; archived: boolean }>(
      'adminAuthorArchive',
      { authorId: normalizedAuthorId }
    );
    return mapAdminAuthorItem(data.author, 0);
  },

  async listQuotes(params: {
    query?: string;
    status?: 'active' | 'archived' | 'all';
    authorId?: string;
    bookId?: string;
    limit?: number;
  } = {}): Promise<AdminQuoteRecord[]> {
    const data = await callCallableEndpoint<typeof params, { quotes: unknown[] }>(
      'adminListQuotes',
      params
    );
    if (!Array.isArray(data.quotes)) {
      throw new Error('[adminListQuotes] Invalid quotes payload.');
    }
    return data.quotes.map((item, index) => mapAdminQuoteItem(item, index));
  },

  async getQuote(quoteId: string): Promise<AdminQuoteRecord> {
    const normalizedQuoteId = quoteId.trim();
    if (!normalizedQuoteId) {
      throw new Error('Quote ID is required.');
    }
    const data = await callCallableEndpoint<{ quoteId: string }, { quote: unknown }>(
      'adminGetQuote',
      { quoteId: normalizedQuoteId }
    );
    return mapAdminQuoteItem(data.quote, 0);
  },

  async createQuote(payload: {
    textEn: string;
    textAr: string;
    sourceEn: string;
    sourceAr: string;
    bookId?: string;
    authorId?: string;
    isPublic?: boolean;
    chapter?: string;
    page?: number;
    section?: string;
    year?: number;
    language?: string;
    originalLanguage?: string;
    translatedFrom?: string;
    translationStatus?: string;
    themes?: string[];
    mood?: string;
    concepts?: string[];
    keywords?: string[];
    attributionConfidence?: number;
    sourceType?: string;
    sourceReference?: string;
  }): Promise<{ quote: AdminQuoteRecord; duplicate: boolean }> {
    const data = await callCallableEndpoint<typeof payload, { quote: unknown; duplicate: boolean }>(
      'adminQuoteCreate',
      payload
    );
    return {
      quote: mapAdminQuoteItem(data.quote, 0),
      duplicate: data.duplicate === true,
    };
  },

  async updateQuote(payload: {
    quoteId: string;
    textEn?: string;
    textAr?: string;
    sourceEn?: string;
    sourceAr?: string;
    bookId?: string;
    authorId?: string;
    isPublic?: boolean;
    status?: 'active' | 'archived';
    chapter?: string;
    page?: number;
    section?: string;
    year?: number;
    language?: string;
    originalLanguage?: string;
    translatedFrom?: string;
    translationStatus?: string;
    themes?: string[];
    mood?: string;
    concepts?: string[];
    keywords?: string[];
    attributionConfidence?: number;
    sourceType?: string;
    sourceReference?: string;
  }): Promise<AdminQuoteRecord> {
    const data = await callCallableEndpoint<typeof payload, { quote: unknown }>(
      'adminQuoteUpdate',
      payload
    );
    return mapAdminQuoteItem(data.quote, 0);
  },

  async archiveQuote(quoteId: string): Promise<void> {
    const normalizedQuoteId = quoteId.trim();
    if (!normalizedQuoteId) {
      throw new Error('Quote ID is required.');
    }
    await callCallableEndpoint<{ quoteId: string }, { archived: boolean; quoteId: string }>(
      'adminQuoteArchive',
      { quoteId: normalizedQuoteId }
    );
  },

  async uploadQuoteImportFile(file: File): Promise<AdminQuoteImportJob> {
    if (!(file instanceof File) || file.size <= 0) {
      throw new Error('Quote import file is required.');
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      throw new Error('Quote import file must be a CSV.');
    }

    const currentUser = getFirebaseAuth().currentUser;
    if (!currentUser?.uid) {
      throw new Error('Authentication is required.');
    }

    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);
    const tempStoragePath = `imports/${currentUser.uid}/quote_uploads/${Date.now()}_${safeFileName}`;
    await uploadBytes(ref(getFirebaseStorage(), tempStoragePath), file, {
      contentType: file.type || 'text/csv',
    });

    const data = await callCallableEndpoint<
      { storagePath: string; fileName: string; fileSize: number; contentType?: string },
      { job: unknown }
    >('adminRegisterQuoteImport', {
      storagePath: tempStoragePath,
      fileName: file.name,
      fileSize: file.size,
      ...(file.type ? { contentType: file.type } : {}),
    });

    return parseAdminQuoteImportJob(data.job);
  },

  async getQuoteImportStatus(): Promise<AdminQuoteImportJob | null> {
    const data = await callCallableEndpoint<Record<string, never>, { job: unknown | null }>(
      'adminGetQuoteImportStatus',
      {}
    );
    return data.job ? parseAdminQuoteImportJob(data.job) : null;
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
