import { httpsCallable, type Functions } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { getFirebaseAuth, getFirebaseFunctions, getFirebaseStorage } from '../firebase.ts';
import { callCallableEndpoint } from '../callable.ts';
import type {
  AdminFeedbackActivity,
  AdminFeedbackReport,
  AdminExportFeedbackCsvResponse,
  AdminExportFeedbackJsonResponse,
  AdminExportFeedbackRequest,
  AdminGetFeedbackReportResponse,
  AdminListFeedbackReportsRequest,
  AdminListFeedbackReportsResponse,
  FeedbackAttachmentMetadata,
  FeedbackIntentType,
  FeedbackSource,
  FeedbackStatus,
} from '../../contracts/apiContracts.ts';

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

export type AdminFeedbackFilters = {
  status?: FeedbackStatus;
  source?: FeedbackSource;
  intentType?: FeedbackIntentType;
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
  cursor?: string;
};

export type AdminFeedbackPage = AdminListFeedbackReportsResponse;
export type AdminFeedbackDetail = AdminGetFeedbackReportResponse;
export type AdminFeedbackCsvExport = AdminExportFeedbackCsvResponse;
export type AdminFeedbackJsonExport = AdminExportFeedbackJsonResponse;
export type { AdminFeedbackActivity, AdminFeedbackReport, FeedbackAttachmentMetadata, FeedbackIntentType, FeedbackSource, FeedbackStatus };

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

export type AdminCanonicalBookRecord = {
  bookId: string;
  canonicalBookId: string;
  title: string;
  author: string;
  language?: string;
  canonicalKey: string;
  authorId?: string;
  authorCanonicalKey?: string;
  authorityStatus: string;
  canonicalLocked: boolean;
  coverState?: string;
  coverSource?: string;
  coverAuthority?: number;
  descriptionSource?: string;
  descriptionAuthority?: number;
  primaryEditionId?: string;
  editionId?: string;
};

export type AdminCanonicalBatchRow = {
  row: number;
  input: string;
  title: string;
  author: string;
  status: 'created' | 'existing' | 'failed';
  canonicalBookId?: string;
  bookId?: string;
  editionId?: string;
  source?: 'googleBooks' | 'openLibrary';
  providerExternalId?: string;
  message?: string;
};

export type AdminCanonicalBatchSummary = {
  successCount: number;
  existingCount: number;
  failedCount: number;
};

export type AdminDeleteCascade = {
  books: number;
  editions: number;
  attachments: number;
  attachmentUploadIntents: number;
  bookIdentity: number;
  bookIngestions: number;
  coverJobs: number;
  readingProgress: number;
  userLibraryBooks: number;
  userReviews: number;
  bookStats: number;
  shelfRefs: number;
  quoteLinks: number;
  quoteSourceLinks: number;
  authorRefs: number;
  reviews: number;
  ratings: number;
  readerArtifacts: number;
  searchProjectionDocs: number;
  coverStorageFiles: number;
  originalStorageFiles: number;
  ebookStorageFiles: number;
  attachmentStorageFiles: number;
  otherSubcollectionDocs: number;
};

export type AdminDeleteGraph = {
  inputId: string;
  inputType: 'book' | 'edition' | 'unresolved';
  resolvedBookId: string | null;
  resolvedEditionId: string | null;
  editionIds: string[];
  attachmentIds: string[];
  touchedCollections: string[];
  storagePrefixes: string[];
  storagePaths: string[];
  searchProjectionSources: string[];
};

export type AdminDeleteBookResult = {
  bookId: string;
  deleted: boolean;
  dryRun?: boolean;
  resolved?: boolean;
  inputType?: 'book' | 'edition' | 'unresolved';
  collectionCounts?: Record<string, number>;
  storageCounts?: Record<string, number>;
  deleteGraph?: AdminDeleteGraph;
  cascade: AdminDeleteCascade;
};

export type AdminDeleteSeedListRow = {
  row: number;
  input: string;
  title: string;
  author: string;
  status: 'success' | 'missing' | 'failed';
  bookId?: string;
  message?: string;
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

export type AdminSpaceRecord = {
  id: string;
  spaceType: 'venue' | 'event';
  displayName: string;
  spaceSubtype: string;
  governanceStatus: string;
  claimState: string;
  stewardshipState: string;
  managedByUid: string | null;
  routePath: string | null;
};

export type AdminSeedSpaceInput = {
  spaceType: 'venue' | 'event';
  spaceSubtype: string;
  displayName: string;
  imageUrl: string;
  address?: string;
  openingHours?: string;
  descriptionEn?: string;
  websiteUrl?: string;
  phone?: string;
  dateTime?: string;
  privacy?: 'public' | 'private';
  isOnline?: boolean;
  link?: string;
  venueName?: string;
  managedByUid?: string;
  institutionId?: string;
};

export type AdminSeedSpaceResult = {
  spaceId: string;
  spaceType: 'venue' | 'event';
  collectionName: 'venues' | 'events';
  identity: {
    canonicalId: string;
    slug: string;
    displayName: string;
    normalizedName: string;
    routePath: string;
    schemaVersion: 1;
  };
  authorityProfile: Record<string, unknown>;
  managedByUid: string | null;
};

export type AdminHomeEditorialEntry = {
  id?: string;
  targetType: 'book' | 'post';
  targetId: string;
  row: 'readNow' | 'dynamicDiscovery' | 'fromTheTown';
  streamKey?: HomeDiscoverStreamKey;
  slot: number;
  mode: 'hard_pin' | 'soft_boost';
  boostWeight: number;
  startAt: string;
  endAt: string;
  regions: string[];
  languages: string[];
  editorialReason: string;
  createdBy?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  isActive: boolean;
};

export type HomeDiscoverStreamKey =
  | 'hiddenGems'
  | 'arabVoices'
  | 'recentlyDiscussed'
  | 'philosophicalFiction'
  | 'forgottenClassics'
  | 'shortReflectiveReads';

export type AdminHomeTargetPreview = {
  targetType: 'book' | 'post';
  targetId: string;
  label: string;
  subtitle: string;
  source: 'canonical_search' | 'canonical_resolver';
  preview: Record<string, unknown> | null;
  eligibility: Record<string, unknown>;
  blocking: string[];
  warnings: string[];
};

export type AdminHomePlacementPreview = {
  target: Record<string, unknown> | null;
  eligibility: Record<string, unknown>;
  blocking: string[];
  warnings: string[];
  occupancy: Record<string, unknown>;
  conflicts: Record<string, unknown>;
  schedule: {
    startAt: string;
    endAt: string;
  };
  canActivate: boolean;
};

export type ContinuityStarterPoolRecord = {
  id: string;
  title: string;
  author: string;
  language: 'en' | 'ar' | 'fr' | 'es';
  futureCanonicalKey: string;
  canonicalBookId: string | null;
  status: 'placeholder' | 'canonical_linked' | 'readable' | 'paused';
  active: boolean;
  priority: number;
  onboardingWeight: number;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminHomeEditorialPreview = {
  region: string | null;
  language: string | null;
  rows: Array<{
    row: 'readNow' | 'dynamicDiscovery' | 'fromTheTown';
    editorialCount: number;
    maxEditorial: number;
  }>;
  streams?: Array<{
    streamKey: HomeDiscoverStreamKey;
    streamLabel: string | null;
    editorialCount: number;
    featuredCount: number;
    maxEditorial: number;
    maxFeatured: number;
  }>;
  entries: AdminHomeEditorialEntry[];
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
  feedbackReports: (params: AdminFeedbackFilters = {}) =>
    [
      'admin',
      'feedback',
      'reports',
      params.status ?? null,
      params.source ?? null,
      params.intentType ?? null,
      params.createdFrom ?? null,
      params.createdTo ?? null,
      params.limit ?? null,
      params.cursor ?? null,
    ] as const,
  feedbackReport: (feedbackId: string | null | undefined) =>
    ['admin', 'feedback', 'report', feedbackId ?? null] as const,
  spaces: (query: string) => ['admin', 'spaces', query.trim().toLowerCase()] as const,
  homeEditorial: ['admin', 'homeEditorial'] as const,
  continuityStarterPool: ['admin', 'continuityStarterPool'] as const,
  homeEditorialPreview: (region: string, language: string) =>
    ['admin', 'homeEditorial', 'preview', region.trim().toLowerCase(), language.trim().toLowerCase()] as const,
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

function mapAdminCanonicalBookItem(item: unknown, index: number): AdminCanonicalBookRecord {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`[adminService] Invalid admin canonical book at index ${index}.`);
  }
  const data = item as Record<string, unknown>;
  const context = `admin canonical book #${index}`;
  return {
    bookId: readRequiredString(data.bookId, 'bookId', context),
    canonicalBookId: readRequiredString(data.canonicalBookId, 'canonicalBookId', context),
    title: readRequiredString(data.title, 'title', context),
    author: readRequiredString(data.author, 'author', context),
    language: readNullableString(data.language, 'language', context) ?? undefined,
    canonicalKey: readRequiredString(data.canonicalKey, 'canonicalKey', context),
    authorId: readNullableString(data.authorId, 'authorId', context) ?? undefined,
    authorCanonicalKey:
      readNullableString(data.authorCanonicalKey, 'authorCanonicalKey', context) ?? undefined,
    authorityStatus: readRequiredString(data.authorityStatus, 'authorityStatus', context),
    canonicalLocked: data.canonicalLocked === true,
    coverState: readNullableString(data.coverState, 'coverState', context) ?? undefined,
    coverSource: readNullableString(data.coverSource, 'coverSource', context) ?? undefined,
    coverAuthority:
      typeof data.coverAuthority === 'number' && Number.isFinite(data.coverAuthority)
        ? data.coverAuthority
        : undefined,
    descriptionSource:
      readNullableString(data.descriptionSource, 'descriptionSource', context) ?? undefined,
    descriptionAuthority:
      typeof data.descriptionAuthority === 'number' && Number.isFinite(data.descriptionAuthority)
        ? data.descriptionAuthority
        : undefined,
    primaryEditionId:
      readNullableString(data.primaryEditionId, 'primaryEditionId', context) ?? undefined,
    editionId: readNullableString(data.editionId, 'editionId', context) ?? undefined,
  };
}

function readRequiredNumber(value: unknown, field: string, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[adminService] ${context}.${field} must be a finite number.`);
  }
  return value;
}

function mapAdminCanonicalBatchRow(item: unknown, index: number): AdminCanonicalBatchRow {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`[adminService] Invalid admin canonical batch row at index ${index}.`);
  }
  const data = item as Record<string, unknown>;
  const context = `admin canonical batch row #${index}`;
  const rawStatus = readRequiredString(data.status, 'status', context);
  const status =
    rawStatus === 'seed_fallback' ||
    rawStatus === 'timeout_fallback' ||
    rawStatus === 'canonical_seed'
      ? 'created'
      : rawStatus;
  if (status !== 'created' && status !== 'existing' && status !== 'failed') {
    throw new Error(`[adminService] ${context}.status is invalid.`);
  }
  const source = readNullableString(data.source, 'source', context);
  if (source && source !== 'googleBooks' && source !== 'openLibrary') {
    throw new Error(`[adminService] ${context}.source is invalid.`);
  }
  return {
    row: readRequiredNumber(data.row, 'row', context),
    input: readRequiredString(data.input, 'input', context),
    title: readRequiredString(data.title, 'title', context),
    author: readRequiredString(data.author, 'author', context),
    status,
    canonicalBookId: readNullableString(data.canonicalBookId, 'canonicalBookId', context) ?? undefined,
    bookId: readNullableString(data.bookId, 'bookId', context) ?? undefined,
    editionId: readNullableString(data.editionId, 'editionId', context) ?? undefined,
    source: (source ?? undefined) as 'googleBooks' | 'openLibrary' | undefined,
    providerExternalId:
      readNullableString(data.providerExternalId, 'providerExternalId', context) ?? undefined,
    message: readNullableString(data.message, 'message', context) ?? undefined,
  };
}

function mapAdminDeleteCascade(item: unknown): AdminDeleteCascade {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('[adminService] Invalid admin delete cascade payload.');
  }
  const data = item as Record<string, unknown>;
  const context = 'admin delete cascade';
  return {
    books: readRequiredNumber(data.books, 'books', context),
    editions: readRequiredNumber(data.editions, 'editions', context),
    attachments: readRequiredNumber(data.attachments, 'attachments', context),
    attachmentUploadIntents: readRequiredNumber(data.attachmentUploadIntents, 'attachmentUploadIntents', context),
    bookIdentity: readRequiredNumber(data.bookIdentity, 'bookIdentity', context),
    bookIngestions: readRequiredNumber(data.bookIngestions, 'bookIngestions', context),
    coverJobs: readRequiredNumber(data.coverJobs, 'coverJobs', context),
    readingProgress: readRequiredNumber(data.readingProgress, 'readingProgress', context),
    userLibraryBooks: readRequiredNumber(data.userLibraryBooks, 'userLibraryBooks', context),
    userReviews: readRequiredNumber(data.userReviews, 'userReviews', context),
    bookStats: readRequiredNumber(data.bookStats, 'bookStats', context),
    shelfRefs: readRequiredNumber(data.shelfRefs, 'shelfRefs', context),
    quoteLinks: readRequiredNumber(data.quoteLinks, 'quoteLinks', context),
    quoteSourceLinks: readRequiredNumber(data.quoteSourceLinks, 'quoteSourceLinks', context),
    authorRefs: readRequiredNumber(data.authorRefs, 'authorRefs', context),
    reviews: readRequiredNumber(data.reviews, 'reviews', context),
    ratings: readRequiredNumber(data.ratings, 'ratings', context),
    readerArtifacts: readRequiredNumber(data.readerArtifacts, 'readerArtifacts', context),
    searchProjectionDocs: readRequiredNumber(data.searchProjectionDocs, 'searchProjectionDocs', context),
    coverStorageFiles: readRequiredNumber(data.coverStorageFiles, 'coverStorageFiles', context),
    originalStorageFiles: readRequiredNumber(data.originalStorageFiles, 'originalStorageFiles', context),
    ebookStorageFiles: readRequiredNumber(data.ebookStorageFiles, 'ebookStorageFiles', context),
    attachmentStorageFiles: readRequiredNumber(data.attachmentStorageFiles, 'attachmentStorageFiles', context),
    otherSubcollectionDocs: readRequiredNumber(data.otherSubcollectionDocs, 'otherSubcollectionDocs', context),
  };
}

function mapNumberRecord(item: unknown, context: string): Record<string, number> {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`[adminService] Invalid ${context} payload.`);
  }
  const data = item as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      readRequiredNumber(value, key, context),
    ])
  );
}

function mapStringArray(item: unknown, field: string, context: string): string[] {
  if (!Array.isArray(item)) {
    throw new Error(`[adminService] ${context}.${field} must be an array.`);
  }
  return item.map((entry, index) => readRequiredString(entry, `${field}[${index}]`, context));
}

function mapAdminDeleteGraph(item: unknown): AdminDeleteGraph {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('[adminService] Invalid admin delete graph payload.');
  }
  const data = item as Record<string, unknown>;
  const context = 'admin delete graph';
  const inputType = readRequiredString(data.inputType, 'inputType', context);
  if (inputType !== 'book' && inputType !== 'edition' && inputType !== 'unresolved') {
    throw new Error('[adminService] admin delete graph inputType is invalid.');
  }
  return {
    inputId: readRequiredString(data.inputId, 'inputId', context),
    inputType,
    resolvedBookId: readNullableString(data.resolvedBookId, 'resolvedBookId', context),
    resolvedEditionId: readNullableString(data.resolvedEditionId, 'resolvedEditionId', context),
    editionIds: mapStringArray(data.editionIds, 'editionIds', context),
    attachmentIds: mapStringArray(data.attachmentIds, 'attachmentIds', context),
    touchedCollections: mapStringArray(data.touchedCollections, 'touchedCollections', context),
    storagePrefixes: mapStringArray(data.storagePrefixes, 'storagePrefixes', context),
    storagePaths: mapStringArray(data.storagePaths, 'storagePaths', context),
    searchProjectionSources: mapStringArray(data.searchProjectionSources, 'searchProjectionSources', context),
  };
}

function mapAdminDeleteSeedListRow(item: unknown, index: number): AdminDeleteSeedListRow {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`[adminService] Invalid admin delete seed list row at index ${index}.`);
  }
  const data = item as Record<string, unknown>;
  const context = `admin delete seed list row #${index}`;
  const status = readRequiredString(data.status, 'status', context);
  if (status !== 'success' && status !== 'missing' && status !== 'failed') {
    throw new Error(`[adminService] ${context}.status is invalid.`);
  }
  return {
    row: readRequiredNumber(data.row, 'row', context),
    input: readRequiredString(data.input, 'input', context),
    title: readRequiredString(data.title, 'title', context),
    author: readRequiredString(data.author, 'author', context),
    status,
    bookId: readNullableString(data.bookId, 'bookId', context) ?? undefined,
    message: readNullableString(data.message, 'message', context) ?? undefined,
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

  async searchSpaces(query: string): Promise<AdminSpaceRecord[]> {
    const normalized = query.trim();
    if (!normalized) return [];
    const data = await callCallableEndpoint<
      { query: string; limit: number },
      { spaces: AdminSpaceRecord[] }
    >('adminSearchSpaces', {
      query: normalized,
      limit: 12,
    });
    return Array.isArray(data.spaces) ? data.spaces : [];
  },

  async seedSpace(input: AdminSeedSpaceInput): Promise<AdminSeedSpaceResult> {
    return callCallableEndpoint<AdminSeedSpaceInput, AdminSeedSpaceResult>(
      'adminSeedSpace',
      input
    );
  },

  async assignSpaceStewardship(params: {
    spaceId: string;
    spaceType: 'venue' | 'event';
    managedByUid: string;
    institutionId?: string;
  }): Promise<{ spaceId: string; spaceType: 'venue' | 'event'; managedByUid: string }> {
    return callCallableEndpoint<typeof params, { spaceId: string; spaceType: 'venue' | 'event'; managedByUid: string }>(
      'adminAssignSpaceStewardship',
      params
    );
  },

  async listHomeEditorialEntries(): Promise<AdminHomeEditorialEntry[]> {
    const data = await callCallableEndpoint<Record<string, never>, { entries: AdminHomeEditorialEntry[] }>(
      'adminListHomeEditorialEntries',
      {}
    );
    return Array.isArray(data.entries) ? data.entries : [];
  },

  async upsertHomeEditorialEntry(payload: AdminHomeEditorialEntry): Promise<AdminHomeEditorialEntry> {
    const data = await callCallableEndpoint<AdminHomeEditorialEntry, { entry: AdminHomeEditorialEntry }>(
      'adminUpsertHomeEditorialEntry',
      payload
    );
    return data.entry;
  },

  async searchHomeTargets(params: {
    query: string;
    row: AdminHomeEditorialEntry['row'];
    streamKey?: HomeDiscoverStreamKey;
    limit?: number;
  }): Promise<AdminHomeTargetPreview[]> {
    const data = await callCallableEndpoint<
      {
        query: string;
        row: AdminHomeEditorialEntry['row'];
        streamKey?: HomeDiscoverStreamKey;
        limit?: number;
      },
      { targets: AdminHomeTargetPreview[] }
    >('adminSearchHomeTargets', {
      query: params.query.trim(),
      row: params.row,
      ...(params.streamKey ? { streamKey: params.streamKey } : {}),
      ...(params.limit ? { limit: params.limit } : {}),
    });
    return Array.isArray(data.targets) ? data.targets : [];
  },

  async resolveHomeTarget(params: {
    input: string;
    row: AdminHomeEditorialEntry['row'];
    streamKey?: HomeDiscoverStreamKey;
    targetType?: AdminHomeEditorialEntry['targetType'];
  }): Promise<AdminHomeTargetPreview | null> {
    const data = await callCallableEndpoint<
      {
        input: string;
        row: AdminHomeEditorialEntry['row'];
        streamKey?: HomeDiscoverStreamKey;
        targetType?: AdminHomeEditorialEntry['targetType'];
      },
      { target: AdminHomeTargetPreview | null }
    >('adminResolveHomeTarget', {
      input: params.input.trim(),
      row: params.row,
      ...(params.streamKey ? { streamKey: params.streamKey } : {}),
      ...(params.targetType ? { targetType: params.targetType } : {}),
    });
    return data.target;
  },

  async previewHomePlacement(payload: AdminHomeEditorialEntry): Promise<AdminHomePlacementPreview> {
    const data = await callCallableEndpoint<
      AdminHomeEditorialEntry,
      { preview: AdminHomePlacementPreview }
    >('adminPreviewHomePlacement', payload);
    return data.preview;
  },

  async listContinuityStarterPool(): Promise<ContinuityStarterPoolRecord[]> {
    const data = await callCallableEndpoint<Record<string, never>, { starters: ContinuityStarterPoolRecord[] }>(
      'adminListContinuityStarterPool',
      {}
    );
    return Array.isArray(data.starters) ? data.starters : [];
  },

  async updateContinuityStarterPoolEntry(params: {
    id: string;
    active?: boolean;
    priority?: number;
    onboardingWeight?: number;
    notes?: string;
    canonicalBookId?: string | null;
    status?: ContinuityStarterPoolRecord['status'];
  }): Promise<ContinuityStarterPoolRecord> {
    const data = await callCallableEndpoint<
      typeof params,
      { starter: ContinuityStarterPoolRecord }
    >('adminUpdateContinuityStarterPoolEntry', params);
    return data.starter;
  },

  async disableHomeEditorialEntry(id: string): Promise<void> {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error('Editorial entry ID is required.');
    await callCallableEndpoint<{ id: string }, { id: string; disabled: boolean }>(
      'adminDisableHomeEditorialEntry',
      { id: normalizedId }
    );
  },

  async deleteHomeEditorialEntry(id: string): Promise<void> {
    const normalizedId = id.trim();
    if (!normalizedId) throw new Error('Editorial entry ID is required.');
    await callCallableEndpoint<{ id: string }, { id: string; deleted: boolean }>(
      'adminDeleteHomeEditorialEntry',
      { id: normalizedId }
    );
  },

  async previewHomeEditorialConsole(params: { region?: string; language?: string } = {}): Promise<AdminHomeEditorialPreview> {
    const data = await callCallableEndpoint<
      { region?: string; language?: string },
      { preview: AdminHomeEditorialPreview }
    >('adminPreviewHomeEditorialConsole', {
      ...(params.region?.trim() ? { region: params.region.trim() } : {}),
      ...(params.language?.trim() ? { language: params.language.trim() } : {}),
    });
    return data.preview;
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

  async createCanonicalBook(payload: {
    title: string;
    author: string;
    language?: string;
    isbn?: string;
    description?: string;
    coverUrl?: string;
  }): Promise<{
    book: AdminCanonicalBookRecord;
    status: 'CREATED' | 'MERGED' | 'ALREADY_COMPLETE';
  }> {
    const data = await callCallableEndpoint<
      typeof payload,
      {
        book: unknown;
        status: 'CREATED' | 'MERGED' | 'ALREADY_COMPLETE';
      }
    >('adminCreateCanonicalBook', payload);

    return {
      book: mapAdminCanonicalBookItem(data.book, 0),
      status: data.status,
    };
  },

  async seedCanonicalBatch(payload: {
    rows: string;
  }): Promise<{
    rows: AdminCanonicalBatchRow[];
    summary: AdminCanonicalBatchSummary;
  }> {
    const data = await callCallableEndpoint<
      typeof payload,
      {
        rows: unknown[];
        summary: {
          successCount: number;
          existingCount: number;
          failedCount: number;
        };
      }
    >('adminSeedCanonicalBatch', payload);

    return {
      rows: Array.isArray(data.rows) ? data.rows.map((item, index) => mapAdminCanonicalBatchRow(item, index)) : [],
      summary: {
        successCount: readRequiredNumber(data.summary?.successCount, 'successCount', 'admin canonical batch summary'),
        existingCount: readRequiredNumber(data.summary?.existingCount, 'existingCount', 'admin canonical batch summary'),
        failedCount: readRequiredNumber(data.summary?.failedCount, 'failedCount', 'admin canonical batch summary'),
      },
    };
  },

  async deleteCanonicalBook(payload: {
    bookId: string;
    dryRun?: boolean;
    confirmation?: string;
  }): Promise<AdminDeleteBookResult> {
    const data = await callCallableEndpoint<
      typeof payload,
      {
        bookId: string;
        deleted: boolean;
        dryRun?: boolean;
        resolved?: boolean;
        inputType?: 'book' | 'edition' | 'unresolved';
        collectionCounts?: unknown;
        storageCounts?: unknown;
        deleteGraph?: unknown;
        cascade: unknown;
      }
    >('adminDeleteCanonicalBook', payload);

    return {
      bookId: readRequiredString(data.bookId, 'bookId', 'adminDeleteCanonicalBook'),
      deleted: data.deleted === true,
      dryRun: data.dryRun === true ? true : undefined,
      resolved: typeof data.resolved === 'boolean' ? data.resolved : undefined,
      inputType:
        data.inputType === 'book' || data.inputType === 'edition' || data.inputType === 'unresolved'
          ? data.inputType
          : undefined,
      collectionCounts: data.collectionCounts ? mapNumberRecord(data.collectionCounts, 'admin delete collection counts') : undefined,
      storageCounts: data.storageCounts ? mapNumberRecord(data.storageCounts, 'admin delete storage counts') : undefined,
      deleteGraph: data.deleteGraph ? mapAdminDeleteGraph(data.deleteGraph) : undefined,
      cascade: mapAdminDeleteCascade(data.cascade),
    };
  },

  async deleteCanonicalSeedList(payload: {
    rows: string;
  }): Promise<{
    rows: AdminDeleteSeedListRow[];
    summary: {
      successCount: number;
      missingCount: number;
      failedCount: number;
    };
  }> {
    const data = await callCallableEndpoint<
      typeof payload,
      {
        rows: unknown[];
        summary: {
          successCount: number;
          missingCount: number;
          failedCount: number;
        };
      }
    >('adminDeleteCanonicalSeedList', payload);

    return {
      rows: Array.isArray(data.rows)
        ? data.rows.map((item, index) => mapAdminDeleteSeedListRow(item, index))
        : [],
      summary: {
        successCount: readRequiredNumber(
          data.summary?.successCount,
          'successCount',
          'admin delete seed list summary'
        ),
        missingCount: readRequiredNumber(
          data.summary?.missingCount,
          'missingCount',
          'admin delete seed list summary'
        ),
        failedCount: readRequiredNumber(
          data.summary?.failedCount,
          'failedCount',
          'admin delete seed list summary'
        ),
      },
    };
  },

  async deleteAllBooks(payload: {
    confirmation: string;
  }): Promise<{
    deletedCount: number;
    cascade: AdminDeleteCascade;
  }> {
    const data = await callCallableEndpoint<
      typeof payload,
      {
        deletedCount: number;
        cascade: unknown;
      }
    >('adminDeleteAllBooks', payload);

    return {
      deletedCount: readRequiredNumber(data.deletedCount, 'deletedCount', 'adminDeleteAllBooks'),
      cascade: mapAdminDeleteCascade(data.cascade),
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

  async listFeedbackReports(params: AdminFeedbackFilters = {}): Promise<AdminFeedbackPage> {
    return callCallableEndpoint<AdminListFeedbackReportsRequest, AdminListFeedbackReportsResponse>(
      'adminListFeedbackReports',
      {
        ...(params.status ? { status: params.status } : {}),
        ...(params.source ? { source: params.source } : {}),
        ...(params.intentType ? { intentType: params.intentType } : {}),
        ...(params.createdFrom ? { createdFrom: params.createdFrom } : {}),
        ...(params.createdTo ? { createdTo: params.createdTo } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
        ...(params.cursor ? { cursor: params.cursor } : {}),
      }
    );
  },

  async getFeedbackReport(feedbackId: string): Promise<AdminFeedbackDetail> {
    return callCallableEndpoint<{ feedbackId: string }, AdminGetFeedbackReportResponse>(
      'adminGetFeedbackReport',
      { feedbackId }
    );
  },

  async updateFeedbackStatus(feedbackId: string, status: FeedbackStatus): Promise<AdminFeedbackReport> {
    const data = await callCallableEndpoint<
      { feedbackId: string; status: FeedbackStatus },
      { report: AdminFeedbackReport }
    >(
      'adminUpdateFeedbackStatus',
      { feedbackId, status }
    );
    return data.report;
  },

  async addFeedbackNote(feedbackId: string, note: string): Promise<AdminFeedbackActivity> {
    const data = await callCallableEndpoint<
      { feedbackId: string; note: string },
      { activity: AdminFeedbackActivity }
    >(
      'adminAddFeedbackNote',
      { feedbackId, note }
    );
    return data.activity;
  },

  async exportFeedbackCsv(params: AdminFeedbackFilters & { feedbackId?: string } = {}): Promise<AdminFeedbackCsvExport> {
    return callCallableEndpoint<AdminExportFeedbackRequest, AdminExportFeedbackCsvResponse>(
      'adminExportFeedbackCsv',
      {
        ...(params.feedbackId ? { feedbackId: params.feedbackId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.source ? { source: params.source } : {}),
        ...(params.intentType ? { intentType: params.intentType } : {}),
        ...(params.createdFrom ? { createdFrom: params.createdFrom } : {}),
        ...(params.createdTo ? { createdTo: params.createdTo } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
      }
    );
  },

  async exportFeedbackJson(params: AdminFeedbackFilters & { feedbackId?: string } = {}): Promise<AdminFeedbackJsonExport> {
    return callCallableEndpoint<AdminExportFeedbackRequest, AdminExportFeedbackJsonResponse>(
      'adminExportFeedbackJson',
      {
        ...(params.feedbackId ? { feedbackId: params.feedbackId } : {}),
        ...(params.status ? { status: params.status } : {}),
        ...(params.source ? { source: params.source } : {}),
        ...(params.intentType ? { intentType: params.intentType } : {}),
        ...(params.createdFrom ? { createdFrom: params.createdFrom } : {}),
        ...(params.createdTo ? { createdTo: params.createdTo } : {}),
        ...(params.limit ? { limit: params.limit } : {}),
      }
    );
  },

  async deleteFeedbackAttachment(feedbackId: string, attachmentId: string): Promise<void> {
    await callCallableEndpoint<
      { feedbackId: string; attachmentId: string },
      { attachmentId: string; deleted: boolean }
    >(
      'adminDeleteFeedbackAttachment',
      { feedbackId, attachmentId }
    );
  },

};
