import React, { useState } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import Button from '../ui/Button.tsx';
import EditorMenu from './EditorMenu.tsx';
import { AlignLeftIcon } from '../icons/AlignLeftIcon.tsx';
import { AlignCenterIcon } from '../icons/AlignCenterIcon.tsx';
import { AlignRightIcon } from '../icons/AlignRightIcon.tsx';
import { ChevronDownIcon } from '../icons/ChevronDownIcon.tsx';
import { SeparatorIcon } from '../icons/SeparatorIcon.tsx';
import { MicIcon } from '../icons/MicIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { Editor } from '@tiptap/react';

export type Style = 'paragraph' | 'heading1' | 'heading2' | 'quote';

interface FormattingPaneProps {
    editor: Editor | null;
    onInsertChapter: () => void;
    onToggleVoice: () => void;
    isRecording: boolean;
}

const FormattingPane: React.FC<FormattingPaneProps> = ({ 
    editor,
    onInsertChapter, 
    onToggleVoice, 
    isRecording 
}) => {
    const { lang } = useI18n();
    const [openMenu, setOpenMenu] = useState<'style' | 'format' | 'align' | null>(null);

    if (!editor) return null;

    const STYLES: { id: Style, label: string }[] = [
        { id: 'paragraph', label: 'Paragraph' },
        { id: 'heading1', label: 'Heading 1' },
        { id: 'heading2', label: 'Heading 2' },
        { id: 'quote', label: 'Quote' },
    ];

    const toggleStyle = (style: Style) => {
        switch(style) {
            case 'heading1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break;
            case 'heading2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break;
            case 'quote': editor.chain().focus().toggleBlockquote().run(); break;
            case 'paragraph': editor.chain().focus().setParagraph().run(); break;
        }
        setOpenMenu(null);
    };

    const toggleFormat = (format: 'bold' | 'italic') => {
        if (format === 'bold') editor.chain().focus().toggleBold().run();
        if (format === 'italic') editor.chain().focus().toggleItalic().run();
        setOpenMenu(null);
    };

    const setAlign = (align: 'left' | 'center' | 'right' | 'justify') => {
        // Tiptap alignment requires the TextAlign extension which isn't in StarterKit
        // For now, we'll just close the menu as a placeholder or you'd add the extension
        console.log("Alignment set to", align); 
        setOpenMenu(null);
    };

    const buttonBaseClass = "!px-2 !h-9 text-slate-300 dark:text-slate-300 hover:text-sky-400 dark:hover:text-sky-400 hover:bg-white/5 transition-colors text-sm font-medium";

    return (
        <div className="sticky top-16 z-10 bg-[#0A0F18] border-b border-white/10 -mx-4 md:-mx-8 px-8 md:px-12 pb-2 pt-2">
            <div className="flex items-center justify-between w-full">
                
                {/* 1. Style Dropdown */}
                <div className="relative">
                    <Button 
                        variant="ghost" 
                        className={buttonBaseClass}
                        onClick={() => setOpenMenu(openMenu === 'style' ? null : 'style')}
                    >
                        {lang === 'en' ? 'Style' : 'نمط'} <ChevronDownIcon className="h-3 w-3 ml-1" />
                    </Button>
                    {openMenu === 'style' && (
                        <EditorMenu>
                            {STYLES.map(s => (
                                <button key={s.id} onClick={() => toggleStyle(s.id)} className="w-full text-left px-3 py-2 rounded hover:bg-black/10 dark:hover:bg-white/10 text-sm">
                                    {s.label}
                                </button>
                            ))}
                        </EditorMenu>
                    )}
                </div>

                {/* 2. Format Menu */}
                <div className="relative">
                    <Button 
                        variant="ghost" 
                        className={buttonBaseClass}
                        onClick={() => setOpenMenu(openMenu === 'format' ? null : 'format')}
                    >
                        {lang === 'en' ? 'Format' : 'تنسيق'} <ChevronDownIcon className="h-3 w-3 ml-1" />
                    </Button>
                    {openMenu === 'format' && (
                        <EditorMenu>
                            <button onClick={() => toggleFormat('bold')} className={cn("w-full text-left px-3 py-2 rounded hover:bg-black/10 dark:hover:bg-white/10 text-sm", editor.isActive('bold') && "text-accent")}>
                                Bold
                            </button>
                            <button onClick={() => toggleFormat('italic')} className={cn("w-full text-left px-3 py-2 rounded hover:bg-black/10 dark:hover:bg-white/10 text-sm", editor.isActive('italic') && "text-accent")}>
                                Italic
                            </button>
                        </EditorMenu>
                    )}
                </div>

                {/* 3. Align Dropdown */}
                <div className="relative">
                     <Button 
                        variant="ghost" 
                        className={buttonBaseClass}
                        onClick={() => setOpenMenu(openMenu === 'align' ? null : 'align')}
                    >
                        {lang === 'en' ? 'Align' : 'محاذاة'} <ChevronDownIcon className="h-3 w-3 ml-1" />
                    </Button>
                     {openMenu === 'align' && (
                        <EditorMenu>
                            <button onClick={() => setAlign('left')} className="w-full text-left px-3 py-2 rounded hover:bg-black/10 dark:hover:bg-white/10 text-sm flex items-center gap-2"><AlignLeftIcon className="h-4 w-4"/> Left</button>
                            <button onClick={() => setAlign('center')} className="w-full text-left px-3 py-2 rounded hover:bg-black/10 dark:hover:bg-white/10 text-sm flex items-center gap-2"><AlignCenterIcon className="h-4 w-4"/> Center</button>
                            <button onClick={() => setAlign('right')} className="w-full text-left px-3 py-2 rounded hover:bg-black/10 dark:hover:bg-white/10 text-sm flex items-center gap-2"><AlignRightIcon className="h-4 w-4"/> Right</button>
                        </EditorMenu>
                    )}
                </div>

                {/* 4. Chapter Insert */}
                <Button 
                    variant="ghost" 
                    className={buttonBaseClass}
                    onClick={onInsertChapter}
                >
                    <SeparatorIcon className="h-5 w-5 mr-1" />
                    {lang === 'en' ? 'Chapter' : 'فصل'}
                </Button>

                {/* 5. Voice Dictation (Icon Only) */}
                <Button 
                    variant="ghost" 
                    className={cn(
                        "!px-3 !h-9 transition-all duration-300 rounded-full",
                        isRecording 
                            ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" 
                            : "text-slate-300 hover:text-sky-400 hover:bg-white/5"
                    )}
                    onClick={onToggleVoice}
                    aria-label={isRecording ? 'Stop recording' : 'Start recording'}
                >
                    <MicIcon className={cn("h-5 w-5", isRecording && "animate-pulse")} />
                </Button>

            </div>
        </div>
    );
};

export default FormattingPane;