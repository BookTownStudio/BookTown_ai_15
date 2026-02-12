
import React, { useState, useRef } from 'react';
import Modal from '../ui/Modal.tsx';
import BilingualText from '../ui/BilingualText.tsx';
import Button from '../ui/Button.tsx';
import InputField from '../ui/InputField.tsx';
import { useI18n } from '../../store/i18n.tsx';
import LoadingSpinner from '../ui/LoadingSpinner.tsx';
import { useCreateVenue } from '../../lib/hooks/useCreateVenue.ts';
import { Venue, Event } from '../../types/entities.ts';
import { useMediaUpload } from '../../lib/hooks/useMediaUpload.ts';
import { UploadIcon } from '../icons/UploadIcon.tsx';

interface CreateVenueModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type FormType = 'location' | 'event';

const CreateVenueModal: React.FC<CreateVenueModalProps> = ({ isOpen, onClose }) => {
    const { lang } = useI18n();
    const [formType, setFormType] = useState<FormType>('location');
    const { mutate: createVenue, isLoading: isCreating } = useCreateVenue();
    const { upload, isUploading } = useMediaUpload();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Common fields
    const [nameEn, setNameEn] = useState('');
    const [type, setType] = useState('');
    const [imageUrl, setImageUrl] = useState('');

    // Location specific fields
    const [address, setAddress] = useState('');
    const [openingHours, setOpeningHours] = useState('');
    const [descriptionEn, setDescriptionEn] = useState('');

    // Event specific fields
    const [dateTime, setDateTime] = useState('');
    const [duration, setDuration] = useState('');
    const [isOnline, setIsOnline] = useState(false);
    const [venueName, setVenueName] = useState('');
    const [link, setLink] = useState('');

    const resetForm = () => {
        setNameEn('');
        setType('');
        setImageUrl('');
        setAddress('');
        setOpeningHours('');
        setDescriptionEn('');
        setDateTime('');
        setDuration('');
        setIsOnline(false);
        setVenueName('');
        setLink('');
    };
    
    const handleClose = () => {
        resetForm();
        onClose();
    }

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const url = await upload(file, 'venue');
            if (url) {
                setImageUrl(url);
            }
        }
    };

    const isLocationFormValid = nameEn && type && address && imageUrl;
    const isEventFormValid = nameEn && type && dateTime && imageUrl && (isOnline ? link : venueName);

    const handleSubmit = () => {
        if (formType === 'location' && isLocationFormValid) {
            const newLocation: Omit<Venue, 'id' | 'ownerId'> = {
                name: nameEn,
                type,
                address,
                imageUrl,
                openingHours,
                descriptionEn,
                descriptionAr: `${descriptionEn} (AR)`, 
            };
            createVenue(newLocation, { onSuccess: handleClose });
        } else if (formType === 'event' && isEventFormValid) {
            const newEvent: Omit<Event, 'id' | 'ownerId'> = {
                titleEn: nameEn,
                titleAr: `${nameEn} (AR)`,
                type,
                dateTime,
                imageUrl,
                duration,
                isOnline,
                venueName: isOnline ? undefined : venueName,
                link: isOnline ? link : undefined,
                privacy: 'public',
            };
            createVenue(newEvent, { onSuccess: handleClose });
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={handleClose}>
            <div className="w-full max-w-lg">
                <BilingualText role="H1" className="!text-xl text-center mb-4">
                    {lang === 'en' ? 'Create New Venue' : 'إنشاء مكان جديد'}
                </BilingualText>

                <div className="flex items-center justify-center border-b border-black/10 dark:border-white/10 mb-4">
                    <button onClick={() => setFormType('location')} className={`py-2 px-4 font-semibold border-b-2 ${formType === 'location' ? 'text-accent border-accent' : 'border-transparent text-slate-500'}`}>
                        {lang === 'en' ? 'Location' : 'مكان'}
                    </button>
                    <button onClick={() => setFormType('event')} className={`py-2 px-4 font-semibold border-b-2 ${formType === 'event' ? 'text-accent border-accent' : 'border-transparent text-slate-500'}`}>
                        {lang === 'en' ? 'Event' : 'فعالية'}
                    </button>
                </div>
                
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {/* Image Upload */}
                    <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                    <div 
                        className="w-full aspect-video border-2 border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-accent hover:text-accent overflow-hidden relative"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {imageUrl ? (
                            <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <div className="flex flex-col items-center text-slate-500">
                                {isUploading ? <LoadingSpinner /> : <><UploadIcon className="h-8 w-8 mb-2" /><BilingualText>Upload Image</BilingualText></>}
                            </div>
                        )}
                    </div>

                    {formType === 'location' ? (
                        <>
                            <InputField id="loc-name" label={lang === 'en' ? 'Location Name' : 'اسم المكان'} value={nameEn} onChange={e => setNameEn(e.target.value)} required />
                            <InputField id="loc-type" label={lang === 'en' ? 'Type (e.g., Bookstore)' : 'النوع (مثال: مكتبة)'} value={type} onChange={e => setType(e.target.value)} required />
                            <InputField id="loc-address" label={lang === 'en' ? 'Address' : 'العنوان'} value={address} onChange={e => setAddress(e.target.value)} required />
                            <InputField id="loc-hours" label={lang === 'en' ? 'Opening Hours' : 'ساعات العمل'} value={openingHours} onChange={e => setOpeningHours(e.target.value)} />
                            <textarea id="loc-desc" placeholder={lang === 'en' ? 'Description' : 'الوصف'} value={descriptionEn} onChange={e => setDescriptionEn(e.target.value)} rows={3} className="w-full bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-md px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent" />
                        </>
                    ) : (
                        <>
                            <InputField id="evt-name" label={lang === 'en' ? 'Event Title' : 'عنوان الفعالية'} value={nameEn} onChange={e => setNameEn(e.target.value)} required />
                            <InputField id="evt-type" label={lang === 'en' ? 'Type (e.g., Author Signing)' : 'النوع (مثال: توقيع مؤلف)'} value={type} onChange={e => setType(e.target.value)} required />
                            <InputField id="evt-datetime" label={lang === 'en' ? 'Date & Time' : 'التاريخ والوقت'} type="datetime-local" value={dateTime} onChange={e => setDateTime(e.target.value)} required />
                            <InputField id="evt-duration" label={lang === 'en' ? 'Duration (e.g., 2 hours)' : 'المدة (مثال: ساعتان)'} value={duration} onChange={e => setDuration(e.target.value)} />
                            
                            <div className="flex items-center gap-2">
                                 <input type="checkbox" id="isOnline" checked={isOnline} onChange={e => setIsOnline(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"/>
                                 <label htmlFor="isOnline"><BilingualText>This is an online event</BilingualText></label>
                            </div>

                            {isOnline ? (
                                 <InputField id="evt-link" label={lang === 'en' ? 'Event Link' : 'رابط الفعالية'} value={link} onChange={e => setLink(e.target.value)} required />
                            ) : (
                                 <InputField id="evt-venue" label={lang === 'en' ? 'Venue Name' : 'اسم المكان'} value={venueName} onChange={e => setVenueName(e.target.value)} required />
                            )}
                        </>
                    )}
                </div>

                <div className="mt-6 flex justify-end gap-4">
                    <Button variant="ghost" onClick={handleClose} disabled={isCreating || isUploading}>
                        {lang === 'en' ? 'Cancel' : 'إلغاء'}
                    </Button>
                    <Button variant="primary" onClick={handleSubmit} disabled={isCreating || isUploading || (formType === 'location' ? !isLocationFormValid : !isEventFormValid)}>
                        {isCreating ? <LoadingSpinner /> : (lang === 'en' ? 'Create' : 'إنشاء')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default CreateVenueModal;
