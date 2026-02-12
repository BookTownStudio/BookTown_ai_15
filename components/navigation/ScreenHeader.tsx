
import React from 'react';
import { useI18n } from '../../store/i18n.tsx';
import Button from '../ui/Button.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { ChevronLeftIcon } from '../icons/ChevronLeftIcon.tsx';

interface ScreenHeaderProps {
    titleEn: string;
    titleAr: string;
    onBack: () => void;
}

const ScreenHeader: React.FC<ScreenHeaderProps> = ({ titleEn, titleAr, onBack }) => {
    const { lang, isRTL } = useI18n();
    return (
        <header className="fixed top-0 left-0 right-0 z-20 bg-slate-900/50 backdrop-blur-lg border-b border-white/10">
            <div className={`container mx-auto flex h-20 items-center justify-between px-4 md:px-8 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <div>
                    <Button variant="ghost" onClick={onBack} aria-label={lang === 'en' ? 'Back' : 'رجوع'}>
                        <ChevronLeftIcon className="h-6 w-6" />
                    </Button>
                </div>
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                    <BilingualText role="H1" className="!text-xl">
                        {lang === 'en' ? titleEn : titleAr}
                    </BilingualText>
                </div>
                <div className="w-10" />
            </div>
        </header>
    );
};

export default ScreenHeader;
