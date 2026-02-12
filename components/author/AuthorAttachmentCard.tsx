import React from 'react';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';

interface AuthorAttachmentCardProps {
  authorName: string;
  authorPhoto: string;
  authorCountry?: string;
  onPress: () => void;
}

const AuthorAttachmentCard: React.FC<AuthorAttachmentCardProps> = ({
  authorName,
  authorPhoto,
  authorCountry,
  onPress,
}) => {
    const { lang } = useI18n();

    return (
        <button
            onClick={onPress}
            className="w-full max-w-sm mx-auto text-left mt-3 rounded-2xl p-3 backdrop-blur-sm bg-white/5 border border-white/10 transition-colors duration-200 hover:bg-white/10 group"
        >
            <div className="flex items-center gap-4">
                <img 
                    src={authorPhoto} 
                    alt={authorName} 
                    className="w-12 h-12 rounded-full object-cover flex-shrink-0 border-2 border-white/20"
                />
                <div className="flex-grow overflow-hidden">
                    <BilingualText className="font-bold text-white truncate">
                        {authorName}
                    </BilingualText>
                    <BilingualText role="Caption" className="!text-white/70">
                        {lang === 'en' ? `Author, ${authorCountry}` : `مؤلف، ${authorCountry}`}
                    </BilingualText>
                </div>
            </div>
        </button>
    );
};

export default AuthorAttachmentCard;
