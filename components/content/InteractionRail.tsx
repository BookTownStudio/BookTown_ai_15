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
    showNewPost?: boolean;
    className?: string;
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
}) => {
    const buttonAriaLabel = props['aria-label'] ?? label;

    return (
        <button
            type="button"
            aria-label={buttonAriaLabel}
            className={cn(
                "inline-flex h-8.5 shrink-0 items-center gap-1 rounded-full px-1.5 py-1 text-[11px] transition-all duration-200",
                (disabled || loading)
                    ? "cursor-not-allowed opacity-35 grayscale"
                    : "opacity-75 hover:bg-white/[0.04] hover:opacity-100",
                active && "bg-white/[0.06] text-white"
            )}
            disabled={disabled || loading}
            {...props}
        >
            <div className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-200",
                (!disabled && !loading) && "bg-transparent",
                active && "text-white",
                containerClassName
            )}>
                {loading ? <LoadingSpinner className="h-3.5 w-3.5" /> : <Icon className={cn("h-4 w-4", iconClassName)} />}
            </div>
            {count !== undefined && <span className="text-[10px] font-medium tabular-nums text-white/46">{count}</span>}
        </button>
    );
};

const InteractionRail: React.FC<InteractionRailProps> = ({
    post,
    onOpenDiscussion,
    onNewPost,
    showNewPost = false,
    className,
}) => {
    const { lang } = useI18n();
    const { user } = useAuth();

    const { 
        isLiked, isBookmarked, isReposted, 
        counts, isTransitioning,
        actions 
    } = usePostInteractions(post?.id, post || undefined);

    // POST_VISIBILITY_POLICY_V1: Interaction Constraints
    const canInteract = post && (post.visibility === 'public' || post.visibility === 'followers') && post.status !== 'deleted';
    const canRepost = post && post.visibility === 'public' && post.authorId !== user?.uid && post.status !== 'deleted';
    const canShare = post && post.visibility === 'public' && post.status !== 'deleted';

    const actionsConfig = useMemo(() => {
        const orderedActions = [
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
                id: 'repost',
                props: {
                    icon: RepostIcon,
                    label: lang === 'en' ? 'Repost' : 'إعادة نشر',
                    count: counts?.repostsCount || 0,
                    active: isReposted,
                    iconClassName: cn('text-green-400', isReposted && 'fill-green-400'),
                    loading: isTransitioning,
                    onClick: actions.toggleRepost,
                    disabled: !canRepost,
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
                    disabled: !canInteract,
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
                    disabled: !post || post.status === 'deleted',
                }
            },
            {
                id: 'share',
                props: {
                    icon: ShareIcon,
                    label: lang === 'en' ? 'Share' : 'مشاركة',
                    iconClassName: 'text-blue-400',
                    onClick: actions.share,
                    disabled: !canShare,
                }
            },
        ];

        if (showNewPost) {
            orderedActions.unshift({
                id: 'new-post',
                props: {
                    icon: PlusIcon,
                    label: lang === 'en' ? 'New Post' : 'منشور جديد',
                    iconClassName: "h-3.5 w-3.5 text-white",
                    onClick: () => onNewPost?.(),
                    disabled: false,
                }
            });
        }

        return orderedActions;
    }, [post, lang, isLiked, isBookmarked, isReposted, counts, isTransitioning, actions, onOpenDiscussion, onNewPost, canInteract, canRepost, canShare, showNewPost]);

    return (
        <div className={cn(
            "mt-4 flex items-center gap-0.5 overflow-x-auto whitespace-nowrap border-t border-white/[0.05] pt-2.5 text-white/68 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1",
            className
        )}>
            {actionsConfig.map((action) => (
                <ActionButton key={action.id} {...action.props} />
            ))}
        </div>
    );
};

export default InteractionRail;
