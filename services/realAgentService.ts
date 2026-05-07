
import { AgentService, AgentMessage, BookRecommendation, LibrarianBookCard, LibrarianMemoryMessage, LibrarianResponseEnvelope, ShelfVibe } from './agents.types';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAppCheckToken, getFirebaseAuth, getFirebaseFunctions, isFirebaseInitialized } from '../lib/firebase.ts';

export class RealAgentService implements AgentService {
    private normalizeDiscoverAgentCallableError(error: unknown): Error {
        const code =
            error &&
            typeof error === 'object' &&
            'code' in error &&
            typeof (error as { code?: unknown }).code === 'string'
                ? String((error as { code: string }).code).trim()
                : '';
        const message =
            error &&
            typeof error === 'object' &&
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
                ? String((error as { message: string }).message).trim()
                : '';
        const normalized = `${code} ${message}`.toUpperCase();

        if (normalized.includes('APP_CHECK_REQUIRED') || code === 'functions/failed-precondition') {
            return new Error('APP_CHECK_REQUIRED');
        }
        if (normalized.includes('AUTH_REQUIRED') || code === 'functions/unauthenticated') {
            return new Error('AUTH_REQUIRED');
        }
        if (normalized.includes('CONSENT_REQUIRED') || code === 'functions/permission-denied') {
            return new Error('CONSENT_REQUIRED');
        }
        if (normalized.includes('INVALID_REQUEST') || code === 'functions/invalid-argument') {
            return new Error('INVALID_REQUEST');
        }
        if (normalized.includes('ENGINE_FAILURE') || code === 'functions/internal') {
            return new Error('ENGINE_FAILURE');
        }
        return new Error(message || code || 'ENGINE_FAILURE');
    }

    private normalizeLibrarianMessages(messages?: LibrarianMemoryMessage[]): LibrarianMemoryMessage[] {
        if (!Array.isArray(messages)) return [];
        return messages
            .filter((row) => row && typeof row === 'object')
            .map((row) => {
                const role = row.role === 'assistant' ? 'assistant' : row.role === 'user' ? 'user' : null;
                if (!role) return null;
                const content = String(row.content || '').replace(/\s+/g, ' ').trim().slice(0, 280);
                if (!content) return null;
                return { role, content } as LibrarianMemoryMessage;
            })
            .filter((row): row is LibrarianMemoryMessage => row !== null)
            .slice(-6);
    }

    private normalizeQuery(value: string): string {
        return String(value || '')
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 280);
    }

    private inferLibrarianIntent(query: string): string {
        const normalized = this.normalizeQuery(query);
        if (!normalized) return 'Reinforcement';
        if (normalized.includes('different') || normalized.includes('contrast')) return 'StructuredContrast';
        if (normalized.includes('adjacent') || normalized.includes('expand')) return 'AdjacentExpansion';
        if (normalized.includes('reread') || normalized.includes('re read') || normalized.includes('nostalgia')) return 'ReReadingReflection';
        if (normalized.split(' ').length >= 3) return 'HighConfidencePrecision';
        return 'Reinforcement';
    }

    private normalizeLibrarianCallableError(error: unknown): Error {
        const code =
            error &&
            typeof error === 'object' &&
            'code' in error &&
            typeof (error as { code?: unknown }).code === 'string'
                ? String((error as { code: string }).code).trim()
                : '';
        const message =
            error &&
            typeof error === 'object' &&
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
                ? String((error as { message: string }).message).trim()
                : '';
        const normalized = `${code} ${message}`.toUpperCase();

        if (normalized.includes('APP_CHECK_REQUIRED') || code === 'functions/failed-precondition') {
            return new Error('APP_CHECK_REQUIRED');
        }
        if (normalized.includes('AUTH_REQUIRED') || code === 'functions/unauthenticated') {
            return new Error('AUTH_REQUIRED');
        }
        if (normalized.includes('CONSENT_REQUIRED') || code === 'functions/permission-denied') {
            return new Error('CONSENT_REQUIRED');
        }
        if (normalized.includes('INVALID_REQUEST') || code === 'functions/invalid-argument') {
            return new Error('INVALID_REQUEST');
        }
        if (normalized.includes('QUOTA_EXCEEDED') || code === 'functions/resource-exhausted') {
            return new Error('QUOTA_EXCEEDED');
        }
        if (normalized.includes('ENGINE_FAILURE') || code === 'functions/internal') {
            return new Error('ENGINE_FAILURE');
        }
        return new Error(message || code || 'ENGINE_FAILURE');
    }

    private async buildRequestHeaders(options?: { requireAppCheck?: boolean }): Promise<Record<string, string>> {
        const requireAppCheck = options?.requireAppCheck === true;
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (!isFirebaseInitialized()) {
            if (requireAppCheck) {
                console.warn('[RealAgentService] Missing Firebase initialization for App Check protected request.');
                throw new Error('APP_CHECK_REQUIRED');
            }
            return headers;
        }

        try {
            const auth = getFirebaseAuth();
            const user = auth.currentUser;
            if (user) {
                const token = await user.getIdToken();
                if (typeof token === 'string' && token.trim().length > 0) {
                    headers['Authorization'] = `Bearer ${token.trim()}`;
                }
            }
        } catch {
            // Keep server-side auth enforcement authoritative.
        }

        const appCheckToken = await getFirebaseAppCheckToken();
        if (typeof appCheckToken === 'string' && appCheckToken.trim().length > 0) {
            headers['X-Firebase-AppCheck'] = appCheckToken.trim();
            return headers;
        }

        console.warn('[RealAgentService] App Check token missing for AI request.');
        if (requireAppCheck) {
            throw new Error('APP_CHECK_REQUIRED');
        }

        return headers;
    }

    private async callEndpoint(endpoint: string, body: any, options?: { requireAppCheck?: boolean }): Promise<any> {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: await this.buildRequestHeaders({ requireAppCheck: options?.requireAppCheck === true }),
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorCode =
                    typeof errorData?.error === 'string'
                        ? errorData.error.trim()
                        : '';
                const errorMessageText =
                    typeof errorData?.message === 'string'
                        ? errorData.message.trim()
                        : typeof errorData?.error?.message === 'string'
                        ? errorData.error.message.trim()
                        : '';
                const errorMessage =
                    errorCode && errorMessageText
                        ? `${errorCode}: ${errorMessageText}`
                        : errorCode || errorMessageText || `Request failed with status ${response.status}`;
                throw new Error(errorMessage);
            }

            const payload = await response.json();

            // Contract envelope (v1): { success: true, data: ... }
            if (payload?.success === true && payload?.data !== undefined) {
                return payload.data;
            }

            if (payload?.success === false && payload?.error) {
                throw new Error(payload.error.message || 'API request failed.');
            }

            // Backward-compatible fallback
            return payload;
        } catch (error) {
            console.error(`[RealAgentService] Error calling ${endpoint}:`, error);
            throw error;
        }
    }

    async discoverAgentChat(agentId: string, messages: AgentMessage[], systemInstruction: string): Promise<string> {
        const normalizedAgentId =
            agentId === 'mentor' || agentId === 'quotes' || agentId === 'lore'
                ? agentId
                : null;
        if (!normalizedAgentId) {
            throw new Error('INVALID_REQUEST');
        }

        const normalizedMessages = messages
            .filter((row) => row && typeof row.content === 'string' && row.content.trim().length > 0)
            .map((row) => ({
                role: row.role === 'model' ? 'model' as const : 'user' as const,
                content: row.content.trim().slice(0, 2000),
            }))
            .filter((row) => row.content.length > 0)
            .slice(-20);
        const normalizedSystemInstruction = String(systemInstruction || '').trim().slice(0, 5000);

        if (!normalizedSystemInstruction || normalizedMessages.length === 0) {
            throw new Error('INVALID_REQUEST');
        }

        try {
            const fn = httpsCallable<
                {
                    agentId: 'mentor' | 'quotes' | 'lore';
                    messages: AgentMessage[];
                    systemInstruction: string;
                },
                { text: string }
            >(getFirebaseFunctions(), 'aiDiscoverAgent');
            const result = await fn({
                agentId: normalizedAgentId,
                messages: normalizedMessages,
                systemInstruction: normalizedSystemInstruction,
            });
            const text =
                result.data && typeof result.data.text === 'string'
                    ? result.data.text.trim()
                    : '';
            if (!text) {
                throw new Error('ENGINE_FAILURE');
            }
            return text;
        } catch (error) {
            console.error('[RealAgentService] Callable aiDiscoverAgent failed:', error);
            throw this.normalizeDiscoverAgentCallableError(error);
        }
    }

    async chat(agentId: string, messages: AgentMessage[], systemInstruction?: string, jsonSchema?: any): Promise<string> {
        void agentId;
        void messages;
        void systemInstruction;
        void jsonSchema;
        throw new Error('AI_CHAT_UNAVAILABLE');
    }

    async summarize(text: string, format?: 'short' | 'bullets' | 'detailed'): Promise<string> {
        const response = await this.callEndpoint('/api/ai/summarize', { text, format });
        return response.text;
    }

    async librarianRecommend(query: string, intent?: string, messages?: LibrarianMemoryMessage[]): Promise<LibrarianResponseEnvelope> {
        const normalizedQuery = this.normalizeQuery(query);
        if (!normalizedQuery) {
            throw new Error('INVALID_REQUEST');
        }

        const resolvedIntent =
            intent && intent.trim().length > 0
                ? intent.trim()
                : this.inferLibrarianIntent(normalizedQuery);

        const normalizedMessages = this.normalizeLibrarianMessages(messages);

        let response: unknown;
        try {
            const fn = httpsCallable<
                { normalizedQuery: string; intent?: string; messages?: LibrarianMemoryMessage[] },
                LibrarianResponseEnvelope
            >(getFirebaseFunctions(), 'aiLibrarian');
            const result = await fn({
                normalizedQuery,
                intent: resolvedIntent,
                ...(normalizedMessages.length > 0 ? { messages: normalizedMessages } : {}),
            });
            response = result.data;
        } catch (error) {
            console.error('[RealAgentService] Callable aiLibrarian failed:', error);
            throw this.normalizeLibrarianCallableError(error);
        }

        const normalizeCards = (rows: unknown): LibrarianBookCard[] => {
            if (!Array.isArray(rows)) return [];
            return rows
                .filter((row): row is LibrarianBookCard => {
                    return Boolean(
                        row &&
                        typeof row === 'object' &&
                        typeof (row as any).bookId === 'string' &&
                        typeof (row as any).title === 'string' &&
                        typeof (row as any).author === 'string' &&
                        typeof (row as any).short_reason === 'string'
                    );
                })
                .slice(0, 5)
                .map((row) => {
                    const suggestionSessionId =
                        typeof (row as any).suggestionSessionId === 'string' &&
                        (row as any).suggestionSessionId.trim().length > 0
                            ? (row as any).suggestionSessionId.trim()
                            : undefined;
                    const suggestionId =
                        typeof (row as any).suggestionId === 'string' &&
                        (row as any).suggestionId.trim().length > 0
                            ? (row as any).suggestionId.trim()
                            : undefined;
                    const rankPositionRaw = Number((row as any).rankPosition);
                    const rankPosition =
                        Number.isFinite(rankPositionRaw) && rankPositionRaw > 0
                            ? Math.trunc(rankPositionRaw)
                            : undefined;
                    const source = (row as any).source === 'librarian' ? 'librarian' : undefined;
                    const mode =
                        typeof (row as any).mode === 'string' && (row as any).mode.trim().length > 0
                            ? (row as any).mode.trim()
                            : undefined;

                    return {
                        bookId: row.bookId,
                        title: row.title,
                        author: row.author,
                        ...(typeof (row as any).coverUrl === 'string' && (row as any).coverUrl.trim().length > 0
                            ? { coverUrl: (row as any).coverUrl.trim() }
                            : {}),
                        short_reason: row.short_reason,
                        ...(source ? { source } : {}),
                        ...(suggestionSessionId ? { suggestionSessionId } : {}),
                        ...(suggestionId ? { suggestionId } : {}),
                        ...(typeof rankPosition === 'number' ? { rankPosition } : {}),
                        ...(mode ? { mode: mode as LibrarianBookCard['mode'] } : {}),
                    };
                });
        };

        const normalizeAuthorRecommendations = (rows: unknown) => {
            if (!Array.isArray(rows)) return [];
            return rows
                .filter((row) => row && typeof row === 'object')
                .map((row) => {
                    const record = row as Record<string, unknown>;
                    const id = typeof record.id === 'string' ? record.id.trim() : '';
                    const name = typeof record.name === 'string' ? record.name.trim() : '';
                    if (!id || !name) return null;
                    const notableRaw = Array.isArray(record.notable_books) ? record.notable_books : [];
                    const notable_books = notableRaw
                        .filter((entry): entry is string => typeof entry === 'string')
                        .map((entry) => entry.trim())
                        .filter((entry) => entry.length > 0)
                        .slice(0, 5);
                    const sourceRaw =
                        record.verification &&
                        typeof record.verification === 'object' &&
                        typeof (record.verification as { source?: unknown }).source === 'string'
                            ? String((record.verification as { source: string }).source).trim()
                            : 'internal';
                    const verificationSource =
                        sourceRaw === 'openlibrary' || sourceRaw === 'wikidata' ? sourceRaw : 'internal';
                    const deathYearRaw = Number(record.death_year);
                    return {
                        id,
                        type: 'author' as const,
                        name,
                        photo_url: typeof record.photo_url === 'string' ? record.photo_url : '',
                        birth_year: Number.isFinite(Number(record.birth_year)) ? Math.trunc(Number(record.birth_year)) : 0,
                        death_year: Number.isFinite(deathYearRaw) ? Math.trunc(deathYearRaw) : null,
                        nationality: typeof record.nationality === 'string' ? record.nationality : '',
                        short_bio: typeof record.short_bio === 'string' ? record.short_bio : '',
                        notable_books,
                        why_recommended: typeof record.why_recommended === 'string' ? record.why_recommended : 'Suggested based on your query.',
                        verification: { source: verificationSource as 'openlibrary' | 'wikidata' | 'internal' },
                    };
                })
                .filter((row): row is NonNullable<typeof row> => row !== null);
        };

        if (response && typeof response === 'object' && Array.isArray((response as any).recommendations)) {
            const envelope = response as Partial<LibrarianResponseEnvelope>;
            return {
                recommendations: normalizeCards(envelope.recommendations),
                fromCache: Boolean(envelope.fromCache),
                remainingQuota: typeof envelope.remainingQuota === 'number' ? envelope.remainingQuota : 0,
                normalizedQuery: typeof envelope.normalizedQuery === 'string' ? envelope.normalizedQuery : normalizedQuery,
                ...(typeof envelope.intent === 'string' ? { intent: envelope.intent as LibrarianResponseEnvelope['intent'] } : {}),
                ...(envelope.conversation &&
                typeof envelope.conversation === 'object' &&
                typeof (envelope.conversation as { explanation?: unknown }).explanation === 'string'
                    ? {
                        conversation: {
                            explanation: String((envelope.conversation as { explanation: string }).explanation).trim(),
                            tone:
                                (envelope.conversation as { tone?: unknown }).tone === 'warm' ||
                                (envelope.conversation as { tone?: unknown }).tone === 'neutral'
                                    ? ((envelope.conversation as { tone: 'warm' | 'neutral' }).tone)
                                    : 'intellectual',
                            follow_up_question:
                                typeof (envelope.conversation as { follow_up_question?: unknown }).follow_up_question === 'string'
                                    ? String((envelope.conversation as { follow_up_question: string }).follow_up_question).trim()
                                    : null,
                            needs_clarification: Boolean(
                                (envelope.conversation as { needs_clarification?: unknown }).needs_clarification
                            ),
                        },
                    }
                    : {}),
                ...(Array.isArray((envelope as { authorRecommendations?: unknown }).authorRecommendations)
                    ? { authorRecommendations: normalizeAuthorRecommendations((envelope as { authorRecommendations?: unknown }).authorRecommendations) }
                    : {}),
                ...(envelope.metadata &&
                typeof envelope.metadata === 'object' &&
                typeof (envelope.metadata as { suggestionSessionId?: unknown }).suggestionSessionId === 'string'
                    ? {
                        metadata: {
                            suggestionSessionId: String((envelope.metadata as { suggestionSessionId: string }).suggestionSessionId).trim(),
                            verified: Boolean((envelope.metadata as { verified?: unknown }).verified),
                            source: 'vertex_llm + external_verification' as const,
                            confidence: Number.isFinite(Number((envelope.metadata as { confidence?: unknown }).confidence))
                                ? Number((envelope.metadata as { confidence: number }).confidence)
                                : 0,
                        },
                    }
                    : {}),
            };
        }

        // Backward compatibility with legacy array response.
        return {
            recommendations: normalizeCards(response),
            fromCache: false,
            remainingQuota: 0,
            normalizedQuery
        };
    }

    async recommendBooks(query: string): Promise<BookRecommendation[]> {
        const envelope = await this.librarianRecommend(query, 'HighConfidencePrecision');
        const cards = envelope.recommendations;
        return cards.map((card) => ({
            titleEn: card.title,
            titleAr: '',
            authorEn: card.author,
            authorAr: '',
            descriptionEn: card.short_reason,
            descriptionAr: '',
            genresEn: [],
            rating: 0,
        }));
    }

    async identifyBook(base64Image: string): Promise<string | null> {
        void base64Image;
        throw new Error('AI_IMAGE_IDENTIFICATION_UNAVAILABLE');
    }

    async analyzeShelfVibe(bookTitles: string[]): Promise<ShelfVibe | null> {
        if (bookTitles.length === 0) return null;
        throw new Error('AI_SHELF_ANALYSIS_UNAVAILABLE');
    }

    async generateSpeech(text: string): Promise<Uint8Array | null> {
        void text;
        throw new Error('AI_SPEECH_UNAVAILABLE');
    }
}
