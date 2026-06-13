import { describe, expect, it } from "vitest";
import {
  isAuthorRecommendationsDiscoveryEnabled,
  isBetaFeedbackTriggerEnabled,
} from "./featureFlags.ts";

describe("feature flags", () => {
  it("keeps beta feedback trigger disabled unless enabled", () => {
    expect(
      isBetaFeedbackTriggerEnabled({
        enableBetaFeedbackTrigger: false,
        authorRecommendationsDiscovery: false,
      })
    ).toBe(false);
    expect(
      isBetaFeedbackTriggerEnabled({
        enableBetaFeedbackTrigger: true,
        authorRecommendationsDiscovery: false,
      })
    ).toBe(true);
  });

  it("keeps Discovery Author Recommendations disabled unless enabled", () => {
    expect(
      isAuthorRecommendationsDiscoveryEnabled({
        enableBetaFeedbackTrigger: false,
        authorRecommendationsDiscovery: false,
      })
    ).toBe(false);
    expect(
      isAuthorRecommendationsDiscoveryEnabled({
        enableBetaFeedbackTrigger: false,
        authorRecommendationsDiscovery: true,
      })
    ).toBe(true);
  });
});
