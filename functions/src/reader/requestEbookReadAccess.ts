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

import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from 'firebase-admin';
import * as logger from "firebase-functions/logger";
import { getSignedUrl } from '../attachments/storageSignedUrl';
import { resolveBookToEbookAttachment } from '../attachments/resolveBookToEbookAttachment';

const db = admin.firestore();
const EBOOK_URL_TTL_MS = 10 * 60 * 1000;

export const requestEbookReadAccess = onCall(
  async (request) => {
    /* ----------------------------------
       1. Auth Guard
    ---------------------------------- */
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'User must be authenticated to read ebooks.'
      );
    }

    const uid = request.auth.uid;
    const { bookId } = request.data as { bookId?: string };

    if (!bookId || typeof bookId !== 'string') {
      throw new HttpsError(
        'invalid-argument',
        'bookId is required.'
      );
    }

    logger.info("[READER][READ_ACCESS_REQUEST]", {
      uid,
      bookId,
    });

    /* ----------------------------------
       2. Resolve Catalog → Edition → Attachment
    ---------------------------------- */
    const attachment = await resolveBookToEbookAttachment(bookId);

    if (!attachment) {
      logger.warn("[READER][READ_ACCESS_ATTACHMENT_NOT_FOUND]", {
        uid,
        bookId,
      });
      throw new HttpsError(
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
      logger.warn("[READER][READ_ACCESS_DENIED]", {
        uid,
        bookId,
        attachmentId: attachment.id,
        visibility: attachment.visibility,
      });
      throw new HttpsError(
        'permission-denied',
        'You do not have access to this ebook.'
      );
    }

    /* ----------------------------------
       4. Storage Path Resolution
    ---------------------------------- */
    if (!attachment.storagePath) {
      logger.error("[READER][READ_ACCESS_MISSING_STORAGE_PATH]", {
        uid,
        bookId,
        attachmentId: attachment.id,
      });
      throw new HttpsError(
        'internal',
        'Attachment is missing storagePath.'
      );
    }

    /* ----------------------------------
       5. Signed URL Issuance (Short-Lived)
    ---------------------------------- */
    const expiresAt = Date.now() + EBOOK_URL_TTL_MS;
    const signedUrl = await getSignedUrl({
      bucket: admin.storage().bucket().name,
      path: attachment.storagePath,
      intent: 'ebook',
    });

    logger.info("[READER][READ_ACCESS_GRANTED]", {
      uid,
      bookId,
      attachmentId: attachment.id,
      expiresAt,
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
        logger.warn("[READER][READ_ACCESS_AUDIT_WRITE_FAILED]", {
          uid,
          bookId,
          attachmentId: attachment.id,
        });
      });

    /* ----------------------------------
       7. Response
    ---------------------------------- */
    return {
      signedUrl,
      expiresAt,
    };
  }
);
