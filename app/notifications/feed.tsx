
import React, { useCallback, useRef, useMemo, useState } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import { useInfiniteNotifications, useMarkAllAsRead, useUnreadNotificationsCount } from '../../lib/hooks/useNotifications.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import NotificationCard from '../../components/content/NotificationCard.tsx';
import Button from '../../components/ui/Button.tsx';
import ErrorState from '../../components/ui/ErrorState.tsx';
import { Notification } from '../../types/entities.ts';
import { BellIcon } from '../../components/icons/BellIcon.tsx';
import { FilterOffIcon } from '../../components/icons/FilterOffIcon.tsx';
import { CheckCircleIcon } from '../../components/icons/CheckCircleIcon.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { cn } from '../../lib/utils.ts';

export interface GroupedNotification extends Omit<Notification, 'id'> {
    ids: string[];
    items: Notification[];
}

const readViewerJoinDateMs = (viewer: unknown): number | null => {
    if (!viewer || typeof viewer !== 'object') return null;
    const rawJoinDate = (viewer as { joinDate?: unknown }).joinDate;
    if (
        typeof rawJoinDate !== 'string' &&
        typeof rawJoinDate !== 'number' &&
        !(rawJoinDate instanceof Date)
    ) {
        return null;
    }
    const joinedAtMs = new Date(rawJoinDate).getTime();
    return Number.isFinite(joinedAtMs) ? joinedAtMs : null;
};

/**
 * EmptyState View
 * Implementation of NOTIFICATION_EMPTY_STATES_V1 (LOCKED).
 */
const EmptyState: React.FC<{ 
    type: 'first_time_user' | 'no_notifications_yet' | 'all_read' | 'filtered_empty';
    onClearFilters?: () => void;
}> = ({ type, onClearFilters }) => {
    const { lang } = useI18n();
    
    const config = {
      first_time_user: {
        icon: BellIcon,
        titleEn: "You’re all caught up",
        titleAr: "أنت مطلع على كل شيء",
        copyEn: "Notifications will appear here when people interact with your activity.",
        copyAr: "ستظهر التنبيهات هنا عندما يتفاعل الأشخاص مع نشاطك.",
        secondaryEn: "Likes, follows, replies, and mentions will show up here.",
        secondaryAr: "ستظهر الإعجابات والمتابعات والردود والإشارات هنا.",
      },
      no_notifications_yet: {
        icon: BellIcon,
        titleEn: "No notifications yet",
        titleAr: "لا توجد تنبيهات بعد",
        copyEn: "You don’t have any notifications right now.",
        copyAr: "ليس لديك أي تنبيهات حاليًا.",
        secondaryEn: null,
        secondaryAr: null,
      },
      all_read: {
        icon: CheckCircleIcon,
        titleEn: "All notifications read",
        titleAr: "تمت قراءة جميع التنبيهات",
        copyEn: "You’re up to date.",
        copyAr: "أنت مطلع على آخر المستجدات.",
        secondaryEn: null,
        secondaryAr: null,
      },
      filtered_empty: {
        icon: FilterOffIcon,
        titleEn: "Nothing here",
        titleAr: "لا يوجد شيء هنا",
        copyEn: "No notifications match this filter.",
        copyAr: "لا توجد تنبيهات تطابق هذا الفلتر.",
        secondaryEn: "Try a different filter.",
        secondaryAr: "جرب فلترًا مختلفًا.",
      }
    }[type];

    const Icon = config.icon;

    return (
        <div 
            className="flex-grow flex flex-col items-center justify-center text-center py-24 px-8 animate-fade-in max-w-sm mx-auto"
            role="status"
            aria-live="polite"
        >
            <div className="mb-6 p-6 bg-slate-100 dark:bg-slate-800/40 rounded-full">
                <Icon className="h-12 w-12 text-slate-400 dark:text-slate-500" />
            </div>
            <BilingualText role="H2" className="!text-xl font-bold text-slate-900 dark:text-white">
                {lang === 'en' ? config.titleEn : config.titleAr}
            </BilingualText>
            <BilingualText role="Body" className="mt-3 text-slate-500 dark:text-slate-400 leading-relaxed">
                {lang === 'en' ? config.copyEn : config.copyAr}
            </BilingualText>
            {config.secondaryEn && (
                <BilingualText role="Caption" className="mt-2 text-slate-400 dark:text-slate-500 italic">
                    {lang === 'en' ? config.secondaryEn : config.secondaryAr}
                </BilingualText>
            )}
            {type === 'filtered_empty' && onClearFilters && (
                <div className="mt-8">
                    <Button variant="ghost" onClick={onClearFilters} className="!text-accent !px-6 border border-accent/20 hover:bg-accent/5">
                        {lang === 'en' ? 'Clear filters' : 'مسح الفلاتر'}
                    </Button>
                </div>
            )}
        </div>
    );
};

const NotificationsFeedScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const { user } = useAuth();
    
    const [showUnreadOnly, setShowUnreadOnly] = useState(false);
    
    const { 
        data, 
        isLoading, 
        isError, 
        fetchNextPage, 
        hasNextPage, 
        isFetchingNextPage,
        refetch 
    } = useInfiniteNotifications();
    
    const { mutate: markAllAsRead, isPending: isMarking } = useMarkAllAsRead();
    const { data: unreadCount } = useUnreadNotificationsCount();

    const handleBack = () => navigate(currentView.params?.from || { type: 'tab', id: 'home' });

    // FIX: Cast page to any when flattening to access .notifications property.
    const rawNotifications = useMemo(() => data?.pages.flatMap(page => (page as any).notifications) || [], [data]);

    /**
     * grouping_rules
     * Implementation of NOTIFICATION_BATCHING_UI_V1.
     */
    const groupedNotifications = useMemo(() => {
        const groups: GroupedNotification[] = [];
        const groupMap = new Map<string, number>();

        rawNotifications.forEach(notif => {
            const isEligible = ['like', 'comment', 'follow', 'repost'].includes(notif.type) && notif.priority !== 'high';
            const dateStr = notif.createdAt ? new Date(notif.createdAt).toISOString().split('T')[0] : 'unknown';
            const groupKey = isEligible ? `${notif.type}_${notif.entityId}_${dateStr}` : null;

            if (groupKey && groupMap.has(groupKey)) {
                const index = groupMap.get(groupKey)!;
                groups[index].items.push(notif);
                groups[index].ids.push(notif.id);
                if (!notif.read) groups[index].read = false;
            } else {
                const newGroup: GroupedNotification = { ...notif, ids: [notif.id], items: [notif] };
                if (groupKey) groupMap.set(groupKey, groups.length);
                groups.push(newGroup);
            }
        });

        return groups;
    }, [rawNotifications]);

    const visibleNotifications = useMemo(() => {
        if (!showUnreadOnly) return groupedNotifications;
        return groupedNotifications.filter(n => !n.read);
    }, [groupedNotifications, showUnreadOnly]);

    const emptyStateType = useMemo(() => {
        if (isLoading || visibleNotifications.length > 0) return null;
        if (rawNotifications.length === 0) {
            const joinedAtMs = readViewerJoinDateMs(user);
            const isNewUser = joinedAtMs
                ? Date.now() - joinedAtMs < 24 * 60 * 60 * 1000
                : true;
            return isNewUser ? 'first_time_user' : 'no_notifications_yet';
        }
        return showUnreadOnly ? 'all_read' : 'filtered_empty';
    }, [isLoading, rawNotifications, visibleNotifications, user, showUnreadOnly]);

    // Infinite Scroll
    const observer = useRef<IntersectionObserver | null>(null);
    const lastElementRef = useCallback((node: HTMLDivElement | null) => {
        if (isLoading || isFetchingNextPage) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasNextPage) fetchNextPage();
        });
        if (node) observer.current.observe(node);
    }, [isLoading, isFetchingNextPage, hasNextPage, fetchNextPage]);

    const renderContent = () => {
        if (isError) {
            return (
                <div className="py-20 px-4">
                    <ErrorState 
                        onRetry={() => refetch()} 
                        title={lang === 'en' ? 'Something went wrong' : 'حدث خطأ ما'}
                        message={lang === 'en' ? 'Notifications couldn’t be loaded.' : 'تعذر تحميل الإشعارات.'}
                    />
                </div>
            );
        }
        if (isLoading && rawNotifications.length === 0) {
            return <div className="flex-grow flex items-center justify-center py-32"><LoadingSpinner className="h-10 w-10" /></div>;
        }
        if (emptyStateType) {
            return <EmptyState type={emptyStateType} onClearFilters={() => setShowUnreadOnly(false)} />;
        }
        return (
            <div className="divide-y divide-black/5 dark:divide-white/5 pb-32">
                {visibleNotifications.map((notification, index) => {
                    const isLast = visibleNotifications.length === index + 1;
                    return (
                        <div key={notification.ids.join('-')} ref={isLast ? lastElementRef : null}>
                            <NotificationCard notification={notification} />
                        </div>
                    );
                })}
                {isFetchingNextPage && <div className="flex justify-center py-8"><LoadingSpinner className="h-6 w-6" /></div>}
            </div>
        );
    };

    const hasUnread = (unreadCount || 0) > 0;

    return (
        <div className="h-screen flex flex-col bg-gray-50 dark:bg-slate-900 overflow-hidden">
            <ScreenHeader titleEn="Notifications" titleAr="الإشعارات" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto pt-20">
                <div className="app-rail app-rail--default max-w-2xl min-h-full flex flex-col">
                    <div className="flex flex-col border-b border-black/5 dark:border-white/5 sticky top-0 bg-gray-50/95 dark:bg-slate-900/95 backdrop-blur-md z-10">
                        <div className="flex justify-between items-center p-4">
                            <BilingualText role="Caption" className="uppercase tracking-widest font-bold !text-slate-400">
                                {lang === 'en' ? 'Activity Feed' : 'تغذية النشاط'}
                            </BilingualText>
                            <div className="flex items-center gap-2">
                                <Button 
                                    variant="ghost" 
                                    className={cn(
                                        "!text-[11px] !px-3 !min-h-0 h-8 !py-0 !rounded-full transition-all border",
                                        showUnreadOnly 
                                            ? "bg-accent/10 border-accent/30 text-accent" 
                                            : "bg-transparent border-black/10 dark:border-white/10 text-slate-500"
                                    )}
                                    onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                                >
                                    {lang === 'en' ? 'Unread Only' : 'غير المقروء فقط'}
                                </Button>
                                <Button 
                                    variant="ghost" 
                                    className="!text-[11px] !text-slate-500 !px-3 !min-h-0 h-8 !py-0 hover:!text-accent" 
                                    // FIX: Pass undefined to satisfy the expected argument in mutate() from useMutation, resolving the arguments count error.
                                    onClick={() => markAllAsRead(undefined)}
                                    disabled={isMarking || !hasUnread}
                                >
                                    {isMarking ? '...' : (lang === 'en' ? 'Mark all read' : 'تحديد الكل كمقروء')}
                                </Button>
                            </div>
                        </div>
                    </div>
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default NotificationsFeedScreen;
