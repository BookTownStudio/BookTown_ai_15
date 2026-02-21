
import React, { useMemo, useState, useRef } from 'react';
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
import { useVenuesAndEvents } from '../../lib/hooks/useVenuesAndEvents.ts';

interface CreateVenueModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type FormType = 'location' | 'event';
type EventLocationMode = 'existing' | 'new';
type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

const TYPE_OTHER = '__other__';

const LOCATION_TYPE_OPTIONS = [
    { value: 'bookstore', labelEn: 'Bookstore', labelAr: 'متجر كتب' },
    { value: 'library', labelEn: 'Library', labelAr: 'مكتبة' },
    { value: 'reading-cafe', labelEn: 'Reading Cafe', labelAr: 'مقهى قراءة' },
    { value: 'community-space', labelEn: 'Community Space', labelAr: 'مساحة مجتمعية' },
    { value: TYPE_OTHER, labelEn: 'Other', labelAr: 'أخرى' },
];

const EVENT_TYPE_OPTIONS = [
    { value: 'author-signing', labelEn: 'Author Signing', labelAr: 'توقيع مؤلف' },
    { value: 'book-club', labelEn: 'Book Club', labelAr: 'نادي كتاب' },
    { value: 'reading-session', labelEn: 'Reading Session', labelAr: 'جلسة قراءة' },
    { value: 'talk', labelEn: 'Talk', labelAr: 'ندوة' },
    { value: TYPE_OTHER, labelEn: 'Other', labelAr: 'أخرى' },
];

const WEEKDAY_ORDER: { key: WeekdayKey; labelEn: string; labelAr: string }[] = [
    { key: 'mon', labelEn: 'Mon', labelAr: 'الإثنين' },
    { key: 'tue', labelEn: 'Tue', labelAr: 'الثلاثاء' },
    { key: 'wed', labelEn: 'Wed', labelAr: 'الأربعاء' },
    { key: 'thu', labelEn: 'Thu', labelAr: 'الخميس' },
    { key: 'fri', labelEn: 'Fri', labelAr: 'الجمعة' },
    { key: 'sat', labelEn: 'Sat', labelAr: 'السبت' },
    { key: 'sun', labelEn: 'Sun', labelAr: 'الأحد' },
];

const DEFAULT_OPENING_SCHEDULE: Record<WeekdayKey, { closed: boolean; open: string; close: string }> = {
    mon: { closed: false, open: '09:00', close: '17:00' },
    tue: { closed: false, open: '09:00', close: '17:00' },
    wed: { closed: false, open: '09:00', close: '17:00' },
    thu: { closed: false, open: '09:00', close: '17:00' },
    fri: { closed: false, open: '09:00', close: '17:00' },
    sat: { closed: true, open: '09:00', close: '17:00' },
    sun: { closed: true, open: '09:00', close: '17:00' },
};

const CreateVenueModal: React.FC<CreateVenueModalProps> = ({ isOpen, onClose }) => {
    const { lang } = useI18n();
    const [formType, setFormType] = useState<FormType>('location');
    const { mutate: createVenue, isLoading: isCreating } = useCreateVenue();
    const { upload, isUploading } = useMediaUpload();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { data: locationCandidates = [], isLoading: isLoadingLocations } = useVenuesAndEvents('');

    // Shared fields
    const [nameEn, setNameEn] = useState('');
    const [imageUrl, setImageUrl] = useState('');

    // Location fields
    const [locationType, setLocationType] = useState(LOCATION_TYPE_OPTIONS[0].value);
    const [customLocationType, setCustomLocationType] = useState('');
    const [address, setAddress] = useState('');
    const [openingSchedule, setOpeningSchedule] = useState(DEFAULT_OPENING_SCHEDULE);
    const [descriptionEn, setDescriptionEn] = useState('');
    const [latitude, setLatitude] = useState<number | undefined>(undefined);
    const [longitude, setLongitude] = useState<number | undefined>(undefined);
    const [city, setCity] = useState('');
    const [country, setCountry] = useState('');
    const [placeId, setPlaceId] = useState('');
    const [isLocating, setIsLocating] = useState(false);
    const [locationError, setLocationError] = useState('');

    // Event fields
    const [eventType, setEventType] = useState(EVENT_TYPE_OPTIONS[0].value);
    const [customEventType, setCustomEventType] = useState('');
    const [dateTime, setDateTime] = useState('');
    const [duration, setDuration] = useState('');
    const [isOnline, setIsOnline] = useState(false);
    const [eventLocationMode, setEventLocationMode] = useState<EventLocationMode>('existing');
    const [selectedLocationId, setSelectedLocationId] = useState('');
    const [newVenueName, setNewVenueName] = useState('');
    const [link, setLink] = useState('');

    const existingLocations = useMemo(
        () => locationCandidates.filter((item): item is Venue => 'address' in item),
        [locationCandidates]
    );
    const selectedLocation = useMemo(
        () => existingLocations.find((location) => location.id === selectedLocationId),
        [existingLocations, selectedLocationId]
    );

    const resolveType = (selectedType: string, customType: string): string =>
        selectedType === TYPE_OTHER ? customType.trim() : selectedType;

    const resolvedLocationType = resolveType(locationType, customLocationType);
    const resolvedEventType = resolveType(eventType, customEventType);
    const hasAtLeastOneOpenDay = Object.values(openingSchedule).some((day) => !day.closed);

    const openingHoursSummary = useMemo(() => {
        return WEEKDAY_ORDER.map(({ key, labelEn, labelAr }) => {
            const dayConfig = openingSchedule[key];
            const dayLabel = lang === 'en' ? labelEn : labelAr;
            if (dayConfig.closed) return `${dayLabel}: Closed`;
            return `${dayLabel}: ${dayConfig.open}-${dayConfig.close}`;
        }).join(' | ');
    }, [lang, openingSchedule]);

    const resetForm = () => {
        setNameEn('');
        setImageUrl('');
        setLocationType(LOCATION_TYPE_OPTIONS[0].value);
        setCustomLocationType('');
        setAddress('');
        setOpeningSchedule(DEFAULT_OPENING_SCHEDULE);
        setDescriptionEn('');
        setLatitude(undefined);
        setLongitude(undefined);
        setCity('');
        setCountry('');
        setPlaceId('');
        setLocationError('');
        setEventType(EVENT_TYPE_OPTIONS[0].value);
        setCustomEventType('');
        setDateTime('');
        setDuration('');
        setIsOnline(false);
        setEventLocationMode('existing');
        setSelectedLocationId('');
        setNewVenueName('');
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

    const applyCurrentLocation = async () => {
        if (!navigator.geolocation) {
            setLocationError(lang === 'en' ? 'Geolocation is not supported in this browser.' : 'الموقع الجغرافي غير مدعوم في هذا المتصفح.');
            return;
        }
        setIsLocating(true);
        setLocationError('');
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const lat = Number(position.coords.latitude.toFixed(7));
                    const lng = Number(position.coords.longitude.toFixed(7));
                    setLatitude(lat);
                    setLongitude(lng);

                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
                    if (!response.ok) {
                        throw new Error('reverse-geocode-failed');
                    }

                    const data = await response.json();
                    const normalizedAddress = (data?.display_name || '').trim();
                    if (normalizedAddress) setAddress(normalizedAddress);

                    const addressData = data?.address || {};
                    setCity((addressData.city || addressData.town || addressData.village || '').trim());
                    setCountry((addressData.country || '').trim());
                    setPlaceId((data?.place_id ? String(data.place_id) : '').trim());
                } catch (error) {
                    console.error('[CreateVenueModal][LOCATION_LOOKUP_FAILED]', error);
                    setLocationError(lang === 'en' ? 'Location detected, but address lookup failed.' : 'تم تحديد الموقع ولكن فشل جلب العنوان.');
                } finally {
                    setIsLocating(false);
                }
            },
            (error) => {
                console.error('[CreateVenueModal][GEOLOCATION_FAILED]', error);
                setLocationError(lang === 'en' ? 'Unable to detect location. Please check permissions.' : 'تعذر تحديد الموقع. يرجى التحقق من الأذونات.');
                setIsLocating(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    const updateSchedule = (day: WeekdayKey, patch: Partial<{ closed: boolean; open: string; close: string }>) => {
        setOpeningSchedule((previous) => ({
            ...previous,
            [day]: {
                ...previous[day],
                ...patch,
            },
        }));
    };

    const isLocationFormValid =
        nameEn.trim().length > 0 &&
        resolvedLocationType.length > 0 &&
        address.trim().length > 0 &&
        imageUrl.trim().length > 0 &&
        hasAtLeastOneOpenDay;

    const isEventVenueValid = isOnline
        ? link.trim().length > 0
        : eventLocationMode === 'existing'
            ? selectedLocationId.trim().length > 0
            : newVenueName.trim().length > 0;

    const isEventFormValid =
        nameEn.trim().length > 0 &&
        resolvedEventType.length > 0 &&
        dateTime.trim().length > 0 &&
        imageUrl.trim().length > 0 &&
        isEventVenueValid;

    const handleSubmit = () => {
        if (formType === 'location' && isLocationFormValid) {
            const newLocation: Omit<Venue, 'id' | 'ownerId'> = {
                name: nameEn.trim(),
                type: resolvedLocationType,
                address: address.trim(),
                imageUrl,
                openingHours: openingHoursSummary,
                openingSchedule: {
                    mon: { closed: openingSchedule.mon.closed, open: openingSchedule.mon.closed ? null : openingSchedule.mon.open, close: openingSchedule.mon.closed ? null : openingSchedule.mon.close },
                    tue: { closed: openingSchedule.tue.closed, open: openingSchedule.tue.closed ? null : openingSchedule.tue.open, close: openingSchedule.tue.closed ? null : openingSchedule.tue.close },
                    wed: { closed: openingSchedule.wed.closed, open: openingSchedule.wed.closed ? null : openingSchedule.wed.open, close: openingSchedule.wed.closed ? null : openingSchedule.wed.close },
                    thu: { closed: openingSchedule.thu.closed, open: openingSchedule.thu.closed ? null : openingSchedule.thu.open, close: openingSchedule.thu.closed ? null : openingSchedule.thu.close },
                    fri: { closed: openingSchedule.fri.closed, open: openingSchedule.fri.closed ? null : openingSchedule.fri.open, close: openingSchedule.fri.closed ? null : openingSchedule.fri.close },
                    sat: { closed: openingSchedule.sat.closed, open: openingSchedule.sat.closed ? null : openingSchedule.sat.open, close: openingSchedule.sat.closed ? null : openingSchedule.sat.close },
                    sun: { closed: openingSchedule.sun.closed, open: openingSchedule.sun.closed ? null : openingSchedule.sun.open, close: openingSchedule.sun.closed ? null : openingSchedule.sun.close },
                },
                descriptionEn: descriptionEn.trim(),
                descriptionAr: `${descriptionEn.trim()} (AR)`,
                location:
                    latitude !== undefined && longitude !== undefined
                        ? {
                            latitude,
                            longitude,
                            city: city.trim() || undefined,
                            country: country.trim() || undefined,
                            placeId: placeId.trim() || undefined,
                        }
                        : undefined,
            };
            createVenue(newLocation, { onSuccess: handleClose });
        } else if (formType === 'event' && isEventFormValid) {
            const resolvedVenueName = isOnline
                ? undefined
                : eventLocationMode === 'existing'
                    ? selectedLocation?.name
                    : newVenueName.trim();

            const newEvent: Omit<Event, 'id' | 'ownerId'> = {
                titleEn: nameEn.trim(),
                titleAr: `${nameEn.trim()} (AR)`,
                type: resolvedEventType,
                dateTime,
                imageUrl,
                duration: duration.trim() || undefined,
                isOnline,
                locationId: isOnline || eventLocationMode !== 'existing' ? undefined : selectedLocationId,
                venueName: resolvedVenueName,
                link: isOnline ? link.trim() : undefined,
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
                            <div>
                                <label htmlFor="loc-type" className="text-xs text-slate-400 mb-1 block">{lang === 'en' ? 'Type' : 'النوع'}</label>
                                <select
                                    id="loc-type"
                                    value={locationType}
                                    onChange={(event) => setLocationType(event.target.value)}
                                    className="h-12 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-white focus:outline-none focus:ring-2 focus:ring-accent"
                                >
                                    {LOCATION_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {lang === 'en' ? option.labelEn : option.labelAr}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {locationType === TYPE_OTHER && (
                                <InputField
                                    id="loc-type-other"
                                    label={lang === 'en' ? 'Specify Type' : 'حدد النوع'}
                                    value={customLocationType}
                                    onChange={e => setCustomLocationType(e.target.value)}
                                    required
                                />
                            )}
                            <InputField id="loc-address" label={lang === 'en' ? 'Address' : 'العنوان'} value={address} onChange={e => setAddress(e.target.value)} required />
                            <div className="flex items-center gap-2">
                                <Button type="button" variant="ghost" onClick={applyCurrentLocation} disabled={isLocating}>
                                    {isLocating
                                        ? (lang === 'en' ? 'Detecting location...' : 'جاري تحديد الموقع...')
                                        : (lang === 'en' ? 'Use Current Location' : 'استخدم موقعي الحالي')}
                                </Button>
                                {latitude !== undefined && longitude !== undefined && (
                                    <BilingualText role="Caption">{`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}</BilingualText>
                                )}
                            </div>
                            {locationError && (
                                <BilingualText role="Caption" className="!text-red-400">{locationError}</BilingualText>
                            )}
                            {(city || country) && (
                                <BilingualText role="Caption" className="!text-slate-400">
                                    {lang === 'en' ? `Detected: ${city || '-'} ${country ? `(${country})` : ''}` : `تم التعرف: ${city || '-'} ${country ? `(${country})` : ''}`}
                                </BilingualText>
                            )}
                            <div className="rounded-md border border-slate-700 p-3">
                                <BilingualText role="Body" className="font-semibold mb-3">
                                    {lang === 'en' ? 'Opening Hours' : 'ساعات العمل'}
                                </BilingualText>
                                <div className="space-y-2">
                                    {WEEKDAY_ORDER.map((day) => {
                                        const dayConfig = openingSchedule[day.key];
                                        return (
                                            <div key={day.key} className="grid grid-cols-[72px,1fr,1fr,auto] items-center gap-2">
                                                <BilingualText role="Caption" className="!text-slate-300">{lang === 'en' ? day.labelEn : day.labelAr}</BilingualText>
                                                <input
                                                    type="time"
                                                    value={dayConfig.open}
                                                    disabled={dayConfig.closed}
                                                    onChange={(event) => updateSchedule(day.key, { open: event.target.value })}
                                                    className="h-10 rounded-md border border-slate-600 bg-slate-800 px-2 text-white disabled:opacity-40"
                                                />
                                                <input
                                                    type="time"
                                                    value={dayConfig.close}
                                                    disabled={dayConfig.closed}
                                                    onChange={(event) => updateSchedule(day.key, { close: event.target.value })}
                                                    className="h-10 rounded-md border border-slate-600 bg-slate-800 px-2 text-white disabled:opacity-40"
                                                />
                                                <label className="flex items-center gap-1 text-xs text-slate-300">
                                                    <input
                                                        type="checkbox"
                                                        checked={dayConfig.closed}
                                                        onChange={(event) => updateSchedule(day.key, { closed: event.target.checked })}
                                                    />
                                                    {lang === 'en' ? 'Closed' : 'مغلق'}
                                                </label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <textarea id="loc-desc" placeholder={lang === 'en' ? 'Description' : 'الوصف'} value={descriptionEn} onChange={e => setDescriptionEn(e.target.value)} rows={3} className="w-full bg-black/5 dark:bg-black/20 border border-black/10 dark:border-white/10 rounded-md px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent" />
                        </>
                    ) : (
                        <>
                            <InputField id="evt-name" label={lang === 'en' ? 'Event Title' : 'عنوان الفعالية'} value={nameEn} onChange={e => setNameEn(e.target.value)} required />
                            <div>
                                <label htmlFor="evt-type" className="text-xs text-slate-400 mb-1 block">{lang === 'en' ? 'Type' : 'النوع'}</label>
                                <select
                                    id="evt-type"
                                    value={eventType}
                                    onChange={(event) => setEventType(event.target.value)}
                                    className="h-12 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-white focus:outline-none focus:ring-2 focus:ring-accent"
                                >
                                    {EVENT_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {lang === 'en' ? option.labelEn : option.labelAr}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {eventType === TYPE_OTHER && (
                                <InputField
                                    id="evt-type-other"
                                    label={lang === 'en' ? 'Specify Type' : 'حدد النوع'}
                                    value={customEventType}
                                    onChange={e => setCustomEventType(e.target.value)}
                                    required
                                />
                            )}
                            <InputField id="evt-datetime" label={lang === 'en' ? 'Date & Time' : 'التاريخ والوقت'} type="datetime-local" value={dateTime} onChange={e => setDateTime(e.target.value)} required />
                            <InputField id="evt-duration" label={lang === 'en' ? 'Duration (e.g., 2 hours)' : 'المدة (مثال: ساعتان)'} value={duration} onChange={e => setDuration(e.target.value)} />
                            
                            <div className="flex items-center gap-2">
                                 <input type="checkbox" id="isOnline" checked={isOnline} onChange={e => setIsOnline(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"/>
                                 <label htmlFor="isOnline"><BilingualText>This is an online event</BilingualText></label>
                            </div>

                            {isOnline ? (
                                 <InputField id="evt-link" label={lang === 'en' ? 'Event Link' : 'رابط الفعالية'} value={link} onChange={e => setLink(e.target.value)} required />
                            ) : (
                                <div className="space-y-2 rounded-md border border-slate-700 p-3">
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 text-sm text-slate-300">
                                            <input
                                                type="radio"
                                                name="event-location-mode"
                                                checked={eventLocationMode === 'existing'}
                                                onChange={() => setEventLocationMode('existing')}
                                            />
                                            {lang === 'en' ? 'Select Existing Location' : 'اختر موقعاً موجوداً'}
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-slate-300">
                                            <input
                                                type="radio"
                                                name="event-location-mode"
                                                checked={eventLocationMode === 'new'}
                                                onChange={() => setEventLocationMode('new')}
                                            />
                                            {lang === 'en' ? 'Add New Location Name' : 'أضف اسم موقع جديد'}
                                        </label>
                                    </div>
                                    {eventLocationMode === 'existing' ? (
                                        <>
                                            <label htmlFor="evt-location-select" className="text-xs text-slate-400 block">
                                                {lang === 'en' ? 'Location' : 'الموقع'}
                                            </label>
                                            <select
                                                id="evt-location-select"
                                                value={selectedLocationId}
                                                onChange={(event) => setSelectedLocationId(event.target.value)}
                                                disabled={isLoadingLocations}
                                                className="h-12 w-full rounded-md border border-slate-600 bg-slate-800 px-3 text-white focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
                                            >
                                                <option value="">{lang === 'en' ? 'Select a location' : 'اختر موقعاً'}</option>
                                                {existingLocations.map((location) => (
                                                    <option key={location.id} value={location.id}>
                                                        {location.name}
                                                    </option>
                                                ))}
                                            </select>
                                            {existingLocations.length === 0 && !isLoadingLocations && (
                                                <BilingualText role="Caption" className="!text-amber-400">
                                                    {lang === 'en'
                                                        ? 'No locations available yet. Choose "Add New Location Name" or create a location first.'
                                                        : 'لا توجد مواقع متاحة حالياً. اختر "إضافة اسم موقع جديد" أو أنشئ موقعاً أولاً.'}
                                                </BilingualText>
                                            )}
                                        </>
                                    ) : (
                                        <InputField
                                            id="evt-venue-new"
                                            label={lang === 'en' ? 'New Location Name' : 'اسم الموقع الجديد'}
                                            value={newVenueName}
                                            onChange={e => setNewVenueName(e.target.value)}
                                            required
                                        />
                                    )}
                                </div>
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
