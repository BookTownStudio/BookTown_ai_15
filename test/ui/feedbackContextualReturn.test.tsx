import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FeedbackScreen from "../../app/drawer/feedback.tsx";

const {
  currentViewState,
  navigateMock,
  submitFeedbackMock,
} = vi.hoisted(() => ({
  currentViewState: {
    type: "immersive",
    id: "feedback",
    params: {
      from: { type: "tab", id: "social", params: { feedbackReturnState: { scope: "books", filters: ["quote"], scrollTop: 320 } } },
      feedbackSource: "appnav_beta",
      feedbackContext: {
        route: "/social",
        viewId: "social",
        navigationType: "tab",
        activeTab: "social",
        locale: "en",
      },
    },
  } as any,
  navigateMock: vi.fn(),
  submitFeedbackMock: vi.fn(),
}));

vi.mock("../../store/i18n.tsx", () => ({
  useI18n: () => ({ lang: "en", isRTL: false }),
}));

vi.mock("../../store/navigation.tsx", () => ({
  useNavigation: () => ({
    navigate: navigateMock,
    currentView: currentViewState,
  }),
}));

vi.mock("../../lib/auth.tsx", () => ({
  useAuth: () => ({ user: { uid: "viewer-1", email: "beta@example.com" } }),
}));

vi.mock("../../lib/hooks/useSubmitFeedback.ts", () => ({
  useSubmitFeedback: () => ({
    mutate: submitFeedbackMock,
    isPending: false,
  }),
}));

vi.mock("../../lib/hooks/useFeedbackAttachmentUpload.ts", () => ({
  useFeedbackAttachmentUpload: () => ({
    uploadAttachments: vi.fn(),
    isUploading: false,
  }),
  validateFeedbackAttachmentFile: vi.fn(),
}));

vi.mock("../../components/navigation/ScreenHeader.tsx", () => ({
  default: ({ onBack }: { onBack: () => void }) => <button onClick={onBack}>Back</button>,
}));

vi.mock("../../components/ui/BilingualText.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("../../components/ui/Button.tsx", () => ({
  default: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("../../components/ui/InputField.tsx", () => ({
  default: ({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: React.ChangeEventHandler<HTMLInputElement> }) => (
    <label>
      {label}
      <input id={id} value={value} onChange={onChange} />
    </label>
  ),
}));

vi.mock("../../components/layout/ContentRail.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe("canonical feedback contextual return", () => {
  beforeEach(() => {
    window.localStorage.clear();
    navigateMock.mockReset();
    submitFeedbackMock.mockReset();
    submitFeedbackMock.mockImplementation((_payload, options) => {
      void options?.onSuccess?.({
        feedbackId: "feedback-1",
        status: "new",
        receivedAt: "2026-05-21T00:00:00.000Z",
        correlationId: "corr-1",
      });
    });
  });

  it("submits contextual launcher payload through drawer/feedback and returns to the prior surface", async () => {
    render(<FeedbackScreen />);

    fireEvent.change(screen.getByPlaceholderText("Please provide as much detail as possible..."), {
      target: { value: "The social feed jumped after opening comments." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));

    await waitFor(() => expect(submitFeedbackMock).toHaveBeenCalledTimes(1));
    expect(submitFeedbackMock.mock.calls[0][0]).toMatchObject({
      source: "appnav_beta",
      intentType: "bug",
      text: "The social feed jumped after opening comments.",
      contactEmail: "beta@example.com",
      clientContext: {
        route: "/social",
        viewId: "social",
        activeTab: "social",
      },
    });
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(currentViewState.params.from);
    });
  });

  it("returns to the prior surface when contextual feedback is closed", () => {
    render(<FeedbackScreen />);

    fireEvent.click(screen.getByText("Back"));

    expect(navigateMock).toHaveBeenCalledWith(currentViewState.params.from);
  });
});
