
export interface Chapter {
    title: string;
    content: string; // HTML
}

export interface BookContent {
    title: string;
    author: string;
    chapters: Chapter[];
    fullHtml: string;
}

/**
 * Parses raw HTML from Tiptap and attempts to split it into chapters.
 * Detection logic:
 * 1. Looks for H1 tags as chapter delimiters.
 * 2. If no H1s, looks for Horizontal Rules (<hr>) as separators.
 * 3. Falls back to a single chapter.
 */
export const parseContent = (html: string, title: string, author: string): BookContent => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const chapters: Chapter[] = [];

    // Strategy 1: Heading 1 based splitting
    const headings = doc.querySelectorAll('h1');
    
    if (headings.length > 0) {
        let currentChapter: Chapter | null = null;
        let buffer = document.createElement('div');

        Array.from(doc.body.children).forEach((node) => {
            if (node.tagName === 'H1') {
                if (currentChapter) {
                    currentChapter.content = buffer.innerHTML;
                    chapters.push(currentChapter);
                }
                // Start new chapter
                buffer = document.createElement('div');
                currentChapter = {
                    title: node.textContent || 'Untitled Chapter',
                    content: ''
                };
                // We don't add the H1 to the content to avoid duplication if we use the title in the template
                // But for flexible rendering, let's keep it but formatted cleanly?
                // Standard: Remove H1 from content, let renderer handle title.
            } else {
                if (!currentChapter) {
                    // Content before first H1 (Prologue?)
                    currentChapter = { title: 'Prologue', content: '' };
                }
                buffer.appendChild(node.cloneNode(true));
            }
        });

        // Push last chapter
        if (currentChapter) {
            // @ts-ignore
            currentChapter.content = buffer.innerHTML;
            chapters.push(currentChapter);
        }
    } 
    // Strategy 2: Horizontal Rule splitting
    else if (doc.querySelectorAll('hr').length > 0) {
        const parts = html.split('<hr>');
        parts.forEach((part, index) => {
            if (part.trim()) {
                chapters.push({
                    title: `Chapter ${index + 1}`,
                    content: part
                });
            }
        });
    }
    // Strategy 3: Single Chapter
    else {
        chapters.push({
            title: title,
            content: html
        });
    }

    return {
        title,
        author,
        chapters,
        fullHtml: html
    };
};
