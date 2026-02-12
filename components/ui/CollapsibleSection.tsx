
import React from 'react';
import BilingualText from './BilingualText.tsx';
import { ChevronDownIcon } from '../icons/ChevronDownIcon.tsx';
import { useI18n } from '../../store/i18n.tsx';

interface CollapsibleSectionProps {
    titleEn: string;
    titleAr: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ titleEn, titleAr, isOpen, onToggle, children }) => {
    const { lang } = useI18n();

    return (
        <section>
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between py-2"
                aria-expanded={isOpen}
            >
                <BilingualText role="H1" className="!text-xl">
                    {lang === 'en' ? titleEn : titleAr}
                </BilingualText>
                <ChevronDownIcon className={`h-6 w-6 text-slate-500 dark:text-white/60 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden pt-2">
                    {children}
                </div>
            </div>
        </section>
    );
};

export default CollapsibleSection;
