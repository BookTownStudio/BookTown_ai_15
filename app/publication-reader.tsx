import React from 'react';
import ScreenHeader from '../components/navigation/ScreenHeader.tsx';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import EmptyState from '../components/ui/EmptyState.tsx';
import ErrorState from '../components/ui/ErrorState.tsx';
import { BookIcon } from '../components/icons/BookIcon.tsx';
import LongformReadingSurface from '../components/content/LongformReadingSurface.tsx';
import { useNavigation } from '../store/navigation.tsx';
import { useLongformPublication } from '../lib/hooks/useLongformPublication.ts';

const PublicationReaderScreen: React.FC = () => {
    const { currentView, navigate } = useNavigation();
    const publicationId =
        currentView.type === 'immersive' && typeof currentView.params?.publicationId === 'string'
            ? currentView.params.publicationId
            : '';
    const from = currentView.type === 'immersive' ? currentView.params?.from : undefined;

    console.log('PROFILE_GATE_PUBLICATION', publicationId);
    console.log('PROFILE_GATE_PROFILE_STATE', undefined);
    console.log('PROFILE_GATE_BEFORE_LONGFORM');

    const {
        data: publication,
        isLoading,
        isError,
        error,
        refetch,
    } = useLongformPublication(publicationId);

    console.log('READER_PUBLICATION_DOC', publication);
    console.log('READER_PUBLICATION_TYPE', publication?.publicationType);
    console.log('READER_BEFORE_LONGFORM_BRANCH');

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
                    <LongformReadingSurface
                        title={publication.title}
                        author={publication.author}
                        coverUrl={publication.coverUrl}
                        excerpt={publication.excerpt}
                        estimatedReadingMinutes={publication.estimatedReadingMinutes}
                        normalizedContent={publication.normalizedContent}
                    />
                </div>
            </main>
        </div>
    );
};

export default PublicationReaderScreen;
