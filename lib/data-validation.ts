import { 
    User, Project, Shelf, Book, Post, Quote, Bookmark, Venue, Event, 
    Notification, Conversation, DirectMessage, AgentSession, ChatMessage, Review, PostDraft, Author,
    AttachmentV1, AttachmentMetadataV1, AttachmentRef, PostStatus, PostVisibilityScope
} from '../types/entities.ts';

export const DEFAULT_POST: Post = {
    id: '',
    authorId: '',
    authorName: 'Anonymous',
    authorHandle: '@anonymous',
    authorAvatar: '',
    content: {
        text: '',
        attachments: []
    },
    visibility: 'public',
    status: 'published',
    counters: {
        likes: 0,
        comments: 0,
        reposts: 0,
        bookmarks: 0
    },
    timestamps: {
        createdAt: new Date().toISOString(),
        updatedAt: null,
        publishedAt: new Date().toISOString()
    },
    flags: {
        edited: false,
        hasAttachments: false
    }
};

export function normalizePost(data: any): Post {
    if (!data) return { ...DEFAULT_POST };
    
    // Resolve content
    const contentText = typeof data.content === 'string' ? data.content : (data.content?.text || null);
    let attachments: AttachmentRef[] = [];
    if (data.content?.attachments && Array.isArray(data.content.attachments)) {
        attachments = data.content.attachments;
    } else if (data.attachments && Array.isArray(data.attachments)) {
        attachments = data.attachments.map((a: any) => ({
            attachmentId: a.attachmentId || a.id || 'legacy',
            ...(typeof a.entityId === 'string' && a.entityId.trim()
                ? { entityId: a.entityId.trim() }
                : {}),
            ...(typeof a.entityOwnerId === 'string' && a.entityOwnerId.trim()
                ? { entityOwnerId: a.entityOwnerId.trim() }
                : {}),
            type: a.type || 'IMAGE',
            role: a.role || 'primary',
            renderHint: a.renderHint || 'card'
        }));
    }

    // Resolve timestamps (handle Firestore Timestamps and ISO strings)
    const getIso = (val: any) => val?.toDate?.()?.toISOString() || val;
    const createdAt = getIso(data.timestamps?.createdAt || data.createdAt || data.timestamp || new Date().toISOString());
    const updatedAt = getIso(data.timestamps?.updatedAt || data.updatedAt || null);
    const publishedAt = getIso(data.timestamps?.publishedAt || (data.status === 'published' ? createdAt : null));
    const deletedAt = getIso(data.timestamps?.deletedAt || data.deletedAt || null);
    
    // Resolve counters
    const counters = {
        likes: data.counters?.likes ?? data.interaction_counters?.likes ?? data.stats?.likes ?? 0,
        comments: data.counters?.comments ?? data.interaction_counters?.comments ?? data.stats?.comments ?? 0,
        reposts: data.counters?.reposts ?? data.interaction_counters?.reposts ?? data.stats?.reposts ?? 0,
        bookmarks: data.counters?.bookmarks ?? data.interaction_counters?.bookmarks ?? data.stats?.bookmarks ?? 0,
    };

    // Resolve visibility & status
    const visibility = (data.visibility?.scope || data.visibility || 'public') as PostVisibilityScope;
    const isDeleted = !!(data.isDeleted || data.status === 'deleted' || deletedAt);
    const status = (isDeleted ? 'deleted' : (data.status || 'published')) as PostStatus;

    return {
        ...DEFAULT_POST,
        id: data.id || '',
        authorId: data.authorId || '',
        authorName: data.authorName || 'Anonymous',
        authorHandle: data.authorHandle || '@anonymous',
        authorAvatar: data.authorAvatar || '',
        content: {
            text: contentText,
            attachments: attachments
        },
        visibility,
        status,
        counters,
        timestamps: {
            createdAt,
            updatedAt,
            publishedAt,
            deletedAt
        },
        flags: {
            edited: !!(data.flags?.edited ?? data.isEdited),
            hasAttachments: attachments.length > 0
        },
        attachments: data.attachments,
        comments: data.comments,
        isFeatured: !!data.isFeatured
    };
}

export function normalizeAttachment(data: any): AttachmentV1 | null {
    if (!data || !data.type) return null;
    const validTypes = ['TEXT_SNIPPET', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'LINK', 'BOOK_REFERENCE', 'QUOTE_REFERENCE'];
    if (!validTypes.includes(data.type)) return null;
    
    return {
        attachmentId: data.attachmentId || `att_${Date.now()}`,
        type: data.type,
        metadata: data.metadata || {},
        payload: data.payload || {},
        immutable: true,
        orderIndex: typeof data.orderIndex === 'number' ? data.orderIndex : undefined
    };
}

export function normalizeList<T>(list: any[] | undefined, normalizer: (item: any) => T): T[] {
    if (!list || !Array.isArray(list)) return [];
    return list.map(normalizer);
}

export function normalizeUser(data: any): User { return { ...data } as User; }
export function normalizeProject(data: any): Project { return { ...data } as Project; }
export function normalizeShelf(data: any): Shelf { return { ...data } as Shelf; }
export function normalizeBook(data: any): Book { return { ...data } as Book; }
export function normalizeQuote(data: any): Quote { return { ...data } as Quote; }
export function normalizeBookmark(data: any): Bookmark { return { ...data } as Bookmark; }
export function normalizeVenue(data: any): Venue { return { ...data } as Venue; }
export function normalizeEvent(data: any): Event { return { ...data } as Event; }
export function normalizeNotification(data: any): Notification {
    return {
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString()
    } as Notification;
}
export function normalizeConversation(data: any): Conversation { return { ...data } as Conversation; }
export function normalizeAgentSession(data: any): AgentSession { return { ...data } as AgentSession; }
export function normalizeChatMessage(data: any): ChatMessage { return { ...data } as ChatMessage; }
export function normalizeReview(data: any): Review { return { ...data } as Review; }
export function normalizeDraft(data: any): PostDraft { return { ...data } as PostDraft; }
export function normalizeAuthor(data: any): Author { return { ...data } as Author; }
