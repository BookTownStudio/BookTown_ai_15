import React from 'react';
import { ThreadPost } from '../../types/entities.ts';
import { usePostInteractions } from '../../lib/hooks/usePostInteractions.ts';
import { LikeIcon } from '../icons/LikeIcon.tsx';
import { ChatIcon } from '../icons/ChatIcon.tsx';
import { BookmarkIcon } from '../icons/BookmarkIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { useI18n } from '../../store/i18n.tsx';
import { LockIcon } from '../icons/LockIcon.tsx';

interface ThreadActionsProps {
    readonly post: ThreadPost;
    onCommentClick: () => void;
}

/**
 * ThreadActions
 * Implementation of MUTATION_BOUNDARIES_V1.
 * ENFORCEMENT: post_core: { likes: read_only, reposts: read_only, bookmarks: read_only }
 */
const ThreadActions: React.FC<ThreadActionsProps> = ({ post, onCommentClick }) => {
    const { isRTL, lang } = useI18n();
    const counts = post.interactionCounts || { likes: 0, comments: 0, bookmarks: 0 };
    
    // FIX: Removed 'status' from destructuring as it is not returned by the usePostInteractions hook and is unused in this component.
    const { isLiked, isBookmarked } = usePostInteractions(post.id);

    const ReadOnlyAction = ({ icon: Icon, count, active, activeClass, label }: any) => (
        <div
            className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-full transition-all opacity-60 cursor-default grayscale-[0.5]",
                "text-slate-500 dark:text-slate-400",
                active && activeClass
            )}
            title={lang === 'en' ? "Read-only in thread" : "للقراءة فقط في السلسلة"}
        >
            <Icon className={cn("h-5 w-5", active && "fill-current")} />
            <span className="text-sm font-bold tabular-nums">{count.toLocaleString()}</span>
            <LockIcon className="h-2.5 w-2.5 opacity-40 ml-0.5" />
        </div>
    );

    return (
        <div className={cn(
            "flex items-center gap-2 px-4 py-2 border-t border-black/5 dark:border-white/5 bg-white dark:bg-slate-900",
            isRTL ? "flex-row-reverse" : "flex-row"
        )}>
            {/* MUTATION_BOUNDARY: read_only */}
            <ReadOnlyAction 
                icon={LikeIcon} 
                count={counts.likes} 
                active={isLiked} 
                activeClass="text-pink-500" 
                label="Like" 
            />

            {/* MUTATION_BOUNDARY: active */}
            <button
                onClick={onCommentClick}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-slate-800 dark:text-white hover:bg-black/5 transition-all"
            >
                <ChatIcon className="h-5 w-5" />
                <span className="text-sm font-bold">{counts.comments.toLocaleString()}</span>
            </button>

            {/* MUTATION_BOUNDARY: read_only */}
            <ReadOnlyAction 
                icon={BookmarkIcon} 
                active={isBookmarked} 
                activeClass="text-yellow-500" 
                label="Bookmark" 
            />
        </div>
    );
};

export default ThreadActions;