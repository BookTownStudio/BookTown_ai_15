import React, { useState, useMemo } from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useBookmarks } from '../../lib/hooks/useBookmarks.ts';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { BookmarkType } from '../../types/entities.ts';
import BookmarkItem from '../../components/content/BookmarkItem.tsx';
import ErrorState from '../../components/ui/ErrorState.tsx';

type BookmarkFilter = BookmarkType | 'all';

const BookmarksScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate } = useNavigation();
    const [activeTab, setActiveTab] = useState<BookmarkFilter>('all');
    const { data: bookmarks, isLoading, isError, refetch } = useBookmarks();

    const handleBack = () => navigate({ type: 'tab', id: 'home' });

    const filteredBookmarks = useMemo(() => {
        if (!bookmarks) return [];
        if (activeTab === 'all') return bookmarks;
        if (activeTab === 'venue') {
            return bookmarks.filter(b => b.type === 'venue' || b.type === 'event');
        }
        return bookmarks.filter(b => b.type === activeTab);
    }, [bookmarks, activeTab]);

    const TABS: { id: BookmarkFilter, en: string, ar: string }[] = [
        { id: 'all', en: 'All', ar: 'الكل' },
        { id: 'book', en: 'Books', ar: 'كتب' },
        { id: 'quote', en: 'Quotes', ar: 'اقتباسات' },
        { id: 'post', en: 'Posts', ar: 'منشورات' },
        { id: 'author', en: 'Authors', ar: 'مؤلفون' },
        { id: 'venue', en: 'Venues', ar: 'أماكن' },
    ];

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex-grow flex items-center justify-center py-20">
                    <LoadingSpinner />
                </div>
            );
        }

        if (isError) {
            return (
                <div className="py-20">
                    <ErrorState 
                        onRetry={() => refetch()} 
                        message={lang === 'en' ? "Unable to connect to your library. Check your connection." : "تعذر الاتصال بمكتبتك. تحقق من اتصالك."}
                    />
                </div>
            );
        }

        if (!bookmarks || bookmarks.length === 0) {
            return (
                <div className="flex-grow flex flex-col items-center justify-center text-center py-32 opacity-60">
                    <BilingualText role="H2">
                        {lang === 'en' ? 'Your library is empty' : 'مكتبتك فارغة'}
                    </BilingualText>
                    <BilingualText role="Body" className="mt-2">
                        {lang === 'en' ? 'Items you save will appear here.' : 'العناصر التي تحفظها ستظهر هنا.'}
                    </BilingualText>
                </div>
            );
        }

        if (filteredBookmarks.length === 0) {
            return (
                <div className="flex-grow flex items-center justify-center text-center py-20">
                    <BilingualText className="text-white/60">
                        {lang === 'en' ? 'No items saved in this category yet.' : 'لم يتم حفظ أي عناصر في هذه الفئة بعد.'}
                    </BilingualText>
                </div>
            );
        }

        return (
            <div className="space-y-3 pb-20">
                {filteredBookmarks.map(bookmark => (
                    <BookmarkItem key={bookmark.id} bookmark={bookmark} />
                ))}
            </div>
        );
    };

    return (
        <div className="h-screen flex flex-col">
            <ScreenHeader titleEn="Bookmarks" titleAr="العلامات المرجعية" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto pt-20">
                <div className="container mx-auto px-4 md:px-8">
                    <div className="mb-4 overflow-x-auto scrollbar-hide border-b border-white/10">
                        <div className="flex items-center">
                            {TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex-shrink-0 py-3 px-4 text-center font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'text-accent border-accent' : 'text-white/60 border-transparent hover:text-white'}`}
                                >
                                    {lang === 'en' ? tab.en : tab.ar}
                                </button>
                            ))}
                        </div>
                    </div>
                    {renderContent()}
                </div>
            </main>
        </div>
    );
};

export default BookmarksScreen;