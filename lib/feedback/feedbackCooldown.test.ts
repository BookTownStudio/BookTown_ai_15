import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEEDBACK_SOFT_COOLDOWN_MS,
  getFeedbackCooldownRemainingMs,
  isFeedbackCooldownActive,
  isFeedbackCooldownError,
  markFeedbackSubmitted,
} from "./feedbackCooldown.ts";

describe("feedbackCooldown", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("tracks the remaining 60-second soft cooldown after a successful submission", () => {
    markFeedbackSubmitted(1_000);

    expect(isFeedbackCooldownActive(1_000)).toBe(true);
    expect(getFeedbackCooldownRemainingMs(31_000)).toBe(30_000);
    expect(getFeedbackCooldownRemainingMs(61_000)).toBe(0);
    expect(isFeedbackCooldownActive(61_000)).toBe(false);
  });

  it("recognizes backend quota responses that should be rendered as friendly cooldown copy", () => {
    expect(isFeedbackCooldownError(new Error("[submitFeedback] [RESOURCE_EXHAUSTED] FEEDBACK_SOFT_COOLDOWN_ACTIVE"))).toBe(true);
    expect(isFeedbackCooldownError(new Error("[submitFeedback] [RESOURCE_EXHAUSTED] FEEDBACK_BURST_QUOTA_EXCEEDED"))).toBe(true);
    expect(isFeedbackCooldownError(new Error("[submitFeedback] [INTERNAL] FEEDBACK_SUBMISSION_FAILED"))).toBe(false);
    expect(FEEDBACK_SOFT_COOLDOWN_MS).toBe(60_000);
  });
});
