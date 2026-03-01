import type { Timestamp } from "firebase-admin/firestore";

export const INTELLIGENCE_SCHEMA_VERSION = 1;
export const INTELLIGENCE_EMBEDDING_VERSION = 1;
export const INTELLIGENCE_PRIVACY_TIER = "owner_only";

export const INTELLIGENCE_SIGNAL_RETRY_LIMIT = 3;
export const INTELLIGENCE_BATCH_WINDOW_MS = 15_000;
export const INTELLIGENCE_MAX_SIGNALS_PER_BATCH = 220;
export const INTELLIGENCE_MAX_PROFILE_UPDATES_PER_UID_PER_MINUTE = 6;
export const INTELLIGENCE_LOCK_TTL_MS = 45_000;

export const INTELLIGENCE_QUEUE_TTL_DAYS = 7;
export const INTELLIGENCE_RECONCILE_USERS_PER_RUN = 40;

export type IntelligenceSignalFamily =
  | "reading"
  | "genres"
  | "authors"
  | "behavior"
  | "engagement"
  | "indices"
  | "history";

export type IntelligenceSignalEnvelope = {
  uid: string;
  signalType: string;
  signalFamily: IntelligenceSignalFamily;
  payload: Record<string, unknown>;
  sourceEventId: string | null;
  sourcePath: string | null;
  createdAt: Timestamp;
  nextAttemptAt: Timestamp;
  processed: boolean;
  retryCount: number;
  failed: boolean;
  failedReason: string | null;
};

export type GenreDistribution = Record<string, number>;
export type AuthorAffinities = Record<string, number>;

export type IntelligenceSnapshot = {
  sourceHash: string;
  reading: {
    totalBooksRead: number;
    completionRate: number;
    readingVelocity: number;
    recentGenres: Record<string, number>;
    recentAuthors: Record<string, number>;
  };
  genres: {
    distribution: GenreDistribution;
    dominantGenre: string;
    entropyScore: number;
  };
  authors: {
    affinityScores: AuthorAffinities;
  };
  behavior: {
    noveltyTolerance: number;
    deviationTolerance: number;
    depthPreference: number;
    abandonmentRate: number;
  };
  engagement: {
    socialEngagementIndex: number;
    quoteDensity: number;
    reviewFrequency: number;
  };
  indices: {
    explorationIndex: number;
    completionConsistency: number;
    culturalDepthIndex: number;
  };
  history: {
    recentTrend: Record<string, number>;
  };
};

export type PersistedMetadata = {
  schemaVersion: number;
  profileVersion: number;
  computedAt?: Timestamp;
  lastReconciledAt?: Timestamp;
  privacyTier: string;
  sourceHash?: string;
  rateLimiter?: {
    minuteKey: number;
    count: number;
  };
};

export type AgentContextSnapshot = {
  schemaVersion: number;
  profileVersion: number;
  privacyTier: string;
  computedAt: string | null;
  reading: {
    totalBooksRead: number;
    completionRate: number;
    readingVelocity: number;
  };
  genres: {
    dominantGenre: string;
    entropyScore: number;
    topGenres: Array<{ name: string; weight: number }>;
  };
  behavior: {
    noveltyTolerance: number;
    deviationTolerance: number;
    depthPreference: number;
    abandonmentRate: number;
  };
  indices: {
    explorationIndex: number;
    completionConsistency: number;
    culturalDepthIndex: number;
  };
  engagement: {
    socialEngagementIndex: number;
    quoteDensity: number;
    reviewFrequency: number;
  };
};
