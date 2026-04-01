import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProfileScreen from "../../app/drawer/profile.tsx";

const {
  currentViewState,
  navigateMock,
  navigateToSocialPostEntryMock,
  useUserProfilePostsMock,
} = vi.hoisted(() => ({
  currentViewState: {
    type: "immersive",
    id: "profile",
    params: {},
  } as any,
  navigateMock: vi.fn(),
  navigateToSocialPostEntryMock: vi.fn(),
  useUserProfilePostsMock: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      layoutId: _layoutId,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { layoutId?: string }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../store/i18n.tsx", () => ({
  useI18n: () => ({
    lang: "en",
    isRTL: false,
  }),
}));

vi.mock("../../lib/auth.tsx", () => ({
  useAuth: () => ({
    user: { uid: "viewer-1" },
    isGuest: false,
  }),
}));

vi.mock("../../store/navigation.tsx", () => ({
  useNavigation: () => ({
    currentView: currentViewState,
    navigate: navigateMock,
    navigateToSocialPostEntry: navigateToSocialPostEntryMock,
  }),
}));

vi.mock("../../lib/hooks/useUserProfile.ts", () => ({
  useUserProfile: () => ({
    data: {
      uid: "viewer-1",
      name: "Viewer",
      handle: "@viewer",
      avatarUrl: "",
      bannerUrl: "",
      joinDate: "2026-01-01T00:00:00.000Z",
      bioEn: "",
      bioAr: "",
      followers: 0,
      following: 0,
      booksRead: 0,
      wordsWritten: 0,
    },
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/useUserStats.ts", () => ({
  useUserStats: () => ({
    data: null,
    isError: false,
  }),
}));

vi.mock("../../lib/hooks/useUserFollowList.ts", () => ({
  useUserFollowList: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/useUserShelves.ts", () => ({
  useUserShelves: () => ({
    data: [],
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/useUserProfilePosts.ts", () => ({
  useUserProfilePosts: (...args: unknown[]) => useUserProfilePostsMock(...args),
}));

vi.mock("../../lib/hooks/useUserProfileReviews.ts", () => ({
  useUserProfileReviews: () => ({
    data: [],
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../../lib/hooks/useUserProfilePublications.ts", () => ({
  useUserProfilePublications: () => ({
    data: [],
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("../../lib/hooks/useUpdateProfile.ts", () => ({
  useUpdateProfile: () => ({
    mutate: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/useMessenger.ts", () => ({
  useStartConversation: () => ({
    mutate: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("../../lib/hooks/useFollowUser.ts", () => ({
  useFollowStatus: () => ({ data: false }),
  useFollowUser: () => ({ mutate: vi.fn(), isLoading: false }),
  useUnfollowUser: () => ({ mutate: vi.fn(), isLoading: false }),
}));

vi.mock("../../lib/hooks/useProjectMutations.ts", () => ({
  useUpdateLongformPublicationVisibility: () => ({
    mutate: vi.fn(),
    isLoading: false,
  }),
  useUpdatePublishedBookVisibility: () => ({
    mutate: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock("../../components/ui/LoadingSpinner.tsx", () => ({
  default: () => <div>loading</div>,
}));

vi.mock("../../components/ui/Button.tsx", () => ({
  default: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("../../components/ui/BilingualText.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("../../components/layout/PageShell.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../components/ui/ProfileStrengthBar.tsx", () => ({
  default: () => <div>profile-strength</div>,
}));

vi.mock("../../components/content/ShelfCarousel.tsx", () => ({
  default: () => <div>shelf-carousel</div>,
}));

vi.mock("../../components/content/PostCard.tsx", () => ({
  default: ({
    post,
    onOpenPostEntry,
  }: {
    post: { id: string };
    onOpenPostEntry?: () => void;
  }) => (
    <button onClick={onOpenPostEntry}>
      open-profile-post-{post.id}
    </button>
  ),
}));

vi.mock("../../components/content/ReviewCard.tsx", () => ({
  default: () => <div>review-card</div>,
}));

vi.mock("../../components/content/CanonicalCoverArtwork.tsx", () => ({
  default: () => <div>cover-art</div>,
}));

vi.mock("../../components/modals/EditProfileModal.tsx", () => ({
  default: () => null,
}));

vi.mock("../../components/modals/ConfirmDeleteModal.tsx", () => ({
  default: () => null,
}));

vi.mock("../../components/modals/ProfileConnectionsModal.tsx", () => ({
  default: () => null,
}));

describe("Profile posts Social entry", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    navigateToSocialPostEntryMock.mockReset();
    useUserProfilePostsMock.mockReset();
    localStorage.clear();
    localStorage.setItem("booktown_profile_tab_v1:viewer-1", "posts");
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("routes profile post taps through Social ownership with anchored discussion intent", () => {
    useUserProfilePostsMock.mockReturnValue({
      data: [
        {
          id: "post-42",
          visibility: "followers",
          authorId: "viewer-1",
          authorName: "Viewer",
          authorHandle: "@viewer",
          authorAvatar: "",
          content: { text: "A post", attachments: [] },
          status: "published",
          timestamps: { createdAt: "2026-04-01T00:00:00.000Z" },
          flags: { hasAttachments: false },
        },
      ],
      isLoading: false,
      isError: false,
    });

    render(<ProfileScreen />);

    fireEvent.click(screen.getByText("open-profile-post-post-42"));

    expect(navigateToSocialPostEntryMock).toHaveBeenCalledWith("post-42", {
      openDiscussion: true,
      fallbackToStandalone: true,
      preferredScope: "following",
    });
  });
});
