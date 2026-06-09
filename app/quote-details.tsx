
import React from 'react';
import { useNavigation } from '../store/navigation.tsx';
import { useI18n } from '../store/i18n.tsx';
import Button from '../components/ui/Button.tsx';
import BilingualText from '../components/ui/BilingualText.tsx';
import { ChevronLeftIcon } from '../components/icons/ChevronLeftIcon.tsx';
import { useQuoteDetails } from '../lib/hooks/useQuoteDetails.ts';
import { QuoteCardDataAdapter } from '../components/content/QuoteCardDataAdapter.ts';
import LoadingSpinner from '../components/ui/LoadingSpinner.tsx';
import { ShareIcon } from '../components/icons/ShareIcon.tsx';
import { BookmarkIcon } from '../components/icons/BookmarkIcon.tsx';
import { useSaveQuote } from '../lib/hooks/useSaveQuote.ts';
import { useToast } from '../store/toast.tsx';

const QuoteDetailsScreen: React.FC = () => {
    const { currentView, navigate, navigateToSocialAndHighlight } = useNavigation();
    const { lang } = useI18n();
    const { showToast } = useToast();

    const quoteId = currentView.type === 'immersive' ? currentView.params?.quoteId : undefined;
    const ownerId = currentView.type === 'immersive' ? currentView.params?.ownerId : undefined;

    const { data: quote, isLoading } = useQuoteDetails(quoteId, ownerId);
    const { mutate: saveQuote, isPending: isSaving } = useSaveQuote();

    const handleBack = () => {
        const fromView = currentView.params?.from;
        const postId = currentView.params?.postId;

        if (fromView && fromView.type === 'tab' && fromView.id === 'social' && postId) {
            navigateToSocialAndHighlight(postId);
        } else if (fromView) {
            navigate(fromView);
        } else {
            navigate({ type: 'tab', id: 'home' });
        }
    };

    const handleSaveQuote = () => {
        const sourceQuoteId = quote?.legacyQuoteId || quote?.id;
        if (!sourceQuoteId || !quote?.ownerId) return;

        saveQuote(
            { quoteId: sourceQuoteId, ownerId: quote.ownerId },
            {
                onSuccess: (result) => {
                    showToast(
                        result.alreadySaved
                            ? (lang === 'en' ? 'Quote already saved.' : 'الاقتباس محفوظ بالفعل.')
                            : (lang === 'en' ? 'Quote saved.' : 'تم حفظ الاقتباس.')
                    );
                },
                onError: () => {
                    showToast(lang === 'en' ? 'Failed to save quote.' : 'تعذر حفظ الاقتباس.');
                }
            }
        );
    };

    return (
        <div className="h-screen w-full flex flex-col bg-slate-900">
            <header className="fixed top-0 left-0 right-0 z-20 bg-slate-900/50 backdrop-blur-lg border-b border-white/10">
                <div className="container mx-auto flex h-20 items-center">
                    <Button variant="ghost" onClick={handleBack} aria-label={lang === 'en' ? 'Back' : 'رجوع'}>
                        <ChevronLeftIcon className="h-6 w-6" />
                    </Button>
                </div>
            </header>

            <main className="flex-grow flex items-center justify-center pt-20 pb-8">
                <div className="container mx-auto p-4 md:p-8 text-center">
                    {isLoading && <LoadingSpinner />}
                    {quote && (
                        <div className="max-w-2xl mx-auto">
                            {(() => {
                                const card = QuoteCardDataAdapter.fromQuote(quote);
                                return (
                                  <>
                            <BilingualText role="Quote" className="!text-3xl sm:!text-4xl !text-white !border-white/50">
                                "{lang === 'en' ? card.textEn : card.textAr}"
                            </BilingualText>
                            <BilingualText role="Body" className="mt-6 !text-lg text-white/70">
                                — {lang === 'en' ? card.sourceEn : card.sourceAr}
                            </BilingualText>
                                  </>
                                );
                            })()}

                            <div className="mt-12 flex items-center justify-center gap-4">
                                <Button variant="primary" onClick={handleSaveQuote} disabled={isSaving}>
                                    <BookmarkIcon className="h-5 w-5 mr-2" />
                                    {isSaving
                                        ? (lang === 'en' ? 'Saving...' : 'جارٍ الحفظ...')
                                        : (lang === 'en' ? 'Save Quote' : 'حفظ الاقتباس')}
                                </Button>
                                <Button variant="ghost">
                                    <ShareIcon className="h-5 w-5 mr-2" />
                                    {lang === 'en' ? 'Share' : 'مشاركة'}
                                </Button>
                            </div>
                        </div>
                    )}
                    {!isLoading && !quote && (
                         <BilingualText role="Body" className="mt-2 text-white/60">
                            {lang === 'en' ? 'Could not load quote details.' : 'تعذر تحميل تفاصيل الاقتباس.'}
                        </BilingualText>
                    )}
                </div>
            </main>
        </div>
    );
};

export default QuoteDetailsScreen;
