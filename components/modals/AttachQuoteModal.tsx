
import React, { useState } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import InputField from '../ui/InputField.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useSearchUserQuotes } from '../../lib/hooks/useSearchUserQuotes.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { Quote } from '../../types/entities.ts';
import { QuoteIcon } from '../icons/QuoteIcon.tsx';

interface AttachQuoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (quote: Quote) => void;
}

const AttachQuoteModal: React.FC<AttachQuoteModalProps> = ({ isOpen, onClose, onSelect }) => {
    const { lang } = useI18n();
    const [searchQuery, setSearchQuery] = useState('');
    const { data: quotes, isLoading } = useSearchUserQuotes(searchQuery);

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="w-full max-w-lg">
                <BilingualText role="H1" className="!text-xl text-center mb-4">
                    {lang === 'en' ? 'Attach a Quote' : 'إرفاق اقتباس'}
                </BilingualText>
                
                <InputField
                    id="quote-search-modal"
                    label=""
                    type="search"
                    placeholder={lang === 'en' ? 'Search quotes...' : 'ابحث في الاقتباسات...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                />
                
                <div className="mt-4 h-80 overflow-y-auto space-y-2">
                    {isLoading && <div className="flex justify-center pt-8"><LoadingSpinner /></div>}
                    
                    {!isLoading && quotes && quotes.length > 0 ? (
                        quotes.map(quote => (
                            <button
                                key={quote.id}
                                onClick={() => onSelect(quote)}
                                className="w-full p-4 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors border border-black/5 dark:border-white/5 group"
                            >
                                <div className="flex items-start gap-3">
                                    <QuoteIcon className="h-5 w-5 text-accent flex-shrink-0 mt-1" />
                                    <div>
                                        <BilingualText role="Body" className="italic line-clamp-3">"{lang === 'en' ? quote.textEn : quote.textAr}"</BilingualText>
                                        <BilingualText role="Caption" className="mt-1 text-slate-500 dark:text-white/60">
                                            — {lang === 'en' ? quote.sourceEn : quote.sourceAr}
                                        </BilingualText>
                                    </div>
                                </div>
                            </button>
                        ))
                    ) : (
                        !isLoading && (
                            <BilingualText className="text-center pt-8 text-slate-500">
                                {lang === 'en' ? 'No quotes found.' : 'لم يتم العثور على اقتباسات.'}
                            </BilingualText>
                        )
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default AttachQuoteModal;
