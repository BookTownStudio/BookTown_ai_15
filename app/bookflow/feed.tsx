import React from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import Button from '../../components/ui/Button.tsx';
import { ChevronLeftIcon } from '../../components/icons/ChevronLeftIcon.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';

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
            <div className="h-screen w-screen bg-black flex items-center justify-center px-6 text-center">
                <div className="max-w-sm space-y-3">
                    <BilingualText role="H1" className="!text-2xl !text-white">
                        {lang === 'en' ? 'Book flow unavailable' : 'تدفق الكتب غير متاح'}
                    </BilingualText>
                    <BilingualText role="Body" className="text-white/65">
                        {lang === 'en'
                            ? 'Book flow requires a backend-authored feed and is not available right now.'
                            : 'يتطلب تدفق الكتب موجزاً موثقاً من الخادم وهو غير متاح حالياً.'}
                    </BilingualText>
                </div>
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
