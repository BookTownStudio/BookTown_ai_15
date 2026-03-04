import { devLog } from '../../lib/logging/devLog';

import React from 'react';
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { RecommendedShelf } from '../../types/entities.ts';
import { useFollowShelf } from '../../lib/hooks/useFollowShelf.ts';
import { PlusIcon } from '../icons/PlusIcon.tsx';
import { CheckIcon } from '../icons/CheckIcon.tsx';

interface RecommendedShelfCardProps {
    shelf: RecommendedShelf;
}

const RecommendedShelfCard: React.FC<RecommendedShelfCardProps> = ({ shelf }) => {
    const { lang } = useI18n();
    const [isFollowed, setIsFollowed] = React.useState(false); 
    const { mutate: followShelf, isLoading: isFollowing } = useFollowShelf();

    const handleFollow = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isFollowed) {
            followShelf(shelf.id, {
                onSuccess: () => {
                    setIsFollowed(true);
                }
            });
        }
    };

    const handleCardClick = () => {
        // Placeholder for navigation
        devLog(`Navigating to shelf: ${shelf.id}`);
    };

    // Rule: STATE_INITIALIZATION_SAFETY
    const bookCovers = shelf.bookCovers ?? [];

    return (
        <div onClick={handleCardClick} className="w-72 flex-shrink-0 cursor-pointer group">
            <GlassCard className="!p-4 h-full flex flex-col justify-between transition-all duration-300 group-hover:bg-white/5 !border-2 !border-white/10 group-hover:!border-accent/50">
                <div>
                    <BilingualText className="font-bold line-clamp-1">
                        {lang === 'en' ? shelf.titleEn : shelf.titleAr}
                    </BilingualText>
                    <BilingualText role="Caption" className="text-slate-500 dark:text-white/60">
                        {shelf.ownerName}
                    </BilingualText>
                </div>
                
                <div className="my-4 flex items-center -space-x-3 px-1">
                    {bookCovers.slice(0, 3).map((url, index) => (
                        <img
                            key={index}
                            src={url}
                            alt={`Cover ${index + 1}`}
                            className="w-10 h-14 rounded object-cover border-2 border-slate-200 dark:border-slate-800 shadow-md"
                        />
                    ))}
                    {bookCovers.length > 3 && (
                        <div className="w-10 h-14 rounded bg-slate-700 flex items-center justify-center border-2 border-slate-800 text-xs text-white font-medium z-10">
                            +{bookCovers.length - 3}
                        </div>
                    )}
                </div>
                
                <div className="flex items-center justify-between mt-auto">
                    <BilingualText role="Caption" className="!text-xs">
                        {shelf.followerCount.toLocaleString()} {lang === 'en' ? 'followers' : 'متابع'}
                    </BilingualText>
                    <Button 
                        variant="primary" 
                        className={`!h-8 !px-3 !text-xs ${isFollowed ? '!bg-green-500/20 !text-green-400' : ''}`}
                        onClick={handleFollow}
                        disabled={isFollowing || isFollowed}
                    >
                        {isFollowed ? (
                            <>
                                <CheckIcon className="h-3 w-3 mr-1" />
                                {lang === 'en' ? 'Following' : 'تمت المتابعة'}
                            </>
                        ) : (
                            <>
                                <PlusIcon className="h-3 w-3 mr-1" />
                                {lang === 'en' ? 'Follow' : 'متابعة'}
                            </>
                        )}
                    </Button>
                </div>
            </GlassCard>
        </div>
    );
};

export default RecommendedShelfCard;
