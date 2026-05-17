
import React, { useState } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import InputField from '../ui/InputField.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useVenuesAndEvents } from '../../lib/hooks/useVenuesAndEvents.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { Venue, Event } from '../../types/entities.ts';
import { MapPinIcon } from '../icons/MapPinIcon.tsx';
import { CalendarIcon } from '../icons/CalendarIcon.tsx';

interface AttachVenueModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (item: Venue | Event) => void;
}

const AttachVenueModal: React.FC<AttachVenueModalProps> = ({ isOpen, onClose, onSelect }) => {
    const { lang } = useI18n();
    const [searchQuery, setSearchQuery] = useState('');
    const { data: items, isLoading } = useVenuesAndEvents(searchQuery);
    const handleSelectVenue = (item: Venue | Event) => {
        onSelect(item);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="w-full max-w-lg">
                <BilingualText role="H1" className="!text-xl text-center mb-4">
                    {lang === 'en' ? 'Attach Location or Event' : 'إرفاق موقع أو فعالية'}
                </BilingualText>
                
                <InputField
                    id="venue-search-modal"
                    label=""
                    type="search"
                    placeholder={lang === 'en' ? 'Search places and events...' : 'ابحث عن أماكن وفعاليات...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                />
                
                <div className="mt-4 h-80 overflow-y-auto space-y-2">
                    {isLoading && <div className="flex justify-center pt-8"><LoadingSpinner /></div>}
                    
                    {!isLoading && items && items.length > 0 ? (
                        items.map(item => {
                            const isEvent = 'dateTime' in item;
                            const name = isEvent ? (lang === 'en' ? item.titleEn : item.titleAr) : item.name;
                            const sub = isEvent ? new Date(item.dateTime).toLocaleDateString() : item.address;
                            const Icon = isEvent ? CalendarIcon : MapPinIcon;

                            return (
                                <button
                                    key={item.id}
                                    onClick={() => handleSelectVenue(item)}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors border border-black/5 dark:border-white/5"
                                >
                                    <div className="w-10 h-10 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                        <Icon className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                                    </div>
                                    <div className="overflow-hidden">
                                        <BilingualText className="font-semibold truncate">{name}</BilingualText>
                                        <BilingualText role="Caption" className="truncate">
                                            {sub}
                                        </BilingualText>
                                    </div>
                                </button>
                            )
                        })
                    ) : (
                        !isLoading && (
                            <BilingualText className="text-center pt-8 text-slate-500">
                                {lang === 'en' ? 'No results found.' : 'لم يتم العثور على نتائج.'}
                            </BilingualText>
                        )
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default AttachVenueModal;
