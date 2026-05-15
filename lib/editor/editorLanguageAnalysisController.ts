import { type Editor } from '@tiptap/react';
import { detectLanguageDirection } from './writeDocument.ts';
import { writeEditorTelemetry } from './writeEditorTelemetry.ts';

function isLanguageBlock(typeName: string): boolean {
    return typeName === 'paragraph' || typeName === 'heading';
}

export function runEditorLanguageAnalysis(
    editor: Editor,
    fallbackLang = 'en'
): boolean {
    return writeEditorTelemetry.measure('editor.languageDetection', () => {
        const { state } = editor;
        const tr = state.tr;
        let changed = false;
        let inspectedBlocks = 0;

        state.doc.descendants((node, pos) => {
            if (!isLanguageBlock(node.type.name)) {
                return true;
            }

            inspectedBlocks += 1;

            if (node.attrs.langManual === true) {
                return true;
            }

            const detected = detectLanguageDirection(node.textContent || '', fallbackLang);
            const currentLang = typeof node.attrs.lang === 'string' ? node.attrs.lang : '';
            const currentDir = node.attrs.dir === 'rtl' || node.attrs.dir === 'ltr' ? node.attrs.dir : '';

            if (currentLang !== detected.lang || currentDir !== detected.dir) {
                tr.setNodeMarkup(pos, undefined, {
                    ...node.attrs,
                    lang: detected.lang,
                    dir: detected.dir,
                });
                changed = true;
            }

            return true;
        });

        writeEditorTelemetry.gauge('editor.languageBlocksInspected', inspectedBlocks);
        if (changed) {
            tr.setMeta('autoLangTagger', true);
            editor.view.dispatch(tr);
            writeEditorTelemetry.increment('editor.languageRetagged');
            return true;
        }

        return false;
    });
}
