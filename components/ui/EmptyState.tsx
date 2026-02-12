
import React from 'react';
import BilingualText from './BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';

interface EmptyStateProps {
    icon: React.FC<any>;
    titleEn: string;
    titleAr: string;
    messageEn: string;
    messageAr: string;
    action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, titleEn, titleAr, messageEn, messageAr, action }) => {
    const { lang } = useI18n();
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 bg-slate-800/50 rounded-full mb-4">
                <Icon className="h-8 w-8 text-slate-500" />
            </div>
            <BilingualText role="H1" className="!text-lg mb-2 text-slate-300">
                {lang === 'en' ? titleEn : titleAr}
            </BilingualText>
            <BilingualText role="Body" className="text-slate-500 max-w-xs mx-auto mb-6">
                {lang === 'en' ? messageEn : messageAr}
            </BilingualText>
            {action}
        </div>
    );
};

export default EmptyState;
