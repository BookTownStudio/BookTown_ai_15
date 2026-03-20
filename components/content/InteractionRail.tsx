import React, { useMemo, useState } from 'react';
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
import { ChevronLeftIcon } from '../icons/ChevronLeftIcon.tsx';

interface InteractionRailProps {
    post: Post | null;
    onOpenDiscussion: () => void;
    onNewPost?: () => void;
    desktopShellMaxWidth?: number;
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
            "h-7 w-7 rounded-full bg-black/16 backdrop-blur-sm flex items-center justify-center border border-white/12 transition-all duration-200",
            (!disabled && !loading) && "group-hover:scale-105 group-hover:bg-white/14 group-hover:border-white/30",
            active && "bg-[#0077B6]/22 ring-1 ring-[#0077B6]/35 border-[#0077B6]/35",
            containerClassName
        )}>
            {loading ? <LoadingSpinner className="h-3 w-3" /> : <Icon className={cn("h-3 w-3", iconClassName)} />}
        </div>
        {count !== undefined && <span className="text-[10px] font-semibold text-white/60 drop-shadow-sm">{count}</span>}
    </button>
);

const InteractionRail: React.FC<InteractionRailProps> = ({
    post,
    onOpenDiscussion,
    onNewPost,
    desktopShellMaxWidth = 1040,
}) => {
    const { lang } = useI18n();
    const { user } = useAuth();
    const [isCollapsed, setIsCollapsed] = useState(false);
    const attachedRight = useMemo(
        () => `max(0.75rem, calc((100vw - min(100vw, ${desktopShellMaxWidth}px)) / 2 + 0.75rem))`,
        [desktopShellMaxWidth]
    );

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
                containerClassName: "h-8 w-8 bg-white/95 !opacity-100 shadow-[0_8px_18px_-12px_rgba(0,0,0,0.9)] border-white/60",
                iconClassName: "h-3.5 w-3.5 text-slate-900 stroke-[2.4px]",
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
        <div
            className={cn(
                "fixed z-40 flex flex-col items-center",
                "bottom-[calc(var(--bottom-nav-height,66px)+12px)]"
            )}
            style={{ right: attachedRight }}
        >
            <div
                className={cn(
                    "mb-2 flex flex-col-reverse items-center gap-5 rounded-[999px] border border-white/10 bg-black/22 px-2 py-2.5 backdrop-blur-md shadow-[0_14px_28px_-24px_rgba(0,0,0,0.82)] transition-all duration-[250ms] ease-in-out origin-bottom",
                    isCollapsed
                        ? "pointer-events-none max-h-0 opacity-0 translate-y-1.5 overflow-hidden !p-0 !border-transparent !shadow-none"
                        : "max-h-[420px] opacity-100 translate-y-0"
                )}
            >
                {actionsConfig.map((action) => (
                    <ActionButton key={action.id} {...action.props} />
                ))}
            </div>

            <div
                className={cn(
                    "flex h-8 items-center justify-center rounded-full border border-white/10 bg-black/28 backdrop-blur-md shadow-[0_10px_20px_-18px_rgba(0,0,0,0.9)] transition-all duration-[250ms] ease-in-out",
                    isCollapsed ? "w-9" : "w-[52px]"
                )}
            >
                <button
                    type="button"
                    onClick={() => setIsCollapsed((prev) => !prev)}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/8 text-white/65 hover:bg-white/14 hover:text-white transition-colors"
                    aria-label={isCollapsed ? (lang === 'en' ? 'Expand actions' : 'توسيع الإجراءات') : (lang === 'en' ? 'Collapse actions' : 'طي الإجراءات')}
                >
                    <ChevronLeftIcon className={cn("h-3.5 w-3.5 transition-transform duration-[250ms] ease-in-out", isCollapsed && "rotate-180")} />
                </button>
            </div>
        </div>
    );
};

export default InteractionRail;
