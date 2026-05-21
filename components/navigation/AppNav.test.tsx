import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppNav from "./AppNav.tsx";

const launchFeedback = vi.fn();
const currentView = { type: "tab", id: "home", params: {} };

vi.mock("../../lib/featureFlags.ts", () => ({
  isBetaFeedbackTriggerEnabled: vi.fn(() => false),
}));

vi.mock("../../store/i18n.tsx", () => ({
  useI18n: () => ({ isRTL: false, lang: "en" }),
}));

vi.mock("../../store/navigation.tsx", () => ({
  useNavigation: () => ({
    openDrawer: vi.fn(),
    navigate: vi.fn(),
    currentView,
  }),
}));

vi.mock("../../lib/hooks/useNotifications.ts", () => ({
  useUnreadNotificationsCount: () => ({ data: 0 }),
}));

vi.mock("../../lib/hooks/useSubmitFeedback.ts", () => ({
  useSubmitFeedback: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../../lib/feedback/useFeedbackLauncher.ts", () => ({
  useFeedbackLauncher: () => launchFeedback,
}));

describe("AppNav feedback entry", () => {
  beforeEach(async () => {
    launchFeedback.mockReset();
    currentView.type = "tab";
    currentView.id = "home";
    currentView.params = {};
    const flags = await import("../../lib/featureFlags.ts");
    vi.mocked(flags.isBetaFeedbackTriggerEnabled).mockReturnValue(false);
  });

  it("does not render the beta feedback trigger when disabled", () => {
    render(<AppNav titleEn="BookTown" titleAr="بوكتاون" />);
    expect(screen.queryByLabelText("Send feedback")).not.toBeInTheDocument();
  });

  it("launches the canonical feedback surface when enabled", async () => {
    const flags = await import("../../lib/featureFlags.ts");
    vi.mocked(flags.isBetaFeedbackTriggerEnabled).mockReturnValue(true);
    window.history.pushState({}, "", "/books/book-1");

    render(<AppNav titleEn="BookTown" titleAr="بوكتاون" />);
    fireEvent.click(screen.getByLabelText("Send feedback"));

    await waitFor(() => expect(launchFeedback).toHaveBeenCalledWith({ launchSource: "appnav" }));
  });

  it("does not render AppNav feedback outside the main tab cluster", async () => {
    const flags = await import("../../lib/featureFlags.ts");
    vi.mocked(flags.isBetaFeedbackTriggerEnabled).mockReturnValue(true);
    currentView.type = "tab";
    currentView.id = "social";

    render(<AppNav titleEn="BookTown" titleAr="بوكتاون" />);

    expect(screen.queryByLabelText("Send feedback")).not.toBeInTheDocument();
    currentView.id = "home";
  });
});
