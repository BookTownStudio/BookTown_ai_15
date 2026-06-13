// functions/src/attachments/resolveBookToEbookAttachment.ts

import { admin } from '../firebaseAdmin';
import { resolveReadableManifestationForWork } from "../manifestations/manifestationAuthority";

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

  const bookData = (bookSnap.data() || {}) as Record<string, unknown>;
  try {
    const manifestation = await resolveReadableManifestationForWork({
      bookId,
      book: bookData,
    });
    return {
      id: manifestation.attachmentId || manifestation.manifestationId,
      visibility: manifestation.visibility,
      storagePath: manifestation.storagePath,
      manifestationId: manifestation.manifestationId,
      editionId: manifestation.editionId,
      format: manifestation.format,
      source: manifestation.source,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code?: unknown }).code;
      if (code === "not-found") return null;
    }
    throw error;
  }
  return null;
}
