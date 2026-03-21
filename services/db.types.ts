
import {
  User,
  Project,
  Shelf,
  Book,
  Quote,
  Post,
  Notification,
  PostDraft,
  Bookmark,
  Author,
  Venue,
  Event,
  ShelfEntry,
  Review,
  VenueReview,
  Conversation,
  DirectMessage,
  AgentSession,
  ChatMessage,
  Feedback,
  PublishedBook,
  AttachmentMetadataV1,
  AttachmentV1,
  ThreadComment,
  RecommendedShelf,
  BookEdition,
  BibliographicWork,
  EditionReadingState,
  Ebook,
  ExternalSource
} from '../types/entities.ts';
import type { LibrarianRecommendationContext } from '../types/librarian.ts';

/* =========================
   UPLOADS
   ========================= */
export type UploadCategory =
  | 'cover'
  | 'banner'
  | 'avatar'
  | 'post'
  | 'venue'
  | 'misc'
  | 'attachment';

/* =========================
   DERIVED STATS
   ========================= */
export interface PostStats {
  likesCount: number;
  bookmarksCount: number;
  repostsCount: number;
  commentsCount: number;
}

// FIX: Expanded UserStats interface to include all counters used in the application, resolving type errors in services/firebaseDbService.ts.
export interface UserStats {
  followers: number;
  following: number;
  postsPublished: number;
  shelvesCreated: number;
  quotesAuthored: number;
  posts: number;
  reviews: number;
  booksRead: number;
  booksPublished: number;
  wordsWritten: number;
  profileCompletionScore?: number;
}

export interface BookStats {
  bookmarks: number;
  reviews: number;
  ratingsCount: number;
  averageRating: number;
}

export interface LongformPublicationRecord {
  publicationId: string;
  title: string;
  coverUrl?: string;
  excerpt: string;
  estimatedReadingMinutes: number;
  normalizedContent: {
    units: Array<{
      index: number;
      title: string;
      type: "chapter" | "section";
      content: Array<Record<string, unknown>>;
    }>;
  };
  ownerUid: string;
  language: string;
}

export interface ShelfStats {
  followers: number;
  posts: number;
}

export interface AgentTurnPersistenceInput {
  agentId: string;
  title?: string;
  lastMessage?: string;
  timestamp?: string;
  isPinned?: boolean;
  contextWindowSize?: number;
  userMessage: Omit<ChatMessage, 'id'>;
  modelMessage: Omit<ChatMessage, 'id'>;
}

export type FeedRankingMode = 'chronological' | 'relevant';

/* =========================
   UPLOAD SERVICE
   ========================= */
export interface UploadDataService {
  getUploadToken(
    uid: string,
    parentType: string,
    parentId: string,
    type: string,
    fileName: string,
    contentType?: string,
    size?: number
  ): Promise<{ token: string; uploadUrl: string; attachmentId: string }>;

  uploadImage(
    uid: string,
    category: UploadCategory,
    file: File,
    id?: string
  ): Promise<string>;

  uploadFile(uid: string, path: string, file: Blob): Promise<string>;

  finalizeMetadata(
    uid: string,
    parentType: string,
    parentId: string,
    attachmentId: string,
    token: string
  ): Promise<AttachmentV1>;
}

/* =========================
   ATTACHMENTS
   ========================= */
export interface AttachmentDataService {
  createMetadata(metadata: AttachmentMetadataV1): Promise<void>;
  getMetadata(attachmentId: string): Promise<AttachmentMetadataV1 | null>;
}

/* =========================
   LIBRARY / BIBLIOGRAPHIC
   ========================= */
export interface LibrarySearchDataService {
  search(
    query: string,
    options?: { lang?: string; limit?: number }
  ): Promise<BookEdition[]>;

  getEdition(editionId: string): Promise<BookEdition | null>;
  getWork(workId: string): Promise<BibliographicWork | null>;

  getReadingState(
    uid: string,
    editionId: string
  ): Promise<EditionReadingState | null>;

  saveReadingState(
    uid: string,
    editionId: string,
    state: Partial<EditionReadingState>
  ): Promise<void>;

  ingestExternalResult(
    source: 'google_books' | 'open_library',
    externalId: string
  ): Promise<BookEdition>;

  getEbook(ebookId: string): Promise<Ebook | null>;
  getEbookByEdition(editionId: string): Promise<Ebook | null>;
  logExternalSource(source: ExternalSource): Promise<void>;
}

/* =========================
   USERS
   ========================= */
export interface UserDataService {
  getProfile(uid: string): Promise<User>;
  createProfile(uid: string, user: User): Promise<void>;
  updateProfile(uid: string, data: Partial<User>): Promise<void>;

  getSuggestedProfiles(uid: string): Promise<User[]>;
  getProfilePosts(uid: string, limit?: number): Promise<Post[]>;
  getProfileReviews(uid: string, limit?: number): Promise<Review[]>;
  getProfileReviewsPage(
    uid: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ items: Review[]; hasMore: boolean; nextCursor?: string; revision?: string }>;
  getProfileBooks(uid: string, limit?: number): Promise<Book[]>;
  followUser(followerId: string, targetId: string): Promise<void>;
  unfollowUser(followerId: string, targetId: string): Promise<void>;

  muteAuthor(uid: string, authorId: string): Promise<void>;
  blockAuthor(uid: string, authorId: string): Promise<void>;

  getRankingPreference(uid: string): Promise<FeedRankingMode>;
  updateRankingPreference(uid: string, mode: FeedRankingMode): Promise<void>;

  getStats(uid: string): Promise<UserStats>;

  getBookmarks(uid: string): Promise<Bookmark[]>;
  saveBookmark(
    uid: string,
    bookmark: Omit<Bookmark, 'id' | 'timestamp'>
  ): Promise<void>;
  unbookmarkPost(uid: string, postId: string): Promise<void>;
  hasUserBookmarkedPost(uid: string, postId: string): Promise<boolean>;

  setInteraction(
    uid: string,
    entityType: string,
    entityId: string,
    updates: { like?: boolean; bookmark?: boolean; repost?: boolean }
  ): Promise<void>;

  getInteraction(
    uid: string,
    entityType: string,
    entityId: string
  ): Promise<{ like: boolean; bookmark: boolean; repost: boolean }>;

  getUserQuotes(uid: string): Promise<Quote[]>;
  getQuote(uid: string, quoteId: string): Promise<Quote>;
  saveQuote(uid: string, quote: Omit<Quote, 'id'>): Promise<void>;

  getAgentSessions(uid: string): Promise<AgentSession[]>;
  getChatHistory(uid: string, sessionId: string): Promise<ChatMessage[]>;
  appendAgentTurn(
    uid: string,
    sessionId: string,
    turn: AgentTurnPersistenceInput
  ): Promise<void>;
  saveAgentMessage(
    uid: string,
    sessionId: string,
    message: Omit<ChatMessage, 'id'>
  ): Promise<void>;
  updateAgentSession(
    uid: string,
    sessionId: string,
    data: Partial<AgentSession>
  ): Promise<void>;
  createAgentSession(uid: string, session: AgentSession): Promise<void>;

  importGoodreadsData(
    uid: string,
    file: File
  ): Promise<{ booksImported: number; shelvesCreated: number; reviewsImported: number }>;

  saveReadingProgress(uid: string, bookId: string, progress: any): Promise<void>;
  submitFeedback(
    uid: string,
    feedback: Omit<Feedback, 'id' | 'userId' | 'timestamp'>
  ): Promise<void>;
}

/* =========================
   PROJECTS
   ========================= */
export interface ProjectDataService {
  getProjects(uid: string): Promise<Project[]>;
  getProject(uid: string, projectId: string): Promise<Project>;
  createProject(
    uid: string,
    project: Omit<Project, 'id' | 'updatedAt' | 'createdAt'>
  ): Promise<Project>;
  updateProject(
    uid: string,
    projectId: string,
    updates: Partial<Project>,
    options?: { expectedRevision?: number }
  ): Promise<{ projectId: string; revision: number; updatedAt: string }>;
  duplicateProject(uid: string, projectId: string): Promise<Project>;
  deleteProject(uid: string, projectId: string): Promise<void>;
  createShareLink(
    uid: string,
    projectId: string,
    origin?: string
  ): Promise<{ projectId: string; token: string; shareUrl: string; isRevoked: boolean; createdAt: string; updatedAt: string }>;
  revokeShareLink(
    uid: string,
    projectId: string
  ): Promise<{ projectId: string; revoked: boolean; revokedAt: string | null }>;

  stageBookFiles(
    uid: string,
    projectId: string,
    files: { epub: Blob; pdf: Blob }
  ): Promise<{ epubUrl: string; pdfUrl: string }>;

  publishBook(
    uid: string,
    projectId: string,
    metadata: { title: string; description: string; coverUrl?: string },
    files: { epubUrl: string; pdfUrl: string }
  ): Promise<PublishedBook>;

  createProjectRelease(
    projectId: string,
    publishKind: "ebook_epub" | "blog"
  ): Promise<{
    releaseId: string;
    version: number;
    normalizedContent: {
      units: Array<{
        index: number;
        title: string;
        type: "chapter" | "section";
        content: Array<Record<string, unknown>>;
      }>;
    };
  }>;

  generateProjectReleaseEpub(
    releaseId: string
  ): Promise<{
    releaseId: string;
    projectId: string;
    epubStoragePath: string;
    attachmentId: string;
    binaryStatus: "ready";
  }>;

  bridgeReleaseToCanonicalBook(
    releaseId: string
  ): Promise<{
    bookId: string;
    attachmentId: string;
    currentReleaseId: string;
  }>;

  bridgeReleaseToLongformPublication(
    releaseId: string
  ): Promise<{
    publicationId: string;
    projectId: string;
    currentReleaseId: string;
  }>;

  getReleasePreview(
    releaseId: string,
    previewType: "blog" | "ebook"
  ): Promise<{
    releaseId: string;
    previewType: "blog" | "ebook";
    title: string;
    language: string;
    coverUrl?: string;
    excerpt: string;
    wordCount: number;
    estimatedReadingMinutes: number;
    normalizedContent: {
      units: Array<{
        index: number;
        title: string;
        type: "chapter" | "section";
        content: Array<Record<string, unknown>>;
      }>;
    };
    frontmatter: {
      author: string;
      language: string;
      unitCount: number;
    };
  }>;
}

/* =========================
   SHELVES
   ========================= */
export interface ShelfDataService {
  getUserShelves(uid: string): Promise<Shelf[]>;
  getShelf(ownerId: string, shelfId: string): Promise<Shelf>;

  createShelf(
    uid: string,
    shelf: Omit<Shelf, 'id' | 'ownerId'> & { id?: string }
  ): Promise<Shelf>;
  duplicateShelf(
    uid: string,
    sourceShelfId: string,
    options?: { titleEn?: string; titleAr?: string }
  ): Promise<Shelf>;

  updateShelf(uid: string, shelfId: string, updates: Partial<Shelf>): Promise<void>;
  deleteShelf(uid: string, shelfId: string): Promise<void>;

  getShelfEntries(
    uid: string,
    shelfId: string,
    options?: { resolveBooks?: boolean; limit?: number }
  ): Promise<(ShelfEntry & { book?: Book })[]>;

  addBookToShelf(
    uid: string,
    shelfId: string,
    bookId: string,
    book?: Book,
    recommendationContext?: LibrarianRecommendationContext
  ): Promise<void>;
  removeBookFromShelf(uid: string, shelfId: string, bookId: string): Promise<void>;

  followShelf(uid: string, shelfId: string): Promise<void>;
  getStats(shelfId: string): Promise<ShelfStats>;
  getRecommendedShelves(): Promise<RecommendedShelf[]>;
}

/* =========================
   CATALOG (BOOKS + REVIEWS)
   ========================= */
export interface CatalogDataService {
  getBook(bookId: string): Promise<Book | null>;
  createBook(book: Book): Promise<void>;
  getLongformPublication(publicationId: string): Promise<LongformPublicationRecord>;

  ingestBook(params: {
    providerExternalId?: string;
    bookId?: string;
    source: 'googleBooks' | 'openLibrary';
    rawBook: any;
  }): Promise<any>;
  ingestAuthor(params: {
    providerExternalId?: string;
    authorId?: string;
    source: 'openLibrary' | 'wikidata';
    rawAuthor: any;
  }): Promise<any>;

  searchBooks(query: string): Promise<Book[]>;
  getRelatedBooks(bookId: string): Promise<Book[]>;
  getTrendingBooks(): Promise<Book[]>;
  getBooksByAuthor(authorId: string): Promise<Book[]>;
  getBookStats(bookId: string): Promise<BookStats>;
  getStats(bookId: string): Promise<BookStats>;

  getAuthor(authorId: string): Promise<Author | null>;
  createAuthor(author: Author): Promise<void>;
  searchAuthors(query: string): Promise<Author[]>;
  discoverAuthors(params: { query: string; limit?: number }): Promise<Author[]>;

  followAuthor(uid: string, authorId: string): Promise<void>;
  unfollowAuthor(uid: string, authorId: string): Promise<void>;
  isAuthorFollowed(uid: string, authorId: string): Promise<boolean>;

  getReviews(bookId: string): Promise<Review[]>;
  getReviewsPage(
    bookId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ items: Review[]; hasMore: boolean; nextCursor?: string; revision?: string }>;

  /**
   * 🔒 REVIEW WRITE CONTRACT
   * - One review per user per book
   * - Doc ID MUST be uid
   * - Enforced by implementation + rules
   */
  addReview(
    uid: string,
    review: {
      bookId: string;
      rating: number;
      text: string;
      visibility?: 'public' | 'private';
      recommendationContext?: LibrarianRecommendationContext;
    }
  ): Promise<void>;

  /**
   * 🔒 REVIEW DELETE CONTRACT
   * - Only owner can delete
   * - Doc ID = uid
   */
  deleteReview(uid: string, bookId: string): Promise<void>;

  getRecommendations(uid: string): Promise<string[]>;
}

/* =========================
   SOCIAL
   ========================= */
export interface SocialDataService {
  getFeed(
    uid: string,
    scope: string,
    filters: string[],
    cursor?: string
  ): Promise<{ posts: Post[]; nextCursor?: string }>;

  getPost(postId: string): Promise<Post>;
  getComments(
    postId: string,
    cursor?: string
  ): Promise<{ comments: ThreadComment[]; hasMore: boolean; nextCursor?: string }>;

  getPostStats(postId: string): Promise<PostStats>;

  createPost(
    uid: string,
    post: Omit<
      Post,
      'id' | 'timestamp' | 'stats' | 'authorId' | 'authorName' | 'authorHandle' | 'authorAvatar'
    >
  ): Promise<Post>;

  likePost(uid: string, postId: string): Promise<void>;
  unlikePost(uid: string, postId: string): Promise<void>;
  repostPost(uid: string, postId: string): Promise<void>;
  unrepostPost(uid: string, postId: string): Promise<void>;
  hasUserLikedPost(uid: string, postId: string): Promise<boolean>;

  getDrafts(uid: string): Promise<PostDraft[]>;
  getDraft(uid: string, draftId: string): Promise<PostDraft>;
  saveDraft(uid: string, draft: Omit<PostDraft, 'updatedAt'>): Promise<PostDraft>;
  deleteDraft(uid: string, draftId: string): Promise<void>;

  search(
    query: string,
    cursor?: string,
    limit?: number
  ): Promise<{
    posts: Post[];
    users: User[];
    topics: Array<{ topic: string; postCount: number; score: number }>;
    hasMore: boolean;
    nextCursor?: string;
    rankingVersion: string;
    queryHash: string;
  }>;
  addReaction(uid: string, entityId: string, reaction: string): Promise<void>;
}

/* =========================
   VENUES
   ========================= */
export interface VenueDataService {
  searchVenues(query: string): Promise<(Venue | Event)[]>;
  getVenue(venueId: string): Promise<Venue | Event>;
  getVenueReviews(venueId: string): Promise<VenueReview[]>;
  submitVenueReview(uid: string, venueId: string, rating: number, text: string): Promise<void>;
  createVenue(
    uid: string,
    data: Omit<Venue, 'id' | 'ownerId'> | Omit<Event, 'id' | 'ownerId'>
  ): Promise<void>;
  updateVenue(uid: string, venueId: string, data: Venue | Event): Promise<void>;
  saveVenue(uid: string, venueId: string): Promise<void>;
}

/* =========================
   MESSAGING
   ========================= */
export interface MessagingDataService {
  createConversation(uid: string, peerUid: string): Promise<string>;
  getConversations(uid: string): Promise<Conversation[]>;
  getChatHistory(conversationId: string): Promise<DirectMessage[]>;
  sendMessage(
    uid: string,
    conversationId: string,
    text: string,
    idempotencyKey: string
  ): Promise<{ conversationId: string; messageId: string }>;
  markConversationRead(uid: string, conversationId: string): Promise<void>;
}

/* =========================
   NOTIFICATIONS
   ========================= */
export interface NotificationDataService {
  getNotifications(uid: string): Promise<Notification[]>;
  markAllAsRead(uid: string): Promise<void>;
}

/* =========================
   MARKETPLACE / PARTNERS
   ========================= */
export interface MarketplaceDataService {
  getListings(): Promise<any[]>;
}

export interface PartnerDataService {
  getAnalytics(): Promise<any>;
  createAffiliateLink(bookId: string): Promise<{ link: string }>;
}

/* =========================
   ROOT DATA SERVICE
   ========================= */
export interface DataService {
  users: UserDataService;
  projects: ProjectDataService;
  shelves: ShelfDataService;
  catalog: CatalogDataService;
  social: SocialDataService;
  venues: VenueDataService;
  messaging: MessagingDataService;
  notifications: NotificationDataService;
  librarySearch: LibrarySearchDataService;
  upload: UploadDataService;
  attachments: AttachmentDataService;
  marketplace: MarketplaceDataService;
  partner: PartnerDataService;
}
