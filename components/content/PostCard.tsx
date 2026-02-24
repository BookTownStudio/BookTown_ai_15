import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Post, PostAttachment } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { LikeIcon } from '../icons/LikeIcon.tsx';
import { ChatIcon } from '../icons/ChatIcon.tsx';
import { RepostIcon } from '../icons/RepostIcon.tsx';
import { ShareIcon } from '../icons/ShareIcon.tsx';
import { BookmarkIcon } from '../icons/BookmarkIcon.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { EllipsisIcon } from '../icons/EllipsisIcon.tsx';
import { EditIcon } from '../icons/EditIcon.tsx';
import { TrashIcon } from '../icons/TrashIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { usePostInteractions } from '../../lib/hooks/usePostInteractions.ts';
import { useDeletePost } from '../../lib/hooks/useDeletePost.ts';
import { useRestorePost } from '../../lib/hooks/useRestorePost.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { AttachmentListV1, RenderSurface } from './AttachmentRendererV1.tsx';
import EditPostModal from '../modals/EditPostModal.tsx';
import ConfirmDeleteModal from '../modals/ConfirmDeleteModal.tsx';
import ReportPostModal from '../modals/ReportPostModal.tsx';
import { LockIcon } from '../icons/LockIcon.tsx';
import { EyeOffIcon } from '../icons/EyeOffIcon.tsx';
import { UsersIcon } from '../icons/UsersIcon.tsx';
import { FlagIcon } from '../icons/FlagIcon.tsx';
import { callCallableEndpoint } from '../../lib/callable.ts';

interface PostCardProps {
    post: Post;
    viewMode?: 'list' | 'flow' | 'discussion';
    onOpenDiscussion?: () => void;
    onNewPost?: () => void;
    surface?: RenderSurface;
}

type StructuredEntityType = 'book' | 'author' | 'quote' | 'shelf' | 'venue';
type HydratedEntityPayload = {
    type?: string;
    id?: string;
    ownerId?: string;
    data?: Record<string, unknown>;
} | null;

const normalizeStructuredType = (value: unknown): StructuredEntityType | null => {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    if (
        normalized === 'book' ||
        normalized === 'author' ||
        normalized === 'quote' ||
        normalized === 'shelf' ||
        normalized === 'venue'
    ) {
        return normalized;
    }
    return null;
};

const resolveAttachmentFromHydratedEntity = (
    refTypeRaw: unknown,
    refIdRaw: unknown,
    hydratedEntity: HydratedEntityPayload,
    fallbackOwnerId: string
): PostAttachment | null => {
    const refType = normalizeStructuredType(refTypeRaw);
    const refId = typeof refIdRaw === 'string' ? refIdRaw.trim() : '';
    if (!refType || !refId || !hydratedEntity) return null;

    const hydratedType = normalizeStructuredType(hydratedEntity.type);
    const hydratedId = typeof hydratedEntity.id === 'string' ? hydratedEntity.id.trim() : '';
    if (hydratedType !== refType || hydratedId !== refId) {
        return null;
    }

    const data =
        hydratedEntity.data && typeof hydratedEntity.data === 'object'
            ? hydratedEntity.data
            : {};

    if (refType === 'book') {
        const titleEn = typeof data.titleEn === 'string' ? data.titleEn : '';
        const titleAr = typeof data.titleAr === 'string' ? data.titleAr : '';
        const authorEn = typeof data.authorEn === 'string' ? data.authorEn : '';
        const authorAr = typeof data.authorAr === 'string' ? data.authorAr : '';
        const coverUrl = typeof data.coverUrl === 'string' ? data.coverUrl : '';
        const ratingRaw = typeof data.rating === 'number' ? data.rating : 0;

        return {
            type: 'book',
            bookId: refId,
            bookTitle: titleEn || titleAr || 'Book',
            bookAuthor: authorEn || authorAr || '',
            bookCover: coverUrl,
            bookRating: Number.isFinite(ratingRaw) ? ratingRaw : 0,
        };
    }

    if (refType === 'quote') {
        const ownerIdFromEntity =
            typeof hydratedEntity.ownerId === 'string' && hydratedEntity.ownerId.trim().length > 0
                ? hydratedEntity.ownerId.trim()
                : typeof data.ownerId === 'string' && data.ownerId.trim().length > 0
                    ? data.ownerId.trim()
                    : fallbackOwnerId;
        const quoteText =
            typeof data.textEn === 'string'
                ? data.textEn
                : typeof data.textAr === 'string'
                    ? data.textAr
                    : '';

        return ({
            type: 'quote',
            quoteId: refId,
            quoteOwnerId: ownerIdFromEntity || fallbackOwnerId,
            quoteText,
        } as unknown) as PostAttachment;
    }

    if (refType === 'author') {
        return {
            type: 'author',
            authorId: refId,
            authorName:
                (typeof data.nameEn === 'string' ? data.nameEn : '') ||
                (typeof data.nameAr === 'string' ? data.nameAr : '') ||
                '',
            authorPhoto: typeof data.avatarUrl === 'string' ? data.avatarUrl : '',
            authorCountry:
                (typeof data.countryEn === 'string' ? data.countryEn : '') ||
                (typeof data.countryAr === 'string' ? data.countryAr : '') ||
                undefined,
        };
    }

    if (refType === 'shelf') {
        const covers = Array.isArray(data.covers)
            ? data.covers.filter((cover): cover is string => typeof cover === 'string')
            : [];
        const bookCount = typeof data.bookCount === 'number' && Number.isFinite(data.bookCount)
            ? Math.max(0, Math.trunc(data.bookCount))
            : 0;
        return {
            type: 'shelf',
            shelfId: refId,
            ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
            shelfName:
                (typeof data.titleEn === 'string' ? data.titleEn : '') ||
                (typeof data.titleAr === 'string' ? data.titleAr : '') ||
                '',
            bookCount,
            covers,
        };
    }

    if (refType === 'venue') {
        return {
            type: 'venue',
            venueId: refId,
        };
    }

    return null;
};

const PostCard: React.FC<PostCardProps> = ({ post, viewMode = 'list', onOpenDiscussion, surface = 'feed' }) => {
    const { lang, isRTL } = useI18n();
    const { user } = useAuth();
    const { navigate, currentView, navigateToSocialAndHighlight } = useNavigation();
    
    const isRestricted = post?.visibility === 'restricted';
    const isDeleted = post?.status === 'deleted';
    const isOwner = user?.uid === post?.authorId;

    const displayBody = useMemo(() => {
        if (isDeleted && !isOwner) return lang === 'en' ? "This content is unavailable" : "هذا المحتوى غير متوفر";
        return post?.content?.text || "";
    }, [post, isDeleted, isOwner, lang]);

    const authorName = useMemo(() => {
        if (isRestricted && !isOwner) return lang === 'en' ? "Restricted User" : "مستخدم مقيد";
        return post?.authorName || (lang === 'en' ? "Unknown User" : "مستخدم غير معروف");
    }, [post, isRestricted, isOwner, lang]);

    const authorAvatar = useMemo(() => {
        if (isRestricted && !isOwner) return "https://api.dicebear.com/7.x/initials/svg?seed=R";
        return post?.authorAvatar || "https://api.dicebear.com/7.x/initials/svg?seed=U";
    }, [post, isRestricted, isOwner]);

    const { 
        isLiked, isBookmarked, isReposted, 
        counts, actions 
    } = usePostInteractions(post?.id, post || undefined);

    const { mutate: deletePost, isLoading: isDeleting } = useDeletePost();
    const { mutate: restorePost, isLoading: isRestoring } = useRestorePost();

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditModalOpen, setEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);
    const viewTrackedRef = useRef(false);

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

    const timeAgo = (dateString: string) => {
        if (!dateString) return "...";
        const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
        let interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "d" : "ي");
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "h" : "س");
        return Math.floor(seconds / 60) + (lang === 'en' ? "m" : "د");
    }

    const resolvedAttachments = useMemo(() => {
        const refs = post?.content?.attachments || [];
        if (refs.length === 0) return [];

        const hydratedEntity =
            ((post as unknown as { hydratedEntity?: HydratedEntityPayload }).hydratedEntity ?? null);
        const hydratedType = normalizeStructuredType(hydratedEntity?.type);
        const hydratedId = typeof hydratedEntity?.id === 'string' ? hydratedEntity.id.trim() : '';
        const postPrimaryType = normalizeStructuredType(
            (post as unknown as { primaryEntityType?: unknown }).primaryEntityType
        );
        const postPrimaryId =
            typeof (post as unknown as { primaryEntityId?: unknown }).primaryEntityId === 'string'
                ? ((post as unknown as { primaryEntityId: string }).primaryEntityId || '').trim()
                : '';

        return refs.map(ref => {
            const refAttachmentId =
                typeof ref.attachmentId === 'string' ? ref.attachmentId.trim() : '';
            const refType = normalizeStructuredType(ref.type);
            const refEntityId =
                typeof (ref as { entityId?: unknown }).entityId === 'string'
                    ? ((ref as { entityId: string }).entityId || '').trim()
                    : '';
            const inferredFromHydrated =
                refType && hydratedType === refType ? hydratedId : '';
            const inferredFromPrimary =
                refType && postPrimaryType === refType ? postPrimaryId : '';
            const resolvedEntityId =
                refEntityId || inferredFromHydrated || inferredFromPrimary || refAttachmentId;

            const hydrated = post?.attachments?.find(a => 
                ('attachmentId' in a ? a.attachmentId : 'legacy') === refAttachmentId ||
                ('attachmentId' in a ? a.attachmentId : 'legacy') === resolvedEntityId
            );

            if (hydrated) {
                return hydrated;
            }

            const structured = resolveAttachmentFromHydratedEntity(
                ref.type,
                resolvedEntityId,
                hydratedEntity,
                post?.authorId || ''
            );
            if (structured) {
                return structured;
            }

            if (refType && resolvedEntityId) {
                const hydratedData =
                    hydratedType === refType && hydratedId === resolvedEntityId && hydratedEntity?.data
                        ? hydratedEntity.data
                        : null;

                if (refType === 'book') {
                    return {
                        type: 'book',
                        bookId: resolvedEntityId,
                        bookTitle: 'Book',
                        bookAuthor: '',
                        bookCover: '',
                        bookRating: 0,
                    };
                }

                if (refType === 'quote') {
                    const ownerId =
                        (typeof (ref as { entityOwnerId?: unknown }).entityOwnerId === 'string'
                            ? (ref as { entityOwnerId: string }).entityOwnerId.trim()
                            : '') ||
                        (typeof (ref as { quoteOwnerId?: unknown }).quoteOwnerId === 'string'
                            ? (ref as { quoteOwnerId: string }).quoteOwnerId.trim()
                            : '') ||
                        (typeof hydratedEntity?.ownerId === 'string' ? hydratedEntity.ownerId.trim() : '') ||
                        (post?.authorId || '');
                    return {
                        type: 'quote',
                        quoteId: resolvedEntityId,
                        quoteOwnerId: ownerId,
                    };
                }

                if (refType === 'author') {
                    const authorName =
                        (hydratedData && typeof hydratedData.nameEn === 'string' ? hydratedData.nameEn : '') ||
                        (hydratedData && typeof hydratedData.nameAr === 'string' ? hydratedData.nameAr : '') ||
                        'Author';
                    const authorPhoto =
                        hydratedData && typeof hydratedData.avatarUrl === 'string'
                            ? hydratedData.avatarUrl
                            : '';
                    return {
                        type: 'author',
                        authorId: resolvedEntityId,
                        authorName,
                        authorPhoto,
                    };
                }

                if (refType === 'shelf') {
                    const shelfName =
                        (hydratedData && typeof hydratedData.titleEn === 'string' ? hydratedData.titleEn : '') ||
                        (hydratedData && typeof hydratedData.titleAr === 'string' ? hydratedData.titleAr : '') ||
                        'Shelf';
                    const hydratedBookCount =
                        hydratedData && typeof hydratedData.bookCount === 'number' && Number.isFinite(hydratedData.bookCount)
                            ? Math.max(0, Math.trunc(hydratedData.bookCount))
                            : 0;
                    const ownerId =
                        (typeof (ref as { ownerId?: unknown }).ownerId === 'string'
                            ? (ref as { ownerId: string }).ownerId.trim()
                            : '') ||
                        (hydratedData && typeof hydratedData.ownerId === 'string'
                            ? hydratedData.ownerId
                            : '') ||
                        (post?.authorId || '');
                    return {
                        type: 'shelf',
                        shelfId: resolvedEntityId,
                        ownerId,
                        shelfName,
                        bookCount: hydratedBookCount,
                        covers: [],
                    };
                }

                if (refType === 'venue') {
                    return {
                        type: 'venue',
                        venueId: resolvedEntityId,
                    };
                }
            }

            return { type: ref.type, attachmentId: refAttachmentId || resolvedEntityId };
        }) as PostAttachment[];
    }, [post]);

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

    const handleCommentIntent = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (viewMode === 'list') {
            navigateToSocialAndHighlight(post.id);
        } else {
            onOpenDiscussion?.();
        }
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

    /**
     * handleOpenTextOverlay
     * Implementation of POST_TEXT_OVERLAY_VIEW_V1 trigger with POST_TEXT_OVERLAY_GUARD_V1 safety.
     */
    const handleOpenTextOverlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (viewMode === 'discussion') return; 

        // GUARD: missing_text -> overlay_not_opened
        if (!post?.content?.text) return;

        navigate({
            type: 'immersive',
            id: 'postTextOverlay',
            params: {
                post: post, // Passing strictly for id, text, identity fields as per guard policy
                from: currentView
            }
        });
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
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
                <div className="absolute top-32 left-0 right-0 z-20 px-6 flex items-center justify-between">
                    <div className="flex items-center gap-3 cursor-pointer" onClick={handleOpenAuthorProfile}>
                        <img src={authorAvatar} alt={authorName} className="h-10 w-10 rounded-full border-2 border-white/30 bg-slate-800" />
                        <div>
                            <div className="flex items-center gap-2">
                                <BilingualText className="font-bold !text-white drop-shadow-md">{authorName}</BilingualText>
                                <VisibilityBadge />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <BilingualText role="Caption" className="!text-white/80 drop-shadow-md">{(post?.authorHandle || "@user")} · {timeAgo(post?.timestamps?.createdAt || "")}</BilingualText>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="relative z-10 flex flex-col h-full justify-center items-center p-8 pr-24 text-center">
                    {/* POST_COMPOSER_DRAFT_V1: Truncate to 3 lines in feed modes. Click triggers overlay. */}
                    <div onClick={handleOpenTextOverlay} className="cursor-pointer active:opacity-80 transition-opacity">
                        <BilingualText role="Body" className="text-xl max-w-lg drop-shadow-sm line-clamp-3">{displayBody}</BilingualText>
                    </div>
                    <div className="w-full max-md mt-6 min-h-[1px]">
                        <AttachmentListV1 attachments={resolvedAttachments} surface={surface} />
                    </div>
                </div>
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
                    <div className="mt-2 scale-95 origin-top-left opacity-90">
                        <AttachmentListV1 attachments={resolvedAttachments} surface="read" />
                    </div>
                </div>
                {isEditModalOpen && post && <EditPostModal post={post} isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} />}
            </div>
        );
    }

    return (
        <GlassCard className="!p-4 relative">
            <div className={`flex items-start gap-4 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                <button
                    type="button"
                    onClick={handleOpenAuthorProfile}
                    className="flex-shrink-0"
                    aria-label={lang === 'en' ? 'Open profile' : 'فتح الملف الشخصي'}
                >
                    <img src={authorAvatar} alt={authorName} className="h-12 w-12 rounded-full bg-slate-800" />
                </button>
                <div className="flex-grow">
                    <div className="flex justify-between items-start">
                        <div className="flex-grow text-left">
                            <div className={`flex items-baseline gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                                <button type="button" onClick={handleOpenAuthorProfile}>
                                    <BilingualText className="font-bold">{authorName}</BilingualText>
                                </button>
                                <BilingualText role="Caption">{(post?.authorHandle || "@user")} · {timeAgo(post?.timestamps?.createdAt || "")}</BilingualText>
                                <VisibilityBadge />
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
                    </div>
                    {/* POST_COMPOSER_DRAFT_V1: Truncate to 3 lines in list mode as well. Click triggers overlay. */}
                    <div onClick={handleOpenTextOverlay} className="cursor-pointer active:opacity-80 transition-opacity">
                        <BilingualText role="Body" className="mt-1 line-clamp-3">{displayBody}</BilingualText>
                    </div>
                    <div className="min-h-[1px] mt-3">
                         <AttachmentListV1 attachments={resolvedAttachments} surface={surface} />
                    </div>
                    <div className={`mt-3 flex items-center justify-between text-slate-500 dark:text-white/60 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                        <Button variant="ghost" className="!text-inherit hover:!text-sky-400 !px-2" onClick={handleCommentIntent} disabled={isRestricted && !isOwner}>
                            <ChatIcon className="h-5 w-5 mr-2" /> 
                            <span className="text-sm">{counts?.commentsCount || 0}</span>
                        </Button>
                        <Button variant="ghost" className={cn("!text-inherit !px-2", isReposted && "text-green-400")} onClick={(e) => { e.stopPropagation(); actions.toggleRepost(); }} disabled={isRestricted && !isOwner}>
                            <RepostIcon className={cn("h-5 w-5 mr-2", isReposted && "fill-current")} /> 
                            <span className="text-sm">{counts?.repostsCount || 0}</span>
                        </Button>
                        <Button variant="ghost" className={cn("!text-inherit !px-2", isLiked && "text-pink-500")} onClick={(e) => { e.stopPropagation(); actions.toggleLike(); }} disabled={isRestricted && !isOwner}>
                            <LikeIcon className={cn("h-5 w-5 mr-2", isLiked && "fill-current")} /> 
                            <span className="text-sm">{counts?.likesCount || 0}</span>
                        </Button>
                        <div className="flex items-center gap-1">
                            <Button variant="icon" className="!text-inherit" onClick={(e) => { e.stopPropagation(); actions.share(); }} disabled={isRestricted && !isOwner}>
                                <ShareIcon className="h-5 w-5" />
                            </Button>
                            <Button variant="icon" className={cn("!text-inherit transition-all", isBookmarked ? "text-yellow-400" : "hover:!text-accent")} onClick={(e) => { e.stopPropagation(); actions.toggleBookmark(); }} disabled={isRestricted && !isOwner}>
                                <BookmarkIcon className={cn("h-5 w-5", isBookmarked && "fill-yellow-400 text-yellow-400")} />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
            {isEditModalOpen && post && <EditPostModal post={post} isOpen={isEditModalOpen} onClose={() => setEditModalOpen(false)} />}
            {isDeleteModalOpen && post && <ConfirmDeleteModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={() => deletePost({ postId: post.id })} isDeleting={isDeleting} itemName={post.content.text || 'this post'} itemType="post" />}
            {isReportModalOpen && post && <ReportPostModal postId={post.id} isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} />}
        </GlassCard>
    );
};

export default PostCard;
