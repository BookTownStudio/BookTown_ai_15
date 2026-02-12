import React from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { useAuthorDetails } from '../../lib/hooks/useAuthorDetails.ts';
import { useBooksByAuthor } from '../../lib/hooks/useBooksByAuthor.ts';
import BookCard from '../../components/content/BookCard.tsx';

const BooksScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate, currentView } = useNavigation();

    const authorId = currentView.type === 'drawer' && currentView.params?.authorId ? currentView.params.authorId : undefined;
    
    const { data: author } = useAuthorDetails(authorId);
    const { data: books, isLoading, isError } = useBooksByAuthor(authorId);

    const handleBack = () => {
        if (currentView.params?.from) {
            navigate(currentView.params.from);
        } else {
            navigate({ type: 'tab', id: 'home' });
        }
    };
    
    const handleBookClick = (bookId: string) => {
        navigate({ type: 'immersive', id: 'bookDetails', params: { bookId, from: currentView } });
    };

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex-grow flex items-center justify-center h-full">
                    <LoadingSpinner />
                </div>
            );
        }

        if (isError || !books) {
            return (
                <div className="flex-grow flex items-center justify-center h-full">
                    <BilingualText>{lang === 'en' ? 'Error loading books.' : 'خطأ في تحميل الكتب.'}</BilingualText>
                </div>
            );
        }
        
        if (books.length === 0) {
             return (
                <div className="flex-grow flex items-center justify-center h-full text-center">
                    <BilingualText>{lang === 'en' ? `No books found for this author.` : `لم يتم العثور على كتب لهذا المؤلف.`}</BilingualText>
                </div>
            );
        }

        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {books.map(book => (
                     <div key={book.id} onClick={() => handleBookClick(book.id)} className="cursor-pointer">
                        <BookCard bookId={book.id} layout="grid" />
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div className="h-screen flex flex-col">
            <ScreenHeader titleEn="Books" titleAr="الكتب" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto pt-20 pb-8">
                <div className="container mx-auto px-4 md:px-8 h-full">
                    {author && (
                        <BilingualText role="Body" className="mb-4 text-slate-400 dark:text-white/60">
                            {lang === 'en' ? 'All works by: ' : 'جميع أعمال: '}
                            <span className="font-semibold text-slate-600 dark:text-white/80">{lang === 'en' ? author.nameEn : author.nameAr}</span>
                        </BilingualText>
                    )}
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default BooksScreen;