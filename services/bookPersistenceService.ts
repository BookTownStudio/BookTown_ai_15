import { firestoreAdapter } from '../infrastructure/firebase/firestoreAdapter';
import { Book } from '../types/entities.ts';

/**
 * BookPersistenceService
 * Responsible for materializing book metadata into the local Firestore collection.
 */
export const bookPersistenceService = {
  /**
   * ensureBookExists
   * Checks if a book exists in the 'books' collection.
   * If missing, it creates the document using the provided payload.
   */
  async ensureBookExists(book: Book): Promise<void> {
    if (!book?.id) return;

    try {
      const path = `books/${book.id}`;

      // Perform lookup to avoid unnecessary writes (Idempotency)
      const existing = await firestoreAdapter.getDoc<Book>(path);

      if (!existing) {
        // Materialize the book as-is (Data Contract: create-only)
        await firestoreAdapter.setDoc(path, {
          ...book,
          persistedAt: new Date().toISOString(),
          materializationSource: 'book_details_surface',
        });
      }
    } catch (error) {
      // Non-blocking: fail silently with a warning to avoid interrupting user experience
      console.warn('[BOOK_PERSISTENCE][SILENT_FAILURE]', error);
    }
  },
};
