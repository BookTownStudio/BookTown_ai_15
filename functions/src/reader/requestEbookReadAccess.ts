/**
 * REQUEST_EBOOK_READ_ACCESS_V1
 *
 * Canonical reader mediation function.
 * - No direct Storage access from client
 * - Enforces auth + catalog resolution
 * - Issues short-lived signed URLs only
 *
 * Tier-1 guarantees:
 * - Separation of Concerns
 * - Catalog-first resolution
 * - Secure, auditable, scalable
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getSignedUrl } from '../attachments/storageSignedUrl';
import { resolveBookToEbookAttachment } from '../attachments/resolveBookToEbookAttachment';

const db = admin.firestore();

export const requestEbookReadAccess = functions.https.onCall(
  async (data, context) => {
    /* ----------------------------------
       1. Auth Guard
    ---------------------------------- */
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated to read ebooks.'
      );
    }

    const uid = context.auth.uid;
    const { bookId } = data as { bookId?: string };

    if (!bookId || typeof bookId !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'bookId is required.'
      );
    }

    /* ----------------------------------
       2. Resolve Catalog → Edition → Attachment
    ---------------------------------- */
    const attachment = await resolveBookToEbookAttachment(bookId);

    if (!attachment) {
      throw new functions.https.HttpsError(
        'not-found',
        'No readable ebook attachment found for this book.'
      );
    }

    /* ----------------------------------
       3. Access Control (V1 — Public Read)
       Locked Decision:
       - Uploaded books are public by default
       - Paid / restricted paths come later
    ---------------------------------- */
    if (attachment.visibility === 'restricted') {
      throw new functions.https.HttpsError(
        'permission-denied',
        'You do not have access to this ebook.'
      );
    }

    /* ----------------------------------
       4. Storage Path Resolution
    ---------------------------------- */
    if (!attachment.storagePath) {
      throw new functions.https.HttpsError(
        'internal',
        'Attachment is missing storagePath.'
      );
    }

    /* ----------------------------------
       5. Signed URL Issuance (Short-Lived)
    ---------------------------------- */
    const signedUrl = await getSignedUrl({
      bucket: admin.storage().bucket().name,
      path: attachment.storagePath,
      intent: 'ebook',
    });

    /* ----------------------------------
       6. Audit Log (Non-Blocking)
    ---------------------------------- */
    db.collection('reader_audit')
      .add({
        uid,
        bookId,
        attachmentId: attachment.id,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        action: 'READ_GRANTED',
      })
      .catch(() => {
        // Silent fail — never block read access
      });

    /* ----------------------------------
       7. Response
    ---------------------------------- */
    return {
      url: signedUrl,
      expiresIn: 300, // seconds (documentary only; TTL enforced server-side)
      attachmentId: attachment.id,
    };
  }
);
