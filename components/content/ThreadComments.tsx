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
            "flex gap-3 py-4 px-6 animate-fade-in group border-b border-black/5 dark:border-white/5", 
            isRTL ? "flex-row-reverse text-right" : "flex-row text-left",
            comment.parentId && (isRTL ? "mr-10 border-r-2 border-slate-100" : "ml-10 border-l-2 border-slate-100")
        )}>
            <button onClick={() => navigate({ type: 'immersive', id: 'profile', params: { userId: comment.authorId, from: currentView } })} className="flex-shrink-0 h-8 w-8">
                <img src={comment.authorAvatar} alt={comment.authorName} className="h-8 w-8 rounded-full border border-black/5 dark:border-white/10 object-cover bg-slate-100 dark:bg-slate-800" />
            </button>
            <div className="flex-grow min-w-0">
                <div className={cn("flex items-baseline justify-between", isRTL && "flex-row-reverse")}>
                    <div className={cn("flex items-baseline gap-2", isRTL && "flex-row-reverse")}>
                        <BilingualText className="font-bold text-[13px] text-slate-900 dark:text-white leading-none">{comment.authorName}</BilingualText>
                        <BilingualText role="Caption" className="!text-[10px] !text-slate-400">
                            {comment.authorHandle} • {timeAgo(comment.createdAt)}
                        </BilingualText>
                    </div>

                    <div className="relative" ref={menuRef}>
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-1 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                            <VerticalEllipsisIcon className="h-3 w-3" />
                        </button>
                        {isMenuOpen && (
                            <div className={cn("absolute z-20 mt-1 w-36 bg-white dark:bg-slate-800 shadow-xl border border-black/5 dark:border-white/10 rounded-lg overflow-hidden py-1", isRTL ? "left-0" : "right-0")}>
                                {isOwner ? (
                                    <>
                                        <button onClick={() => { onEdit(comment.id, comment.text); setIsMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5">
                                            <EditIcon className="h-3 w-3 text-slate-400" />
                                            <span>{lang === 'en' ? 'Edit' : 'تعديل'}</span>
                                        </button>
                                        <button onClick={() => { if(confirm('Delete?')) onDelete(comment.id); setIsMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 text-red-400">
                                            <TrashIcon className="h-3 w-3" />
                                            <span>{lang === 'en' ? 'Delete' : 'حذف'}</span>
                                        </button>
                                    </>
                                ) : (
                                    <button onClick={handleReport} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5">
                                        <FlagIcon className="h-3 w-3 text-red-400" />
                                        <span>{lang === 'en' ? 'Report' : 'إبلاغ'}</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                
                <BilingualText className="mt-1 !text-[14px] !text-slate-700 dark:!text-slate-300 leading-relaxed">
                    {comment.text}
                </BilingualText>

                <div className={cn("flex items-center gap-4 mt-2", isRTL && "flex-row-reverse")}>
                    <button 
                        onClick={() => onLike(comment.id)} 
                        disabled={!canInteract}
                        className={cn(
                            "flex items-center gap-1.5 text-[10px] font-bold transition-all",
                            comment.liked ? "text-pink-500" : "text-slate-400 hover:text-slate-600"
                        )}
                    >
                        <LikeIcon className={cn("h-3.5 w-3.5", comment.liked && "fill-current")} />
                        <span>{comment.likesCount || 0}</span>
                    </button>
                    <button 
                        onClick={() => onReply(comment)} 
                        disabled={!canInteract}
                        className="text-[10px] font-bold text-slate-400 hover:text-accent transition-colors"
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
        <div className="flex flex-col min-h-full">
            <div className="px-6 py-3 flex items-center justify-between border-b border-black/5 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02]">
                <BilingualText role="Label" className="!text-slate-400 !text-[9px] tracking-widest font-black uppercase">
                    {lang === 'en' ? 'Replies' : 'الردود'}
                </BilingualText>
                {status === 'success' && (
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                        {comments.length}
                    </span>
                )}
            </div>
            
            <div className="flex-grow">
                {status === 'loading' && <CommentSkeletonList count={8} />}

                {status === 'error' && (
                    <div className="py-20 px-8 text-center">
                        <Button variant="ghost" onClick={retry} className="!text-accent !text-sm">
                            {lang === 'en' ? 'Retry loading comments' : 'إعادة تحميل التعليقات'}
                        </Button>
                    </div>
                )}

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
                        <div className="py-24 text-center px-10 animate-fade-in opacity-40">
                            <BilingualText role="Body" className="!text-sm">
                                {lang === 'en' ? 'No comments yet. Start the conversation!' : 'لا توجد تعليقات بعد. ابدأ النقاش!'}
                            </BilingualText>
                        </div>
                    )}
                </div>

                <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                    {hasMore && status === 'success' && <LoadingSpinner className="h-4 w-4 opacity-20" />}
                </div>
            </div>

            {/* STICKY COMPOSER: POST_DISCUSSION_SURFACE_V1 */}
            <div className="sticky bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-t border-black/5 dark:border-white/10 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
                {replyingTo && (
                    <div className={cn(
                        "px-6 py-2 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between animate-fade-in-up border-b border-black/5 dark:border-white/5",
                        isRTL && "flex-row-reverse"
                    )}>
                        <p className="text-[10px] font-bold text-slate-400 truncate">
                            {lang === 'en' ? `Replying to ${replyingTo.authorHandle}` : `الرد على ${replyingTo.authorHandle}`}
                        </p>
                        <button onClick={() => setReplyingTo(null)} className="text-[10px] font-black text-accent uppercase">
                            {lang === 'en' ? 'Cancel' : 'إلغاء'}
                        </button>
                    </div>
                )}
                
                <div className="container mx-auto max-w-2xl p-4">
                    {!user ? (
                        <div className="bg-slate-100 dark:bg-slate-800/50 rounded-full px-6 py-3 text-center opacity-60">
                            <p className="text-xs font-bold text-slate-400">
                                {lang === 'en' ? 'Sign in to join the discussion' : 'سجل الدخول للانضمام إلى النقاش'}
                            </p>
                        </div>
                    ) : (
                        <div className="relative flex items-center bg-slate-100 dark:bg-slate-800 rounded-full px-4 py-1.5 focus-within:ring-1 focus-within:ring-accent/50 transition-all">
                            <input
                                ref={composerRef}
                                type="text"
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                                placeholder={lang === 'en' ? (replyingTo ? 'Add a reply...' : 'Add a comment...') : (replyingTo ? 'أضف رداً...' : 'أضف تعليقاً...')}
                                dir={isRTL ? 'rtl' : 'ltr'}
                                disabled={isSubmitting}
                                className="flex-grow bg-transparent py-2 px-2 text-slate-900 dark:text-white placeholder:text-slate-500 outline-none text-[15px]"
                            />
                            <button 
                                onClick={handleSend}
                                disabled={!commentText.trim() || isSubmitting}
                                className="p-2 text-accent disabled:opacity-20 transition-all hover:scale-110 active:scale-95 flex-shrink-0"
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
