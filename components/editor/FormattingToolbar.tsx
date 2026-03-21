import { devLog } from '../../lib/logging/devLog';

import React, { useState, useRef, useEffect } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { AlignLeftIcon } from '../icons/AlignLeftIcon.tsx';
import { AlignCenterIcon } from '../icons/AlignCenterIcon.tsx';
import { AlignRightIcon } from '../icons/AlignRightIcon.tsx';
import { MicIcon } from '../icons/MicIcon.tsx';
import { Editor } from '@tiptap/react';
import { cn } from '../../lib/utils.ts';
import { ChevronDownIcon } from '../icons/ChevronDownIcon.tsx';
import { PlusIcon } from '../icons/PlusIcon.tsx';
import LiteraryShell from '../layout/LiteraryShell.tsx';
import { createChapterBlockNodes, getChapterBlockParagraphSelectionOffset } from '../../lib/editor/chapterNodes.ts';

// Simple Justify Icon for the alignment dropdown
const AlignJustifyIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
);

interface FormattingToolbarProps {
    editor: Editor | null;
    onToggleVoice: () => void;
    isRecording: boolean;
    isVisible: boolean;
    innerClassName?: string;
    alignToEditorColumn?: boolean;
    dictationStatusLabel?: string;
    dictationElapsedMs?: number;
    dictationLanguageLabel?: string;
}

const FormattingToolbar: React.FC<FormattingToolbarProps> = ({ 
    editor,
    onToggleVoice, 
    isRecording,
    isVisible,
    innerClassName,
    alignToEditorColumn = false,
    dictationStatusLabel,
    dictationElapsedMs = 0,
    dictationLanguageLabel,
}) => {
    const { lang } = useI18n();
    const [activeMenu, setActiveMenu] = useState<'style' | 'align' | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const isDictationActive = isRecording;

    const formatElapsed = (elapsedMs: number): string => {
        const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
            }
        };
        if (activeMenu) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeMenu]);

    useEffect(() => {
        if (isDictationActive) {
            setActiveMenu(null);
        }
    }, [isDictationActive]);

    if (!editor) return null;

    const ButtonClass = "h-9 px-2 flex items-center justify-center rounded transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white font-medium text-sm gap-1";
    const ActiveClass = "bg-slate-200 dark:bg-white/10 text-primary dark:text-accent shadow-inner";
    const DropdownItemClass = "w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center gap-3 first:rounded-t-lg last:rounded-b-lg";
    const getActiveStyleLabel = () => {
        if (editor.isActive('heading')) return 'Headline';
        return 'Paragraph';
    };

    const getNextChapterTitle = () => {
        let chapterCount = 0;
        editor.state.doc.descendants((node) => {
            if (node.type.name === 'horizontalRule') {
                chapterCount += 1;
            }
            return true;
        });

        return `Chapter ${chapterCount + 1}`;
    };

    const insertChapterBlock = () => {
        const insertFrom = editor.state.selection.from;
        const chapterNodes = createChapterBlockNodes({
            title: getNextChapterTitle(),
            lang: lang === 'ar' ? 'ar' : 'en',
            dir: lang === 'ar' ? 'rtl' : 'ltr',
        });

        const inserted = editor
            .chain()
            .focus()
            .insertContent(chapterNodes)
            .run();

        if (!inserted) {
            return;
        }

        const paragraphSelection = insertFrom + getChapterBlockParagraphSelectionOffset(chapterNodes);
        editor.chain().focus().setTextSelection(paragraphSelection).run();
    };

    return (
        <div className={cn(
            "sticky top-16 z-30 transition-all duration-300 ease-in-out border-b border-slate-200 dark:border-white/5 bg-slate-50/95 dark:bg-slate-900/40 backdrop-blur-md h-12 flex items-center justify-center",
            isVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        )}>
            <LiteraryShell className="h-full">
                <div className={cn("h-full", alignToEditorColumn && "lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-6")}>
                    {alignToEditorColumn ? <div className="hidden lg:block" aria-hidden="true" /> : null}
                    <div className="min-w-0 flex h-full items-center">
                        <div className={cn("mx-auto flex w-full items-center justify-between gap-4 relative", innerClassName)} ref={menuRef}>
                            <div className="min-w-0 flex-1">
                                {isDictationActive ? (
                                    <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-red-500">
                                            {dictationStatusLabel || (lang === 'en' ? 'Listening' : 'جاري الإملاء')}
                                        </span>
                                        <span className="text-xs tabular-nums font-medium">
                                            {formatElapsed(dictationElapsedMs)}
                                        </span>
                                        {dictationLanguageLabel ? (
                                            <span className="rounded-full border border-red-200/70 bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-600 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200">
                                                {dictationLanguageLabel}
                                            </span>
                                        ) : null}
                                        <div className="flex items-end gap-1 h-5" aria-hidden="true">
                                            {[0.6, 0.95, 0.7, 1].map((scale, index) => (
                                                <span
                                                    key={index}
                                                    className="w-1 rounded-full bg-red-400/80 animate-pulse"
                                                    style={{
                                                        height: `${Math.round(10 + (index % 2 === 0 ? 4 : 8))}px`,
                                                        animationDuration: `${900 + index * 140}ms`,
                                                        transform: `scaleY(${scale})`,
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 transition-opacity">
                                        <div className="relative">
                                            <button
                                                onClick={() => setActiveMenu(activeMenu === 'style' ? null : 'style')}
                                                className={cn(ButtonClass, (editor.isActive('heading') || editor.isActive('paragraph')) && "text-slate-900 dark:text-white")}
                                            >
                                                <span className="text-xs font-bold">{getActiveStyleLabel()}</span>
                                                <ChevronDownIcon className="h-3 w-3 opacity-50" />
                                            </button>
                                            {activeMenu === 'style' && (
                                                <div className="absolute top-full left-0 mt-1 w-36 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-white/10 z-50 overflow-hidden">
                                                    <button onClick={() => { editor.chain().focus().setParagraph().run(); setActiveMenu(null); }} className={DropdownItemClass}>Paragraph</button>
                                                    <button onClick={() => { editor.chain().focus().setHeading({ level: 2 }).run(); setActiveMenu(null); }} className={cn(DropdownItemClass, "font-semibold")}>Headline</button>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => editor.chain().focus().toggleBold().run()}
                                            className={cn(ButtonClass, editor.isActive('bold') && ActiveClass, "font-black text-base w-8")}
                                        >
                                            B
                                        </button>

                                        <button
                                            onClick={() => editor.chain().focus().toggleItalic().run()}
                                            className={cn(ButtonClass, editor.isActive('italic') && ActiveClass, "italic font-serif text-base w-8")}
                                        >
                                            I
                                        </button>

                                        <div className="relative">
                                            <button
                                                onClick={() => setActiveMenu(activeMenu === 'align' ? null : 'align')}
                                                className={cn(ButtonClass, "w-8")}
                                            >
                                                <AlignLeftIcon className="h-4 w-4" />
                                            </button>
                                            {activeMenu === 'align' && (
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-40 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-white/10 z-50 overflow-hidden">
                                                    <button onClick={() => { devLog('Align Left'); setActiveMenu(null); }} className={DropdownItemClass}><AlignLeftIcon className="h-4 w-4"/> Left</button>
                                                    <button onClick={() => { devLog('Align Center'); setActiveMenu(null); }} className={DropdownItemClass}><AlignCenterIcon className="h-4 w-4"/> Center</button>
                                                    <button onClick={() => { devLog('Align Right'); setActiveMenu(null); }} className={DropdownItemClass}><AlignRightIcon className="h-4 w-4"/> Right</button>
                                                    <button onClick={() => { devLog('Align Justify'); setActiveMenu(null); }} className={DropdownItemClass}><AlignJustifyIcon className="h-4 w-4"/> Justify</button>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={insertChapterBlock}
                                            className={cn(
                                                "w-8 h-8 flex items-center justify-center rounded-full border border-slate-300 dark:border-white/30 transition-all text-primary dark:text-accent hover:bg-black/5 dark:hover:bg-white/10"
                                            )}
                                            title={lang === 'en' ? "Create Chapter" : "إنشاء فصل"}
                                        >
                                            <PlusIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button 
                                onClick={onToggleVoice}
                                className={cn(
                                    "flex items-center justify-center rounded-full transition-all duration-200",
                                    isDictationActive
                                        ? "h-11 w-11 bg-red-500 text-white shadow-lg shadow-red-500/25 hover:bg-red-400"
                                        : "h-8 w-8 text-slate-500 dark:text-slate-400 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20"
                                )}
                                aria-label={isDictationActive ? (lang === 'en' ? 'Stop dictation' : 'إيقاف الإملاء') : (lang === 'en' ? 'Start dictation' : 'بدء الإملاء')}
                            >
                                <MicIcon className={cn("transition-all duration-200", isDictationActive ? "h-5 w-5" : "h-4 w-4")} />
                            </button>
                        </div>
                    </div>
                </div>
            </LiteraryShell>
        </div>
    );
};

export default FormattingToolbar;
