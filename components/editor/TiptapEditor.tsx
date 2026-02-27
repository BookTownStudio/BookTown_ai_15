import React, { useEffect, useState, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { useI18n } from '../../store/i18n.tsx';
import { BoldIcon } from '../icons/BoldIcon.tsx';
import { ItalicIcon } from '../icons/ItalicIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { motion, AnimatePresence } from 'framer-motion';
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

const UnderlineIcon = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
);

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
    const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

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

    const updateMenuPosition = (editorInstance: Editor) => {
        if (editorInstance.state.selection.empty) {
            setMenuPosition(null);
            return;
        }

        const { from, to } = editorInstance.state.selection;
        const startPos = editorInstance.view.coordsAtPos(from);
        const endPos = editorInstance.view.coordsAtPos(to);
        const left = (startPos.left + endPos.right) / 2;
        const top = startPos.top - 50;

        setMenuPosition({ top, left });
    };

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
            updateMenuPosition(editorInstance);
        },
        onSelectionUpdate: ({ editor: editorInstance }) => {
            updateMenuPosition(editorInstance);
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
                    'prose prose-lg dark:prose-invert max-w-none focus:outline-none min-h-[60vh] pb-32 transition-all duration-500 ease-in-out',
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
            <AnimatePresence>
                {editor && menuPosition && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        style={{
                            position: 'fixed',
                            top: menuPosition.top,
                            left: menuPosition.left,
                            transform: 'translateX(-50%)',
                            zIndex: 50,
                        }}
                        className="flex bg-slate-800 text-white rounded-lg shadow-xl border border-white/10 overflow-hidden"
                    >
                        <button
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            className={`p-2 hover:bg-white/10 transition-colors ${editor.isActive('bold') ? 'text-accent bg-white/10' : ''}`}
                        >
                            <BoldIcon className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            className={`p-2 hover:bg-white/10 transition-colors ${editor.isActive('italic') ? 'text-accent bg-white/10' : ''}`}
                        >
                            <ItalicIcon className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleUnderline().run()}
                            className={`p-2 hover:bg-white/10 transition-colors ${editor.isActive('underline') ? 'text-accent bg-white/10' : ''}`}
                        >
                            <UnderlineIcon className="h-4 w-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

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
                .tiptap [lang='ar'] {
                    font-family: 'Noto Naskh Arabic', 'Amiri', serif;
                    font-size: 1.08em;
                    line-height: 2;
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
