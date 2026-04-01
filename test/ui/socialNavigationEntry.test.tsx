import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SocialScreen from "../../app/tabs/social.tsx";

const {
  currentViewState,
  socialPostEntryState,
  navigateMock,
  clearSocialPostEntryMock,
  useSocialFeedsMock,
  useSocialSearchMock,
} = vi.hoisted(() => ({
  currentViewState: {
    type: "tab",
    id: "social",
    params: {
      highlightPostId: "post-1",
      anchorPostId: "post-1",
      preferredScope: "explore",
    },
  } as any,
  socialPostEntryState: {
    entryId: 1,
    postId: "post-1",
    openDiscussion: true,
    fallbackToStandalone: true,
    preferredScope: "explore",
  } as any,
  navigateMock: vi.fn(),
  clearSocialPostEntryMock: vi.fn(),
  useSocialFeedsMock: vi.fn(),
  useSocialSearchMock: vi.fn(),
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
    socialPostEntry: socialPostEntryState,
    clearSocialPostEntry: clearSocialPostEntryMock,
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

vi.mock("use-debounce", () => ({
  useDebounce: (value: string) => [value],
}));

vi.mock("../../components/content/PostCard.tsx", () => ({
  default: ({ post }: { post: { id: string } }) => <div>post-card-{post.id}</div>,
}));

vi.mock("../../components/content/InteractionRail.tsx", () => ({
  default: () => <div>interaction-rail</div>,
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

vi.mock("../../components/content/UserSearchResultCard.tsx", () => ({
  default: () => <div>user-result</div>,
}));

vi.mock("../../components/content/TopicSearchResultCard.tsx", () => ({
  default: () => <div>topic-result</div>,
}));

describe("Social navigation entry contract", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    clearSocialPostEntryMock.mockReset();
    useSocialFeedsMock.mockReset();
    useSocialSearchMock.mockReset();
    socialPostEntryState.entryId = 1;
    socialPostEntryState.postId = "post-1";
    socialPostEntryState.openDiscussion = true;
    socialPostEntryState.fallbackToStandalone = true;
    socialPostEntryState.preferredScope = "explore";
    currentViewState.params = {
      highlightPostId: "post-1",
      anchorPostId: "post-1",
      preferredScope: "explore",
    };

    class MockIntersectionObserver {
      observe() {}
      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: MockIntersectionObserver,
    });
    Element.prototype.scrollIntoView = vi.fn();
  });
  it("opens post discussion from Social when the anchored post is already loaded", async () => {
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

    render(<SocialScreen />);

    await waitFor(() => {
      expect(clearSocialPostEntryMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith({
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
      });
    });
  });

  it("falls back explicitly to post discussion when the anchor is unavailable in the loaded feed", async () => {
    useSocialFeedsMock.mockReturnValue({
      data: { pages: [{ posts: [] }] },
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

    render(<SocialScreen />);

    await waitFor(() => {
      expect(clearSocialPostEntryMock).toHaveBeenCalledTimes(1);
      expect(navigateMock).toHaveBeenCalledWith({
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
      });
    });
  });
});
