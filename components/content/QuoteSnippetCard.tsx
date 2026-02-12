import React from 'react';
// FIX: Add file extensions to imports
import GlassCard from '../ui/GlassCard.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
// FIX: Add file extension to entities.ts import
import { Quote } from '../../types/entities.ts';

interface QuoteSnippetCardProps {
    quote: Quote;
}

const QuoteSnippetCard: React.FC<QuoteSnippetCardProps> = ({ quote }) => {
    const { lang } = useI18n();
    return (
        <GlassCard>
            <BilingualText role="Quote">
                {lang === 'en' ? quote.textEn : quote.textAr}
            </BilingualText>
            <BilingualText role="Caption" className="mt-4">
                — {lang === 'en' ? quote.sourceEn : quote.sourceAr}
            </BilingualText>
        </GlassCard>
    );
};

export default QuoteSnippetCard;