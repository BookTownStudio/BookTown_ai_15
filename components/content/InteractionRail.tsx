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

type ActionButtonProps = { 
    icon: React.FC<any>, 
    label: string, 
    count?: number, 
    iconClassName?: string,
    containerClassName?: string,
    loading?: boolean,
    active?: boolean,
    disabled?: boolean 
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const ActionButton = React.memo<ActionButtonProps>(({
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
                "inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-1.5 py-1 text-[11px] transition-colors duration-[var(--social-post-action-transition)] motion-reduce:transition-none",
                (disabled || loading)
                    ? "cursor-not-allowed opacity-35 grayscale"
                    : "opacity-75 hover:bg-[var(--social-post-action-hover-bg)] hover:opacity-100 active:bg-[var(--social-post-action-active-bg)]",
                active && "bg-[var(--social-post-action-selected-bg)] text-white"
            )}
            disabled={disabled || loading}
            {...props}
        >
            <div className={cn(
                "flex h-[1.35rem] w-[1.35rem] items-center justify-center rounded-full transition-colors duration-200",
                (!disabled && !loading) && "bg-transparent",
                active && "text-white",
                containerClassName
            )}>
                {loading ? <LoadingSpinner className="h-4 w-4" /> : <Icon className={cn("h-[1.15rem] w-[1.15rem]", iconClassName)} />}
            </div>
            {count !== undefined && <span className="text-[10px] font-medium tabular-nums text-white/46">{count}</span>}
        </button>
    );
});

ActionButton.displayName = 'ActionButton';

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
        counts, pending,
        actions 
    } = usePostInteractions(post?.id, post || undefined);

    // POST_VISIBILITY_POLICY_V1: Interaction Constraints
    const canInteract = post && (post.visibility === 'public' || post.visibility === 'followers') && post.status !== 'deleted';
    const canRepost = post && (post.visibility === 'public' || post.visibility === 'followers') && post.status !== 'deleted';
    const canShare = post && post.visibility === 'public' && post.status !== 'deleted';

    const actionsConfig = useMemo(() => {
        const leftActions = [
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
                    loading: pending.repost,
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
                    loading: pending.like,
                    onClick: actions.toggleLike,
                    disabled: !canInteract,
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
            leftActions.unshift({
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

        const bookmarkAction = {
            id: 'bookmark',
            props: {
                icon: BookmarkIcon,
                label: lang === 'en' ? 'Bookmark' : 'حفظ',
                count: counts?.bookmarksCount || 0,
                active: isBookmarked,
                iconClassName: cn('text-yellow-400', isBookmarked && 'fill-yellow-400'),
                loading: pending.bookmark,
                onClick: actions.toggleBookmark,
                disabled: !post || post.status === 'deleted',
            }
        };

        return { leftActions, bookmarkAction };
    }, [post, lang, isLiked, isBookmarked, isReposted, counts, pending, actions, onOpenDiscussion, onNewPost, canInteract, canRepost, canShare, showNewPost]);

    return (
        <div className={cn(
            "mt-[var(--social-post-action-margin-top)] flex items-center justify-between gap-3 border-t border-[color:var(--social-post-action-border)] pt-[var(--social-post-action-padding-top)] text-white/68",
            className
        )}>
            <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1">
                {actionsConfig.leftActions.map((action) => (
                    <ActionButton key={action.id} {...action.props} />
                ))}
            </div>
            <div className="flex shrink-0 items-center">
                <ActionButton {...actionsConfig.bookmarkAction.props} />
            </div>
        </div>
    );
};

export default React.memo(InteractionRail);
