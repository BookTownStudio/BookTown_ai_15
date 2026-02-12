import React from 'react';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { HomeIcon } from '../icons/HomeIcon.tsx';
import { ReadIcon } from '../icons/ReadIcon.tsx';
import { DiscoverIcon } from '../icons/DiscoverIcon.tsx';
import { WriteIcon } from '../icons/WriteIcon.tsx';
import { SocialIcon } from '../icons/SocialIcon.tsx';
import { TabName } from '../../types/navigation.ts';
import { useNavigation } from '../../store/navigation.tsx';

interface BottomNavBarProps {
    activeTab: TabName;
}

const TABS: { id: TabName; en: string; ar: string; icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
    { id: 'home', en: 'Home', ar: 'الرئيسية', icon: HomeIcon },
    { id: 'read', en: 'Read', ar: 'اقرأ', icon: ReadIcon },
    { id: 'discover', en: 'Discover', ar: 'اكتشف', icon: DiscoverIcon },
    { id: 'write', en: 'Write', ar: 'اكتب', icon: WriteIcon },
    { id: 'social', en: 'Social', ar: 'التواصل', icon: SocialIcon },
];

const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab }) => {
    const { lang } = useI18n();
    const { setActiveTab, resetTab } = useNavigation();

    const handleTabClick = (tabId: TabName) => {
        if (tabId === activeTab) {
            resetTab(tabId);
        } else {
            setActiveTab(tabId);
        }
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-20 h-[66px] bg-gray-50/50 dark:bg-slate-900/50 backdrop-blur-lg border-t border-black/10 dark:border-white/10">
            <div className="container mx-auto flex h-full items-center justify-around px-4 pb-2">
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabClick(tab.id)}
                            className={`flex flex-col items-center gap-1 transition-colors duration-300 ${isActive ? 'text-accent' : 'text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white'}`}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <tab.icon className={`h-6 w-6 transform transition-transform ${tab.id === 'discover' ? 'scale-125' : ''}`} />
                            <BilingualText role="Caption" className={`!text-xs ${isActive ? '!text-accent' : '!text-slate-500 dark:!text-white/60'}`}>
                                {lang === 'en' ? tab.en : tab.ar}
                            </BilingualText>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default BottomNavBar;