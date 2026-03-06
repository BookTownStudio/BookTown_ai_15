
import type { LibrarianMode } from '../types/librarian.ts';

export interface AgentMessage {
    role: 'user' | 'model';
    content: string;
}

export interface BookRecommendation {
    titleEn: string;
    titleAr: string;
    authorEn: string;
    authorAr: string;
    descriptionEn: string;
    descriptionAr: string;
    genresEn: string[];
    rating: number;
}

export interface ShelfVibe {
    vibe: string;
    suggestions: string[];
}

export interface LibrarianBookCard {
    bookId: string;
    title: string;
    author: string;
    coverUrl?: string;
    short_reason: string;
    source?: 'librarian';
    suggestionSessionId?: string;
    suggestionId?: string;
    rankPosition?: number;
    mode?: LibrarianMode;
}

export interface LibrarianMemoryMessage {
    role: 'user' | 'assistant';
    content: string;
}

export type LibrarianConversationIntent =
    | 'book_recommendation'
    | 'author_request'
    | 'theme_request'
    | 'clarification'
    | 'out_of_scope';

export interface LibrarianConversationBlock {
    explanation: string;
    tone: 'warm' | 'intellectual' | 'neutral';
    follow_up_question: string | null;
    needs_clarification: boolean;
}

export interface LibrarianAuthorCard {
    id: string;
    type: 'author';
    name: string;
    photo_url: string;
    birth_year: number;
    death_year: number | null;
    nationality: string;
    short_bio: string;
    notable_books: string[];
    why_recommended: string;
    verification: {
        source: 'openlibrary' | 'wikidata' | 'internal';
    };
}

export interface LibrarianResponseMetadata {
    suggestionSessionId: string;
    verified: boolean;
    source: 'vertex_llm + external_verification';
    confidence: number;
}

export interface LibrarianResponseEnvelope {
    recommendations: LibrarianBookCard[];
    fromCache: boolean;
    remainingQuota: number;
    normalizedQuery: string;
    intent?: LibrarianConversationIntent;
    conversation?: LibrarianConversationBlock;
    authorRecommendations?: LibrarianAuthorCard[];
    metadata?: LibrarianResponseMetadata;
}

export interface AgentService {
    /**
     * General purpose chat with an AI agent.
     */
    chat(agentId: string, messages: AgentMessage[], systemInstruction?: string, jsonSchema?: any): Promise<string>;

    /**
     * Summarize text content.
     */
    summarize(text: string, format?: 'short' | 'bullets' | 'detailed'): Promise<string>;

    /**
     * Get book recommendations based on a query.
     */
    recommendBooks(query: string): Promise<BookRecommendation[]>;

    /**
     * Structured Librarian recommendations (Tier-1 contract).
     */
    librarianRecommend(query: string, intent?: string, messages?: LibrarianMemoryMessage[]): Promise<LibrarianResponseEnvelope>;

    /**
     * Identify a book from a base64 image string.
     */
    identifyBook(base64Image: string): Promise<string | null>;

    /**
     * Analyze the "vibe" of a list of books.
     */
    analyzeShelfVibe(bookTitles: string[]): Promise<ShelfVibe | null>;

    /**
     * Generate speech audio from text.
     */
    generateSpeech(text: string): Promise<Uint8Array | null>;
}
