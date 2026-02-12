
import { AgentService, AgentMessage, BookRecommendation, ShelfVibe } from './agents.types';

export class RealAgentService implements AgentService {
    private async callEndpoint(endpoint: string, body: any): Promise<any> {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Request failed with status ${response.status}`);
            }

            return await response.json();
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

    async recommendBooks(query: string): Promise<BookRecommendation[]> {
        const prompt = `Recommend 4 books matching this search query: "${query}". Return valid JSON.`;
        const bookSchema = {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    titleEn: { type: "STRING" },
                    titleAr: { type: "STRING" },
                    authorEn: { type: "STRING" },
                    authorAr: { type: "STRING" },
                    descriptionEn: { type: "STRING" },
                    descriptionAr: { type: "STRING" },
                    genresEn: { type: "ARRAY", items: { type: "STRING" } },
                    rating: { type: "NUMBER" },
                },
                required: ["titleEn", "authorEn"]
            }
        };

        const resultText = await this.chat('librarian', [{ role: 'user', content: prompt }], undefined, bookSchema);
        try {
            return JSON.parse(resultText);
        } catch (e) {
            console.error("Failed to parse recommendation JSON", e);
            return [];
        }
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
