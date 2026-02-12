import React, { useState } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { useAuth } from '../../lib/auth.tsx';
import { useUserProfile } from '../../lib/hooks/useUserProfile.ts';
import { useInstallPrompt } from '../../lib/hooks/useInstallPrompt.ts';
import Button from '../../components/ui/Button.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { BookToAppIcon } from '../../components/icons/BookToAppIcon.tsx';
import IosInstallSheet from '../../components/ui/IosInstallSheet.tsx';

interface SmartInstallPageProps {
    onContinue: () => void;
}

const SmartInstallPage: React.FC<SmartInstallPageProps> = ({ onContinue }) => {
    const { lang } = useI18n();
    const { user } = useAuth();
    const { data: profile } = useUserProfile(user?.uid);
    const { canPrompt, triggerPrompt, deviceType } = useInstallPrompt();
    const [isIosSheetOpen, setIosSheetOpen] = useState(false);

    const headline = lang === 'en' ? <>{'Bring your Books'}<br />{'to BookTown'}</> : <>{'أحضر كتبك'}<br />{'إلى BookTown'}</>;

    const subtext = lang === 'en'
        ? "Install BookTown on your home screen for a faster, distraction-free experience"
        : "ثبّت BookTown على شاشتك الرئيسية لتجربة أسرع وخالية من التشتيت";
    
    const getButtonAction = () => {
        switch (deviceType) {
            case 'android-chrome':
            case 'desktop-pwa':
                return canPrompt ? triggerPrompt : onContinue; // Fallback if prompt is not ready
            case 'ios-safari':
                return () => setIosSheetOpen(true);
            default: // fallback
                return onContinue;
        }
    };
    
    const getButtonText = () => {
        switch(deviceType) {
            case 'android-chrome': return lang === 'en' ? 'Install App' : 'تثبيت التطبيق';
            case 'ios-safari': return lang === 'en' ? 'Add to Home Screen' : 'أضف إلى الشاشة الرئيسية';
            case 'desktop-pwa': return lang === 'en' ? 'Install BookTown App' : 'تثبيت تطبيق BookTown';
            default: return lang === 'en' ? 'Bookmark This Page' : 'إضافة هذه الصفحة للمفضلة';
        }
    };

    return (
        <>
            <div className="h-screen w-full flex flex-col items-center justify-center bg-paper-light dark:bg-paper-dark text-slate-800 dark:text-white p-8 text-center transition-colors duration-300">
                <div className="animate-fade-in-up">
                    <BookToAppIcon className="w-32 h-32 text-primary dark:text-accent" />
                </div>
                
                <h1 className="text-3xl md:text-4xl font-bold mt-8 max-w-lg animate-fade-in-up leading-tight" style={{ animationDelay: '100ms' }}>
                    {headline}
                </h1>
                
                <p className="text-base md:text-lg font-inter text-slate-600 dark:text-slate-300 mt-4 max-w-xl animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                    {subtext}
                </p>

                <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full max-w-sm animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                    <Button
                        onClick={getButtonAction()}
                        className="w-full !font-inter"
                        disabled={deviceType === 'android-chrome' && !canPrompt}
                    >
                        {getButtonText()}
                    </Button>
                    <Button variant="ghost" onClick={onContinue} className="w-full !font-inter">
                        {lang === 'en' ? 'Continue in browser' : 'المتابعة في المتصفح'}
                    </Button>
                </div>
            </div>
            {deviceType === 'ios-safari' && <IosInstallSheet isOpen={isIosSheetOpen} onClose={() => setIosSheetOpen(false)} />}
        </>
    );
};

export default SmartInstallPage;