import { describe, expect, it } from 'vitest';
import { shouldApplyExternalEditorContent } from './TiptapEditor.tsx';

describe('shouldApplyExternalEditorContent', () => {
    it('does not replace editor content when React echoes the last local editor update', () => {
        expect(shouldApplyExternalEditorContent({
            currentSignature: '[{"type":"paragraph","content":[]}]',
            incomingSignature: '[{"type":"paragraph","content":[{"type":"text","text":"A"}]}]',
            recentlyEmittedSignatures: ['[{"type":"paragraph","content":[{"type":"text","text":"A"}]}]'],
        })).toBe(false);
    });

    it('does not roll back to an older local echo after a newer local edit', () => {
        expect(shouldApplyExternalEditorContent({
            currentSignature: '[{"type":"paragraph","content":[{"type":"text","text":"AB"}]}]',
            incomingSignature: '[{"type":"paragraph","content":[{"type":"text","text":"A"}]}]',
            recentlyEmittedSignatures: [
                '[{"type":"paragraph","content":[{"type":"text","text":"A"}]}]',
                '[{"type":"paragraph","content":[{"type":"text","text":"AB"}]}]',
            ],
        })).toBe(false);
    });

    it('applies real external content changes such as authoritative hydration', () => {
        expect(shouldApplyExternalEditorContent({
            currentSignature: '[{"type":"paragraph","content":[]}]',
            incomingSignature: '[{"type":"paragraph","content":[{"type":"text","text":"Server"}]}]',
            recentlyEmittedSignatures: ['[{"type":"paragraph","content":[{"type":"text","text":"Local"}]}]'],
        })).toBe(true);
    });

    it('does not replace content that is already mounted in the editor', () => {
        const signature = '[{"type":"paragraph","content":[{"type":"text","text":"Current"}]}]';
        expect(shouldApplyExternalEditorContent({
            currentSignature: signature,
            incomingSignature: signature,
            recentlyEmittedSignatures: [],
        })).toBe(false);
    });
});
