import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { getFirebaseFunctions, getFirebaseStorage } from '../lib/firebase.ts';

export type UploadUserBookParams = {
  shelfId: string;
  file: File;
};

export type UploadUserBookResult = {
  bookId: string;
  shelfId: string;
  storagePath: string;
  coverState: 'PENDING';
  status: 'UPLOADED';
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const toContentType = (fileType: 'epub' | 'pdf') =>
  fileType === 'epub' ? 'application/epub+zip' : 'application/pdf';

export const bookUploadService = {
  async upload(
    params: UploadUserBookParams
  ): Promise<UploadUserBookResult | null> {
    try {
      const fileName = params.file?.name ?? '';
      const fileSize = params.file?.size ?? 0;
      const lowered = fileName.toLowerCase();
      const fileType: 'epub' | 'pdf' | null = lowered.endsWith('.epub')
        ? 'epub'
        : lowered.endsWith('.pdf')
          ? 'pdf'
          : null;

      const hasInvalidType =
        fileType !== 'epub' && fileType !== 'pdf';

      if (
        !params.shelfId ||
        !fileName ||
        hasInvalidType ||
        !Number.isFinite(fileSize) ||
        fileSize <= 0 ||
        fileSize > MAX_FILE_SIZE_BYTES
      ) {
        console.warn('[UPLOAD_BOOK_SERVICE][INVALID_INPUT]', params);
        return null;
      }
      const normalizedFileType = fileType as 'epub' | 'pdf';

      const functions = getFirebaseFunctions();
      const uploadFn = httpsCallable(functions, 'uploadUserBook');
      const result = await uploadFn({
        shelfId: params.shelfId,
        fileName,
        fileType: normalizedFileType,
        fileSize,
      });
      const resultFinalize = httpsCallable(functions, 'finalizeUserUpload');

      const payload = result?.data as any;
      if (payload?.success === false) {
        console.warn('[UPLOAD_BOOK_SERVICE][BACKEND_FAILURE]', payload?.error);
        return null;
      }

      const data: Partial<UploadUserBookResult> | undefined =
        payload?.success === true && payload?.data
          ? payload.data
          : payload;

      if (data?.bookId && data?.shelfId && data?.storagePath) {
        const storage = getFirebaseStorage();
        await uploadBytes(ref(storage, data.storagePath), params.file, {
          contentType: toContentType(normalizedFileType),
        });

        const finalizeResult = await resultFinalize({ bookId: data.bookId });
        const finalizePayload = finalizeResult?.data as any;
        if (finalizePayload?.success === false) {
          console.warn('[UPLOAD_BOOK_SERVICE][FINALIZE_FAILURE]', finalizePayload?.error);
          return null;
        }

        return {
          bookId: data.bookId,
          shelfId: data.shelfId,
          storagePath: data.storagePath,
          coverState: 'PENDING',
          status: 'UPLOADED',
        };
      }

      console.warn('[UPLOAD_BOOK_SERVICE][INVALID_RESPONSE]', data);
      return null;
    } catch (error) {
      console.warn('[UPLOAD_BOOK_SERVICE][FAILURE]', error);
      return null;
    }
  },
};
