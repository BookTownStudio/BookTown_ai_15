// lib/queryKeys.ts

// -------------------------
// Identity Helpers
// -------------------------

// Normalize identity across app (auth / guest)
// FIX: Updated identity helpers to accept null, matching useAuth's effectiveUid.
const normalizeUid = (uid: string | null | undefined) => uid ?? 'anonymous';

// Session root → this is the key architectural upgrade
// FIX: Updated sessionRoot to accept null.
const sessionRoot = (uid: string | null | undefined) =>
  ['session', normalizeUid(uid)] as const;

// Helper to ensure no undefined leaks into key objects
const safe = <T extends object>(obj: T) => obj;

// -------------------------
// Tier-1 Structured Keys
// -------------------------

export const queryKeys = {
  // -------------------------
  // User Data (SESSION SCOPED)
  // -------------------------
  user: {
    all: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user'] as const,

    profile: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user', 'profile'] as const,

    profilePosts: (
      sessionUid: string | null | undefined,
      profileUid: string | undefined
    ) =>
      [...sessionRoot(sessionUid), 'user', 'profilePosts', safe({ profileUid })] as const,

    profileReviews: (
      sessionUid: string | null | undefined,
      profileUid: string | undefined
    ) =>
      [...sessionRoot(sessionUid), 'user', 'profileReviews', safe({ profileUid })] as const,

    profileBooks: (
      sessionUid: string | null | undefined,
      profileUid: string | undefined
    ) =>
      [...sessionRoot(sessionUid), 'user', 'profileBooks', safe({ profileUid })] as const,

    profilePublications: (
      sessionUid: string | null | undefined,
      profileUid: string | undefined
    ) =>
      [...sessionRoot(sessionUid), 'user', 'profilePublications', safe({ profileUid })] as const,

    // FIX: Added 'stats' to user query keys for authoritative read path.
    stats: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user', 'stats'] as const,

    shelves: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user', 'shelves'] as const,

    shelfDetails: (uid: string | null | undefined, shelfId: string | undefined) =>
      [...sessionRoot(uid), 'user', 'shelf', safe({ shelfId })] as const,

    shelfEntries: (uid: string | null | undefined, shelfId: string | undefined) =>
      [...sessionRoot(uid), 'user', 'shelfEntries', safe({ shelfId })] as const,

    projects: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user', 'projects'] as const,

    project: (uid: string | null | undefined, projectId: string | undefined) =>
      [...sessionRoot(uid), 'user', 'project', safe({ projectId })] as const,

    projectPublicationSettings: (uid: string | null | undefined, projectId: string | undefined) =>
      [...sessionRoot(uid), 'user', 'projectPublicationSettings', safe({ projectId })] as const,

    projectReleasePreview: (
      uid: string | null | undefined,
      releaseId: string | undefined,
      previewType: "blog" | "ebook" | undefined
    ) =>
      [...sessionRoot(uid), 'user', 'projectReleasePreview', safe({ releaseId, previewType })] as const,

    longformPublications: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user', 'longformPublications'] as const,

    quotes: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user', 'quotes'] as const,

    bookmarks: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user', 'bookmarks'] as const,

    bookmarkStatus: (uid: string | null | undefined, type: string, entityId: string) =>
      [...sessionRoot(uid), 'user', 'bookmarkStatus', safe({ type, entityId })] as const,

    authorFollow: (uid: string | null | undefined, authorId: string | undefined) =>
      [...sessionRoot(uid), 'user', 'authorFollow', safe({ authorId })] as const,

    drafts: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user', 'drafts'] as const,

    notifications: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user', 'notifications'] as const,

    agentSessions: (uid: string | null | undefined) =>
      [...sessionRoot(uid), 'user', 'sessions'] as const,
  },

  // -------------------------
  // Content Catalog (GLOBAL)
  // -------------------------
  catalog: {
    all: ['catalog'] as const,

    book: (id: string | undefined) =>
      ['catalog', 'book', safe({ id })] as const,

    publication: (publicationId: string | undefined) =>
      ['catalog', 'publication', safe({ publicationId })] as const,

    author: (id: string | undefined) =>
      ['catalog', 'author', safe({ id })] as const,

    authors: (filters: {
      query: string | null;
      limit: number | null;
    }) =>
      ['catalog', 'authors', safe(filters)] as const,

    quotes: (filters: {
      query: string | null;
      bookId: string | null;
      authorId: string | null;
      limit: number | null;
    }) =>
      ['catalog', 'quotes', safe(filters)] as const,

    reviews: (bookId: string | undefined) =>
      ['catalog', 'reviews', safe({ bookId })] as const,
  },

  // -------------------------
  // Social (SESSION AWARE)
  // -------------------------
  social: {
    all: ['social'] as const,

    feed: (filter: string, uid: string | undefined) =>
      ['social', 'feed', safe({ filter, uid: normalizeUid(uid) })] as const,

    post: (id: string | undefined) =>
      ['social', 'post', safe({ id })] as const,

    suggestedProfiles: (uid: string | undefined) =>
      ['social', 'suggestions', safe({ uid: normalizeUid(uid) })] as const,
  },

  // -------------------------
  // Venues (GLOBAL)
  // -------------------------
  venues: {
    all: ['venues'] as const,

    search: (query: string) =>
      ['venues', 'search', safe({ query: query.trim().toLowerCase() })] as const,

    detail: (id: string | undefined) =>
      ['venues', 'detail', safe({ id })] as const,

    reviews: (id: string | undefined) =>
      ['venues', 'reviews', safe({ id })] as const,
  }
};
