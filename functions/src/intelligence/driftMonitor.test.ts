import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  classifySeverity,
  computeRatesFromCounts,
  deriveDriftRunId,
  detectDriftAlerts,
  subtractCounts,
  sumCountsFromAggregate,
} from "./driftMonitor";

describe("driftMonitor", () => {
  it("metric_computation_correctness", () => {
    const counts = {
      suggestions: 100,
      accepted: 45,
      engaged: 27,
      completed: 18,
      positive: 9,
    };

    const rates = computeRatesFromCounts(counts);
    expect(rates).toEqual({
      acceptance_rate: 0.45,
      engagement_rate: 0.6,
      completion_rate: 0.666667,
      positive_rate: 0.5,
    });
  });

  it("baseline_vs_window_comparison", () => {
    const aggregate = {
      Reinforcement: { suggested: 200, accepted: 100, engaged: 80, completed: 50, positive: 20 },
      Contrast: { suggested: 100, accepted: 40, engaged: 20, completed: 10, positive: 4 },
    };

    const cumulative = sumCountsFromAggregate(aggregate);
    const comparisonStart = {
      suggestions: 220,
      accepted: 110,
      engaged: 90,
      completed: 55,
      positive: 21,
    };
    const baselineStart = {
      suggestions: 150,
      accepted: 70,
      engaged: 50,
      completed: 30,
      positive: 10,
    };

    const comparisonCounts = subtractCounts(cumulative, comparisonStart);
    const baselineCounts = subtractCounts(comparisonStart, baselineStart);

    expect(comparisonCounts).toEqual({
      suggestions: 80,
      accepted: 30,
      engaged: 10,
      completed: 5,
      positive: 3,
    });
    expect(baselineCounts).toEqual({
      suggestions: 70,
      accepted: 40,
      engaged: 40,
      completed: 25,
      positive: 11,
    });
  });

  it("drift_detection_thresholds", () => {
    expect(classifySeverity(0.16, 0.15)).toBe("low");
    expect(classifySeverity(0.23, 0.15)).toBe("medium");
    expect(classifySeverity(0.31, 0.15)).toBe("high");
  });

  it("alert_generation", () => {
    const alerts = detectDriftAlerts({
      baseline: {
        acceptance_rate: 0.45,
        engagement_rate: 0.4,
        completion_rate: 0.5,
        positive_rate: 0.3,
      },
      current: {
        acceptance_rate: 0.7,
        engagement_rate: 0.1,
        completion_rate: 0.55,
        positive_rate: 0.45,
      },
    });

    expect(alerts).toHaveLength(3);
    const acceptance = alerts.find((row) => row.metric === "acceptance_rate");
    const engagement = alerts.find((row) => row.metric === "engagement_rate");
    const positive = alerts.find((row) => row.metric === "positive_rate");

    expect(acceptance).toMatchObject({
      type: "performance_improvement",
      severity: "medium",
    });
    expect(engagement).toMatchObject({
      type: "performance_degradation",
      severity: "medium",
    });
    expect(positive).toMatchObject({
      type: "performance_improvement",
      severity: "low",
    });
  });

  it("daily_run_id_is_deterministic", () => {
    const runA = deriveDriftRunId(Timestamp.fromMillis(1_710_000_000_000));
    const runB = deriveDriftRunId(Timestamp.fromMillis(1_710_000_000_000 + 4 * 60 * 60 * 1000));
    const runC = deriveDriftRunId(Timestamp.fromMillis(1_710_000_000_000 + 26 * 60 * 60 * 1000));

    expect(runA).toBe(runB);
    expect(runA).not.toBe(runC);
  });
});
