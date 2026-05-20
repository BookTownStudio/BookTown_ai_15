import { describe, expect, it } from "vitest";
import { isBetaFeedbackTriggerEnabled } from "./featureFlags.ts";

describe("feature flags", () => {
  it("keeps beta feedback trigger disabled unless enabled", () => {
    expect(isBetaFeedbackTriggerEnabled({ enableBetaFeedbackTrigger: false })).toBe(false);
    expect(isBetaFeedbackTriggerEnabled({ enableBetaFeedbackTrigger: true })).toBe(true);
  });
});
