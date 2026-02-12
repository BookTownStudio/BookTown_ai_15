
import React, { useRef } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import { useI18n } from '../../store/i18n.tsx';
import { UploadIcon } from '../icons/UploadIcon.tsx';
import { useMediaUpload } from '../../lib/hooks/useMediaUpload.ts';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';

interface AttachMediaModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (url: string) => void;
}

const AttachMediaModal: React.FC<AttachMediaModalProps> = ({ isOpen, onClose, onSelect }) => {
    const { lang } = useI18n();
    const { upload, isUploading } = useMediaUpload();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const url = await upload(file, 'post');
            if (url) {
                onSelect(url);
                onClose();
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="w-full max-w-lg">
                <BilingualText role="H1" className="!text-xl text-center mb-6">
                    {lang === 'en' ? 'Attach Media' : 'إرفاق وسائط'}
                </BilingualText>
                
                <div 
                    className="mb-6 p-8 border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center text-slate-500 hover:border-accent hover:text-accent cursor-pointer transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                >
                    {isUploading ? (
                        <LoadingSpinner />
                    ) : (
                        <>
                            <UploadIcon className="w-12 h-12 mb-2" />
                            <BilingualText>{lang === 'en' ? 'Click to Upload Image' : 'انقر لرفع صورة'}</BilingualText>
                        </>
                    )}
                </div>

                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    accept="image/*" 
                    className="hidden" 
                />
                
                <div className="mt-6 flex justify-end gap-4">
                    <Button variant="ghost" onClick={onClose} disabled={isUploading}>
                        {lang === 'en' ? 'Cancel' : 'إلغاء'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default AttachMediaModal;
