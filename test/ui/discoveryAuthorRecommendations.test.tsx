import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RecommendedAuthorsModule from "../../components/discovery/RecommendedAuthorsModule.tsx";
import * as engine from "../../lib/domain/authorRecommendations";
import { clearDiscoveryAuthorRecommendationCache } from "../../lib/hooks/useDiscoveryAuthorRecommendations.ts";
import {
  authorSummary,
  directAffinity,
  generatedAt,
  input,
  rolledAffinity,
} from "../domain/authorRecommendations/testHelpers";

const { navigateMock, currentViewState, telemetryTrackMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  telemetryTrackMock: vi.fn(),
  currentViewState: {
    type: "tab",
    id: "discover",
  } as any,
}));

vi.mock("../../lib/hooks/useDiscoveryAuthorRecommendationSources.ts", () => ({
  useDiscoveryAuthorRecommendationSources: () => ({
    inputSources: null,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../../lib/authorRecommendations/discoveryAuthorRecommendationTelemetry", () => ({
  emptyCardOpenTelemetry: (outputCount: number) => ({
    moduleRendered: true,
    outputCount,
    confidenceBandHistogram: { low: 0, medium: 0, high: 0 },
    sourceClassHistogram: {},
    latencyBucket: "lt_100ms",
    cardOpens: 1,
  }),
  trackDiscoveryAuthorRecommendationTelemetry: telemetryTrackMock,
}));

vi.mock("../../store/navigation.tsx", () => ({
  useNavigation: () => ({
    currentView: currentViewState,
    navigate: navigateMock,
  }),
}));

function validInput() {
  return input({
    uid: "user_1",
    generatedAt,
    maxResults: 6,
    authorSummaries: [
      authorSummary("author_1", "Author One"),
      authorSummary("author_2", "Author Two"),
      authorSummary("author_3", "Author Three"),
      authorSummary("author_4", "Author Four"),
    ],
    authorAffinities: [
      directAffinity("author_1"),
      rolledAffinity("author_1"),
      directAffinity("author_2"),
      directAffinity("author_3"),
      directAffinity("author_4"),
    ],
  });
}

describe("RecommendedAuthorsModule", () => {
  beforeEach(() => {
    navigateMock.mockClear();
    telemetryTrackMock.mockClear();
    clearDiscoveryAuthorRecommendationCache();
    vi.restoreAllMocks();
  });

  it("suppresses the module and does not invoke the engine when the feature flag is off", () => {
    const spy = vi.spyOn(engine, "runAuthorRecommendationEngine");

    render(
      <RecommendedAuthorsModule input={validInput()} featureFlagEnabled={false} />
    );

    expect(screen.queryByText("Recommended Authors")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(telemetryTrackMock).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("renders bounded author cards when the feature flag is on", () => {
    render(<RecommendedAuthorsModule input={validInput()} featureFlagEnabled />);

    expect(screen.getByText("Recommended Authors")).toBeTruthy();
    expect(screen.getByText("Author One")).toBeTruthy();
    expect(screen.getByText("Author Two")).toBeTruthy();
    expect(screen.getByText("Author Three")).toBeTruthy();
    expect(screen.queryByText("Author Four")).toBeNull();
    expect(telemetryTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleRendered: true,
        outputCount: 4,
      })
    );
  });

  it("opens Author Details with the canonical Author ID", () => {
    render(<RecommendedAuthorsModule input={validInput()} featureFlagEnabled />);

    fireEvent.click(screen.getByText("Author One"));

    expect(navigateMock).toHaveBeenCalledWith({
      type: "immersive",
      id: "authorDetails",
      params: { authorId: "author_1", from: currentViewState },
    });
  });

  it("renders from approved runtime input sources", () => {
    render(
      <RecommendedAuthorsModule
        inputSources={{
          uid: "user_1",
          generatedAt,
          maxResults: 6,
          directAuthorAffinities: [directAffinity("author_1")],
          rolledAuthorAffinities: [],
          authorSummaries: [authorSummary("author_1", "Author One")],
        }}
        featureFlagEnabled
      />
    );

    expect(screen.getByText("Recommended Authors")).toBeTruthy();
    expect(screen.getByText("Author One")).toBeTruthy();
  });

  it("emits aggregate-only card open telemetry", () => {
    const onTelemetry = vi.fn();
    render(
      <RecommendedAuthorsModule
        input={validInput()}
        featureFlagEnabled
        onTelemetry={onTelemetry}
      />
    );

    fireEvent.click(screen.getByText("Author One"));

    expect(onTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleRendered: true,
        outputCount: 4,
        cardOpens: 1,
      })
    );
    expect(telemetryTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleRendered: true,
        outputCount: 4,
        cardOpens: 1,
      })
    );
    const serialized = JSON.stringify(onTelemetry.mock.calls);
    expect(serialized).not.toContain("author_1");
    expect(serialized).not.toContain("evidenceId");
    expect(serialized).not.toContain("outputId");
    expect(serialized).not.toContain("0.9");
  });

  it("does not expose raw evidence, output IDs, confidence scores, or provenance", () => {
    const { container } = render(
      <RecommendedAuthorsModule input={validInput()} featureFlagEnabled />
    );

    const rendered = container.textContent ?? "";
    expect(rendered).toContain("High confidence");
    expect(rendered).not.toContain("0.9");
    expect(rendered).not.toContain("outputId");
    expect(rendered).not.toContain("evidenceId");
    expect(rendered).not.toContain("author_recommendation_v1:output");
    expect(rendered).not.toContain("author_recommendation_v1:evidence");
    expect(rendered).not.toContain("provenance");
    expect(rendered).not.toContain("sourceId");
  });

  it("suppresses empty output without rendering a blank module", () => {
    render(
      <RecommendedAuthorsModule
        input={input({ generatedAt, authorSummaries: [], authorAffinities: [] })}
        featureFlagEnabled
      />
    );

    expect(screen.queryByText("Recommended Authors")).toBeNull();
    expect(telemetryTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleRendered: false,
        outputCount: 0,
        fallbackReason: "empty_output",
      })
    );
  });

  it("suppresses engine errors without rendering a fallback module", () => {
    vi.spyOn(engine, "runAuthorRecommendationEngine").mockImplementation(() => {
      throw new Error("engine failed");
    });

    render(<RecommendedAuthorsModule input={validInput()} featureFlagEnabled />);

    expect(screen.queryByText("Recommended Authors")).toBeNull();
    expect(telemetryTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleRendered: false,
        outputCount: 0,
        fallbackReason: "engine_error",
      })
    );
  });

  it("does not treat AI Librarian author payloads as governed Author Recommendations", () => {
    const spy = vi.spyOn(engine, "runAuthorRecommendationEngine");
    const aiLibrarianPayload = {
      authorRecommendations: [
        {
          id: "llm_author",
          name: "LLM Author",
          why_recommended: "Generated by chat response.",
        },
      ],
    };

    render(
      <RecommendedAuthorsModule
        input={aiLibrarianPayload as never}
        featureFlagEnabled
      />
    );

    expect(screen.queryByText("Recommended Authors")).toBeNull();
    expect(screen.queryByText("LLM Author")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(telemetryTrackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleRendered: false,
        fallbackReason: "input_unavailable",
      })
    );
  });
});
