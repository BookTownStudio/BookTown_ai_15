import React, { useMemo } from 'react';
import { Post } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { LikeIcon } from '../icons/LikeIcon.tsx';
import { ChatIcon } from '../icons/ChatIcon.tsx';
import { RepostIcon } from '../icons/RepostIcon.tsx';
import { ShareIcon } from '../icons/ShareIcon.tsx';
import { BookmarkIcon } from '../icons/BookmarkIcon.tsx';
import { PlusIcon } from '../icons/PlusIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { usePostInteractions } from '../../lib/hooks/usePostInteractions.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';

interface InteractionRailProps {
    post: Post | null;
    onOpenDiscussion: () => void;
    onNewPost?: () => void;
}

const ActionButton: React.FC<{ 
    icon: React.FC<any>, 
    label: string, 
    count?: number, 
    iconClassName?: string,
    containerClassName?: string,
    loading?: boolean,
    active?: boolean,
    disabled?: boolean 
} & React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ 
    icon: Icon, 
    label, 
    count, 
    iconClassName, 
    containerClassName,
    loading,
    active,
    disabled,
    ...props 
}) => (
    <button 
        className={cn(
            "flex flex-col items-center gap-2.5 group transition-all duration-200",
            (disabled || loading) ? "opacity-35 cursor-not-allowed grayscale" : "opacity-85"
        )} 
        disabled={disabled || loading}
        {...props}
    >
        <div className={cn(
            "h-8 w-8 rounded-full bg-black/16 backdrop-blur-sm flex items-center justify-center border border-white/12 transition-all duration-200",
            (!disabled && !loading) && "group-hover:scale-105 group-hover:bg-white/14 group-hover:border-white/30",
            active && "bg-[#0077B6]/22 ring-1 ring-[#0077B6]/35 border-[#0077B6]/35",
            containerClassName
        )}>
            {loading ? <LoadingSpinner className="h-3 w-3" /> : <Icon className={cn("h-3.5 w-3.5", iconClassName)} />}
        </div>
        {count !== undefined && <span className="text-[10px] font-semibold text-white/60 drop-shadow-sm">{count}</span>}
    </button>
);

const InteractionRail: React.FC<InteractionRailProps> = ({ post, onOpenDiscussion, onNewPost }) => {
    const { lang } = useI18n();
    const { user } = useAuth();

    // Authority: Consolidate all engagement for this postId
    const { 
        isLiked, isBookmarked, isReposted, 
        counts, isTransitioning,
        actions 
    } = usePostInteractions(post?.id, post || undefined);

    // POST_VISIBILITY_POLICY_V1: Interaction Constraints
    const canInteract = post && (post.visibility === 'public' || post.visibility === 'followers') && post.status !== 'deleted';
    const canRepost = post && post.visibility === 'public' && post.authorId !== user?.uid && post.status !== 'deleted';
    const canShare = post && post.visibility === 'public' && post.status !== 'deleted';

    const actionsConfig = useMemo(() => [
        { 
            id: 'new-post', 
            props: { 
                icon: PlusIcon, 
                label: lang === 'en' ? 'New Post' : 'منشور جديد',
                containerClassName: "h-9 w-9 bg-white/95 !opacity-100 shadow-[0_10px_24px_-12px_rgba(0,0,0,0.9)] border-white/60",
                iconClassName: "h-4 w-4 text-slate-900 stroke-[2.4px]",
                onClick: () => onNewPost?.()
            } 
        },
        { 
            id: 'comment', 
            props: { 
                icon: ChatIcon, 
                label: lang === 'en' ? 'Comment' : 'تعليق', 
                count: counts?.commentsCount || 0, 
                iconClassName: 'text-sky-300', 
                onClick: () => onOpenDiscussion(),
                disabled: !canInteract
            } 
        },
        { 
            id: 'bookmark', 
            props: { 
                icon: BookmarkIcon, 
                label: lang === 'en' ? 'Bookmark' : 'حفظ', 
                count: counts?.bookmarksCount || 0,
                active: isBookmarked,
                iconClassName: cn('text-yellow-400', isBookmarked && 'fill-yellow-400'), 
                loading: isTransitioning,
                onClick: actions.toggleBookmark,
                disabled: !post || post.status === 'deleted'
            } 
        },
        { 
            id: 'share', 
            props: { 
                icon: ShareIcon, 
                label: lang === 'en' ? 'Share' : 'مشاركة', 
                iconClassName: 'text-blue-400', 
                onClick: actions.share,
                disabled: !canShare
            } 
        },
        { 
            id: 'repost', 
            props: { 
                icon: RepostIcon, 
                label: lang === 'en' ? 'Repost' : 'إعادة نشر', 
                count: counts?.repostsCount || 0, 
                active: isReposted,
                iconClassName: cn('text-green-400', isReposted && 'fill-green-400'), 
                loading: isTransitioning,
                onClick: actions.toggleRepost,
                disabled: !canRepost
            } 
        },
        { 
            id: 'like', 
            props: { 
                icon: LikeIcon, 
                label: lang === 'en' ? 'Like' : 'إعجاب', 
                count: counts?.likesCount || 0, 
                active: isLiked,
                iconClassName: cn('text-pink-500', isLiked && 'fill-pink-500'), 
                loading: isTransitioning,
                onClick: actions.toggleLike,
                disabled: !canInteract
            } 
        }
    ], [post, lang, isLiked, isBookmarked, isReposted, counts, isTransitioning, actions, onOpenDiscussion, onNewPost, canInteract, canRepost, canShare]);

    return (
        <div className="fixed right-3 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center rounded-[1.7rem] border border-white/10 bg-black/22 px-2 py-3.5 backdrop-blur-md shadow-[0_20px_44px_-30px_rgba(0,0,0,0.9)]">
            <div className="flex flex-col-reverse items-center gap-5">
                {actionsConfig.map((action) => (
                    <ActionButton key={action.id} {...action.props} />
                ))}
            </div>
        </div>
    );
};

export default InteractionRail;
