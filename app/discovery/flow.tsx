import React, { useState, useRef, useCallback } from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import Button from '../../components/ui/Button.tsx';
import { XIcon } from '../../components/icons/XIcon.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { ForYouFlowItem, Quote, Venue, Event, BookFair } from '../../types/entities.ts';
import { mockBookFlowData, mockForYouFlowData } from '../../data/mocks.ts';
import BookFlowActions from '../../components/content/BookFlowActions.tsx';

// Content for Books (from bookflow/feed.tsx)
import BookFlowPage from '../../components/content/BookFlowPage.tsx';

// Content for People (from immersive/people-flow.tsx)
import { useSuggestedProfiles } from '../../lib/hooks/useSuggestedProfiles.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import UserFlowCard from '../../components/content/UserFlowCard.tsx';

type Segment = 'books' | 'people' | 'for-you';

const BooksSegment: React.FC = () => (
    <div className="h-full w-full bg-black overflow-y-scroll snap-y snap-mandatory scrollbar-hide">
        {mockBookFlowData.map((item, index) => (
            <BookFlowPage key={`${item.bookId}-${index}`} item={item} />
        ))}
    </div>
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

// Inlined component for displaying quotes in the "For You" feed
const QuoteFlowCard: React.FC<{ quote: Quote }> = ({ quote }) => {
    const { navigate, currentView } = useNavigation();
    const { lang } = useI18n();

    const handleNavigateToDetails = () => {
        // OwnerId is hardcoded as 'alex_doe' for mock user quotes
        navigate({ type: 'immersive', id: 'quoteDetails', params: { quoteId: quote.id, ownerId: 'alex_doe', from: currentView } });
    };

    return (
        <div 
            className="relative h-screen w-full flex-shrink-0 scroll-snap-align-start cursor-pointer bg-gradient-to-br from-slate-800 to-slate-900"
            onClick={handleNavigateToDetails}
            aria-label={`View details for quote`}
        >
            <div className="relative z-10 flex flex-col h-full justify-center items-center p-8 text-center text-white">
                <BilingualText role="Quote" className="!text-3xl !text-white !border-white/50 drop-shadow-lg">
                    {lang === 'en' ? quote.textEn : quote.textAr}
                </BilingualText>
                <BilingualText role="Caption" className="mt-4 text-white/80 drop-shadow-md">
                    — {lang === 'en' ? quote.sourceEn : quote.sourceAr}
                </BilingualText>
            </div>
            <BookFlowActions entityType="quote" entityId={quote.id} />
        </div>
    );
};

const VenueFlowCard: React.FC<{ venue: Venue }> = ({ venue }) => {
    const { lang } = useI18n();

    return (
        <div 
            className="relative h-screen w-full flex-shrink-0 scroll-snap-align-start cursor-pointer group overflow-hidden"
            onClick={() => alert(`Navigating to details for venue: ${venue.name}`)}
        >
            <img src={venue.imageUrl} alt={venue.name} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
            
            <div className="relative z-10 flex flex-col h-full justify-end p-8 text-white">
                <BilingualText role="Caption" className="!text-accent uppercase tracking-widest">{venue.type}</BilingualText>
                <BilingualText role="H1" className="!text-4xl mt-1 !text-white drop-shadow-lg">{venue.name}</BilingualText>
                <BilingualText role="Body" className="mt-2 text-white/80">{venue.address}</BilingualText>
                <BilingualText role="Body" className="mt-4 text-white/90 max-w-lg">
                    {lang === 'en' ? venue.descriptionEn : venue.descriptionAr}
                </BilingualText>
            </div>
            <BookFlowActions entityType="venue" entityId={venue.id} />
        </div>
    );
};

const EventFlowCard: React.FC<{ event: Event }> = ({ event }) => {
    const { lang } = useI18n();
    const eventDate = new Date(event.dateTime).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const eventTime = new Date(event.dateTime).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' });

    return (
        <div 
            className="relative h-screen w-full flex-shrink-0 scroll-snap-align-start cursor-pointer group overflow-hidden"
            onClick={() => alert(`Navigating to details for event: ${event.titleEn}`)}
        >
            <img src={event.imageUrl} alt={lang === 'en' ? event.titleEn : event.titleAr} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/70" />
            
            <div className="relative z-10 flex flex-col h-full justify-center items-center p-8 text-center text-white">
                <BilingualText role="Caption" className="!text-accent uppercase tracking-widest">{event.type}</BilingualText>
                <BilingualText role="H1" className="!text-5xl mt-2 !text-white drop-shadow-lg">{lang === 'en' ? event.titleEn : event.titleAr}</BilingualText>
                <div className="mt-6 p-4 border-2 border-dashed border-white/50 rounded-lg">
                    <BilingualText role="Body" className="!text-xl text-white/90">{eventDate}</BilingualText>
                    <BilingualText role="Body" className="!text-xl text-white/90">{eventTime}</BilingualText>
                    <BilingualText role="Body" className="mt-2 text-white/80">@ {event.venueName}</BilingualText>
                </div>
            </div>
            <BookFlowActions entityType="event" entityId={event.id} />
        </div>
    );
};

const BookFairFlowCard: React.FC<{ bookfair: BookFair }> = ({ bookfair }) => {
    const { lang } = useI18n();
    
    return (
        <div 
            className="relative h-screen w-full flex-shrink-0 scroll-snap-align-start cursor-pointer group overflow-hidden"
            onClick={() => alert(`Navigating to details for fair: ${bookfair.nameEn}`)}
        >
            <img src={bookfair.imageUrl} alt={lang === 'en' ? bookfair.nameEn : bookfair.nameAr} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/80 via-accent/50 to-transparent opacity-80" />
            
            <div className="relative z-10 flex flex-col h-full justify-between p-8 text-white">
                <div>
                    <BilingualText role="H1" className="!text-5xl !text-white drop-shadow-lg leading-tight">
                        {lang === 'en' ? bookfair.nameEn : bookfair.nameAr}
                    </BilingualText>
                    <BilingualText role="Body" className="!text-xl mt-2 text-white/90 drop-shadow-md">
                        {lang === 'en' ? bookfair.taglineEn : bookfair.taglineAr}
                    </BilingualText>
                </div>

                <div className="bg-black/30 backdrop-blur-md p-4 rounded-lg border border-white/20">
                    <BilingualText role="Body" className="!text-2xl text-white font-bold">{bookfair.dates}</BilingualText>
                    <BilingualText role="Body" className="mt-1 text-white/80">{bookfair.location}</BilingualText>
                </div>
            </div>
            <BookFlowActions entityType="bookfair" entityId={bookfair.id} />
        </div>
    );
};


const ForYouSegment: React.FC = () => {
    return (
        <div className="h-full w-full bg-slate-900 overflow-y-scroll snap-y snap-mandatory scrollbar-hide">
            {mockForYouFlowData.map((item, index) => {
                switch (item.type) {
                    case 'book':
                        return <BookFlowPage key={`foryou-book-${index}`} item={item.data} />;
                    case 'user':
                        return <UserFlowCard key={`foryou-user-${index}`} user={item.data} />;
                    case 'quote':
                        return <QuoteFlowCard key={`foryou-quote-${index}`} quote={item.data} />;
                    case 'venue':
                        return <VenueFlowCard key={`foryou-venue-${index}`} venue={item.data} />;
                    case 'event':
                        return <EventFlowCard key={`foryou-event-${index}`} event={item.data} />;
                    case 'bookfair':
                        return <BookFairFlowCard key={`foryou-bookfair-${index}`} bookfair={item.data} />;
                    default:
                        return null;
                }
            })}
        </div>
    );
};


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