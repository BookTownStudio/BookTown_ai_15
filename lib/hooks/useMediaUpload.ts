
import { useState, useCallback } from 'react';
import { useAuth } from '../auth';
import { dataService } from '../../services/dataService';
import { UploadCategory } from '../../services/db.types';
import { useToast } from '../../store/toast.tsx';
import { useI18n } from '../../store/i18n.tsx';

export const useMediaUpload = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { lang } = useI18n();
    const uid = user?.uid;
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const upload = useCallback(async (
        file: File, 
        category: UploadCategory, 
        id?: string
    ): Promise<string | null> => {
        if (!uid) {
            const msg = lang === 'en' ? 'User not authenticated.' : 'المستخدم غير مسجل الدخول.';
            setError(msg);
            showToast(msg);
            return null;
        }

        setIsUploading(true);
        setProgress(0);
        setError(null);

        try {
            // Note: We're calling the unified dataService.upload.uploadImage
            // The underlying implementation handles the MediaService logic
            // However, the current DataService interface doesn't support progress callback nicely without modification.
            // For now, we assume the underlying service handles it or we'd need to extend DataService.
            // Since we implemented MediaService separately, let's allow passing an onProgress callback if possible,
            // or rely on the implementation details. 
            // In the `FirebaseUploadService` we implemented, we just call it.
            // To get progress up here, we might need a direct reference or update the interface.
            // For simplicity in this step, we'll implement a direct `uploadWithProgress` helper if the service supports it,
            // or just await the result.
            
            // Actually, let's use the `uploadImage` method we defined in db.types.ts
            // We can't easily pass the callback through the generic interface unless we change it.
            // BUT, since we are replacing the logic in firebaseDbService, we can sneak it in or accept it.
            
            // Let's assume standard promise for now, and simulate progress or just jump to 100 on done.
            const url = await dataService.upload.uploadImage(uid, category, file, id);
            if (typeof url !== 'string' || url.trim().length === 0) {
                throw new Error(lang === 'en' ? 'Upload failed.' : 'فشل رفع الملف.');
            }
            setProgress(100);
            return url;
        } catch (e: any) {
            console.error("Upload failed", e);
            const msg = e.message || (lang === 'en' ? 'Upload failed.' : 'فشل رفع الملف.');
            setError(msg);
            showToast(msg);
            return null;
        } finally {
            setIsUploading(false);
        }
    }, [uid, lang, showToast]);

    return { upload, isUploading, progress, error };
};
