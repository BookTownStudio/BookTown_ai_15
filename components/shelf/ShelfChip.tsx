import React, { useState, useEffect } from 'react';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { ShelvesIcon } from '../icons/ShelvesIcon.tsx';
import { BookIcon } from '../icons/BookIcon.tsx';

interface ShelfChipProps {
    shelfId: string;
    shelfName: string;
    bookCount: number;
    covers: string[];
    onPress: () => void;
}

const ShelfChip: React.FC<ShelfChipProps> = ({ shelfId, shelfName, bookCount, covers, onPress }) => {
    const { lang } = useI18n();
    const [imageError, setImageError] = useState(false);

    const coverToShow = covers.length > 0 ? covers[0] : null;

    useEffect(() => {
        setImageError(false);
    }, [coverToShow]);

    const showFallback = !coverToShow || imageError;

    return (
        <button 
            onClick={onPress}
            className="w-full text-left group"
            aria-label={`Shelf: ${shelfName}, ${bookCount} books`}
        >
            <div className="p-4 rounded-2xl backdrop-blur-sm bg-black/5 dark:bg-white/[0.06] border border-black/10 dark:border-white/10 transition-all duration-200 group-hover:shadow-lg group-hover:border-white/20">
                <div className="flex items-center gap-2">
                    <ShelvesIcon className="h-4 w-4 text-slate-500/80 dark:text-white/60" />
                    <BilingualText role="Caption" className="uppercase !text-xs !tracking-wider">
                        {lang === 'en' ? 'From the shelf' : 'من الرف'}
                    </BilingualText>
                </div>
                
                <div className="mt-3 flex items-center gap-4">
                    <div className="w-14 h-20 rounded-md overflow-hidden flex-shrink-0 bg-slate-800 flex items-center justify-center border-2 border-slate-700 shadow-md">
                        {showFallback ? (
                            <BookIcon className="w-8 h-8 text-slate-600" />
                        ) : (
                            <img
                                src={coverToShow!}
                                alt="Shelf cover"
                                className="w-full h-full object-cover"
                                onError={() => setImageError(true)}
                            />
                        )}
                    </div>

                    <div className="self-center">
                        <BilingualText role="H1" className="!text-xl group-hover:text-accent transition-colors">
                            {shelfName}
                        </BilingualText>
                    </div>
                </div>
            </div>
        </button>
    );
};

export default ShelfChip;