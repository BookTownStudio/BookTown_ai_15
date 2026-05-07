import React, { useState, useEffect, useMemo } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { Post, PostVisibilityScope } from '../../types/entities.ts';
import { useEditPost } from '../../lib/hooks/useEditPost.ts';
import { useToast } from '../../store/toast.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { LockIcon } from '../icons/LockIcon.tsx';
import { GlobeIcon } from '../icons/GlobeIcon.tsx';
import { UsersIcon } from '../icons/UsersIcon.tsx';
import { EyeOffIcon } from '../icons/EyeOffIcon.tsx';
import { ClockIcon } from '../icons/ClockIcon.tsx';

interface EditPostModalProps {
    post: Post;
    isOpen: boolean;
    onClose: () => void;
}

const EditPostModal: React.FC<EditPostModalProps> = ({ post, isOpen, onClose }) => {
    const { lang, isRTL } = useI18n();
    const { showToast } = useToast();
    
    // Core State - Restricted to spec-allowed fields
    const [text, setText] = useState(post.content.text || '');
    const [visibility, setVisibility] = useState<PostVisibilityScope>(post.visibility);
    
    const { mutate: editPost, isPending: isLoading } = useEditPost();

    const isPublished = post.status === 'published';
    const [timeLeft, setTimeLeft] = useState<number | null>(null);
    const hasCanonicalAttachments = (post.content?.attachments?.length || 0) > 0;

    // POST_EDITING_POLICY_V1: 15-minute (900s) grace period tracking
    useEffect(() => {
        if (!isPublished || !post.timestamps.createdAt) return;

        const checkTime = () => {
            const pubDate = new Date(post.timestamps.createdAt).getTime();
            const now = Date.now();
            const elapsed = Math.floor((now - pubDate) / 1000);
            const GRACE_PERIOD_SECONDS = 900; 
            const remaining = GRACE_PERIOD_SECONDS - elapsed;
            setTimeLeft(remaining > 0 ? remaining : 0);
        };

        checkTime();
        const timer = setInterval(checkTime, 1000);
        return () => clearInterval(timer);
    }, [isPublished, post.timestamps.createdAt]);

    const isWithinGracePeriod = timeLeft !== null && timeLeft > 0;

    const handleSave = () => {
        const trimmed = text.trim();
        if (!trimmed && !hasCanonicalAttachments) {
            showToast(lang === 'en' ? "Your post needs some content." : "منشورك يحتاج لمحتوى.");
            return;
        }

        const editPayload: any = {
            postId: post.id,
            text: trimmed,
            visibility: visibility
        };

        editPost(editPayload, {
            onSuccess: () => {
                showToast(lang === 'en' ? "Post updated!" : "تم تحديث المنشور!");
                onClose();
            },
            onError: (err: any) => {
                showToast(err.message || (lang === 'en' ? "Failed to update post." : "فشل تحديث المنشور."));
            }
        });
    };

    const visibilityOptions: { id: PostVisibilityScope; en: string; ar: string; icon: React.FC<any> }[] = [
        { id: 'public', en: 'Public', ar: 'عام', icon: GlobeIcon },
        { id: 'followers', en: 'Followers', ar: 'متابعون', icon: UsersIcon },
        { id: 'private', en: 'Private', ar: 'خاص', icon: LockIcon },
        { id: 'restricted', en: 'Restricted', ar: 'محدود', icon: EyeOffIcon },
    ];

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const hasChanges = useMemo(() => {
        const textChanged = text !== post.content.text;
        const visChanged = visibility !== post.visibility;
        return textChanged || visChanged;
    }, [text, visibility, post]);

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="w-full max-h-[85vh] flex flex-col overflow-hidden">
                <BilingualText role="H1" className="!text-xl mb-4 text-center">
                    {lang === 'en' ? 'Edit Post' : 'تعديل المنشور'}
                </BilingualText>
                
                <div className="flex-grow overflow-y-auto pr-2 space-y-6 pb-6">
                    <div>
                        <div className="flex justify-between items-center mb-2 px-1">
                            <BilingualText role="Caption" className="!text-[11px] !text-slate-400 uppercase tracking-widest font-black">
                                {lang === 'en' ? 'Content' : 'المحتوى'}
                            </BilingualText>

                            {isPublished && timeLeft !== null && (
                                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${isWithinGracePeriod ? 'bg-sky-500/10 text-sky-400' : 'bg-slate-500/10 text-slate-400'}`}>
                                    <ClockIcon className="h-3 w-3" />
                                    <span>
                                        {isWithinGracePeriod 
                                            ? (lang === 'en' ? `Grace period: ${formatTime(timeLeft)}` : `فترة السماح: ${formatTime(timeLeft)}`)
                                            : (lang === 'en' ? 'Edited' : 'معدل')}
                                    </span>
                                </div>
                            )}
                        </div>

                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            dir={isRTL ? 'rtl' : 'ltr'}
                            placeholder={lang === 'en' ? "Update your thoughts..." : "حدث أفكارك..."}
                            className="w-full h-32 bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-xl p-4 text-lg leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-accent text-slate-900 dark:text-white"
                            maxLength={5000}
                            disabled={isLoading}
                        />
                    </div>

                    {/* ATTACHMENT_EDIT_POLICY_V1: Hard locked during beta */}
                    <div>
                        <div className="mb-2 px-1">
                            <BilingualText role="Caption" className="!text-slate-400 uppercase tracking-widest text-[10px] font-bold">
                                {lang === 'en' ? 'Attachments' : 'المرفقات'}
                            </BilingualText>
                        </div>

                        <div className="px-3 py-2 bg-slate-500/10 border border-slate-500/20 rounded-lg mb-3">
                            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                {lang === 'en'
                                    ? 'Attachments cannot be edited after publishing (beta limitation).'
                                    : 'لا يمكن تعديل المرفقات بعد النشر (قيود النسخة التجريبية).'}
                            </p>
                        </div>
                    </div>

                    {/* VISIBILITY_EDIT_V1 */}
                    <div>
                        <BilingualText role="Caption" className="mb-2 block !text-slate-400 uppercase tracking-widest text-[10px] font-bold px-1">
                            {lang === 'en' ? 'Audience' : 'الجمهور'}
                        </BilingualText>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {visibilityOptions.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setVisibility(opt.id)}
                                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all ${
                                        visibility === opt.id 
                                            ? 'bg-accent/10 border-accent text-accent' 
                                            : 'bg-black/5 dark:bg-slate-800 border-transparent text-slate-500 hover:bg-black/10'
                                    }`}
                                    disabled={isLoading}
                                >
                                    <opt.icon className="h-5 w-5 mb-1" />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">{lang === 'en' ? opt.en : opt.ar}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-black/10 dark:border-white/10 flex justify-end gap-3 mt-auto">
                    <Button variant="ghost" onClick={onClose} disabled={isLoading}>
                        {lang === 'en' ? 'Cancel' : 'إلغاء'}
                    </Button>
                    <Button 
                        variant="primary" 
                        onClick={handleSave} 
                        disabled={isLoading || !hasChanges}
                        className="!px-8"
                    >
                        {isLoading ? <LoadingSpinner className="!h-5 !w-5" /> : (lang === 'en' ? 'Update Post' : 'تحديث المنشور')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default EditPostModal;
