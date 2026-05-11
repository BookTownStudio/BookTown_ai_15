
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
import { getSpaceAuthoritySignal, getSpaceSubtypeLabel } from '../lib/spaces/domain.ts';
import { useSpaceEvents } from '../lib/hooks/useSpaceEvents.ts';
import EventCard from '../components/content/EventCard.tsx';
import { BookIcon } from '../components/icons/BookIcon.tsx';
import { AuthorsIcon } from '../components/icons/AuthorsIcon.tsx';
import { ChatIcon } from '../components/icons/ChatIcon.tsx';
import { useSpaceRelationshipSummaries } from '../lib/hooks/useSpaceRelationshipSummaries.ts';
import SpaceStewardshipPanel from '../components/spaces/SpaceStewardshipPanel.tsx';

const VenueDetailsScreen: React.FC = () => {
    const { currentView, navigate, navigateToSocialAndHighlight } = useNavigation();
    const { lang } = useI18n();
    const params = currentView.type === 'immersive' ? currentView.params : undefined;
    const venueId = typeof params?.venueId === 'string'
        ? params.venueId
        : typeof params?.spaceSlug === 'string'
            ? params.spaceSlug
            : undefined;

    const { data: venue, isLoading, isError } = useVenueDetails(venueId);
    const resolvedVenueId = venue && !('dateTime' in venue) ? venue.id : undefined;
    const reviewTargetId = venue?.id;
    const { data: reviews, isLoading: isLoadingReviews } = useVenueReviews(reviewTargetId);
    const { data: relatedEvents = [], isLoading: isLoadingRelatedEvents } = useSpaceEvents(resolvedVenueId);
    const bookIds = venue?.relationshipRefs?.bookIds || [];
    const authorIds = venue?.relationshipRefs?.authorIds || [];
    const { data: relationshipSummaries } = useSpaceRelationshipSummaries(bookIds, authorIds);
    const { mutate: submitReview, isPending: isSubmittingReview } = useSubmitVenueReview();
    const { mutate: saveVenue, isPending: isSaving } = useSaveVenue();

    const [isSaved, setIsSaved] = useState(false);
    const [rating, setRating] = useState(0);
    const [reviewText, setReviewText] = useState('');
    const [eventContinuityFilter, setEventContinuityFilter] = useState<'upcoming' | 'past'>('upcoming');

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
        if (reviewTargetId && !isSaved) {
            saveVenue(reviewTargetId, {
                onSuccess: () => setIsSaved(true)
            });
        }
    };

    const handleReviewSubmit = () => {
        if (rating === 0 || !reviewTargetId) return;
        submitReview({ venueId: reviewTargetId, rating, text: reviewText }, {
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
    const spaceType = isEvent ? 'event' : 'venue';
    const authoritySignal = getSpaceAuthoritySignal(venue.authorityProfile, venue.governanceStatus);
    const typeLabel = getSpaceSubtypeLabel(spaceType, venue.spaceSubtype || venue.type, lang);
    const isHistoricalEvent = isEvent && (venue.eventState === 'completed' || venue.continuity?.historicalRecord === true);
    const saveButtonText = isEvent ? (lang === 'en' ? 'RSVP' : 'تسجيل الحضور') : (lang === 'en' ? 'Save Venue' : 'حفظ المكان');
    const savedButtonText = isEvent ? (lang === 'en' ? 'Attending' : 'ستحضر') : (lang === 'en' ? 'Saved' : 'محفوظ');
    const upcomingEvents = relatedEvents.filter(event => event.eventState !== 'completed' && new Date(event.dateTime).getTime() >= Date.now());
    const pastEvents = relatedEvents.filter(event => event.eventState === 'completed' || new Date(event.dateTime).getTime() < Date.now());
    const activeContinuityFilter = upcomingEvents.length === 0 && pastEvents.length > 0 ? 'past' : eventContinuityFilter;
    const visibleContinuityEvents = activeContinuityFilter === 'upcoming' ? upcomingEvents : pastEvents;
    const provenanceLabel =
        venue.provenance?.source === 'system_seeded'
            ? (lang === 'en' ? 'BookTown seeded' : 'منسق من BookTown')
            : venue.authorityProfile?.claimState === 'institutional' || venue.authorityProfile?.claimState === 'verified'
                ? (lang === 'en' ? 'Institutional Space' : 'مساحة مؤسسية')
                : (lang === 'en' ? 'Community submitted' : 'أضافه المجتمع');
    const inboxStatus = venue.communication?.inboxStatus || 'disabled';
    const geographyLabel = !isEvent
        ? [venue.location?.city, venue.location?.country].filter(Boolean).join(', ')
        : venue.isOnline
            ? (lang === 'en' ? 'Online literary space' : 'مساحة أدبية رقمية')
            : venue.venueName || '';
    
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
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        <BilingualText role="Body" className="!text-lg !text-accent">{typeLabel}</BilingualText>
                        <span className="rounded-sm border border-white/15 px-2 py-1 text-xs uppercase tracking-wide text-white/60">
                            {provenanceLabel}
                        </span>
                        {authoritySignal && (
                            <span className="rounded-sm border border-accent/40 px-2 py-1 text-xs uppercase tracking-wide text-accent">
                                {authoritySignal}
                            </span>
                        )}
                        {isHistoricalEvent && (
                            <span className="rounded-sm border border-white/15 px-2 py-1 text-xs uppercase tracking-wide text-white/60">
                                {lang === 'en' ? 'Historical record' : 'سجل تاريخي'}
                            </span>
                        )}
                        {geographyLabel && (
                            <span className="rounded-sm border border-white/15 px-2 py-1 text-xs text-white/65">
                                {geographyLabel}
                            </span>
                        )}
                    </div>

                    {(bookIds.length > 0 || authorIds.length > 0) && (
                        <section className="mt-6">
                            <div className="mb-3">
                                <BilingualText role="Body" className="font-semibold text-white/85">
                                    {lang === 'en' ? 'Literary connections' : 'روابط أدبية'}
                                </BilingualText>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2">
                            {bookIds.length > 0 && (
                                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80">
                                        <BookIcon className="h-4 w-4 text-accent" />
                                        <span>{lang === 'en' ? 'Books in this orbit' : 'كتب في هذا المدار'}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {(relationshipSummaries?.books || bookIds.map(id => ({ id, labelEn: id, labelAr: id, imageUrl: undefined, subtitleEn: undefined, subtitleAr: undefined }))).map((book) => (
                                            <button
                                                key={book.id}
                                                onClick={() => navigate({ type: 'immersive', id: 'bookDetails', params: { bookId: book.id, from: currentView } })}
                                                className="flex w-full items-center gap-3 rounded-sm border border-white/10 px-2 py-2 text-left text-white/75 hover:border-accent hover:text-accent"
                                            >
                                                <span className="h-11 w-8 flex-shrink-0 overflow-hidden rounded-sm bg-slate-800">
                                                    {book.imageUrl && <img src={book.imageUrl} alt="" className="h-full w-full object-cover" />}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-semibold">{lang === 'en' ? book.labelEn : book.labelAr}</span>
                                                    {(book.subtitleEn || book.subtitleAr) && (
                                                        <span className="block truncate text-xs text-white/45">{lang === 'en' ? book.subtitleEn : book.subtitleAr || book.subtitleEn}</span>
                                                    )}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {authorIds.length > 0 && (
                                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80">
                                        <AuthorsIcon className="h-4 w-4 text-accent" />
                                        <span>{lang === 'en' ? 'Literary figures' : 'أسماء أدبية'}</span>
                                    </div>
                                    <div className="space-y-2">
                                        {(relationshipSummaries?.authors || authorIds.map(id => ({ id, labelEn: id, labelAr: id, imageUrl: undefined, subtitleEn: undefined, subtitleAr: undefined }))).map((author) => (
                                            <button
                                                key={author.id}
                                                onClick={() => navigate({ type: 'immersive', id: 'authorDetails', params: { authorId: author.id, from: currentView } })}
                                                className="flex w-full items-center gap-3 rounded-sm border border-white/10 px-2 py-2 text-left text-white/75 hover:border-accent hover:text-accent"
                                            >
                                                <span className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-slate-800">
                                                    {author.imageUrl && <img src={author.imageUrl} alt="" className="h-full w-full object-cover" />}
                                                </span>
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-semibold">{lang === 'en' ? author.labelEn : author.labelAr}</span>
                                                    {(author.subtitleEn || author.subtitleAr) && (
                                                        <span className="block truncate text-xs text-white/45">{lang === 'en' ? author.subtitleEn : author.subtitleAr || author.subtitleEn}</span>
                                                    )}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            </div>
                        </section>
                    )}

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

                    <Button
                        variant="ghost"
                        disabled={inboxStatus !== 'available'}
                        className="w-full mt-3 border border-white/10"
                    >
                        <ChatIcon className="mr-2 h-4 w-4" />
                        {inboxStatus === 'available'
                            ? (lang === 'en' ? 'Message Space' : 'راسل المساحة')
                            : (lang === 'en' ? 'Messages closed' : 'المراسلة مغلقة')}
                    </Button>
                    
                    {(!isEvent || (isEvent && !venue.isOnline)) && (
                        <div className="mt-6 rounded-md border border-white/10 bg-slate-800/50 p-4 text-white/70">
                            <div className="mb-2 flex items-center gap-2 font-semibold text-white/85">
                                <MapPinIcon className="h-5 w-5 text-accent" />
                                <span>{lang === 'en' ? 'Literary geography' : 'جغرافيا أدبية'}</span>
                            </div>
                            <BilingualText role="Body" className="text-white/65">
                                {geographyLabel || (isEvent ? venue.venueName : venue.address)}
                            </BilingualText>
                        </div>
                    )}

                    {!isEvent && (
                        <section className="mt-12">
                            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <BilingualText role="H1" className="!text-2xl">
                                    {lang === 'en' ? 'Events at this Space' : 'فعاليات هذه المساحة'}
                                </BilingualText>
                                <div className="flex rounded-md border border-white/10 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setEventContinuityFilter('upcoming')}
                                        className={`rounded-sm px-3 py-1 text-xs font-semibold ${activeContinuityFilter === 'upcoming' ? 'bg-accent text-slate-950' : 'text-white/60 hover:text-white'}`}
                                    >
                                        {lang === 'en' ? `Upcoming ${upcomingEvents.length}` : `القادمة ${upcomingEvents.length}`}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEventContinuityFilter('past')}
                                        className={`rounded-sm px-3 py-1 text-xs font-semibold ${activeContinuityFilter === 'past' ? 'bg-accent text-slate-950' : 'text-white/60 hover:text-white'}`}
                                    >
                                        {lang === 'en' ? `Past ${pastEvents.length}` : `السابقة ${pastEvents.length}`}
                                    </button>
                                </div>
                            </div>
                            {isLoadingRelatedEvents && <div className="flex justify-center py-4"><LoadingSpinner /></div>}
                            {!isLoadingRelatedEvents && visibleContinuityEvents.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {visibleContinuityEvents.slice(0, 4).map(event => (
                                        <EventCard
                                            key={event.id}
                                            event={event}
                                            onClick={() => navigate({
                                                type: 'immersive',
                                                id: 'venueDetails',
                                                params: {
                                                    venueId: event.id,
                                                    ...(event.identity?.slug ? { spaceSlug: event.identity.slug, canonicalSlug: event.identity.slug } : {}),
                                                    from: currentView,
                                                },
                                            })}
                                        />
                                    ))}
                                </div>
                            )}
                            {!isLoadingRelatedEvents && relatedEvents.length === 0 && (
                                <BilingualText className="text-center text-white/60 py-4">
                                    {lang === 'en' ? 'No public events recorded yet.' : 'لا توجد فعاليات عامة مسجلة بعد.'}
                                </BilingualText>
                            )}
                        </section>
                    )}

                    <SpaceStewardshipPanel
                        space={venue}
                        relatedEvents={relatedEvents}
                    />

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
