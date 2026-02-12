import React from 'react';
// FIX: Add file extension to entities.ts import
import { User } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { useNavigation } from '../../store/navigation.tsx';

interface UserSearchResultCardProps {
    user: User;
}

const UserSearchResultCard: React.FC<UserSearchResultCardProps> = ({ user }) => {
    const { lang, isRTL } = useI18n();
    const { navigate, currentView } = useNavigation();

    const handlePress = () => {
        navigate({ type: 'immersive', id: 'profile', params: { userId: user.uid, from: currentView } });
    };


    return (
        <button onClick={handlePress} className="w-full text-left hover:bg-slate-800 transition-colors">
            <div className={`p-4 flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''} border-b border-black/10 dark:border-white/10`}>
                <img src={user.avatarUrl} alt={user.name} className="h-12 w-12 rounded-full" />
                <div className="flex-grow">
                    <BilingualText className="font-bold">{user.name}</BilingualText>
                    <BilingualText role="Caption">{user.handle}</BilingualText>
                    <BilingualText role="Body" className="!text-sm text-slate-600 dark:text-white/70 mt-1 line-clamp-2">
                        {lang === 'en' ? user.bioEn : user.bioAr}
                    </BilingualText>
                </div>
                <Button variant="primary" className="!px-4 !py-1 !text-sm flex-shrink-0">
                    {lang === 'en' ? 'Follow' : 'متابعة'}
                </Button>
            </div>
        </button>
    );
};

export default UserSearchResultCard;