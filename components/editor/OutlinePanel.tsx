import React from 'react';
import { cn } from '../../lib/utils.ts';
import BilingualText from '../ui/BilingualText.tsx';
import type { EditorOutlineItem } from './TiptapEditor.tsx';

interface OutlinePanelProps {
    items: EditorOutlineItem[];
    onSelectItem: (item: EditorOutlineItem) => void;
    emptyLabel: string;
    titleLabel: string;
}

const OutlinePanel: React.FC<OutlinePanelProps> = ({
    items,
    onSelectItem,
    emptyLabel,
    titleLabel,
}) => {
    return (
        <aside className="hidden lg:block border border-white/10 rounded-xl bg-black/10 p-3 overflow-y-auto max-h-[calc(100vh-220px)]">
            <BilingualText role="Caption" className="text-slate-400 uppercase tracking-wider mb-3 block">
                {titleLabel}
            </BilingualText>
            {items.length === 0 ? (
                <BilingualText className="text-slate-500 text-sm">
                    {emptyLabel}
                </BilingualText>
            ) : (
                <div className="space-y-1">
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onSelectItem(item)}
                            className={cn(
                                'w-full text-left rounded px-2 py-1.5 text-sm hover:bg-white/10 text-slate-200 transition-colors',
                                item.level === 2 && 'pl-4 text-slate-300',
                                item.level === 3 && 'pl-6 text-slate-400'
                            )}
                            dir={item.dir}
                        >
                            {item.text}
                        </button>
                    ))}
                </div>
            )}
        </aside>
    );
};

export default OutlinePanel;
