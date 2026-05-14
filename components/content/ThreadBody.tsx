import React from 'react';
import { ThreadPost, PostAttachment } from '../../types/entities.ts';
import { AttachmentListV1 } from './AttachmentRendererV1.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { resolveCanonicalPostAttachments } from '../../types/socialAttachments.ts';

interface ThreadBodyProps {
    readonly post: ThreadPost;
}

const ThreadBody: React.FC<ThreadBodyProps> = ({ post }) => {
    // Resolve attachments for the V1 renderer using ThreadPost model
    const resolvedAttachments = React.useMemo(() => {
        return resolveCanonicalPostAttachments(post) as PostAttachment[];
    }, [post]);

    return (
        <div className="space-y-6">
            <BilingualText 
                role="Body" 
                className="text-xl md:text-2xl leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-white/90 font-serif"
            >
                {post.content.text}
            </BilingualText>
            
            {resolvedAttachments.length > 0 && (
                <div className="rounded-2xl overflow-hidden border border-black/5 dark:border-white/5">
                    <AttachmentListV1 attachments={resolvedAttachments} surface="read" />
                </div>
            )}
        </div>
    );
};

export default ThreadBody;
