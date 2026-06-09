
import React from 'react';

import type { CanonicalTraditionRegistryKey } from '../functions/src/library/ontology/canonicalTraditionRegistry';
import type {
    SpaceEventState,
    SpaceAuthorityProfile,
    SpaceCommunication,
    SpaceEventContinuity,
    SpaceGovernanceState,
    SpaceIdentity,
    SpaceProvenance,
    SpacePublicationLifecycle,
    SpaceRelationshipRefs,
    SpaceRelationshipVisibilityProfile,
    SpaceStewardship,
    SpaceSubtype,
    SpaceType,
} from '../lib/spaces/domain.ts';
/**
 * Defines the standardized user roles across the application.
 */
export type UserRole = 'superadmin' | 'moderator' | 'user';

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
    providerSource?: 'openLibrary' | 'wikidata';
    providerExternalId?: string;
    requiresCanonicalization?: boolean;
}

export type BookForm =
    | 'novel'
    | 'poetry'
    | 'drama'
    | 'essay'
    | 'philosophy'
    | 'religious_text'
    | 'epic'
    | 'short_story'
    | 'nonfiction'
    | 'unknown';

export type CanonicalTradition =
    | CanonicalTraditionRegistryKey
    | 'unknown';

export interface BookOntology {
    schemaVersion: 1;
    form: BookForm;
    subForm: string | null;
    canonicalTradition?: CanonicalTradition;
    source: 'seed' | 'admin' | 'provider' | 'migration';
    confidence: 'verified' | 'mapped' | 'unknown';
    updatedAt: any;
}

// Legacy UI-facing book view. Canonical identity remains work/edition based.
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
    coverMode?: CanonicalCoverMode;
    fallbackCover?: CanonicalFallbackCover;
    descriptionEn: string;
    descriptionAr: string;
    description?: string;
    literaryForm?: BookForm | string;
    ontology: BookOntology;
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
    ebookStoragePath?: string;
    downloadable?: boolean;
    readerAuthority?: {
        hasReadableAttachment?: boolean;
        attachmentId?: string | null;
        source?: string;
        updatedAt?: unknown;
    };
    providerExternalIds?: string[];
    externalReadableSources?: Array<{
        provider: 'openLibrary' | 'gutenberg' | 'hindawi' | 'gallica';
        providerExternalId: string;
        lendingEditionId?: string;
        lendingIdentifier?: string;
        trust: 'trusted';
    }>;
    acquiredFromProvider?: 'openLibrary' | 'gutenberg' | 'hindawi' | 'gallica';
}

export type CanonicalCoverMode = 'uploaded' | 'fallback_metadata';

export type CanonicalFallbackCoverTheme =
  | 'ink'
  | 'emerald'
  | 'gold'
  | 'plum';

export interface CanonicalFallbackCover {
    title: string;
    author?: string;
    theme: CanonicalFallbackCoverTheme;
}

export type WriteDirection = 'ltr' | 'rtl';

export interface WriteMarkNode {
    type: 'bold' | 'italic' | 'underline';
}

export interface WriteContentNode {
    type: 'paragraph' | 'heading' | 'blockquote' | 'bulletList' | 'orderedList' | 'listItem' | 'horizontalRule' | 'text';
    attrs?: {
        level?: 1 | 2 | 3;
        lang?: string;
        dir?: WriteDirection;
        langManual?: boolean;
        journalEntryDate?: string;
        btAnchorId?: string;
        btSectionId?: string;
        btChunkId?: string;
    };
    text?: string;
    marks?: WriteMarkNode[];
    content?: WriteContentNode[];
}

export interface WriteContentDoc {
    version: 1;
    type: 'doc';
    content: WriteContentNode[];
    plainText?: string;
}

export interface ManuscriptStorageMetadata {
    version: 1;
    mode: 'legacy' | 'chunked' | 'hybrid';
    activeSectionId?: string;
    latestRevision?: number;
    latestSnapshotId?: string;
    sectionCount?: number;
    chunkCount?: number;
    contentHash?: string;
    migratedAt?: string;
    updatedAt?: string;
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
    publishedWorkId?: string;
    publishedEditionId?: string;
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
    /**
     * Membership decisions must use membershipBookIds only when this marker is
     * present. The marker is emitted by backend shelf DTOs generated from
     * shelf_books.
     */
    membershipAuthority?: 'shelf_books';
    /**
     * Membership projection generated from shelf_books. This exists so clients
     * can check membership without treating legacy bookIds as authoritative.
     */
    membershipBookIds?: string[];
    titleEn: string;
    titleAr: string;
    /**
     * Legacy/display projection only. Do not use for membership decisions.
     */
    bookIds: string[];
    /**
     * Display-order projection only. Membership still comes from shelf_books.
     */
    orderedBookIds?: string[];
    userCoverUrl?: string;
    visibility?: 'public' | 'unlisted' | 'private';
    /**
     * Display projection only.
     */
    bookCount?: number;
    createdAt?: any;
    updatedAt?: any;
    isSystem?: boolean;
    isVirtual?: boolean;
    isDeletable?: boolean;
    isEditable?: boolean;
    descriptionEn?: string;
    descriptionAr?: string;
    copiedFrom?: {
        shelfId: string;
        ownerId: string;
        createdAt?: any;
        copiedAt?: any;
    };
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
    id: string; // canonicalQuoteId
    canonicalQuoteId?: string; // transitional compatibility mirror of `id`
    legacyQuoteId?: string; // transitional legacy mirror id only
    ownerId?: string; // metadata only, never quote identity
    textEn: string;
    textAr: string;
    sourceEn: string;
    sourceAr: string;
    bookId?: string;
    authorId?: string;
    provenance?: {
        sourceType: 'book' | 'author' | 'manual';
        verificationStatus: 'unverified' | 'canonical_linked' | 'saved_reference';
        sourceBookId?: string;
        sourceAuthorId?: string;
        savedFromOwnerId?: string;
        savedFromQuoteId?: string;
    };
}

export interface Project {
    id: string;
    title?: string;
    titleEn: string;
    titleAr: string;
    workType: 'book' | 'article' | 'journal';
    typeEn: string;
    typeAr: string;
    status: 'Idea' | 'Draft' | 'Revision' | 'Final';
    wordCount: number;
    updatedAt: string; // ISO string
    createdAt?: string;
    content: string; 
    contentDoc?: WriteContentDoc;
    isPublished?: boolean;
    publishedBookId?: string;
    publishedPublicationId?: string;
    lastPublishedTarget?: 'blog' | 'ebook';
    revision?: number;
    coverUrl?: string;
    lastCursorBlockId?: string;
    lastCursorOffset?: number;
    lastCursorSavedAt?: string;
    activeSectionId?: string;
    manuscriptStorage?: ManuscriptStorageMetadata;
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

export type MediaProcessingStatusV1 =
    | 'pending'
    | 'processing'
    | 'ready'
    | 'failed';

export type MediaRenditionNameV1 =
    | 'original'
    | 'thumb'
    | 'feed'
    | 'large';

export interface MediaRenditionMetadataV1 {
    storagePath: string;
    width: number;
    height: number;
    mimeType: string;
    sizeBytes: number;
}

export type MediaRenditionsV1 = Partial<Record<MediaRenditionNameV1, MediaRenditionMetadataV1>>;

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
    width?: number;
    height?: number;
    aspectRatio?: number;
    processingStatus?: MediaProcessingStatusV1;
    renditions?: MediaRenditionsV1;
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
  | {
      type: 'publication';
      publicationId: string;
      title?: string;
      coverUrl?: string;
      author?: string;
      canonicalSlug?: string;
    }
  | { type: 'quote'; quoteId: string, quoteOwnerId?: string, quoteText?: string }
  | { type: 'media'; url: string }
  | { type: 'author'; authorId: string; authorName: string; authorPhoto: string; authorCountry?: string; signatureQuote?: string; }
  | { type: 'shelf'; shelfId: string, ownerId: string, shelfName: string, bookCount: number, covers: string[] }
  | { type: 'venue'; venueId: string; venueName?: string; venueLocation?: string; venueType?: string; imageUrl?: string; coverUrl?: string }
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
    entityId?: string;
    entityOwnerId?: string;
    type: AttachmentTypeV1 | string;
    role: AttachmentRole;
    renderHint: RenderHint;
}

export interface HydratedSocialEntity {
    type: 'book' | 'author' | 'quote' | 'shelf' | 'venue' | 'publication';
    id: string;
    ownerId?: string;
    data: Record<string, unknown>;
}

export interface PostViewerState {
    liked: boolean;
    bookmarked: boolean;
    reposted: boolean;
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
    editedAt?: string | null;
    primaryEntityType?: 'book' | 'author' | 'quote' | 'shelf' | 'venue' | 'publication' | null;
    primaryEntityId?: string | null;
    hydratedEntity?: HydratedSocialEntity | null;
    viewerState?: PostViewerState;

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
    visibility?: PostVisibilityScope;
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
    bookCoverThumbUrl?: string;
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
    workType: 'book' | 'article' | 'journal';
    titleEn: string;
    titleAr: string;
    descriptionEn: string;
    descriptionAr: string;
    icon: React.FC<React.SVGProps<SVGSVGElement>>;
    boilerplateContent: string;
    contentDoc?: WriteContentDoc;
    featured?: boolean;
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
    spaceType?: SpaceType;
    spaceSubtype?: SpaceSubtype;
    identity?: SpaceIdentity;
    governanceStatus?: SpaceGovernanceState;
    authorityProfile?: SpaceAuthorityProfile;
    provenance?: SpaceProvenance;
    relationshipRefs?: SpaceRelationshipRefs;
    relationshipVisibility?: SpaceRelationshipVisibilityProfile;
    stewardship?: SpaceStewardship;
    publication?: SpacePublicationLifecycle;
    communication?: SpaceCommunication;
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
    openingSchedule?: Record<
      "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun",
      {
        closed: boolean;
        open: string | null;
        close: string | null;
      }
    >;
    location?: {
      placeId?: string;
      city?: string;
      country?: string;
      latitude: number;
      longitude: number;
    };
}

export interface Event {
    id: string;
    ownerId: string;
    spaceType?: SpaceType;
    spaceSubtype?: SpaceSubtype;
    identity?: SpaceIdentity;
    eventState?: SpaceEventState;
    governanceStatus?: SpaceGovernanceState;
    authorityProfile?: SpaceAuthorityProfile;
    provenance?: SpaceProvenance;
    relationshipRefs?: SpaceRelationshipRefs;
    relationshipVisibility?: SpaceRelationshipVisibilityProfile;
    stewardship?: SpaceStewardship;
    publication?: SpacePublicationLifecycle;
    communication?: SpaceCommunication;
    continuity?: SpaceEventContinuity;
    recurrence?: {
      kind: 'none' | 'series_occurrence';
      schemaVersion: 1;
      seriesId?: string;
      occurrenceId?: string;
    };
    titleEn: string;
    titleAr: string;
    type: string; 
    dateTime: string; // ISO string
    imageUrl: string;
    privacy: 'public' | 'private';
    duration?: string;
    isOnline?: boolean;
    locationId?: string;
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
    entityId: string; // canonical quote id for quote bookmarks
    timestamp: string; // ISO string
    quoteOwnerId?: string; // optional metadata only for legacy compatibility
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
    attachment?: {
        type: 'book' | 'author' | 'shelf' | 'quote' | 'media' | 'venue' | 'publication';
        entityId: string; // canonical entity id
        title?: string;
        author?: string;
        coverUrl?: string;
        canonicalSlug?: string;
        ownerId?: string;
        bookCount?: number;
        covers?: string[];
        quoteOwnerId?: string; // optional metadata only for legacy compatibility
        quoteText?: string;
    };
    timestamp: string; // ISO string
    readByPeer?: boolean;
    seenAt?: string;
}

export interface Conversation {
    id: string;
    contactId: string; 
    contactName: string; 
    contactAvatar: string; 
    lastMessage: string;
    timestamp: string; // ISO string
    unreadCount: number;
    status?: 'active' | 'request_pending' | 'request_declined';
    requestedByUid?: string | null;
    conversationContext?: {
        type: 'book' | 'author' | 'shelf' | 'quote' | 'venue' | 'media';
        entityId: string;
        title?: string;
        snapshot?: Record<string, unknown>;
    } | null;
}

export interface SpaceInbox {
    id: string;
    spaceId: string;
    spaceType: SpaceType;
    ownerUid: string;
    adminUids: string[];
    status: 'disabled' | 'available';
    participantModel: 'space_admins_only';
    lastMessage?: string;
    timestamp?: string;
    unreadCount?: number;
}

export interface SpaceMessage {
    id: string;
    inboxId: string;
    spaceId: string;
    senderId: string;
    text: string;
    timestamp: string;
    readByAdminUids?: string[];
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
