import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Post, PostAttachment } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { EllipsisIcon } from '../icons/EllipsisIcon.tsx';
import { EditIcon } from '../icons/EditIcon.tsx';
import { TrashIcon } from '../icons/TrashIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { useDeletePost } from '../../lib/hooks/useDeletePost.ts';
import { useRestorePost } from '../../lib/hooks/useRestorePost.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { AttachmentListV1, RenderSurface } from './AttachmentRendererV1.tsx';
import InteractionRail from './InteractionRail.tsx';
import EditPostModal from '../modals/EditPostModal.tsx';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal.tsx';
import ReportPostModal from '../modals/ReportPostModal.tsx';
import { LockIcon } from '../icons/LockIcon.tsx';
import { EyeOffIcon } from '../icons/EyeOffIcon.tsx';
import { UsersIcon } from '../icons/UsersIcon.tsx';
import { FlagIcon } from '../icons/FlagIcon.tsx';
import { QuoteIcon } from '../icons/QuoteIcon.tsx';
import { callCallableEndpoint } from '../../lib/callable.ts';
import { resolveCanonicalPostAttachments } from '../../types/socialAttachments.ts';

interface PostCardProps {
    post: Post;
    viewMode?: 'list' | 'flow' | 'discussion';
    onOpenDiscussion?: () => void;
    onOpenPostEntry?: () => void;
    onNewPost?: () => void;
    surface?: RenderSurface;
}

const toIsoTimestamp = (value: unknown): string => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'object' && value !== null) {
        const candidate = value as { toDate?: () => Date };
        if (typeof candidate.toDate === 'function') {
            return candidate.toDate().toISOString();
        }
    }
    return '';
};

const isCanonicalQuoteId = (value: string | undefined): boolean =>
    typeof value === 'string' && /^cq_[A-Za-z0-9_-]+$/.test(value.trim());

const PostCard: React.FC<PostCardProps> = ({ post, viewMode = 'list', onOpenDiscussion, onOpenPostEntry, surface = 'feed' }) => {
    const { lang, isRTL } = useI18n();
    const { user } = useAuth();
    const { navigate, currentView } = useNavigation();
    
    const isRestricted = post?.visibility === 'restricted';
    const isDeleted = post?.status === 'deleted';
    const currentUserId = typeof user?.uid === 'string' ? user.uid.trim() : '';
    const postAuthorId = typeof post?.authorId === 'string' ? post.authorId.trim() : '';
    const isOwner = currentUserId.length > 0 && postAuthorId.length > 0 && currentUserId === postAuthorId;
    const editedAt = toIsoTimestamp(
        (post as Post & { lastEditedAt?: unknown })?.editedAt ||
        (post as Post & { lastEditedAt?: unknown })?.lastEditedAt
    );
    const showEditedBadge = editedAt.length > 0;
    const editedLabel = lang === 'en' ? 'Edited' : 'معدل';
    const hasMediaAttachment = useMemo(() => {
        const refs = post?.content?.attachments || [];
        return refs.some((attachment) => ['IMAGE', 'AUDIO', 'VIDEO'].includes(String(attachment?.type || '').toUpperCase()));
    }, [post]);

    const displayBody = useMemo(() => {
        if (isDeleted && !isOwner) return lang === 'en' ? "This content is unavailable" : "هذا المحتوى غير متوفر";
        const rawText = post?.content?.text || "";
        if (!hasMediaAttachment) return rawText;
        return rawText.replace(/^\s*\/\/\s*/, '');
    }, [post, isDeleted, isOwner, lang, hasMediaAttachment]);

    const authorName = useMemo(() => {
        if (isRestricted && !isOwner) return lang === 'en' ? "Restricted User" : "مستخدم مقيد";
        return post?.authorName || (lang === 'en' ? "Unknown User" : "مستخدم غير معروف");
    }, [post, isRestricted, isOwner, lang]);

    const authorAvatar = useMemo(() => {
        if (isRestricted && !isOwner) return "https://api.dicebear.com/7.x/initials/svg?seed=R";
        return post?.authorAvatar || "https://api.dicebear.com/7.x/initials/svg?seed=U";
    }, [post, isRestricted, isOwner]);

    const { mutate: deletePost, isPending: isDeleting } = useDeletePost();
    const { mutate: restorePost, isPending: isRestoring } = useRestorePost();

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isBodyExpanded, setIsBodyExpanded] = useState(false);
    const [viewportHeight, setViewportHeight] = useState<number>(
        typeof window !== 'undefined' ? window.innerHeight : 800
    );
    const menuRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const viewTrackedRef = useRef(false);

    useEffect(() => {
        if (!postAuthorId) {
            console.warn('[SOCIAL][POSTCARD_OWNER_MISSING_AUTHOR_ID]', {
                postId: post?.id || null
            });
        }
    }, [post?.id, postAuthorId]);

    useEffect(() => {
        setIsBodyExpanded(false);
    }, [post?.id]);

    useEffect(() => {
        if (viewMode !== 'flow' || viewTrackedRef.current || !post?.id || isDeleted) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    viewTrackedRef.current = true;
                    callCallableEndpoint<{ postId: string }, { success: boolean }>(
                        'incrementPostView',
                        { postId: post.id }
                    ).catch(() => {});
                    observer.disconnect();
                }
            },
            { threshold: 0.5 }
        );

        if (cardRef.current) observer.observe(cardRef.current);
        return () => observer.disconnect();
    }, [post?.id, viewMode, isDeleted]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isMenuOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isMenuOpen]);

    useEffect(() => {
        if (viewMode !== 'flow' || typeof window === 'undefined') return;

        const handleResize = () => {
            setViewportHeight(window.innerHeight || 800);
        };

        window.addEventListener('resize', handleResize, { passive: true });
        return () => window.removeEventListener('resize', handleResize);
    }, [viewMode]);

    const timeAgo = (dateString: string) => {
        if (!dateString) return "...";
        const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
        let interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "d" : "ي");
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "h" : "س");
        return Math.floor(seconds / 60) + (lang === 'en' ? "m" : "د");
    }

    const bodyLength = displayBody.trim().length;
    const isLongText = bodyLength > 280;
    const shouldShowExpandHint =
        viewMode === 'list' &&
        bodyLength > 0 &&
        !isDeleted &&
        isLongText;

    const flowTextClampClass = useMemo(() => {
        const textLength = displayBody.trim().length;
        if (textLength <= 140) return '';

        const isTallViewport = viewportHeight >= 920;
        const isMediumViewport = viewportHeight >= 780;

        if (textLength <= 320) {
            if (isTallViewport) return 'line-clamp-7';
            if (isMediumViewport) return 'line-clamp-6';
            return 'line-clamp-5';
        }

        if (textLength <= 520) {
            if (isTallViewport) return 'line-clamp-6';
            return 'line-clamp-5';
        }

        return isTallViewport ? 'line-clamp-6' : 'line-clamp-5';
    }, [displayBody, viewportHeight]);

    const flowTextSizeClass = useMemo(() => {
        const textLength = displayBody.trim().length;
        if (textLength > 520) return "text-[1.67rem] md:text-[1.98rem]";
        if (textLength > 360) return "text-[1.74rem] md:text-[2.06rem]";
        return "text-[1.85rem] md:text-[2.2rem]";
    }, [displayBody]);

    const resolvedAttachments = useMemo(() => {
        return resolveCanonicalPostAttachments(post);
    }, [post]);

    const quoteAttachments = useMemo(
        () =>
            resolvedAttachments.filter(
                (attachment): attachment is Extract<PostAttachment, { type: 'quote' }> =>
                    typeof attachment === 'object' &&
                    attachment !== null &&
                    'type' in attachment &&
                    attachment.type === 'quote'
            ),
        [resolvedAttachments]
    );

    const nonQuoteAttachments = useMemo(
        () =>
            resolvedAttachments.filter(
                (attachment) =>
                    !(
                        typeof attachment === 'object' &&
                        attachment !== null &&
                        'type' in attachment &&
                        attachment.type === 'quote'
                    )
            ),
        [resolvedAttachments]
    );
    const hasQuoteAttachments = quoteAttachments.length > 0;
    const hasNonQuoteAttachments = nonQuoteAttachments.length > 0;
    const hasRenderableAttachments = hasQuoteAttachments || hasNonQuoteAttachments;
    const hasDisplayBody = bodyLength > 0;

    const handleOpenQuoteAttachment = (attachment: Extract<PostAttachment, { type: 'quote' }>) => {
        const quoteId = attachment.quoteId.trim();
        if (!quoteId) return;

        const params: Record<string, unknown> = {
            quoteId,
            from: currentView,
        };
        if (!isCanonicalQuoteId(quoteId) && attachment.quoteOwnerId) {
            params.ownerId = attachment.quoteOwnerId;
        }

        navigate({
            type: 'immersive',
            id: 'quoteDetails',
            params,
        });
    };

    const VisibilityBadge = () => {
        if (post?.visibility === 'public') return null;
        let Icon = LockIcon;
        let label = '';
        if (post?.visibility === 'followers') { label = lang === 'en' ? 'Followers' : 'المتابعون'; Icon = UsersIcon; }
        else if (post?.visibility === 'restricted') { label = lang === 'en' ? 'Restricted' : 'محدود'; Icon = EyeOffIcon; }
        else { label = lang === 'en' ? 'Private' : 'خاص'; Icon = LockIcon; }

        return (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10">
                <Icon className="h-3 w-3 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{label}</span>
            </div>
        );
    };

    const openDiscussion = () => {
        if (!post?.id) return;
        if (onOpenDiscussion) {
            onOpenDiscussion?.();
            return;
        }
        if (viewMode === 'list' && onOpenPostEntry) {
            onOpenPostEntry();
            return;
        }

        navigate({
            type: 'immersive',
            id: 'postDiscussion',
            params: {
                postId: post.id,
                from: {
                    type: 'tab',
                    id: 'social',
                    params: { highlightPostId: post.id },
                },
            },
        });
    };

    const handleOpenAuthorProfile = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!post?.authorId) return;
        if (isRestricted && !isOwner) return;

        navigate({
            type: 'immersive',
            id: 'profile',
            params: {
                userId: post.authorId,
                from: currentView
            }
        });
    };

    const handleBodyIntent = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (viewMode === 'discussion') return; 
        if (!post?.content?.text) return;
        if (isLongText && !isBodyExpanded) {
            setIsBodyExpanded(true);
            return;
        }
        openDiscussion();
    };

    if (isDeleted && isOwner) {
        return (
            <GlassCard className="!p-4 border-dashed border-slate-600 opacity-60">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <TrashIcon className="h-5 w-5 text-slate-500" />
                        <BilingualText role="Body" className="!text-sm italic text-slate-500">
                            {lang === 'en' ? 'You deleted this post' : 'لقد قمت بحذف هذا المنشور'}
                        </BilingualText>
                    </div>
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); restorePost(post.id); }} disabled={isRestoring}>
                        {isRestoring ? <LoadingSpinner className="h-4 w-4" /> : (lang === 'en' ? 'Undo' : 'تراجع')}
                    </Button>
                </div>
            </GlassCard>
        );
    }

    if (viewMode === 'flow') {
        return (
            <div ref={cardRef} className="relative h-full w-full flex-shrink-0 text-white overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-[#040a12] via-[#07131f] to-[#02060d]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,119,182,0.16),transparent_50%)]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/24 to-black/10" />
                <div className="relative z-10 flex h-full flex-col">
                    <header
                        className="pl-5 md:pl-7 pr-[108px] md:pr-[120px]"
                        style={{ paddingTop: 'calc(var(--social-top-chrome-offset, env(safe-area-inset-top) + 72px) + 14px)' }}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3 cursor-pointer min-w-0" onClick={handleOpenAuthorProfile}>
                                <img src={authorAvatar} alt={authorName} className="h-8 w-8 rounded-full border border-white/20 bg-slate-800" />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <BilingualText className="font-semibold text-[12px] !text-white/74 drop-shadow-sm truncate">
                                            {post?.authorHandle || '@user'}
                                        </BilingualText>
                                        <VisibilityBadge />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <BilingualText role="Caption" className="!text-white/44 text-[10px] drop-shadow-sm">
                                            {authorName} · {timeAgo(post?.timestamps?.createdAt || "")}
                                        </BilingualText>
                                        {showEditedBadge && (
                                            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/38">{editedLabel}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            {isOwner && (
                                <div className="relative z-[70]" ref={menuRef}>
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}
                                        className="p-1.5 rounded-full bg-black/18 border border-white/10 text-white/58 hover:text-white/82 hover:bg-black/26 transition-colors"
                                        aria-label={lang === 'en' ? 'Post actions' : 'إجراءات المنشور'}
                                    >
                                        <EllipsisIcon className="h-4 w-4 rotate-90" />
                                    </button>
                                    {isMenuOpen && (
                                        <div className={cn("absolute top-full z-[60] mt-1 w-44 bg-slate-900 border border-white/10 rounded-lg shadow-xl py-1 overflow-hidden", isRTL ? "left-0" : "right-0")}>
                                            <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setEditModalOpen(true); }} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 flex items-center gap-2"><EditIcon className="h-4 w-4 opacity-70" />{lang === 'en' ? 'Edit' : 'تعديل'}</button>
                                            <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsDeleteModalOpen(true); }} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"><TrashIcon className="h-4 w-4 opacity-70" />{lang === 'en' ? 'Delete' : 'حذف'}</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </header>

                    <div
                        className="flex-1 flex flex-col pl-5 md:pl-7 pr-[108px] md:pr-[120px] pt-4 md:pt-5"
                        style={{ paddingBottom: 'max(26vh, calc(var(--bottom-nav-height, 66px) + 16px))' }}
                    >
                        <div onClick={handleBodyIntent} className="cursor-pointer active:opacity-80 transition-opacity mx-auto w-full max-w-[760px] text-center mt-2">
                            <BilingualText
                                role="Body"
                                className={cn(
                                    "font-serif leading-[1.55] md:leading-[1.58] drop-shadow-md tracking-[0.01em] text-white/95",
                                    !isBodyExpanded && flowTextClampClass,
                                    flowTextSizeClass
                                )}
                            >
                                {displayBody}
                            </BilingualText>
                        </div>
                        <div className="w-full max-w-[760px] mx-auto space-y-3 mt-6">
                            {quoteAttachments.map((attachment) => (
                                <button
                                    key={`quote:${attachment.quoteId}`}
                                    type="button"
                                    onClick={() => handleOpenQuoteAttachment(attachment)}
                                    className="block w-full text-left"
                                >
                                    <GlassCard className="!p-4 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 rounded-xl bg-accent/10 p-2 text-accent">
                                                <QuoteIcon className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <BilingualText className="font-semibold">
                                                    {lang === 'en' ? 'Quote' : 'اقتباس'}
                                                </BilingualText>
                                                {'quoteText' in attachment && attachment.quoteText ? (
                                                    <BilingualText role="Quote" className="mt-1 !text-sm line-clamp-3">
                                                        "{attachment.quoteText}"
                                                    </BilingualText>
                                                ) : null}
                                            </div>
                                        </div>
                                    </GlassCard>
                                </button>
                            ))}
                            {nonQuoteAttachments.length > 0 ? (
                                <AttachmentListV1 attachments={nonQuoteAttachments} surface={surface === 'feed' ? 'read' : surface} />
                            ) : null}
                        </div>
                        <div className="mx-auto w-full max-w-[760px]">
                            <InteractionRail post={post} onOpenDiscussion={openDiscussion} className="border-white/10 pt-4" />
                        </div>
                    </div>
                </div>
                {isEditModalOpen && post && <EditPostModal post={post} isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} />}
                {isDeleteModalOpen && post && <ConfirmDeleteModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={() => deletePost({ postId: post.id })} isDeleting={isDeleting} itemName={post.content.text || 'this post'} itemType="post" />}
            </div>
        );
    }

    if (viewMode === 'discussion') {
        return (
            <div className="flex items-start gap-3 py-1">
                <button
                    type="button"
                    onClick={handleOpenAuthorProfile}
                    className="flex-shrink-0"
                    aria-label={lang === 'en' ? 'Open profile' : 'فتح الملف الشخصي'}
                >
                    <img src={authorAvatar} alt={authorName} className="h-10 w-10 rounded-full object-cover border border-black/5 dark:border-white/10" />
                </button>
                <div className="flex-grow min-w-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-2 overflow-hidden">
                            <button type="button" onClick={handleOpenAuthorProfile} className="truncate">
                                <BilingualText className="font-bold text-sm truncate">{authorName}</BilingualText>
                            </button>
                            <BilingualText role="Caption" className="truncate !text-[11px] opacity-60">
                                {post?.authorHandle} • {timeAgo(post?.timestamps?.createdAt || "")}
                            </BilingualText>
                            {showEditedBadge && (
                                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{editedLabel}</span>
                            )}
                        </div>
                        {isOwner && (
                            <button onClick={() => setEditModalOpen(true)} className="p-1 text-slate-400 hover:text-accent transition-colors">
                                <EditIcon className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                    {/* Discussion view shows full text */}
                    <BilingualText role="Body" className="mt-1 !text-[15px] leading-relaxed text-slate-800 dark:text-white/90">
                        {displayBody}
                    </BilingualText>
                    <div className="mt-2 scale-95 origin-top-left opacity-90 space-y-3">
                        {quoteAttachments.map((attachment) => (
                            <button
                                key={`quote:${attachment.quoteId}`}
                                type="button"
                                onClick={() => handleOpenQuoteAttachment(attachment)}
                                className="block w-full text-left"
                            >
                                <GlassCard className="!p-4 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 rounded-xl bg-accent/10 p-2 text-accent">
                                            <QuoteIcon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <BilingualText className="font-semibold">
                                                {lang === 'en' ? 'Quote' : 'اقتباس'}
                                            </BilingualText>
                                            {'quoteText' in attachment && attachment.quoteText ? (
                                                <BilingualText role="Quote" className="mt-1 !text-sm line-clamp-3">
                                                    "{attachment.quoteText}"
                                                </BilingualText>
                                            ) : null}
                                        </div>
                                    </div>
                                </GlassCard>
                            </button>
                        ))}
                        {nonQuoteAttachments.length > 0 ? (
                            <AttachmentListV1 attachments={nonQuoteAttachments} surface="read" />
                        ) : null}
                    </div>
                </div>
                {isEditModalOpen && post && <EditPostModal post={post} isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} />}
            </div>
        );
    }

    return (
        <GlassCard className="relative overflow-hidden !border-transparent !bg-transparent !p-0 !shadow-none">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top,rgba(0,119,182,0.05),transparent_56%)]" />
            <div className="relative z-10">
                <header className={cn("flex items-start justify-between gap-3 px-4 pt-4 md:px-5 md:pt-5", isRTL && "text-right")}>
                    <div className={cn("flex min-w-0 items-center gap-3", isRTL && "flex-row-reverse")}>
                        <button
                            type="button"
                            onClick={handleOpenAuthorProfile}
                            className="flex-shrink-0"
                            aria-label={lang === 'en' ? 'Open profile' : 'فتح الملف الشخصي'}
                        >
                            <img src={authorAvatar} alt={authorName} className="h-12 w-12 rounded-full bg-slate-800" />
                        </button>
                        <div className="min-w-0 flex-grow">
                            <div className={cn("flex items-baseline gap-2", isRTL && "flex-row-reverse")}>
                                <button type="button" onClick={handleOpenAuthorProfile} className="min-w-0">
                                    <BilingualText className="truncate font-semibold !text-[15px] text-white/90">{authorName}</BilingualText>
                                </button>
                                <BilingualText role="Caption" className="truncate !text-[11px] text-white/55">{(post?.authorHandle || "@user")} · {timeAgo(post?.timestamps?.createdAt || "")}</BilingualText>
                                {showEditedBadge && (
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{editedLabel}</span>
                                )}
                            </div>
                            <div className={cn("mt-0.5 flex items-center gap-2", isRTL && "flex-row-reverse")}>
                                <VisibilityBadge />
                            </div>
                        </div>
                    </div>
                    <div className="relative" ref={menuRef}>
                        <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }} className="p-1 -mr-2 text-slate-400 hover:text-slate-100">
                            <EllipsisIcon className="h-5 w-5 rotate-90" />
                        </button>
                        {isMenuOpen && (
                            <div className={cn("absolute top-full z-30 mt-1 w-44 bg-slate-900 border border-white/10 rounded-lg shadow-xl py-1 overflow-hidden", isRTL ? "left-0" : "right-0")}>
                                {isOwner ? (
                                    <>
                                        <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setEditModalOpen(true); }} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 flex items-center gap-2"><EditIcon className="h-4 w-4 opacity-70" />{lang === 'en' ? 'Edit' : 'تعديل'}</button>
                                        <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsDeleteModalOpen(true); }} className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"><TrashIcon className="h-4 w-4 opacity-70" />{lang === 'en' ? 'Delete' : 'حذف'}</button>
                                    </>
                                ) : (
                                    <button onClick={(e) => { e.stopPropagation(); setIsMenuOpen(false); setIsReportModalOpen(true); }} className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 flex items-center gap-2"><FlagIcon className="h-4 w-4 opacity-70" />{lang === 'en' ? 'Report' : 'إبلاغ'}</button>
                                )}
                            </div>
                        )}
                    </div>
                </header>

                {hasNonQuoteAttachments && (
                    <div className="mt-3">
                        <AttachmentListV1 attachments={nonQuoteAttachments} surface={surface === 'feed' ? 'read' : surface} />
                    </div>
                )}

                {hasQuoteAttachments && (
                    <div className={cn("space-y-3 px-4 md:px-5", hasNonQuoteAttachments ? "mt-3" : "mt-4")}>
                        {quoteAttachments.map((attachment) => (
                            <button
                                key={`quote:${attachment.quoteId}`}
                                type="button"
                                onClick={() => handleOpenQuoteAttachment(attachment)}
                                className="block w-full text-left"
                            >
                                <GlassCard className="!p-4 hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 rounded-xl bg-accent/10 p-2 text-accent">
                                            <QuoteIcon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <BilingualText className="font-semibold">
                                                {lang === 'en' ? 'Quote' : 'اقتباس'}
                                            </BilingualText>
                                            {'quoteText' in attachment && attachment.quoteText ? (
                                                <BilingualText role="Quote" className="mt-1 !text-sm line-clamp-3">
                                                    "{attachment.quoteText}"
                                                </BilingualText>
                                            ) : null}
                                        </div>
                                    </div>
                                </GlassCard>
                            </button>
                        ))}
                    </div>
                )}

                {hasDisplayBody && (
                    <div onClick={handleBodyIntent} className={cn("cursor-pointer px-4 active:opacity-80 transition-opacity md:px-5", hasRenderableAttachments ? "mt-4" : "mt-3")}>
                        <BilingualText role="Body" className={cn(
                            "font-serif !text-[1.2rem] leading-[1.6] text-white/92",
                            shouldShowExpandHint && !isBodyExpanded && "line-clamp-3"
                        )}>
                            {displayBody}
                        </BilingualText>
                    </div>
                )}
                {shouldShowExpandHint && (
                    <BilingualText role="Caption" className="mt-2 px-4 !text-[11px] text-white/42 md:px-5">
                        {isBodyExpanded
                            ? (lang === 'en' ? 'Tap again to open discussion' : 'اضغط مرة أخرى لفتح النقاش')
                            : (lang === 'en' ? 'Tap to continue reading' : 'اضغط لمتابعة القراءة')}
                    </BilingualText>
                )}

                <div className="px-4 pb-4 md:px-5 md:pb-5">
                    <InteractionRail post={post} onOpenDiscussion={openDiscussion} className="border-white/[0.05]" />
                </div>
            </div>
            {isEditModalOpen && post && <EditPostModal post={post} isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} />}
            {isDeleteModalOpen && post && <ConfirmDeleteModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={() => deletePost({ postId: post.id })} isDeleting={isDeleting} itemName={post.content.text || 'this post'} itemType="post" />}
            {isReportModalOpen && post && <ReportPostModal postId={post.id} isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} />}
        </GlassCard>
    );
};

export default PostCard;
