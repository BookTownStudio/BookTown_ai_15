import React from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { Book } from '../../types/entities.ts';

interface PurchaseHubModalProps {
    isOpen: boolean;
    onClose: () => void;
    book: Book;
}

const PurchaseHubModal: React.FC<PurchaseHubModalProps> = ({ isOpen, onClose, book }) => {
    const { lang } = useI18n();

    const vendors = [
        { name: 'Amazon Kindle', price: '$9.99' },
        { name: 'Apple Books', price: '$10.99' },
        { name: 'Local Bookstore', price: 'Check Price' },
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="text-center">
                <BilingualText role="H1" className="!text-2xl">
                    {lang === 'en' ? 'Purchase Options' : 'خيارات الشراء'}
                </BilingualText>
                <BilingualText role="Body" className="mt-2 text-white/70">
                    {lang === 'en' ? book.titleEn : book.titleAr}
                </BilingualText>
            </div>
            <div className="mt-6 space-y-3">
                {vendors.map(vendor => (
                    <a href="#" key={vendor.name} className="flex items-center justify-between p-3 bg-slate-700/50 hover:bg-slate-700 rounded-lg transition-colors">
                        <BilingualText>{vendor.name}</BilingualText>
                        <BilingualText className="font-semibold text-accent">{vendor.price}</BilingualText>
                    </a>
                ))}
            </div>
            <div className="mt-6 text-center">
                <Button variant="ghost" onClick={onClose}>
                    {lang === 'en' ? 'Close' : 'إغلاق'}
                </Button>
            </div>
        </Modal>
    );
};

export default PurchaseHubModal;
