import React from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { useI18n } from '../../store/i18n.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';

interface ConfirmDeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    isDeleting: boolean;
    itemName: string;
    itemType: string;
}

const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    isDeleting,
    itemName,
    itemType
}) => {
    const { lang } = useI18n();

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="text-center">
                <div className="mb-4 flex justify-center">
                    <div className="p-3 bg-red-500/10 rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </div>
                </div>
                <BilingualText role="H1" className="!text-xl">
                    {lang === 'en' ? `Delete ${itemType}?` : `حذف ${itemType}؟`}
                </BilingualText>
                <BilingualText role="Body" className="mt-4 text-slate-600 dark:text-white/70">
                    {lang === 'en' 
                        ? `Are you sure you want to delete "${itemName}"? This post will be removed from public view.` 
                        : `هل أنت متأكد أنك تريد حذف "${itemName}"؟ سيتم إزالة هذا المنشور من العرض العام.`}
                </BilingualText>
            </div>
            <div className="mt-8 flex flex-col gap-3">
                <Button 
                    variant="primary" 
                    onClick={onConfirm} 
                    disabled={isDeleting}
                    className="w-full !h-12 !bg-red-600 hover:!bg-red-700 border-none"
                >
                    {isDeleting ? <LoadingSpinner className="!h-5 !w-5" /> : (lang === 'en' ? 'Confirm Delete' : 'تأكيد الحذف')}
                </Button>
                <Button variant="ghost" onClick={onClose} disabled={isDeleting} className="w-full">
                    {lang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
            </div>
        </Modal>
    );
};

export default ConfirmDeleteModal;