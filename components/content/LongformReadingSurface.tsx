import React from 'react';
import { ShareIcon } from '../icons/ShareIcon.tsx';
import { ClockIcon } from '../icons/ClockIcon.tsx';
import { ChevronRightIcon } from '../icons/ChevronRightIcon.tsx';

type LongformBlockNode = {
    type: 'paragraph' | 'heading' | 'blockquote' | 'bulletList' | 'orderedList' | 'listItem' | 'text';
    attrs?: {
        level?: 1 | 2 | 3;
        lang?: string;
        dir?: 'ltr' | 'rtl';
    };
    text?: string;
    marks?: Array<{ type: 'bold' | 'italic' | 'underline' }>;
    content?: LongformBlockNode[];
};

type LongformReadingSurfaceProps = {
    title: string;
    author: string;
    estimatedReadingMinutes: number;
    normalizedContent: {
        units: Array<{
            index: number;
            title: string;
            type: 'chapter' | 'section';
            content: Array<Record<string, unknown>>;
        }>;
    };
    coverUrl?: string;
    excerpt?: string;
    eyebrow?: string;
    authorInteractive?: boolean;
    onAuthorPress?: () => void;
    onShare?: () => void;
    shareLabel?: string;
    relatedItems?: Array<{
        publicationId: string;
        title: string;
        canonicalSlug?: string;
        excerpt: string;
        estimatedReadingMinutes: number;
    }>;
    onRelatedSelect?: (publicationId: string, title: string, canonicalSlug?: string) => void;
};

const formatReadingTime = (estimatedReadingMinutes: number): string => {
    const minutes = Number.isFinite(estimatedReadingMinutes) && estimatedReadingMinutes > 0
        ? Math.max(1, Math.trunc(estimatedReadingMinutes))
        : 1;
    return `${minutes} min read`;
};

const CoverFallback: React.FC<{ title: string; author?: string }> = ({ title, author }) => (
    <div className="relative aspect-[16/7] w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(237,202,150,0.35),_transparent_40%),linear-gradient(135deg,_#30261d_0%,_#6f5640_45%,_#d6c2a3_100%)]">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(10,10,10,0.08)_0%,_rgba(10,10,10,0.3)_100%)]" />
        <div className="relative flex h-full flex-col justify-end px-8 py-7 md:px-10 md:py-9">
            <div className="mb-3 text-[11px] uppercase tracking-[0.28em] text-white/70">
                BookTown Longform
            </div>
            <h2 className="max-w-2xl text-2xl font-semibold leading-tight tracking-tight text-white md:text-[2.2rem]">
                {title}
            </h2>
            {author ? (
                <p className="mt-3 text-sm tracking-[0.14em] text-white/72 uppercase">
                    {author}
                </p>
            ) : null}
        </div>
    </div>
);

const renderInlineNodes = (nodes: LongformBlockNode[]): React.ReactNode =>
    nodes.map((node, index) => {
        if (node.type !== 'text') {
            return (
                <React.Fragment key={index}>
                    {Array.isArray(node.content) ? renderInlineNodes(node.content) : null}
                </React.Fragment>
            );
        }

        let content: React.ReactNode = node.text ?? '';
        for (const mark of node.marks ?? []) {
            if (mark.type === 'bold') content = <strong>{content}</strong>;
            if (mark.type === 'italic') content = <em>{content}</em>;
            if (mark.type === 'underline') content = <u>{content}</u>;
        }
        return <React.Fragment key={index}>{content}</React.Fragment>;
    });

const renderBlocks = (nodes: LongformBlockNode[]): React.ReactNode =>
    nodes.map((node, index) => {
        const commonProps = {
            key: index,
            lang: node.attrs?.lang,
            dir: node.attrs?.dir,
        };

        switch (node.type) {
            case 'paragraph':
                return (
                    <p {...commonProps} className="mb-6 text-[1.05rem] leading-8 text-[#2f2c28] md:text-[1.1rem]">
                        {renderInlineNodes(node.content ?? [])}
                    </p>
                );
            case 'heading': {
                const level = node.attrs?.level === 3 ? 'h3' : 'h2';
                if (level === 'h3') {
                    return (
                        <h3 {...commonProps} className="mb-3 mt-8 text-xl font-semibold tracking-tight text-[#1c1a17]">
                            {renderInlineNodes(node.content ?? [])}
                        </h3>
                    );
                }
                return (
                    <h2 {...commonProps} className="mb-4 mt-10 text-2xl font-semibold tracking-tight text-[#171512] md:text-[1.85rem]">
                        {renderInlineNodes(node.content ?? [])}
                    </h2>
                );
            }
            case 'blockquote':
                return (
                    <blockquote
                        {...commonProps}
                        className="mb-6 border-l-4 border-[#b58f63]/50 pl-5 italic text-[#56473b]"
                    >
                        {renderBlocks(node.content ?? [])}
                    </blockquote>
                );
            case 'bulletList':
                return <ul {...commonProps} className="mb-6 list-disc pl-6 text-[#2f2c28]">{renderBlocks(node.content ?? [])}</ul>;
            case 'orderedList':
                return <ol {...commonProps} className="mb-6 list-decimal pl-6 text-[#2f2c28]">{renderBlocks(node.content ?? [])}</ol>;
            case 'listItem': {
                const hasBlockChildren = (node.content ?? []).some((child) => child.type !== 'text');
                return (
                    <li {...commonProps} className="mb-2 leading-7">
                        {hasBlockChildren ? renderBlocks(node.content ?? []) : renderInlineNodes(node.content ?? [])}
                    </li>
                );
            }
            case 'text':
                return <React.Fragment key={index}>{renderInlineNodes([node])}</React.Fragment>;
            default:
                return null;
        }
    });

const LongformReadingSurface: React.FC<LongformReadingSurfaceProps> = ({
    title,
    author,
    estimatedReadingMinutes,
    normalizedContent,
    coverUrl,
    excerpt,
    eyebrow = 'BookTown Longform',
    authorInteractive = false,
    onAuthorPress,
    onShare,
    shareLabel = 'Share',
    relatedItems = [],
    onRelatedSelect,
}) => (
    <article className="mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-white/8 bg-[#f4ecdd] shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
        {coverUrl ? (
            <div className="aspect-[16/7] w-full overflow-hidden bg-[#ddd1bc]">
                <img src={coverUrl} alt={title} className="h-full w-full object-cover" />
            </div>
        ) : (
            <CoverFallback title={title} author={author} />
        )}

        <div className="px-6 py-8 md:px-12 md:py-12">
            <div className="mb-3 flex items-center justify-between gap-4">
                <div className="text-xs uppercase tracking-[0.28em] text-[#7c6d5d]">
                    {eyebrow}
                </div>
                {onShare ? (
                    <button
                        type="button"
                        onClick={onShare}
                        className="inline-flex items-center gap-2 rounded-full border border-[#d8ccb7] bg-[#ede0cb] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#55473b] transition hover:bg-[#e6d5bd]"
                    >
                        <ShareIcon className="h-3.5 w-3.5" />
                        <span>{shareLabel}</span>
                    </button>
                ) : null}
            </div>
            <h1 className="mb-4 text-4xl font-semibold leading-tight tracking-tight text-[#171512] md:text-5xl">
                {title}
            </h1>
            <div className="mb-8 flex flex-wrap items-center gap-4 text-sm text-[#6f6255]">
                {authorInteractive && onAuthorPress ? (
                    <button
                        type="button"
                        onClick={onAuthorPress}
                        className="font-medium text-[#463a2f] transition hover:text-[#1f1a15]"
                    >
                        {author}
                    </button>
                ) : (
                    <span>{author}</span>
                )}
                <span className="inline-flex items-center gap-1.5">
                    <ClockIcon className="h-4 w-4" />
                    {formatReadingTime(estimatedReadingMinutes)}
                </span>
            </div>

            {excerpt ? (
                <p className="mb-10 border-l-4 border-[#b58f63]/45 pl-5 text-lg italic leading-8 text-[#56473b]">
                    {excerpt}
                </p>
            ) : null}

            <div className="font-serif">
                {normalizedContent.units.map((unit) => (
                    <section key={unit.index} className="mb-12 last:mb-0">
                        {unit.title ? (
                            <h2 className="mb-5 text-[1.9rem] font-semibold tracking-tight text-[#171512]">
                                {unit.title}
                            </h2>
                        ) : null}
                        {renderBlocks(unit.content as LongformBlockNode[])}
                    </section>
                ))}
            </div>

            {relatedItems.length > 0 && onRelatedSelect ? (
                <section className="mt-14 border-t border-[#ddcfb8] pt-10">
                    <div className="mb-5 text-[11px] uppercase tracking-[0.26em] text-[#85735f]">
                        Related Articles
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                        {relatedItems.slice(0, 3).map((item) => (
                            <button
                                key={item.publicationId}
                                type="button"
                                onClick={() => onRelatedSelect(item.publicationId, item.title, item.canonicalSlug)}
                                className="group rounded-[22px] border border-[#dbcdb8] bg-[#efe3cf] p-4 text-left transition hover:-translate-y-0.5 hover:bg-[#eadbc5]"
                            >
                                <div className="mb-3 line-clamp-2 text-lg font-semibold leading-tight text-[#171512]">
                                    {item.title}
                                </div>
                                <p className="mb-4 line-clamp-3 text-sm leading-6 text-[#5a4f43]">
                                    {item.excerpt}
                                </p>
                                <div className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-[#7b6e60]">
                                    <ClockIcon className="h-3.5 w-3.5" />
                                    <span>{formatReadingTime(item.estimatedReadingMinutes)}</span>
                                    <ChevronRightIcon className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    </article>
);

export default LongformReadingSurface;
