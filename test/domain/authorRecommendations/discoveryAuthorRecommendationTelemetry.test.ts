import { describe, expect, it, vi } from "vitest";
import {
  emptyCardOpenTelemetry,
  toDiscoveryAuthorRecommendationTelemetryEvent,
  trackDiscoveryAuthorRecommendationTelemetry,
} from "../../../lib/authorRecommendations/discoveryAuthorRecommendationTelemetry";

describe("Discovery Author Recommendation telemetry", () => {
  it("classifies render, empty, error, suppressed, and card-open events", () => {
    expect(
      toDiscoveryAuthorRecommendationTelemetryEvent({
        moduleRendered: true,
        outputCount: 2,
        confidenceBandHistogram: { low: 0, medium: 1, high: 1 },
        sourceClassHistogram: { "Direct author activity": 2 },
        latencyBucket: "lt_100ms",
      }).eventName
    ).toBe("module_rendered");

    expect(
      toDiscoveryAuthorRecommendationTelemetryEvent({
        moduleRendered: false,
        outputCount: 0,
        confidenceBandHistogram: { low: 0, medium: 0, high: 0 },
        sourceClassHistogram: {},
        latencyBucket: "lt_100ms",
        fallbackReason: "empty_output",
      }).eventName
    ).toBe("module_empty");

    expect(
      toDiscoveryAuthorRecommendationTelemetryEvent({
        moduleRendered: false,
        outputCount: 0,
        confidenceBandHistogram: { low: 0, medium: 0, high: 0 },
        sourceClassHistogram: {},
        latencyBucket: "lt_100ms",
        fallbackReason: "engine_error",
      }).eventName
    ).toBe("module_error");

    expect(
      toDiscoveryAuthorRecommendationTelemetryEvent({
        moduleRendered: false,
        outputCount: 0,
        confidenceBandHistogram: { low: 0, medium: 0, high: 0 },
        sourceClassHistogram: {},
        latencyBucket: "lt_100ms",
        fallbackReason: "input_unavailable",
      }).eventName
    ).toBe("module_suppressed");

    expect(
      toDiscoveryAuthorRecommendationTelemetryEvent(emptyCardOpenTelemetry(3)).eventName
    ).toBe("card_opened");
  });

  it("emits aggregate-only sanitized CustomEvent payloads", () => {
    const listener = vi.fn();
    window.addEventListener("booktown:author-recommendation-discovery-telemetry", listener);

    const event = trackDiscoveryAuthorRecommendationTelemetry({
      moduleRendered: true,
      outputCount: 1.8,
      confidenceBandHistogram: { low: 0, medium: 0, high: 1 },
      sourceClassHistogram: {
        "Direct author activity": 1.2,
        "": 99,
        invalid: -1,
      },
      latencyBucket: "100_250ms",
    });

    expect(event).toEqual({
      eventName: "module_rendered",
      outputCount: 1,
      confidenceBandHistogram: { low: 0, medium: 0, high: 1 },
      sourceClassHistogram: { "Direct author activity": 1 },
      latencyBucket: "100_250ms",
    });
    expect(listener).toHaveBeenCalledTimes(1);

    const serialized = JSON.stringify(listener.mock.calls);
    expect(serialized).not.toContain("author_");
    expect(serialized).not.toContain("evidenceId");
    expect(serialized).not.toContain("outputId");
    expect(serialized).not.toContain("0.9");

    window.removeEventListener("booktown:author-recommendation-discovery-telemetry", listener);
  });
});
