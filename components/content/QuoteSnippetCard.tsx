import React from 'react';
// FIX: Add file extensions to imports
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
// FIX: Add file extension to entities.ts import
import { Quote } from '../../types/entities.ts';
import { QuoteCardDataAdapter } from './QuoteCardDataAdapter.ts';

interface QuoteSnippetCardProps {
    quote: Quote;
}

const QuoteSnippetCard: React.FC<QuoteSnippetCardProps> = ({ quote }) => {
    const { lang } = useI18n();
    const card = QuoteCardDataAdapter.fromQuote(quote);
    return (
        <GlassCard>
            <BilingualText role="Quote">
                {lang === 'en' ? card.textEn : card.textAr}
            </BilingualText>
            <BilingualText role="Caption" className="mt-4">
                — {lang === 'en' ? card.sourceEn : card.sourceAr}
            </BilingualText>
        </GlassCard>
    );
};

export default QuoteSnippetCard;
