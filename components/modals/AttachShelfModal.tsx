
import React from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { useUserShelves } from '../../lib/hooks/useUserShelves.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { Shelf } from '../../types/entities.ts';
import { BookIcon } from '../icons/BookIcon.tsx';

interface AttachShelfModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (shelf: Shelf) => void;
}

const AttachShelfModal: React.FC<AttachShelfModalProps> = ({ isOpen, onClose, onSelect }) => {
    const { lang } = useI18n();
    const { data: shelves, isLoading } = useUserShelves();

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="w-full max-w-lg">
                <BilingualText role="H1" className="!text-xl text-center mb-4">
                    {lang === 'en' ? 'Attach a Shelf' : 'إرفاق رف'}
                </BilingualText>
                
                <div className="mt-4 h-80 overflow-y-auto space-y-2">
                    {isLoading && <div className="flex justify-center pt-8"><LoadingSpinner /></div>}
                    
                    {!isLoading && shelves && shelves.length > 0 ? (
                        shelves.map(shelf => (
                            <button
                                key={shelf.id}
                                onClick={() => onSelect(shelf)}
                                className="w-full flex items-center gap-3 p-3 rounded-lg text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors border border-black/5 dark:border-white/5"
                            >
                                <div className="w-10 h-10 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                                    <BookIcon className="h-5 w-5 text-slate-500 dark:text-slate-400" />
                                </div>
                                <div>
                                    <BilingualText className="font-semibold">{lang === 'en' ? shelf.titleEn : shelf.titleAr}</BilingualText>
                                    <BilingualText role="Caption">
                                        {Object.keys(shelf.entries || {}).length} {lang === 'en' ? 'books' : 'كتب'}
                                    </BilingualText>
                                </div>
                            </button>
                        ))
                    ) : (
                        !isLoading && (
                            <BilingualText className="text-center pt-8 text-slate-500">
                                {lang === 'en' ? 'No shelves found.' : 'لم يتم العثور على رفوف.'}
                            </BilingualText>
                        )
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default AttachShelfModal;
