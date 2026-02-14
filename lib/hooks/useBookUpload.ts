import { useMutation } from '@tanstack/react-query';
import { bookUploadService } from '../../services/bookUploadService.ts';

type UploadBookParams = {
  shelfId: string;
  file: File;
};

type UploadBookResult = {
  bookId: string;
  shelfId: string;
  storagePath: string;
  coverState: 'PENDING';
  status: 'UPLOADED';
};

export const useBookUpload = () => {
  return useMutation<UploadBookResult | null, unknown, UploadBookParams>({
    mutationFn: async (params) => {
      return bookUploadService.upload(params);
    },
    onError: (err) => {
      console.warn('[useBookUpload] Upload failed', err);
    },
  });
};
