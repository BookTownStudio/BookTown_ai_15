import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppNav from "./AppNav.tsx";

const submitFeedback = vi.fn();

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
    currentView: { type: "immersive", id: "bookDetails", params: { bookId: "book-1" } },
  }),
}));

vi.mock("../../lib/hooks/useNotifications.ts", () => ({
  useUnreadNotificationsCount: () => ({ data: 0 }),
}));

vi.mock("../../lib/hooks/useSubmitFeedback.ts", () => ({
  useSubmitFeedback: () => ({ mutate: submitFeedback, isPending: false }),
}));

describe("AppNav beta feedback instrumentation", () => {
  beforeEach(async () => {
    submitFeedback.mockReset();
    const flags = await import("../../lib/featureFlags.ts");
    vi.mocked(flags.isBetaFeedbackTriggerEnabled).mockReturnValue(false);
  });

  it("does not render the beta feedback trigger when disabled", () => {
    render(<AppNav titleEn="BookTown" titleAr="بوكتاون" />);
    expect(screen.queryByLabelText("Beta feedback")).not.toBeInTheDocument();
  });

  it("renders beta feedback trigger and submits contextual appnav payload when enabled", async () => {
    const flags = await import("../../lib/featureFlags.ts");
    vi.mocked(flags.isBetaFeedbackTriggerEnabled).mockReturnValue(true);
    window.history.pushState({}, "", "/books/book-1");

    render(<AppNav titleEn="BookTown" titleAr="بوكتاون" />);
    fireEvent.click(screen.getByLabelText("Beta feedback"));
    fireEvent.click(screen.getByText("Report a bug"));
    fireEvent.change(screen.getByPlaceholderText("What happened?"), {
      target: { value: "Reader controls are confusing." },
    });
    fireEvent.click(screen.getByText("Send Feedback"));

    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    expect(submitFeedback.mock.calls[0][0]).toMatchObject({
      source: "appnav_beta",
      intentType: "bug",
      text: "Reader controls are confusing.",
      clientContext: {
        route: "/books/book-1",
        viewId: "bookDetails",
        navigationType: "immersive",
        entity: { type: "book", id: "book-1" },
      },
    });
  });
});
