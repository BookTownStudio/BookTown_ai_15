
import React, { useState } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { UserDiscoveryAttachment, Post } from '../../types/entities.ts';
import GlassCard from '../ui/GlassCard.tsx';
import Button from '../ui/Button.tsx';
import { UserPlusIcon } from '../icons/UserPlusIcon.tsx';
import { CheckIcon } from '../icons/CheckIcon.tsx';
import { ShareIcon } from '../icons/ShareIcon.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { cn } from '../../lib/utils.ts';
import { useFollowUser } from '../../lib/hooks/useFollowUser.ts';
import { useToast } from '../../store/toast.tsx';
import { useAuth } from '../../lib/auth.tsx';

interface UserDiscoveryPostProps {
    post: Post;
    attachment: UserDiscoveryAttachment;
    onOpenDiscussion: () => void;
    onNewPost?: () => void;
}

const UserDiscoveryPost: React.FC<UserDiscoveryPostProps> = ({ post, attachment, onOpenDiscussion, onNewPost }) => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const { isGuest } = useAuth();
    const { showToast } = useToast();
    const [bgImageError, setBgImageError] = useState(false);
    const [isFollowed, setIsFollowed] = useState(false); 
    
    const { mutate: followUser, isLoading: isFollowing } = useFollowUser();
    
    const handleCardClick = () => {
        navigate({ type: 'immersive', id: 'profile', params: { userId: attachment.userId, from: currentView } });
    };

    const handleFollow = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isGuest) {
            showToast(lang === 'en' ? 'Login to follow' : 'سجل الدخول للمتابعة');
            return;
        }
        
        if (!isFollowed) {
            followUser(attachment.userId, {
                onSuccess: () => setIsFollowed(true)
            });
        } else {
            setIsFollowed(false); 
        }
    };

    const handleAction = (e: React.MouseEvent, action: string) => {
        e.stopPropagation();
        if (action === 'Not Interested') {
             showToast(lang === 'en' ? 'Recommendation hidden' : 'تم إخفاء التوصية');
        } else if (action === 'Report') {
             showToast(lang === 'en' ? 'User reported' : 'تم الإبلاغ عن المستخدم');
        }
    };

    const formatCount = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
        return n.toString();
    };

    const backgroundUrl = attachment.coverUrl;
    const interests = (attachment.interests && attachment.interests.length > 0) 
        ? attachment.interests 
        : (lang === 'en' ? ['Reading', 'Books', 'Stories'] : ['قراءة', 'كتب', 'قصص']);
    
    const stats = attachment.stats || { booksRead: 0, wordsWritten: 0, shelvesCount: 0 };

    return (
        <div className="relative h-full w-full flex-shrink-0 text-white overflow-hidden snap-start">
            {/* Background */}
             {backgroundUrl && !bgImageError ? (
                <>
                    <img 
                        src={backgroundUrl} 
                        alt="Profile background" 
                        className="absolute inset-0 w-full h-full object-cover blur-sm scale-105 opacity-50" 
                        onError={() => setBgImageError(true)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/60 to-black/90" />
                </>
            ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />
            )}

            {/* Main Content Container */}
            <div 
                className="relative z-10 flex flex-col h-full w-full items-center justify-center pl-6 pr-20 py-6"
                onClick={handleCardClick}
            >
                <div className="w-full max-w-sm pointer-events-auto">
                    
                    <GlassCard className="p-8 flex flex-col items-center gap-6 shadow-2xl border-white/5 bg-white/5 backdrop-blur-md rounded-[32px] relative">
                        
                        {/* Avatar */}
                        <div className="relative group">
                            <div className="absolute -inset-0.5 bg-gradient-to-br from-accent to-primary rounded-full opacity-75 blur group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                            <img 
                                src={attachment.avatarUrl} 
                                alt={attachment.displayName} 
                                className="relative w-28 h-28 rounded-full border-2 border-black/50 object-cover shadow-xl"
                            />
                        </div>
                        
                        {/* Identity */}
                        <div className="text-center space-y-1">
                            <h2 className="text-3xl font-bold tracking-tight text-white drop-shadow-lg">
                                {attachment.displayName}
                            </h2>
                            <p className="text-white/50 text-base font-medium tracking-wide">{attachment.handle}</p>
                        </div>

                        {/* Bio */}
                        {attachment.bio ? (
                            <p className="text-center text-white/80 text-sm leading-relaxed line-clamp-3 max-w-[90%]">
                                {attachment.bio}
                            </p>
                        ) : (
                            <p className="text-center text-white/40 text-sm italic">
                                {lang === 'en' ? 'No bio yet.' : 'لا توجد سيرة ذاتية بعد.'}
                            </p>
                        )}

                        {/* Tags / Interests */}
                        <div className="flex flex-wrap justify-center gap-2">
                            {interests.slice(0, 4).map(tag => (
                                <span key={tag} className="px-3 py-1 bg-white/10 text-white/90 text-xs font-medium rounded-full backdrop-blur-sm border border-white/5">
                                    {tag}
                                </span>
                            ))}
                        </div>

                        {/* Stats */}
                        <div className="flex items-center justify-center gap-3 text-xs font-medium text-white/70 mt-2">
                            <span>{formatCount(stats.booksRead)} {lang === 'en' ? 'Read' : 'قراءة'}</span>
                            <span className="text-white/30">•</span>
                            <span>{formatCount(stats.wordsWritten)} {lang === 'en' ? 'Written' : 'كتابة'}</span>
                            <span className="text-white/30">•</span>
                            <span>{formatCount(stats.shelvesCount)} {lang === 'en' ? 'Shelves' : 'رفوف'}</span>
                        </div>

                        {/* Action Column */}
                        <div className="flex flex-col items-center gap-3 w-full mt-2" onClick={(e) => e.stopPropagation()}>
                            <Button 
                                variant={isFollowed ? 'ghost' : 'primary'} 
                                className={cn(
                                    "w-48 h-12 rounded-full font-semibold transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.15)]",
                                    isFollowed 
                                        ? 'bg-white/10 text-white hover:bg-white/20 border border-white/5' 
                                        : 'bg-white text-black hover:bg-white/90'
                                )}
                                onClick={handleFollow}
                                disabled={isFollowing}
                            >
                                {isFollowed ? (
                                    <>
                                        <CheckIcon className="h-5 w-5 mr-2" />
                                        {lang === 'en' ? 'Following' : 'متابع'}
                                    </>
                                ) : (
                                    <>
                                        <UserPlusIcon className="h-5 w-5 mr-2" />
                                        {lang === 'en' ? 'Follow' : 'متابعة'}
                                    </>
                                )}
                            </Button>

                            <button 
                                onClick={(e) => handleAction(e, 'Not Interested')}
                                className="text-white/40 text-xs hover:text-white/80 transition-colors py-2 font-medium uppercase tracking-wide"
                            >
                                {lang === 'en' ? 'Not Interested' : 'غير مهتم'}
                            </button>
                        </div>

                    </GlassCard>
                </div>
            </div>
            {/* Rule implementation: InteractionRail removed from card level */}
        </div>
    );
};

export default UserDiscoveryPost;
