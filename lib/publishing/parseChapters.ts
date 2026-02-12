
import { BookContent } from './contentParser.ts';

export interface ChapterSummary {
    id: string;
    title: string;
    previewText: string;
}

/**
 * Extracts a lightweight chapter structure from the parsed book content
 * for display in the preview TOC.
 */
export const extractChapters = (bookContent: BookContent): ChapterSummary[] => {
    return bookContent.chapters.map((chapter, index) => {
        // Strip HTML tags for preview text
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = chapter.content;
        const text = tempDiv.textContent || "";

        return {
            id: `chapter-${index}`,
            title: chapter.title || `Chapter ${index + 1}`,
            previewText: text.substring(0, 100) + (text.length > 100 ? '...' : '')
        };
    });
};
