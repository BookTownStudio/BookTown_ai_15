
import { useState, useCallback } from 'react';
import { useAuth } from '../auth.tsx';
import { dataService } from '../../services/dataService.ts';
import { AttachmentTypeV1, AttachmentV1 } from '../../types/entities.ts';
import { useToast } from '../../store/toast.tsx';
import { UPLOAD_LIMITS_MB } from '../media/types.ts';

interface UploadParams {
    file: File;
    type: AttachmentTypeV1;
    parentId: string;
    parentType: 'posts' | 'projects' | 'drafts';
}

/**
 * useAttachmentUpload
 * Authoritatively implements ATTACHMENT_UPLOAD_CONTRACT_V1.
 * Enforces multi-step tokenized upload flow.
 */
export const useAttachmentUpload = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const upload = useCallback(async ({ file, type, parentId, parentType }: UploadParams): Promise<AttachmentV1 | null> => {
        if (!user) {
            setError("Unauthenticated");
            return null;
        }

        setIsUploading(true);
        setError(null);

        try {
            // STEP 2: Client-side validation of intent and limits
            if (file.size === 0) throw new Error("Empty file rejected.");
            
            const limitMb = UPLOAD_LIMITS_MB[type as keyof typeof UPLOAD_LIMITS_MB] || 10;
            if (file.size > limitMb * 1024 * 1024) {
                throw new Error(`File exceeds ${limitMb}MB limit for type ${type}.`);
            }

            // STEP 1 & 3: Request upload token and signed URL from Backend Authority
            const { token, uploadUrl, attachmentId } = await dataService.upload.getUploadToken(
                user.uid,
                parentType,
                parentId,
                type,
                file.name
            );

            // STEP 4: Client uploads directly to Storage using the signed authority
            // In Firebase/Mock implementation, this uses the storage path issued in step 3
            await dataService.upload.uploadFile(user.uid, uploadUrl, file);

            // STEP 5: Backend finalizes metadata on the parent document
            // This is the source of truth for the final AttachmentV1 object
            const attachment = await dataService.upload.finalizeMetadata(
                user.uid,
                parentType,
                parentId,
                attachmentId,
                token
            );

            return attachment;

        } catch (err: any) {
            console.error("[UPLOAD_CONTRACT][FAILURE]", err);
            const msg = err.message || "Upload failed.";
            setError(msg);
            showToast(msg);
            return null;
        } finally {
            setIsUploading(false);
        }
    }, [user, showToast]);

    return { upload, isUploading, error };
};