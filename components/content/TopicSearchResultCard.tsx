import React from 'react';
import BilingualText from '../ui/BilingualText.tsx';
import { HashtagIcon } from '../icons/HashtagIcon.tsx';

interface TopicSearchResultCardProps {
    topic: string;
}

const TopicSearchResultCard: React.FC<TopicSearchResultCardProps> = ({ topic }) => {
    return (
        <div className="p-4 flex items-center gap-3 border-b border-black/10 dark:border-white/10">
            <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                <HashtagIcon className="h-6 w-6 text-slate-500" />
            </div>
            <div>
                <BilingualText className="font-bold">{topic}</BilingualText>
                <BilingualText role="Caption">12k posts</BilingualText>
            </div>
        </div>
    );
};

export default TopicSearchResultCard;