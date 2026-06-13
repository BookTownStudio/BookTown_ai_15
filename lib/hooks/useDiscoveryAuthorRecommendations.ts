import { useEffect, useMemo } from "react";
import * as authorRecommendationEngine from "../domain/authorRecommendations";
import type { AuthorRecommendationInput } from "../domain/authorRecommendations";
import { isAuthorRecommendationsDiscoveryEnabled } from "../featureFlags.ts";
import {
  authorRecommendationInputSnapshotFingerprint,
  buildAuthorRecommendationInputSnapshot,
  type AuthorRecommendationInputSnapshotSources,
} from "../authorRecommendations/buildAuthorRecommendationInputSnapshot";
import {
  buildDiscoveryAuthorRecommendationTelemetry,
  DISCOVERY_AUTHOR_RECOMMENDATION_CACHE_TTL_MS,
  toDiscoveryAuthorRecommendationCardDTOs,
  type DiscoveryAuthorRecommendationCardDTO,
  type DiscoveryAuthorRecommendationFallbackReason,
  type DiscoveryAuthorRecommendationTelemetry,
} from "../authorRecommendations/discoveryAuthorRecommendationAdapter";

export type DiscoveryAuthorRecommendationsState =
  | {
      readonly status: "suppressed";
      readonly recommendations: readonly DiscoveryAuthorRecommendationCardDTO[];
      readonly fallbackReason: DiscoveryAuthorRecommendationFallbackReason;
      readonly telemetry: DiscoveryAuthorRecommendationTelemetry;
    }
  | {
      readonly status: "ready";
      readonly recommendations: readonly DiscoveryAuthorRecommendationCardDTO[];
      readonly telemetry: DiscoveryAuthorRecommendationTelemetry;
    };

interface CachedDiscoveryAuthorRecommendations {
  readonly expiresAtMs: number;
  readonly recommendations: readonly DiscoveryAuthorRecommendationCardDTO[];
}

const dtoCache = new Map<string, CachedDiscoveryAuthorRecommendations>();

function disabledTelemetry(
  fallbackReason: DiscoveryAuthorRecommendationFallbackReason
): DiscoveryAuthorRecommendationTelemetry {
  return {
    moduleRendered: false,
    outputCount: 0,
    confidenceBandHistogram: { low: 0, medium: 0, high: 0 },
    sourceClassHistogram: {},
    latencyBucket: "lt_100ms",
    fallbackReason,
  };
}

function isUsableInput(input: unknown): input is AuthorRecommendationInput {
  if (!input || typeof input !== "object") return false;
  const value = input as Partial<AuthorRecommendationInput>;
  return (
    typeof value.uid === "string" &&
    value.uid.trim().length > 0 &&
    typeof value.generatedAt === "string" &&
    value.generatedAt.trim().length > 0 &&
    Array.isArray(value.authorSummaries) &&
    Array.isArray(value.authorAffinities)
  );
}

export function clearDiscoveryAuthorRecommendationCache(): void {
  dtoCache.clear();
}

export function useDiscoveryAuthorRecommendations(params: {
  readonly input?: AuthorRecommendationInput | null;
  readonly inputSources?: AuthorRecommendationInputSnapshotSources | null;
  readonly featureFlagEnabled?: boolean;
  readonly onTelemetry?: (telemetry: DiscoveryAuthorRecommendationTelemetry) => void;
} = {}): DiscoveryAuthorRecommendationsState {
  const { input, inputSources, featureFlagEnabled, onTelemetry } = params;
  const featureEnabled =
    featureFlagEnabled ?? isAuthorRecommendationsDiscoveryEnabled();

  const state = useMemo<DiscoveryAuthorRecommendationsState>(() => {
    if (!featureEnabled) {
      return {
        status: "suppressed",
        recommendations: [],
        fallbackReason: "feature_disabled",
        telemetry: disabledTelemetry("feature_disabled"),
      };
    }

    const snapshotInput =
      input ?? (inputSources ? buildAuthorRecommendationInputSnapshot(inputSources) : null);

    if (!isUsableInput(snapshotInput)) {
      return {
        status: "suppressed",
        recommendations: [],
        fallbackReason: "input_unavailable",
        telemetry: disabledTelemetry("input_unavailable"),
      };
    }

    const startedAtMs = Date.now();
    const key = authorRecommendationInputSnapshotFingerprint(snapshotInput);
    const cached = dtoCache.get(key);
    if (cached && cached.expiresAtMs > startedAtMs) {
      const telemetry = buildDiscoveryAuthorRecommendationTelemetry({
        recommendations: cached.recommendations,
        durationMs: 0,
        fallbackReason: cached.recommendations.length === 0 ? "empty_output" : undefined,
      });
      return cached.recommendations.length > 0
        ? { status: "ready", recommendations: cached.recommendations, telemetry }
        : {
            status: "suppressed",
            recommendations: [],
            fallbackReason: "empty_output",
            telemetry,
          };
    }

    try {
      const result = authorRecommendationEngine.runAuthorRecommendationEngine(snapshotInput);
      const recommendations = toDiscoveryAuthorRecommendationCardDTOs(result.recommendations);
      dtoCache.set(key, {
        expiresAtMs: Date.now() + DISCOVERY_AUTHOR_RECOMMENDATION_CACHE_TTL_MS,
        recommendations,
      });
      const telemetry = buildDiscoveryAuthorRecommendationTelemetry({
        recommendations,
        durationMs: Date.now() - startedAtMs,
        fallbackReason: recommendations.length === 0 ? "empty_output" : undefined,
      });

      return recommendations.length > 0
        ? { status: "ready", recommendations, telemetry }
        : {
            status: "suppressed",
            recommendations: [],
            fallbackReason: "empty_output",
            telemetry,
          };
    } catch {
      return {
        status: "suppressed",
        recommendations: [],
        fallbackReason: "engine_error",
        telemetry: disabledTelemetry("engine_error"),
      };
    }
  }, [featureEnabled, input, inputSources]);

  useEffect(() => {
    onTelemetry?.(state.telemetry);
  }, [onTelemetry, state.telemetry]);

  return state;
}
