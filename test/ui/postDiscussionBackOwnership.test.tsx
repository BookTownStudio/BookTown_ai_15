import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PostDiscussionScreen from "../../app/social/post-discussion.tsx";

const {
  currentViewState,
  navigateMock,
  useQueryMock,
} = vi.hoisted(() => ({
  currentViewState: {
    type: "immersive",
    id: "postDiscussion",
    params: {
      postId: "post-1",
      from: {
        type: "tab",
        id: "social",
        params: {
          highlightPostId: "post-1",
          anchorPostId: "post-1",
          preferredScope: "explore",
        },
      },
    },
  } as any,
  navigateMock: vi.fn(),
  useQueryMock: vi.fn(),
}));

vi.mock("../../store/navigation.tsx", () => ({
  useNavigation: () => ({
    currentView: currentViewState,
    navigate: navigateMock,
  }),
}));

vi.mock("../../store/i18n.tsx", () => ({
  useI18n: () => ({
    lang: "en",
    isRTL: false,
  }),
}));

vi.mock("../../lib/react-query.ts", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
}));

vi.mock("../../services/dataService.ts", () => ({
  dataService: {
    social: {
      getPost: vi.fn(),
    },
  },
}));

vi.mock("../../components/ui/Button.tsx", () => ({
  default: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("../../components/content/ThreadComments.tsx", () => ({
  default: () => <div>thread-comments</div>,
}));

vi.mock("../../components/ui/BilingualText.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("../../components/ui/LoadingSpinner.tsx", () => ({
  default: () => <div>loading</div>,
}));

describe("Post discussion fallback back ownership", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    useQueryMock.mockReset();
    useQueryMock.mockReturnValue({
      data: {
        id: "post-1",
        authorId: "author-1",
        authorName: "Author",
        authorHandle: "@author",
        authorAvatar: "",
        visibility: "public",
        status: "published",
        timestamps: { createdAt: "2026-04-01T00:00:00.000Z" },
        content: { text: "Hello", attachments: [] },
      },
      isLoading: false,
      isError: false,
    });
  });

  it("renders explicit Social return control for internal-origin fallback entries", () => {
    render(<PostDiscussionScreen />);

    expect(screen.getByRole("button", { name: "Back to Social" })).toBeInTheDocument();
  });

  it("returns deterministically to Social without relying on browser history", () => {
    render(<PostDiscussionScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Back to Social" }));

    expect(navigateMock).toHaveBeenCalledWith(
      {
        type: "tab",
        id: "social",
        params: {
          highlightPostId: "post-1",
          anchorPostId: "post-1",
          preferredScope: "explore",
        },
      },
      { replace: true }
    );
  });
});
