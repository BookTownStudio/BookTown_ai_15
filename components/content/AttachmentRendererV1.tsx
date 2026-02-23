import React, { useState, useRef, useEffect, useMemo } from 'react';
import { AttachmentV1, PostAttachment } from '../../types/entities.ts';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useBookCatalog } from '../../lib/hooks/useBookCatalog.ts';
import { useQuoteDetails } from '../../lib/hooks/useQuoteDetails.ts';
import { useAuth } from '../../lib/auth.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import GlassCard from '../ui/GlassCard.tsx';
import { PlayIcon } from '../icons/PlayIcon.tsx';
import { MediaIcon } from '../icons/MediaIcon.tsx';
import { DraftIcon as FileIcon } from '../icons/DraftIcon.tsx';
import { GlobeIcon } from '../icons/GlobeIcon.tsx';
import { VerticalEllipsisIcon } from '../icons/VerticalEllipsisIcon.tsx';
import { TrashIcon } from '../icons/TrashIcon.tsx';
import { EyeIcon } from '../icons/EyeIcon.tsx';
import { cn } from '../../lib/utils.ts';
import { useAttachmentViewer } from '../../store/attachment-viewer.tsx';
import { AttachmentAnalytics } from '../../lib/media/AttachmentAnalytics.ts';
import { useAttachmentUrl } from '../../lib/hooks/useAttachmentUrl.ts';
import { VolumeXIcon } from '../icons/VolumeXIcon.tsx';

export type RenderSurface = 'home' | 'feed' | 'drawer' | 'read' | 'write';

const ACTION_MATRIX: Record<RenderSurface, string[]> = {
    home: ['open', 'preview'],
    feed: ['open', 'preview'],
    drawer: ['open'],
    read: ['open'],
    write: ['remove', 'reorder', 'replace']
};

interface AttachmentActionMenuProps {
    attachment: PostAttachment;
    surface: RenderSurface;
    onRemove?: (id: string) => void;
    onClose: () => void;
}

const AttachmentActionMenu: React.FC<AttachmentActionMenuProps> = ({ attachment, surface, onRemove, onClose }) => {
    const { lang, isRTL } = useI18n();
    const { viewAttachment } = useAttachmentViewer();
    const { user } = useAuth();
    
    const allowed = ACTION_MATRIX[surface];
    const isV1 = 'attachmentId' in attachment;
    const attachmentId = isV1 ? (attachment as AttachmentV1).attachmentId : 'legacy';
    
    const canManage = surface === 'write' || (isV1 && (attachment as AttachmentV1).metadata.uploader.uid === user?.uid);

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
                    onClick={() => handleAction(() => viewAttachment(attachment))}
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

const ImageView: React.FC<{ attachment: PostAttachment; url: string; payload: any; maxHeight: number; surface: RenderSurface }> = ({ attachment, url, payload, maxHeight, surface }) => {
    return (
        <div 
            className="w-full overflow-hidden rounded-lg bg-slate-800 flex items-center justify-center min-h-[100px]"
            style={{ maxHeight }}
        >
            <img 
                src={url} 
                alt={payload.alt || "Image attachment"} 
                loading="lazy"
                onLoad={() => AttachmentAnalytics.track('attachment_rendered', attachment, surface)}
                onError={() => AttachmentAnalytics.track('attachment_failed', attachment, surface)}
                className="w-full h-full object-cover transition-opacity duration-300"
            />
        </div>
    );
};

const VideoView: React.FC<{ attachment: PostAttachment; payload: any; maxHeight: number; surface: RenderSurface }> = ({ attachment, payload, maxHeight, surface }) => {
    const { lang } = useI18n();
    useEffect(() => {
        AttachmentAnalytics.track('attachment_rendered', attachment, surface);
    }, [attachment, surface]);

    return (
        <div 
            className="relative rounded-lg overflow-hidden bg-black flex items-center justify-center"
            style={{ height: maxHeight }}
        >
            {payload.thumbnail && (
                <img src={payload.thumbnail} alt="Poster" className="absolute inset-0 w-full h-full object-cover opacity-50" />
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

const AudioView: React.FC<{ attachment: PostAttachment; maxHeight: number; surface: RenderSurface }> = ({ attachment, maxHeight, surface }) => {
    const { lang } = useI18n();
    useEffect(() => {
        AttachmentAnalytics.track('attachment_rendered', attachment, surface);
    }, [attachment, surface]);

    return (
        <div 
            className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg border border-white/5"
            style={{ maxHeight }}
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

const DocumentView: React.FC<{ attachment: PostAttachment; payload: any; surface: RenderSurface }> = ({ attachment, payload, surface }) => {
    const { lang } = useI18n();
    useEffect(() => {
        AttachmentAnalytics.track('attachment_rendered', attachment, surface);
    }, [attachment, surface]);

    return (
        <GlassCard className="flex items-center gap-3 !p-3 border-dashed border-white/10 opacity-80">
            <FileIcon className="h-5 w-5 text-slate-500" />
            <div className="min-w-0 flex-grow">
                <BilingualText className="font-bold text-sm truncate">
                    {payload.name || (lang === 'en' ? 'Document' : 'مستند')}
                </BilingualText>
                <BilingualText role="Caption" className="!text-[10px]">
                    {payload.size ? `${(payload.size / 1024).toFixed(1)} KB` : 'File'}
                </BilingualText>
            </div>
        </GlassCard>
    );
};

const BookReferenceCard: React.FC<{ title: string; author: string; coverUrl?: string }> = ({ title, author, coverUrl }) => (
    <div className="flex items-center gap-3 p-2 bg-white/5 rounded-lg border border-white/5 opacity-80">
        {coverUrl ? (
            <img src={coverUrl} className="h-10 w-7 object-cover rounded shadow-sm" alt="" />
        ) : (
            <div className="h-10 w-7 rounded bg-white/10" />
        )}
        <div className="min-w-0">
            <BilingualText className="font-bold text-[11px] truncate">{title}</BilingualText>
            <BilingualText role="Caption" className="!text-[9px] truncate">{author}</BilingualText>
        </div>
    </div>
);

const QuoteReferenceCard: React.FC<{ text: string }> = ({ text }) => (
    <div className="p-3 bg-black/10 italic text-[11px] border-l-2 border-white/10 rounded-r-lg text-slate-400">
        "{text}"
    </div>
);

const HookedBookReferenceView: React.FC<{ id: string }> = ({ id }) => {
    const { data: book, isLoading } = useBookCatalog(id);
    if (isLoading) return <div className="h-16 bg-slate-800 animate-pulse rounded-lg" />;
    if (!book) return null;
    return (
        <BookReferenceCard
            title={book.titleEn}
            author={book.authorEn}
            coverUrl={book.coverUrl}
        />
    );
};

const HookedQuoteReferenceView: React.FC<{ id: string; owner?: string }> = ({ id, owner }) => {
    const { data: quote, isLoading } = useQuoteDetails(id, owner);
    if (isLoading) return <div className="h-16 bg-slate-800 animate-pulse rounded-lg" />;
    if (!quote) return null;
    return <QuoteReferenceCard text={quote.textEn} />;
};

const UnresolvedReferenceView: React.FC = () => (
    <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-[11px] text-slate-400">
        Reference unavailable
    </div>
);

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

        if (hydratedTitle || hydratedAuthor || hydratedCover) {
            return (
                <BookReferenceCard
                    title={hydratedTitle || 'Book'}
                    author={hydratedAuthor}
                    coverUrl={hydratedCover}
                />
            );
        }

        if (surface === 'feed') {
            return <UnresolvedReferenceView />;
        }

        return <HookedBookReferenceView id={id} />;
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
        return <QuoteReferenceCard text={hydratedText} />;
    }

    if (surface === 'feed') {
        return <UnresolvedReferenceView />;
    }

    return <HookedQuoteReferenceView id={id} owner={owner} />;
};

interface AttachmentRendererV1Props {
    attachment: PostAttachment;
    surface: RenderSurface;
    onRemove?: (id: string) => void;
    autoLoad?: boolean;
}

const AttachmentRendererV1: React.FC<AttachmentRendererV1Props> = ({ attachment, surface, onRemove, autoLoad = true }) => {
    const { viewAttachment } = useAttachmentViewer();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isInViewport, setIsInViewport] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    
    const isV1 = 'attachmentId' in attachment;
    const v1 = isV1 ? (attachment as AttachmentV1) : null;
    const allowed = ACTION_MATRIX[surface];

    useEffect(() => {
        if (!isV1 || !autoLoad) {
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

    const isReferenceV1 =
        v1?.type === 'BOOK_REFERENCE' || v1?.type === 'QUOTE_REFERENCE';
    const shouldResolveSecureUrl =
        Boolean(isInViewport && v1) &&
        !isReferenceV1 &&
        v1?.type !== 'LINK';
    const { data: secureUrl, isLoading: isResolvingUrl, isError: isUrlError } = useAttachmentUrl(
        shouldResolveSecureUrl ? v1!.attachmentId : undefined,
        surface
    );

    const maxHeightMap: Record<RenderSurface, number> = {
        home: 160,
        feed: 400,
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

    const handlePrimaryClick = (e: React.MouseEvent) => {
        if (allowed.includes('open')) {
            e.stopPropagation();
            viewAttachment(attachment);
        }
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
            case 'media': visual = <ImageView attachment={attachment} url={legacy.url} payload={{}} maxHeight={maxHeightMap[surface]} surface={surface} />; break;
            default: return null;
        }
    } else {
        const inlineFeedUrl =
            surface === 'feed'
                ? (
                    (typeof (v1!.payload as any)?.url === 'string' ? (v1!.payload as any).url : '') ||
                    (typeof (v1!.payload as any)?.previewUrl === 'string' ? (v1!.payload as any).previewUrl : '') ||
                    (typeof (v1!.metadata as any)?.previewUrl === 'string' ? (v1!.metadata as any).previewUrl : '')
                )
                : '';
        const resolvedUrl = shouldResolveSecureUrl ? (secureUrl?.url || '') : inlineFeedUrl;
        const requiresResolvedUrl = v1!.type === 'IMAGE';

        if (!isInViewport || (shouldResolveSecureUrl && isResolvingUrl)) {
            visual = (
                <div className="flex items-center justify-center p-6 bg-white/5 rounded-lg border border-white/5 animate-pulse" style={{ height: 100 }}>
                    <MediaIcon className="h-5 w-5 text-white/20" />
                </div>
            );
        } else if ((shouldResolveSecureUrl && isUrlError) || (requiresResolvedUrl && !resolvedUrl)) {
             visual = (
                <div className="flex flex-col items-center justify-center p-6 bg-red-950/20 rounded-lg border border-red-900/20 text-red-400 text-[10px] text-center gap-2">
                    <VolumeXIcon className="h-4 w-4 opacity-50" />
                    <span>Attachment unavailable</span>
                </div>
            );
        } else {
            switch (v1!.type) {
                case 'IMAGE': visual = <ImageView attachment={attachment} url={resolvedUrl} payload={v1!.payload} maxHeight={maxHeightMap[surface]} surface={surface} />; break; 
                case 'VIDEO': visual = <VideoView attachment={attachment} payload={v1!.payload} maxHeight={maxHeightMap[surface]} surface={surface} />; break; 
                case 'AUDIO': visual = <AudioView attachment={attachment} maxHeight={maxHeightMap[surface]} surface={surface} />; break;
                case 'DOCUMENT': visual = <DocumentView attachment={attachment} payload={v1!.payload} surface={surface} />; break;
                case 'LINK': 
                    visual = <div className="p-3 bg-white/5 border border-white/10 rounded-lg text-xs opacity-60"><GlobeIcon className="h-4 w-4 inline mr-2"/>{v1!.payload.url}</div>; 
                    AttachmentAnalytics.track('attachment_rendered', attachment, surface);
                    break;
                case 'BOOK_REFERENCE':
                    visual = (
                        <ReferenceView
                            type="BOOK"
                            id={v1!.payload.entityId}
                            surface={surface}
                            hydrated={
                                (v1!.payload?.hydratedEntity && typeof v1!.payload.hydratedEntity === 'object')
                                    ? v1!.payload.hydratedEntity
                                    : null
                            }
                        />
                    );
                    break;
                case 'QUOTE_REFERENCE':
                    visual = (
                        <ReferenceView
                            type="QUOTE"
                            id={v1!.payload.entityId}
                            owner={v1!.payload.ownerId}
                            surface={surface}
                            hydrated={
                                (v1!.payload?.hydratedEntity && typeof v1!.payload.hydratedEntity === 'object')
                                    ? v1!.payload.hydratedEntity
                                    : null
                            }
                        />
                    );
                    break;
                default: visual = <div className="p-4 border border-dashed opacity-30 flex items-center justify-center"><MediaIcon /></div>;
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
                    className="p-1.5 rounded-full bg-black/40 text-white/70 hover:bg-black/60 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                    aria-label="Attachment Actions"
                >
                    <VerticalEllipsisIcon className="h-4 w-4" />
                </button>

                {isMenuOpen && (
                    <AttachmentActionMenu 
                        attachment={attachment} 
                        surface={surface} 
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
        <div className="mt-3 flex flex-col gap-3">
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
