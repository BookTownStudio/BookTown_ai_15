import { devInfo } from "../logging/devLog.ts";
import type {
  DiscoveryAuthorRecommendationTelemetry,
  DiscoveryAuthorRecommendationFallbackReason,
} from "./discoveryAuthorRecommendationAdapter";

export type DiscoveryAuthorRecommendationTelemetryEventName =
  | "module_rendered"
  | "module_suppressed"
  | "module_empty"
  | "module_error"
  | "card_opened";

export interface DiscoveryAuthorRecommendationTelemetryEvent {
  readonly eventName: DiscoveryAuthorRecommendationTelemetryEventName;
  readonly outputCount: number;
  readonly confidenceBandHistogram: Readonly<Record<"low" | "medium" | "high", number>>;
  readonly sourceClassHistogram: Readonly<Record<string, number>>;
  readonly latencyBucket: DiscoveryAuthorRecommendationTelemetry["latencyBucket"];
  readonly fallbackReason?: DiscoveryAuthorRecommendationFallbackReason;
}

const EMPTY_CONFIDENCE_HISTOGRAM: Readonly<Record<"low" | "medium" | "high", number>> = {
  low: 0,
  medium: 0,
  high: 0,
};

function eventNameFor(
  telemetry: DiscoveryAuthorRecommendationTelemetry
): DiscoveryAuthorRecommendationTelemetryEventName {
  if (telemetry.cardOpens && telemetry.cardOpens > 0) return "card_opened";
  if (telemetry.moduleRendered) return "module_rendered";
  if (telemetry.fallbackReason === "empty_output") return "module_empty";
  if (telemetry.fallbackReason === "engine_error") return "module_error";
  return "module_suppressed";
}

function sanitizeHistogram(
  values: Readonly<Record<string, number>>
): Readonly<Record<string, number>> {
  const sanitized: Record<string, number> = {};
  for (const [key, value] of Object.entries(values)) {
    if (!key.trim()) continue;
    if (!Number.isFinite(value) || value < 0) continue;
    sanitized[key] = Math.trunc(value);
  }
  return sanitized;
}

export function toDiscoveryAuthorRecommendationTelemetryEvent(
  telemetry: DiscoveryAuthorRecommendationTelemetry
): DiscoveryAuthorRecommendationTelemetryEvent {
  return {
    eventName: eventNameFor(telemetry),
    outputCount: Math.max(0, Math.trunc(telemetry.outputCount)),
    confidenceBandHistogram: {
      low: Math.max(0, Math.trunc(telemetry.confidenceBandHistogram.low)),
      medium: Math.max(0, Math.trunc(telemetry.confidenceBandHistogram.medium)),
      high: Math.max(0, Math.trunc(telemetry.confidenceBandHistogram.high)),
    },
    sourceClassHistogram: sanitizeHistogram(telemetry.sourceClassHistogram),
    latencyBucket: telemetry.latencyBucket,
    ...(telemetry.fallbackReason ? { fallbackReason: telemetry.fallbackReason } : {}),
  };
}

export function emptyCardOpenTelemetry(outputCount: number): DiscoveryAuthorRecommendationTelemetry {
  return {
    moduleRendered: true,
    outputCount: Math.max(0, Math.trunc(outputCount)),
    confidenceBandHistogram: EMPTY_CONFIDENCE_HISTOGRAM,
    sourceClassHistogram: {},
    latencyBucket: "lt_100ms",
    cardOpens: 1,
  };
}

export function trackDiscoveryAuthorRecommendationTelemetry(
  telemetry: DiscoveryAuthorRecommendationTelemetry
): DiscoveryAuthorRecommendationTelemetryEvent {
  const event = toDiscoveryAuthorRecommendationTelemetryEvent(telemetry);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("booktown:author-recommendation-discovery-telemetry", {
        detail: event,
      })
    );
  }

  devInfo("[AUTHOR_RECOMMENDATION_DISCOVERY_TELEMETRY]", event);
  return event;
}
