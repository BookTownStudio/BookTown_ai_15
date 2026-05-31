import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { admin } from "../firebaseAdmin";
import {
  BOOK_QUOTE_PROJECTION_COLLECTION,
  SOCIAL_QUOTE_PROJECTION_COLLECTION,
  USER_QUOTE_PROJECTION_COLLECTION,
  buildQuoteProjectionPayload,
  bookQuoteProjectionId,
  socialQuoteProjectionId,
  userQuoteProjectionId,
} from "../projections/quoteProjections";

const db = admin.firestore();

function readString(value: unknown, maxLen: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

export const onQuoteProjectionWritten = onDocumentWritten("quotes/{quoteId}", async (event) => {
  const quoteId = event.params.quoteId;
  const before = event.data?.before?.data() as Record<string, unknown> | undefined;
  const after = event.data?.after?.data() as Record<string, unknown> | undefined;
  const beforeOwnerId = before ? readString(before.authorUid, 128) || readString(before.ownerId, 128) : "";
  const afterProjection = after ? buildQuoteProjectionPayload(quoteId, after) : null;
  const ownerId = afterProjection?.ownerId || beforeOwnerId;

  if (!afterProjection) {
    await Promise.all([
      ownerId
        ? db.collection(USER_QUOTE_PROJECTION_COLLECTION).doc(userQuoteProjectionId(ownerId, quoteId)).delete()
        : Promise.resolve(),
      db.collection(BOOK_QUOTE_PROJECTION_COLLECTION).doc(bookQuoteProjectionId(quoteId)).delete(),
      db.collection(SOCIAL_QUOTE_PROJECTION_COLLECTION).doc(socialQuoteProjectionId(quoteId)).delete(),
    ]);
    return;
  }

  await db.collection(USER_QUOTE_PROJECTION_COLLECTION)
    .doc(userQuoteProjectionId(afterProjection.ownerId, quoteId))
    .set({ ...afterProjection, projectionSurface: "user" }, { merge: true });

  if (afterProjection.isPublic && afterProjection.status === "active") {
    await Promise.all([
      db.collection(BOOK_QUOTE_PROJECTION_COLLECTION)
        .doc(bookQuoteProjectionId(quoteId))
        .set({ ...afterProjection, projectionSurface: "book" }, { merge: true }),
      db.collection(SOCIAL_QUOTE_PROJECTION_COLLECTION)
        .doc(socialQuoteProjectionId(quoteId))
        .set({ ...afterProjection, projectionSurface: "social" }, { merge: true }),
    ]);
    return;
  }

  await Promise.all([
    db.collection(BOOK_QUOTE_PROJECTION_COLLECTION).doc(bookQuoteProjectionId(quoteId)).delete(),
    db.collection(SOCIAL_QUOTE_PROJECTION_COLLECTION).doc(socialQuoteProjectionId(quoteId)).delete(),
  ]);
});
