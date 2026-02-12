
import { Book } from '../types/entities.ts';
import { agentService } from './agentService.ts';
import { normalizeBook } from '../lib/data-validation.ts';

export const fetchBookRecommendations = async (query: string): Promise<Book[]> => {
  try {
    const rawBooks = await agentService.recommendBooks(query);
    
    if (!Array.isArray(rawBooks)) return [];

    // Map AI results and pass through authoritative normalizer
    return rawBooks.map((b: any, index: number) => normalizeBook({
        id: `ai_${Date.now()}_${index}`,
        authorId: 'ai_generated_author', 
        titleEn: b.titleEn || "Unknown Title",
        titleAr: b.titleAr || b.titleEn || "Unknown Title",
        authorEn: b.authorEn || "Unknown Author",
        authorAr: b.authorAr || b.authorEn || "Unknown Author",
        coverUrl: `https://covers.openlibrary.org/b/title/${encodeURIComponent(b.titleEn)}-M.jpg?default=false`, 
        descriptionEn: b.descriptionEn || "",
        descriptionAr: b.descriptionAr || "",
        genresEn: b.genresEn || ['Fiction'],
        genresAr: [],
        rating: b.rating || 4.0,
        ratingsCount: 0,
        isEbookAvailable: false,
        pageCount: 300
    }));

  } catch (error) {
    console.error("Error fetching AI recommendations:", error);
    return [];
  }
};

export const identifyBookFromImage = async (base64Image: string): Promise<string | null> => {
    try {
        return await agentService.identifyBook(base64Image);
    } catch (error) {
        console.error("Error identifying book:", error);
        return null;
    }
};

export const analyzeShelfVibe = async (bookTitles: string[]): Promise<{ vibe: string, suggestions: string[] } | null> => {
    if (bookTitles.length === 0) return null;
    try {
        return await agentService.analyzeShelfVibe(bookTitles);
    } catch (error) {
        console.error("Error analyzing shelf vibe:", error);
        return null;
    }
};

export const generateSpeech = async (text: string): Promise<Uint8Array | null> => {
    try {
        return await agentService.generateSpeech(text);
    } catch (error) {
        console.error("Error generating speech:", error);
        return null;
    }
};
