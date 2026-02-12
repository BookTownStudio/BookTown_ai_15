// edge/discovery/__tests__/getDiscoveryDirections.test.ts

import { describe, it, expect } from "vitest";
import {
  getDiscoveryDirections,
  type DiscoveryDirection,
} from "../getDiscoveryDirections";

const baseInput = {
  recentSignals: {
    pausedGenres: [],
    dominantThemes: [],
  },
};

describe("getDiscoveryDirections — deterministic contract", () => {
  it("always returns exactly 3 directions", () => {
    const result = getDiscoveryDirections(baseInput);

    expect(result.length).toBe(3);
  });

  it("is deterministic for identical input", () => {
    const result1 = getDiscoveryDirections(baseInput);
    const result2 = getDiscoveryDirections(baseInput);

    expect(result1).toEqual(result2);
  });

  it("prioritizes genre friction when multiple paused genres exist", () => {
    const input = {
      recentSignals: {
        pausedGenres: ["war", "thriller"],
        dominantThemes: [],
      },
    };

    const result = getDiscoveryDirections(input);

    expect(result[0].id).toBe("contrast-genre");
    expect(result[0].reason).toBe("genre_friction_detected");
  });

  it("prioritizes dominant theme when available", () => {
    const input = {
      recentSignals: {
        pausedGenres: [],
        dominantThemes: ["identity"],
      },
    };

    const result = getDiscoveryDirections(input);

    expect(result[0].id).toBe("deepen-theme");
    expect(result[0].query).toBe("theme:identity");
  });

  it("adds adjacent theme when mapping exists", () => {
    const input = {
      recentSignals: {
        pausedGenres: [],
        dominantThemes: ["war"],
      },
    };

    const result = getDiscoveryDirections(input);

    const adjacent = result.find(r => r.id === "adjacent-theme");

    expect(adjacent).toBeDefined();
    expect(adjacent?.query).toBe("theme:exile");
  });

  it("falls back when no signals exist", () => {
    const result = getDiscoveryDirections({
      recentSignals: {
        pausedGenres: [],
        dominantThemes: [],
      },
    });

    expect(result[0].reason).toBe("fallback");
    expect(result[1].reason).toBe("fallback");
    expect(result[2].reason).toBe("fallback");
  });

  it("does not mutate input", () => {
    const input = {
      recentSignals: {
        pausedGenres: ["war"],
        dominantThemes: ["identity"],
      },
    };

    const frozen = JSON.parse(JSON.stringify(input));

    getDiscoveryDirections(input);

    expect(input).toEqual(frozen);
  });

  it("never returns duplicate ids", () => {
    const result = getDiscoveryDirections(baseInput);

    const ids = result.map(r => r.id);
    const unique = new Set(ids);

    expect(unique.size).toBe(ids.length);
  });
});
