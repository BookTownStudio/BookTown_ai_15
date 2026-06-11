import * as logger from "firebase-functions/logger";
import {
  createWorkEntityRef,
  ENTITY_PLATFORM_CONTRACT_VERSION,
  type EntitySummary,
  type MatchMakerInput,
} from "../contracts/shared/entityPlatform";
import type { MatchMakerRecommendation } from "../contracts/shared/entityPlatform/matchmakerOutputs";
import { runMatchMakerV1 } from "../matchmaker/v1/matchmakerEngine";

const MATCHMAKER_HOME_DISCOVERY_FLAG = "MATCHMAKER_HOME_DISCOVERY";
const MATCHMAKER_HOME_MAX_RECOMMENDATIONS = 12;
const HOME_REASON_MAX_LENGTH = 160;

export type HomeMatchMakerBookItem = {
  kind: "book";
  bookId: string;
  title: string;
  author: string;
  coverUrl: string;
  source: "algorithmic" | "editorial";
  score: number;
  progress?: number;
  reason?: string;
};

export type HomeMatchMakerFallbackReason =
  | "feature_flag_off"
  | "empty_candidate_pool"
  | "empty_matchmaker_output"
  | "engine_failure";

export type HomeMatchMakerIntegrationResult = {
  items: HomeMatchMakerBookItem[];
  usedMatchMaker: boolean;
  fallbackReason?: HomeMatchMakerFallbackReason;
  telemetry: HomeMatchMakerTelemetry;
};

export type HomeMatchMakerTelemetry = {
  featureFlagState: boolean;
  outputCount: number;
  confidenceBands: Record<string, number>;
  evidenceSourceClasses: Record<string, number>;
  latencyBucket: "lt_25ms" | "lt_75ms" | "lt_150ms" | "gte_150ms";
  fallbackReason?: HomeMatchMakerFallbackReason;
};

type EnvLike = Record<string, string | undefined>;

export function isMatchMakerHomeDiscoveryEnabled(
  env: EnvLike = process.env
): boolean {
  return env[MATCHMAKER_HOME_DISCOVERY_FLAG] === "true";
}

export function toMatchMakerHomeInput(
  items: readonly HomeMatchMakerBookItem[]
): MatchMakerInput {
  const summaries = items
    .filter((item) => item.kind === "book" && item.bookId.trim().length > 0)
    .slice(0, MATCHMAKER_HOME_MAX_RECOMMENDATIONS)
    .map(toEntitySummaryFromHomeItem);

  return {
    contractVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    ...(summaries.length > 0
      ? {
          entityRefs: summaries.map((summary) => summary.ref),
          entitySummaries: summaries,
        }
      : {}),
  };
}

export function toHomeDynamicDiscoveryItems(
  recommendations: readonly MatchMakerRecommendation[],
  fallbackItems: readonly HomeMatchMakerBookItem[]
): HomeMatchMakerBookItem[] {
  const originalByBookId = new Map(
    fallbackItems.map((item) => [item.bookId, item] as const)
  );

  return recommendations
    .filter((recommendation) => recommendation.targetEntityRef.entityType === "work")
    .map((recommendation, index) => {
      const bookId = recommendation.targetEntityRef.entityId;
      const original = originalByBookId.get(bookId);
      const title =
        recommendation.targetSummary?.title ||
        original?.title ||
        recommendation.targetEntityRef.displayHint ||
        bookId;
      const author = recommendation.targetSummary?.subtitle || original?.author || "Unknown";
      return {
        kind: "book" as const,
        bookId,
        title,
        author,
        coverUrl: recommendation.targetSummary?.image?.url || original?.coverUrl || "",
        source: "algorithmic" as const,
        score: displayRankScore(index),
        reason: toHomeReason(recommendation),
      };
    })
    .slice(0, MATCHMAKER_HOME_MAX_RECOMMENDATIONS);
}

export function runHomeMatchMakerDiscovery(params: {
  uid: string;
  candidateItems: readonly HomeMatchMakerBookItem[];
  generatedAt: string;
  featureFlagEnabled?: boolean;
  runEngine?: typeof runMatchMakerV1;
}): HomeMatchMakerIntegrationResult {
  const startedAtMs = Date.now();
  const featureFlagState =
    params.featureFlagEnabled ?? isMatchMakerHomeDiscoveryEnabled();

  if (!featureFlagState) {
    return toFallbackResult(
      params.candidateItems,
      "feature_flag_off",
      featureFlagState,
      startedAtMs
    );
  }

  const input = toMatchMakerHomeInput(params.candidateItems);
  if ((input.entitySummaries?.length ?? 0) === 0) {
    return toFallbackResult(
      params.candidateItems,
      "empty_candidate_pool",
      featureFlagState,
      startedAtMs
    );
  }

  try {
    const recommendations = (params.runEngine ?? runMatchMakerV1)(input, {
      generatedAt: params.generatedAt,
      maxRecommendations: MATCHMAKER_HOME_MAX_RECOMMENDATIONS,
    });
    const items = toHomeDynamicDiscoveryItems(
      recommendations,
      params.candidateItems
    );
    if (items.length === 0) {
      return toFallbackResult(
        params.candidateItems,
        "empty_matchmaker_output",
        featureFlagState,
        startedAtMs
      );
    }

    const telemetry = toTelemetry({
      featureFlagState,
      recommendations,
      startedAtMs,
    });
    logger.info("[HOME][MATCHMAKER_DYNAMIC_DISCOVERY_READY]", {
      uid: params.uid,
      outputCount: telemetry.outputCount,
      confidenceBands: telemetry.confidenceBands,
      evidenceSourceClasses: telemetry.evidenceSourceClasses,
      latencyBucket: telemetry.latencyBucket,
      featureFlagState: telemetry.featureFlagState,
    });
    return {
      items,
      usedMatchMaker: true,
      telemetry,
    };
  } catch (error) {
    logger.warn("[HOME][MATCHMAKER_DYNAMIC_DISCOVERY_FALLBACK]", {
      uid: params.uid,
      fallbackReason: "engine_failure",
      featureFlagState,
      error: error instanceof Error ? error.name : String(error),
    });
    return toFallbackResult(
      params.candidateItems,
      "engine_failure",
      featureFlagState,
      startedAtMs
    );
  }
}

function toEntitySummaryFromHomeItem(item: HomeMatchMakerBookItem): EntitySummary {
  const ref = createWorkEntityRef(item.bookId, {
    displayHint: item.title,
    provenance: {
      sourceClass: "system",
      sourceSystem: "home_discovery_console",
      sourceId: item.bookId,
    },
  });
  return {
    ref,
    title: item.title,
    authorityState: ref.authorityState,
    summaryVersion: ENTITY_PLATFORM_CONTRACT_VERSION,
    subtitle: item.author,
    ...(item.coverUrl ? { image: { url: item.coverUrl } } : {}),
    navigation: "openable",
  };
}

function toHomeReason(recommendation: MatchMakerRecommendation): string {
  const confidenceLabel =
    recommendation.confidence.band === "high"
      ? "High confidence"
      : recommendation.confidence.band === "medium"
        ? "Medium confidence"
        : "Low confidence";
  const suffix = ` ${confidenceLabel}.`;
  const summaryMaxLength = Math.max(0, HOME_REASON_MAX_LENGTH - suffix.length);
  const summary = recommendation.explanation.summary.slice(0, summaryMaxLength);
  return `${summary}${suffix}`;
}

function displayRankScore(index: number): number {
  return Number(Math.max(0, 1 - index / 100).toFixed(6));
}

function toFallbackResult(
  items: readonly HomeMatchMakerBookItem[],
  fallbackReason: HomeMatchMakerFallbackReason,
  featureFlagState: boolean,
  startedAtMs: number
): HomeMatchMakerIntegrationResult {
  return {
    items: [...items],
    usedMatchMaker: false,
    fallbackReason,
    telemetry: {
      featureFlagState,
      outputCount: 0,
      confidenceBands: {},
      evidenceSourceClasses: {},
      latencyBucket: latencyBucket(Date.now() - startedAtMs),
      fallbackReason,
    },
  };
}

function toTelemetry(params: {
  featureFlagState: boolean;
  recommendations: readonly MatchMakerRecommendation[];
  startedAtMs: number;
}): HomeMatchMakerTelemetry {
  const confidenceBands: Record<string, number> = {};
  const evidenceSourceClasses: Record<string, number> = {};

  for (const recommendation of params.recommendations) {
    confidenceBands[recommendation.confidence.band] =
      (confidenceBands[recommendation.confidence.band] ?? 0) + 1;
    for (const evidence of recommendation.evidence) {
      evidenceSourceClasses[evidence.source] =
        (evidenceSourceClasses[evidence.source] ?? 0) + 1;
    }
  }

  return {
    featureFlagState: params.featureFlagState,
    outputCount: params.recommendations.length,
    confidenceBands,
    evidenceSourceClasses,
    latencyBucket: latencyBucket(Date.now() - params.startedAtMs),
  };
}

function latencyBucket(latencyMs: number): HomeMatchMakerTelemetry["latencyBucket"] {
  if (latencyMs < 25) return "lt_25ms";
  if (latencyMs < 75) return "lt_75ms";
  if (latencyMs < 150) return "lt_150ms";
  return "gte_150ms";
}
