import { WriteContentDoc, WriteContentNode } from '../../types/entities.ts';

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

function collectNodeText(node: WriteContentNode): string {
    if (!node || typeof node !== 'object') {
        return '';
    }

    const text = typeof node.text === 'string' ? node.text : '';
    const children = Array.isArray(node.content) ? node.content : [];
    return normalizeWhitespace([text, ...children.map(collectNodeText)].join(' '));
}

function extractFromContentDoc(contentDoc?: WriteContentDoc): string {
    const blocks = Array.isArray(contentDoc?.content) ? contentDoc.content : [];

    for (const block of blocks) {
        if (!block || typeof block !== 'object') {
            continue;
        }

        if (block.type === 'heading' || block.type === 'horizontalRule') {
            continue;
        }

        if (block.type !== 'paragraph') {
            continue;
        }

        const text = collectNodeText(block);
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
