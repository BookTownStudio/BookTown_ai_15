import React from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import BookFlowActions from './BookFlowActions.tsx';
import { BookFlowItem } from '../../types/entities.ts';

interface BookFlowPageProps {
    item: BookFlowItem;
}

const BookFlowPage: React.FC<BookFlowPageProps> = ({ item }) => {
    const { navigate, currentView } = useNavigation();
    const { lang } = useI18n();

    const { bookId, bookCoverUrl, quoteTextEn, quoteTextAr, authorEn, authorAr } = item;

    const handleNavigateToDetails = () => {
        navigate({ type: 'immersive', id: 'bookDetails', params: { bookId, from: currentView } });
    };

    return (
        <div 
            className="relative h-screen w-full flex-shrink-0 scroll-snap-align-start cursor-pointer"
            onClick={handleNavigateToDetails}
            aria-label={`View details for ${lang === 'en' ? 'the book' : 'الكتاب'}`}
        >
            {/* Background Image */}
            <img src={bookCoverUrl} alt="Book Cover" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/50" />
            
            {/* Content Overlay */}
            <div className="relative z-10 flex flex-col h-full justify-center items-center p-8 text-center text-white">
                <BilingualText role="Quote" className="!text-3xl !text-white !border-white/50 drop-shadow-lg">
                    {lang === 'en' ? quoteTextEn : quoteTextAr}
                </BilingualText>
                <BilingualText role="Caption" className="mt-4 text-white/80 drop-shadow-md">
                    — {lang === 'en' ? authorEn : authorAr}
                </BilingualText>
            </div>
            
            {/* Actions */}
            <BookFlowActions entityType="book" entityId={bookId} />
        </div>
    );
};
// Add scroll snap align style
const style = document.createElement('style');
style.innerHTML = `
.scroll-snap-align-start {
    scroll-snap-align: start;
}
`;
document.head.appendChild(style);


export default BookFlowPage;