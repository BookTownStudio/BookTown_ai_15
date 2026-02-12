import React from 'react';
import BookFlowPage from '../../components/content/BookFlowPage.tsx';
// FIX: Replace mockBookFlowIds with the new mockBookFlowData
import { mockBookFlowData } from '../../data/mocks.ts';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import Button from '../../components/ui/Button.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';

const BookFlowFeedScreen: React.FC = () => {
    const { navigate } = useNavigation();
    const { lang } = useI18n();

    const handleBack = () => {
        navigate({ type: 'tab', id: 'home' });
    };

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-20 bg-transparent">
                <div className="container mx-auto flex h-20 items-center justify-start p-4">
                    <Button
                        variant="icon"
                        onClick={handleBack}
                        className="bg-black/20 backdrop-blur-sm !text-white border border-white/30"
                        aria-label={lang === 'en' ? 'Back to Home' : 'العودة إلى الرئيسية'}
                    >
                        <ChevronLeftIcon className="h-6 w-6" />
                    </Button>
                </div>
            </header>
            <div className="h-screen w-screen bg-black overflow-y-auto scroll-snap-type-y-mandatory">
                {mockBookFlowData.map((item, index) => (
                    <BookFlowPage key={`${item.bookId}-${index}`} item={item} />
                ))}
            </div>
        </>
    );
};

// Add scroll snap style helper
const style = document.createElement('style');
style.innerHTML = `
.scroll-snap-type-y-mandatory {
    scroll-snap-type: y mandatory;
}
`;
document.head.appendChild(style);

export default BookFlowFeedScreen;
