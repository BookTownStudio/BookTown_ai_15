import React, { useState, useEffect, useRef } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import InputField from '../ui/InputField.tsx';
import { useI18n } from '../../store/i18n.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { Shelf } from '../../types/entities.ts';
import { useUpdateShelf } from '../../lib/hooks/useUpdateShelf.ts';
import { UploadIcon } from '../icons/UploadIcon.tsx';

interface EditShelfModalProps {
    isOpen: boolean;
    onClose: () => void;
    shelf: Shelf | null;
}

const EditShelfModal: React.FC<EditShelfModalProps> = ({ isOpen, onClose, shelf }) => {
    const { lang } = useI18n();
    const [titleEn, setTitleEn] = useState('');
    const [coverUrl, setCoverUrl] = useState<string | undefined>(undefined);
    const { mutate: updateShelf, isLoading: isUpdating } = useUpdateShelf();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (shelf) {
            setTitleEn(shelf.titleEn);
            setCoverUrl(shelf.userCoverUrl);
        } else {
            setTitleEn('');
            setCoverUrl(undefined);
        }
    }, [shelf]);

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setCoverUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSave = () => {
        if (!titleEn.trim() || !shelf) return;

        const titleAr = `${titleEn.trim()} (AR)`;
        
        updateShelf({ 
            shelfId: shelf.id, 
            updates: { 
                titleEn: titleEn.trim(), 
                titleAr,
                userCoverUrl: coverUrl
            } 
        }, {
            onSuccess: () => {
                onClose();
            }
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <BilingualText role="H1" className="!text-xl text-center mb-6">
                {lang === 'en' ? 'Edit Shelf' : 'تعديل الرف'}
            </BilingualText>
            
            <div className="space-y-4">
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                
                <div 
                    className="w-full aspect-video rounded-lg overflow-hidden relative group bg-slate-700 cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                >
                    {coverUrl ? (
                        <img src={coverUrl} alt="Shelf cover preview" className="w-full h-full object-cover" />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400">
                             <UploadIcon className="h-8 w-8 mb-2" />
                             <BilingualText>{lang === 'en' ? 'Upload Cover' : 'تحميل غلاف'}</BilingualText>
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <BilingualText>{lang === 'en' ? 'Change Image' : 'تغيير الصورة'}</BilingualText>
                    </div>
                </div>

                <InputField
                    id="edit-shelf-name"
                    label={lang === 'en' ? 'Shelf Name (English)' : 'اسم الرف (انجليزي)'}
                    type="text"
                    value={titleEn}
                    onChange={(e) => setTitleEn(e.target.value)}
                />
            </div>

            <div className="mt-6 flex justify-end gap-4">
                <Button variant="ghost" onClick={onClose} disabled={isUpdating}>
                    {lang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button variant="primary" onClick={handleSave} disabled={isUpdating || !titleEn.trim()}>
                    {isUpdating ? <LoadingSpinner /> : (lang === 'en' ? 'Save Changes' : 'حفظ التغييرات')}
                </Button>
            </div>
        </Modal>
    );
};

export default EditShelfModal;