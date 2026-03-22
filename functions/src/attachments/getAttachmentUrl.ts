import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { canUserReadBook, resolveBookOwnerUid } from "../rights/bookRights";

const db = admin.firestore();
const storage = admin.storage();

/**
 * getAttachmentUrl
 * ATTACHMENT_SECURITY_V2 (Step 3.4)
 *
 * Authoritative access gateway.
 * Enforces:
 *  - Parent-based access control
 *  - Rights-aware surface enforcement (read vs download)
 *  - Public-domain gating for file export
 */
export const getAttachmentUrl = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const { attachmentId, surface } = request.data;
  const uid = request.auth.uid;

  if (!attachmentId || !surface) {
    throw new HttpsError("invalid-argument", "Missing attachmentId or surface.");
  }

  if (!["read", "download"].includes(surface)) {
    throw new HttpsError("invalid-argument", "Invalid surface.");
  }

  // -------------------------------------------------
  // 1. Fetch Attachment Metadata
  // -------------------------------------------------
  const attSnap = await db.collection("attachments").doc(attachmentId).get();
  if (!attSnap.exists) {
    throw new HttpsError("not-found", "Attachment not found.");
  }

  const metadata = attSnap.data()!;
  let editionData: Record<string, unknown> | null = null;
  let bookData: Record<string, unknown> | null = null;

  // -------------------------------------------------
  // 2. Base Access Control (UNCHANGED LOGIC)
  // -------------------------------------------------
  let hasAccess = metadata.uploader?.uid === uid;

  if (!hasAccess) {
    const parentRef = db
      .collection(metadata.parentType)
      .doc(metadata.parentId);

    const parentSnap = await parentRef.get();

    if (parentSnap.exists) {
      const parentData = parentSnap.data()!;
      const isPublic =
        parentData.status === "visible" ||
        parentData.visibility === "public";

      const isSharedWithMe =
        Array.isArray(parentData.sharedWith) &&
        parentData.sharedWith.includes(uid);

      hasAccess = isPublic || isSharedWithMe;
    }
  }

  if (!hasAccess) {
    logger.warn(
      `[SECURITY][UNAUTHORIZED] User ${uid} attempted to access attachment ${attachmentId}`
    );
    throw new HttpsError(
      "permission-denied",
      "Unauthorized access to attachment."
    );
  }

  // -------------------------------------------------
  // 3. RIGHTS-AWARE ENFORCEMENT (STEP 3.4)
  // -------------------------------------------------
  if (metadata.parentType === "editions" && metadata.parentId) {
    const editionSnap = await db
      .collection("editions")
      .doc(metadata.parentId)
      .get();

    if (!editionSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Edition not found for attachment."
      );
    }

    editionData = editionSnap.data() as Record<string, unknown>;
    const bookId =
      typeof editionData.bookId === "string" && editionData.bookId.trim().length > 0
        ? editionData.bookId.trim()
        : typeof metadata.bookId === "string" && metadata.bookId.trim().length > 0
        ? metadata.bookId.trim()
        : "";

    if (bookId) {
      const bookSnap = await db.collection("books").doc(bookId).get();
      if (bookSnap.exists) {
        bookData = (bookSnap.data() ?? {}) as Record<string, unknown>;
      }
    }
  }

  if (surface === "read" && bookData) {
    if (!canUserReadBook(bookData, uid)) {
      throw new HttpsError(
        "permission-denied",
        "You do not have access to this content."
      );
    }
  }

  if (surface === "download") {
    /**
     * Downloads are ONLY allowed if:
     *  - Parent entity is public domain
     *  - OR future: licensed / purchased (not implemented yet)
     */
    if (metadata.parentType === "editions" && metadata.parentId && editionData) {
      const edition = editionData;

      const source = typeof edition.source === "string" ? edition.source.trim() : "";
      const bookOwnerUid = bookData ? resolveBookOwnerUid(bookData) : null;
      if (source === "write_release") {
        if (!bookOwnerUid || bookOwnerUid !== uid) {
          logger.warn(
            `[RIGHTS][BLOCKED] User ${uid} attempted to download authored content without ownership`,
            {
              attachmentId,
              editionId: metadata.parentId,
            }
          );
          throw new HttpsError(
            "permission-denied",
            "Download not permitted for this content."
          );
        }
      } else if (edition.publicDomain !== true) {
        logger.warn(
          `[RIGHTS][BLOCKED] User ${uid} attempted to download non-public-domain content`,
          {
            attachmentId,
            editionId: metadata.parentId,
          }
        );

        throw new HttpsError(
          "permission-denied",
          "Download not permitted for this content."
        );
      }
    } else {
      // Defensive default: no export if parent is unknown
      throw new HttpsError(
        "permission-denied",
        "Download not permitted for this content."
      );
    }
  }

  // -------------------------------------------------
  // 4. Generate Signed URL (LOCKED TTL)
  // -------------------------------------------------
  try {
    const bucket = storage.bucket();
    const file = bucket.file(metadata.storagePath);

    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 300 * 1000, // 5 minutes (LOCKED)
    });

    return { url };
  } catch (error: any) {
    logger.error(
      "[SECURITY][ERROR] Failed to generate signed URL:",
      error
    );
    throw new HttpsError(
      "internal",
      "Secure link generation failed."
    );
  }
});
