
import { AgentService, AgentMessage, BookRecommendation, LibrarianBookCard, LibrarianResponseEnvelope, ShelfVibe } from './agents.types';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAppCheckToken, getFirebaseAuth, getFirebaseFunctions, isFirebaseInitialized } from '../lib/firebase.ts';

export class RealAgentService implements AgentService {
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

    async chat(agentId: string, messages: AgentMessage[], systemInstruction?: string, jsonSchema?: any): Promise<string> {
        // Map to backend ChatRequest structure
        const response = await this.callEndpoint('/api/ai/chat', {
            model: agentId === 'librarian' ? 'gemini-2.5-flash' : 'gemini-2.5-flash', 
            messages,
            systemInstruction,
            config: jsonSchema ? {
                responseMimeType: 'application/json',
                responseSchema: jsonSchema
            } : undefined
        });
        return response.text;
    }

    async summarize(text: string, format?: 'short' | 'bullets' | 'detailed'): Promise<string> {
        const response = await this.callEndpoint('/api/ai/summarize', { text, format });
        return response.text;
    }

    async librarianRecommend(query: string, intent?: string): Promise<LibrarianResponseEnvelope> {
        const normalizedQuery = this.normalizeQuery(query);
        if (!normalizedQuery) {
            throw new Error('INVALID_REQUEST');
        }

        const resolvedIntent =
            intent && intent.trim().length > 0
                ? intent.trim()
                : this.inferLibrarianIntent(normalizedQuery);

        let response: unknown;
        try {
            const fn = httpsCallable<
                { normalizedQuery: string; intent?: string },
                LibrarianResponseEnvelope
            >(getFirebaseFunctions(), 'aiLibrarian');
            const result = await fn({
                normalizedQuery,
                intent: resolvedIntent,
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
                .slice(0, 3)
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
                        short_reason: row.short_reason,
                        ...(source ? { source } : {}),
                        ...(suggestionSessionId ? { suggestionSessionId } : {}),
                        ...(suggestionId ? { suggestionId } : {}),
                        ...(typeof rankPosition === 'number' ? { rankPosition } : {}),
                        ...(mode ? { mode: mode as LibrarianBookCard['mode'] } : {}),
                    };
                });
        };

        if (response && typeof response === 'object' && Array.isArray((response as any).recommendations)) {
            const envelope = response as Partial<LibrarianResponseEnvelope>;
            return {
                recommendations: normalizeCards(envelope.recommendations),
                fromCache: Boolean(envelope.fromCache),
                remainingQuota: typeof envelope.remainingQuota === 'number' ? envelope.remainingQuota : 0,
                normalizedQuery: typeof envelope.normalizedQuery === 'string' ? envelope.normalizedQuery : normalizedQuery
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
        try {
            // Construct a multimodal message for the backend
            const messages = [{
                role: 'user',
                parts: [
                    { text: "Identify this book from the cover image. Return ONLY the title and author, like 'Title by Author'." },
                    { 
                        inlineData: {
                            mimeType: "image/jpeg",
                            data: base64Image
                        }
                    }
                ]
            }];

            const response = await this.callEndpoint('/api/ai/chat', {
                model: 'gemini-2.5-flash', // Flash supports multimodal
                messages: messages
            });

            return response.text;
        } catch (error) {
            console.error("Failed to identify book via backend", error);
            return null;
        }
    }

    async analyzeShelfVibe(bookTitles: string[]): Promise<ShelfVibe | null> {
        const prompt = `Analyze the 'vibe' of a bookshelf containing these books: ${bookTitles.join(', ')}. Provide a short description and 3 recommendations.`;
        const vibeSchema = {
            type: "OBJECT",
            properties: {
                vibe: { type: "STRING" },
                suggestions: { type: "ARRAY", items: { type: "STRING" } }
            },
            required: ["vibe", "suggestions"]
        };

        const resultText = await this.chat('librarian', [{ role: 'user', content: prompt }], undefined, vibeSchema);
        try {
            return JSON.parse(resultText);
        } catch (e) {
            console.error("Failed to parse vibe JSON", e);
            return null;
        }
    }

    async generateSpeech(text: string): Promise<Uint8Array | null> {
        console.warn("[RealAgentService] Speech generation requires a dedicated audio endpoint (Coming V2).");
        return null;
    }
}
