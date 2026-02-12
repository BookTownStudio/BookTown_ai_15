import React from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { User } from '../../types/entities.ts';
import { ReadIcon } from '../icons/ReadIcon.tsx';
import { QuoteIcon } from '../icons/QuoteIcon.tsx';
import { ShelvesIcon } from '../icons/ShelvesIcon.tsx';
import { WriteIcon } from '../icons/WriteIcon.tsx';
import Chip from '../ui/Chip.tsx';
import BookFlowActions from './BookFlowActions.tsx';

interface UserFlowCardProps {
    user: User;
}

const StatItem: React.FC<{ value: number; label: string; icon: React.FC<any>; }> = ({ value, label, icon: Icon }) => (
    <div className="text-center">
        <Icon className="h-6 w-6 mx-auto mb-1 text-accent" />
        <p className="text-lg font-bold text-white">{value}</p>
        <p className="text-xs text-white/70">{label}</p>
    </div>
);


const UserFlowCard: React.FC<UserFlowCardProps> = ({ user }) => {
    const { navigate, currentView } = useNavigation();
    const { lang } = useI18n();
    
    const handleViewProfile = () => {
        navigate({ type: 'immersive', id: 'profile', params: { userId: user.uid, from: currentView } });
    };

    return (
        <div 
            className="relative h-screen w-full flex-shrink-0 scroll-snap-align-start cursor-pointer"
            onClick={handleViewProfile}
        >
            {/* Background Image */}
            <img src={user.bannerUrl} alt="User banner" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            
            {/* Content Overlay */}
            <div className="relative z-10 flex flex-col h-full items-center p-4 pt-16 pb-24 text-white">
                <div className="flex-grow flex flex-col items-center justify-center text-center">
                    <img src={user.avatarUrl} alt={user.name} className="h-28 w-28 rounded-full border-4 border-white/20 shadow-lg" />
                    <BilingualText role="H1" className="!text-3xl mt-4 !text-white">{user.name}</BilingualText>
                    <BilingualText role="Body" className="!text-lg text-white/80">{user.handle}</BilingualText>
                    
                    <BilingualText role="Body" className="mt-4 max-w-md text-white/90">
                        {lang === 'en' ? user.bioEn : user.bioAr}
                    </BilingualText>

                    {user.sharedInterest && (
                        <div className="mt-4">
                            <Chip>{user.sharedInterest}</Chip>
                        </div>
                    )}
                    
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4 mt-8">
                        <StatItem value={user.booksRead} label={lang === 'en' ? 'Books Read' : 'كتب مقروءة'} icon={ReadIcon} />
                        <StatItem value={user.quotesSaved} label={lang === 'en' ? 'Quotes Saved' : 'اقتباسات محفوظة'} icon={QuoteIcon} />
                        <StatItem value={user.shelvesCount} label={lang === 'en' ? 'Shelves' : 'رفوف'} icon={ShelvesIcon} />
                        <StatItem value={user.wordsWritten} label={lang === 'en' ? 'Words Written' : 'كلمات مكتوبة'} icon={WriteIcon} />
                    </div>
                </div>
            </div>
            <BookFlowActions entityType="user" entityId={user.uid} />
        </div>
    );
};
// Add scroll snap align style
const style = document.createElement('style');
style.innerHTML = `
.scroll-snap-align-start {
    scroll-snap-align: start;
}
`;
document.head.appendChild(style);


export default UserFlowCard;