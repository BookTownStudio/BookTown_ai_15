import React, { useRef } from 'react';
import ThreadHeader from './ThreadHeader.tsx';
import ThreadBody from './ThreadBody.tsx';
import ThreadActions from './ThreadActions.tsx';
import ThreadComments from './ThreadComments.tsx';
import { usePostDetails } from '../../lib/hooks/usePostDetails.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import Button from '../ui/Button.tsx';
import { useI18n } from '../../store/i18n.tsx';

interface DiscussionModalProps {
    postId: string;
    onClose: () => void;
}

const DiscussionModal: React.FC<DiscussionModalProps> = ({ postId, onClose }) => {
    const { lang } = useI18n();
    // FIX: Initialize composerRef to handle focusing the reply input within the modal.
    const composerRef = useRef<HTMLInputElement>(null);

    // usePostDetails returns ThreadPost data. We call it here acknowledging that 
    // it requires a prefetchedPost in its current implementation to succeed.
    const { data: post, status } = usePostDetails(postId);
    const isLoading = status === 'idle';

    // FIX: Defined focusComposer to satisfy ThreadActions requirements.
    const focusComposer = () => {
        composerRef.current?.focus();
    };

    return (
        <div 
            className="fixed inset-0 z-40 bg-gray-50 dark:bg-slate-900 flex flex-col"
            role="dialog"
            aria-modal="true"
        >
            <header className="flex-shrink-0 bg-gray-50/80 dark:bg-slate-900/80 backdrop-blur-lg border-b border-black/10 dark:border-white/10">
                <div className="container mx-auto flex h-16 items-center justify-between px-4">
                     <Button variant="ghost" onClick={onClose}>
                        {lang === 'en' ? 'Close' : 'إغلاق'}
                    </Button>
                </div>
            </header>
            
            <div className="flex-grow overflow-y-auto">
                <div className="container mx-auto p-4 max-w-2xl bg-white dark:bg-slate-900/50 min-h-full">
                    {isLoading && <div className="flex justify-center py-16"><LoadingSpinner /></div>}
                    
                    {status === 'success' && post && (
                        <div className="flex flex-col">
                            {/* FIX: Use Thread-prefixed components which are designed for the ThreadPost type returned by usePostDetails. */}
                            <div className="px-4 pt-4">
                                <ThreadHeader post={post} />
                            </div>

                            <div className="px-4 py-8">
                                <ThreadBody post={post} />
                            </div>

                            {/* FIX: Passed required onCommentClick prop and mapped it to focusComposer handler. */}
                            <ThreadActions post={post} onCommentClick={focusComposer} />

                            {/* FIX: Passed composerRef to allow ThreadComments to attach the ref to its input element. */}
                            <ThreadComments post={post} composerRef={composerRef} />
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="py-24 text-center">
                            <p className="text-slate-500">
                                {lang === 'en' ? 'Discussion unavailable.' : 'النقاش غير متاح.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DiscussionModal;