
import React, { useState } from 'react';
import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import { useVenueDetails } from '../lib/hooks/useVenueDetails.ts';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import BilingualText from '../components/ui/BilingualText.tsx';
import Button from '../components/ui/Button.tsx';
import { ChevronLeftIcon } from '../components/icons/ChevronLeftIcon.tsx';
import { MapPinIcon } from '../components/icons/MapPinIcon.tsx';
import { ClockIcon } from '../components/icons/ClockIcon.tsx';
import { CalendarIcon } from '../components/icons/CalendarIcon.tsx';
import { useSaveVenue } from '../lib/hooks/useSaveVenue.ts';
import { useVenueReviews } from '../lib/hooks/useVenueReviews.ts';
import { useSubmitVenueReview } from '../lib/hooks/useSubmitVenueReview.ts';
import StarRatingInput from '../components/ui/StarRatingInput.tsx';
import VenueReviewCard from '../components/content/VenueReviewCard.tsx';
import { GlobeIcon } from '../components/icons/GlobeIcon.tsx';

const VenueDetailsScreen: React.FC = () => {
    const { currentView, navigate, navigateToSocialAndHighlight } = useNavigation();
    const { lang } = useI18n();
    const venueId = currentView.type === 'immersive' ? currentView.params?.venueId : undefined;

    const { data: venue, isLoading, isError } = useVenueDetails(venueId);
    const { data: reviews, isLoading: isLoadingReviews } = useVenueReviews(venueId);
    const { mutate: submitReview, isLoading: isSubmittingReview } = useSubmitVenueReview();
    const { mutate: saveVenue, isLoading: isSaving } = useSaveVenue();

    const [isSaved, setIsSaved] = useState(false);
    const [rating, setRating] = useState(0);
    const [reviewText, setReviewText] = useState('');

    const handleBack = () => {
        const fromView = currentView.params?.from;
        const postId = currentView.params?.postId;

        if (fromView && fromView.type === 'tab' && fromView.id === 'social' && postId) {
             navigateToSocialAndHighlight(postId);
        } else if (fromView) {
            navigate(fromView);
        } else {
            navigate({ type: 'immersive', id: 'venues' });
        }
    };
    
    const handleSave = () => {
        if (venueId && !isSaved) {
            saveVenue(venueId, {
                onSuccess: () => setIsSaved(true)
            });
        }
    };

    const handleReviewSubmit = () => {
        if (rating === 0 || !venueId) return;
        submitReview({ venueId, rating, text: reviewText }, {
            onSuccess: () => {
                setRating(0);
                setReviewText('');
            }
        });
    };

    if (isLoading) {
        return <div className="h-screen w-full flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
    }
    
    if (isError || !venue) {
        return (
            <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-900">
                <BilingualText>Venue not found.</BilingualText>
                <Button onClick={handleBack} className="mt-4">Go Back</Button>
            </div>
        );
    }

    const isEvent = 'dateTime' in venue;
    const name = isEvent ? (lang === 'en' ? venue.titleEn : venue.titleAr) : venue.name;
    const saveButtonText = isEvent ? (lang === 'en' ? 'RSVP' : 'تسجيل الحضور') : (lang === 'en' ? 'Save Venue' : 'حفظ المكان');
    const savedButtonText = isEvent ? (lang === 'en' ? 'Attending' : 'ستحضر') : (lang === 'en' ? 'Saved' : 'محفوظ');
    
    const eventDate = isEvent ? new Date(venue.dateTime).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : '';
    const eventTime = isEvent ? new Date(venue.dateTime).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' }) : '';

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <header className="fixed top-0 left-0 right-0 z-20 bg-transparent">
                <div className="app-rail app-rail--default flex h-20 items-center justify-start px-0">
                    <Button variant="icon" onClick={handleBack} className="bg-black/40 backdrop-blur-sm !text-white" aria-label={lang === 'en' ? 'Back' : 'رجوع'}>
                        <ChevronLeftIcon className="h-6 w-6" />
                    </Button>
                </div>
            </header>
            <main className="flex-grow overflow-y-auto pb-8">
                <div className="relative h-64 w-full">
                    <img src={venue.imageUrl} alt={name} className="w-full h-full object-cover"/>
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent"></div>
                </div>

                <div className="app-rail app-rail--default -mt-16 relative z-10">
                    <BilingualText role="H1" className="!text-4xl text-white drop-shadow-lg">{name}</BilingualText>
                    <BilingualText role="Body" className="!text-lg !text-accent mt-1">{venue.type}</BilingualText>

                    <div className="mt-6 space-y-3 text-white/80">
                        {isEvent ? (
                            <>
                                <div className="flex items-center gap-3"><CalendarIcon className="h-5 w-5 text-accent"/><BilingualText>{eventDate} at {eventTime}</BilingualText></div>
                                {venue.duration && <div className="flex items-center gap-3"><ClockIcon className="h-5 w-5 text-accent"/><BilingualText>{lang === 'en' ? `Duration: ${venue.duration}` : `المدة: ${venue.duration}`}</BilingualText></div>}
                                {venue.isOnline && venue.link ? (
                                    <div className="flex items-center gap-3"><GlobeIcon className="h-5 w-5 text-accent"/><a href={venue.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline"><BilingualText>Online Event Link</BilingualText></a></div>
                                ) : (
                                    <div className="flex items-center gap-3"><MapPinIcon className="h-5 w-5 text-accent"/><BilingualText>@ {venue.venueName}</BilingualText></div>
                                )}
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-3"><MapPinIcon className="h-5 w-5 text-accent"/><BilingualText>{venue.address}</BilingualText></div>
                                <div className="flex items-center gap-3"><ClockIcon className="h-5 w-5 text-accent"/><BilingualText>{venue.openingHours}</BilingualText></div>
                            </>
                        )}
                    </div>
                    
                    <Button onClick={handleSave} disabled={isSaving || isSaved} className={`w-full mt-6 ${isSaved ? '!bg-green-500' : ''}`}>
                        {isSaving ? <LoadingSpinner/> : (isSaved ? savedButtonText : saveButtonText)}
                    </Button>
                    
                    {(!isEvent || (isEvent && !venue.isOnline)) && (
                        <div className="mt-6 h-40 w-full rounded-lg bg-slate-800 flex items-center justify-center text-slate-500">
                           <MapPinIcon className="h-8 w-8 mr-2"/> Map Placeholder
                        </div>
                    )}

                    <section className="mt-12">
                        <BilingualText role="H1" className="!text-2xl mb-4">{lang === 'en' ? 'Reviews' : 'المراجعات'}</BilingualText>
                        <div className="bg-slate-800/50 border border-white/10 rounded-card p-4 mb-6">
                            <BilingualText role="Body" className="font-semibold mb-3">{lang === 'en' ? 'Add Your Review' : 'أضف مراجعتك'}</BilingualText>
                            <div className="flex items-center justify-center mb-4"><StarRatingInput rating={rating} onRatingChange={setRating} /></div>
                            <div className="flex items-center gap-2">
                                <textarea
                                    value={reviewText}
                                    onChange={(e) => setReviewText(e.target.value)}
                                    placeholder={lang === 'en' ? 'Share your experience...' : 'شارك تجربتك...'}
                                    className="flex-grow bg-slate-700 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent transition-all duration-200 h-[44px] resize-none"
                                />
                                <Button variant="primary" onClick={handleReviewSubmit} disabled={rating === 0 || isSubmittingReview}>
                                    {isSubmittingReview ? <LoadingSpinner /> : (lang === 'en' ? 'Submit' : 'إرسال')}
                                </Button>
                            </div>
                        </div>
                        {isLoadingReviews && <div className="flex justify-center py-4"><LoadingSpinner/></div>}
                        {!isLoadingReviews && reviews && reviews.length > 0 && (
                            <div className="space-y-2">
                                {reviews.map(review => <VenueReviewCard key={review.id} review={review} />)}
                            </div>
                        )}
                        {!isLoadingReviews && (!reviews || reviews.length === 0) && (
                            <BilingualText className="text-center text-white/60 py-4">Be the first to leave a review!</BilingualText>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
};

export default VenueDetailsScreen;
