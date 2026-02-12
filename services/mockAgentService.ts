
import { AgentService, AgentMessage, BookRecommendation, ShelfVibe } from './agents.types';
import { mockBooks } from '../data/mocks';

export class MockAgentService implements AgentService {
    async chat(agentId: string, messages: AgentMessage[], systemInstruction?: string, jsonSchema?: any): Promise<string> {
        await new Promise(resolve => setTimeout(resolve, 800)); // Simulate latency
        
        if (agentId === 'librarian' && jsonSchema) {
            // Mock structured JSON response for Librarian
            return JSON.stringify({
                reason: "Based on your request, I think you'll love these.",
                recommendations: [
                    { title: "Dune", author: "Frank Herbert" },
                    { title: "The Hobbit", author: "J.R.R. Tolkien" }
                ]
            });
        }

        return `[Mock AI Response for ${agentId}]: This is a simulated response because the backend is not connected.`;
    }

    async summarize(text: string, format?: 'short' | 'bullets' | 'detailed'): Promise<string> {
        await new Promise(resolve => setTimeout(resolve, 500));
        return `[Mock Summary]: This is a simulated summary of the provided text.`;
    }

    async recommendBooks(query: string): Promise<BookRecommendation[]> {
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Return a subset of mock books formatted as recommendations
        return Object.values(mockBooks).slice(0, 4).map(b => ({
            titleEn: b.titleEn,
            titleAr: b.titleAr,
            authorEn: b.authorEn,
            authorAr: b.authorAr,
            descriptionEn: b.descriptionEn,
            descriptionAr: b.descriptionAr,
            genresEn: b.genresEn,
            rating: b.rating
        }));
    }

    async identifyBook(base64Image: string): Promise<string | null> {
        await new Promise(resolve => setTimeout(resolve, 1500));
        return "The Great Gatsby by F. Scott Fitzgerald";
    }

    async analyzeShelfVibe(bookTitles: string[]): Promise<ShelfVibe | null> {
        await new Promise(resolve => setTimeout(resolve, 800));
        return {
            vibe: "A collection of epic journeys and quiet introspection.",
            suggestions: ["The Name of the Wind", "Circe"]
        };
    }

    async generateSpeech(text: string): Promise<Uint8Array | null> {
        console.warn("[MockAgentService] Speech generation is not supported in mock mode.");
        return null;
    }
}
