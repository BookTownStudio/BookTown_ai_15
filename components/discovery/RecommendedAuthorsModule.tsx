import React from "react";
import type { AuthorRecommendationInput } from "../../lib/domain/authorRecommendations";
import {
  DISCOVERY_AUTHOR_RECOMMENDATION_VISIBLE_LIMIT,
  type DiscoveryAuthorRecommendationTelemetry,
} from "../../lib/authorRecommendations/discoveryAuthorRecommendationAdapter";
import {
  emptyCardOpenTelemetry,
  trackDiscoveryAuthorRecommendationTelemetry,
} from "../../lib/authorRecommendations/discoveryAuthorRecommendationTelemetry";
import type { AuthorRecommendationInputSnapshotSources } from "../../lib/authorRecommendations/buildAuthorRecommendationInputSnapshot";
import { useDiscoveryAuthorRecommendations } from "../../lib/hooks/useDiscoveryAuthorRecommendations.ts";
import { useDiscoveryAuthorRecommendationSources } from "../../lib/hooks/useDiscoveryAuthorRecommendationSources.ts";
import { useNavigation } from "../../store/navigation.tsx";
import { cn } from "../../lib/utils.ts";
import { isAuthorRecommendationsDiscoveryEnabled } from "../../lib/featureFlags.ts";

interface RecommendedAuthorsModuleProps {
  readonly input?: AuthorRecommendationInput | null;
  readonly inputSources?: AuthorRecommendationInputSnapshotSources | null;
  readonly featureFlagEnabled?: boolean;
  readonly onTelemetry?: (telemetry: DiscoveryAuthorRecommendationTelemetry) => void;
  readonly className?: string;
}

const confidenceLabels = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
} as const;

const initialsFor = (displayName: string): string =>
  displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const RecommendedAuthorsModule: React.FC<RecommendedAuthorsModuleProps> = ({
  input,
  inputSources,
  featureFlagEnabled,
  onTelemetry,
  className,
}) => {
  const { currentView, navigate } = useNavigation();
  const resolvedFeatureEnabled =
    featureFlagEnabled ?? isAuthorRecommendationsDiscoveryEnabled();
  const runtimeSources = useDiscoveryAuthorRecommendationSources(
    resolvedFeatureEnabled && !input && !inputSources
  );
  const handleTelemetry = (telemetry: DiscoveryAuthorRecommendationTelemetry) => {
    if (!resolvedFeatureEnabled) return;
    trackDiscoveryAuthorRecommendationTelemetry(telemetry);
    onTelemetry?.(telemetry);
  };
  const state = useDiscoveryAuthorRecommendations({
    input,
    inputSources: inputSources ?? runtimeSources.inputSources,
    featureFlagEnabled: resolvedFeatureEnabled,
    onTelemetry: resolvedFeatureEnabled ? handleTelemetry : undefined,
  });

  const emitCardOpenTelemetry = () => {
    handleTelemetry(emptyCardOpenTelemetry(state.recommendations.length));
  };

  if (state.status !== "ready") return null;

  const recommendations = state.recommendations.slice(
    0,
    DISCOVERY_AUTHOR_RECOMMENDATION_VISIBLE_LIMIT
  );
  if (recommendations.length === 0) return null;

  return (
    <section
      aria-label="Recommended Authors"
      className={cn("mb-8 rounded-lg border border-black/10 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/70", className)}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
            Recommended Authors
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/65">
            Suggested from privacy-safe literary signals.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {recommendations.map((recommendation) => (
          <button
            key={recommendation.authorId}
            type="button"
            onClick={() => {
              emitCardOpenTelemetry();
              navigate({
                type: "immersive",
                id: "authorDetails",
                params: { authorId: recommendation.authorId, from: currentView },
              });
            }}
            className="min-h-[176px] rounded-lg border border-black/10 bg-white p-3 text-left transition hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-white/10 dark:bg-slate-800"
          >
            <div className="flex items-center gap-3">
              {recommendation.imageUrl ? (
                <img
                  src={recommendation.imageUrl}
                  alt={recommendation.displayName}
                  className="h-12 w-12 rounded-full object-cover"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary dark:bg-accent/15 dark:text-accent"
                >
                  {initialsFor(recommendation.displayName)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-950 dark:text-white">
                  {recommendation.displayName}
                </p>
                {recommendation.subtitle && (
                  <p className="truncate text-xs text-slate-500 dark:text-white/60">
                    {recommendation.subtitle}
                  </p>
                )}
              </div>
            </div>

            <p className="mt-3 line-clamp-3 text-sm leading-5 text-slate-700 dark:text-white/75">
              {recommendation.explanationSummary}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-white/75">
                {confidenceLabels[recommendation.confidenceBand]}
              </span>
              {recommendation.sourceClassLabels.slice(0, 2).map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-white/10 dark:text-white/65"
                >
                  {label}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default RecommendedAuthorsModule;
