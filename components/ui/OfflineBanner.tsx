
import React, { useState, useEffect } from 'react';
import BilingualText from './BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';

const OfflineBanner: React.FC = () => {
    const { lang } = useI18n();
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="fixed left-0 right-0 z-50 animate-fade-in-up px-4" style={{ bottom: 'calc(var(--bottom-nav-height, 66px) + 12px)' }}>
            <div className="mx-auto max-w-[min(var(--app-rail-narrow,760px),calc(100vw-2rem))] bg-red-500/90 backdrop-blur-md text-white px-4 py-3 rounded-lg shadow-lg flex items-center justify-center text-sm font-medium">
                <span className="w-2 h-2 bg-white rounded-full mr-3 animate-pulse"></span>
                <BilingualText>
                    {lang === 'en' ? 'You are offline. Showing cached data.' : 'أنت غير متصل. يتم عرض البيانات المحفوظة.'}
                </BilingualText>
            </div>
        </div>
    );
};

export default OfflineBanner;
