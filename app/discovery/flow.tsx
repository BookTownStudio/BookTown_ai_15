import React, { useState, useRef, useCallback } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import Button from '../../components/ui/Button.tsx';
import { XIcon } from '../../components/icons/XIcon.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';

// Content for People (from immersive/people-flow.tsx)
import { useSuggestedProfiles } from '../../lib/hooks/useSuggestedProfiles.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import UserFlowCard from '../../components/content/UserFlowCard.tsx';

type Segment = 'books' | 'people' | 'for-you';

const UnavailableSegment: React.FC<{ titleEn: string; titleAr: string; messageEn: string; messageAr: string }> = ({
    titleEn,
    titleAr,
    messageEn,
    messageAr,
}) => {
    const { lang } = useI18n();
    return (
        <div className="h-full w-full flex items-center justify-center bg-slate-900 px-6 text-center">
            <div className="max-w-sm space-y-3">
                <BilingualText role="H1" className="!text-2xl !text-white">
                    {lang === 'en' ? titleEn : titleAr}
                </BilingualText>
                <BilingualText role="Body" className="text-white/65">
                    {lang === 'en' ? messageEn : messageAr}
                </BilingualText>
            </div>
        </div>
    );
};

const BooksSegment: React.FC = () => (
    <UnavailableSegment
        titleEn="Book flow unavailable"
        titleAr="تدفق الكتب غير متاح"
        messageEn="Book flow requires a backend-authored feed and is not available right now."
        messageAr="يتطلب تدفق الكتب موجزاً موثقاً من الخادم وهو غير متاح حالياً."
    />
);

const PeopleSegment: React.FC = () => {
    const { lang } = useI18n();
    const { data: profiles, isLoading, isError } = useSuggestedProfiles();

    if (isLoading) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-slate-900">
                <LoadingSpinner />
            </div>
        );
    }

    if (isError || !profiles || profiles.length === 0) {
        return (
            <div className="h-full w-full flex items-center justify-center bg-slate-900 text-center p-4">
                <BilingualText>
                    {lang === 'en' ? 'Could not load suggestions.' : 'تعذر تحميل الاقتراحات.'}
                </BilingualText>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-black overflow-y-scroll snap-y snap-mandatory scrollbar-hide">
            {profiles.map(user => (
                <UserFlowCard key={user.uid} user={user} />
            ))}
        </div>
    );
};

const ForYouSegment: React.FC = () => (
    <UnavailableSegment
        titleEn="For You unavailable"
        titleAr="قسم لك غير متاح"
        messageEn="Personalized discovery requires a backend-authored feed and is not available right now."
        messageAr="يتطلب الاكتشاف المخصص موجزاً موثقاً من الخادم وهو غير متاح حالياً."
    />
);


const DiscoveryFlowScreen: React.FC = () => {
    const { navigate, currentView } = useNavigation();
    const { lang } = useI18n();
    const [activeSegment, setActiveSegment] = useState<Segment>('books');
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const handleBack = () => {
        navigate(currentView.params?.from || { type: 'tab', id: 'home' });
    };

    const SEGMENTS: { id: Segment; en: string; ar: string }[] = [
        { id: 'books', en: 'Books', ar: 'الكتب' },
        { id: 'people', en: 'People', ar: 'أشخاص' },
        { id: 'for-you', en: 'For You', ar: 'لك' },
    ];

    const handleSegmentClick = (segment: Segment) => {
        const container = scrollContainerRef.current;
        if (container) {
            const segmentIndex = SEGMENTS.findIndex(s => s.id === segment);
            container.scrollTo({
                left: container.clientWidth * segmentIndex,
                behavior: 'smooth'
            });
        }
    };

    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (container) {
            const { scrollLeft, clientWidth } = container;
            if (clientWidth === 0) return;
            const activeIndex = Math.round(scrollLeft / clientWidth);
            const newActiveSegment = SEGMENTS[activeIndex]?.id;
            if (newActiveSegment && newActiveSegment !== activeSegment) {
                setActiveSegment(newActiveSegment);
            }
        }
    }, [activeSegment]);


    return (
        <div className="h-screen w-full flex flex-col bg-slate-900 overflow-hidden">
            <header className="fixed top-0 left-0 right-0 z-20 bg-slate-900/50 backdrop-blur-lg">
                <div className="container mx-auto flex h-20 items-center justify-between px-4">
                    <Button
                        variant="icon"
                        onClick={handleBack}
                        className="bg-black/20 !text-white"
                        aria-label={lang === 'en' ? 'Back to Home' : 'العودة إلى الرئيسية'}
                    >
                        <XIcon className="h-6 w-6" />
                    </Button>
                    <div className="flex-grow flex justify-center">
                        <div className="bg-black/20 p-1 rounded-full flex items-center">
                            {SEGMENTS.map(segment => (
                                <button
                                    key={segment.id}
                                    onClick={() => handleSegmentClick(segment.id)}
                                    className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                                        activeSegment === segment.id 
                                            ? 'bg-white text-slate-900' 
                                            : 'text-white/70 hover:bg-white/10'
                                    }`}
                                >
                                    {lang === 'en' ? segment.en : segment.ar}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="w-10"></div> {/* Spacer to balance the back button */}
                </div>
            </header>

            <main className="h-full w-full flex-grow pt-20">
                <div
                    ref={scrollContainerRef}
                    className="h-full w-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
                    onScroll={handleScroll}
                >
                    <div className="h-full w-full flex-shrink-0"><BooksSegment /></div>
                    <div className="h-full w-full flex-shrink-0"><PeopleSegment /></div>
                    <div className="h-full w-full flex-shrink-0"><ForYouSegment /></div>
                </div>
            </main>
        </div>
    );
};

// Add scroll snap style helper
const style = document.createElement('style');
style.innerHTML = `
.scroll-snap-type-y-mandatory {
    scroll-snap-type: y mandatory;
}
.scroll-snap-align-start {
    scroll-snap-align: start;
}
`;
document.head.appendChild(style);


export default DiscoveryFlowScreen;
