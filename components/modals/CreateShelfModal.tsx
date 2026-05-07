import React, { useState, useEffect } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import InputField from '../ui/InputField.tsx';
import { useI18n } from '../../store/i18n.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { useCreateShelf } from '../../lib/hooks/useCreateShelf.ts';
import { useDuplicateShelf } from '../../lib/hooks/useDuplicateShelf.ts';
import { Shelf } from '../../types/entities.ts';
import { useToast } from '../../store/toast.tsx';

interface CreateShelfModalProps {
    isOpen: boolean;
    onClose: () => void;
    duplicationSourceShelf?: Shelf | null;
}

const CreateShelfModal: React.FC<CreateShelfModalProps> = ({ isOpen, onClose, duplicationSourceShelf }) => {
    const { lang } = useI18n();
    const { showToast } = useToast();
    const [titleEn, setTitleEn] = useState('');
    const [titleAr, setTitleAr] = useState('');

    const { mutate: createShelf, isPending: isCreating } = useCreateShelf();
    const { mutate: duplicateShelf, isPending: isDuplicating } = useDuplicateShelf();

    // 🔒 Sync state with duplication source
    useEffect(() => {
      if (duplicationSourceShelf) {
        setTitleEn(lang === 'en' ? `Copy of ${duplicationSourceShelf.titleEn}` : duplicationSourceShelf.titleEn);
        setTitleAr(lang === 'ar' ? `نسخة من ${duplicationSourceShelf.titleAr}` : duplicationSourceShelf.titleAr);
      } else {
        setTitleEn('');
        setTitleAr('');
      }
    }, [duplicationSourceShelf, lang, isOpen]);

    const handleConfirm = () => {
        const trimmedEn = titleEn.trim();
        if (!trimmedEn) return;

        // Use current lang's input to derive the other if empty
        const finalEn = trimmedEn;
        const finalAr = titleAr.trim() || `${trimmedEn} (AR)`;

        if (duplicationSourceShelf) {
          duplicateShelf({
            sourceShelf: duplicationSourceShelf,
            newTitleEn: finalEn,
            newTitleAr: finalAr
          }, {
            onSuccess: () => {
              showToast(lang === 'en' ? 'Shelf duplicated!' : 'تم تكرار الرف!');
              onClose();
            },
            onError: (err: any) => {
                showToast(err.message || (lang === 'en' ? 'Failed to duplicate shelf' : 'فشل تكرار الرف'));
            }
          });
        } else {
          createShelf({ titleEn: finalEn, titleAr: finalAr }, {
            onSuccess: () => {
                onClose();
            }
          });
        }
    };

    const isBusy = isCreating || isDuplicating;
    const modalTitle = duplicationSourceShelf 
        ? (lang === 'en' ? 'Duplicate Shelf' : 'تكرار الرف')
        : (lang === 'en' ? 'Create New Shelf' : 'إنشاء رف جديد');

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="w-full max-w-lg">
                <BilingualText role="H1" className="!text-xl text-center mb-6">
                    {modalTitle}
                </BilingualText>
                
                <div className="space-y-4">
                    <InputField
                        id="shelf-name-en"
                        label={lang === 'en' ? 'Shelf Name (English)' : 'اسم الرف (انجليزي)'}
                        type="text"
                        placeholder={lang === 'en' ? 'e.g., Sci-Fi Classics' : 'مثال: كلاسيكيات الخيال العلمي'}
                        value={titleEn}
                        onChange={(e) => setTitleEn(e.target.value)}
                        disabled={isBusy}
                    />
                    <InputField
                        id="shelf-name-ar"
                        label={lang === 'en' ? 'Shelf Name (Arabic)' : 'اسم الرف (عربي)'}
                        type="text"
                        placeholder={lang === 'en' ? 'e.g., روايات عالمية' : 'مثال: روايات عالمية'}
                        value={titleAr}
                        onChange={(e) => setTitleAr(e.target.value)}
                        disabled={isBusy}
                    />
                </div>

                <div className="mt-8 flex justify-end gap-4">
                    <Button variant="ghost" onClick={onClose} disabled={isBusy}>
                        {lang === 'en' ? 'Cancel' : 'إلغاء'}
                    </Button>
                    <Button variant="primary" onClick={handleConfirm} disabled={isBusy || !titleEn.trim()}>
                        {isBusy ? <LoadingSpinner /> : (duplicationSourceShelf ? (lang === 'en' ? 'Duplicate' : 'تكرار') : (lang === 'en' ? 'Create' : 'إنشاء'))}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default CreateShelfModal;
