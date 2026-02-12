// edge/discovery/getDiscoveryDirections.ts

import type { DiscoveryPromptInput } from "./types";

export type DiscoveryDirection = {
  id: string;
  label: string;
  query: string;
  reason?: string;
};

/**
 * 🔒 Deterministic Discovery Direction Engine
 *
 * - Pure function
 * - No side effects
 * - No ranking
 * - No randomness
 * - No search coupling
 * - Returns exactly 3 directions
 */
export function getDiscoveryDirections(
  input: DiscoveryPromptInput | null
): DiscoveryDirection[] {
  if (!input || typeof input !== "object") {
    return fallbackDirections();
  }

  const { recentSignals } = input;

  const directions: DiscoveryDirection[] = [];

  /* -----------------------------------------
     🥇 Priority 1 — Friction Pattern
  ------------------------------------------ */
  if (
    recentSignals?.pausedGenres &&
    recentSignals.pausedGenres.length >= 2
  ) {
    const genre = recentSignals.pausedGenres[0];

    directions.push({
      id: "contrast-genre",
      label: `Explore beyond ${genre}`,
      query: `not:${genre}`,
      reason: "genre_friction_detected",
    });
  }

  /* -----------------------------------------
     🥈 Priority 2 — Dominant Theme
  ------------------------------------------ */
  if (
    recentSignals?.dominantThemes &&
    recentSignals.dominantThemes.length > 0
  ) {
    const theme = recentSignals.dominantThemes[0];

    directions.push({
      id: "deepen-theme",
      label: `Deepen into ${theme}`,
      query: `theme:${theme}`,
      reason: "dominant_theme_detected",
    });

    const adjacent = getAdjacentTheme(theme);

    if (adjacent) {
      directions.push({
        id: "adjacent-theme",
        label: `Reflect on ${adjacent}`,
        query: `theme:${adjacent}`,
        reason: "adjacent_theme_expansion",
      });
    }
  }

  /* -----------------------------------------
     Ensure exactly 3
  ------------------------------------------ */
  if (directions.length < 3) {
    const fallback = fallbackDirections();

    for (const item of fallback) {
      if (directions.length >= 3) break;

      if (!directions.find(d => d.id === item.id)) {
        directions.push(item);
      }
    }
  }

  return directions.slice(0, 3);
}

/* -----------------------------------------
   Static Adjacent Map
------------------------------------------ */
function getAdjacentTheme(theme: string): string | null {
  const adjacency: Record<string, string> = {
    war: "exile",
    identity: "migration",
    philosophy: "political essays",
    love: "loss",
    memory: "history",
  };

  return adjacency[theme.toLowerCase()] || null;
}

/* -----------------------------------------
   Stable Fallback
------------------------------------------ */
function fallbackDirections(): DiscoveryDirection[] {
  return [
    {
      id: "fallback-literary",
      label: "Literary fiction",
      query: "literary fiction",
      reason: "fallback",
    },
    {
      id: "fallback-essays",
      label: "Essays & reflections",
      query: "essays",
      reason: "fallback",
    },
    {
      id: "fallback-global",
      label: "Global voices",
      query: "translated fiction",
      reason: "fallback",
    },
  ];
}
