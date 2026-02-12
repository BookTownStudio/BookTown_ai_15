import React from 'react';
import { Venue } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import { MapPinIcon } from '../icons/MapPinIcon.tsx';

interface VenueCardProps {
    venue: Venue;
    onClick: () => void;
}

const VenueCard: React.FC<VenueCardProps> = ({ venue, onClick }) => {
    const { lang } = useI18n();

    return (
        <button onClick={onClick} className="w-full text-left group">
            <GlassCard className="!p-0 overflow-hidden h-full flex flex-col transition-all duration-300 group-hover:bg-black/5 dark:group-hover:bg-white/10">
                <div className="h-32 w-full overflow-hidden">
                    <img src={venue.imageUrl} alt={venue.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </div>
                <div className="p-4 flex-grow flex flex-col">
                    <BilingualText className="font-bold">{venue.name}</BilingualText>
                    <BilingualText role="Caption" className="!text-accent">{venue.type}</BilingualText>
                    <div className="flex items-center gap-1.5 mt-2 text-slate-500 dark:text-white/60">
                        <MapPinIcon className="h-4 w-4 flex-shrink-0"/>
                        <BilingualText role="Caption" className="line-clamp-1">{venue.address}</BilingualText>
                    </div>
                </div>
            </GlassCard>
        </button>
    );
};

export default VenueCard;