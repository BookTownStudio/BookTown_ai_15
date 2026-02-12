// edge/discovery/assembleDiscoveryPrompt.ts

import type {
  DiscoveryPromptInput,
  DiscoveryPrompt,
} from "./types";

export function assembleDiscoveryPrompt(
  input: DiscoveryPromptInput
): DiscoveryPrompt | null {
  if (!input || typeof input !== "object") return null;

  const fragments: string[] = [];

  if (input.recentSignals?.pausedGenres?.length) {
    fragments.push(
      `You paused several ${input.recentSignals.pausedGenres.join(
        ", "
      )} books.`
    );
  }

  if (input.recentSignals?.dominantThemes?.length) {
    fragments.push(
      `Themes like ${input.recentSignals.dominantThemes.join(
        ", "
      )} appear often in your reading.`
    );
  }

  if (!fragments.length) return null;

  return {
    prompt: `${fragments.join(" ")} Would you like to explore related directions?`,
    tone: "suggestive",
    dismissible: true,
    provenance: "discovery",
  };
}
