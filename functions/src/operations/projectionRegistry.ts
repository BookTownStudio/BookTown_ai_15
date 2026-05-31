import {
  evaluateProjectionCertification,
  MAX_RECOVERY_RUNTIME_SECONDS,
  type ProjectionCertificationGateResult,
  type ProjectionCertificationStatus,
  type ProjectionClassification,
  type ProjectionDefinition,
  type ProjectionHealth,
  type ProjectionMaintainer,
} from "./projectionRecoveryControlPlane";

export type RegisteredProjectionDefinition = ProjectionDefinition & {
  recoveryGaps: string[];
  notes: string;
};

export type ProjectionCertificationReport = {
  total: number;
  statusBreakdown: Record<ProjectionCertificationStatus, number>;
  productionReady: string[];
  betaReady: string[];
  notReady: string[];
  deprecated: string[];
  failingProductionRequired: ProjectionCertificationGateResult[];
  topRemainingGaps: Array<{
    requirement: string;
    count: number;
    projections: string[];
  }>;
};

const DEFAULT_MAX_BATCH_SIZE = 100;
const DEFAULT_REQUIRED_RUNTIME_SECONDS = MAX_RECOVERY_RUNTIME_SECONDS;
const RUNBOOK_ROOT = "docs/operations/projections";

function defineProjection(input: {
  projectionName: string;
  classification: ProjectionClassification;
  authoritySources: string[];
  projectionCollections: string[];
  maintainer: ProjectionMaintainer;
  currentConsumers: string[];
  currentCertificationStatus: ProjectionCertificationStatus;
  requiredCertificationStatus?: ProjectionCertificationStatus;
  rebuildSupported?: boolean;
  verificationSupported?: boolean;
  reconciliationSupported?: boolean;
  failureLedgerSupported?: boolean;
  dryRunSupported?: boolean;
  checkpointSupported?: boolean;
  structuredReportingSupported?: boolean;
  idempotent?: boolean;
  restartable?: boolean;
  requiredIndexes?: string[];
  runbookPath?: string | null;
  recoveryGaps: string[];
  notes: string;
}): RegisteredProjectionDefinition {
  return {
    projectionName: input.projectionName,
    classification: input.classification,
    authoritySources: input.authoritySources,
    projectionCollections: input.projectionCollections,
    maintainer: input.maintainer,
    currentConsumers: input.currentConsumers,
    rebuildSupported: input.rebuildSupported ?? false,
    verificationSupported: input.verificationSupported ?? false,
    reconciliationSupported: input.reconciliationSupported ?? false,
    failureLedgerSupported: input.failureLedgerSupported ?? false,
    dryRunSupported: input.dryRunSupported ?? false,
    checkpointSupported: input.checkpointSupported ?? false,
    structuredReportingSupported: input.structuredReportingSupported ?? false,
    idempotent: input.idempotent ?? false,
    restartable: input.restartable ?? false,
    destructiveRebuildAllowed: false,
    maxBatchSize: DEFAULT_MAX_BATCH_SIZE,
    maxRuntimeSeconds: DEFAULT_REQUIRED_RUNTIME_SECONDS,
    requiredIndexes: input.requiredIndexes ?? [],
    runbookPath: input.runbookPath ?? null,
    currentCertificationStatus: input.currentCertificationStatus,
    requiredCertificationStatus:
      input.requiredCertificationStatus ?? "production_ready",
    recoveryGaps: input.recoveryGaps,
    notes: input.notes,
  };
}

const quoteProjectionBase = {
  classification: "fanout_projection" as const,
  authoritySources: ["quotes/{quoteId}"],
  maintainer: "hybrid" as const,
  currentConsumers: [
    "quote APIs",
    "social composer quote attachments",
    "quote discovery",
  ],
  currentCertificationStatus: "production_ready" as const,
  rebuildSupported: true,
  verificationSupported: true,
  failureLedgerSupported: true,
  dryRunSupported: true,
  checkpointSupported: true,
  structuredReportingSupported: true,
  idempotent: true,
  restartable: true,
  requiredIndexes: ["quotes(__name__)", "quotes(authorUid,__name__)", "quotes(ownerId,__name__)", "quotes(bookId,__name__)"],
  runbookPath: `${RUNBOOK_ROOT}/QuoteProjectionRecoveryRunbook.md`,
  recoveryGaps: [],
  notes: "Quote projection recovery is implemented through the Phase 8A recovery control plane.",
};

const reviewProjectionBase = {
  classification: "fanout_projection" as const,
  authoritySources: ["reviews/{reviewId}"],
  maintainer: "hybrid" as const,
  currentConsumers: [
    "listBookReviews",
    "profile review hydration",
    "social review surfaces",
  ],
  currentCertificationStatus: "production_ready" as const,
  rebuildSupported: true,
  verificationSupported: true,
  failureLedgerSupported: true,
  dryRunSupported: true,
  checkpointSupported: true,
  structuredReportingSupported: true,
  idempotent: true,
  restartable: true,
  requiredIndexes: ["reviews(__name__)", "reviews(uid,__name__)", "reviews(userId,__name__)", "reviews(bookId,__name__)"],
  runbookPath: `${RUNBOOK_ROOT}/ReviewProjectionRecoveryRunbook.md`,
  recoveryGaps: [],
  notes: "Review projection recovery is implemented through the Phase 8A recovery control plane.",
};

const searchProjectionBase = {
  classification: "search_projection" as const,
  maintainer: "hybrid" as const,
  currentCertificationStatus: "production_ready" as const,
  rebuildSupported: true,
  verificationSupported: true,
  reconciliationSupported: true,
  failureLedgerSupported: true,
  dryRunSupported: true,
  checkpointSupported: true,
  structuredReportingSupported: true,
  idempotent: true,
  restartable: true,
  recoveryGaps: [],
  notes: "Search projection recovery is implemented through the Phase 8A recovery control plane.",
};

export const PROJECTION_REGISTRY_ENTRIES: RegisteredProjectionDefinition[] = [
  defineProjection({
    ...quoteProjectionBase,
    projectionName: "user_quotes",
    projectionCollections: ["user_quotes"],
  }),
  defineProjection({
    ...quoteProjectionBase,
    projectionName: "book_quote_projection",
    projectionCollections: ["book_quote_projection"],
  }),
  defineProjection({
    ...quoteProjectionBase,
    projectionName: "social_quote_projection",
    projectionCollections: ["social_quote_projection"],
  }),
  defineProjection({
    ...reviewProjectionBase,
    projectionName: "user_reviews",
    projectionCollections: ["user_reviews"],
  }),
  defineProjection({
    ...reviewProjectionBase,
    projectionName: "book_review_projection",
    projectionCollections: ["book_review_projection"],
  }),
  defineProjection({
    ...reviewProjectionBase,
    projectionName: "social_review_projection",
    projectionCollections: ["social_review_projection"],
  }),
  defineProjection({
    projectionName: "legacy_user_reviews_projection",
    classification: "compatibility_projection",
    authoritySources: ["books/{bookId}/reviews/{reviewId}"],
    projectionCollections: ["user_reviews"],
    maintainer: "manual_rebuild",
    currentConsumers: ["profile compatibility reads"],
    currentCertificationStatus: "beta_ready",
    requiredCertificationStatus: "deprecated",
    rebuildSupported: true,
    dryRunSupported: true,
    structuredReportingSupported: true,
    idempotent: true,
    requiredIndexes: ["collectionGroup(reviews).where(userId==uid)"],
    recoveryGaps: ["sunset plan", "canonical review migration"],
    notes: "Legacy projection should be retired after canonical top-level review recovery is certified.",
  }),
  defineProjection({
    projectionName: "notification_summary",
    classification: "aggregate_projection",
    authoritySources: ["notifications/{notificationId}", "activity_log"],
    projectionCollections: ["notification_summary", "users/{uid}/meta/unread"],
    maintainer: "hybrid",
    currentConsumers: ["notification feed", "unread badges"],
    currentCertificationStatus: "production_ready",
    rebuildSupported: true,
    verificationSupported: true,
    reconciliationSupported: true,
    failureLedgerSupported: true,
    dryRunSupported: true,
    checkpointSupported: true,
    structuredReportingSupported: true,
    idempotent: true,
    restartable: true,
    requiredIndexes: ["notifications(__name__)", "notifications(uid)", "notification_summary(__name__)"],
    runbookPath: `${RUNBOOK_ROOT}/NotificationSummaryRecoveryRunbook.md`,
    recoveryGaps: [],
    notes: "Notification summary recovery recomputes aggregate truth from canonical notifications through the Phase 8A recovery control plane.",
  }),
  defineProjection({
    ...searchProjectionBase,
    projectionName: "search_feed",
    authoritySources: ["posts", "post_stats"],
    projectionCollections: ["search_feed"],
    currentConsumers: ["social search", "discovery feed search"],
    requiredIndexes: ["posts(__name__)", "posts(authorId,__name__)", "post_stats(__name__)", "search_feed(__name__)", "search_feed(status,visibility,createdAt)"],
    runbookPath: `${RUNBOOK_ROOT}/SearchFeedRecoveryRunbook.md`,
  }),
  defineProjection({
    ...searchProjectionBase,
    projectionName: "search_bookmarks",
    authoritySources: [
      "users/{uid}/bookmarks",
      "users/{uid}/venue_bookmarks",
      "users/{uid}/event_bookmarks",
    ],
    projectionCollections: ["search_bookmarks"],
    currentConsumers: ["search personalization", "bookmark filters"],
    requiredIndexes: ["collectionGroup(bookmarks)", "search_bookmarks(__name__)", "search_bookmarks(uid,entityType,createdAt)"],
    runbookPath: `${RUNBOOK_ROOT}/SearchBookmarksRecoveryRunbook.md`,
  }),
  defineProjection({
    ...searchProjectionBase,
    projectionName: "search_notifications",
    authoritySources: ["notifications/{id}"],
    projectionCollections: ["search_notifications"],
    currentConsumers: ["notification search", "admin notification search"],
    requiredIndexes: ["notifications(__name__)", "notifications(uid)", "search_notifications(__name__)", "search_notifications(uid,read,createdAt)"],
    runbookPath: `${RUNBOOK_ROOT}/SearchNotificationsRecoveryRunbook.md`,
  }),
  defineProjection({
    projectionName: "user_library_books",
    classification: "aggregate_projection",
    authoritySources: ["shelf_books", "reading_progress"],
    projectionCollections: ["user_library_books"],
    maintainer: "hybrid",
    currentConsumers: ["library", "profile", "search", "admin"],
    currentCertificationStatus: "not_ready",
    rebuildSupported: true,
    idempotent: true,
    requiredIndexes: ["user_library_books(uid,updatedAt)"],
    recoveryGaps: [
      "non-destructive checkpointed rebuild",
      "verification",
      "failure ledger",
      "runbook",
    ],
    notes: "Existing global rebuild path is not production-safe because it deletes and reconstructs broadly.",
  }),
  defineProjection({
    projectionName: "book_stats",
    classification: "aggregate_projection",
    authoritySources: ["reviews", "books/{bookId}/reviews", "books/{bookId}/ratings"],
    projectionCollections: ["book_stats"],
    maintainer: "hybrid",
    currentConsumers: ["book cards", "review APIs", "search ranking"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    reconciliationSupported: true,
    dryRunSupported: true,
    checkpointSupported: true,
    structuredReportingSupported: true,
    idempotent: true,
    restartable: true,
    requiredIndexes: ["book_stats(__name__)"],
    recoveryGaps: ["failure ledger", "runbook", "hot-book strategy above reconciliation cap"],
    notes: "Scheduled reconciliation exists but requires failure recovery and operator documentation.",
  }),
  defineProjection({
    projectionName: "user_stats",
    classification: "aggregate_projection",
    authoritySources: [
      "followers",
      "following",
      "shelves",
      "user_library_books",
      "attachments",
      "profile fields",
    ],
    projectionCollections: ["user_stats"],
    maintainer: "hybrid",
    currentConsumers: ["profile UI", "admin"],
    currentCertificationStatus: "not_ready",
    rebuildSupported: true,
    requiredIndexes: ["user_stats(__name__)"],
    recoveryGaps: [
      "domain split",
      "checkpointing",
      "verification",
      "failure ledger",
      "runbook",
    ],
    notes: "Current global backfill behavior must be split into bounded domain jobs.",
  }),
  defineProjection({
    projectionName: "post_stats",
    classification: "aggregate_projection",
    authoritySources: ["likes", "comments", "reposts", "bookmarks"],
    projectionCollections: ["post_stats", "posts.counters"],
    maintainer: "trigger",
    currentConsumers: ["feeds", "social cards", "search ranking"],
    currentCertificationStatus: "not_ready",
    rebuildSupported: true,
    verificationSupported: true,
    requiredIndexes: ["post_stats(__name__)"],
    recoveryGaps: [
      "checkpointed rebuild",
      "deterministic reconcile",
      "failure ledger",
      "runbook",
    ],
    notes: "Counter repair exists inside broad backfill but is not production-certified.",
  }),
  defineProjection({
    projectionName: "runtime_health_projection",
    classification: "operational_projection",
    authoritySources: ["recordOperationalMetric calls"],
    projectionCollections: [
      "operational_metrics",
      "runtime_health_projection",
      "beta_observability_summary",
    ],
    maintainer: "hybrid",
    currentConsumers: ["operational dashboard"],
    currentCertificationStatus: "beta_ready",
    verificationSupported: true,
    requiredIndexes: ["runtime_health_projection(__name__)"],
    recoveryGaps: ["rebuild from retained metrics", "runbook"],
    notes: "Operational projection exists for visibility but not as a certified recovery ledger.",
  }),
  defineProjection({
    projectionName: "runtime_anomaly_projection",
    classification: "operational_projection",
    authoritySources: ["operational_metrics"],
    projectionCollections: ["runtime_anomaly_projection", "runtime_anomaly_events"],
    maintainer: "hybrid",
    currentConsumers: ["operational dashboard"],
    currentCertificationStatus: "beta_ready",
    verificationSupported: true,
    requiredIndexes: ["runtime_anomaly_projection(updatedAt)"],
    recoveryGaps: ["recompute workflow", "resolve workflow", "runbook"],
    notes: "Anomaly projection is visible but not yet recoverable through the shared control plane.",
  }),
  defineProjection({
    projectionName: "post_analytics",
    classification: "aggregate_projection",
    authoritySources: ["activity_log"],
    projectionCollections: ["post_analytics"],
    maintainer: "trigger",
    currentConsumers: ["analytics", "admin"],
    currentCertificationStatus: "not_ready",
    recoveryGaps: ["idempotent event ledger", "rebuild", "verification", "runbook"],
    notes: "Activity-derived counters have no deterministic replay job yet.",
  }),
  defineProjection({
    projectionName: "activity_log_notifications",
    classification: "fanout_projection",
    authoritySources: ["social actions", "posts", "follows"],
    projectionCollections: ["activity_log", "notifications"],
    maintainer: "trigger",
    currentConsumers: ["notifications", "analytics"],
    currentCertificationStatus: "not_ready",
    recoveryGaps: ["replay procedure", "failure ledger", "runbook"],
    notes: "Notification fanout from activity log needs replay and ledger semantics.",
  }),
  defineProjection({
    projectionName: "public_profile_counters",
    classification: "aggregate_projection",
    authoritySources: ["users/{uid}/followers"],
    projectionCollections: ["public_profiles.followerCount", "public_profiles.followingCount"],
    maintainer: "trigger",
    currentConsumers: ["profile UI", "search"],
    currentCertificationStatus: "not_ready",
    recoveryGaps: ["bounded counter reconcile", "verification", "runbook"],
    notes: "Follower counters are trigger-maintained and need bounded verification.",
  }),
  defineProjection({
    projectionName: "shelf_display_projection",
    classification: "compatibility_projection",
    authoritySources: ["shelf_books"],
    projectionCollections: ["shelf DTOs", "legacy shelf display fields"],
    maintainer: "hybrid",
    currentConsumers: ["shelf UI", "profile shelves"],
    currentCertificationStatus: "beta_ready",
    verificationSupported: true,
    failureLedgerSupported: true,
    requiredIndexes: ["shelf_books(ownerId,shelfId,addedAt)"],
    recoveryGaps: ["formal rebuild contract", "runbook"],
    notes: "Shelf UI projections are moving to shelf_books-backed DTOs.",
  }),
  defineProjection({
    projectionName: "reading_progress_compatibility_fields",
    classification: "compatibility_projection",
    authoritySources: ["reading_progress"],
    projectionCollections: ["reading_progress"],
    maintainer: "hybrid",
    currentConsumers: ["reader insights", "continue reading", "shelf status"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    dryRunSupported: true,
    structuredReportingSupported: true,
    idempotent: true,
    requiredIndexes: ["reading_progress(uid,status_state,lastActiveAt)"],
    recoveryGaps: ["failure ledger", "scheduled verification", "runbook"],
    notes: "Canonicalization backfill exists but is not fully certified.",
  }),
  defineProjection({
    projectionName: "reader_insights_dto",
    classification: "compatibility_projection",
    authoritySources: ["reading_progress", "reader_events"],
    projectionCollections: ["callable response only"],
    maintainer: "manual_rebuild",
    currentConsumers: ["Home", "Read continue reading"],
    currentCertificationStatus: "beta_ready",
    verificationSupported: true,
    requiredIndexes: [
      "reading_progress(uid,status_state,lastActiveAt)",
      "reader_events(uid,event,occurredAt)",
    ],
    recoveryGaps: ["query health runbook", "verification report"],
    notes: "DTO-only projection is not persisted, but its query/index health must be certified.",
  }),
  defineProjection({
    projectionName: "reader_manifests",
    classification: "media_derivative_projection",
    authoritySources: ["readable book attachment", "storage object"],
    projectionCollections: ["reader_manifests"],
    maintainer: "hybrid",
    currentConsumers: ["reader bootstrap"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    idempotent: true,
    requiredIndexes: ["reader_manifests(__name__)"],
    recoveryGaps: ["manifest rebuild job", "failed-manifest ledger", "runbook"],
    notes: "Manifest creation is deterministic but lacks certified reprocess workflow.",
  }),
  defineProjection({
    projectionName: "reader_epub_indexes",
    classification: "media_derivative_projection",
    authoritySources: ["EPUB storage object"],
    projectionCollections: [
      "reader_location_map",
      "reader_spine_map",
      "reader_section_graph",
      "reader_stable_anchor_map",
      "reader_navigation_index",
      "reader_pagination_hints",
      "reader_literary_coordinate_map",
      "reader_passage_index",
      "reader_annotation_identity_index",
      "reader_literary_memory_primitives",
    ],
    maintainer: "hybrid",
    currentConsumers: ["reader runtime", "quote anchoring", "highlight anchoring"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    idempotent: true,
    requiredIndexes: ["reader_* indexes by __name__"],
    recoveryGaps: ["checkpointed reprocess", "failure ledger", "runbook"],
    notes: "EPUB indexes are server-generated but not yet control-plane recoverable.",
  }),
  defineProjection({
    projectionName: "reader_highlights_bookmarks",
    classification: "compatibility_projection",
    authoritySources: ["reader sync operations"],
    projectionCollections: ["reader_highlights", "reader_bookmarks"],
    maintainer: "hybrid",
    currentConsumers: ["reader UI", "profile", "admin merge cleanup"],
    currentCertificationStatus: "beta_ready",
    verificationSupported: true,
    requiredIndexes: ["reader_highlights(uid,bookId)", "reader_bookmarks(uid,bookId)"],
    recoveryGaps: ["authority-adjacent classification", "failure ledger", "runbook"],
    notes: "These are user data surfaces and need careful recovery semantics.",
  }),
  defineProjection({
    projectionName: "reader_events",
    classification: "operational_projection",
    authoritySources: ["reader operations"],
    projectionCollections: ["reader_events"],
    maintainer: "hybrid",
    currentConsumers: ["streaks", "diagnostics", "analytics"],
    currentCertificationStatus: "beta_ready",
    verificationSupported: true,
    requiredIndexes: ["reader_events(uid,event,occurredAt)"],
    recoveryGaps: ["retention policy", "runbook"],
    notes: "Reader event durability and retention need production certification.",
  }),
  defineProjection({
    projectionName: "reader_sync_idempotency",
    classification: "operational_projection",
    authoritySources: ["reader sync calls"],
    projectionCollections: ["reader_sync_idempotency"],
    maintainer: "hybrid",
    currentConsumers: ["reader replay safety"],
    currentCertificationStatus: "beta_ready",
    verificationSupported: true,
    requiredIndexes: ["reader_sync_idempotency(__name__)"],
    recoveryGaps: ["retention policy", "stuck-operation checks", "runbook"],
    notes: "Idempotency state needs operational lifecycle rules.",
  }),
  defineProjection({
    projectionName: "reader_audit_diagnostics",
    classification: "operational_projection",
    authoritySources: ["reader diagnostic calls"],
    projectionCollections: ["reader_audit", "reader diagnostics"],
    maintainer: "hybrid",
    currentConsumers: ["ops", "debug"],
    currentCertificationStatus: "not_ready",
    recoveryGaps: ["retention", "health queries", "runbook"],
    notes: "Diagnostic projections need health and retention definition.",
  }),
  defineProjection({
    projectionName: "attachment_metadata",
    classification: "media_derivative_projection",
    authoritySources: ["upload intent", "storage object"],
    projectionCollections: ["attachments"],
    maintainer: "hybrid",
    currentConsumers: ["social composer", "feed rendering", "media URLs"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    reconciliationSupported: true,
    failureLedgerSupported: true,
    requiredIndexes: ["attachments(processingStatus,updatedAt)"],
    recoveryGaps: ["explicit reprocess command", "runbook"],
    notes: "Attachment status exists but needs standard control-plane commands.",
  }),
  defineProjection({
    projectionName: "attachment_image_derivatives",
    classification: "media_derivative_projection",
    authoritySources: ["original image storage object"],
    projectionCollections: ["storage derivative files", "attachments.renditions"],
    maintainer: "trigger",
    currentConsumers: ["feed rendering", "media rendering"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    reconciliationSupported: true,
    failureLedgerSupported: true,
    requiredIndexes: ["attachments(processingStatus,updatedAt)"],
    recoveryGaps: ["bounded storage scan", "runbook"],
    notes: "Derivative processor can retry by object, but registry-backed recovery is not implemented.",
  }),
  defineProjection({
    projectionName: "attachment_cleanup_counters",
    classification: "aggregate_projection",
    authoritySources: ["expired attachment docs"],
    projectionCollections: ["user_stats.attachmentStorageBytes"],
    maintainer: "scheduled_job",
    currentConsumers: ["user stats", "admin"],
    currentCertificationStatus: "not_ready",
    recoveryGaps: ["deterministic reconcile", "failure ledger", "runbook"],
    notes: "Cleanup mutates counters without certified reconciliation.",
  }),
  defineProjection({
    projectionName: "cover_derivatives",
    classification: "media_derivative_projection",
    authoritySources: ["books", "external cover sources", "user cover sources"],
    projectionCollections: ["cover_jobs", "book cover fields", "storage covers"],
    maintainer: "hybrid",
    currentConsumers: ["catalog cards", "search"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    requiredIndexes: ["cover_jobs(status,updatedAt)"],
    recoveryGaps: ["failure ledger", "runbook"],
    notes: "Cover recovery exists in scattered utilities and should use the control plane.",
  }),
  defineProjection({
    projectionName: "book_search_fields",
    classification: "search_projection",
    authoritySources: ["books", "editions"],
    projectionCollections: ["books.search", "editions.search"],
    maintainer: "hybrid",
    currentConsumers: ["book search engine"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    dryRunSupported: true,
    checkpointSupported: true,
    structuredReportingSupported: true,
    idempotent: true,
    restartable: true,
    requiredIndexes: ["books(__name__)", "editions(__name__)"],
    recoveryGaps: ["failure ledger", "runbook"],
    notes: "Search-field backfill is bounded but not yet fully operationalized.",
  }),
  defineProjection({
    projectionName: "reader_authority_projection",
    classification: "compatibility_projection",
    authoritySources: ["book attachments", "edition attachments", "rights"],
    projectionCollections: ["books.readerAuthority", "editions readability fields"],
    maintainer: "hybrid",
    currentConsumers: ["search results", "reader entry"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    dryRunSupported: true,
    structuredReportingSupported: true,
    idempotent: true,
    requiredIndexes: ["books(__name__)", "editions(__name__)"],
    recoveryGaps: ["production rebuild contract", "failure ledger", "runbook"],
    notes: "Backfill exists but needs Phase 8A certification and runbook.",
  }),
  defineProjection({
    projectionName: "compatibility_readability_fields",
    classification: "compatibility_projection",
    authoritySources: ["readerAuthority", "readable attachment evidence"],
    projectionCollections: ["books.downloadable", "books.isEbookAvailable"],
    maintainer: "hybrid",
    currentConsumers: ["legacy client", "search DTOs"],
    currentCertificationStatus: "beta_ready",
    requiredCertificationStatus: "deprecated",
    rebuildSupported: true,
    verificationSupported: true,
    requiredIndexes: ["books(__name__)"],
    recoveryGaps: ["sunset plan", "runbook under readerAuthority"],
    notes: "Compatibility fields should be retired behind readerAuthority.",
  }),
  defineProjection({
    projectionName: "catalog_identity_projection",
    classification: "compatibility_projection",
    authoritySources: ["canonical ingestion", "materialization"],
    projectionCollections: ["book_identity", "author_identity", "canonical keys"],
    maintainer: "hybrid",
    currentConsumers: ["ingestion dedupe", "search"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    failureLedgerSupported: true,
    requiredIndexes: ["book_identity(__name__)", "author_identity(__name__)"],
    recoveryGaps: ["runbook"],
    notes: "Identity projections are critical to ingestion and need formal runbook coverage.",
  }),
  defineProjection({
    projectionName: "authored_author_link_projection",
    classification: "fanout_projection",
    authoritySources: ["users", "public_profiles", "authors"],
    projectionCollections: ["author_user_links", "authored author fields"],
    maintainer: "hybrid",
    currentConsumers: ["author catalog", "profile"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    failureLedgerSupported: true,
    requiredIndexes: ["author_user_links(__name__)"],
    recoveryGaps: ["reconciliation", "runbook"],
    notes: "Author/profile link materialization needs typed recovery.",
  }),
  defineProjection({
    projectionName: "social_post_render_projection",
    classification: "fanout_projection",
    authoritySources: ["post content", "attached entity snapshots"],
    projectionCollections: ["posts.renderProjection", "attachment snapshot fields"],
    maintainer: "hybrid",
    currentConsumers: ["social feed read path"],
    currentCertificationStatus: "not_ready",
    verificationSupported: true,
    failureLedgerSupported: true,
    recoveryGaps: ["post rehydration rebuild", "stale entity snapshot policy", "runbook"],
    notes: "Embedded render snapshots need either rebuild support or deprecation.",
  }),
  defineProjection({
    projectionName: "projected_viewer_state",
    classification: "fanout_projection",
    authoritySources: ["likes", "bookmarks", "reposts"],
    projectionCollections: ["projected viewer state fields"],
    maintainer: "hybrid",
    currentConsumers: ["feed optimization"],
    currentCertificationStatus: "not_ready",
    verificationSupported: true,
    failureLedgerSupported: true,
    recoveryGaps: ["projection owner", "rebuild or deprecate fallback", "runbook"],
    notes: "Viewer state projections must not become hidden authority.",
  }),
  defineProjection({
    projectionName: "system_metrics",
    classification: "operational_projection",
    authoritySources: ["metric events", "trigger calls"],
    projectionCollections: ["system_metrics", "system_metrics_daily"],
    maintainer: "hybrid",
    currentConsumers: ["admin dashboard", "daily export"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    reconciliationSupported: true,
    failureLedgerSupported: true,
    requiredIndexes: ["system_metrics_daily(__name__)"],
    recoveryGaps: ["runbook", "event-ledger recovery"],
    notes: "Metrics are visible but need documented recovery from retained event logs.",
  }),
  defineProjection({
    projectionName: "system_events",
    classification: "operational_projection",
    authoritySources: ["structured app events"],
    projectionCollections: ["system_events"],
    maintainer: "hybrid",
    currentConsumers: ["admin event views", "analytics export"],
    currentCertificationStatus: "beta_ready",
    verificationSupported: true,
    failureLedgerSupported: true,
    requiredIndexes: ["system_events(createdAt)"],
    recoveryGaps: ["retention runbook"],
    notes: "System events are operational evidence and need retention/runbook policy.",
  }),
  defineProjection({
    projectionName: "analytics_daily_exports",
    classification: "operational_projection",
    authoritySources: ["system_metrics", "system_events"],
    projectionCollections: ["analytics_exports"],
    maintainer: "scheduled_job",
    currentConsumers: ["admin", "reporting"],
    currentCertificationStatus: "not_ready",
    verificationSupported: true,
    failureLedgerSupported: true,
    recoveryGaps: ["rerun command per date", "verification", "runbook"],
    notes: "Scheduled export needs date-targeted rerun support.",
  }),
  defineProjection({
    projectionName: "intelligence_signal_queue",
    classification: "operational_projection",
    authoritySources: ["user activity", "reader signals", "write signals", "social signals"],
    projectionCollections: ["intelligence signal queue"],
    maintainer: "hybrid",
    currentConsumers: ["admin intelligence", "personalization"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    reconciliationSupported: true,
    failureLedgerSupported: true,
    requiredIndexes: ["intelligence signals by status/update time"],
    recoveryGaps: ["Phase 8A registry alignment", "runbook"],
    notes: "Intelligence workers have operational machinery but need registry certification.",
  }),
  defineProjection({
    projectionName: "intelligence_aggregates",
    classification: "aggregate_projection",
    authoritySources: ["intelligence signals"],
    projectionCollections: ["intelligence profile aggregates"],
    maintainer: "scheduled_job",
    currentConsumers: ["admin intelligence dashboard"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    reconciliationSupported: true,
    failureLedgerSupported: true,
    requiredIndexes: ["intelligence aggregates by uid/update time"],
    recoveryGaps: ["health SLO", "certification runbook"],
    notes: "Scheduled reconciliation exists but must be certified by the shared gate.",
  }),
  defineProjection({
    projectionName: "deletion_cascade_cleanup_projection",
    classification: "operational_projection",
    authoritySources: ["deletion requests", "authority docs"],
    projectionCollections: ["cascade-deleted projection docs"],
    maintainer: "hybrid",
    currentConsumers: ["privacy", "admin compliance"],
    currentCertificationStatus: "beta_ready",
    rebuildSupported: true,
    verificationSupported: true,
    failureLedgerSupported: true,
    requiredIndexes: ["deletion_requests(status,updatedAt)"],
    recoveryGaps: ["post-delete verification runbook"],
    notes: "Deletion workflows need evidence-grade verification before production certification.",
  }),
];

export const PROJECTION_DEFINITIONS: ProjectionDefinition[] =
  PROJECTION_REGISTRY_ENTRIES;

const PROJECTION_BY_NAME = new Map(
  PROJECTION_REGISTRY_ENTRIES.map((definition) => [
    definition.projectionName,
    definition,
  ])
);

export function listProjectionDefinitions(): RegisteredProjectionDefinition[] {
  return [...PROJECTION_REGISTRY_ENTRIES];
}

export function getProjectionDefinition(
  projectionName: string
): RegisteredProjectionDefinition | null {
  return PROJECTION_BY_NAME.get(projectionName) ?? null;
}

export function requireProjectionDefinition(
  projectionName: string
): RegisteredProjectionDefinition {
  const definition = getProjectionDefinition(projectionName);
  if (!definition) {
    throw new Error(`Unknown projection: ${projectionName}`);
  }
  return definition;
}

export function isRegisteredProjectionName(projectionName: string): boolean {
  return PROJECTION_BY_NAME.has(projectionName);
}

export function listProjectionDefinitionsByStatus(
  status: ProjectionCertificationStatus
): RegisteredProjectionDefinition[] {
  return PROJECTION_REGISTRY_ENTRIES.filter(
    (definition) => definition.currentCertificationStatus === status
  );
}

export function listProjectionDefinitionsByClassification(
  classification: ProjectionClassification
): RegisteredProjectionDefinition[] {
  return PROJECTION_REGISTRY_ENTRIES.filter(
    (definition) => definition.classification === classification
  );
}

export function getProjectionHealthDocumentId(projectionName: string): string {
  return requireProjectionDefinition(projectionName).projectionName;
}

export function createUnknownProjectionHealth(
  projectionName: string,
  checkedAtIso: string
): ProjectionHealth {
  const definition = requireProjectionDefinition(projectionName);
  return {
    projectionName: definition.projectionName,
    status: "unknown",
    productionStatus: definition.currentCertificationStatus,
    lastSuccessfulRebuildAtIso: null,
    lastSuccessfulReconcileAtIso: null,
    lastVerificationAtIso: null,
    lastFailureAtIso: null,
    pendingFailures: 0,
    deadLetterFailures: 0,
    driftDetected: 0,
    driftRepaired: 0,
    staleProjectionCount: 0,
    missingProjectionCount: 0,
    checkedAtIso,
  };
}

export function generateProjectionCertificationReport(
  definitions: RegisteredProjectionDefinition[] = PROJECTION_REGISTRY_ENTRIES
): ProjectionCertificationReport {
  const statusBreakdown: Record<ProjectionCertificationStatus, number> = {
    not_ready: 0,
    beta_ready: 0,
    production_ready: 0,
    deprecated: 0,
  };
  const productionReady: string[] = [];
  const betaReady: string[] = [];
  const notReady: string[] = [];
  const deprecated: string[] = [];
  const failingProductionRequired: ProjectionCertificationGateResult[] = [];
  const gapMap = new Map<string, Set<string>>();

  for (const definition of definitions) {
    statusBreakdown[definition.currentCertificationStatus] += 1;

    if (definition.currentCertificationStatus === "production_ready") {
      productionReady.push(definition.projectionName);
    } else if (definition.currentCertificationStatus === "beta_ready") {
      betaReady.push(definition.projectionName);
    } else if (definition.currentCertificationStatus === "deprecated") {
      deprecated.push(definition.projectionName);
    } else {
      notReady.push(definition.projectionName);
    }

    const gateResult = evaluateProjectionCertification(definition);
    if (
      definition.requiredCertificationStatus === "production_ready" &&
      !gateResult.passed
    ) {
      failingProductionRequired.push(gateResult);
    }

    for (const gap of [
      ...definition.recoveryGaps,
      ...gateResult.missingRequirements,
    ]) {
      const projections = gapMap.get(gap) ?? new Set<string>();
      projections.add(definition.projectionName);
      gapMap.set(gap, projections);
    }
  }

  const topRemainingGaps = [...gapMap.entries()]
    .map(([requirement, projections]) => ({
      requirement,
      count: projections.size,
      projections: [...projections].sort(),
    }))
    .sort((a, b) => b.count - a.count || a.requirement.localeCompare(b.requirement))
    .slice(0, 20);

  return {
    total: definitions.length,
    statusBreakdown,
    productionReady: productionReady.sort(),
    betaReady: betaReady.sort(),
    notReady: notReady.sort(),
    deprecated: deprecated.sort(),
    failingProductionRequired,
    topRemainingGaps,
  };
}

export const PROJECTION_CERTIFICATION_REPORT =
  generateProjectionCertificationReport();
