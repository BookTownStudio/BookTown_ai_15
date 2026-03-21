import React from 'react';
import { cn } from '../../lib/utils.ts';
import BilingualText from '../ui/BilingualText.tsx';
import type { WriteDirection } from '../../types/entities.ts';

export interface OutlinePanelItem {
    id: string;
    kind: 'chapter' | 'headline';
    label: string;
    pos: number;
    dir?: WriteDirection;
}

interface OutlinePanelProps {
    items: OutlinePanelItem[];
    onSelectItem: (item: OutlinePanelItem) => void;
    emptyLabel: string;
    titleLabel: string;
    variant?: 'desktop' | 'sheet';
}

const OutlinePanel: React.FC<OutlinePanelProps> = ({
    items,
    onSelectItem,
    emptyLabel,
    titleLabel,
    variant = 'desktop',
}) => {
    const isSheet = variant === 'sheet';

    return (
        <aside
            className={cn(
                isSheet
                    ? 'border-0 bg-transparent p-0 overflow-y-auto'
                    : 'hidden lg:block border border-white/10 rounded-xl bg-black/10 p-3 overflow-y-auto max-h-[calc(100vh-220px)]'
            )}
        >
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
                                'w-full text-left rounded px-2 py-1.5 text-sm hover:bg-white/10 transition-colors',
                                item.kind === 'chapter' && 'font-semibold text-white',
                                item.kind === 'headline' && 'pl-4 text-slate-300',
                                isSheet && 'py-2.5'
                            )}
                            dir={item.dir}
                        >
                            {item.kind === 'headline' ? `\u2014 ${item.label}` : item.label}
                        </button>
                    ))}
                </div>
            )}
        </aside>
    );
};

export default OutlinePanel;
