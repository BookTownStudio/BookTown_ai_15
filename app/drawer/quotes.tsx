

import React, { useState } from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import QuotesList from '../../components/features/quotes/QuotesList.tsx';
import { useSearchUserQuotes } from '../../lib/hooks/useSearchUserQuotes.ts';
import InputField from '../../components/ui/InputField.tsx';
import { useBookCatalog } from '../../lib/hooks/useBookCatalog.ts';
import { useAuthorDetails } from '../../lib/hooks/useAuthorDetails.ts';

const QuotesScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();
    const [searchQuery, setSearchQuery] = useState('');

    const bookId = currentView.type === 'drawer' && currentView.params?.bookId ? currentView.params.bookId : undefined;
    const authorId = currentView.type === 'drawer' && currentView.params?.authorId ? currentView.params.authorId : undefined;
    
    const { data: quotes, isLoading, isError } = useSearchUserQuotes(searchQuery, bookId, authorId);
    const { data: book } = useBookCatalog(bookId);
    const { data: author } = useAuthorDetails(authorId);

    const handleBack = () => {
        if (currentView.params?.from) {
            navigate(currentView.params.from);
        } else {
            navigate({ type: 'tab', id: 'home' });
        }
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex-grow flex items-center justify-center h-full">
                    <LoadingSpinner />
                </div>
            );
        }

        if (isError || !quotes) {
            return (
                <div className="flex-grow flex items-center justify-center h-full">
                    <BilingualText>{lang === 'en' ? 'Error loading quotes.' : 'خطأ في تحميل الاقتباسات.'}</BilingualText>
                </div>
            );
        }
        
        if (quotes.length === 0 && bookId) {
             return (
                <div className="flex-grow flex items-center justify-center h-full text-center">
                    <BilingualText>{lang === 'en' ? `No saved quotes from this book.` : `لا توجد اقتباسات محفوظة من هذا الكتاب.`}</BilingualText>
                </div>
            );
        }

        if (quotes.length === 0 && authorId) {
            return (
               <div className="flex-grow flex items-center justify-center h-full text-center">
                   <BilingualText>{lang === 'en' ? `No saved quotes from this author.` : `لا توجد اقتباسات محفوظة من هذا المؤلف.`}</BilingualText>
               </div>
           );
       }

        if (quotes.length === 0 && searchQuery) {
             return (
                <div className="flex-grow flex items-center justify-center h-full text-center">
                    <BilingualText>{lang === 'en' ? `No quotes found for "${searchQuery}"` : `لم يتم العثور على اقتباسات لـ "${searchQuery}"`}</BilingualText>
                </div>
            );
        }

        return <QuotesList quotes={quotes} />;
    };

    return (
        <div className="h-screen flex flex-col">
            <ScreenHeader titleEn="Quotes" titleAr="الاقتباسات" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto pt-20 pb-8">
                <div className="container mx-auto px-4 md:px-8 h-full">
                    {book && (
                        <BilingualText role="Body" className="mb-4 text-slate-400 dark:text-white/60">
                            {lang === 'en' ? 'Showing quotes from: ' : 'عرض الاقتباسات من: '}
                            <span className="font-semibold text-slate-600 dark:text-white/80">{lang === 'en' ? book.titleEn : book.titleAr}</span>
                        </BilingualText>
                    )}
                    {author && (
                        <BilingualText role="Body" className="mb-4 text-slate-400 dark:text-white/60">
                            {lang === 'en' ? 'Quotes from: ' : 'اقتباسات من: '}
                            <span className="font-semibold text-slate-600 dark:text-white/80">{lang === 'en' ? author.nameEn : author.nameAr}</span>
                        </BilingualText>
                    )}
                    <div className="mb-4">
                        <InputField 
                            id="quote-search"
                            label=""
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={lang === 'en' ? 'Search your quotes...' : 'ابحث في اقتباساتك...'}
                        />
                    </div>
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default QuotesScreen;