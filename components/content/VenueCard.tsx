import React from 'react';
import { Venue } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import { MapPinIcon } from '../icons/MapPinIcon.tsx';
import { getSpaceAuthoritySignal, getSpaceSubtypeLabel } from '../../lib/spaces/domain.ts';

interface VenueCardProps {
    venue: Venue;
    onClick: () => void;
}

const VenueCard: React.FC<VenueCardProps> = ({ venue, onClick }) => {
    const { lang } = useI18n();
    const authoritySignal = getSpaceAuthoritySignal(venue.authorityProfile, venue.governanceStatus);
    const typeLabel = getSpaceSubtypeLabel('venue', venue.spaceSubtype || venue.type, lang);

    return (
        <button onClick={onClick} className="w-full text-left group">
            <GlassCard className="!p-0 overflow-hidden h-full flex flex-col transition-all duration-300 group-hover:bg-black/5 dark:group-hover:bg-white/10">
                <div className="h-32 w-full overflow-hidden">
                    <img src={venue.imageUrl} alt={venue.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </div>
                <div className="p-4 flex-grow flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                        <BilingualText className="font-bold">{venue.name}</BilingualText>
                        {authoritySignal && (
                            <span className="rounded-sm border border-accent/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                                {authoritySignal}
                            </span>
                        )}
                    </div>
                    <BilingualText role="Caption" className="!text-accent">{typeLabel}</BilingualText>
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
