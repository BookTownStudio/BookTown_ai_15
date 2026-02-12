
import React, { useEffect, useState } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import { useI18n } from '../../store/i18n.tsx';
import { BoldIcon } from '../icons/BoldIcon.tsx';
import { ItalicIcon } from '../icons/ItalicIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { motion, AnimatePresence } from 'framer-motion';

// Simple Underline Icon if not available
const UnderlineIcon = (props: any) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M6 4v6a6 6 0 0 0 12 0V4"/><line x1="4" x2="20" y1="20" y2="20"/></svg>
);

interface TiptapEditorProps {
    content: string;
    onChange: (html: string) => void;
    onEditorReady: (editor: Editor) => void;
    placeholder?: string;
    editable?: boolean;
    isFocusMode?: boolean;
    onFocus?: () => void;
}

const TiptapEditor: React.FC<TiptapEditorProps> = ({ 
    content, 
    onChange, 
    onEditorReady, 
    placeholder = 'Start writing...',
    editable = true,
    isFocusMode = false,
    onFocus
}) => {
    const { isRTL } = useI18n();
    const [menuPosition, setMenuPosition] = useState<{ top: number, left: number } | null>(null);

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
            }),
            Underline,
            Placeholder.configure({
                placeholder: placeholder,
                emptyEditorClass: 'is-editor-empty before:content-[attr(data-placeholder)] before:text-slate-500 before:float-left before:pointer-events-none',
            }),
        ],
        content: content,
        editable: editable,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
            updateMenuPosition(editor);
        },
        onSelectionUpdate: ({ editor }) => {
            updateMenuPosition(editor);
        },
        onCreate: ({ editor }) => {
            onEditorReady(editor);
        },
        onFocus: () => {
            onFocus?.();
        },
        editorProps: {
            attributes: {
                class: cn(
                    `prose prose-lg dark:prose-invert max-w-none focus:outline-none min-h-[60vh] pb-32 transition-all duration-500 ease-in-out`,
                    isRTL ? 'text-right' : 'text-left',
                    isFocusMode ? 'prose-xl leading-relaxed' : ''
                ),
            },
        },
    });

    const updateMenuPosition = (editor: Editor) => {
        if (editor.state.selection.empty) {
            setMenuPosition(null);
            return;
        }

        const { from, to } = editor.state.selection;
        const startPos = editor.view.coordsAtPos(from);
        const endPos = editor.view.coordsAtPos(to);

        // Calculate center of selection
        const left = (startPos.left + endPos.right) / 2;
        const top = startPos.top - 50; // Position above

        setMenuPosition({ top, left });
    };

    useEffect(() => {
        if (editor && content && editor.getHTML() !== content) {
            if (editor.getText().trim() === '' && content !== '<p></p>') { 
                 editor.commands.setContent(content);
            }
        }
    }, [content, editor]);

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
                            zIndex: 50 
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
                    background: #0f172a; /* Match bg color */
                    padding: 0 10px;
                    color: #64748b;
                    font-size: 1.2rem;
                }
            `}</style>
        </div>
    );
};

export default TiptapEditor;
