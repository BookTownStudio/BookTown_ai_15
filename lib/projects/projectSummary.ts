import { WriteContentDoc } from '../../types/entities.ts';

const MAX_SYNOPSIS_LENGTH = 180;

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function truncateCleanly(value: string, maxLength = MAX_SYNOPSIS_LENGTH): string {
    if (value.length <= maxLength) {
        return value;
    }

    const clipped = value.slice(0, maxLength).trim();
    const lastSpace = clipped.lastIndexOf(' ');
    if (lastSpace >= Math.floor(maxLength * 0.65)) {
        return `${clipped.slice(0, lastSpace).trim()}...`;
    }

    return `${clipped}...`;
}

function collectNodeText(node: unknown): string {
    if (!node || typeof node !== 'object') {
        return '';
    }

    const record = node as Record<string, unknown>;
    const text = typeof record.text === 'string' ? record.text : '';
    const children = Array.isArray(record.content) ? record.content : [];
    return normalizeWhitespace([text, ...children.map(collectNodeText)].join(' '));
}

function extractFromContentDoc(contentDoc?: WriteContentDoc): string {
    const blocks = Array.isArray(contentDoc?.content) ? contentDoc.content : [];

    for (const block of blocks) {
        if (!block || typeof block !== 'object') {
            continue;
        }

        const record = block as Record<string, unknown>;
        const type = typeof record.type === 'string' ? record.type : '';

        if (type === 'heading' || type === 'horizontalRule') {
            continue;
        }

        if (type !== 'paragraph') {
            continue;
        }

        const text = collectNodeText(record);
        if (text) {
            return truncateCleanly(text);
        }
    }

    return '';
}

function extractFromHtml(html?: string): string {
    if (!html || typeof DOMParser === 'undefined') {
        return '';
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const blocks = Array.from(doc.body.children);

    for (const block of blocks) {
        const tagName = block.tagName.toUpperCase();
        if (tagName === 'H1' || tagName === 'H2' || tagName === 'H3' || tagName === 'HR') {
            continue;
        }

        if (tagName !== 'P') {
            continue;
        }

        const text = normalizeWhitespace(block.textContent || '');
        if (text) {
            return truncateCleanly(text);
        }
    }

    return '';
}

export function extractProjectSynopsis(params: {
    contentDoc?: WriteContentDoc;
    html?: string;
}): string {
    const fromDoc = extractFromContentDoc(params.contentDoc);
    if (fromDoc) {
        return fromDoc;
    }

    return extractFromHtml(params.html);
}

