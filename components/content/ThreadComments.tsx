import React, { useState, useEffect, useRef } from 'react';
import { ThreadPost, ThreadComment } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { SendIcon } from '../icons/SendIcon.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { cn } from '../../lib/utils.ts';
import { useThreadComments } from '../../lib/hooks/useThreadComments.ts';
import { CommentSkeletonList } from '../ui/CommentSkeleton.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import Button from '../ui/Button.tsx';
import { useCommentActions } from '../../lib/hooks/useCommentActions.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useToast } from '../../store/toast.tsx';
import { VerticalEllipsisIcon } from '../icons/VerticalEllipsisIcon.tsx';
import { FlagIcon } from '../icons/FlagIcon.tsx';
import { LikeIcon } from '../icons/LikeIcon.tsx';
import { EditIcon } from '../icons/EditIcon.tsx';
import { TrashIcon } from '../icons/TrashIcon.tsx';

interface ThreadCommentsProps {
    readonly post: ThreadPost;
    composerRef?: React.RefObject<HTMLInputElement>;
}

const THREAD_DISCUSSION_RAIL_CLASS = 'w-full';

const CommentItem: React.FC<{ 
    readonly comment: ThreadComment; 
    readonly postId: string;
    readonly onReply: (c: ThreadComment) => void;
    readonly onLike: (id: string) => void;
    readonly onDelete: (id: string) => void;
    readonly onEdit: (id: string, text: string) => void;
}> = ({ comment, postId, onReply, onLike, onDelete, onEdit }) => {
    const { lang, isRTL } = useI18n();
    const { navigate, currentView } = useNavigation();
    const { user } = useAuth();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const { report } = useCommentActions(postId);
    
    const isOwner = user?.uid === comment.authorId;
    const canInteract = !!user;
    const isReply = typeof comment.parentId === 'string' && comment.parentId.trim().length > 0;

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setIsMenuOpen(false);
        };
        if (isMenuOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isMenuOpen]);

    const handleReport = () => {
        const reason = prompt(lang === 'en' ? "Reason for reporting:" : "سبب الإبلاغ:");
        if (!reason) return;
        report({ commentId: comment.id, reason });
        setIsMenuOpen(false);
    };

    const timeAgo = (dateString: string) => {
        const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
        let interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "d" : "ي");
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "h" : "س");
        return Math.floor(seconds / 60) + (lang === 'en' ? "m" : "د");
    };

    return (
        <div className={cn(
            "relative flex gap-3 py-4 px-4 md:px-6 animate-fade-in group border-b border-white/8",
            isRTL ? "flex-row-reverse text-right" : "flex-row text-left",
            isReply && (isRTL
                ? "mr-7 md:mr-8 pr-5 bg-[#08111e]/72 rounded-l-xl"
                : "ml-7 md:ml-8 pl-5 bg-[#08111e]/72 rounded-r-xl")
        )}>
            {isReply && (
                <div
                    aria-hidden="true"
                    className={cn(
                        "absolute inset-y-3 w-px rounded-full bg-gradient-to-b from-[#62b7de]/0 via-[#62b7de]/45 to-[#62b7de]/0",
                        isRTL ? "right-2.5 md:right-3" : "left-2.5 md:left-3"
                    )}
                />
            )}
            <button onClick={() => navigate({ type: 'immersive', id: 'profile', params: { userId: comment.authorId, from: currentView } })} className="flex-shrink-0 h-7 w-7">
                <img src={comment.authorAvatar} alt={comment.authorName} className="h-7 w-7 rounded-full border border-white/20 object-cover bg-slate-100 dark:bg-slate-800" />
            </button>
            <div className="flex-grow min-w-0">
                <div className={cn("flex items-baseline justify-between", isRTL && "flex-row-reverse")}>
                    <div className={cn("flex items-baseline gap-2", isRTL && "flex-row-reverse")}>
                        <BilingualText className="font-semibold text-[12px] text-white/88 leading-none">{comment.authorName}</BilingualText>
                        <BilingualText role="Caption" className="!text-[10px] !text-white/45">
                            {comment.authorHandle} • {timeAgo(comment.createdAt)}
                        </BilingualText>
                    </div>

                    <div className="relative" ref={menuRef}>
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-1 text-white/35 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                            <VerticalEllipsisIcon className="h-3 w-3" />
                        </button>
                        {isMenuOpen && (
                            <div className={cn("absolute z-20 mt-1 w-36 bg-slate-900 shadow-xl border border-white/10 rounded-lg overflow-hidden py-1", isRTL ? "left-0" : "right-0")}>
                                {isOwner ? (
                                    <>
                                        <button onClick={() => { onEdit(comment.id, comment.text); setIsMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-white/85 flex items-center gap-2 hover:bg-white/10">
                                            <EditIcon className="h-3 w-3 text-white/60" />
                                            <span>{lang === 'en' ? 'Edit' : 'تعديل'}</span>
                                        </button>
                                        <button onClick={() => { if(confirm('Delete?')) onDelete(comment.id); setIsMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-red-500/10 text-red-400">
                                            <TrashIcon className="h-3 w-3" />
                                            <span>{lang === 'en' ? 'Delete' : 'حذف'}</span>
                                        </button>
                                    </>
                                ) : (
                                    <button onClick={handleReport} className="w-full text-left px-3 py-2 text-xs text-white/80 flex items-center gap-2 hover:bg-white/10">
                                        <FlagIcon className="h-3 w-3 text-red-400" />
                                        <span>{lang === 'en' ? 'Report' : 'إبلاغ'}</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                
                <BilingualText className="mt-1 !text-[14px] !text-white/86 leading-relaxed">
                    {comment.text}
                </BilingualText>

                <div className={cn("flex items-center gap-4 mt-2", isRTL && "flex-row-reverse")}>
                    <button 
                        onClick={() => onLike(comment.id)} 
                        disabled={!canInteract}
                        className={cn(
                            "flex items-center gap-1.5 text-[10px] font-bold transition-all",
                            comment.liked ? "text-pink-500" : "text-white/45 hover:text-white/70"
                        )}
                    >
                        <LikeIcon className={cn("h-3.5 w-3.5", comment.liked && "fill-current")} />
                        <span>{comment.likesCount || 0}</span>
                    </button>
                    <button 
                        onClick={() => onReply(comment)} 
                        disabled={!canInteract}
                        className="text-[10px] font-bold text-white/45 hover:text-accent transition-colors"
                    >
                        {lang === 'en' ? 'Reply' : 'رد'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ThreadComments: React.FC<ThreadCommentsProps> = ({ post, composerRef }) => {
    const { lang, isRTL } = useI18n();
    const { user } = useAuth();
    const { showToast } = useToast();
    const [commentText, setCommentText] = useState('');
    const [replyingTo, setReplyingTo] = useState<ThreadComment | null>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);

    const { 
        comments, status, hasMore, fetchNextPage, retry, 
        addComment, likeComment, deleteComment, editComment, isSubmitting 
    } = useThreadComments(post.id);

    const handleSend = async () => {
        if (!commentText.trim() || isSubmitting) return;
        try {
            await addComment(commentText, replyingTo?.id);
            setCommentText('');
            setReplyingTo(null);
        } catch (error: any) {
            console.error("[DISCUSSION] Submission failed:", error);
            showToast(
                error?.message ||
                (lang === 'en'
                    ? 'Failed to send comment. Please retry.'
                    : 'فشل إرسال التعليق. حاول مرة أخرى.')
            );
        }
    };

    const handleReplyIntent = (comment: ThreadComment) => {
        setReplyingTo(comment);
        composerRef?.current?.focus();
    };

    const handleEditIntent = (id: string, currentText: string) => {
        const newText = prompt(lang === 'en' ? "Edit your comment:" : "تعديل تعليقك:", currentText);
        if (newText && newText !== currentText) {
            editComment(id, newText);
        }
    };

    useEffect(() => {
        if (!hasMore || status !== 'success') return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) fetchNextPage();
        }, { threshold: 0.1, rootMargin: '200px' });
        if (loadMoreRef.current) observer.observe(loadMoreRef.current);
        return () => observer.disconnect();
    }, [hasMore, status, fetchNextPage]);

    return (
        <div className="flex flex-col min-h-full bg-transparent">
            <div className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#070f1a]/72 px-4 py-2.5 backdrop-blur-sm md:px-0">
                <div className={cn(THREAD_DISCUSSION_RAIL_CLASS, "flex items-center justify-between")}>
                    <BilingualText role="Label" className="!text-white/45 !text-[9px] tracking-widest font-black uppercase">
                        {lang === 'en' ? 'Replies' : 'الردود'}
                    </BilingualText>
                    {status === 'success' && (
                        <span className="text-[9px] font-black text-white/45 uppercase tracking-tighter">
                            {comments.length}
                        </span>
                    )}
                </div>
            </div>
            
            <div className="flex-grow">
                {status === 'loading' && <CommentSkeletonList count={8} />}

                {status === 'error' && (
                    <div className={cn(THREAD_DISCUSSION_RAIL_CLASS, "px-8 py-20 text-center")}>
                        <Button variant="ghost" onClick={retry} className="!text-accent !text-sm">
                            {lang === 'en' ? 'Retry loading comments' : 'إعادة تحميل التعليقات'}
                        </Button>
                    </div>
                )}

                <div className={THREAD_DISCUSSION_RAIL_CLASS}>
                    <div className="flex flex-col">
                        {comments.length > 0 ? (
                            comments.map(comment => (
                                <CommentItem 
                                    key={comment.id} 
                                    comment={comment} 
                                    postId={post.id} 
                                    onReply={handleReplyIntent}
                                    onLike={likeComment}
                                    onDelete={deleteComment}
                                    onEdit={handleEditIntent}
                                />
                            ))
                        ) : status === 'success' && (
                            <div className="animate-fade-in px-10 py-14 text-center opacity-45">
                                <BilingualText role="Body" className="!text-sm">
                                    {lang === 'en' ? 'No comments yet. Start the conversation!' : 'لا توجد تعليقات بعد. ابدأ النقاش!'}
                                </BilingualText>
                            </div>
                        )}
                    </div>

                    <div ref={loadMoreRef} className="flex h-10 items-center justify-center">
                        {hasMore && status === 'success' && <LoadingSpinner className="h-4 w-4 opacity-20" />}
                    </div>
                </div>
            </div>

            {/* STICKY COMPOSER: POST_DISCUSSION_SURFACE_V1 */}
            <div className="sticky bottom-0 left-0 right-0 z-50 bg-[#07101c]/94 border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)] backdrop-blur-md shadow-[0_-16px_40px_-26px_rgba(0,0,0,0.88)]">
                {replyingTo && (
                    <div className={cn(
                        "px-4 md:px-6 py-2 bg-black/25 flex items-center justify-between animate-fade-in-up border-b border-white/[0.08]",
                        isRTL && "flex-row-reverse"
                    )}>
                        <p className="text-[10px] font-bold text-white/55 truncate">
                            {lang === 'en' ? `Replying to ${replyingTo.authorHandle}` : `الرد على ${replyingTo.authorHandle}`}
                        </p>
                        <button onClick={() => setReplyingTo(null)} className="text-[10px] font-black text-accent uppercase">
                            {lang === 'en' ? 'Cancel' : 'إلغاء'}
                        </button>
                    </div>
                )}
                
                <div className={cn(THREAD_DISCUSSION_RAIL_CLASS, "p-4")}>
                    {!user ? (
                        <div className="bg-white/6 border border-white/10 rounded-full px-6 py-3 text-center opacity-75">
                            <p className="text-xs font-bold text-white/55">
                                {lang === 'en' ? 'Sign in to join the discussion' : 'سجل الدخول للانضمام إلى النقاش'}
                            </p>
                        </div>
                    ) : (
                        <div className="relative flex items-center bg-white/8 border border-white/12 rounded-full px-4 py-1.5 focus-within:ring-1 focus-within:ring-accent/60 focus-within:bg-white/12 transition-all">
                            <input
                                ref={composerRef}
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                placeholder={lang === 'en' ? (replyingTo ? 'Add a reply...' : 'Add a comment...') : (replyingTo ? 'أضف رداً...' : 'أضف تعليقاً...')}
                                dir={isRTL ? 'rtl' : 'ltr'}
                                disabled={isSubmitting}
                                className="flex-grow bg-transparent py-2 px-2 text-white placeholder:text-white/45 outline-none text-[15px]"
                            />
                            <button 
                                onClick={handleSend}
                                disabled={!commentText.trim() || isSubmitting}
                                className="p-2 text-accent disabled:opacity-20 transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                                aria-label="Send"
                            >
                                {isSubmitting ? <LoadingSpinner className="h-4 w-4" /> : <SendIcon className="h-5 w-5" />}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ThreadComments;
