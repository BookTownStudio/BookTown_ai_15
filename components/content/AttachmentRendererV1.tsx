import React, { useEffect, useRef, useState } from 'react';

import { devInfo, devLog } from '../../lib/logging/devLog';
import { AttachmentAnalytics } from '../../lib/media/AttachmentAnalytics.ts';
import { useAuth } from '../../lib/auth.tsx';
import { useAttachmentUrl } from '../../lib/hooks/useAttachmentUrl.ts';
import type { AttachmentDeliveryIntent } from '../../lib/hooks/useAttachmentUrl.ts';
import { useSocialRenderDiagnostics } from '../../lib/socialPerformanceDiagnostics.ts';
import { cn } from '../../lib/utils.ts';

import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useAttachmentViewer } from '../../store/attachment-viewer.tsx';

import { AttachmentV1, PostAttachment } from '../../types/entities.ts';
import type { View } from '../../types/navigation.ts';

import BilingualText from '../ui/BilingualText.tsx';

import { BookIcon } from '../icons/BookIcon.tsx';
import { DraftIcon as FileIcon } from '../icons/DraftIcon.tsx';
import { EyeIcon } from '../icons/EyeIcon.tsx';
import { GlobeIcon } from '../icons/GlobeIcon.tsx';
import { MediaIcon } from '../icons/MediaIcon.tsx';
import { PlayIcon } from '../icons/PlayIcon.tsx';
import { QuoteIcon } from '../icons/QuoteIcon.tsx';
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

type ImageRenditionMetadata = {
    width: number;
    height: number;
};

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
    dimensions?: ImageRenditionMetadata | null;
}> = ({ attachment, url, payload, maxHeight, surface, dimensions }) => {
    devLog("IMAGE_VIEW_ACTIVE");

    const safePayload =
        payload && typeof payload === 'object'
            ? payload
            : {};

    const fallbackAlt = 'attachment image';

    const resolvedAlt =
        typeof safePayload.alt === 'string' && safePayload.alt.trim().length > 0
            ? safePayload.alt
            : fallbackAlt;
    const hasStableDimensions =
        dimensions &&
        Number.isFinite(dimensions.width) &&
        Number.isFinite(dimensions.height) &&
        dimensions.width > 0 &&
        dimensions.height > 0;
    const imageAspectRatio = hasStableDimensions
        ? dimensions.width / dimensions.height
        : null;
    const isVeryTallImage =
        imageAspectRatio !== null &&
        imageAspectRatio < 0.56 &&
        surface !== 'write';
    const reserveAspectRatio = hasStableDimensions && surface !== 'write';
    const frameAspectRatio = reserveAspectRatio
        ? isVeryTallImage
            ? '4 / 5'
            : `${dimensions.width} / ${dimensions.height}`
        : undefined;

    return (
        <div
            className={cn(
                "relative overflow-hidden rounded-[0.7rem] border border-white/[0.08] bg-black/28",
                isVeryTallImage && "bg-black/36"
            )}
            style={reserveAspectRatio
                ? {
                    aspectRatio: frameAspectRatio,
                    maxHeight,
                }
                : { maxHeight }}
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
                    "block w-full transition-opacity duration-300",
                    reserveAspectRatio ? "h-full object-contain" : "h-auto object-contain"
                )}
            />
            {isVeryTallImage ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/38 to-transparent" />
            ) : null}
        </div>
    );
};

const VideoView: React.FC<{ attachment: PostAttachment; payload?: any; maxHeight: number | string; surface: RenderSurface }> = ({ attachment, payload, maxHeight, surface }) => {
    const { lang } = useI18n();
    const safePayload =
        payload && typeof payload === 'object'
            ? payload
            : {};
    useEffect(() => {
        AttachmentAnalytics.track('attachment_rendered', attachment, surface);
    }, [attachment, surface]);

    return (
        <AttachmentGrammarCard
            label="Video"
            title={lang === 'en' ? 'Video Attachment' : 'مرفق فيديو'}
            mediaFirst
            preview={
                <div className="relative flex min-h-[12rem] items-center justify-center overflow-hidden bg-black" style={{ maxHeight }}>
                    {typeof safePayload.thumbnail === 'string' && safePayload.thumbnail.length > 0 && (
                        <img src={safePayload.thumbnail} alt="Poster" className="absolute inset-0 h-full w-full object-cover opacity-50" />
                    )}
                    <PlayIcon className="relative z-10 h-10 w-10 text-white/50" />
                </div>
            }
        />
    );
};

const AudioView: React.FC<{ attachment: PostAttachment; maxHeight: number | string; surface: RenderSurface }> = ({ attachment, maxHeight, surface }) => {
    const { lang } = useI18n();
    useEffect(() => {
        AttachmentAnalytics.track('attachment_rendered', attachment, surface);
    }, [attachment, surface]);

    return (
        <AttachmentGrammarCard
            label="Audio"
            title={lang === 'en' ? 'Audio' : 'صوت'}
            preview={<div className="flex h-full w-full items-center justify-center"><VolumeXIcon className="h-5 w-5 text-accent/60" /></div>}
        >
            <div className="mt-3 h-1 rounded-full bg-white/8" style={{ maxHeight }} />
        </AttachmentGrammarCard>
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
        <AttachmentGrammarCard
            label="Document"
            title={(typeof safePayload.name === 'string' ? safePayload.name : '') || (lang === 'en' ? 'Document' : 'مستند')}
            subtitle={typeof safePayload.size === 'number' && Number.isFinite(safePayload.size)
                ? `${(safePayload.size / 1024).toFixed(1)} KB`
                : 'File'}
            preview={<div className="flex h-full w-full items-center justify-center"><FileIcon className="h-5 w-5 text-slate-500" /></div>}
        />
    );
};

const AttachmentTypeLabel: React.FC<{ label: string }> = ({ label }) => (
    <span className="inline-flex items-center rounded-full border border-white/12 bg-black/34 px-2.5 py-1 text-[10px] font-semibold tracking-[0.12em] text-white/74 uppercase shadow-[0_6px_16px_-12px_rgba(0,0,0,0.72)]">
        {label}
    </span>
);

const AttachmentGrammarCard: React.FC<{
    label: string;
    title: string;
    subtitle?: string;
    metadata?: string;
    preview?: React.ReactNode;
    children?: React.ReactNode;
    mediaFirst?: boolean;
}> = ({ label, title, subtitle, metadata, preview, children, mediaFirst = false }) => (
    <div className="relative overflow-hidden rounded-[0.95rem] border border-white/8 bg-[#0d1520]/94 px-3.5 py-3.5 text-slate-200 shadow-none">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,119,182,0.12),transparent_58%)]" />
        <div className={cn("relative flex gap-3", mediaFirst ? "flex-col" : "items-start")}>
            {preview ? (
                <div className={cn(
                    "shrink-0 overflow-hidden rounded-[0.7rem] bg-white/8",
                    mediaFirst ? "w-full" : "h-24 w-16"
                )}>
                    {preview}
                </div>
            ) : null}
            <div className="min-w-0 flex-1">
                <AttachmentTypeLabel label={label} />
                <BilingualText className="mt-2 font-semibold text-[15px] leading-snug text-white line-clamp-3">
                    {title}
                </BilingualText>
                {subtitle ? (
                    <BilingualText role="Caption" className="mt-1 !text-[11px] leading-snug text-white/65 line-clamp-2">
                        {subtitle}
                    </BilingualText>
                ) : null}
                {children}
                {metadata ? (
                    <div className="mt-3 inline-flex w-fit items-center rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[11px] font-semibold text-white/74">
                        {metadata}
                    </div>
                ) : null}
            </div>
        </div>
    </div>
);

const BookReferenceCard: React.FC<{ title: string; author: string; coverUrl?: string; rating?: number; surface?: RenderSurface }> = ({ title, author, coverUrl, rating = 0, surface = 'feed' }) => {
    const safeRating = Number.isFinite(rating) ? Math.max(0, Math.min(5, rating)) : 0;
    return (
        <AttachmentGrammarCard
            label="Book"
            title={title || 'Book'}
            subtitle={author}
            metadata={'★'.repeat(Math.round(safeRating)) || 'No rating'}
            preview={coverUrl
                ? <img src={coverUrl} className="h-full w-full object-cover" alt="" loading="lazy" />
                : <div className="flex h-full w-full items-center justify-center"><BookIcon className="h-5 w-5 text-white/58" /></div>}
        />
    );
};

const QuoteReferenceCard: React.FC<{ text: string; surface?: RenderSurface }> = ({ text, surface = 'feed' }) => {
    return (
        <AttachmentGrammarCard
            label="Quote"
            title="Quote"
            preview={<div className="flex h-full w-full items-center justify-center"><QuoteIcon className="h-5 w-5 text-[#8ecdf2]" /></div>}
        >
            <p className="mt-2 line-clamp-4 text-[13px] leading-relaxed text-white/78 italic">{text}</p>
        </AttachmentGrammarCard>
    );
};

const AuthorReferenceCard: React.FC<{ name: string; avatarUrl?: string; country?: string }> = ({
    name,
    avatarUrl,
    country,
}) => (
    <AttachmentGrammarCard
        label="Author"
        title={name || 'Author'}
        subtitle={country || undefined}
        preview={avatarUrl
            ? <img src={avatarUrl} className="h-full w-full object-cover" alt="" loading="lazy" />
            : <div className="flex h-full w-full items-center justify-center bg-white/8"><GlobeIcon className="h-5 w-5 text-white/58" /></div>}
    />
);

const ShelfReferenceCard: React.FC<{ name: string; bookCount?: number; covers?: string[] }> = ({ name, bookCount, covers = [] }) => (
    <AttachmentGrammarCard
        label="Shelf"
        title={name || 'Shelf'}
        metadata={Number.isFinite(bookCount) ? `${Math.max(0, Math.trunc(bookCount as number))} books` : 'Collection'}
        preview={covers.length > 0
            ? (
                <div className="grid h-full w-full grid-cols-2 gap-1 p-1">
                    {covers.slice(0, 4).map((cover, idx) => (
                        <img key={`${cover}-${idx}`} src={cover} alt="" className="h-full w-full rounded-sm object-cover" loading="lazy" />
                    ))}
                </div>
            )
            : <div className="flex h-full w-full items-center justify-center"><MediaIcon className="h-5 w-5 text-white/65" /></div>}
    />
);

const VenueReferenceCard: React.FC<{ name?: string; type?: string; dateLabel?: string; locationLabel?: string; imageUrl?: string }> = ({ name, type, dateLabel, locationLabel, imageUrl }) => (
    <AttachmentGrammarCard
        label="Venue"
        title={dateLabel || name || 'Venue'}
        subtitle={locationLabel || type || undefined}
        preview={imageUrl
            ? <img src={imageUrl} className="h-full w-full object-cover" alt="" loading="lazy" />
            : <div className="flex h-full w-full items-center justify-center"><GlobeIcon className="h-5 w-5 text-white/70" /></div>}
    />
);

const PublicationReferenceCard: React.FC<{ title: string; coverUrl?: string; author?: string }> = ({
    title,
    coverUrl,
    author,
}) => (
    <AttachmentGrammarCard
        label="Publication"
        title={title || 'Publication'}
        subtitle={author || 'Article in BookTown'}
        preview={coverUrl
            ? <img src={coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            : <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.03))]"><BookIcon className="h-5 w-5 text-[#d9c4a2]" /></div>}
    />
);

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

const readPositiveNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

const readRenditionDimensions = (value: unknown): ImageRenditionMetadata | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    const width = readPositiveNumber(record.width);
    const height = readPositiveNumber(record.height);
    return width && height ? { width, height } : null;
};

const resolveAttachmentDeliveryIntent = (
    surface: RenderSurface,
    currentView: View
): AttachmentDeliveryIntent => {
    if (surface === 'feed' || surface === 'home') return 'timeline';
    if (surface === 'drawer') return 'preview';

    const isSocialTimelineContext =
        currentView.type === 'tab' && currentView.id === 'social';
    const isProfileTimelineContext =
        currentView.type === 'immersive' && currentView.id === 'profile';

    if (surface === 'read' && (isSocialTimelineContext || isProfileTimelineContext)) {
        return 'timeline';
    }

    return 'full';
};

const readImageDimensions = (
    metadata: unknown,
    intent: AttachmentDeliveryIntent
): ImageRenditionMetadata | null => {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;

    const metadataRecord = metadata as Record<string, unknown>;
    const renditions =
        metadataRecord.renditions && typeof metadataRecord.renditions === 'object'
            ? (metadataRecord.renditions as Record<string, unknown>)
            : {};
    const preferredRendition =
        intent === 'timeline' ? 'feed' : intent === 'preview' ? 'thumb' : 'original';
    const preferredDimensions = readRenditionDimensions(renditions[preferredRendition]);
    if (preferredDimensions) return preferredDimensions;

    const originalDimensions = readRenditionDimensions(renditions.original);
    if (originalDimensions) return originalDimensions;

    const width = readPositiveNumber(metadataRecord.width);
    const height = readPositiveNumber(metadataRecord.height);
    return width && height ? { width, height } : null;
};

type StructuredNavigationTarget =
    | { id: 'bookDetails'; params: { bookId: string } }
    | { id: 'authorDetails'; params: { authorId: string } }
    | { id: 'quoteDetails'; params: { quoteId: string; ownerId?: string } }
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
            return quoteId
                ? { id: 'quoteDetails', params: { quoteId, ...(ownerId ? { ownerId } : {}) } }
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
        return quoteId
            ? { id: 'quoteDetails', params: { quoteId, ...(ownerId ? { ownerId } : {}) } }
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
}> = ({ type, surface, hydrated }) => {
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

        return <UnresolvedReferenceView />;
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

    return <UnresolvedReferenceView />;
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
    useSocialRenderDiagnostics('AttachmentRendererV1', {
        attachmentType: v1Type || (isV1 ? 'UNKNOWN_V1' : 'LEGACY'),
        surface,
    });
    const v1Payload: Record<string, unknown> =
        v1?.payload && typeof v1.payload === 'object'
            ? (v1.payload as Record<string, unknown>)
            : {};
    const v1Metadata = v1?.metadata ?? null;
    const v1MetadataExtension = v1Metadata as
        | (typeof v1Metadata & { url?: unknown; signedUrl?: unknown })
        | null;
    const resolveMediaSrc = (resolvedSignedUrl: string): string =>
        firstNonEmpty(
            resolvedSignedUrl,
            v1Payload.url,
            v1Payload.previewUrl,
            v1Payload.imageUrl,
            (v1Payload as Record<string, unknown>).downloadURL,
            (v1Payload as Record<string, unknown>).downloadUrl,
            v1Metadata?.previewUrl,
            v1MetadataExtension?.url,
            v1MetadataExtension?.signedUrl
        );

    const isReferenceV1 =
        v1Type === 'BOOK_REFERENCE' || v1Type === 'QUOTE_REFERENCE';
    const shouldResolveSecureUrl =
        Boolean(isInViewport && v1) &&
        !isReferenceV1 &&
        v1Type !== 'LINK';
    const isMediaImage = isV1
        ? v1Type === 'IMAGE' || v1Type === 'MEDIA'
        : ['media', 'image'].includes(readNonEmptyString((attachment as any)?.type).toLowerCase());
    const shouldShowActionMenu = !isMediaImage || surface === 'write';
    const deliveryIntent = resolveAttachmentDeliveryIntent(surface, currentView);
    const { data: secureUrl, isLoading: isResolvingUrl, isError: isUrlError } = useAttachmentUrl(
        shouldResolveSecureUrl ? v1!.attachmentId : undefined,
        surface,
        deliveryIntent
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
            deliveryIntent,
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
        deliveryIntent,
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
        write: 520
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
                        imageUrl={readNonEmptyString(legacy.imageUrl) || readNonEmptyString(legacy.coverUrl)}
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
                    ? <ImageView attachment={attachment} url={legacyUrl} payload={legacyPayload} maxHeight={maxHeightMap[surface]} surface={surface} dimensions={readImageDimensions(legacyMetadata, 'timeline')} />
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
                    ? <ImageView attachment={attachment} url={legacyUrl} payload={legacyPayload} maxHeight={maxHeightMap[surface]} surface={surface} dimensions={readImageDimensions(legacyMetadata, 'timeline')} />
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
            dimensions={readImageDimensions(v1Metadata, deliveryIntent)}
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
            
            {shouldShowActionMenu ? (
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
            ) : null}
        </div>
    );
};

const MemoizedAttachmentRendererV1 = React.memo(AttachmentRendererV1);

const AttachmentListV1Component: React.FC<{ 
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
                <MemoizedAttachmentRendererV1 
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

export const AttachmentListV1 = React.memo(AttachmentListV1Component);

export default MemoizedAttachmentRendererV1;
