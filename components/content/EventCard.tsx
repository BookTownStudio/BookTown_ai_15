import React from 'react';
import { Event } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import { CalendarIcon } from '../icons/CalendarIcon.tsx';
import { GlobeIcon } from '../icons/GlobeIcon.tsx';
import { LockIcon } from '../icons/LockIcon.tsx';

interface EventCardProps {
    event: Event;
    onClick: () => void;
}

const EventCard: React.FC<EventCardProps> = ({ event, onClick }) => {
    const { lang } = useI18n();
    const eventDate = new Date(event.dateTime).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
    const eventTime = new Date(event.dateTime).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: 'numeric', minute: '2-digit' });

    return (
        <button onClick={onClick} className="w-full text-left group">
            <GlassCard className="!p-0 overflow-hidden h-full flex flex-col transition-all duration-300 group-hover:bg-black/5 dark:group-hover:bg-white/10">
                <div className="h-32 w-full overflow-hidden">
                    <img src={event.imageUrl} alt={lang === 'en' ? event.titleEn : event.titleAr} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </div>
                <div className="p-4 flex-grow flex flex-col">
                    <div className="flex justify-between items-start">
                        <BilingualText className="font-bold line-clamp-2 flex-grow">{lang === 'en' ? event.titleEn : event.titleAr}</BilingualText>
                        {event.privacy === 'private' && (
                            <LockIcon className="h-4 w-4 text-slate-500 flex-shrink-0 ml-2 mt-1" />
                        )}
                    </div>
                    <BilingualText role="Caption" className="!text-accent">{event.type}</BilingualText>
                    <div className="flex items-center gap-1.5 mt-2 text-slate-500 dark:text-white/60">
                        {event.isOnline ? (
                            <><GlobeIcon className="h-4 w-4 flex-shrink-0" /><BilingualText role="Caption">Online Event</BilingualText></>
                        ) : (
                            <><CalendarIcon className="h-4 w-4 flex-shrink-0"/><BilingualText role="Caption">{eventDate} @ {eventTime}</BilingualText></>
                        )}
                    </div>
                </div>
            </GlassCard>
        </button>
    );
};

export default EventCard;