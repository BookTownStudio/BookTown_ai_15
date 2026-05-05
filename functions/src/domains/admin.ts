import { wrapCallableV2 } from "../contracts/wrapCallableV2";
import { backfillDerivedStats as backfillDerivedStatsRaw } from "../admin/backfillStats";
import { backfillReadingProgressCanonical as backfillReadingProgressCanonicalRaw } from "../admin/backfillReadingProgressCanonical";
import {
  adminListAuthors as adminListAuthorsRaw,
  adminGetAuthor as adminGetAuthorRaw,
  adminAuthorCreate as adminAuthorCreateRaw,
  adminAuthorUpdate as adminAuthorUpdateRaw,
  adminAuthorArchive as adminAuthorArchiveRaw,
  adminCreateCanonicalBook as adminCreateCanonicalBookRaw,
  adminMergeCanonicalBooks as adminMergeCanonicalBooksRaw,
  adminDeleteCanonicalBook as adminDeleteCanonicalBookRaw,
  adminDeleteCanonicalSeedList as adminDeleteCanonicalSeedListRaw,
  adminDeleteAllBooks as adminDeleteAllBooksRaw,
  adminSeedCanonicalBatch as adminSeedCanonicalBatchRaw,
} from "../admin/literaryAuthority";

export const backfillDerivedStats = wrapCallableV2("backfillDerivedStats", backfillDerivedStatsRaw);
export const backfillReadingProgressCanonical = wrapCallableV2("backfillReadingProgressCanonical", backfillReadingProgressCanonicalRaw);
export const adminListAuthors = wrapCallableV2("adminListAuthors", adminListAuthorsRaw);
export const adminGetAuthor = wrapCallableV2("adminGetAuthor", adminGetAuthorRaw);
export const adminAuthorCreate = wrapCallableV2("adminAuthorCreate", adminAuthorCreateRaw);
export const adminAuthorUpdate = wrapCallableV2("adminAuthorUpdate", adminAuthorUpdateRaw);
export const adminAuthorArchive = wrapCallableV2("adminAuthorArchive", adminAuthorArchiveRaw);
export const adminCreateCanonicalBook = wrapCallableV2("adminCreateCanonicalBook", adminCreateCanonicalBookRaw);
export const adminMergeCanonicalBooks = wrapCallableV2("adminMergeCanonicalBooks", adminMergeCanonicalBooksRaw);
export const adminDeleteCanonicalBook = wrapCallableV2("adminDeleteCanonicalBook", adminDeleteCanonicalBookRaw);
export const adminDeleteCanonicalSeedList = wrapCallableV2("adminDeleteCanonicalSeedList", adminDeleteCanonicalSeedListRaw);
export const adminDeleteAllBooks = wrapCallableV2("adminDeleteAllBooks", adminDeleteAllBooksRaw);
export const adminSeedCanonicalBatch = wrapCallableV2("adminSeedCanonicalBatch", adminSeedCanonicalBatchRaw);

export { scheduledNotificationCleanup } from "../admin/cleanupNotifications";
export { scheduledAttachmentCleanup } from "../admin/cleanupAttachments";
export { scheduledReviewAggregateReconcile } from "../admin/reconcileReviewAggregates";
export { scheduledLibrarianQuotaCleanup } from "../admin/cleanupLibrarianQuota";
export {
  listDeletionRequests,
  createDeletionRequest,
  reviewDeletionRequest,
  executeDeletion,
} from "../control/deleteRequests";
export { searchUsersForAdmin } from "../control/adminUserDiscovery";
export {
  getSystemMetricsSnapshot,
  getSystemMetricsDailyRange,
} from "../control/analyticsMetrics";
export {
  getRecentSystemEvents,
  getSystemHealthSnapshot,
} from "../control/systemEventsAdmin";
export { purgeDeletedUsers } from "../control/purgeDeletedUsers";
export { exportDailyAnalyticsSnapshot } from "../analytics/dailyExport";
export {
  onIntelligenceSignalQueued,
  scheduledIntelligenceProfileBuilder,
  scheduledIntelligenceQueueCleanup,
} from "../intelligence/profileBuilder";
export { scheduledIntelligenceProfileReconciliation } from "../intelligence/reconciliation";
export { scheduledLibrarianAggregationWorker } from "../intelligence/aggregationWorker";
export { scheduledIntelligenceAuditWorker } from "../intelligence/auditWorker";
export { scheduledIntelligenceDriftMonitor } from "../intelligence/driftMonitor";
