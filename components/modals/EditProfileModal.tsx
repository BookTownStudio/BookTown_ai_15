
import React, { useRef } from 'react';
import Modal from '../ui/Modal.tsx';
import InputField from '../ui/InputField.tsx';
import Button from '../ui/Button.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import { useI18n } from '../../store/i18n.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { useMediaUpload } from '../../lib/hooks/useMediaUpload.ts';
import { UploadIcon } from '../icons/UploadIcon.tsx';

export type ProfileEditData = {
    name: string;
    bioEn: string;
    bioAr: string;
    avatarUrl: string;
    bannerUrl: string;
};

interface EditProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    profileData: ProfileEditData;
    setProfileData: React.Dispatch<React.SetStateAction<ProfileEditData>>;
    onSave: () => void;
    isSaving: boolean;
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({
    isOpen,
    onClose,
    profileData,
    setProfileData,
    onSave,
    isSaving
}) => {
    const { lang } = useI18n();
    const { upload, isUploading } = useMediaUpload();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const url = await upload(file, 'avatar');
            if (url) {
                setProfileData(prev => ({ ...prev, avatarUrl: url }));
            }
        }
    };
    
    const handleBannerUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const url = await upload(file, 'banner');
            if (url) {
                setProfileData(prev => ({ ...prev, bannerUrl: url }));
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <BilingualText role="H1" className="!text-2xl mb-6 text-center">
                {lang === 'en' ? 'Edit Profile' : 'تعديل الملف الشخصي'}
            </BilingualText>

            <div className="relative mb-10">
                <div
                    className="relative h-32 w-full rounded-xl overflow-hidden cursor-pointer group border border-slate-600"
                    onClick={() => bannerInputRef.current?.click()}
                    aria-label={lang === 'en' ? 'Upload header image' : 'رفع صورة الغلاف'}
                >
                    {profileData.bannerUrl ? (
                        <img src={profileData.bannerUrl} alt="Header" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full bg-slate-700/40 flex items-center justify-center text-slate-300 text-xs">
                            {lang === 'en' ? 'Upload header image' : 'ارفع صورة الغلاف'}
                        </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {isUploading ? <LoadingSpinner /> : <UploadIcon className="w-6 h-6 text-white" />}
                    </div>
                    <input type="file" ref={bannerInputRef} onChange={handleBannerUpload} accept="image/*" className="hidden" />
                </div>

                <div className="absolute -bottom-10 left-4">
                    <div 
                        className="relative w-24 h-24 rounded-full overflow-hidden cursor-pointer group border-4 border-gray-100 dark:border-slate-800 shadow-lg"
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                        aria-label={lang === 'en' ? 'Upload avatar' : 'رفع الصورة الشخصية'}
                    >
                        <img src={profileData.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {isUploading ? <LoadingSpinner /> : <UploadIcon className="w-5 h-5 text-white" />}
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handleAvatarUpload} accept="image/*" className="hidden" />
                    </div>
                </div>
            </div>

            <div className="space-y-4 pt-4">
                <InputField
                    id="name"
                    name="name"
                    label={lang === 'en' ? 'Name' : 'الاسم'}
                    value={profileData.name}
                    onChange={handleChange}
                />
                
                <div>
                    <label htmlFor="bioEn">
                        <BilingualText role="Caption" className="!text-slate-700 dark:!text-white/80 mb-1 block">
                            {lang === 'en' ? 'Bio (English)' : 'النبذة (إنجليزي)'}
                        </BilingualText>
                    </label>
                    <textarea
                        id="bioEn"
                        name="bioEn"
                        value={profileData.bioEn}
                        onChange={handleChange}
                        rows={4}
                        className="w-full bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-md px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent transition-all duration-200 resize-none"
                    />
                </div>

                <div>
                    <label htmlFor="bioAr">
                        <BilingualText role="Caption" className="!text-slate-700 dark:!text-white/80 mb-1 block">
                            {lang === 'en' ? 'Bio (Arabic)' : 'النبذة (عربي)'}
                        </BilingualText>
                    </label>
                    <textarea
                        id="bioAr"
                        name="bioAr"
                        value={profileData.bioAr}
                        onChange={handleChange}
                        rows={4}
                        dir="rtl"
                        className="w-full bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-md px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent transition-all duration-200 resize-none"
                    />
                </div>
            </div>
            <div className="mt-6 flex justify-end gap-4">
                <Button variant="ghost" onClick={onClose} disabled={isSaving || isUploading}>
                    {lang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button variant="primary" onClick={onSave} disabled={isSaving || isUploading}>
                    {isSaving ? <LoadingSpinner /> : (lang === 'en' ? 'Save Changes' : 'حفظ التغييرات')}
                </Button>
            </div>
        </Modal>
    );
};

export default EditProfileModal;
