import React from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { PlusIcon } from '../icons/PlusIcon.tsx';
import BilingualText from '../ui/BilingualText.tsx';

interface AddBookCardProps {
    onClick: () => void;
}

const AddBookCard: React.FC<AddBookCardProps> = ({ onClick }) => {
    const { lang } = useI18n();
    return (
        <div className="flex-shrink-0 w-32 mr-4">
            <button
                onClick={onClick}
                className="w-full aspect-[2/3] rounded-card border-2 border-dashed border-slate-600 dark:border-white/30 text-slate-600 dark:text-white/40
                           flex flex-col items-center justify-center 
                           transition-all duration-300 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:border-accent hover:text-accent"
                aria-label={lang === 'en' ? 'Add a book to this shelf' : 'أضف كتابًا إلى هذا الرف'}
            >
                <PlusIcon className="w-10 h-10" />
                <BilingualText role="Caption" className="mt-1 !text-xs !text-inherit">
                    {lang === 'en' ? 'Add Book' : 'أضف كتاب'}
                </BilingualText>
            </button>
        </div>
    );
};

export default AddBookCard;
