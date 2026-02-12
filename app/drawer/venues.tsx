import React, { useState, useMemo } from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import InputField from '../../components/ui/InputField.tsx';
import { useVenuesAndEvents } from '../../lib/hooks/useVenuesAndEvents.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { Venue, Event } from '../../types/entities.ts';
import VenueCard from '../../components/content/VenueCard.tsx';
import EventCard from '../../components/content/EventCard.tsx';
import { PlusIcon } from '../../components/icons/PlusIcon.tsx';
import CreateVenueModal from '../../components/modals/CreateVenueModal.tsx';
import Button from '../../components/ui/Button.tsx';

type VenuesTab = 'locations' | 'events';

const VenuesScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<VenuesTab>('locations');
    const { data, isLoading, isError } = useVenuesAndEvents(searchQuery);
    const [isCreateModalOpen, setCreateModalOpen] = useState(false);

    const handleBack = () => navigate({ type: 'tab', id: 'home' });

    const { locations, events } = useMemo(() => {
        if (!data) return { locations: [], events: [] };
        const locs = data.filter(item => 'address' in item) as Venue[];
        const evs = data.filter(item => 'dateTime' in item) as Event[];
        return { locations: locs, events: evs };
    }, [data]);
    
    const handleItemClick = (itemId: string) => {
        navigate({ type: 'immersive', id: 'venueDetails', params: { venueId: itemId, from: currentView } });
    }

    const renderContent = () => {
        if (isLoading) {
            return <div className="flex-grow flex items-center justify-center"><LoadingSpinner /></div>;
        }

        if (isError) {
            return <div className="flex-grow flex items-center justify-center"><BilingualText>Error loading data.</BilingualText></div>;
        }

        if (activeTab === 'locations') {
            return locations.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {locations.map(venue => <VenueCard key={venue.id} venue={venue} onClick={() => handleItemClick(venue.id)} />)}
                </div>
            ) : <BilingualText className="text-center text-white/60 pt-8">No locations found.</BilingualText>;
        }

        if (activeTab === 'events') {
            return events.length > 0 ? (
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {events.map(event => <EventCard key={event.id} event={event} onClick={() => handleItemClick(event.id)} />)}
                </div>
            ) : <BilingualText className="text-center text-white/60 pt-8">No events found.</BilingualText>;
        }
    };

    const TABS = [
        { id: 'locations', en: 'Locations', ar: 'الأماكن' },
        { id: 'events', en: 'Events', ar: 'الفعاليات' },
    ];

    return (
        <>
            <div className="h-screen flex flex-col">
                <ScreenHeader titleEn="Venues" titleAr="الأماكن" onBack={handleBack} />
                <main className="flex-grow overflow-y-auto pt-20 pb-8">
                    <div className="container mx-auto px-4 md:px-8 h-full">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex-grow">
                                <InputField
                                    id="venue-search"
                                    label=""
                                    type="search"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder={lang === 'en' ? 'Search bookshops, libraries, or fairs...' : 'ابحث عن متاجر كتب، مكتبات، أو معارض...'}
                                />
                            </div>
                             <Button variant="primary" onClick={() => setCreateModalOpen(true)} className="!px-3 !h-11 flex-shrink-0">
                                <PlusIcon className="h-5 w-5" />
                            </Button>
                        </div>
                        
                        <div className="my-4 border-b border-white/10 flex items-center">
                            {TABS.map(tab => (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id as VenuesTab)} className={`flex-1 py-3 text-center font-semibold border-b-2 transition-colors ${activeTab === tab.id ? 'text-accent border-accent' : 'text-white/60 border-transparent hover:text-white'}`}>
                                    {lang === 'en' ? tab.en : tab.ar}
                                </button>
                            ))}
                        </div>

                        {renderContent()}
                    </div>
                </main>
            </div>
            <CreateVenueModal
                isOpen={isCreateModalOpen}
                onClose={() => setCreateModalOpen(false)}
            />
        </>
    );
};
export default VenuesScreen;