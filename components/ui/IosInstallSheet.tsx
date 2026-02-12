import React from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { ShareIcon } from '../icons/ShareIcon.tsx';
import { PlusSquareIcon } from '../icons/PlusSquareIcon.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from './Button.tsx';

interface IosInstallSheetProps {
    isOpen: boolean;
    onClose: () => void;
}

const IosInstallSheet: React.FC<IosInstallSheetProps> = ({ isOpen, onClose }) => {
    const { lang } = useI18n();

    if (!isOpen) return null;

    const steps = [
        {
            icon: ShareIcon,
            en: 'Tap the Share button in your browser.',
            ar: 'اضغط على زر المشاركة في متصفحك.'
        },
        {
            icon: PlusSquareIcon,
            en: 'Select "Add to Home Screen".',
            ar: 'اختر "إضافة إلى الشاشة الرئيسية".'
        }
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true">
             <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                aria-hidden="true"
                onClick={onClose}
            ></div>
            <div className="relative z-10 w-full max-w-md bg-slate-200 dark:bg-slate-800 p-6 rounded-t-2xl shadow-2xl animate-fade-in-up">
                <BilingualText role="H1" className="text-center !text-xl mb-4">
                    {lang === 'en' ? 'Add to Home Screen' : 'أضف إلى الشاشة الرئيسية'}
                </BilingualText>
                
                <div className="space-y-4">
                    {steps.map((step, index) => (
                        <div key={index} className="flex items-center gap-4 p-3 bg-white/50 dark:bg-black/20 rounded-lg">
                            <step.icon className="h-8 w-8 text-primary dark:text-accent flex-shrink-0" />
                            <BilingualText className="text-slate-700 dark:text-white/80">
                                {lang === 'en' ? step.en : step.ar}
                            </BilingualText>
                        </div>
                    ))}
                </div>

                <Button variant="primary" onClick={onClose} className="w-full mt-6">
                    {lang === 'en' ? 'Got It' : 'فهمت'}
                </Button>
            </div>
        </div>
    );
};

export default IosInstallSheet;
