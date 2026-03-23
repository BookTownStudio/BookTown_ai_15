import React, { useCallback, useMemo, useState } from 'react';
import ReaderChrome from '../ReaderChrome.tsx';
import ReaderSettings from '../ReaderSettings.tsx';
import ReaderSurface from './ReaderSurface.tsx';
import { useI18n } from '../../../store/i18n.tsx';
import { useReadingPreferences } from '../../../store/reading-prefs.tsx';
import { resolveReaderEngine } from '../../../lib/reader/runtime/engineSelection.ts';
import type { ReaderFormat } from '../../../lib/reader/runtime/contracts.ts';
import type { Book } from '../../../types/entities.ts';

type ReleaseEbookPreviewReaderProps = {
    title: string;
    author: string;
    signedUrl: string;
    onBack: () => void;
    previewLabel: string;
    initialPage?: number;
    footerSlot?: React.ReactNode;
};

const ReleaseEbookPreviewReader: React.FC<ReleaseEbookPreviewReaderProps> = ({
    title,
    author,
    signedUrl,
    onBack,
    previewLabel,
    initialPage = 1,
    footerSlot,
}) => {
    const { lang } = useI18n();
    const { theme, readingMode, fontSize, fontStyle } = useReadingPreferences();
    const [isChromeVisible, setIsChromeVisible] = useState(true);
    const [isSettingsVisible, setIsSettingsVisible] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [renderError, setRenderError] = useState<string | null>(null);

    const previewBook = useMemo<Book>(
        () => ({
            id: 'preview_release',
            authorId: 'preview_author',
            title: title,
            titleEn: title,
            titleAr: title,
            authorEn: author,
            authorAr: author,
            authors: [author],
            coverUrl: '',
            descriptionEn: '',
            descriptionAr: '',
            genresEn: [],
            genresAr: [],
            rating: 0,
            ratingsCount: 0,
            isEbookAvailable: true,
        }),
        [author, title]
    );

    const runtimeSelection = useMemo(
        () => resolveReaderEngine({ platform: 'web', format: 'epub' as ReaderFormat }),
        []
    );

    const handlePageChange = useCallback((nextPage: number, pagesCount: number) => {
        setCurrentPage(nextPage);
        setTotalPages(Math.max(1, pagesCount));
    }, []);

    const handleEpubLoadError = useCallback(
        (message: string) => {
            console.error('[PREVIEW][EBOOK_RENDER_FAILED]', message);
            setRenderError(
                lang === 'en'
                    ? 'Unable to render this ebook preview in-app. You can open the file directly.'
                    : 'تعذّر عرض معاينة هذا الكتاب الإلكتروني داخل التطبيق. يمكنك فتح الملف مباشرة.'
            );
        },
        [lang]
    );

    const progressPercent =
        totalPages > 0 ? Math.min(100, Math.max(0, (currentPage / totalPages) * 100)) : 0;
    const renderOpenFileFallback = (message: string) => (
        <div className="h-full w-full flex flex-col items-center justify-center px-6 text-center gap-4 text-white">
            <p className="text-sm text-white/70 max-w-md">{message}</p>
            <a
                href={signedUrl}
                target="_blank"
                rel="noreferrer"
                className="px-5 py-2 rounded-full bg-white/10 hover:bg-white/20 transition"
                onClick={(event) => event.stopPropagation()}
            >
                {lang === 'en' ? 'Open File' : 'فتح الملف'}
            </a>
        </div>
    );

    return (
        <div
            className="reader-container h-screen w-full flex flex-col overflow-hidden"
            style={{
                backgroundColor:
                    theme === 'light' ? '#ffffff' : theme === 'sepia' ? '#F3E9D2' : '#000000',
            }}
        >
            <div className="pointer-events-none fixed left-1/2 top-20 z-30 -translate-x-1/2">
                <span className="inline-flex rounded-full border border-white/10 bg-slate-950/75 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-200 backdrop-blur-md">
                    {previewLabel}
                </span>
            </div>

            <ReaderChrome
                isVisible={isChromeVisible}
                book={previewBook}
                onBack={onBack}
                progress={progressPercent}
                currentPage={currentPage}
                totalPages={totalPages}
                onSettingsClick={() => setIsSettingsVisible(true)}
            />

            <div
                className="flex-grow min-h-0 relative"
                onClick={() => {
                    setIsChromeVisible((visible) => !visible);
                }}
            >
                {renderError ? (
                    renderOpenFileFallback(renderError)
                ) : (
                    <ReaderSurface
                        selection={runtimeSelection}
                        signedUrl={signedUrl}
                        initialPage={initialPage}
                        theme={theme}
                        readingMode={readingMode}
                        fontSize={fontSize}
                        fontStyle={fontStyle}
                        onPageChange={handlePageChange}
                        onPdfLoadError={handleEpubLoadError}
                        onEpubLoadError={handleEpubLoadError}
                        renderUnsupported={() =>
                            renderOpenFileFallback(
                                lang === 'en'
                                    ? 'This ebook format is not recognized by the in-app reader yet.'
                                    : 'صيغة هذا الكتاب الإلكتروني غير معروفة للقارئ داخل التطبيق حالياً.'
                            )
                        }
                    />
                )}
            </div>

            {isSettingsVisible ? (
                <ReaderSettings onClose={() => setIsSettingsVisible(false)} />
            ) : null}

            {footerSlot ? (
                <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4">
                    <div className="pointer-events-auto mx-auto max-w-md">
                        {footerSlot}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default ReleaseEbookPreviewReader;
