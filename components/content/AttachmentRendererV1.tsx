import React, { useEffect, useRef, useState } from 'react';

import { devInfo, devLog } from '../../lib/logging/devLog';
import { AttachmentAnalytics } from '../../lib/media/AttachmentAnalytics.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useBookCatalog } from '../../lib/hooks/useBookCatalog.ts';
import { useQuoteDetails } from '../../lib/hooks/useQuoteDetails.ts';
import { useAttachmentUrl } from '../../lib/hooks/useAttachmentUrl.ts';
import { cn } from '../../lib/utils.ts';

import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useAttachmentViewer } from '../../store/attachment-viewer.tsx';

import { AttachmentV1, PostAttachment } from '../../types/entities.ts';

import BilingualText from '../ui/BilingualText.tsx';
import GlassCard from '../ui/GlassCard.tsx';

import { BookIcon } from '../icons/BookIcon.tsx';
import { DraftIcon as FileIcon } from '../icons/DraftIcon.tsx';
import { EyeIcon } from '../icons/EyeIcon.tsx';
import { GlobeIcon } from '../icons/GlobeIcon.tsx';
import { MediaIcon } from '../icons/MediaIcon.tsx';
import { PlayIcon } from '../icons/PlayIcon.tsx';
import { TrashIcon } from '../icons/TrashIcon.tsx';
import { VerticalEllipsisIcon } from '../icons/VerticalEllipsisIcon.tsx';
import { VolumeXIcon } from '../icons/VolumeXIcon.tsx';

export type RenderSurface = 'home' | 'feed' | 'drawer' | 'read' | 'write';

const ACTION_MATRIX: Record<RenderSurface, string[]> = {
    home: ['open', 'preview'],
    feed: ['open', 'preview'],
    drawer: ['open'],
    read: ['open'],
    write: ['remove', 'reorder', 'replace']
};

const mediaFeedDiagnosticsLogged = new Set<string>();

interface AttachmentActionMenuProps {
    attachment: PostAttachment;
    surface: RenderSurface;
    onOpen: () => void;
    onRemove?: (id: string) => void;
    onClose: () => void;
}

const AttachmentActionMenu: React.FC<AttachmentActionMenuProps> = ({ attachment, surface, onOpen, onRemove, onClose }) => {
    const { lang, isRTL } = useI18n();
    const { user } = useAuth();
    
    const allowed = ACTION_MATRIX[surface];
    const isV1 = 'attachmentId' in attachment;
    const attachmentId = isV1 ? (attachment as AttachmentV1).attachmentId : 'legacy';
    
    const uploaderUid =
        isV1 &&
        typeof (attachment as AttachmentV1)?.metadata?.uploader?.uid === 'string'
            ? (attachment as AttachmentV1).metadata.uploader.uid
            : '';
    const canManage = surface === 'write' || (isV1 && uploaderUid === user?.uid);

    const handleAction = (action: () => void) => {
        action();
        onClose();
    };

    return (
        <div className={cn(
            "absolute z-[60] min-w-[160px] bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 animate-fade-in-up",
            isRTL ? "left-0 origin-top-left" : "right-0 origin-top-right"
        )}>
            {allowed.includes('open') && (
                <button 
                    onClick={() => handleAction(onOpen)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors"
                >
                    <EyeIcon className="h-4 w-4 text-accent" />
                    <span>{lang === 'en' ? 'Open' : 'فتح'}</span>
                </button>
            )}
            
            {allowed.includes('remove') && canManage && onRemove && (
                <button 
                    onClick={() => handleAction(() => onRemove(attachmentId))}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                >
                    <TrashIcon className="h-4 w-4" />
                    <span>{lang === 'en' ? 'Remove' : 'إزالة'}</span>
                </button>
            )}
        </div>
    );
};

const ImageView: React.FC<{
    attachment: PostAttachment;
    url: string;
    payload?: any;
    maxHeight?: number | string;
    surface: RenderSurface;
}> = ({ attachment, url, payload, maxHeight, surface }) => {
    devLog("IMAGE_VIEW_ACTIVE");

    const safePayload =
        payload && typeof payload === 'object'
            ? payload
            : {};

    const isExhibitionSurface = surface === 'feed';

    const fallbackAlt = 'attachment image';

    const resolvedAlt =
        typeof safePayload.alt === 'string' && safePayload.alt.trim().length > 0
            ? safePayload.alt
            : fallbackAlt;

    return (
        <div
            className={cn(
                "relative w-full overflow-hidden bg-slate-800 shadow-[0_14px_24px_-20px_rgba(0,0,0,0.72)]",
                isExhibitionSurface
                    ? "rounded-[0.7rem]"
                    : "rounded-xl"
            )}
            style={
                isExhibitionSurface
                    ? undefined
                    : { maxHeight }
            }
        >
            <img
                src={url}
                alt={resolvedAlt}
                loading="lazy"
                onLoad={() =>
                    AttachmentAnalytics.track('attachment_rendered', attachment, surface)
                }
                onError={() =>
                    AttachmentAnalytics.track('attachment_failed', attachment, surface)
                }
                className={cn(
                    "block w-full h-auto object-cover transition-opacity duration-300",
                    isExhibitionSurface && "scale-[1.01]"
                )}
            />

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent" />
        </div>
    );
};

const VideoView: React.FC<{ attachment: PostAttachment; payload?: any; maxHeight: number | string; surface: RenderSurface }> = ({ attachment, payload, maxHeight, surface }) => {
    const { lang } = useI18n();
    const safePayload =
        payload && typeof payload === 'object'
            ? payload
            : {};
    const isExhibitionSurface = surface === 'feed';
    useEffect(() => {
        AttachmentAnalytics.track('attachment_rendered', attachment, surface);
    }, [attachment, surface]);

    return (
        <div 
            className={cn(
                "relative overflow-hidden bg-black flex items-center justify-center",
                isExhibitionSurface
                    ? "rounded-[0.7rem] w-full max-h-[72dvh]"
                    : "rounded-lg"
            )}
            style={isExhibitionSurface ? undefined : { height: maxHeight }}
        >

            {typeof safePayload.thumbnail === 'string' && safePayload.thumbnail.length > 0 && (
                <img src={safePayload.thumbnail} alt="Poster" className="absolute inset-0 w-full h-full object-cover opacity-50" />
            )}
            {isExhibitionSurface && (
                <div className="pointer-events-none absolute left-4 top-4">
                    <AttachmentTypeLabel label="VIDEO" />
                </div>
            )}
            <div className="z-10 flex flex-col items-center">
                <PlayIcon className="h-10 w-10 text-white/50" />
                <BilingualText role="Caption" className="mt-2 !text-white/30">
                    {lang === 'en' ? 'Video Attachment' : 'مرفق فيديو'}
                </BilingualText>
            </div>
        </div>
    );
};

const AudioView: React.FC<{ attachment: PostAttachment; maxHeight: number | string; surface: RenderSurface }> = ({ attachment, maxHeight, surface }) => {
    const { lang } = useI18n();
    const isExhibitionSurface = surface === 'feed';
    useEffect(() => {
        AttachmentAnalytics.track('attachment_rendered', attachment, surface);
    }, [attachment, surface]);

    return (
        <div 
            className={cn(
                "flex items-center gap-3 p-3 bg-slate-800/40",
                isExhibitionSurface
                    ? "rounded-[0.9rem] min-h-[22vh] md:min-h-[26vh]"
                    : "rounded-lg"
            )}
            style={isExhibitionSurface ? undefined : { maxHeight }}
        >
            <div className="h-8 w-8 rounded-full bg-accent/10 flex items-center justify-center text-accent/50">
                <VolumeXIcon className="h-4 w-4" />
            </div>
            <div className="flex-grow h-1 bg-white/5 rounded-full" />
            <BilingualText role="Caption" className="!text-[10px] uppercase font-black opacity-30">
                {lang === 'en' ? 'Audio' : 'صوت'}
            </BilingualText>
        </div>
    );
};

const DocumentView: React.FC<{ attachment: PostAttachment; payload?: any; surface: RenderSurface }> = ({ attachment, payload, surface }) => {
    const { lang } = useI18n();
    const safePayload =
        payload && typeof payload === 'object'
            ? payload
            : {};
    useEffect(() => {
        AttachmentAnalytics.track('attachment_rendered', attachment, surface);
    }, [attachment, surface]);

    return (
        <GlassCard className={cn(
            "flex items-center gap-3 !p-3 border-dashed border-white/10 opacity-80 !shadow-none",
            surface === 'feed' && "rounded-[0.7rem] min-h-[20vh] !border-white/0 !bg-white/4"
        )}>
            <FileIcon className="h-5 w-5 text-slate-500" />
            <div className="min-w-0 flex-grow">
                <BilingualText className="font-bold text-sm truncate">
                    {(typeof safePayload.name === 'string' ? safePayload.name : '') || (lang === 'en' ? 'Document' : 'مستند')}
                </BilingualText>
                <BilingualText role="Caption" className="!text-[10px]">
                    {typeof safePayload.size === 'number' && Number.isFinite(safePayload.size)
                        ? `${(safePayload.size / 1024).toFixed(1)} KB`
                        : 'File'}
                </BilingualText>
            </div>
        </GlassCard>
    );
};

const AttachmentTypeLabel: React.FC<{ label: string }> = ({ label }) => (
    <span className="inline-flex items-center rounded-full border border-white/12 bg-black/34 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-white/74 uppercase shadow-[0_6px_16px_-12px_rgba(0,0,0,0.72)]">
        {label}
    </span>
);

const BookReferenceCard: React.FC<{ title: string; author: string; coverUrl?: string; rating?: number; surface?: RenderSurface }> = ({ title, author, coverUrl, rating = 0, surface = 'feed' }) => {
    const safeRating = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
    const isExhibitionSurface = surface === 'feed';
    return (
        <div className={cn(
            "relative overflow-hidden p-3",
            isExhibitionSurface
                ? "rounded-[0.7rem] bg-gradient-to-br from-[#081a2a] via-[#0a2235] to-[#0d2a40] px-4 py-4 shadow-[0_10px_22px_-16px_rgba(0,119,182,0.58)]"
                : "rounded-[0.95rem] border border-white/8 bg-[#0b1420]/92 shadow-none"
        )}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,119,182,0.26),transparent_56%)]" />
            <div className={cn(
                "relative flex items-start gap-3",
                isExhibitionSurface && "h-full"
            )}>
                <div className="flex-shrink-0">
                    {coverUrl ? (
                        <img src={coverUrl} className={cn(
                            "object-cover shadow-lg",
                            isExhibitionSurface ? "h-[46vh] md:h-[54vh] w-[38vw] max-w-[19rem] rounded-xl" : "h-28 w-20 rounded-lg shadow-none"
                        )} alt="" />
                    ) : (
                        <div className={cn(
                            "bg-white/10",
                            isExhibitionSurface ? "h-[46vh] md:h-[54vh] w-[38vw] max-w-[19rem] rounded-xl" : "h-28 w-20 rounded-lg"
                        )} />
                    )}
                </div>
                <div className={cn("min-w-0 flex-1", isExhibitionSurface && "flex flex-col justify-between h-full py-1")}>
                    <AttachmentTypeLabel label="Book" />
                    <div>
                        <BilingualText className={cn(
                            "mt-2 font-semibold leading-snug text-white",
                            isExhibitionSurface ? "text-[1.05rem] md:text-[1.15rem] line-clamp-3" : "text-[13px] truncate"
                        )}>{title}</BilingualText>
                        <BilingualText role="Caption" className={cn(
                            "mt-1 text-white/65",
                            isExhibitionSurface ? "!text-[12px] line-clamp-2" : "!text-[10px] truncate"
                        )}>{author}</BilingualText>
                    </div>
                    <div className={cn(
                        "mt-2 text-[#8ecdf2] tracking-wide",
                        isExhibitionSurface ? "text-[12px]" : "text-[11px]"
                    )}>{'★'.repeat(Math.round(safeRating)) || '☆☆☆☆☆'}</div>
                </div>
            </div>
        </div>
    );
};

const QuoteReferenceCard: React.FC<{ text: string; surface?: RenderSurface }> = ({ text, surface = 'feed' }) => {
    const isExhibitionSurface = surface === 'feed';
    return (
    <div className={cn(
        "relative px-4 py-3.5 text-slate-200",
        isExhibitionSurface
            ? "rounded-[0.7rem] bg-gradient-to-r from-[#111a24] to-[#0c1118] shadow-[0_10px_22px_-20px_rgba(255,255,255,0.35)] aspect-[4/5] max-h-[68dvh] flex flex-col justify-between"
            : "rounded-[0.95rem] border border-white/8 bg-[#0d1520]/94"
    )}>
        <div className="mt-3 flex gap-2">
            <span className={cn(
                "leading-none text-[#8ecdf2]",
                isExhibitionSurface ? "text-[2.3rem]" : "text-2xl"
            )}>“</span>
            <p className={cn(
                "italic text-white/80",
                isExhibitionSurface ? "text-[1rem] leading-[1.65] line-clamp-[10]" : "text-[13px] leading-relaxed line-clamp-3"
            )}>{text}</p>
        </div>
    </div>
    );
};

const AuthorReferenceCard: React.FC<{ name: string; avatarUrl?: string; country?: string }> = ({
    name,
    avatarUrl,
    country,
}) => (
    <div className="flex items-center gap-3 rounded-[0.95rem] border border-white/8 bg-[#0d1520]/92 px-3 py-3 shadow-none">
        {avatarUrl ? (
            <img src={avatarUrl} className="h-11 w-11 object-cover rounded-full shadow-md" alt="" />
        ) : (
            <div className="h-11 w-11 rounded-full bg-white/10" />
        )}
        <div className="min-w-0">
            <AttachmentTypeLabel label="Author" />
            <BilingualText className="font-semibold text-[12px] text-white/90 truncate">{name || 'Author'}</BilingualText>
            <BilingualText role="Caption" className="!text-[10px] text-white/55 truncate">{country || ''}</BilingualText>
        </div>
    </div>
);

const ShelfReferenceCard: React.FC<{ name: string; bookCount?: number; covers?: string[] }> = ({ name, bookCount, covers = [] }) => (
    <div className="relative rounded-[0.95rem] border border-white/8 bg-[#0c1624]/94 px-4 py-3.5 shadow-none min-h-[12rem]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,119,182,0.16),transparent_60%)]" />
        <div className="relative flex items-center gap-3 h-full">
            <div className="h-full min-h-[112px] w-[48%] max-w-[156px] rounded-[0.7rem] bg-white/10 flex items-center justify-center overflow-hidden">
                {covers.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1 p-1 w-full h-full">
                        {covers.slice(0, 4).map((cover, idx) => (
                            <img key={`${cover}-${idx}`} src={cover} alt="" className="h-full w-full object-cover rounded-sm" loading="lazy" />
                        ))}
                    </div>
                ) : (
                    <MediaIcon className="h-5 w-5 text-white/65" />
                )}
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-between py-1">
                <div>
                    <AttachmentTypeLabel label="Shelf" />
                    <BilingualText className="mt-2.5 font-semibold text-[15px] text-white/90 line-clamp-3">{name || 'Shelf'}</BilingualText>
                </div>
                <div className="mt-3 inline-flex w-fit items-center rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
                    {Number.isFinite(bookCount) ? `${Math.max(0, Math.trunc(bookCount as number))} books` : 'Collection'}
                </div>
            </div>
        </div>
    </div>
);

const VenueReferenceCard: React.FC<{ name?: string; type?: string; dateLabel?: string; locationLabel?: string }> = ({ name, type, dateLabel, locationLabel }) => (
    <div className="rounded-[0.95rem] border border-white/8 bg-[#0d1520]/92 px-3 py-3 shadow-none min-h-[8.5rem]">
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
                <AttachmentTypeLabel label="Venue" />
                <BilingualText className="mt-2 font-semibold text-[13px] text-white/92 truncate">
                    {dateLabel || name || 'Venue'}
                </BilingualText>
                <BilingualText role="Caption" className="!text-[10px] text-white/58 truncate">
                    {locationLabel || type || ''}
                </BilingualText>
            </div>
            <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center">
                <GlobeIcon className="h-4 w-4 text-white/70" />
            </div>
        </div>
    </div>
);

const PublicationReferenceCard: React.FC<{ title: string; coverUrl?: string; author?: string }> = ({
    title,
    coverUrl,
    author,
}) => (
    <div className="relative overflow-hidden rounded-[0.95rem] border border-white/8 bg-[#17120f]/94 px-4 py-4 shadow-none min-h-[10rem]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(231,193,128,0.18),transparent_58%)]" />
        <div className="relative flex items-start gap-3">
            <div className="h-24 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-white/10">
                {coverUrl ? (
                    <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))]">
                        <BookIcon className="h-5 w-5 text-[#d9c4a2]" />
                    </div>
                )}
            </div>
            <div className="min-w-0 flex-1">
                <AttachmentTypeLabel label="Publication" />
                <BilingualText className="mt-2 font-semibold text-[15px] leading-snug text-white line-clamp-3">
                    {title || 'Publication'}
                </BilingualText>
                <BilingualText role="Caption" className="mt-1 !text-[11px] text-white/65 line-clamp-2">
                    {author || 'Article in BookTown'}
                </BilingualText>
            </div>
        </div>
    </div>
);

const HookedBookReferenceView: React.FC<{ id: string; surface: RenderSurface }> = ({ id, surface }) => {
    const { data: book, isLoading } = useBookCatalog(id);
    if (isLoading) return <div className="h-16 bg-slate-800 animate-pulse rounded-lg" />;
    if (!book) return null;
    const rating =
        typeof (book as Record<string, unknown>).rating === 'number'
            ? ((book as Record<string, unknown>).rating as number)
            : 0;
    return (
        <BookReferenceCard
            title={book.titleEn}
            author={book.authorEn}
            coverUrl={book.coverUrl}
            rating={rating}
            surface={surface}
        />
    );
};

const HookedQuoteReferenceView: React.FC<{ id: string; owner?: string; surface: RenderSurface }> = ({ id, owner, surface }) => {
    const { data: quote, isLoading } = useQuoteDetails(id, owner);
    if (isLoading) return <div className="h-16 bg-slate-800 animate-pulse rounded-lg" />;
    if (!quote) return null;
    return <QuoteReferenceCard text={quote.textEn} surface={surface} />;
};

const UnresolvedReferenceView: React.FC = () => (
    <div className="p-3 bg-white/5 rounded-[0.7rem] text-[11px] text-slate-400">
        Reference unavailable
    </div>
);

const readNonEmptyString = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

const firstNonEmpty = (...values: unknown[]): string => {
    for (const value of values) {
        const normalized = readNonEmptyString(value);
        if (normalized.length > 0) {
            return normalized;
        }
    }
    return '';
};

type StructuredNavigationTarget =
    | { id: 'bookDetails'; params: { bookId: string } }
    | { id: 'authorDetails'; params: { authorId: string } }
    | { id: 'quoteDetails'; params: { quoteId: string; ownerId: string } }
    | { id: 'shelfDetails'; params: { shelfId: string; ownerId?: string } }
    | { id: 'venueDetails'; params: { venueId: string } }
    | { id: 'publicationReader'; params: { publicationId: string; title?: string; canonicalSlug?: string } };

const isStructuredAttachment = (attachment: PostAttachment): boolean => {
    if ('attachmentId' in attachment) {
        const v1 = attachment as AttachmentV1;
        return v1.type === 'BOOK_REFERENCE' || v1.type === 'QUOTE_REFERENCE';
    }

    const type = readNonEmptyString((attachment as any)?.type).toLowerCase();
    return (
        type === 'book' ||
        type === 'author' ||
        type === 'quote' ||
        type === 'shelf' ||
        type === 'venue' ||
        type === 'publication'
    );
};

const resolveStructuredNavigationTarget = (
    attachment: PostAttachment
): StructuredNavigationTarget | null => {
    if ('attachmentId' in attachment) {
        const v1 = attachment as AttachmentV1;
        if (v1.type === 'BOOK_REFERENCE') {
            const bookId =
                readNonEmptyString((v1.payload as any)?.entityId) ||
                readNonEmptyString((v1.payload as any)?.bookId);
            return bookId ? { id: 'bookDetails', params: { bookId } } : null;
        }
        if (v1.type === 'QUOTE_REFERENCE') {
            const quoteId =
                readNonEmptyString((v1.payload as any)?.entityId) ||
                readNonEmptyString((v1.payload as any)?.quoteId);
            const ownerId =
                readNonEmptyString((v1.payload as any)?.ownerId) ||
                readNonEmptyString((v1.payload as any)?.entityOwnerId) ||
                readNonEmptyString((v1.payload as any)?.quoteOwnerId);
            return quoteId && ownerId
                ? { id: 'quoteDetails', params: { quoteId, ownerId } }
                : null;
        }
        return null;
    }

    const legacy = attachment as any;
    const entityId = readNonEmptyString(legacy.entityId);
    if (legacy.type === 'book') {
        const bookId = entityId || readNonEmptyString(legacy.bookId);
        return bookId ? { id: 'bookDetails', params: { bookId } } : null;
    }
    if (legacy.type === 'author') {
        const authorId = entityId || readNonEmptyString(legacy.authorId);
        return authorId ? { id: 'authorDetails', params: { authorId } } : null;
    }
    if (legacy.type === 'quote') {
        const quoteId = entityId || readNonEmptyString(legacy.quoteId);
        const ownerId =
            readNonEmptyString(legacy.entityOwnerId) ||
            readNonEmptyString(legacy.quoteOwnerId) ||
            readNonEmptyString(legacy.ownerId);
        return quoteId && ownerId
            ? { id: 'quoteDetails', params: { quoteId, ownerId } }
            : null;
    }
    if (legacy.type === 'shelf') {
        const shelfId = entityId || readNonEmptyString(legacy.shelfId);
        const ownerId = readNonEmptyString(legacy.ownerId);
        if (!shelfId) return null;
        return ownerId
            ? { id: 'shelfDetails', params: { shelfId, ownerId } }
            : { id: 'shelfDetails', params: { shelfId } };
    }
    if (legacy.type === 'venue') {
        const venueId = entityId || readNonEmptyString(legacy.venueId);
        return venueId ? { id: 'venueDetails', params: { venueId } } : null;
    }
    if (legacy.type === 'publication') {
        const publicationId = entityId || readNonEmptyString(legacy.publicationId);
        const title = readNonEmptyString(legacy.title);
        const canonicalSlug = readNonEmptyString(legacy.canonicalSlug);
        return publicationId
            ? {
                id: 'publicationReader',
                params: {
                    publicationId,
                    ...(title ? { title } : {}),
                    ...(canonicalSlug ? { canonicalSlug } : {}),
                },
            }
            : null;
    }
    return null;
};

const ReferenceView: React.FC<{
    type: 'BOOK' | 'QUOTE';
    id: string;
    owner?: string;
    surface: RenderSurface;
    hydrated?: Record<string, unknown> | null;
}> = ({ type, id, owner, surface, hydrated }) => {
    if (type === 'BOOK') {
        const hydratedTitle =
            typeof hydrated?.titleEn === 'string'
                ? hydrated.titleEn
                : typeof hydrated?.titleAr === 'string'
                    ? hydrated.titleAr
                    : '';
        const hydratedAuthor =
            typeof hydrated?.authorEn === 'string'
                ? hydrated.authorEn
                : typeof hydrated?.authorAr === 'string'
                    ? hydrated.authorAr
                    : '';
        const hydratedCover = typeof hydrated?.coverUrl === 'string' ? hydrated.coverUrl : '';
        const hydratedRating = typeof hydrated?.rating === 'number' ? hydrated.rating : 0;

        if (hydratedTitle || hydratedAuthor || hydratedCover) {
            return (
                <BookReferenceCard
                    title={hydratedTitle || 'Book'}
                    author={hydratedAuthor}
                    coverUrl={hydratedCover}
                    rating={hydratedRating}
                    surface={surface}
                />
            );
        }

        if (surface === 'feed') {
            return <UnresolvedReferenceView />;
        }

        return <HookedBookReferenceView id={id} surface={surface} />;
    }

    const hydratedText =
        typeof hydrated?.textEn === 'string'
            ? hydrated.textEn
            : typeof hydrated?.textAr === 'string'
                ? hydrated.textAr
                : typeof (hydrated as any)?.quoteText === 'string'
                    ? (hydrated as any).quoteText
                    : '';

    if (hydratedText) {
        return <QuoteReferenceCard text={hydratedText} surface={surface} />;
    }

    if (surface === 'feed') {
        return <UnresolvedReferenceView />;
    }

    return <HookedQuoteReferenceView id={id} owner={owner} surface={surface} />;
};

interface AttachmentRendererV1Props {
    attachment: PostAttachment;
    surface: RenderSurface;
    onRemove?: (id: string) => void;
    autoLoad?: boolean;
}

const AttachmentRendererV1: React.FC<AttachmentRendererV1Props> = ({ attachment, surface, onRemove, autoLoad = true }) => {
    const { viewAttachment } = useAttachmentViewer();
    const { navigate, currentView } = useNavigation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isInViewport, setIsInViewport] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    
    const isV1 = 'attachmentId' in attachment;
    const v1 = isV1 ? (attachment as AttachmentV1) : null;
    const allowed = ACTION_MATRIX[surface];

    useEffect(() => {
        // autoLoad means eager-load this attachment without viewport gating.
        if (!isV1 || autoLoad) {
            setIsInViewport(true);
            return;
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsInViewport(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '100px', threshold: 0.1 }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, [isV1, autoLoad]);

    const v1Type = typeof v1?.type === 'string' ? v1.type.toUpperCase() : '';
    const v1Payload: Record<string, unknown> =
        v1?.payload && typeof v1.payload === 'object'
            ? (v1.payload as Record<string, unknown>)
            : {};
    const v1Metadata: Record<string, unknown> =
        v1?.metadata && typeof v1.metadata === 'object'
            ? (v1.metadata as Record<string, unknown>)
            : {};
    const resolveMediaSrc = (resolvedSignedUrl: string): string =>
        firstNonEmpty(
            resolvedSignedUrl,
            v1Payload.url,
            v1Payload.previewUrl,
            v1Payload.imageUrl,
            (v1Payload as Record<string, unknown>).downloadURL,
            (v1Payload as Record<string, unknown>).downloadUrl,
            v1Metadata.previewUrl,
            (v1Metadata as Record<string, unknown>).url,
            (v1Metadata as Record<string, unknown>).signedUrl
        );

    const isReferenceV1 =
        v1Type === 'BOOK_REFERENCE' || v1Type === 'QUOTE_REFERENCE';
    const shouldResolveSecureUrl =
        Boolean(isInViewport && v1) &&
        !isReferenceV1 &&
        v1Type !== 'LINK';
    const { data: secureUrl, isLoading: isResolvingUrl, isError: isUrlError } = useAttachmentUrl(
        shouldResolveSecureUrl ? v1!.attachmentId : undefined,
        surface
    );

    useEffect(() => {
        if (!import.meta.env.DEV || surface !== 'feed') return;

        const legacyType = !isV1
            ? readNonEmptyString((attachment as any)?.type).toLowerCase()
            : '';
        const isMediaLike = isV1
            ? v1Type === 'IMAGE' || v1Type === 'MEDIA'
            : legacyType === 'media' || legacyType === 'image';
        if (!isMediaLike) return;

        const diagnosticId = isV1
            ? firstNonEmpty(v1?.attachmentId, 'unknown')
            : firstNonEmpty((attachment as any)?.attachmentId, (attachment as any)?.id, 'legacy');
        const key = `${isV1 ? 'v1' : 'legacy'}:${diagnosticId}`;
        if (mediaFeedDiagnosticsLogged.has(key)) return;
        mediaFeedDiagnosticsLogged.add(key);

        devInfo('[SOCIAL][MEDIA_FEED_DIAGNOSTIC]', {
            key,
            isV1,
            type: isV1 ? v1Type : legacyType,
            isResolvingUrl,
            isUrlError,
            hasSecureUrl: Boolean(secureUrl?.url),
            payloadUrl: firstNonEmpty((v1Payload as any)?.url, (attachment as any)?.url),
            payloadPreviewUrl: firstNonEmpty((v1Payload as any)?.previewUrl, (attachment as any)?.previewUrl),
            payloadImageUrl: firstNonEmpty((v1Payload as any)?.imageUrl, (attachment as any)?.imageUrl),
            metadataPreviewUrl: firstNonEmpty((v1Metadata as any)?.previewUrl, (attachment as any)?.metadata?.previewUrl),
            storagePath: firstNonEmpty((v1Metadata as any)?.storagePath, (attachment as any)?.storagePath),
        });
    }, [
        attachment,
        isResolvingUrl,
        isUrlError,
        isV1,
        secureUrl?.url,
        surface,
        v1?.attachmentId,
        v1Metadata,
        v1Payload,
        v1Type,
    ]);

    const maxHeightMap: Record<RenderSurface, number> = {
        home: 160,
        feed: 560,
        drawer: 64,
        read: 480,
        write: 200
    };

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setIsMenuOpen(false);
            }
        };
        if (isMenuOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isMenuOpen]);

    const openAttachment = () => {
        const target = resolveStructuredNavigationTarget(attachment);
        if (target) {
            navigate({
                type: 'immersive',
                id: target.id,
                params: {
                    ...target.params,
                    from: currentView,
                },
            });
            return;
        }

        // Structured attachments must always route to entity pages and never open viewer.
        if (isStructuredAttachment(attachment)) {
            return;
        }

        viewAttachment(attachment);
    };

    const handlePrimaryClick = (e: React.MouseEvent) => {
        if (!allowed.includes('open')) return;
        e.stopPropagation();
        openAttachment();
    };

    const toggleMenu = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsMenuOpen(!isMenuOpen);
    };

    let visual = null;

    if (!isV1) {
        const legacy = attachment as any;
        switch (legacy.type) {
            case 'book':
                visual = (
                    <ReferenceView
                        type="BOOK"
                        id={legacy.bookId}
                        surface={surface}
                        hydrated={{
                            titleEn: legacy.bookTitle,
                            authorEn: legacy.bookAuthor,
                            coverUrl: legacy.bookCover,
                            rating: legacy.bookRating,
                        }}
                    />
                );
                break;
            case 'quote':
                visual = (
                    <ReferenceView
                        type="QUOTE"
                        id={legacy.quoteId}
                        owner={legacy.quoteOwnerId}
                        surface={surface}
                        hydrated={{
                            textEn: legacy.quoteText || legacy.textEn || legacy.textAr || '',
                        }}
                    />
                );
                break;
            case 'author':
                visual = (
                    <AuthorReferenceCard
                        name={
                            readNonEmptyString(legacy.authorName) ||
                            readNonEmptyString(legacy.name) ||
                            'Author'
                        }
                        avatarUrl={
                            readNonEmptyString(legacy.authorPhoto) ||
                            readNonEmptyString(legacy.avatarUrl) ||
                            ''
                        }
                        country={readNonEmptyString(legacy.authorCountry)}
                    />
                );
                break;
            case 'shelf':
                visual = (
                    <ShelfReferenceCard
                        name={
                            readNonEmptyString(legacy.shelfName) ||
                            readNonEmptyString(legacy.title) ||
                            'Shelf'
                        }
                        bookCount={typeof legacy.bookCount === 'number' ? legacy.bookCount : undefined}
                        covers={Array.isArray(legacy.covers) ? legacy.covers : []}
                    />
                );
                break;
            case 'venue':
                visual = (
                    <VenueReferenceCard
                        name={readNonEmptyString(legacy.venueName) || readNonEmptyString(legacy.title) || 'Venue'}
                        type={readNonEmptyString(legacy.venueType)}
                        dateLabel={
                            readNonEmptyString(legacy.eventDate) ||
                            readNonEmptyString(legacy.venueDate) ||
                            ''
                        }
                        locationLabel={
                            readNonEmptyString(legacy.location) ||
                            readNonEmptyString(legacy.venueLocation) ||
                            ''
                        }
                    />
                );
                break;
            case 'publication':
                visual = (
                    <PublicationReferenceCard
                        title={readNonEmptyString(legacy.title) || 'Publication'}
                        coverUrl={readNonEmptyString(legacy.coverUrl) || undefined}
                        author={readNonEmptyString(legacy.author) || undefined}
                    />
                );
                break;
            case 'media': {
                const legacyPayload =
                    legacy.payload && typeof legacy.payload === 'object'
                        ? legacy.payload as Record<string, unknown>
                        : {};
                const legacyMetadata =
                    legacy.metadata && typeof legacy.metadata === 'object'
                        ? legacy.metadata as Record<string, unknown>
                        : {};
                const legacyUrl = firstNonEmpty(
                    legacy.url,
                    legacy.previewUrl,
                    legacy.imageUrl,
                    legacyPayload.url,
                    legacyPayload.previewUrl,
                    legacyPayload.imageUrl,
                    legacyMetadata.previewUrl,
                    legacyMetadata.url
                );
                visual = legacyUrl
                    ? <ImageView attachment={attachment} url={legacyUrl} payload={legacyPayload} maxHeight={maxHeightMap[surface]} surface={surface} />
                    : <UnresolvedReferenceView />;
                break;
            }
            case 'image':
            case 'IMAGE': {
                const legacyPayload =
                    legacy.payload && typeof legacy.payload === 'object'
                        ? legacy.payload as Record<string, unknown>
                        : {};
                const legacyMetadata =
                    legacy.metadata && typeof legacy.metadata === 'object'
                        ? legacy.metadata as Record<string, unknown>
                        : {};
                const legacyUrl = firstNonEmpty(
                    legacy.url,
                    legacy.previewUrl,
                    legacy.imageUrl,
                    legacyPayload.url,
                    legacyPayload.previewUrl,
                    legacyPayload.imageUrl,
                    legacyMetadata.previewUrl,
                    legacyMetadata.url
                );
                visual = legacyUrl
                    ? <ImageView attachment={attachment} url={legacyUrl} payload={legacyPayload} maxHeight={maxHeightMap[surface]} surface={surface} />
                    : <UnresolvedReferenceView />;
                break;
            }
            default:
                if (isStructuredAttachment(attachment)) {
                    visual = <UnresolvedReferenceView />;
                    break;
                }
                return null;
        }
    } else {
        const resolvedUrl = resolveMediaSrc(
    secureUrl?.url || ''
);
        const requiresResolvedUrl = v1Type === 'IMAGE' || v1Type === 'MEDIA';

        const hasRenderableUrl = resolvedUrl.length > 0;

        if (!isInViewport || (shouldResolveSecureUrl && isResolvingUrl)) {
            visual = (
                <div
                    className={cn(
                        "flex items-center justify-center p-6 bg-white/5 rounded-[0.7rem] animate-pulse",
                        surface === 'feed' ? "aspect-[4/5]" : "min-h-[100px]"
                    )}
                >
                    <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-white/40">
                        {v1Type === 'VIDEO' ? 'VIDEO' : v1Type === 'AUDIO' ? 'AUDIO' : v1Type === 'DOCUMENT' ? 'DOC' : ''}
                    </div>
                </div>
            );
        } else if ((shouldResolveSecureUrl && isUrlError && !hasRenderableUrl) || (requiresResolvedUrl && !hasRenderableUrl)) {
             visual = (
                <div className="flex flex-col items-center justify-center p-6 bg-red-950/20 rounded-[0.7rem] text-red-400 text-[10px] text-center gap-2">
                    <VolumeXIcon className="h-4 w-4 opacity-50" />
                    <span>Attachment unavailable</span>
                </div>
            );
        } else {
           switch (v1Type) {

    case 'MEDIA':
    case 'IMAGE':
    visual = (
        <ImageView
            attachment={attachment}
            url={resolvedUrl}
            payload={v1Payload}
            maxHeight={maxHeightMap[surface]}
            surface={surface}
        />
    );
    break;

    case 'VIDEO':
        visual = <VideoView attachment={attachment} payload={v1Payload} maxHeight={maxHeightMap[surface]} surface={surface} />;
        break;

    case 'AUDIO':
        visual = <AudioView attachment={attachment} maxHeight={maxHeightMap[surface]} surface={surface} />;
        break;

    case 'DOCUMENT':
        visual = <DocumentView attachment={attachment} payload={v1Payload} surface={surface} />;
        break;

    case 'LINK':
        visual = (
            <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-xs opacity-60">
                <GlobeIcon className="h-4 w-4 inline mr-2" />
                {typeof v1Payload.url === 'string' ? v1Payload.url : ''}
            </div>
        );
        AttachmentAnalytics.track('attachment_rendered', attachment, surface);
        break;

    case 'BOOK_REFERENCE': {
        const entityId = typeof v1Payload.entityId === 'string' ? v1Payload.entityId : '';
        if (!entityId) {
            visual = <UnresolvedReferenceView />;
            break;
        }
        visual = (
            <ReferenceView
                type="BOOK"
                id={entityId}
                surface={surface}
                hydrated={
                    (v1Payload.hydratedEntity && typeof v1Payload.hydratedEntity === 'object')
                        ? v1Payload.hydratedEntity as Record<string, unknown>
                        : null
                }
            />
        );
        break;
    }

    case 'QUOTE_REFERENCE': {
        const entityId = typeof v1Payload.entityId === 'string' ? v1Payload.entityId : '';
        if (!entityId) {
            visual = <UnresolvedReferenceView />;
            break;
        }
        visual = (
            <ReferenceView
                type="QUOTE"
                id={entityId}
                owner={typeof v1Payload.ownerId === 'string' ? v1Payload.ownerId : undefined}
                surface={surface}
                hydrated={
                    (v1Payload.hydratedEntity && typeof v1Payload.hydratedEntity === 'object')
                        ? v1Payload.hydratedEntity as Record<string, unknown>
                        : null
                }
            />
        );
        break;
    }

    default:
        visual = <div className="p-4 border border-dashed opacity-30 flex items-center justify-center"><MediaIcon /></div>;
}
        }
    }

    return (
        <div 
            ref={containerRef}
            className={cn(
                "relative group w-full transition-opacity duration-200",
                allowed.includes('open') && "cursor-pointer active:opacity-90"
            )}
            onClick={handlePrimaryClick}
        >
            {visual}
            
            <div className="absolute top-2 right-2 flex gap-1" ref={menuRef}>
                <button 
                    onClick={toggleMenu}
                    className="p-1.5 rounded-full bg-black/40 text-white/70 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-black/60 hover:text-white"
                    aria-label="Attachment Actions"
                >
                    <VerticalEllipsisIcon className="h-4 w-4" />
                </button>

                {isMenuOpen && (
                    <AttachmentActionMenu 
                        attachment={attachment} 
                        surface={surface} 
                        onOpen={openAttachment}
                        onRemove={onRemove}
                        onClose={() => setIsMenuOpen(false)}
                    />
                )}
            </div>
        </div>
    );
};

export const AttachmentListV1: React.FC<{ 
    attachments?: PostAttachment[]; 
    surface?: RenderSurface;
    onRemove?: (id: string) => void;
}> = ({ attachments, surface = 'feed', onRemove }) => {
    if (!attachments || attachments.length === 0) return null;

    const maxAutoLoad = (surface === 'feed' || surface === 'home') ? 1 : attachments.length;

    return (
        <div className={cn(
            "mt-3 flex flex-col",
            surface === 'feed' ? "gap-4" : "gap-2.5"
        )}>
            {attachments.map((att, i) => (
                <AttachmentRendererV1 
                    key={('attachmentId' in att ? att.attachmentId : i)} 
                    attachment={att} 
                    surface={surface} 
                    onRemove={onRemove}
                    autoLoad={i < maxAutoLoad}
                />
            ))}
        </div>
    );
};

export default AttachmentRendererV1;
