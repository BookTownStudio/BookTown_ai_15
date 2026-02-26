import React, { useEffect, useRef, useState } from 'react';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { HomeIcon } from '../icons/HomeIcon.tsx';
import { ReadIcon } from '../icons/ReadIcon.tsx';
import { DiscoverIcon } from '../icons/DiscoverIcon.tsx';
import { WriteIcon } from '../icons/WriteIcon.tsx';
import { SocialIcon } from '../icons/SocialIcon.tsx';
import { TabName } from '../../types/navigation.ts';
import { useNavigation } from '../../store/navigation.tsx';
import { cn } from '../../lib/utils.ts';

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
    const [isHidden, setIsHidden] = useState(false);
    const lastScrollTopRef = useRef(0);
    const downDeltaRef = useRef(0);
    const revealTimerRef = useRef<number | null>(null);

    const handleTabClick = (tabId: TabName) => {
        if (tabId === activeTab) {
            resetTab(tabId);
        } else {
            setActiveTab(tabId);
        }
    };

    useEffect(() => {
        document.documentElement.style.setProperty('--bottom-nav-height', 'calc(66px + env(safe-area-inset-bottom))');
    }, []);

    useEffect(() => {
        const scheduleReveal = () => {
            if (revealTimerRef.current) {
                window.clearTimeout(revealTimerRef.current);
            }
            revealTimerRef.current = window.setTimeout(() => {
                setIsHidden(false);
            }, 900);
        };

        const resolveScrollTop = (target: EventTarget | null): number => {
            if (!target) return window.scrollY || 0;
            if (target === document || target === document.body || target === document.documentElement) {
                return window.scrollY || document.documentElement.scrollTop || 0;
            }
            if (target instanceof HTMLElement) {
                return target.scrollTop;
            }
            return window.scrollY || 0;
        };

        const onScroll = (event: Event) => {
            const currentTop = Math.max(0, resolveScrollTop(event.target));
            const delta = currentTop - lastScrollTopRef.current;

            if (Math.abs(delta) < 4) {
                scheduleReveal();
                return;
            }

            if (delta > 0) {
                downDeltaRef.current += delta;
                if (downDeltaRef.current >= 150) {
                    setIsHidden(true);
                    downDeltaRef.current = 0;
                }
            } else {
                downDeltaRef.current = 0;
                if (currentTop <= 24) {
                    setIsHidden(false);
                }
            }

            lastScrollTopRef.current = currentTop;
            scheduleReveal();
        };

        window.addEventListener('scroll', onScroll, { passive: true, capture: true });
        return () => {
            window.removeEventListener('scroll', onScroll, true);
            if (revealTimerRef.current) {
                window.clearTimeout(revealTimerRef.current);
            }
        };
    }, []);

    return (
        <div
            className={cn(
                "fixed bottom-0 left-0 right-0 z-20 bg-gray-50/50 dark:bg-slate-900/50 backdrop-blur-lg border-t border-black/10 dark:border-white/10 transition-all duration-200 ease-in-out",
                isHidden ? "opacity-0 translate-y-3 pointer-events-none" : "opacity-100 translate-y-0"
            )}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            <div className="mx-auto flex h-[66px] w-full items-center justify-around px-4">
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
