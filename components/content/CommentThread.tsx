import React, { useState } from 'react';
import { Post, PostComment } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { SendIcon } from '../icons/SendIcon.tsx';
import { useNavigation } from '../../store/navigation.tsx';

interface CommentThreadProps {
    post: Post;
}

const CommentItem: React.FC<{ comment: PostComment }> = ({ comment }) => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();

    const handleProfileClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigate({ type: 'immersive', id: 'profile', params: { userId: comment.authorId, from: currentView } });
    };

    const timeAgo = (dateString: string) => {
        const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
        let interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "d" : "ي");
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "h" : "س");
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "m" : "د");
        return Math.floor(seconds) + (lang === 'en' ? "s" : "ث");
    }

    return (
        <div className="flex items-start gap-3 py-3">
            <button onClick={handleProfileClick} className="flex-shrink-0">
                <img src={comment.authorAvatar} alt={comment.authorName} className="h-10 w-10 rounded-full" />
            </button>
            <div className="flex-grow">
                 <button onClick={handleProfileClick} className="text-left w-full group">
                    <div className="flex items-baseline gap-2">
                        <BilingualText className="font-semibold group-hover:underline">{comment.authorName}</BilingualText>
                        <BilingualText role="Caption">{comment.authorHandle} · {timeAgo(comment.timestamp)}</BilingualText>
                    </div>
                 </button>
                <BilingualText>{comment.text}</BilingualText>
            </div>
        </div>
    );
};

const CommentComposer: React.FC = () => {
    const { lang } = useI18n();
    const [commentText, setCommentText] = useState('');

    return (
        <div className="sticky bottom-0 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-lg p-2 border-t border-black/10 dark:border-white/10">
            <div className="relative flex items-center">
                <input
                    type="text"
                    placeholder={lang === 'en' ? 'Add a comment...' : 'أضف تعليقًا...'}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="w-full bg-slate-200 dark:bg-slate-800 rounded-full py-2 pl-4 pr-12 text-slate-900 dark:text-white/90 placeholder:text-slate-500 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <Button variant="icon" className="absolute right-1 top-1/2 -translate-y-1/2 !text-accent">
                    <SendIcon className="h-5 w-5" />
                </Button>
            </div>
        </div>
    );
};


const CommentThread: React.FC<CommentThreadProps> = ({ post }) => {
    const { lang } = useI18n();
    
    return (
        <div>
            <BilingualText role="H1" className="!text-xl mb-2">{lang === 'en' ? 'Discussion' : 'النقاش'}</BilingualText>
            <div className="divide-y divide-black/10 dark:divide-white/10">
                {(post.comments && post.comments.length > 0) ? (
                    post.comments.map(comment => <CommentItem key={comment.id} comment={comment} />)
                ) : (
                    <BilingualText role="Caption" className="py-8 text-center">{lang === 'en' ? 'No comments yet.' : 'لا توجد تعليقات بعد.'}</BilingualText>
                )}
            </div>
            <CommentComposer />
        </div>
    );
};

export default CommentThread;