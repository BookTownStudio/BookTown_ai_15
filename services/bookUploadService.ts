import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../lib/firebase.ts';

export type UploadUserBookParams = {
  shelfId: string;
  fileName: string;
  fileType: 'epub' | 'pdf';
  fileSize: number;
};

export type UploadUserBookResult = {
  bookId: string;
  shelfId: string;
  storagePath: string;
  status: 'UPLOADED';
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const bookUploadService = {
  async upload(
    params: UploadUserBookParams
  ): Promise<UploadUserBookResult | null> {
    try {
      const hasInvalidType =
        params.fileType !== 'epub' && params.fileType !== 'pdf';

      if (
        !params.shelfId ||
        !params.fileName ||
        hasInvalidType ||
        !Number.isFinite(params.fileSize) ||
        params.fileSize <= 0 ||
        params.fileSize > MAX_FILE_SIZE_BYTES
      ) {
        console.warn('[UPLOAD_BOOK_SERVICE][INVALID_INPUT]', params);
        return null;
      }

      const functions = getFirebaseFunctions();
      const uploadFn = httpsCallable(functions, 'uploadUserBook');
      const result = await uploadFn(params);

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
        return {
          bookId: data.bookId,
          shelfId: data.shelfId,
          storagePath: data.storagePath,
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

