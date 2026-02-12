// functions/src/attachments/resolveBookToEbookAttachment.ts

import { admin } from '../firebaseAdmin';

export interface EbookAttachment {
  id: string;
  visibility: 'public' | 'restricted' | 'private';
  storagePath: string;
  bucket?: string;
  [key: string]: any;
}

/**
 * resolveBookToEbookAttachment
 * ---------------------------------
 * Canonical resolution:
 * bookId → ebook attachment (typed)
 */
export async function resolveBookToEbookAttachment(
  bookId: string
): Promise<EbookAttachment | null> {
  const db = admin.firestore();

  const bookSnap = await db.doc(`books/${bookId}`).get();
  if (!bookSnap.exists) return null;

  const attachmentId = bookSnap.data()?.ebookAttachmentId;
  if (!attachmentId) return null;

  const attachmentRef = db.doc(`attachments/${attachmentId}`);
  const attachmentSnap = await attachmentRef.get();

  if (!attachmentSnap.exists) return null;

  const data = attachmentSnap.data() as any;

  // 🔒 Hard guarantees (fail fast, never guess)
  if (!data.storagePath || !data.visibility) {
    throw new Error(
      `[resolveBookToEbookAttachment] Invalid attachment ${attachmentId}`
    );
  }

  return {
    id: attachmentRef.id,
    visibility: data.visibility,
    storagePath: data.storagePath,
    bucket: data.bucket,
    ...data,
  };
}