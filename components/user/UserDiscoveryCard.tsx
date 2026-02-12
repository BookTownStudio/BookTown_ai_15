import React, { useState } from 'react';
import { UserDiscoveryAttachment } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Chip from '../ui/Chip.tsx';
import Button from '../ui/Button.tsx';
import { UserPlusIcon } from '../icons/UserPlusIcon.tsx';
import { VerticalEllipsisIcon } from '../icons/VerticalEllipsisIcon.tsx';
import { CheckIcon } from '../icons/CheckIcon.tsx';
import { cn, generateColorFromText } from '../../lib/utils.ts';
import { useNavigation } from '../../store/navigation.tsx';

interface UserDiscoveryCardProps {
    user: UserDiscoveryAttachment;
    onOpen: () => void;
}

interface BookCoverThumbnailProps {
    book: { id: string; title: string; coverUrl: string };
    onClick: (e: React.MouseEvent) => void;
}

const BookCoverThumbnail: React.FC<BookCoverThumbnailProps> = ({ book, onClick }) => {
    const [imageError, setImageError] = useState(false);

    return (
        <button
            onClick={onClick}
            className="w-12 h-16 rounded-sm object-cover border-2 border-slate-900 shadow-md transition-transform duration-300 hover:scale-105 overflow-hidden flex items-center justify-center text-center bg-slate-800"
            aria-label={`View details for ${book.title}`}
        >
            {imageError ? (
                <div className={cn("w-full h-full flex items-center justify-center p-1", generateColorFromText(book.title))}>
                    <p className="text-white font-bold text-[8px] leading-tight line-clamp-3">
                        {book.title}
                    </p>
                </div>
            ) : (
                <img
                    src={book.coverUrl}
                    alt={book.title}
                    className="w-full h-full object-cover"
                    onError={() => setImageError(true)}
                />
            )}
        </button>
    );
};


const UserDiscoveryCard: React.FC<UserDiscoveryCardProps> = ({ user, onOpen }) => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const [isFollowed, setIsFollowed] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleFollowClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsFollowed(prev => !prev);
        // In a real app, this would call a mutation.
        // onFollow(user.userId);
    };

    const handleMenuClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(prev => !prev);
    };

    const handleMenuAction = (e: React.MouseEvent, action: string) => {
        e.stopPropagation();
        console.log(`[Mock] Action '${action}' for user ${user.userId}`);
        setIsMenuOpen(false);
        if (action === 'Not Interested') {
            // In a real app, this would hide the card from the feed.
            // onHide(post.id);
        }
    };
    
    const handleBookClick = (e: React.MouseEvent, bookId: string) => {
        e.stopPropagation(); // Prevent navigating to profile
        navigate({ type: 'immersive', id: 'bookDetails', params: { bookId, from: currentView } });
    };

    const hasBanner = !!user.coverUrl;
    const backgroundStyle = hasBanner ? {
        backgroundImage: `url(${user.coverUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
    } : {};

    const overlayStyle = {
        background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.7) 90%)',
        backdropFilter: 'blur(8px)',
    };

    return (
        <button
            onClick={onOpen}
            className={cn(
                "relative w-full text-left mt-3 rounded-card overflow-hidden text-white shadow-lg shadow-black/40 group",
                !hasBanner && "bg-banner-fallback"
            )}
            style={backgroundStyle}
        >
            <div style={overlayStyle} className="absolute inset-0"></div>

            <div className="relative z-10 p-4">
                {/* Header */}
                <div className="flex flex-col items-center text-center">
                    <img src={user.avatarUrl} alt={user.displayName} className="h-24 w-24 rounded-full border-4 border-white/20 shadow-lg" />
                    <h3 className="text-2xl font-bold mt-2" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                        {user.displayName}
                    </h3>
                    <p className="text-base text-white/80" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>
                        {user.handle}
                    </p>
                </div>

                {/* Body */}
                <div className="mt-4 text-center">
                    <p className="text-sm text-white/90 line-clamp-2 max-w-md mx-auto">{user.bio}</p>

                    {user.interests && user.interests.length > 0 && (
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {user.interests.slice(0, 5).map(interest => (
                                <Chip key={interest}>{interest}</Chip>
                            ))}
                        </div>
                    )}
                    
                    {user.topBooks && user.topBooks.length > 0 && (
                        <div className="mt-4 flex justify-center space-x-2">
                            {user.topBooks.slice(0, 3).map(book => (
                                <BookCoverThumbnail 
                                    key={book.id} 
                                    book={book} 
                                    onClick={(e) => handleBookClick(e, book.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="mt-6 flex items-center justify-center gap-2">
                    <Button
                        variant={isFollowed ? 'ghost' : 'primary'}
                        className={`!rounded-full !px-6 ${isFollowed ? '!bg-white/20 !text-white' : ''}`}
                        onClick={handleFollowClick}
                    >
                        {isFollowed ? <CheckIcon className="h-5 w-5 mr-2"/> : <UserPlusIcon className="h-5 w-5 mr-2" />}
                        {isFollowed ? (lang === 'en' ? 'Following' : 'تتابعه') : (lang === 'en' ? 'Follow' : 'متابعة')}
                    </Button>
                    <div className="relative">
                        <Button variant="ghost" className="!rounded-full !w-11 !h-11 !p-0 !bg-white/10" onClick={handleMenuClick}>
                            <VerticalEllipsisIcon className="h-5 w-5" />
                        </Button>
                        {isMenuOpen && (
                            <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-800/80 backdrop-blur-md rounded-lg shadow-xl p-1 z-10">
                                <ul className="text-sm">
                                    <li><button onClick={(e) => handleMenuAction(e, 'Not Interested')} className="w-full text-left px-3 py-1.5 rounded hover:bg-white/10">Not Interested</button></li>
                                    <li><button onClick={(e) => handleMenuAction(e, 'Mute')} className="w-full text-left px-3 py-1.5 rounded hover:bg-white/10">Mute {user.handle}</button></li>
                                    <li><button onClick={(e) => handleMenuAction(e, 'Block')} className="w-full text-left px-3 py-1.5 rounded hover:bg-white/10 text-red-400">Block {user.handle}</button></li>
                                </ul>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
};

export default UserDiscoveryCard;