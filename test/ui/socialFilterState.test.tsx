import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SocialScreen from "../../app/tabs/social.tsx";

const {
  currentViewState,
  navigateMock,
  useSocialFeedsMock,
  useSocialSearchMock,
  launchFeedbackMock,
} = vi.hoisted(() => ({
  currentViewState: {
    type: "tab",
    id: "social",
    params: {},
  } as any,
  navigateMock: vi.fn(),
  useSocialFeedsMock: vi.fn(),
  useSocialSearchMock: vi.fn(),
  launchFeedbackMock: vi.fn(),
}));

vi.mock("../../store/i18n.tsx", () => ({
  useI18n: () => ({
    lang: "en",
    isRTL: false,
  }),
}));

vi.mock("../../store/navigation.tsx", () => ({
  useNavigation: () => ({
    navigate: navigateMock,
    currentView: currentViewState,
    resetTokens: { home: 0, read: 0, discover: 0, write: 0, social: 0 },
    scrollToPost: null,
    clearScrollToPost: vi.fn(),
    socialPostEntry: null,
    clearSocialPostEntry: vi.fn(),
  }),
}));

vi.mock("../../lib/hooks/useSocialFeeds.ts", () => ({
  useSocialFeeds: (...args: unknown[]) => useSocialFeedsMock(...args),
}));

vi.mock("../../lib/hooks/useSocialSearch.ts", () => ({
  useSocialSearch: (...args: unknown[]) => useSocialSearchMock(...args),
}));

vi.mock("../../lib/auth.tsx", () => ({
  useAuth: () => ({
    user: { uid: "viewer-1" },
  }),
}));

vi.mock("../../lib/featureFlags.ts", () => ({
  isBetaFeedbackTriggerEnabled: vi.fn(() => false),
}));

vi.mock("../../lib/feedback/useFeedbackLauncher.ts", () => ({
  useFeedbackLauncher: () => launchFeedbackMock,
}));

vi.mock("use-debounce", () => ({
  useDebounce: (value: string) => [value],
}));

vi.mock("../../components/content/VirtualizedPostFeed.tsx", () => ({
  default: ({ posts }: { posts: Array<{ id: string }> }) => (
    <div data-testid="virtualized-feed">{posts.map((post) => post.id).join(",")}</div>
  ),
}));

vi.mock("../../components/ui/LoadingSpinner.tsx", () => ({
  default: () => <div>loading</div>,
}));

vi.mock("../../components/ui/Button.tsx", () => ({
  default: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("../../components/ui/GlassCard.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/ui/ErrorState.tsx", () => ({
  default: () => <div>error-state</div>,
}));

vi.mock("../../components/ui/EmptyState.tsx", () => ({
  default: () => <div>empty-state</div>,
}));

vi.mock("../../components/ui/BilingualText.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("../../components/content/PostCard.tsx", () => ({
  default: ({ post }: { post: { id: string } }) => <div>post-card-{post.id}</div>,
}));

vi.mock("../../components/content/UserSearchResultCard.tsx", () => ({
  default: () => <div>user-result</div>,
}));

vi.mock("../../components/content/TopicSearchResultCard.tsx", () => ({
  default: () => <div>topic-result</div>,
}));

function latestFeedArgs(): unknown[] {
  const calls = useSocialFeedsMock.mock.calls;
  return calls[calls.length - 1] ?? [];
}

describe("Social filter state", () => {
  beforeEach(async () => {
    const flags = await import("../../lib/featureFlags.ts");
    vi.mocked(flags.isBetaFeedbackTriggerEnabled).mockReturnValue(false);
    navigateMock.mockReset();
    useSocialFeedsMock.mockReset();
    useSocialSearchMock.mockReset();
    launchFeedbackMock.mockReset();
    currentViewState.params = {};

    useSocialFeedsMock.mockReturnValue({
      data: {
        pages: [
          {
            posts: [
              {
                id: "post-1",
                authorId: "author-1",
                authorName: "Author",
                authorHandle: "@author",
                authorAvatar: "",
                content: { text: "hello", attachments: [] },
                visibility: "public",
                status: "published",
                timestamps: { createdAt: "2026-04-01T00:00:00.000Z" },
                flags: { hasAttachments: false },
              },
            ],
          },
        ],
      },
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: vi.fn(),
    });
    useSocialSearchMock.mockReturnValue({
      results: { users: [], topics: [], posts: [] },
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: vi.fn(),
    });

    Element.prototype.scrollTo = vi.fn();
  });

  it("restores Explore to the unfiltered global feed after ellipsis filters are selected", async () => {
    render(<SocialScreen />);

    expect(latestFeedArgs()).toEqual(["explore", []]);

    fireEvent.click(screen.getByRole("button", { name: "More filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Media" }));

    await waitFor(() => {
      expect(latestFeedArgs()).toEqual(["explore", ["media"]]);
    });

    fireEvent.click(screen.getByRole("tab", { name: "Explore" }));

    await waitFor(() => {
      expect(latestFeedArgs()).toEqual(["explore", []]);
    });
  });

  it("does not carry ellipsis filters across scope changes", async () => {
    render(<SocialScreen />);

    fireEvent.click(screen.getByRole("button", { name: "More filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Quotes" }));

    await waitFor(() => {
      expect(latestFeedArgs()).toEqual(["explore", ["quote"]]);
    });

    fireEvent.click(screen.getByRole("tab", { name: "Books" }));

    await waitFor(() => {
      expect(latestFeedArgs()).toEqual(["books", []]);
    });
  });

  it("launches canonical feedback from the Social rail with return state when enabled", async () => {
    const flags = await import("../../lib/featureFlags.ts");
    vi.mocked(flags.isBetaFeedbackTriggerEnabled).mockReturnValue(true);

    render(<SocialScreen />);

    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    expect(launchFeedbackMock).toHaveBeenCalledWith({
      launchSource: "social",
      from: {
        type: "tab",
        id: "social",
        params: {
          feedbackReturnState: {
            scope: "explore",
            filters: [],
            scrollTop: 0,
          },
        },
      },
    });
  });
});
