import { 
    DataService, UserDataService, ProjectDataService, ShelfDataService, 
    CatalogDataService, SocialDataService, UploadDataService, UploadCategory, 
    PostStats, UserStats, BookStats, ShelfStats, AttachmentDataService, 
    FeedRankingMode, LibrarySearchDataService 
} from './db.types.ts';
import { db } from '../lib/db.ts';
import { 
    User, Project, Shelf, Book, Post, PostDraft, Bookmark, Author, 
    Review, Quote, Venue, Event, Conversation, DirectMessage, AgentSession, 
    ChatMessage, PublishedBook, AttachmentMetadataV1, AttachmentV1, 
    ThreadComment, RecommendedShelf, BookEdition, BibliographicWork, 
    EditionReadingState, Ebook, ExternalSource 
} from '../types/entities.ts';
import { 
    normalizeUser, normalizeProject, normalizeShelf, normalizeBook, normalizePost, normalizeQuote, 
    normalizeBookmark, normalizeVenue, normalizeEvent, normalizeConversation, normalizeAgentSession, 
    normalizeChatMessage, normalizeReview, normalizeDraft, normalizeList, normalizeAuthor
} from '../lib/data-validation.ts';
import { MediaService } from '../lib/media/mediaService.ts';
import { MockStorageAdapter } from '../lib/media/storageAdapter.ts';
import { mockBooks, mockAuthors, mockRecommendedShelves, MOCK_DATA } from '../data/mocks.ts';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const mediaService = new MediaService(new MockStorageAdapter());

/* ------------------------------------------------------------------ */
/* MOCK UPLOAD SERVICE */
/* ------------------------------------------------------------------ */

class MockUploadService implements UploadDataService {
    async getUploadToken(uid: string, parentType: string, parentId: string, type: string, fileName: string) {
        await delay(500);
        const attachmentId = `att_${Date.now()}`;
        return { token: `mock_token`, uploadUrl: `attachments/${uid}/${attachmentId}`, attachmentId };
    }
    async uploadImage(uid: string, category: UploadCategory, file: File, id?: string): Promise<string> {
        return mediaService.uploadMedia(uid, file, { category, id });
    }
    async uploadFile(uid: string, path: string, file: Blob): Promise<string> {
        await delay(1000);
        return URL.createObjectURL(file);
    }
    async finalizeMetadata(uid: string, parentType: string, parentId: string, attachmentId: string, token: string): Promise<AttachmentV1> {
        await delay(800);
        return {
            attachmentId,
            type: 'IMAGE' as any,
            metadata: { attachmentId, type: 'IMAGE', uploader: { uid }, storagePath: '', mimeType: 'image/jpeg', size: 100, createdAt: new Date().toISOString() },
            payload: { url: 'https://images.unsplash.com/photo-1512568400610-62da2848a608?w=800' },
            immutable: true
        };
    }
}

/* ------------------------------------------------------------------ */
/* MOCK ATTACHMENT SERVICE */
/* ------------------------------------------------------------------ */

class MockAttachmentService implements AttachmentDataService {
    async createMetadata(metadata: AttachmentMetadataV1): Promise<void> { await delay(100); }
    async getMetadata(attachmentId: string): Promise<AttachmentMetadataV1 | null> { return null; }
}

/* ------------------------------------------------------------------ */
/* MOCK USER SERVICE */
/* ------------------------------------------------------------------ */

class MockUserService implements UserDataService {
    async getProfile(uid: string): Promise<User> {
        await delay(200);
        const doc = await db.getDoc(db.doc('users', uid));
        if (doc.exists()) return normalizeUser(doc.data());
        throw new Error("User not found");
    }
    async createProfile(uid: string, user: User): Promise<void> { await delay(300); await db.setDoc(db.doc('users', uid), user); }
    async updateProfile(uid: string, data: Partial<User>): Promise<void> { await delay(300); await db.setDoc(db.doc('users', uid), data); }
    async getSuggestedProfiles(uid: string): Promise<User[]> {
        await delay(300);
        const snapshot = await db.getDocs(db.collection('users'));
        return normalizeList(snapshot.docs.map(doc => doc.data()).filter((u: any) => u.uid !== uid), normalizeUser);
    }
    async followUser(): Promise<void> { await delay(300); }
    async unfollowUser(): Promise<void> { await delay(300); }
    async muteAuthor(): Promise<void> { await delay(200); }
    async blockAuthor(): Promise<void> { await delay(200); }
    async getRankingPreference(): Promise<FeedRankingMode> { return 'relevant'; }
    async updateRankingPreference(): Promise<void> { await delay(200); }
    
    // FIX: Updated getStats to include all properties from the expanded UserStats interface.
    async getStats(): Promise<UserStats> { 
        return { 
            followers: 10, 
            following: 5, 
            postsPublished: 2, 
            shelvesCreated: 1, 
            quotesAuthored: 0,
            posts: 2,
            reviews: 0,
            booksRead: 5,
            booksPublished: 0,
            wordsWritten: 1200,
        }; 
    }

    async setInteraction(): Promise<void> { await delay(100); }
    async getInteraction(): Promise<{ like: boolean; bookmark: boolean; repost: boolean }> {
        return { like: false, bookmark: false, repost: false };
    }
    async getBookmarks(): Promise<Bookmark[]> { return []; }
    async saveBookmark(): Promise<void> {}
    async unbookmarkPost(): Promise<void> {}
    async hasUserBookmarkedPost(): Promise<boolean> { return false; }
    async getUserQuotes(): Promise<Quote[]> { return []; }
    async getQuote(): Promise<Quote> { throw new Error('Not found'); }
    async saveQuote(): Promise<void> {}
    async getAgentSessions(): Promise<AgentSession[]> { return []; }
    async getChatHistory(): Promise<ChatMessage[]> { return []; }
    async saveAgentMessage(): Promise<void> {}
    async updateAgentSession(): Promise<void> {}
    async createAgentSession(): Promise<void> {}
    async importGoodreadsData(): Promise<any> { return { booksImported: 0, shelvesCreated: 0, reviewsImported: 0 }; }
    async saveReadingProgress(): Promise<void> {}
    async submitFeedback(): Promise<void> {}
}

/* ------------------------------------------------------------------ */
/* MOCK CATALOG SERVICE  ✅ REVIEW FIXES LIVE HERE */
/* ------------------------------------------------------------------ */

const mockReviewsStore: Record<string, Record<string, Review>> = {};

class MockCatalogService implements CatalogDataService {
    async getBook(bookId: string): Promise<Book | null> {
        return normalizeBook(mockBooks[bookId] || mockBooks['book1']);
    }

    async createBook(): Promise<void> {}

    async ingestBook(params: { bookId: string; source: 'googleBooks' | 'openLibrary'; rawBook: any; }): Promise<any> {
        await delay(300);
        return { bookId: params.bookId, status: 'MATERIALIZED' };
    }

    async searchBooks(): Promise<Book[]> { return []; }
    async getRelatedBooks(): Promise<Book[]> { return []; }
    async getTrendingBooks(): Promise<Book[]> { return []; }
    async getBooksByAuthor(): Promise<Book[]> { return []; }

    async getBookStats(): Promise<BookStats> {
        return { bookmarks: 0, reviews: 0, ratingsCount: 0, averageRating: 0 };
    }
    async getStats(): Promise<BookStats> {
        return { bookmarks: 0, reviews: 0, ratingsCount: 0, averageRating: 0 };
    }

    async getAuthor(authorId: string): Promise<Author | null> {
        return normalizeAuthor(mockAuthors[authorId] || mockAuthors['author_matt_haig']);
    }
    async createAuthor(): Promise<void> {}
    async searchAuthors(): Promise<Author[]> { return []; }
    async followAuthor(): Promise<void> {}

    /* ---------------- REVIEW IMPLEMENTATION ---------------- */

    async addReview(uid: string, review: {
        bookId: string;
        rating: number;
        text: string;
        authorName: string;
        authorHandle?: string;
        authorAvatar?: string | null;
    }): Promise<void> {
        await delay(300);

        if (!mockReviewsStore[review.bookId]) {
            mockReviewsStore[review.bookId] = {};
        }

        mockReviewsStore[review.bookId][uid] = normalizeReview({
            id: `${review.bookId}_${uid}`,
            bookId: review.bookId,
            userId: uid,
            rating: review.rating,
            text: review.text,
            authorName: review.authorName,
            authorHandle: review.authorHandle,
            authorAvatar: review.authorAvatar,
            createdAt: new Date().toISOString(),
        });
    }

    // FIX: Implemented deleteReview to satisfy CatalogDataService interface.
    async deleteReview(uid: string, bookId: string): Promise<void> {
        await delay(200);
        if (mockReviewsStore[bookId]) {
            delete mockReviewsStore[bookId][uid];
        }
    }

    async getReviews(bookId: string): Promise<Review[]> {
        await delay(200);
        const byUser = mockReviewsStore[bookId] || {};
        return Object.values(byUser);
    }

    async getRecommendations(): Promise<string[]> { return []; }
}

/* ------------------------------------------------------------------ */
/* REMAINING MOCK SERVICES (UNCHANGED) */
/* ------------------------------------------------------------------ */

class MockSocialService implements SocialDataService {
    async getComments(): Promise<{ comments: ThreadComment[]; hasMore: boolean }> {
        return { comments: [], hasMore: false };
    }
    async getFeed(): Promise<any> { return { posts: [] }; }
    async getPost(): Promise<Post> { throw new Error('Not found'); }
    async getPostStats(): Promise<PostStats> {
        return { likesCount: 0, bookmarksCount: 0, repostsCount: 0, commentsCount: 0 };
    }
    async createPost(): Promise<Post> { throw new Error('Not implemented'); }
    async likePost(): Promise<void> {}
    async unlikePost(): Promise<void> {}
    async repostPost(): Promise<void> {}
    async unrepostPost(): Promise<void> {}
    async hasUserLikedPost(): Promise<boolean> { return false; }
    async getDrafts(): Promise<PostDraft[]> { return []; }
    async getDraft(): Promise<PostDraft> { throw new Error('Not found'); }
    async saveDraft(): Promise<PostDraft> { throw new Error('Not implemented'); }
    async deleteDraft(): Promise<void> {}
    async search(): Promise<any> { return { posts: [], users: [], topics: [] }; }
    async addReaction(): Promise<void> {}
}

/* ------------------------------------------------------------------ */
/* MOCK LIBRARY SEARCH */
/* ------------------------------------------------------------------ */

class MockLibrarySearchService implements LibrarySearchDataService {
    async search(): Promise<BookEdition[]> { return []; }
    async getEdition(): Promise<BookEdition | null> { return null; }
    async getWork(): Promise<BibliographicWork | null> { return null; }
    async getReadingState(): Promise<EditionReadingState | null> { return null; }
    async saveReadingState(): Promise<void> {}
    async ingestExternalResult(): Promise<BookEdition> {
        throw new Error("Mock ingestion not implemented.");
    }
    async getEbook(): Promise<Ebook | null> { return null; }
    async getEbookByEdition(): Promise<Ebook | null> { return null; }
    async logExternalSource(): Promise<void> {}
}

/* ------------------------------------------------------------------ */
/* EXPORT */
/* ------------------------------------------------------------------ */

export const mockDbService: DataService = {
    users: new MockUserService(),
    projects: {} as any,
    shelves: {} as any,
    catalog: new MockCatalogService(),
    social: new MockSocialService(),
    venues: {} as any,
    messaging: {} as any,
    notifications: {} as any,
    upload: new MockUploadService(),
    attachments: new MockAttachmentService(),
    marketplace: {} as any,
    partner: {} as any,
    librarySearch: new MockLibrarySearchService(),
};