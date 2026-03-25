import React from 'react';
import { useQuoteDetails } from '../../lib/hooks/useQuoteDetails.ts';
import { useI18n } from '../../store/i18n.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useNavigation } from '../../store/navigation.tsx';
import { useBookCatalog } from '../../lib/hooks/useBookCatalog.ts';
import { BookIcon } from '../icons/BookIcon.tsx';

interface QuoteCardProps {
    quoteId: string;
    ownerId?: string;
    onPress: () => void;
}

const SourceChip: React.FC<{ bookId: string }> = ({ bookId }) => {
    const { lang } = useI18n();
    const { data: book } = useBookCatalog(bookId);
    const { navigate, currentView } = useNavigation();

    if (!book) return null;

    const handlePress = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigate({ type: 'immersive', id: 'bookDetails', params: { bookId, from: currentView } });
    }

    return (
        <button onClick={handlePress} className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-black/10 dark:bg-white/10 rounded-full text-xs hover:bg-accent/20 transition-colors">
            <BookIcon className="h-3 w-3" />
            <span className="truncate">{lang === 'en' ? `From: ${book.titleEn}` : `من: ${book.titleAr}`}</span>
        </button>
    )
}

const QuoteCard: React.FC<QuoteCardProps> = ({ quoteId, ownerId, onPress }) => {
    const { lang } = useI18n();
    const { data: quote, isLoading } = useQuoteDetails(quoteId, ownerId);
    
    if (isLoading) return <div className="h-24 w-full bg-black/5 dark:bg-white/5 animate-pulse rounded-lg mt-3" />;
    if (!quote) return null;

    const quoteText = lang === 'en' ? quote.textEn : quote.textAr;
    const authorText = lang === 'en' ? quote.sourceEn : quote.sourceAr;
    const shortQuoteLabel = quoteText.split(' ').slice(0, 8).join(' ');

    return (
        <button 
            onClick={onPress} 
            className="w-full text-left mt-3 group"
            aria-label={`Quote: ${shortQuoteLabel} — ${authorText}`}
        >
            <div className="relative p-4 rounded-2xl backdrop-blur-sm bg-black/5 dark:bg-white/[0.06] border border-black/10 dark:border-white/10 transition-all duration-200 group-hover:shadow-lg group-hover:border-white/20">
                <span className="absolute top-2 left-3 text-4xl font-serif text-slate-500/40 dark:text-white/40 opacity-80 group-hover:text-accent/50 transition-colors">❝</span>
                <BilingualText role="Body" className="!text-lg !italic !leading-relaxed text-slate-800/90 dark:text-white/90 px-2 pt-2">
                    {quoteText}
                </BilingualText>
                <span className="absolute bottom-9 right-3 text-4xl font-serif text-slate-500/40 dark:text-white/40 opacity-80 group-hover:text-accent/50 transition-colors">❞</span>
                
                <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10 w-full text-right">
                    <BilingualText role="Caption" className="!text-slate-600/80 dark:!text-white/60">
                        — {authorText}
                    </BilingualText>
                    {quote.bookId && <SourceChip bookId={quote.bookId} />}
                </div>
            </div>
        </button>
    );
};

export default QuoteCard;
