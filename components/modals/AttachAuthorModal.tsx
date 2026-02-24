
import React, { useState } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import InputField from '../ui/InputField.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useSearchUserAuthors } from '../../lib/hooks/useSearchUserAuthors.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { Author } from '../../types/entities.ts';
import AuthorCardMini from '../content/AuthorCardMini.tsx';

interface AttachAuthorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (author: Author) => void;
}

const AttachAuthorModal: React.FC<AttachAuthorModalProps> = ({ isOpen, onClose, onSelect }) => {
    const { lang } = useI18n();
    const [searchQuery, setSearchQuery] = useState('');
    const { data: authors, isLoading } = useSearchUserAuthors(searchQuery);
    const handleSelectAuthor = (author: Author) => {
        onSelect(author);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="w-full max-w-lg">
                <BilingualText role="H1" className="!text-xl text-center mb-4">
                    {lang === 'en' ? 'Attach an Author' : 'إرفاق مؤلف'}
                </BilingualText>
                
                <InputField
                    id="author-search-modal"
                    label=""
                    type="search"
                    placeholder={lang === 'en' ? 'Search authors...' : 'ابحث عن المؤلفين...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                />
                
                <div className="mt-4 h-80 overflow-y-auto space-y-2">
                    {isLoading && <div className="flex justify-center pt-8"><LoadingSpinner /></div>}
                    
                    {!isLoading && authors && authors.length > 0 ? (
                        authors.map(author => (
                            <AuthorCardMini
                                key={author.id}
                                author={author}
                                mode="select"
                                onSelect={handleSelectAuthor}
                            />
                        ))
                    ) : (
                        !isLoading && (
                            <BilingualText className="text-center pt-8 text-slate-500">
                                {lang === 'en' ? 'No authors found.' : 'لم يتم العثور على مؤلفين.'}
                            </BilingualText>
                        )
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default AttachAuthorModal;
