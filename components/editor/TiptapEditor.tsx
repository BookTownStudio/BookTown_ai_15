import React, { useEffect, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { useI18n } from '../../store/i18n.tsx';
import { cn } from '../../lib/utils.ts';
import { WriteContentDoc, WriteDirection } from '../../types/entities.ts';
import {
    applyAutoLanguageForBlocks,
    LanguageAwareHeading,
    LanguageAwareParagraph,
} from './extensions/languageAwareBlocks.ts';
import {
    countWordsScriptAware,
    toTiptapDocInput,
    toWriteContentDoc,
} from '../../lib/editor/writeDocument.ts';

export interface EditorOutlineItem {
    id: string;
    level: 1 | 2 | 3;
    text: string;
    pos: number;
    lang?: string;
    dir?: WriteDirection;
}

export interface EditorChangePayload {
    html: string;
    contentDoc: WriteContentDoc;
    wordCount: number;
    plainText: string;
    outline: EditorOutlineItem[];
}

interface TiptapEditorProps {
    content: string;
    contentDoc?: WriteContentDoc;
    onChange: (payload: EditorChangePayload) => void;
    onEditorReady: (editor: Editor) => void;
    placeholder?: string;
    editable?: boolean;
    isFocusMode?: boolean;
    onFocus?: () => void;
    langHint?: string;
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({
    content,
    contentDoc,
    onChange,
    onEditorReady,
    placeholder = 'Start writing...',
    editable = true,
    isFocusMode = false,
    onFocus,
    langHint = 'en',
}) => {
    const { isRTL } = useI18n();

    const buildOutline = useCallback((editorInstance: Editor): EditorOutlineItem[] => {
        const items: EditorOutlineItem[] = [];
        editorInstance.state.doc.descendants((node, pos) => {
            if (node.type.name !== 'heading') {
                return true;
            }

            const level = typeof node.attrs.level === 'number' ? node.attrs.level : 1;
            const normalizedLevel: 1 | 2 | 3 = level === 1 || level === 2 || level === 3 ? level : 1;
            const text = (node.textContent || '').trim();
            if (!text) {
                return true;
            }

            items.push({
                id: `h_${pos}_${text.slice(0, 24)}`,
                level: normalizedLevel,
                text,
                pos,
                lang: typeof node.attrs.lang === 'string' ? node.attrs.lang : undefined,
                dir: node.attrs.dir === 'rtl' || node.attrs.dir === 'ltr' ? node.attrs.dir : undefined,
            });
            return true;
        });

        return items;
    }, []);

    const emitEditorPayload = useCallback((editorInstance: Editor) => {
        const plainText = editorInstance.getText();
        const contentAsJson = editorInstance.getJSON() as Record<string, unknown>;
        const contentAsDoc = toWriteContentDoc(contentAsJson, plainText);

        onChange({
            html: editorInstance.getHTML(),
            contentDoc: contentAsDoc,
            wordCount: countWordsScriptAware(plainText),
            plainText,
            outline: buildOutline(editorInstance),
        });
    }, [buildOutline, onChange]);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: false,
                paragraph: false,
            }),
            LanguageAwareParagraph,
            LanguageAwareHeading.configure({ levels: [1, 2, 3] }),
            Underline,
            Placeholder.configure({
                placeholder,
                emptyEditorClass: 'is-editor-empty before:content-[attr(data-placeholder)] before:text-slate-500 before:float-left before:pointer-events-none',
            }),
        ],
        content: toTiptapDocInput(content, contentDoc),
        editable,
        onUpdate: ({ editor: editorInstance, transaction }) => {
            if (!transaction.getMeta('autoLangTagger')) {
                const applied = applyAutoLanguageForBlocks(editorInstance, langHint);
                if (applied) {
                    return;
                }
            }

            emitEditorPayload(editorInstance);
        },
        onCreate: ({ editor: editorInstance }) => {
            applyAutoLanguageForBlocks(editorInstance, langHint);
            emitEditorPayload(editorInstance);
            onEditorReady(editorInstance);
        },
        onFocus: () => {
            onFocus?.();
        },
        editorProps: {
            attributes: {
                spellcheck: 'true',
                class: cn(
                    'mx-auto w-full max-w-[780px] prose prose-lg dark:prose-invert focus:outline-none min-h-[60vh] pb-32 transition-all duration-500 ease-in-out',
                    isRTL ? 'text-right' : 'text-left',
                    isFocusMode ? 'prose-xl leading-relaxed' : ''
                ),
            },
        },
    });

    useEffect(() => {
        if (!editor) return;

        if (contentDoc?.type === 'doc') {
            const currentContent = JSON.stringify((editor.getJSON() as Record<string, unknown>).content || []);
            const incomingContent = JSON.stringify(contentDoc.content || []);
            if (incomingContent !== currentContent) {
                editor.commands.setContent({ type: 'doc', content: contentDoc.content });
            }
            return;
        }

        const currentHtml = editor.getHTML();
        const normalizedIncomingHtml = content || '<p></p>';
        if (currentHtml !== normalizedIncomingHtml) {
            editor.commands.setContent(normalizedIncomingHtml);
        }
    }, [content, contentDoc, editor]);

    return (
        <div className="w-full h-full relative group">
            <EditorContent editor={editor} className="h-full" />

            <style>{`
                .tiptap p.is-editor-empty:first-child::before {
                    color: #94a3b8;
                    content: attr(data-placeholder);
                    float: left;
                    height: 0;
                    pointer-events: none;
                }
                .tiptap h1 { font-size: 2.25em; font-weight: 800; margin-top: 1.5em; margin-bottom: 0.5em; color: white; line-height: 1.2; }
                .tiptap h2 { font-size: 1.75em; font-weight: 700; margin-top: 1.5em; margin-bottom: 0.5em; color: #e2e8f0; line-height: 1.3; }
                .tiptap p { margin-bottom: 1.25em; line-height: 1.8; color: #cbd5e1; }
                .tiptap p[lang='ar'] {
                    font-family: 'Noto Naskh Arabic', 'Amiri', serif;
                    font-size: 1.14em;
                    line-height: 2.1;
                }
                .tiptap h1[lang='ar'],
                .tiptap h2[lang='ar'] {
                    font-family: 'Noto Naskh Arabic', 'Amiri', serif;
                }
                .tiptap h1[lang='ar'] {
                    font-size: 2.43em;
                    line-height: 1.25;
                }
                .tiptap h2[lang='ar'] {
                    font-size: 1.89em;
                    line-height: 1.35;
                }
                .tiptap [dir='rtl'] {
                    text-align: right;
                }
                .tiptap [dir='ltr'] {
                    text-align: left;
                }
                .tiptap ul, .tiptap ol { padding-left: 1.5em; margin-bottom: 1.25em; }
                .tiptap ul li { list-style-type: disc; }
                .tiptap ol li { list-style-type: decimal; }
                .tiptap blockquote { border-left: 4px solid #38bdf8; padding-left: 1em; font-style: italic; color: #94a3b8; margin-left: 0; margin-right: 0; }
                .tiptap hr { border: none; border-top: 2px solid #334155; margin: 3em 0; position: relative; overflow: visible; }
                .tiptap hr::after {
                    content: '✦';
                    position: absolute;
                    top: -14px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #0f172a;
                    padding: 0 10px;
                    color: #64748b;
                    font-size: 1.2rem;
                }
            `}</style>
        </div>
    );
};

export default TiptapEditor;
