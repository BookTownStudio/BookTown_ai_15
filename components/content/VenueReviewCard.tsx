import React from 'react';
import { VenueReview } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { StarIcon } from '../icons/StarIcon.tsx';
import { ThumbsUpIcon } from '../icons/ThumbsUpIcon.tsx';
import { ThumbsDownIcon } from '../icons/ThumbsDownIcon.tsx';
import { ChatIcon } from '../icons/ChatIcon.tsx';
import { useNavigation } from '../../store/navigation.tsx';

const VenueReviewCard: React.FC<{ review: VenueReview }> = ({ review }) => {
    const { isRTL, lang } = useI18n();
    const { navigate, currentView } = useNavigation();

    const timeAgo = (dateString: string) => {
        const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "y" : "س");
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "mo" : "ش");
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "d" : "ي");
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "h" : "س");
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "m" : "د");
        return Math.floor(seconds) + (lang === 'en' ? "s" : "ث");
    }
    
    const handleProfileClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigate({ type: 'immersive', id: 'profile', params: { userId: review.userId, from: currentView } });
    }

    return (
        <div className="py-4 border-b border-white/10 last:border-b-0">
            <div className={`flex items-start gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <button onClick={handleProfileClick}><img src={review.authorAvatar} alt={review.authorName} className="h-10 w-10 rounded-full flex-shrink-0" /></button>
                <div className="flex-grow">
                    <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                         <button onClick={handleProfileClick} className="text-left">
                            <BilingualText className="font-semibold">{review.authorName}</BilingualText>
                            <BilingualText role="Caption">{`${review.authorHandle} · ${timeAgo(review.timestamp)}`}</BilingualText>
                        </button>
                        <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <StarIcon key={i} className={`h-4 w-4 ${i < review.rating ? 'text-yellow-400' : 'text-slate-600'}`} />
                            ))}
                        </div>
                    </div>
                    {review.text && (
                        <BilingualText role="Body" className="mt-2 text-white/80">
                            {review.text}
                        </BilingualText>
                    )}
                    <div className={`mt-3 flex items-center gap-4 text-slate-400 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <Button variant="ghost" className="!text-inherit hover:!text-accent !px-2 !text-xs">
                            <ThumbsUpIcon className="h-4 w-4 mr-1.5" /> {review.upvotes}
                        </Button>
                        <Button variant="ghost" className="!text-inherit hover:!text-accent !px-2 !text-xs">
                            <ThumbsDownIcon className="h-4 w-4 mr-1.5" /> {review.downvotes}
                        </Button>
                        <Button variant="ghost" className="!text-inherit hover:!text-accent !px-2 !text-xs">
                            <ChatIcon className="h-4 w-4 mr-1.5" /> {review.commentsCount}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VenueReviewCard;