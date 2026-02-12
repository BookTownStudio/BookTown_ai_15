import React from 'react';
import { Author } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import GlassCard from '../ui/GlassCard.tsx';

interface AuthorCardMiniProps {
    author: Author;
}

const AuthorCardMini: React.FC<AuthorCardMiniProps> = ({ author }) => {
    const { lang, isRTL } = useI18n();
    const { navigate, currentView } = useNavigation();

    const handlePress = () => {
        navigate({ type: 'immersive', id: 'authorDetails', params: { authorId: author.id, from: currentView } });
    };

    return (
        <button onClick={handlePress} className="w-full text-left">
            <GlassCard className="!p-3 hover:bg-black/5 dark:hover:bg-white/10 transition-colors duration-200">
                <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <img src={author.avatarUrl} alt={lang === 'en' ? author.nameEn : author.nameAr} className="h-14 w-14 rounded-full flex-shrink-0" />
                    <div className="flex-grow overflow-hidden">
                        <BilingualText className="font-bold truncate">
                            {lang === 'en' ? author.nameEn : author.nameAr}
                        </BilingualText>
                        <BilingualText role="Caption" className="mt-1 line-clamp-2">
                            {lang === 'en' ? author.bioEn : author.bioAr}
                        </BilingualText>
                    </div>
                </div>
            </GlassCard>
        </button>
    );
};

export default AuthorCardMini;
