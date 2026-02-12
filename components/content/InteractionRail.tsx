import React, { useState, useMemo } from 'react';
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
import { ChevronRightIcon } from '../icons/ChevronRightIcon.tsx';

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
            "flex flex-col items-center gap-1 group transition-all duration-200",
            (disabled || loading) ? "opacity-40 cursor-not-allowed grayscale" : "opacity-100"
        )} 
        disabled={disabled || loading}
        {...props}
    >
        <div className={cn(
            "h-10 w-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center shadow-lg transition-all duration-200",
            (!disabled && !loading) && "group-hover:scale-110 group-hover:bg-white/20",
            active && "bg-white/20 ring-1 ring-white/30",
            containerClassName
        )}>
            {loading ? <LoadingSpinner className="h-4 w-4" /> : <Icon className={cn("h-5 w-5", iconClassName)} />}
        </div>
        {count !== undefined && <span className="text-xs font-semibold text-white/90 drop-shadow-md">{count}</span>}
    </button>
);

const InteractionRail: React.FC<InteractionRailProps> = ({ post, onOpenDiscussion, onNewPost }) => {
    const { lang } = useI18n();
    const { user } = useAuth();
    const [isExpanded, setIsExpanded] = useState(true);

    // Authority: Consolidate all engagement for this postId
    const { 
        isLiked, isBookmarked, isReposted, 
        counts, isLoading, isTransitioning,
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
                containerClassName: "h-12 w-12 bg-white !opacity-100 shadow-2xl",
                iconClassName: "h-6 w-6 text-slate-900 stroke-[2.5px]",
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
        <div className="fixed bottom-24 right-4 z-40 flex flex-col items-center">
            <div className="flex flex-col-reverse items-center gap-3">
                {actionsConfig.map((action, index) => (
                    <div
                        key={action.id}
                        className={cn(
                            "transition-all duration-200 ease-out origin-bottom",
                            isExpanded ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 scale-50 translate-y-6 pointer-events-none'
                        )}
                        style={{ transitionDelay: `${index * 50}ms` }}
                    >
                        <ActionButton {...action.props} />
                    </div>
                ))}
            </div>

            <button 
                className="flex flex-col items-center gap-1 group mt-3"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="h-8 w-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white/70 shadow-lg">
                    <ChevronRightIcon className={cn("h-5 w-5 transition-transform duration-200", isExpanded ? 'rotate-90' : '-rotate-90')} />
                </div>
            </button>
        </div>
    );
};

export default InteractionRail;