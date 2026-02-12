import React from 'react';
import { useI18n } from '../../store/i18n.tsx';
import { PlusIcon } from '../icons/PlusIcon.tsx';
import BilingualText from '../ui/BilingualText.tsx';

interface AddBookRowProps {
    onClick: () => void;
}

const AddBookRow: React.FC<AddBookRowProps> = ({ onClick }) => {
    const { lang } = useI18n();
    return (
        <button
            onClick={onClick}
            className="w-full h-24 rounded-lg border-2 border-dashed border-slate-600 dark:border-white/30 text-slate-600 dark:text-white/40
                       flex items-center justify-center gap-2
                       transition-all duration-300 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:border-accent hover:text-accent"
            aria-label={lang === 'en' ? 'Add a book to this shelf' : 'أضف كتابًا إلى هذا الرف'}
        >
            <PlusIcon className="w-6 h-6" />
            <BilingualText role="Body" className="!font-semibold !text-inherit">
                {lang === 'en' ? 'Add Book' : 'أضف كتاب'}
            </BilingualText>
        </button>
    );
};

export default AddBookRow;
