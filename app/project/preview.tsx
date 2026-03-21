
import React from 'react';
import { useNavigation } from '../../store/navigation.tsx';
import { useI18n } from '../../store/i18n.tsx';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { BookIcon } from '../../components/icons/BookIcon.tsx';
import { useProjectReleasePreview } from '../../lib/hooks/useProjectReleasePreview.ts';

type PreviewBlockNode = {
    type: 'paragraph' | 'heading' | 'blockquote' | 'bulletList' | 'orderedList' | 'listItem' | 'text';
    attrs?: {
        level?: 1 | 2 | 3;
        lang?: string;
        dir?: 'ltr' | 'rtl';
    };
    text?: string;
    marks?: Array<{ type: 'bold' | 'italic' | 'underline' }>;
    content?: PreviewBlockNode[];
};

const renderInlineNodes = (nodes: PreviewBlockNode[]): React.ReactNode =>
    nodes.map((node, index) => {
        if (node.type !== 'text') {
            return <React.Fragment key={index}>{Array.isArray(node.content) ? renderInlineNodes(node.content) : null}</React.Fragment>;
        }

        let content: React.ReactNode = node.text ?? '';
        for (const mark of node.marks ?? []) {
            if (mark.type === 'bold') content = <strong>{content}</strong>;
            if (mark.type === 'italic') content = <em>{content}</em>;
            if (mark.type === 'underline') content = <u>{content}</u>;
        }
        return <React.Fragment key={index}>{content}</React.Fragment>;
    });

const renderBlocks = (nodes: PreviewBlockNode[]): React.ReactNode =>
    nodes.map((node, index) => {
        const commonProps = {
            key: index,
            lang: node.attrs?.lang,
            dir: node.attrs?.dir,
        };

        switch (node.type) {
            case 'paragraph':
                return <p {...commonProps} className="mb-5 leading-8 text-[1.03rem] text-slate-800">{renderInlineNodes(node.content ?? [])}</p>;
            case 'heading': {
                const level = node.attrs?.level === 3 ? 'h3' : 'h2';
                if (level === 'h3') {
                    return <h3 {...commonProps} className="mt-8 mb-3 text-xl font-semibold text-slate-900">{renderInlineNodes(node.content ?? [])}</h3>;
                }
                return <h2 {...commonProps} className="mt-10 mb-4 text-2xl font-semibold text-slate-900">{renderInlineNodes(node.content ?? [])}</h2>;
            }
            case 'blockquote':
                return <blockquote {...commonProps} className="mb-5 border-l-4 border-amber-700/30 pl-4 italic text-slate-700">{renderBlocks(node.content ?? [])}</blockquote>;
            case 'bulletList':
                return <ul {...commonProps} className="mb-5 list-disc pl-6 text-slate-800">{renderBlocks(node.content ?? [])}</ul>;
            case 'orderedList':
                return <ol {...commonProps} className="mb-5 list-decimal pl-6 text-slate-800">{renderBlocks(node.content ?? [])}</ol>;
            case 'listItem': {
                const hasBlockChildren = (node.content ?? []).some((child) => child.type !== 'text');
                return <li {...commonProps} className="mb-2">{hasBlockChildren ? renderBlocks(node.content ?? []) : renderInlineNodes(node.content ?? [])}</li>;
            }
            case 'text':
                return <React.Fragment key={index}>{renderInlineNodes([node])}</React.Fragment>;
            default:
                return null;
        }
    });

const ProjectPreviewScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const { lang } = useI18n();

    const releaseId = currentView.type === 'immersive' ? currentView.params?.releaseId : undefined;
    const previewType = currentView.type === 'immersive' ? currentView.params?.previewType as 'blog' | 'ebook' | undefined : undefined;
    const from = currentView.type === 'immersive' ? currentView.params?.from : undefined;

    const { data: preview, isLoading } = useProjectReleasePreview(releaseId, previewType);

    const handleBack = () => navigate(from ?? { type: 'tab', id: 'write' });

    if (isLoading) {
        return <div className="h-screen flex items-center justify-center bg-slate-900"><LoadingSpinner /></div>;
    }

    if (!preview || !previewType) {
        return <div className="h-screen flex items-center justify-center bg-slate-900 text-white">Preview unavailable</div>;
    }

    const isBlogPreview = preview.previewType === 'blog';

    return (
        <div className="h-screen flex flex-col bg-slate-900">
            <ScreenHeader
                titleEn={isBlogPreview ? 'Preview Blog' : 'Preview Ebook'}
                titleAr={isBlogPreview ? 'معاينة المقال' : 'معاينة الكتاب الإلكتروني'}
                onBack={handleBack}
            />

            <main className="flex-grow overflow-y-auto pt-20">
                <div className="min-h-full bg-[#1e242c] px-4 py-6 md:px-10 md:py-10">
                    <div className="mx-auto max-w-5xl">
                        <div className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-slate-800/70 px-5 py-4 text-sm text-slate-300">
                            <div className="font-medium text-white">
                                {isBlogPreview
                                    ? (lang === 'en' ? 'Blog Preview' : 'معاينة المقال')
                                    : (lang === 'en' ? 'Ebook Preview' : 'معاينة الكتاب الإلكتروني')}
                            </div>
                            <div className="flex items-center gap-4 text-xs uppercase tracking-[0.2em] text-slate-400">
                                <span>{preview.language}</span>
                                <span>{preview.wordCount.toLocaleString()} words</span>
                                {isBlogPreview ? <span>{preview.estimatedReadingMinutes} min read</span> : <span>{preview.frontmatter.unitCount} units</span>}
                            </div>
                        </div>

                        {isBlogPreview ? (
                            <article className="mx-auto max-w-3xl overflow-hidden rounded-[28px] bg-[#f7f1e4] shadow-2xl">
                                {preview.coverUrl ? (
                                    <img src={preview.coverUrl} alt={preview.title} className="h-64 w-full object-cover md:h-80" />
                                ) : (
                                    <div className="flex h-48 w-full items-center justify-center bg-[#e7decd]">
                                        <BookIcon className="h-12 w-12 text-[#9d8f78]" />
                                    </div>
                                )}
                                <div className="px-6 py-8 md:px-12 md:py-12">
                                    <div className="mb-4 text-xs font-medium uppercase tracking-[0.28em] text-slate-500">
                                        Blog longform
                                    </div>
                                    <h1 className="mb-4 text-4xl font-semibold leading-tight text-slate-950">
                                        {preview.title}
                                    </h1>
                                    <div className="mb-8 flex flex-wrap items-center gap-4 text-sm text-slate-500">
                                        <span>{preview.frontmatter.author}</span>
                                        <span>{preview.estimatedReadingMinutes} min read</span>
                                    </div>
                                    {preview.excerpt ? (
                                        <p className="mb-10 border-l-4 border-amber-800/30 pl-4 text-lg italic leading-8 text-slate-700">
                                            {preview.excerpt}
                                        </p>
                                    ) : null}
                                    <div className="font-serif">
                                        {preview.normalizedContent.units.map((unit) => (
                                            <section key={unit.index} className="mb-12">
                                                <h2 className="mb-5 text-2xl font-semibold text-slate-950">{unit.title}</h2>
                                                {renderBlocks(unit.content as PreviewBlockNode[])}
                                            </section>
                                        ))}
                                    </div>
                                </div>
                            </article>
                        ) : (
                            <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row">
                                <aside className="w-full rounded-2xl border border-white/10 bg-slate-800/60 p-5 md:w-72 md:flex-shrink-0">
                                    <div className="mb-5 aspect-[2/3] overflow-hidden rounded-xl bg-slate-700">
                                        {preview.coverUrl ? (
                                            <img src={preview.coverUrl} alt={preview.title} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center">
                                                <BookIcon className="h-12 w-12 text-slate-500" />
                                            </div>
                                        )}
                                    </div>
                                    <h1 className="mb-2 text-xl font-semibold text-white">{preview.title}</h1>
                                    <div className="mb-6 text-sm text-slate-400">{preview.frontmatter.author}</div>
                                    <div className="space-y-2 text-sm text-slate-300">
                                        <div className="flex justify-between"><span>Language</span><span>{preview.frontmatter.language}</span></div>
                                        <div className="flex justify-between"><span>Units</span><span>{preview.frontmatter.unitCount}</span></div>
                                        <div className="flex justify-between"><span>Words</span><span>{preview.wordCount.toLocaleString()}</span></div>
                                    </div>
                                </aside>

                                <div className="min-h-[70vh] flex-1 rounded-[28px] bg-[#fbf6e8] px-8 py-10 shadow-2xl md:px-14 md:py-16">
                                    <div className="mb-12 text-center">
                                        <div className="mb-3 text-xs uppercase tracking-[0.28em] text-slate-500">Ebook frontmatter</div>
                                        <h1 className="mb-3 text-4xl font-semibold text-slate-950">{preview.title}</h1>
                                        <p className="text-base text-slate-600">{preview.frontmatter.author}</p>
                                    </div>
                                    <div className="font-serif">
                                        {preview.normalizedContent.units.map((unit) => (
                                            <section key={unit.index} className="mb-14">
                                                <h2 className="mb-6 text-3xl font-semibold text-slate-950">{unit.title}</h2>
                                                {renderBlocks(unit.content as PreviewBlockNode[])}
                                            </section>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ProjectPreviewScreen;
