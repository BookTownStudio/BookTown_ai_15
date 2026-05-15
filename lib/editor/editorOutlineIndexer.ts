import { useEffect, useState } from 'react';
import { type Editor } from '@tiptap/react';
import { type OutlinePanelItem } from '../../components/editor/OutlinePanel.tsx';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

function getOutlineItemDirection(node: { attrs?: Record<string, unknown> }): 'rtl' | 'ltr' | undefined {
    const dir = node.attrs?.dir;
    return dir === 'rtl' || dir === 'ltr' ? dir : undefined;
}

export function buildCanonicalOutlineItems(editor: Editor): OutlinePanelItem[] {
    const items: OutlinePanelItem[] = [];
    let awaitingStructuralHeading = false;
    let hasStructuralUnits = false;

    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'horizontalRule') {
            awaitingStructuralHeading = true;
            hasStructuralUnits = true;
            return true;
        }

        if (node.type.name !== 'heading') {
            return true;
        }

        const label = (node.textContent || '').trim();
        if (!label) {
            return true;
        }

        if (awaitingStructuralHeading) {
            items.push({
                id: `unit_${pos}_${label.slice(0, 24)}`,
                kind: 'chapter',
                label,
                pos,
                dir: getOutlineItemDirection(node),
            });
            awaitingStructuralHeading = false;
            return true;
        }

        items.push({
            id: `heading_${pos}_${label.slice(0, 24)}`,
            kind: hasStructuralUnits ? 'headline' : 'chapter',
            label,
            pos,
            dir: getOutlineItemDirection(node),
        });
        return true;
    });

    return items;
}

export function useEditorOutlineIndexer(editor: Editor | null, documentSignature: string): OutlinePanelItem[] {
    const [items, setItems] = useState<OutlinePanelItem[]>([]);

    useEffect(() => {
        if (!editor) {
            setItems([]);
            return;
        }

        const indexOutline = () => {
            const nextItems = writeEditorTelemetry.measure(
                'editor.canonicalOutlineGeneration',
                () => buildCanonicalOutlineItems(editor)
            );
            setItems(nextItems);
        };

        if (typeof requestAnimationFrame !== 'function') {
            indexOutline();
            return;
        }

        const frame = requestAnimationFrame(indexOutline);
        return () => cancelAnimationFrame(frame);
    }, [editor, documentSignature]);

    return items;
}
