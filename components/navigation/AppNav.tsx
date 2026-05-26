
import React from 'react';
import Button from '../ui/Button.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { HamburgerIcon } from '../icons/HamburgerIcon.tsx';
import { BellIcon } from '../icons/BellIcon.tsx';
import { EmailIcon } from '../icons/EmailIcon.tsx';
import { MessageSquareWarningIcon } from '../icons/MessageSquareWarningIcon.tsx';
import { ChevronLeftIcon } from '../icons/ChevronLeftIcon.tsx';
import { useNotificationSummary } from '../../lib/hooks/useNotifications.ts';
import { isBetaFeedbackTriggerEnabled } from '../../lib/featureFlags.ts';
import { useFeedbackLauncher } from '../../lib/feedback/useFeedbackLauncher.ts';

interface AppNavProps {
    titleEn: string;
    titleAr: string;
    showBackButton?: boolean;
    onBack?: () => void;
}

const AppNav: React.FC<AppNavProps> = ({ titleEn, titleAr, showBackButton = false, onBack }) => {
  const { isRTL, lang } = useI18n();
  const { openDrawer, navigate, currentView } = useNavigation();
  const { data: notificationSummary } = useNotificationSummary();
  const launchFeedback = useFeedbackLauncher();

  const unreadCount = notificationSummary?.unreadCount ?? 0;
  const showBadge = unreadCount > 0;
  const showBetaFeedback = isBetaFeedbackTriggerEnabled();
  const showLeftFeedback =
    showBetaFeedback &&
    !showBackButton &&
    currentView.type === 'tab' &&
    (currentView.id === 'home' || currentView.id === 'read' || currentView.id === 'discover' || currentView.id === 'write');

  return (
    <nav className="fixed top-0 left-0 right-0 z-20 bg-gray-50/50 dark:bg-slate-900/50 backdrop-blur-lg border-b border-black/10 dark:border-white/10">
        <div className="app-frame__inner">
            <div className={`app-rail app-rail--default flex h-20 items-center justify-between px-0 lg:grid lg:grid-cols-[1fr_auto_1fr] ${isRTL ? 'flex-row-reverse' : ''}`}>
                {/* Left Section */}
                <div className={`flex items-center gap-0.5 ${isRTL ? 'flex-row-reverse lg:justify-self-end' : 'lg:justify-self-start'}`}>
                    {showBackButton ? (
                        <Button variant="icon" aria-label={lang === 'en' ? 'Go back' : 'رجوع'} onClick={onBack}>
                            <ChevronLeftIcon className="h-6 w-6" />
                        </Button>
                    ) : (
                        <Button variant="icon" aria-label={lang === 'en' ? 'Open menu' : 'افتح القائمة'} onClick={openDrawer}>
                            <HamburgerIcon className="h-6 w-6" />
                        </Button>
                    )}
                    {showLeftFeedback && (
                        <Button
                            variant="icon"
                            className="text-[#E9A93D] hover:text-[#f0b957]"
                            aria-label={lang === 'en' ? 'Send feedback' : 'إرسال ملاحظات'}
                            title={lang === 'en' ? 'Send feedback' : 'إرسال ملاحظات'}
                            onClick={() => launchFeedback({ launchSource: 'appnav' })}
                        >
                            <MessageSquareWarningIcon className="h-6 w-6" />
                        </Button>
                    )}
                </div>

                {/* Center Section */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:static lg:left-auto lg:top-auto lg:translate-x-0 lg:translate-y-0 lg:justify-self-center">
                    <BilingualText role="H1" className="text-xl">
                        {lang === 'en' ? titleEn : titleAr}
                    </BilingualText>
                </div>

                {/* Right Section */}
                <div className={`flex items-center gap-0.5 ${isRTL ? 'flex-row-reverse lg:justify-self-start' : 'lg:justify-self-end'}`}>
                    <div className="relative">
                        <Button 
                            variant="icon" 
                            className="translate-x-[5px]"
                            aria-label={lang === 'en' ? 'Notifications' : 'الإشعارات'} 
                            onClick={() => navigate({ type: 'immersive', id: 'notificationsFeed', params: { from: currentView } })}
                        >
                            <BellIcon className="h-6 w-6" />
                        </Button>
                        {showBadge && (
                            <div className="absolute top-2 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white shadow-sm pointer-events-none ring-2 ring-white dark:ring-slate-900 z-30">
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </div>
                        )}
                    </div>
                    <Button variant="icon" aria-label={lang === 'en' ? 'Messages' : 'الرسائل'} onClick={() => navigate({ type: 'immersive', id: 'messengerList', params: { from: currentView } })}>
                        <EmailIcon className="h-6 w-6" />
                    </Button>
                </div>
            </div>
        </div>
    </nav>
  );
};

export default AppNav;
