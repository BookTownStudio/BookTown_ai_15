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
}

const FormattingToolbar: React.FC<FormattingToolbarProps> = ({ 
    editor,
    onToggleVoice, 
    isRecording,
    isVisible
}) => {
    const { lang } = useI18n();
    const [activeMenu, setActiveMenu] = useState<'style' | 'align' | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
            }
        };
        if (activeMenu) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [activeMenu]);

    if (!editor) return null;

    const ButtonClass = "h-9 px-2 flex items-center justify-center rounded transition-all text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white font-medium text-sm gap-1";
    const ActiveClass = "bg-slate-200 dark:bg-white/10 text-primary dark:text-accent shadow-inner";
    const DropdownItemClass = "w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/10 transition-colors flex items-center gap-3 first:rounded-t-lg last:rounded-b-lg";
    const getActiveStyleLabel = () => {
        if (editor.isActive('heading')) return 'Headline';
        return 'Paragraph';
    };

    return (
        <div className={cn(
            "sticky top-16 z-30 transition-all duration-300 ease-in-out border-b border-slate-200 dark:border-white/5 bg-slate-50/95 dark:bg-slate-900/40 backdrop-blur-md h-12 flex items-center justify-center",
            isVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        )}>
            <div className="container mx-auto px-4 flex items-center justify-center gap-2 relative" ref={menuRef}>
                
                {/* 1. Style Dropdown */}
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

                {/* 2. Inline Formatting: Bold (B) */}
                <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={cn(ButtonClass, editor.isActive('bold') && ActiveClass, "font-black text-base w-8")}
                >
                    B
                </button>

                {/* 3. Inline Formatting: Italic (I) */}
                <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={cn(ButtonClass, editor.isActive('italic') && ActiveClass, "italic font-serif text-base w-8")}
                >
                    I
                </button>

                {/* 4. Alignment Dropdown */}
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

                {/* 5. Create Chapter (+) - Standard thin white circle style */}
                <button
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    className={cn(
                        "w-8 h-8 flex items-center justify-center rounded-full border border-slate-300 dark:border-white/30 transition-all text-primary dark:text-accent hover:bg-black/5 dark:hover:bg-white/10"
                    )}
                    title={lang === 'en' ? "Create Chapter" : "إنشاء فصل"}
                >
                    <PlusIcon className="h-4 w-4" />
                </button>

                {/* 6. Voice Dictation - Moved to far right with extra distance */}
                <button 
                    onClick={onToggleVoice}
                    className={cn(
                        "ml-6 w-8 h-8 flex items-center justify-center rounded-full transition-all text-slate-500 dark:text-slate-400 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20", 
                        isRecording && "text-red-500 bg-red-500/10 hover:bg-red-500/20"
                    )}
                    aria-label="Dictation"
                >
                    <MicIcon className={cn("h-4 w-4", isRecording && "animate-pulse")} />
                </button>

            </div>
        </div>
    );
};

export default FormattingToolbar;
