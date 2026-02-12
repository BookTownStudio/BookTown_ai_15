

import React from 'react';
// FIX: Added file extensions to imports.
import { Quote } from '../../../types/entities.ts';
import SavedQuoteItem from './SavedQuoteItem.tsx';

interface QuotesListProps {
    quotes: Quote[];
}

const QuotesList: React.FC<QuotesListProps> = ({ quotes }) => {
    return (
        <div className="space-y-4">
            {quotes.map(quote => (
                <SavedQuoteItem key={quote.id} quote={quote} />
            ))}
        </div>
    );
};

export default QuotesList;
