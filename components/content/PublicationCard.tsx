import React from 'react';
import { ClockIcon } from '../icons/ClockIcon.tsx';
import type { OwnedLongformPublicationRecord } from '../../services/db.types.ts';
import CanonicalCoverArtwork from './CanonicalCoverArtwork.tsx';

interface PublicationCardProps {
    publication: OwnedLongformPublicationRecord;
    onPress: () => void;
}

const formatPublishedDate = (value: string): string => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return 'Recently published';
    }

    return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
};

const formatPublicationType = (value: string): string => {
    if (value === 'blog_longform') {
        return 'Blog Longform';
    }
    return value.replace(/_/g, ' ').trim() || 'Publication';
};

const PublicationCard: React.FC<PublicationCardProps> = ({ publication, onPress }) => {
    return (
        <button
            type="button"
            onClick={onPress}
            className="group flex h-full w-full flex-col overflow-hidden rounded-[26px] border border-[#d8ccb7] bg-[#f3ead9] text-left shadow-[0_12px_36px_rgba(0,0,0,0.08)] transition-transform duration-200 hover:-translate-y-1"
        >
            <div className="aspect-[16/8] w-full overflow-hidden bg-[#ddd1bc]">
                <CanonicalCoverArtwork
                    title={publication.title}
                    coverUrl={publication.coverUrl}
                    coverMode={publication.coverMode}
                    fallbackCover={publication.fallbackCover}
                    variant="landscape"
                    className="transition-transform duration-300 group-hover:scale-[1.03]"
                    imageClassName="transition-transform duration-300 group-hover:scale-[1.03]"
                />
            </div>

            <div className="flex flex-1 flex-col px-5 py-5">
                <div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-[#8b7a66]">
                    {formatPublicationType(publication.publicationType)}
                </div>
                <h3 className="mb-3 line-clamp-2 text-xl font-semibold leading-tight text-[#171512]">
                    {publication.title}
                </h3>
                <p className="mb-5 line-clamp-3 text-sm leading-6 text-[#5d5145]">
                    {publication.excerpt}
                </p>
                <div className="mt-auto flex items-center justify-between text-xs text-[#7a6d60]">
                    <span>{formatPublishedDate(publication.lastPublishedAt)}</span>
                    <span className="inline-flex items-center gap-1">
                        <ClockIcon className="h-3.5 w-3.5" />
                        {publication.estimatedReadingMinutes} min
                    </span>
                </div>
            </div>
        </button>
    );
};

export default PublicationCard;
