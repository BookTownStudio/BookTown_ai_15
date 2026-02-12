
import React, { useState } from 'react';
import BilingualText from '../../../components/ui/BilingualText.tsx';
import GlassCard from '../../../components/ui/GlassCard.tsx';
import { BookIcon } from '../../../components/icons/BookIcon.tsx';
import Button from '../../../components/ui/Button.tsx';
import { PlusIcon } from '../../../components/icons/PlusIcon.tsx';
import { UploadIcon } from '../../../components/icons/UploadIcon.tsx';
import { useI18n } from '../../../store/i18n.tsx';
import { mockBooks, mockAuthors } from '../../../data/mocks.ts';
import { dataService } from '../../../services/dataService.ts';
import { useToast } from '../../../store/toast.tsx';
import LoadingSpinner from '../../../components/ui/LoadingSpinner.tsx';

const CatalogTab: React.FC = () => {
    const { lang } = useI18n();
    const { showToast } = useToast();
    const [isHydrating, setIsHydrating] = useState(false);

    const handleHydrate = async () => {
        if (!confirm("This will write mock books and authors to the database. Continue?")) return;
        
        setIsHydrating(true);
        try {
            const authors = Object.values(mockAuthors);
            const books = Object.values(mockBooks);

            console.log(`[Hydrate] Seeding ${authors.length} authors and ${books.length} books...`);

            // Seed Authors
            for (const author of authors) {
                await dataService.catalog.createAuthor(author);
            }

            // Seed Books
            for (const book of books) {
                await dataService.catalog.createBook(book);
            }

            showToast(lang === 'en' ? 'Catalog hydrated successfully!' : 'تم تحديث الكتالوج بنجاح!');
        } catch (e: any) {
            console.error("Hydration failed:", e);
            showToast(lang === 'en' ? 'Failed to hydrate catalog.' : 'فشل في تحديث الكتالوج.');
        } finally {
            setIsHydrating(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <BilingualText role="H1" className="!text-xl">
                    {lang === 'en' ? 'Books Catalog' : 'كتالوج الكتب'}
                </BilingualText>
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={handleHydrate} disabled={isHydrating} className="!px-3 !py-1 !text-sm">
                        {isHydrating ? <LoadingSpinner /> : <><UploadIcon className="h-4 w-4 mr-2" /> {lang === 'en' ? 'Hydrate from Mocks' : 'ملء من البيانات الوهمية'}</>}
                    </Button>
                    <Button variant="primary" className="!px-3 !py-1 !text-sm">
                        <PlusIcon className="h-4 w-4 mr-2" />
                        {lang === 'en' ? 'Add Book' : 'أضف كتاب'}
                    </Button>
                </div>
            </div>

            <GlassCard className="flex flex-col items-center justify-center p-8 text-center border-dashed border-2 border-slate-600 bg-transparent">
                <BookIcon className="h-12 w-12 text-slate-500 mb-4" />
                <BilingualText className="text-slate-400 max-w-sm">
                    {lang === 'en' 
                        ? 'Search, edit, or merge books in the global database.' 
                        : 'بحث أو تعديل أو دمج الكتب في قاعدة البيانات العالمية.'}
                </BilingualText>
            </GlassCard>

            <div className="space-y-2">
                <BilingualText role="Caption" className="uppercase tracking-wider px-2">Pending Review</BilingualText>
                {[1, 2].map((_, i) => (
                    <GlassCard key={i} className="!p-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-8 bg-slate-700 rounded" />
                            <div>
                                <div className="text-sm font-bold">Unknown Title #{i + 123}</div>
                                <div className="text-xs text-slate-400">Imported from Google Books</div>
                            </div>
                        </div>
                        <Button variant="ghost" className="!text-xs">Review</Button>
                    </GlassCard>
                ))}
            </div>
        </div>
    );
};

export default CatalogTab;
