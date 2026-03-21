import React from 'react';
import ScreenHeader from '../components/navigation/ScreenHeader.tsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';
import ErrorState from '../components/ui/ErrorState.tsx';
import { BookIcon } from '../components/icons/BookIcon.tsx';
import { useNavigation } from '../store/navigation.tsx';
import { useLongformPublication } from '../lib/hooks/useLongformPublication.ts';

type PublicationBlockNode = {
    type: 'paragraph' | 'heading' | 'blockquote' | 'bulletList' | 'orderedList' | 'listItem' | 'text';
    attrs?: {
        level?: 1 | 2 | 3;
        lang?: string;
        dir?: 'ltr' | 'rtl';
    };
    text?: string;
    marks?: Array<{ type: 'bold' | 'italic' | 'underline' }>;
    content?: PublicationBlockNode[];
};

const renderInlineNodes = (nodes: PublicationBlockNode[]): React.ReactNode =>
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

const renderBlocks = (nodes: PublicationBlockNode[]): React.ReactNode =>
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

const PublicationReaderScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const publicationId =
        currentView.type === 'immersive' && typeof currentView.params?.publicationId === 'string'
            ? currentView.params.publicationId
            : '';
    const from = currentView.type === 'immersive' ? currentView.params?.from : undefined;

    const {
        data: publication,
        isLoading,
        isError,
        error,
        refetch,
    } = useLongformPublication(publicationId);

    const handleBack = () => navigate(from ?? { type: 'tab', id: 'read' });

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-[#14181f]">
                <LoadingSpinner />
            </div>
        );
    }

    if (!publicationId || (!publication && !isLoading && !isError)) {
        return (
            <div className="h-screen flex flex-col bg-[#14181f]">
                <ScreenHeader titleEn="Publication" titleAr="المنشور" onBack={handleBack} />
                <main className="flex flex-1 items-center justify-center px-6 pt-20">
                    <EmptyState
                        icon={BookIcon}
                        titleEn="Publication not found"
                        titleAr="المنشور غير موجود"
                        messageEn="This publication is unavailable."
                        messageAr="هذا المنشور غير متاح."
                    />
                </main>
            </div>
        );
    }

    if (isError || !publication) {
        const errorMessage = String((error as Error | undefined)?.message || '').toLowerCase();
        const isNotFound = errorMessage.includes('not found') || errorMessage.includes('not-found');

        return (
            <div className="h-screen flex flex-col bg-[#14181f]">
                <ScreenHeader titleEn="Publication" titleAr="المنشور" onBack={handleBack} />
                <main className="flex flex-1 items-center justify-center px-6 pt-20">
                    {isNotFound ? (
                        <EmptyState
                            icon={BookIcon}
                            titleEn="Publication not found"
                            titleAr="المنشور غير موجود"
                            messageEn="This publication is unavailable."
                            messageAr="هذا المنشور غير متاح."
                        />
                    ) : (
                        <ErrorState
                            title="Unable to load publication"
                            message="Please try again."
                            onRetry={() => void refetch()}
                            className="max-w-md"
                        />
                    )}
                </main>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-[#14181f]">
            <ScreenHeader titleEn="Publication" titleAr="المنشور" onBack={handleBack} />

            <main className="flex-1 overflow-y-auto pt-20">
                <div className="min-h-full bg-[radial-gradient(circle_at_top,_rgba(196,165,121,0.12),_transparent_42%),linear-gradient(180deg,_#14181f_0%,_#11151b_100%)] px-4 py-8 md:px-8 md:py-10">
                    <article className="mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-white/8 bg-[#f4ecdd] shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
                        {publication.coverUrl ? (
                            <div className="aspect-[16/7] w-full overflow-hidden bg-[#ddd1bc]">
                                <img
                                    src={publication.coverUrl}
                                    alt={publication.title}
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        ) : null}

                        <div className="px-6 py-8 md:px-12 md:py-12">
                            <div className="mb-3 text-xs uppercase tracking-[0.28em] text-[#7c6d5d]">
                                BookTown Longform
                            </div>
                            <h1 className="mb-4 text-4xl font-semibold leading-tight tracking-tight text-[#171512] md:text-5xl">
                                {publication.title}
                            </h1>
                            <div className="mb-8 flex flex-wrap items-center gap-4 text-sm text-[#6f6255]">
                                <span>{publication.estimatedReadingMinutes} min read</span>
                                <span className="uppercase tracking-[0.18em]">{publication.language}</span>
                            </div>

                            {publication.excerpt ? (
                                <p className="mb-10 border-l-4 border-[#b58f63]/45 pl-5 text-lg italic leading-8 text-[#56473b]">
                                    {publication.excerpt}
                                </p>
                            ) : null}

                            <div className="font-serif">
                                {publication.normalizedContent.units.map((unit) => (
                                    <section key={unit.index} className="mb-12 last:mb-0">
                                        {unit.title ? (
                                            <h2 className="mb-5 text-[1.9rem] font-semibold tracking-tight text-[#171512]">
                                                {unit.title}
                                            </h2>
                                        ) : null}
                                        {renderBlocks(unit.content as PublicationBlockNode[])}
                                    </section>
                                ))}
                            </div>
                        </div>
                    </article>
                </div>
            </main>
        </div>
    );
};

export default PublicationReaderScreen;
