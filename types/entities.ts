
import React from 'react';

/**
 * Defines the standardized user roles across the application.
 */
export type UserRole = 'superadmin' | 'superuser' | 'moderator' | 'user';

// --- LIBRARY SEARCH DOMAIN (LOCKED V1) ---

export interface BibliographicWork {
    bookId: string;
    canonicalTitle: string;
    alternativeTitles: string[];
    primaryAuthors: string[];
    contributors: string[];
    subjects: string[];
    categories: string[];
    mainCategory: string;
    description: string;
    firstPublishedYear: number;
    createdAt: string;
    updatedAt: string;
    sourcePriority: 'booktown' | 'external';
    popularityScore: number;
    analytics: {
        views: number;
        addsToShelf: number;
        reads: number;
    };
}

export interface BookEdition {
    editionId: string;
    bookId: string; // Reference to BibliographicWork
    title: string;
    subtitle?: string | null;
    language: string; // ISO 639-1
    authors: string[];
    translator?: string | null;
    publisher?: string | null;
    publishedDate?: string | null;
    isbn10?: string | null;
    isbn13?: string | null;
    otherIdentifiers: { type: string, value: string }[];
    pageCount?: number | null;
    dimensions: {
        height?: string | null;
        width?: string | null;
        thickness?: string | null;
    };
    coverImages: {
        small?: string | null;
        medium?: string | null;
        large?: string | null;
    };
    description: string;
    categories: string[];
    editionFormat: 'ebook' | 'paperback' | 'hardcover' | 'audio';
    ebookAvailable: boolean;
    ebookId?: string | null; // ref: ebooks
    source: 'booktown' | 'google_books' | 'open_library' | 'other';
    rawSourceRefs: string[];
    createdAt: string;
    updatedAt: string;
}

export interface Ebook {
    ebookId: string;
    bookId: string;
    editionId: string;
    format: 'epub' | 'pdf';
    storagePath: string;
    fileSizeBytes: number;
    checksum: string;
    publicDomain: boolean;
    license?: string;
    source: 'google_books' | 'open_library' | 'project_gutenberg' | 'hindawi' | 'other';
    downloadable: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ExternalSource {
    sourceId: string;
    source: 'google_books' | 'open_library' | 'other';
    externalId: string;
    linkedBookId?: string;
    linkedEditionId?: string;
    rawPayload: any;
    fetchedAt: string;
}

export interface EditionReadingState {
    userId: string;
    editionId: string;
    progressPercent: number;
    lastLocation: string;
    lastReadAt: string;
}

// --- THREAD DATA MODEL V1 (AUTHORITATIVE) ---

export interface ThreadInteractionCounts {
    readonly likes: number;
    readonly comments: number;
    readonly bookmarks: number;
}

export interface ThreadViewerState {
    readonly liked: boolean;
    readonly bookmarked: boolean;
    readonly canComment: boolean;
    readonly canEdit: boolean;
}

export type CommentStatus = 'published' | 'hidden' | 'deleted' | 'under_review';

export interface ThreadComment {
    readonly id: string;
    readonly authorId: string;
    readonly authorName: string; // Retained for stable UI rendering without extra lookups
    readonly authorHandle: string;
    readonly authorAvatar: string;
    readonly createdAt: string; // ISO string
    readonly text: string;
    readonly parentId: string | null;
    readonly status?: CommentStatus;
    readonly moderatorNote?: string;
    readonly liked?: boolean;
    readonly likesCount?: number;
}

export interface ThreadPost {
    readonly id: string;
    readonly authorId: string;
    readonly authorName: string;
    readonly authorHandle: string;
    readonly authorAvatar: string;
    readonly createdAt: string;
    readonly visibility: PostVisibilityScope;
    readonly status: PostStatus;
    readonly content: {
        readonly text: string | null;
        readonly attachments: AttachmentRef[] | null;
    };
    readonly attachments?: PostAttachment[];
    readonly interactionCounts?: ThreadInteractionCounts;
    readonly viewerState?: ThreadViewerState;
}

export interface User {
    uid: string;
    id?: string;
    email: string;
    name: string;
    displayName?: string;
    handle: string;
    avatarUrl: string;
    bannerUrl: string;
    joinDate: string; // ISO string
    bioEn: string;
    bioAr: string;
    bio?: string;
    followers: number;
    followerCount?: number;
    following: number;
    followingCount?: number;
    role: UserRole;
    lastActive: string; // ISO string
    booksRead: number;
    quotesSaved: number;
    shelvesCount: number;
    wordsWritten: number;
    interests?: string[];
    sharedInterest?: string;
    aiConsent?: boolean;
    reportsCount?: number;
    isSuspended?: boolean;
}

export interface NotificationPreferences {
    channels: {
        in_app: boolean;
        email: boolean;
        push: boolean;
    };
    categories: {
        likes: boolean;
        comments: boolean;
        follows: boolean;
        reposts: boolean;
        mentions: boolean;
        quotes: boolean;
        system: boolean;
        messages: boolean;
    };
    updatedAt: any;
}

export interface Author {
    id: string;
    nameEn: string;
    nameAr: string;
    avatarUrl: string;
    bioEn: string;
    bioAr: string;
    lifespan: string;
    countryEn: string;
    countryAr: string;
    languageEn: string;
    languageAr: string;
    signatureQuoteEn?: string;
    signatureQuoteAr?: string;
}

export interface Book {
    id: string;
    authorId: string;
    title?: string;
    titleEn: string;
    titleAr: string;
    authorEn: string;
    authorAr: string;
    authors?: string[];
    bookCovers?: string[];
    coverUrl: string;
    descriptionEn: string;
    descriptionAr: string;
    description?: string;
    genresEn: string[];
    genresAr: string[];
    rating: number;
    ratingsCount: number;
    reviewCount?: number;
    isEbookAvailable: boolean;
    publicationDate?: string;
    pageCount?: number;
    createdAt?: number;
    rawBook?: any; // preserved provider response
    ebookAttachmentId?: string; // Reference to secure binary attachment
}

export interface PublishedBook {
    id: string;
    projectId: string;
    authorId: string;
    authorName: string;
    title: string;
    description: string;
    coverUrl?: string;
    epubUrl?: string;
    pdfUrl?: string;
    publishedAt: string; // ISO String
    formats: ('epub' | 'pdf')[];
    pageCount: number;
    versionNumber?: number;
    bookId?: string;
    editionId?: string;
}

export interface ShelfEntry {
    bookId: string;
    addedAt: string; // ISO string
    progress?: number; // 0-100 for 'currently-reading'
}

// FIX: Expanded Shelf interface to include metadata properties used in application logic and for virtual system shelves.
export interface Shelf {
    id: string;
    ownerId: string;
    titleEn: string;
    titleAr: string;
    entries: { [bookId: string]: ShelfEntry };
    userCoverUrl?: string;
    bookCount?: number;
    createdAt?: any;
    updatedAt?: any;
    isSystem?: boolean;
    isVirtual?: boolean;
    isDeletable?: boolean;
    isEditable?: boolean;
}

export interface RecommendedShelf {
    id: string;
    titleEn: string;
    titleAr: string;
    ownerName: string;
    bookCovers: string[];
    followerCount: number;
}


export interface Quote {
    id: string;
    textEn: string;
    textAr: string;
    sourceEn: string;
    sourceAr: string;
    bookId?: string;
    authorId?: string;
}

export interface Project {
    id: string;
    title?: string;
    titleEn: string;
    titleAr: string;
    typeEn: string;
    typeAr: string;
    status: 'Idea' | 'Draft' | 'Revision' | 'Final';
    wordCount: number;
    updatedAt: string; // ISO string
    createdAt?: string;
    content: string; 
    isPublished?: boolean;
    publishedBookId?: string;
    revision?: number;
    coverUrl?: string;
}

export type AttachmentTypeV1 = 
  | 'IMAGE'
  | 'AUDIO'
  | 'VIDEO'
  | 'DOCUMENT'
  | 'LINK'
  | 'BOOK_REFERENCE'
  | 'QUOTE_REFERENCE';

export type AttachmentStateV1 = 
  | 'TEMP_UPLOADED'
  | 'ATTACHED'
  | 'ORPHANED'
  | 'ARCHIVED'
  | 'DELETED';

export interface AttachmentMetadataV1 {
    attachmentId: string;
    type: AttachmentTypeV1;
    state?: AttachmentStateV1;
    mimeType: string;
    size: number;
    createdAt: string; // ISO String
    lastUpdatedAt?: string;
    uploader: {
        uid: string;
    };
    storagePath: string;
    parentId?: string;
    parentType?: string;
    previewUrl?: string;
    duration?: number;
    dimensions?: { width: number; height: number };
}

export interface AttachmentV1 {
    attachmentId: string;
    type: AttachmentTypeV1;
    metadata: AttachmentMetadataV1;
    payload: any; // Type-dependent UI payload
    immutable: true;
    orderIndex?: number;
}

export interface UserDiscoveryAttachment {
  type: 'user';
  userId: string;
  displayName: string;
  handle: string;
  avatarUrl: string;
  coverUrl?: string;
  bio?: string;
  interests?: string[];
  topBooks?: { id: string; title: string; coverUrl: string }[];
  sharedInterest?: string;
  vibe?: string;
  stats?: {
      booksRead: number;
      wordsWritten: number;
      shelvesCount: number;
  };
}

export type PostAttachment = 
  | AttachmentV1
  | { type: 'book'; bookId: string; bookTitle: string; bookAuthor: string; bookCover: string; bookRating: number; }
  | { type: 'quote'; quoteId: string, quoteOwnerId: string }
  | { type: 'media'; url: string }
  | { type: 'author'; authorId: string; authorName: string; authorPhoto: string; authorCountry?: string; signatureQuote?: string; }
  | { type: 'shelf'; shelfId: string, ownerId: string, shelfName: string, bookCount: number, covers: string[] }
  | { type: 'venue'; venueId: string }
  | { type: 'post'; postId: string }
  | UserDiscoveryAttachment;


export interface PostComment {
    id: string;
    authorId: string;
    authorName: string;
    authorHandle: string;
    authorAvatar: string;
    text: string;
    timestamp: string; // ISO string
}

export type PostStatus = 'published' | 'draft' | 'archived' | 'deleted';
export type PostVisibilityScope = 'public' | 'followers' | 'private' | 'restricted';
export type AttachmentRole = 'primary' | 'secondary';
export type RenderHint = 'inline' | 'card' | 'gallery' | 'embed';

export interface AttachmentRef {
    attachmentId: string;
    type: AttachmentTypeV1 | string;
    role: AttachmentRole;
    renderHint: RenderHint;
}

export interface Post {
    id: string;
    authorId: string;
    authorName: string;   
    authorHandle: string; 
    authorAvatar: string; 
    
    content: {
        text: string | null;
        attachments: AttachmentRef[];
    };

    visibility: PostVisibilityScope;
    status: PostStatus;

    counters: {
        likes: number;
        comments: number;
        reposts: number;
        bookmarks: number;
    };

    timestamps: {
        createdAt: string;
        updatedAt: string | null;
        publishedAt: string | null;
        deletedAt?: string | null;
    };

    flags: {
        edited: boolean;
        hasAttachments: boolean;
    };

    attachments?: PostAttachment[];
    comments?: PostComment[];
    isFeatured?: boolean;
    
    allowedUserIds?: string[]; 
}

export interface PostDraft {
    id: string;
    userId: string;
    content: string;
    attachment?: PostAttachment;
    updatedAt: string; // ISO string
}

export interface Agent {
    id: string;
    name: string;
    descriptionEn: string;
    descriptionAr: string;
    avatarUrl: string;
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    color: string;
    isPremium: boolean;
    examplePromptsEn: string[];
    examplePromptsAr: string[];
    placeholderEn: string;
    placeholderAr: string;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: string; // ISO string
}

export interface AgentSession {
    id: string;
    agentId: string;
    title: string;
    lastMessage: string;
    timestamp: string; // ISO string
    isPinned?: boolean;
}

export interface Review {
    id: string;
    domain?: 'book';
    visibility?: 'public' | 'private';
    bookId: string;
    bookTitleEn?: string;
    bookTitleAr?: string;
    bookAuthorEn?: string;
    bookAuthorAr?: string;
    bookCoverUrl?: string;
    userId: string;
    rating: number; // 1-5
    text: string;
    authorName: string;
    authorHandle: string;
    authorAvatar: string;
    timestamp: string; // ISO string
    upvotes: number;
    downvotes: number;
    commentsCount: number;
}

export interface VenueReview {
    id: string;
    venueId: string;
    userId: string;
    rating: number; // 1-5
    text: string;
    authorName: string;
    authorHandle: string;
    authorAvatar: string;
    timestamp: string; // ISO string
    upvotes: number;
    downvotes: number;
    commentsCount: number;
}

export interface QuickRecommendations {
    userId: string;
    bookIds: string[];
    timestamp: string; // ISO string
}

export interface Template {
    id: string;
    titleEn: string;
    titleAr: string;
    descriptionEn: string;
    descriptionAr: string;
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    boilerplateContent: string;
}

export interface BookFlowItem {
  bookId: string;
  bookCoverUrl: string;
  quoteTextEn: string;
  quoteTextAr: string;
  authorEn: string;
  authorAr: string;
}

export interface Venue {
    id: string;
    ownerId: string;
    name: string;
    type: string; 
    address: string;
    imageUrl: string;
    descriptionEn: string;
    descriptionAr: string;
    openingHours?: string;
    rating?: number;
    ratingsCount?: number;
    websiteUrl?: string;
    phone?: string;
}

export interface Event {
    id: string;
    ownerId: string;
    titleEn: string;
    titleAr: string;
    type: string; 
    dateTime: string; // ISO string
    imageUrl: string;
    privacy: 'public' | 'private';
    duration?: string;
    isOnline?: boolean;
    venueName?: string;
    link?: string;
}

export interface BookFair {
    id: string;
    nameEn: string;
    nameAr: string;
    dates: string; 
    location: string;
    taglineEn: string;
    taglineAr: string;
    imageUrl: string;
}

export type ForYouFlowItem =
  | { type: 'book'; data: BookFlowItem }
  | { type: 'user'; data: User }
  | { type: 'quote'; data: Quote }
  | { type: 'venue'; data: Venue }
  | { type: 'event'; data: Event }
  | { type: 'bookfair'; data: BookFair };

export type BookmarkType = 'book' | 'quote' | 'post' | 'author' | 'venue' | 'event' | 'attachment';

export interface Bookmark {
    id: string;
    type: BookmarkType;
    entityId: string;
    timestamp: string; // ISO string
    quoteOwnerId?: string;
}

export type FeedbackType = 'action-required' | 'praise-general';

export interface Feedback {
    id: string;
    userId: string;
    type: FeedbackType;
    text: string;
    email?: string;
    attachments?: string[]; 
    timestamp: string; // ISO string
}

export interface AdminFeedback {
    id: string;
    userHandle: string;
    type: 'Bug' | 'Suggestion' | 'Complaint';
    text: string;
    status: 'new' | 'in_progress' | 'resolved';
    createdAt: string; // ISO string
}

export interface DirectMessage {
    id: string;
    senderId: string;
    text: string;
    timestamp: string; // ISO string
    readByPeer?: boolean;
}

export interface Conversation {
    id: string;
    contactId: string; 
    contactName: string; 
    contactAvatar: string; 
    lastMessage: string;
    timestamp: string; // ISO string
    unreadCount: number;
}

export interface Notification {
    id: string;
    uid: string; // Recipient
    type: 'like' | 'comment' | 'repost' | 'follow' | 'mention' | 'system' | 'dm';
    priority: 'low' | 'medium' | 'high';
    actor: {
        uid: string;
        name?: string;
    };
    target: {
        entity_type: string;
        entity_id: string;
    };
    actorId: string;
    actorType: 'user' | 'system';
    entityType: 'post' | 'book' | 'quote' | 'shelf' | 'profile' | 'conversation';
    entityId: string;
    postId: string | null;
    message: string; // Pre-rendered server-side
    createdAt: any; // Timestamp
    readAt: any | null;
    read: boolean;
    sourceActivityId: string;
    dedupeId: string;
    count?: number; // COLLAPSE_REPRESENTATION: count field
}

export interface ActivityLogEntry {
    id: string;
    actor: {
        uid: string;
        type: 'user';
    };
    verb: 'post_created' | 'post_liked' | 'post_bookmarked' | 'post_commented' | 'post_reposted' | 'post_deleted' | 'user_followed' | 'shelf_followed';
    object: {
        entity_type: 'post' | 'user' | 'shelf' | 'book';
        entity_id: string;
    };
    context: {
        target_owner_uid: string | null;
        visibility: 'public' | 'private';
    };
    metadata?: {
        source: 'web' | 'mobile';
        ui_surface: 'social' | 'profile' | 'feed' | 'detail';
    };
    createdAt: any; // Timestamp
    version: string;
}
