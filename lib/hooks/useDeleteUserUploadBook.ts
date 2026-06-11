import { useMutation, useQueryClient } from '../react-query.ts';
import { queryKeys } from '../queryKeys.ts';
import { useAuth } from '../auth.tsx';
import { callCallableEndpoint } from '../callable.ts';

type DeleteUserUploadBookResponse = {
  bookId: string;
  deleted: true;
  cascade: {
    firestoreDocuments: number;
    sourceFiles: number;
    coverFiles: number;
  };
};

export function useDeleteUserUploadBook() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const uid = user?.uid;

  return useMutation({
    mutationFn: (bookId: string) =>
      callCallableEndpoint<{ bookId: string }, DeleteUserUploadBookResponse>(
        'deleteUserUploadBook',
        { bookId }
      ),
    onSuccess: (_result, bookId) => {
      queryClient.removeQueries({
        queryKey: queryKeys.catalog.book(bookId) as unknown as any[],
        exact: true,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all as unknown as any[] });
      if (uid) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.user.shelves(uid) as unknown as any[],
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.user.all(uid) as unknown as any[],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['currentlyReading'] });
      queryClient.invalidateQueries({ queryKey: ['readerProgress', bookId] });
    },
  });
}
