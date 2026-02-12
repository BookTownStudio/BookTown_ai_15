
import React from 'react';
import Skeleton from './Skeleton.tsx';
import GlassCard from './GlassCard.tsx';

export const BookCardSkeleton: React.FC<{ layout: 'grid' | 'list' | 'row' }> = ({ layout }) => {
    if (layout === 'row') {
        return (
             <div className="flex w-full items-center gap-4">
                <Skeleton className="w-14 h-20 rounded-md flex-shrink-0" />
                <div className="flex-grow space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-2 w-full mt-2" />
                </div>
            </div>
        );
    }
    
    if (layout === 'list') {
         return (
            <div className="flex-shrink-0 w-32 mr-4">
                <Skeleton className="w-full aspect-[2/3] rounded-card" />
                <Skeleton className="h-3 w-3/4 mt-2" />
                <Skeleton className="h-3 w-1/2 mt-1" />
            </div>
        );
    }

    // Grid
    return (
        <div className="flex flex-col">
             <Skeleton className="w-full aspect-[2/3] rounded-card" />
             <Skeleton className="h-4 w-3/4 mt-2" />
             <Skeleton className="h-3 w-1/2 mt-1" />
        </div>
    );
};

export const ShelfSkeleton: React.FC = () => {
    return (
        <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                     <Skeleton className="w-12 h-12 rounded-lg" />
                     <div className="space-y-1">
                         <Skeleton className="h-5 w-40" />
                         <Skeleton className="h-3 w-20" />
                     </div>
                </div>
                <Skeleton className="w-8 h-8 rounded-full" />
            </div>
            <div className="flex gap-4 overflow-hidden">
                {[1, 2, 3, 4].map(i => <BookCardSkeleton key={i} layout="list" />)}
            </div>
        </div>
    );
};

export const ProjectCardSkeleton: React.FC = () => {
    return (
        <div className="w-full">
            <GlassCard className="!p-4 h-32">
                 <div className="flex justify-between items-start mb-4">
                     <div className="space-y-2 w-2/3">
                         <Skeleton className="h-6 w-3/4" />
                         <Skeleton className="h-4 w-1/2" />
                     </div>
                     <Skeleton className="w-16 h-6 rounded-full" />
                 </div>
                 <Skeleton className="h-3 w-24 mt-auto" />
            </GlassCard>
        </div>
    );
};

export const PostSkeleton: React.FC = () => {
    return (
        <GlassCard className="!p-4 mb-4">
             <div className="flex items-start gap-4">
                 <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
                 <div className="flex-grow space-y-2">
                     <Skeleton className="h-4 w-1/3" />
                     <Skeleton className="h-16 w-full" />
                     <div className="flex gap-4 pt-2">
                         <Skeleton className="h-4 w-8" />
                         <Skeleton className="h-4 w-8" />
                         <Skeleton className="h-4 w-8" />
                     </div>
                 </div>
             </div>
        </GlassCard>
    );
};
