import React from 'react';
import { Notification } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useUserProfile } from '../../lib/hooks/useUserProfile.ts';
import { useToggleNotificationRead } from '../../lib/hooks/useNotifications.ts';
import BilingualText from '../ui/BilingualText.tsx';
import { LikeIcon } from '../icons/LikeIcon.tsx';
import { ChatIcon } from '../icons/ChatIcon.tsx';
import { RepostIcon } from '../icons/RepostIcon.tsx';
import { UserPlusIcon } from '../icons/UserPlusIcon.tsx';
import { BellIcon } from '../icons/BellIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { GroupedNotification } from '../../app/notifications/feed.tsx';

const timeAgo = (dateString: string, lang: 'en' | 'ar') => {
    const seconds = Math.floor((new Date().getTime() - new Date(dateString).getTime()) / 1000);
    let interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "d" : "ي");
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "h" : "س");
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + (lang === 'en' ? "m" : "د");
    return lang === 'en' ? 'Just now' : 'الآن';
};

const ActorAvatar: React.FC<{ uid: string; className?: string }> = ({ uid, className }) => {
    const { data: profile } = useUserProfile(uid);
    return (
        <img 
            src={profile?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`} 
            alt="" 
            className={cn("h-10 w-10 rounded-full border-2 border-white dark:border-slate-900 object-cover bg-slate-200 dark:bg-slate-800 shadow-sm", className)} 
        />
    );
};

const NotificationCard: React.FC<{ notification: Notification | GroupedNotification }> = ({ notification }) => {
    const { lang } = useI18n();
    const { navigate, currentView, navigateToSocialAndHighlight } = useNavigation();
    const { mutate: markRead } = useToggleNotificationRead();

    const isGroup = 'items' in notification && notification.items.length > 1;
    const items = isGroup ? (notification as GroupedNotification).items : [notification as Notification];
    const ids = isGroup ? (notification as GroupedNotification).ids : [(notification as Notification).id];
    const primaryActorId = items[0].actorId;
    const { data: primaryActor } = useUserProfile(primaryActorId);
    const isUnread = !notification.read;

    const handlePress = () => {
        const navigationTarget = () => {
            switch (notification.entityType) {
                case 'post':
                    if (notification.postId) {
                        // POST_DISCUSSION_ENTRY_GUARD_V1: Redirect to surface first. 
                        // Do not infer discussion entry directly from notification tap.
                        navigateToSocialAndHighlight(notification.postId);
                    }
                    break;
                case 'profile':
                    navigate({ type: 'immersive', id: 'profile', params: { userId: notification.actorId, from: currentView } });
                    break;
                case 'book':
                    navigate({ type: 'immersive', id: 'bookDetails', params: { bookId: notification.entityId, from: currentView } });
                    break;
                case 'shelf':
                    navigate({ type: 'immersive', id: 'shelfDetails', params: { shelfId: notification.entityId, ownerId: notification.uid, from: currentView } });
                    break;
                default: break;
            }
        };

        navigationTarget();

        // NOTIFICATION_READ_STATE_V1 idempotent mutation
        if (!notification.read) {
            ids.forEach(id => markRead({ notificationId: id }));
        }
    };

    const getIcon = () => {
        switch (notification.type) {
            case 'like': return <LikeIcon className="h-4 w-4 text-pink-500 fill-current" />;
            case 'comment': return <ChatIcon className="h-4 w-4 text-sky-500 fill-current" />;
            case 'repost': return <RepostIcon className="h-4 w-4 text-green-500" />;
            case 'follow': return <UserPlusIcon className="h-4 w-4 text-indigo-500" />;
            default: return <BellIcon className="h-4 w-4 text-slate-500" />;
        }
    };

    const renderMessage = () => {
        const actorName = primaryActor?.name || 'Someone';
        const otherCount = items.length - 1;
        if (!isGroup) {
            switch (notification.type) {
                case 'like': return lang === 'en' ? `${actorName} liked your post` : `أعجب ${actorName} بمنشورك`;
                case 'comment': return lang === 'en' ? `${actorName} commented on your post` : `علق ${actorName} على منشورك`;
                case 'follow': return lang === 'en' ? `${actorName} followed you` : `تابعك ${actorName}`;
                case 'repost': return lang === 'en' ? `${actorName} reposted your post` : `أعاد ${actorName} نشر منشورك`;
                default: return notification.message;
            }
        }
        return lang === 'en' 
            ? `${actorName} and ${otherCount} others ${notification.type}ed your post` 
            : `تفاعل ${actorName} و ${otherCount} آخرين مع نشاطك`;
    };

    return (
        <button
            onClick={handlePress}
            className={cn(
                "w-full text-left p-4 flex items-start gap-4 transition-all duration-150 border-b border-black/5 dark:border-white/5 relative",
                isUnread ? "bg-white dark:bg-slate-800 shadow-sm" : "bg-transparent opacity-80"
            )}
        >
            <span className="sr-only" aria-live="polite">
                {isUnread ? (lang === 'en' ? 'Unread notification' : 'تنبيه غير مقروء') : (lang === 'en' ? 'Read notification' : 'تنبيه مقروء')}
            </span>

            <div className="flex-shrink-0 pt-1">
                <div className="relative">
                    {isGroup ? (
                        <div className="flex items-center -space-x-6 h-10 w-16">
                            {items.slice(0, 3).map((item, idx) => (
                                <ActorAvatar key={item.id} uid={item.actorId} className={cn("h-9 w-9", idx === 0 && "z-30", idx === 1 && "z-20", idx === 2 && "z-10")} />
                            ))}
                        </div>
                    ) : (
                        <div className="w-10 h-10"><ActorAvatar uid={primaryActorId} className="h-10 w-10" /></div>
                    )}
                    <div className="absolute -bottom-1 -right-1 bg-white dark:bg-slate-900 rounded-full p-1 shadow-md border border-black/5 dark:border-white/10 z-40">
                        {getIcon()}
                    </div>
                </div>
            </div>
            
            <div className="flex-grow min-w-0">
                <div className="flex justify-between items-start">
                    <div className="pr-4">
                         <BilingualText 
                            role="Body" 
                            className={cn(
                                "!text-[15px] leading-snug",
                                isUnread ? "font-semibold text-slate-900 dark:text-white" : "font-normal text-slate-500 dark:text-slate-400"
                            )}
                        >
                            {renderMessage()}
                        </BilingualText>
                    </div>
                    {isUnread && <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 bg-accent" aria-hidden="true" />}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                    <BilingualText role="Caption" className="!text-[11px] uppercase tracking-wider font-bold text-slate-400">
                        {timeAgo(notification.createdAt, lang)}
                    </BilingualText>
                    {isGroup && <div className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[9px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-tighter">BATCHED</div>}
                </div>
            </div>
        </button>
    );
};

export default NotificationCard;