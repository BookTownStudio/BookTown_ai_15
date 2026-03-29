
import React, { useState } from 'react';
import ScreenHeader from '../../components/navigation/ScreenHeader.tsx';
import BilingualText from '../../components/ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import InputField from '../../components/ui/InputField.tsx';
import LoadingSpinner from '../../components/ui/LoadingSpinner.tsx';
import { useSearchUserAuthors } from '../../lib/hooks/useSearchUserAuthors.ts';
import AuthorCardMini from '../../components/content/AuthorCardMini.tsx';
import LiteraryShell from '../../components/layout/LiteraryShell.tsx';

const AuthorsScreen: React.FC = () => {
    const { lang } = useI18n();
    const { navigate } = useNavigation();
    const [searchQuery, setSearchQuery] = useState('');
    const { data: authorsData, isLoading, isError } = useSearchUserAuthors(searchQuery);

    const handleBack = () => navigate({ type: 'tab', id: 'home' });

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex-grow flex items-center justify-center h-full">
                    <LoadingSpinner />
                </div>
            );
        }

        if (isError) {
            return (
                <div className="flex-grow flex items-center justify-center h-full">
                    <BilingualText>{lang === 'en' ? 'Error loading authors.' : 'خطأ في تحميل المؤلفين.'}</BilingualText>
                </div>
            );
        }
        
        // Rule: STATE_INITIALIZATION_SAFETY
        const authors = authorsData ?? [];

        if (!searchQuery.trim()) {
            return (
                <div className="min-h-[22rem] flex items-start justify-center pt-10 text-center">
                    <div className="max-w-xl">
                        <BilingualText>
                            {lang === 'en'
                                ? 'Search authors, then open an author card to load it into BookTown.'
                                : 'ابحث عن المؤلفين ثم افتح بطاقة المؤلف لتحميله إلى بوك تاون.'}
                        </BilingualText>
                    </div>
                </div>
            );
        }
        
        if (authors.length === 0 && searchQuery) {
             return (
                <div className="min-h-[22rem] flex items-start justify-center pt-10 text-center">
                    <div className="max-w-xl">
                        <BilingualText>{lang === 'en' ? `No authors found for "${searchQuery}"` : `لم يتم العثور على مؤلفين لـ "${searchQuery}"`}</BilingualText>
                    </div>
                </div>
            );
        }

        return (
             <div className="space-y-3">
                {authors.map(author => (
                    <AuthorCardMini key={author.id} author={author} />
                ))}
            </div>
        );
    };


    return (
        <div className="h-screen flex flex-col">
            <ScreenHeader titleEn="Authors" titleAr="المؤلفون" onBack={handleBack} />
            <main className="flex-grow overflow-y-auto pt-20 pb-8">
                <LiteraryShell className="h-full">
                    <div className="mb-4">
                        <InputField 
                            id="author-search"
                            label=""
                            type="search"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={lang === 'en' ? 'Search authors...' : 'ابحث عن المؤلفين...'}
                        />
                    </div>
                    {renderContent()}
                </LiteraryShell>
            </main>
        </div>
    );
};

export default AuthorsScreen;
