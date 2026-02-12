import React from 'react';
import Skeleton from './Skeleton.tsx';

const CommentSkeleton: React.FC = () => {
    return (
        <div className="flex gap-3 py-5 px-4 animate-pulse">
            <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
            <div className="flex-grow space-y-3">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-24 rounded" />
                    <Skeleton className="h-2 w-16 rounded" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-3 w-full rounded" />
                    <Skeleton className="h-3 w-4/5 rounded" />
                </div>
            </div>
        </div>
    );
};

export const CommentSkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => (
    <div className="divide-y divide-black/5 dark:divide-white/5">
        {Array.from({ length: count }).map((_, i) => (
            <CommentSkeleton key={i} />
        ))}
    </div>
);

export default CommentSkeleton;