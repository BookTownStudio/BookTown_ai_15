/**
 * Shelf Actions — Domain / Use-Case Layer
 * --------------------------------------
 * Canonical orchestration for ALL shelf mutations.
 *
 * Rules:
 * - Stateless
 * - No React
 * - No UI assumptions
 * - Safe to call from UI, hooks, AI agents, or background jobs
 *
 * 🔒 DECISION (LOCKED):
 * - Shelves are purely organizational
 * - Shelf actions NEVER create or modify reading_progress
 * - Reading state is owned exclusively by the reader domain
 */

import { dataService } from '../../services/dataService.ts';
import { bookIngestionService } from '../../services/bookIngestionService.ts';
import { Book, Shelf } from '../../types/entities.ts';
import type { LibrarianRecommendationContext } from '../../types/librarian.ts';

/**
 * Guards
 */
function requireAuth(uid?: string): asserts uid {
  if (!uid) {
    throw new Error('AUTH_REQUIRED');
  }
}

/**
 * Ensure a book exists in the local catalog before shelf operations.
 * This enforces the Canonical Ingestion Model.
 */
async function ensureBookMaterialized(book: Book): Promise<void> {
  if (!book?.id) {
    throw new Error('INVALID_BOOK');
  }

  await bookIngestionService.ensureBookExists({
    bookId: book.id,
    bookHint: book,
  });
}

/**
 * -------------------------------------------------
 * Add a book to a shelf
 * -------------------------------------------------
 * RULE:
 * - Shelf membership is organizational ONLY
 * - No reading state is inferred or initialized
 */
export async function addBookToShelf(params: {
  uid: string;
  shelfId: string;
  book: Book;
  recommendationContext?: LibrarianRecommendationContext;
}): Promise<void> {
  const { uid, shelfId, book, recommendationContext } = params;
  requireAuth(uid);

  await ensureBookMaterialized(book);

  await dataService.shelves.addBookToShelf(
    uid,
    shelfId,
    book.id,
    book,
    recommendationContext
  );
}

/**
 * -------------------------------------------------
 * Remove a book from a shelf
 * -------------------------------------------------
 * RULE:
 * - Removing a book NEVER affects reading_progress
 */
export async function removeBookFromShelf(params: {
  uid: string;
  shelfId: string;
  bookId: string;
}): Promise<void> {
  const { uid, shelfId, bookId } = params;
  requireAuth(uid);

  await dataService.shelves.removeBookFromShelf(
    uid,
    shelfId,
    bookId
  );
}

/**
 * -------------------------------------------------
 * Move a book from one shelf to another
 * -------------------------------------------------
 * RULE:
 * - Pure reorganization
 * - No reading state side effects
 */
export async function moveBookBetweenShelves(params: {
  uid: string;
  fromShelfId: string;
  toShelfId: string;
  book: Book;
}): Promise<void> {
  const { uid, fromShelfId, toShelfId, book } = params;
  requireAuth(uid);

  await ensureBookMaterialized(book);

  // Remove → Add (order matters)
  await dataService.shelves.removeBookFromShelf(
    uid,
    fromShelfId,
    book.id
  );

  await dataService.shelves.addBookToShelf(
    uid,
    toShelfId,
    book.id,
    book
  );
}

/**
 * -------------------------------------------------
 * Delete a shelf (owner only)
 * -------------------------------------------------
 */
export async function deleteShelf(params: {
  uid: string;
  shelfId: string;
}): Promise<void> {
  const { uid, shelfId } = params;
  requireAuth(uid);

  await dataService.shelves.deleteShelf(uid, shelfId);
}

/**
 * -------------------------------------------------
 * Update shelf metadata
 * -------------------------------------------------
 */
export async function updateShelf(params: {
  uid: string;
  shelfId: string;
  updates: Partial<Shelf>;
}): Promise<void> {
  const { uid, shelfId, updates } = params;
  requireAuth(uid);

  await dataService.shelves.updateShelf(uid, shelfId, updates);
}
