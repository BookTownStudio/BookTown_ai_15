import React from 'react';
import { ThreadPost } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { cn } from '../../lib/utils.ts';

interface ThreadHeaderProps {
    readonly post: ThreadPost;
}

/**
 * ThreadHeader
 * Authoritative implementation for POST_DISCUSSION_UI_CONTRACT_V1.
 */
const ThreadHeader: React.FC<ThreadHeaderProps> = ({ post }) => {
    const { lang, isRTL } = useI18n();

    const timeLabel = new Date(post.createdAt).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    return (
        <div className={cn("flex items-center gap-3", isRTL ? "flex-row-reverse" : "flex-row")}>
            <div className="flex-shrink-0">
                <img 
                    src={post.authorAvatar} 
                    alt={post.authorName} 
                    className="h-10 w-10 rounded-full border border-black/5 dark:border-white/10 object-cover bg-slate-100 dark:bg-slate-800"
                />
            </div>
            <div className="min-w-0">
                <BilingualText className="font-bold text-sm text-slate-900 dark:text-white leading-tight truncate">
                    {post.authorName}
                </BilingualText>
                <BilingualText role="Caption" className="!text-[11px] !text-slate-400 leading-none mt-0.5">
                    {post.authorHandle} • {timeLabel}
                </BilingualText>
            </div>
        </div>
    );
};

export default ThreadHeader;