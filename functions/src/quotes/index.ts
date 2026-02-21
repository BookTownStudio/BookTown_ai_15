import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Query, DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { assertActiveAuthenticatedUser } from "../shared/auth";

const db = admin.firestore();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const QUOTE_TEXT_MAX = 2000;
const QUOTE_SOURCE_MAX = 240;
const QUOTE_QUERY_MAX = 120;

type CanonicalQuote = {
  id: string;
  ownerId: string;
  textEn: string;
  textAr: string;
  sourceEn: string;
  sourceAr: string;
  bookId?: string;
  authorId?: string;
  createdAt?: string;
  updatedAt?: string;
  isPublic: boolean;
};

function normalizeRequiredString(
  value: unknown,
  field: string,
  maxLength: number
): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }

  if (normalized.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${field} exceeds ${maxLength} characters.`
    );
  }

  return normalized;
}

function normalizeOptionalString(
  value: unknown,
  field: string,
  maxLength: number
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length > maxLength) {
    throw new HttpsError(
      "invalid-argument",
      `${field} exceeds ${maxLength} characters.`
    );
  }

  return normalized;
}

function timestampToIso(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return date.toISOString();
  }

  return undefined;
}

function quoteDocRef(ownerId: string, quoteId: string) {
  return db.collection("users").doc(ownerId).collection("quotes").doc(quoteId);
}

function quoteBookmarkId(quoteId: string, quoteOwnerId: string): string {
  return quoteId;
}

function parseQuote(
  ownerId: string,
  quoteId: string,
  raw: DocumentData
): CanonicalQuote | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const textEn = typeof raw.textEn === "string" ? raw.textEn.trim() : "";
  const textAr = typeof raw.textAr === "string" ? raw.textAr.trim() : "";
  const sourceEn = typeof raw.sourceEn === "string" ? raw.sourceEn.trim() : "";
  const sourceAr = typeof raw.sourceAr === "string" ? raw.sourceAr.trim() : "";

  if (!textEn || !textAr || !sourceEn || !sourceAr) {
    return null;
  }

  return {
    id: quoteId,
    ownerId,
    textEn,
    textAr,
    sourceEn,
    sourceAr,
    bookId: typeof raw.bookId === "string" && raw.bookId.trim() ? raw.bookId.trim() : undefined,
    authorId:
      typeof raw.authorId === "string" && raw.authorId.trim()
        ? raw.authorId.trim()
        : undefined,
    createdAt: timestampToIso(raw.createdAt),
    updatedAt: timestampToIso(raw.updatedAt),
    isPublic: raw.isPublic !== false,
  };
}

function publicQuotePayload(quote: CanonicalQuote) {
  return {
    id: quote.id,
    ownerId: quote.ownerId,
    textEn: quote.textEn,
    textAr: quote.textAr,
    sourceEn: quote.sourceEn,
    sourceAr: quote.sourceAr,
    ...(quote.bookId ? { bookId: quote.bookId } : {}),
    ...(quote.authorId ? { authorId: quote.authorId } : {}),
    ...(quote.createdAt ? { createdAt: quote.createdAt } : {}),
    ...(quote.updatedAt ? { updatedAt: quote.updatedAt } : {}),
  };
}

function normalizePageSize(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_PAGE_SIZE;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpsError("invalid-argument", "limit must be a number.");
  }

  const integer = Math.trunc(value);
  if (integer < 1 || integer > MAX_PAGE_SIZE) {
    throw new HttpsError(
      "invalid-argument",
      `limit must be between 1 and ${MAX_PAGE_SIZE}.`
    );
  }

  return integer;
}

function normalizeQueryValue(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "query must be a string.");
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized.length > QUOTE_QUERY_MAX) {
    throw new HttpsError(
      "invalid-argument",
      `query exceeds ${QUOTE_QUERY_MAX} characters.`
    );
  }

  return normalized;
}

function isQuoteMatch(
  quote: CanonicalQuote,
  filters: { bookId?: string; authorId?: string; query?: string }
): boolean {
  if (filters.bookId && quote.bookId !== filters.bookId) {
    return false;
  }

  if (filters.authorId && quote.authorId !== filters.authorId) {
    return false;
  }

  if (!filters.query) {
    return true;
  }

  const query = filters.query;
  return (
    quote.textEn.toLowerCase().includes(query) ||
    quote.textAr.toLowerCase().includes(query) ||
    quote.sourceEn.toLowerCase().includes(query) ||
    quote.sourceAr.toLowerCase().includes(query)
  );
}

function resolveOwnerId(inputOwnerId: unknown, uid: string): string {
  if (inputOwnerId === undefined || inputOwnerId === null) {
    return uid;
  }

  const normalized = normalizeRequiredString(inputOwnerId, "ownerId", 128);
  if (normalized !== uid) {
    throw new HttpsError(
      "permission-denied",
      "ownerId must match authenticated user."
    );
  }

  return normalized;
}

function sanitizeIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
}

export const listUserQuotes = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const data = (request.data ?? {}) as Record<string, unknown>;

  const ownerId = resolveOwnerId(data.ownerId, uid);
  const limit = normalizePageSize(data.limit);
  const cursor =
    data.cursor === undefined ? undefined : normalizeRequiredString(data.cursor, "cursor", 220);
  const bookId = normalizeOptionalString(data.bookId, "bookId", 180);
  const authorId = normalizeOptionalString(data.authorId, "authorId", 180);
  const queryValue = normalizeQueryValue(data.query);

  let queryRef: Query = db
    .collection("users")
    .doc(ownerId)
    .collection("quotes")
    .orderBy("updatedAt", "desc")
    .limit(limit + 1);

  if (cursor) {
    const cursorSnap = await quoteDocRef(ownerId, cursor).get();
    if (!cursorSnap.exists) {
      throw new HttpsError("invalid-argument", "Invalid cursor.");
    }
    queryRef = queryRef.startAfter(cursorSnap as QueryDocumentSnapshot<DocumentData>);
  }

  const snap = await queryRef.get();
  const pageDocs = snap.docs.slice(0, limit);

  const parsedQuotes = pageDocs
    .map((docSnap) => {
      const parsed = parseQuote(ownerId, docSnap.id, docSnap.data());
      if (!parsed) {
        logger.warn("[QUOTES][LIST][INVALID_DOC]", {
          ownerId,
          quoteId: docSnap.id,
        });
      }
      return parsed;
    })
    .filter((quote): quote is CanonicalQuote => quote !== null)
    .filter((quote) => isQuoteMatch(quote, { bookId, authorId, query: queryValue }));

  const hasMore = snap.docs.length > limit;

  return {
    quotes: parsedQuotes.map(publicQuotePayload),
    ...(hasMore && pageDocs.length > 0
      ? { nextCursor: pageDocs[pageDocs.length - 1].id }
      : {}),
  };
});

export const getQuoteById = onCall({ cors: true }, async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;

  const quoteId = normalizeRequiredString(data.quoteId, "quoteId", 180);
  const explicitOwnerId =
    data.ownerId === undefined
      ? undefined
      : normalizeRequiredString(data.ownerId, "ownerId", 128);

  const requesterUid = request.auth?.uid;
  const ownerId = explicitOwnerId ?? requesterUid;

  if (!ownerId) {
    throw new HttpsError(
      "unauthenticated",
      "ownerId is required when not authenticated."
    );
  }

  const snap = await quoteDocRef(ownerId, quoteId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Quote not found.");
  }

  const parsed = parseQuote(ownerId, snap.id, snap.data() as DocumentData);
  if (!parsed) {
    logger.error("[QUOTES][DETAILS][INVALID_DOC]", { ownerId, quoteId });
    throw new HttpsError("internal", "Quote payload is invalid.");
  }

  if (!parsed.isPublic && requesterUid !== ownerId) {
    throw new HttpsError("permission-denied", "Quote is private.");
  }

  return publicQuotePayload(parsed);
});

export const createQuote = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const data = (request.data ?? {}) as Record<string, unknown>;

  const quote = {
    textEn: normalizeRequiredString(data.textEn, "textEn", QUOTE_TEXT_MAX),
    textAr: normalizeRequiredString(data.textAr, "textAr", QUOTE_TEXT_MAX),
    sourceEn: normalizeRequiredString(data.sourceEn, "sourceEn", QUOTE_SOURCE_MAX),
    sourceAr: normalizeRequiredString(data.sourceAr, "sourceAr", QUOTE_SOURCE_MAX),
    bookId: normalizeOptionalString(data.bookId, "bookId", 180),
    authorId: normalizeOptionalString(data.authorId, "authorId", 180),
    isPublic: data.isPublic === undefined ? true : data.isPublic === true,
  };

  const nowIso = new Date().toISOString();
  const quoteRef = db.collection("users").doc(uid).collection("quotes").doc();

  await quoteRef.set({
    ownerId: uid,
    textEn: quote.textEn,
    textAr: quote.textAr,
    sourceEn: quote.sourceEn,
    sourceAr: quote.sourceAr,
    ...(quote.bookId ? { bookId: quote.bookId } : {}),
    ...(quote.authorId ? { authorId: quote.authorId } : {}),
    isPublic: quote.isPublic,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    version: 1,
  });

  return {
    id: quoteRef.id,
    ownerId: uid,
    textEn: quote.textEn,
    textAr: quote.textAr,
    sourceEn: quote.sourceEn,
    sourceAr: quote.sourceAr,
    ...(quote.bookId ? { bookId: quote.bookId } : {}),
    ...(quote.authorId ? { authorId: quote.authorId } : {}),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
});

export const saveQuoteFromReference = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const data = (request.data ?? {}) as Record<string, unknown>;

  const sourceOwnerId = normalizeRequiredString(data.sourceOwnerId, "sourceOwnerId", 128);
  const sourceQuoteId = normalizeRequiredString(data.sourceQuoteId, "sourceQuoteId", 180);

  const sourceSnap = await quoteDocRef(sourceOwnerId, sourceQuoteId).get();
  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", "Source quote not found.");
  }

  const sourceQuote = parseQuote(
    sourceOwnerId,
    sourceQuoteId,
    sourceSnap.data() as DocumentData
  );

  if (!sourceQuote) {
    logger.error("[QUOTES][SAVE_REFERENCE][INVALID_SOURCE]", {
      sourceOwnerId,
      sourceQuoteId,
    });
    throw new HttpsError("internal", "Source quote payload is invalid.");
  }

  if (!sourceQuote.isPublic && uid !== sourceOwnerId) {
    throw new HttpsError("permission-denied", "Source quote is private.");
  }

  const deterministicId = `ref_${sanitizeIdentifier(sourceOwnerId)}_${sanitizeIdentifier(
    sourceQuoteId
  )}`;
  const targetRef = quoteDocRef(uid, deterministicId);
  const existingSnap = await targetRef.get();

  if (existingSnap.exists) {
    const existingQuote = parseQuote(
      uid,
      existingSnap.id,
      existingSnap.data() as DocumentData
    );
    if (!existingQuote) {
      throw new HttpsError("internal", "Saved quote payload is invalid.");
    }

    return {
      quote: publicQuotePayload(existingQuote),
      alreadySaved: true,
    };
  }

  const nowIso = new Date().toISOString();

  await targetRef.set({
    ownerId: uid,
    textEn: sourceQuote.textEn,
    textAr: sourceQuote.textAr,
    sourceEn: sourceQuote.sourceEn,
    sourceAr: sourceQuote.sourceAr,
    ...(sourceQuote.bookId ? { bookId: sourceQuote.bookId } : {}),
    ...(sourceQuote.authorId ? { authorId: sourceQuote.authorId } : {}),
    isPublic: true,
    savedFrom: {
      ownerId: sourceOwnerId,
      quoteId: sourceQuoteId,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    version: 1,
  });

  return {
    quote: {
      id: deterministicId,
      ownerId: uid,
      textEn: sourceQuote.textEn,
      textAr: sourceQuote.textAr,
      sourceEn: sourceQuote.sourceEn,
      sourceAr: sourceQuote.sourceAr,
      ...(sourceQuote.bookId ? { bookId: sourceQuote.bookId } : {}),
      ...(sourceQuote.authorId ? { authorId: sourceQuote.authorId } : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    alreadySaved: false,
  };
});

export const toggleQuoteBookmark = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const data = (request.data ?? {}) as Record<string, unknown>;

  const quoteId = normalizeRequiredString(data.quoteId, "quoteId", 180);
  const quoteOwnerId = normalizeRequiredString(data.quoteOwnerId, "quoteOwnerId", 128);

  if (typeof data.active !== "boolean") {
    throw new HttpsError("invalid-argument", "active must be boolean.");
  }

  const sourceSnap = await quoteDocRef(quoteOwnerId, quoteId).get();
  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", "Quote not found.");
  }

  const sourceQuote = parseQuote(
    quoteOwnerId,
    quoteId,
    sourceSnap.data() as DocumentData
  );

  if (!sourceQuote) {
    throw new HttpsError("internal", "Quote payload is invalid.");
  }

  if (!sourceQuote.isPublic && uid !== quoteOwnerId) {
    throw new HttpsError("permission-denied", "Quote is private.");
  }

  const bookmarkId = quoteBookmarkId(quoteId, quoteOwnerId);
  const bookmarkRef = db
    .collection("users")
    .doc(uid)
    .collection("bookmarks")
    .doc(bookmarkId);

  if (data.active) {
    await bookmarkRef.set(
      {
        type: "quote",
        entityId: quoteId,
        quoteOwnerId,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        version: 1,
      },
      { merge: true }
    );
  } else {
    await bookmarkRef.delete();
  }

  return {
    bookmarked: data.active,
    bookmarkId,
  };
});
