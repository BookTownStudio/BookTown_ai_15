import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { admin } from "../firebaseAdmin";
import {
  BOOK_QUOTE_PROJECTION_COLLECTION,
  QUOTE_PROJECTION_VERSION,
  SOCIAL_QUOTE_PROJECTION_COLLECTION,
  USER_QUOTE_PROJECTION_COLLECTION,
  bookQuoteProjectionId,
  socialQuoteProjectionId,
  userQuoteProjectionId,
} from "../projections/quoteProjections";

const db = admin.firestore();

function readString(value: unknown, maxLen: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function toIso(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value && typeof (value as { toDate?: unknown }).toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return new Date().toISOString();
}

function isPublicQuote(data: Record<string, unknown>): boolean {
  return data.status !== "archived" &&
    data.status !== "deleted" &&
    data.visibility !== "private" &&
    data.isPublic !== false;
}

function buildQuoteProjection(quoteId: string, data: Record<string, unknown>) {
  const ownerId = readString(data.authorUid, 128) || readString(data.ownerId, 128);
  const quoteText = readString(data.quoteText, 2000) || readString(data.textEn, 2000) || readString(data.textAr, 2000);
  const textEn = readString(data.textEn, 2000) || quoteText;
  const textAr = readString(data.textAr, 2000) || quoteText;
  const sourceEn = readString(data.sourceEn, 240) || readString(data.sourceReference, 240);
  const sourceAr = readString(data.sourceAr, 240) || sourceEn;
  if (!ownerId || !quoteText || !sourceEn) return null;

  return {
    id: quoteId,
    canonicalQuoteId: quoteId,
    ownerId,
    authorUid: ownerId,
    textEn,
    textAr,
    quoteText,
    sourceEn,
    sourceAr,
    bookId: readString(data.bookId, 180) || undefined,
    authorId: readString(data.authorId, 180) || undefined,
    chapter: readString(data.chapter, 120) || undefined,
    page: typeof data.page === "number" && Number.isFinite(data.page) ? Math.trunc(data.page) : undefined,
    sourceType: readString(data.sourceType, 80) || "manual",
    anchor: data.anchor ?? null,
    provenance: data.provenance && typeof data.provenance === "object" ? data.provenance : undefined,
    visibility: data.visibility === "private" ? "private" : "public",
    status: data.status === "archived" || data.status === "deleted" ? data.status : "active",
    isPublic: isPublicQuote(data),
    searchTextNormalized: readString(data.searchTextNormalized, 5000),
    searchTokens: Array.isArray(data.searchTokens) ? data.searchTokens.slice(0, 40) : [],
    likeCount: 0,
    bookmarkCount: 0,
    shareCount: 0,
    postCount: 0,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    sourcePath: `quotes/${quoteId}`,
    projectionVersion: QUOTE_PROJECTION_VERSION,
  };
}

export const onQuoteProjectionWritten = onDocumentWritten("quotes/{quoteId}", async (event) => {
  const quoteId = event.params.quoteId;
  const before = event.data?.before?.data() as Record<string, unknown> | undefined;
  const after = event.data?.after?.data() as Record<string, unknown> | undefined;
  const beforeOwnerId = before ? readString(before.authorUid, 128) || readString(before.ownerId, 128) : "";
  const afterProjection = after ? buildQuoteProjection(quoteId, after) : null;
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
