import type {
  AuthorRecommendation,
  AuthorRecommendationConfidenceBand,
  AuthorRecommendationEvidenceSource,
} from "../domain/authorRecommendations";

export const DISCOVERY_AUTHOR_RECOMMENDATION_VISIBLE_LIMIT = 3;
export const DISCOVERY_AUTHOR_RECOMMENDATION_RENDER_LIMIT = 6;
export const DISCOVERY_AUTHOR_RECOMMENDATION_CACHE_TTL_MS = 5 * 60 * 1000;

export type DiscoveryAuthorRecommendationFallbackReason =
  | "feature_disabled"
  | "input_unavailable"
  | "empty_output"
  | "engine_error"
  | "privacy_suppression";

export type DiscoveryAuthorRecommendationLatencyBucket =
  | "lt_100ms"
  | "100_250ms"
  | "250_500ms"
  | "500_1000ms"
  | "gt_1000ms";

export interface DiscoveryAuthorRecommendationCardDTO {
  readonly authorId: string;
  readonly displayName: string;
  readonly subtitle?: string;
  readonly imageUrl?: string;
  readonly explanationSummary: string;
  readonly confidenceBand: AuthorRecommendationConfidenceBand;
  readonly sourceClassLabels: readonly string[];
}

export interface DiscoveryAuthorRecommendationTelemetry {
  readonly moduleRendered: boolean;
  readonly outputCount: number;
  readonly confidenceBandHistogram: Readonly<Record<AuthorRecommendationConfidenceBand, number>>;
  readonly sourceClassHistogram: Readonly<Record<string, number>>;
  readonly latencyBucket: DiscoveryAuthorRecommendationLatencyBucket;
  readonly fallbackReason?: DiscoveryAuthorRecommendationFallbackReason;
  readonly cardOpens?: number;
}

const SOURCE_CLASS_LABELS: Readonly<Record<AuthorRecommendationEvidenceSource, string>> = {
  direct_author_affinity: "Direct author activity",
  rolled_author_affinity: "Repeated work-level activity",
  author_summary: "Canonical author summary",
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isConfidenceBand(value: unknown): value is AuthorRecommendationConfidenceBand {
  return value === "low" || value === "medium" || value === "high";
}

function readSafeImageUrl(recommendation: AuthorRecommendation): string {
  const image = recommendation.targetSummary.image;
  if (!image) return "";
  return cleanText(image.url);
}

function sourceClassLabels(
  sources: readonly AuthorRecommendationEvidenceSource[]
): readonly string[] {
  return Array.from(new Set(sources.map((source) => SOURCE_CLASS_LABELS[source]))).filter(
    (label) => label.length > 0
  );
}

export function toDiscoveryAuthorRecommendationCardDTO(
  recommendation: AuthorRecommendation
): DiscoveryAuthorRecommendationCardDTO | null {
  const authorRef = recommendation.targetAuthorRef;
  if (
    authorRef.entityType !== "author" ||
    authorRef.authorityState !== "canonical" ||
    authorRef.authoritySource !== "author_authority"
  ) {
    return null;
  }

  const authorId = cleanText(authorRef.entityId);
  const displayName = cleanText(recommendation.targetSummary.title);
  const explanationSummary = cleanText(recommendation.explanation.summary);
  const confidenceBand = recommendation.confidence.band;

  if (
    !authorId ||
    !displayName ||
    !explanationSummary ||
    !isConfidenceBand(confidenceBand) ||
    recommendation.evidence.length === 0
  ) {
    return null;
  }

  const labels = sourceClassLabels(recommendation.explanation.evidenceSourceClasses);
  if (labels.length === 0) return null;

  const subtitle = cleanText(recommendation.targetSummary.subtitle);
  const imageUrl = readSafeImageUrl(recommendation);

  return {
    authorId,
    displayName,
    ...(subtitle ? { subtitle } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    explanationSummary,
    confidenceBand,
    sourceClassLabels: labels,
  };
}

export function toDiscoveryAuthorRecommendationCardDTOs(
  recommendations: readonly AuthorRecommendation[],
  limit = DISCOVERY_AUTHOR_RECOMMENDATION_RENDER_LIMIT
): readonly DiscoveryAuthorRecommendationCardDTO[] {
  return recommendations
    .map(toDiscoveryAuthorRecommendationCardDTO)
    .filter((value): value is DiscoveryAuthorRecommendationCardDTO => value !== null)
    .slice(0, Math.min(limit, DISCOVERY_AUTHOR_RECOMMENDATION_RENDER_LIMIT));
}

export function toDiscoveryAuthorRecommendationLatencyBucket(
  durationMs: number
): DiscoveryAuthorRecommendationLatencyBucket {
  if (durationMs < 100) return "lt_100ms";
  if (durationMs < 250) return "100_250ms";
  if (durationMs < 500) return "250_500ms";
  if (durationMs < 1000) return "500_1000ms";
  return "gt_1000ms";
}

export function buildDiscoveryAuthorRecommendationTelemetry(params: {
  readonly recommendations: readonly DiscoveryAuthorRecommendationCardDTO[];
  readonly durationMs: number;
  readonly fallbackReason?: DiscoveryAuthorRecommendationFallbackReason;
  readonly cardOpens?: number;
}): DiscoveryAuthorRecommendationTelemetry {
  const confidenceBandHistogram: Record<AuthorRecommendationConfidenceBand, number> = {
    low: 0,
    medium: 0,
    high: 0,
  };
  const sourceClassHistogram: Record<string, number> = {};

  for (const recommendation of params.recommendations) {
    confidenceBandHistogram[recommendation.confidenceBand] += 1;
    for (const label of recommendation.sourceClassLabels) {
      sourceClassHistogram[label] = (sourceClassHistogram[label] ?? 0) + 1;
    }
  }

  return {
    moduleRendered: params.recommendations.length > 0,
    outputCount: params.recommendations.length,
    confidenceBandHistogram,
    sourceClassHistogram,
    latencyBucket: toDiscoveryAuthorRecommendationLatencyBucket(params.durationMs),
    ...(params.fallbackReason ? { fallbackReason: params.fallbackReason } : {}),
    ...(typeof params.cardOpens === "number" ? { cardOpens: params.cardOpens } : {}),
  };
}
