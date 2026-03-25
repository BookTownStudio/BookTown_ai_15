import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Query, DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { normalizeSearchText, tokenizeSearchText } from "../search/normalization";
import { assertActiveAuthenticatedUser } from "../shared/auth";

const db = admin.firestore();

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const QUOTE_SCAN_BATCH_SIZE = 50;
const MAX_QUOTE_SCAN_DOCS = 300;
const DEFAULT_PUBLIC_QUOTE_LIMIT = 24;
const MAX_PUBLIC_QUOTE_LIMIT = 50;
const QUOTE_TEXT_MAX = 2000;
const QUOTE_SOURCE_MAX = 240;
const QUOTE_QUERY_MAX = 120;

type QuoteProvenance = {
  sourceType: "book" | "author" | "manual";
  verificationStatus: "unverified" | "canonical_linked" | "saved_reference";
  sourceBookId?: string;
  sourceAuthorId?: string;
  savedFromOwnerId?: string;
  savedFromQuoteId?: string;
};

type CanonicalQuote = {
  id: string;
  canonicalQuoteId?: string;
  legacyQuoteId?: string;
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
  provenance?: QuoteProvenance;
  searchTextNormalized: string;
};

type RootQuoteOriginType = "user_authored" | "saved_reference";
type RootQuoteAttributionType = "book" | "author" | "label";

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

function quoteCollection(ownerId: string) {
  return db.collection("users").doc(ownerId).collection("quotes");
}

function rootQuoteRef(canonicalQuoteId: string) {
  return db.collection("quotes").doc(canonicalQuoteId);
}

function allocateCanonicalQuoteId(): string {
  return `cq_${db.collection("quotes").doc().id}`;
}

function quoteBookmarkId(canonicalQuoteId: string): string {
  return canonicalQuoteId;
}

function normalizeQuoteSearchText(parts: Array<string | undefined>): string {
  return normalizeSearchText(parts.filter(Boolean).join(" "));
}

function resolveRootAttributionType(params: {
  bookId?: string;
  authorId?: string;
}): RootQuoteAttributionType {
  if (params.bookId) {
    return "book";
  }

  if (params.authorId) {
    return "author";
  }

  return "label";
}

function parseQuoteProvenance(value: unknown): QuoteProvenance | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const sourceType =
    raw.sourceType === "book" || raw.sourceType === "author" || raw.sourceType === "manual"
      ? raw.sourceType
      : null;
  const verificationStatus =
    raw.verificationStatus === "unverified" ||
    raw.verificationStatus === "canonical_linked" ||
    raw.verificationStatus === "saved_reference"
      ? raw.verificationStatus
      : null;

  if (!sourceType || !verificationStatus) {
    return undefined;
  }

  const sourceBookId =
    typeof raw.sourceBookId === "string" && raw.sourceBookId.trim()
      ? raw.sourceBookId.trim()
      : undefined;
  const sourceAuthorId =
    typeof raw.sourceAuthorId === "string" && raw.sourceAuthorId.trim()
      ? raw.sourceAuthorId.trim()
      : undefined;
  const savedFromOwnerId =
    typeof raw.savedFromOwnerId === "string" && raw.savedFromOwnerId.trim()
      ? raw.savedFromOwnerId.trim()
      : undefined;
  const savedFromQuoteId =
    typeof raw.savedFromQuoteId === "string" && raw.savedFromQuoteId.trim()
      ? raw.savedFromQuoteId.trim()
      : undefined;

  return {
    sourceType,
    verificationStatus,
    ...(sourceBookId ? { sourceBookId } : {}),
    ...(sourceAuthorId ? { sourceAuthorId } : {}),
    ...(savedFromOwnerId ? { savedFromOwnerId } : {}),
    ...(savedFromQuoteId ? { savedFromQuoteId } : {}),
  };
}

function buildQuoteProvenance(params: {
  bookId?: string;
  authorId?: string;
  savedFromOwnerId?: string;
  savedFromQuoteId?: string;
}): QuoteProvenance {
  const sourceType = params.bookId ? "book" : params.authorId ? "author" : "manual";
  const verificationStatus =
    params.savedFromOwnerId && params.savedFromQuoteId
      ? "saved_reference"
      : params.bookId || params.authorId
        ? "canonical_linked"
        : "unverified";

  return {
    sourceType,
    verificationStatus,
    ...(params.bookId ? { sourceBookId: params.bookId } : {}),
    ...(params.authorId ? { sourceAuthorId: params.authorId } : {}),
    ...(params.savedFromOwnerId ? { savedFromOwnerId: params.savedFromOwnerId } : {}),
    ...(params.savedFromQuoteId ? { savedFromQuoteId: params.savedFromQuoteId } : {}),
  };
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
    canonicalQuoteId:
      typeof raw.canonicalQuoteId === "string" && raw.canonicalQuoteId.trim()
        ? raw.canonicalQuoteId.trim()
        : undefined,
    legacyQuoteId: quoteId,
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
    provenance: parseQuoteProvenance(raw.provenance),
    searchTextNormalized:
      typeof raw.searchTextNormalized === "string" && raw.searchTextNormalized.trim()
        ? raw.searchTextNormalized.trim()
        : normalizeQuoteSearchText([textEn, textAr, sourceEn, sourceAr]),
  };
}

function parseRootQuote(
  canonicalQuoteId: string,
  raw: DocumentData
): CanonicalQuote | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const ownerId =
    typeof raw.ownerId === "string" && raw.ownerId.trim()
      ? raw.ownerId.trim()
      : "";
  const textEn = typeof raw.textEn === "string" ? raw.textEn.trim() : "";
  const textAr = typeof raw.textAr === "string" ? raw.textAr.trim() : "";
  const sourceEn = typeof raw.sourceEn === "string" ? raw.sourceEn.trim() : "";
  const sourceAr = typeof raw.sourceAr === "string" ? raw.sourceAr.trim() : "";

  if (!ownerId || !textEn || !textAr || !sourceEn || !sourceAr) {
    return null;
  }

  return {
    id: canonicalQuoteId,
    canonicalQuoteId,
    legacyQuoteId:
      typeof raw.legacyQuoteId === "string" && raw.legacyQuoteId.trim()
        ? raw.legacyQuoteId.trim()
        : undefined,
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
    provenance: parseQuoteProvenance(raw.provenance),
    searchTextNormalized:
      typeof raw.searchTextNormalized === "string" && raw.searchTextNormalized.trim()
        ? raw.searchTextNormalized.trim()
        : normalizeQuoteSearchText([textEn, textAr, sourceEn, sourceAr]),
  };
}

function publicQuotePayload(quote: CanonicalQuote) {
  const exposedId = quote.canonicalQuoteId || quote.id;
  const legacyQuoteId =
    quote.legacyQuoteId && quote.legacyQuoteId !== exposedId
      ? quote.legacyQuoteId
      : quote.id !== exposedId
        ? quote.id
        : undefined;

  return {
    id: exposedId,
    ...(quote.canonicalQuoteId || exposedId
      ? { canonicalQuoteId: quote.canonicalQuoteId || exposedId }
      : {}),
    ...(legacyQuoteId ? { legacyQuoteId } : {}),
    ownerId: quote.ownerId,
    textEn: quote.textEn,
    textAr: quote.textAr,
    sourceEn: quote.sourceEn,
    sourceAr: quote.sourceAr,
    ...(quote.bookId ? { bookId: quote.bookId } : {}),
    ...(quote.authorId ? { authorId: quote.authorId } : {}),
    ...(quote.createdAt ? { createdAt: quote.createdAt } : {}),
    ...(quote.updatedAt ? { updatedAt: quote.updatedAt } : {}),
    ...(quote.provenance ? { provenance: quote.provenance } : {}),
  };
}

async function searchRootQuotes(params: {
  ownerId?: string;
  bookId?: string;
  authorId?: string;
  query?: string;
  limit: number;
}): Promise<CanonicalQuote[]> {
  let queryRef: Query = db.collection("quotes");

  if (params.ownerId) {
    queryRef = queryRef.where("ownerId", "==", params.ownerId);
  } else {
    queryRef = queryRef.where("isPublic", "==", true);
  }

  if (params.bookId) {
    queryRef = queryRef.where("bookId", "==", params.bookId);
  } else if (params.authorId) {
    queryRef = queryRef.where("authorId", "==", params.authorId);
  } else if (params.query) {
    const searchTokens = tokenizeSearchText(params.query, 8);
    const primaryToken = searchTokens.sort((left, right) => right.length - left.length)[0];
    if (!primaryToken) {
      return [];
    }
    queryRef = queryRef.where("searchTokens", "array-contains", primaryToken);
  }

  const snap = await queryRef.limit(Math.max(params.limit, MAX_QUOTE_SCAN_DOCS)).get();

  return sortQuotesByFreshness(
    snap.docs
      .map((docSnap) => parseRootQuote(docSnap.id, docSnap.data()))
      .filter((quote): quote is CanonicalQuote => quote !== null)
      .filter((quote) =>
        isQuoteMatch(quote, {
          ...(params.bookId ? { bookId: params.bookId } : {}),
          ...(params.authorId ? { authorId: params.authorId } : {}),
          ...(params.query ? { query: params.query } : {}),
        })
      )
      .filter((quote) => (params.ownerId ? true : quote.isPublic))
      .slice(0, params.limit)
  );
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

  const normalized = normalizeSearchText(value);
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

  const queryTokens = tokenizeSearchText(filters.query, 8);
  if (queryTokens.length === 0) {
    return quote.searchTextNormalized.includes(filters.query);
  }

  return queryTokens.every((token) => quote.searchTextNormalized.includes(token));
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

function normalizePublicQuoteLimit(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_PUBLIC_QUOTE_LIMIT;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpsError("invalid-argument", "limit must be a number.");
  }

  const integer = Math.trunc(value);
  if (integer < 1 || integer > MAX_PUBLIC_QUOTE_LIMIT) {
    throw new HttpsError(
      "invalid-argument",
      `limit must be between 1 and ${MAX_PUBLIC_QUOTE_LIMIT}.`
    );
  }

  return integer;
}

function extractOwnerIdFromQuotePath(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== 4) {
    return null;
  }

  if (segments[0] !== "users" || segments[2] !== "quotes") {
    return null;
  }

  return segments[1] || null;
}

function sortQuotesByFreshness(quotes: CanonicalQuote[]): CanonicalQuote[] {
  return [...quotes].sort((left, right) => {
    const leftUpdatedAt = left.updatedAt || left.createdAt || "";
    const rightUpdatedAt = right.updatedAt || right.createdAt || "";
    return rightUpdatedAt.localeCompare(leftUpdatedAt) || left.id.localeCompare(right.id);
  });
}

function sanitizeIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
}

async function resolveCanonicalQuoteLinks(params: {
  bookId?: string;
  authorId?: string;
}): Promise<{ bookId?: string; authorId?: string }> {
  const bookId = params.bookId;
  const authorId = params.authorId;

  let resolvedAuthorId = authorId;

  if (bookId) {
    const bookSnap = await db.collection("books").doc(bookId).get();
    if (!bookSnap.exists) {
      throw new HttpsError("invalid-argument", "bookId is invalid.");
    }

    const bookAuthorId =
      typeof bookSnap.data()?.authorId === "string" && bookSnap.data()?.authorId.trim()
        ? String(bookSnap.data()?.authorId).trim()
        : undefined;

    if (resolvedAuthorId && bookAuthorId && resolvedAuthorId !== bookAuthorId) {
      throw new HttpsError("invalid-argument", "authorId does not match bookId.");
    }

    resolvedAuthorId = resolvedAuthorId || bookAuthorId;
  }

  if (resolvedAuthorId) {
    const authorSnap = await db.collection("authors").doc(resolvedAuthorId).get();
    if (!authorSnap.exists) {
      throw new HttpsError("invalid-argument", "authorId is invalid.");
    }
  }

  return {
    ...(bookId ? { bookId } : {}),
    ...(resolvedAuthorId ? { authorId: resolvedAuthorId } : {}),
  };
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

  const rootMatches = await searchRootQuotes({
    ownerId,
    ...(bookId ? { bookId } : {}),
    ...(authorId ? { authorId } : {}),
    ...(queryValue ? { query: queryValue } : {}),
    limit,
  });

  if (rootMatches.length > 0) {
    return {
      quotes: rootMatches.map(publicQuotePayload),
    };
  }

  let queryRef: Query = quoteCollection(ownerId).orderBy("updatedAt", "desc");

  if (bookId) {
    queryRef = queryRef.where("bookId", "==", bookId);
  }

  if (authorId) {
    queryRef = queryRef.where("authorId", "==", authorId);
  }

  let scanCursor: QueryDocumentSnapshot<DocumentData> | null = null;
  if (cursor) {
    const cursorSnap = await quoteDocRef(ownerId, cursor).get();
    if (!cursorSnap.exists) {
      throw new HttpsError("invalid-argument", "Invalid cursor.");
    }
    scanCursor = cursorSnap as QueryDocumentSnapshot<DocumentData>;
  }

  const matchedQuotes: CanonicalQuote[] = [];
  let lastScannedDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let scannedDocs = 0;
  let exhausted = false;

  while (matchedQuotes.length < limit && scannedDocs < MAX_QUOTE_SCAN_DOCS) {
    const remainingScanBudget = Math.min(
      QUOTE_SCAN_BATCH_SIZE,
      MAX_QUOTE_SCAN_DOCS - scannedDocs
    );
    let pageQuery = queryRef.limit(remainingScanBudget);

    if (scanCursor) {
      pageQuery = pageQuery.startAfter(scanCursor);
    }

    const snap = await pageQuery.get();
    if (snap.empty) {
      exhausted = true;
      break;
    }

    for (const docSnap of snap.docs) {
      lastScannedDoc = docSnap;
      scanCursor = docSnap;
      scannedDocs += 1;

      const parsed = parseQuote(ownerId, docSnap.id, docSnap.data());
      if (!parsed) {
        logger.warn("[QUOTES][LIST][INVALID_DOC]", {
          ownerId,
          quoteId: docSnap.id,
        });
        continue;
      }

      if (isQuoteMatch(parsed, { bookId, authorId, query: queryValue })) {
        matchedQuotes.push(parsed);
        if (matchedQuotes.length >= limit) {
          break;
        }
      }
    }

    if (snap.docs.length < remainingScanBudget) {
      exhausted = true;
      break;
    }
  }

  if (!exhausted && scannedDocs >= MAX_QUOTE_SCAN_DOCS && queryValue) {
    logger.warn("[QUOTES][LIST][SCAN_LIMIT_REACHED]", {
      ownerId,
      limit,
      query: queryValue,
      scannedDocs,
    });
  }

  let hasMore = false;
  if (lastScannedDoc && matchedQuotes.length >= limit) {
    const probeSnap = await queryRef.limit(1).startAfter(lastScannedDoc).get();
    hasMore = !probeSnap.empty;
  }

  return {
    quotes: matchedQuotes.map(publicQuotePayload),
    ...(hasMore && lastScannedDoc
      ? { nextCursor: lastScannedDoc.id }
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

  const canonicalSnap = await rootQuoteRef(quoteId).get();
  if (canonicalSnap.exists) {
    const parsedCanonical = parseRootQuote(
      canonicalSnap.id,
      canonicalSnap.data() as DocumentData
    );

    if (!parsedCanonical) {
      logger.error("[QUOTES][DETAILS][INVALID_ROOT_DOC]", { quoteId });
      throw new HttpsError("internal", "Quote payload is invalid.");
    }

    if (!parsedCanonical.isPublic && requesterUid !== parsedCanonical.ownerId) {
      throw new HttpsError("permission-denied", "Quote is private.");
    }

    return publicQuotePayload(parsedCanonical);
  }

  if (!ownerId) {
    throw new HttpsError("unauthenticated", "ownerId is required when not authenticated.");
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

export const searchPublicQuotes = onCall({ cors: true }, async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;

  const limit = normalizePublicQuoteLimit(data.limit);
  const bookId = normalizeOptionalString(data.bookId, "bookId", 180);
  const authorId = normalizeOptionalString(data.authorId, "authorId", 180);
  const queryValue = normalizeQueryValue(data.query);

  if (!bookId && !authorId && !queryValue) {
    return {
      quotes: [],
    };
  }

  const rootMatches = await searchRootQuotes({
    ...(bookId ? { bookId } : {}),
    ...(authorId ? { authorId } : {}),
    ...(queryValue ? { query: queryValue } : {}),
    limit,
  });

  if (rootMatches.length > 0) {
    return {
      quotes: rootMatches.map(publicQuotePayload),
    };
  }

  let queryRef: Query = db.collectionGroup("quotes").where("isPublic", "==", true);
  let shouldRunLegacyFallback = false;

  if (bookId) {
    queryRef = queryRef.where("bookId", "==", bookId);
  } else if (authorId) {
    queryRef = queryRef.where("authorId", "==", authorId);
  } else if (queryValue) {
    const searchTokens = tokenizeSearchText(queryValue, 8);
    const primaryToken = searchTokens.sort((left, right) => right.length - left.length)[0];

    if (!primaryToken) {
      return {
        quotes: [],
      };
    }

    queryRef = queryRef.where("searchTokens", "array-contains", primaryToken);
    shouldRunLegacyFallback = true;
  }

  const materializeMatches = (docs: QueryDocumentSnapshot<DocumentData>[]) =>
    docs
    .map((docSnap) => {
      const ownerId = extractOwnerIdFromQuotePath(docSnap.ref.path);
      if (!ownerId) {
        logger.warn("[QUOTES][PUBLIC_SEARCH][INVALID_PATH]", {
          path: docSnap.ref.path,
        });
        return null;
      }

      return parseQuote(ownerId, docSnap.id, docSnap.data());
    })
    .filter((quote): quote is CanonicalQuote => quote !== null)
    .filter((quote) =>
      isQuoteMatch(quote, {
        ...(bookId ? { bookId } : {}),
        ...(authorId ? { authorId } : {}),
        ...(queryValue ? { query: queryValue } : {}),
      })
    );

  const snap = await queryRef.limit(MAX_QUOTE_SCAN_DOCS).get();
  let matchedQuotes = materializeMatches(snap.docs);

  if (matchedQuotes.length === 0 && shouldRunLegacyFallback) {
    const legacySnap = await db
      .collectionGroup("quotes")
      .where("isPublic", "==", true)
      .limit(MAX_QUOTE_SCAN_DOCS)
      .get();
    matchedQuotes = materializeMatches(legacySnap.docs);
  }

  return {
    quotes: sortQuotesByFreshness(matchedQuotes)
      .slice(0, limit)
      .map(publicQuotePayload),
  };
});

export const createQuote = onCall({ cors: true }, async (request) => {
  const caller = await assertActiveAuthenticatedUser(request.auth);
  const uid = caller.uid;
  const data = (request.data ?? {}) as Record<string, unknown>;

  const rawQuote = {
    textEn: normalizeRequiredString(data.textEn, "textEn", QUOTE_TEXT_MAX),
    textAr: normalizeRequiredString(data.textAr, "textAr", QUOTE_TEXT_MAX),
    sourceEn: normalizeRequiredString(data.sourceEn, "sourceEn", QUOTE_SOURCE_MAX),
    sourceAr: normalizeRequiredString(data.sourceAr, "sourceAr", QUOTE_SOURCE_MAX),
    bookId: normalizeOptionalString(data.bookId, "bookId", 180),
    authorId: normalizeOptionalString(data.authorId, "authorId", 180),
    isPublic: data.isPublic === undefined ? true : data.isPublic === true,
  };
  const canonicalLinks = await resolveCanonicalQuoteLinks({
    bookId: rawQuote.bookId,
    authorId: rawQuote.authorId,
  });
  const provenance = buildQuoteProvenance(canonicalLinks);
  const searchTextNormalized = normalizeQuoteSearchText([
    rawQuote.textEn,
    rawQuote.textAr,
    rawQuote.sourceEn,
    rawQuote.sourceAr,
  ]);
  const searchTokens = tokenizeSearchText(searchTextNormalized, 40);

  const nowIso = new Date().toISOString();
  const canonicalQuoteId = allocateCanonicalQuoteId();
  const canonicalRef = rootQuoteRef(canonicalQuoteId);
  const quoteRef = quoteCollection(uid).doc();

  const rootQuoteData = {
    canonicalQuoteId,
    legacyQuoteId: quoteRef.id,
    ownerId: uid,
    textEn: rawQuote.textEn,
    textAr: rawQuote.textAr,
    sourceEn: rawQuote.sourceEn,
    sourceAr: rawQuote.sourceAr,
    originType: "user_authored" as RootQuoteOriginType,
    attributionType: resolveRootAttributionType(canonicalLinks),
    authorId: canonicalLinks.authorId ?? null,
    bookId: canonicalLinks.bookId ?? null,
    attributionLabel: rawQuote.sourceEn,
    sourceChapterId: null,
    sourceOffset: null,
    isPublic: rawQuote.isPublic,
    provenance,
    searchTextNormalized,
    searchTokens,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    version: 1,
  };

  await canonicalRef.set(rootQuoteData);

  await quoteRef.set({
    canonicalQuoteId,
    ownerId: uid,
    textEn: rawQuote.textEn,
    textAr: rawQuote.textAr,
    sourceEn: rawQuote.sourceEn,
    sourceAr: rawQuote.sourceAr,
    ...(canonicalLinks.bookId ? { bookId: canonicalLinks.bookId } : {}),
    ...(canonicalLinks.authorId ? { authorId: canonicalLinks.authorId } : {}),
    provenance,
    searchTextNormalized,
    searchTokens,
    isPublic: rawQuote.isPublic,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    version: 2,
  });

  return {
    id: quoteRef.id,
    canonicalQuoteId,
    ownerId: uid,
    textEn: rawQuote.textEn,
    textAr: rawQuote.textAr,
    sourceEn: rawQuote.sourceEn,
    sourceAr: rawQuote.sourceAr,
    ...(canonicalLinks.bookId ? { bookId: canonicalLinks.bookId } : {}),
    ...(canonicalLinks.authorId ? { authorId: canonicalLinks.authorId } : {}),
    provenance,
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
  const provenance = buildQuoteProvenance({
    bookId: sourceQuote.bookId,
    authorId: sourceQuote.authorId,
    savedFromOwnerId: sourceOwnerId,
    savedFromQuoteId: sourceQuoteId,
  });
  const searchTextNormalized = normalizeQuoteSearchText([
    sourceQuote.textEn,
    sourceQuote.textAr,
    sourceQuote.sourceEn,
    sourceQuote.sourceAr,
  ]);
  const searchTokens = tokenizeSearchText(searchTextNormalized, 40);
  const canonicalQuoteId = allocateCanonicalQuoteId();
  const canonicalRef = rootQuoteRef(canonicalQuoteId);

  await canonicalRef.set({
    canonicalQuoteId,
    legacyQuoteId: deterministicId,
    ownerId: uid,
    textEn: sourceQuote.textEn,
    textAr: sourceQuote.textAr,
    sourceEn: sourceQuote.sourceEn,
    sourceAr: sourceQuote.sourceAr,
    originType: "saved_reference" as RootQuoteOriginType,
    attributionType: resolveRootAttributionType({
      bookId: sourceQuote.bookId,
      authorId: sourceQuote.authorId,
    }),
    authorId: sourceQuote.authorId ?? null,
    bookId: sourceQuote.bookId ?? null,
    attributionLabel: sourceQuote.sourceEn,
    sourceChapterId: null,
    sourceOffset: null,
    isPublic: true,
    provenance,
    searchTextNormalized,
    searchTokens,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    version: 1,
  });

  await targetRef.set({
    canonicalQuoteId,
    ownerId: uid,
    textEn: sourceQuote.textEn,
    textAr: sourceQuote.textAr,
    sourceEn: sourceQuote.sourceEn,
    sourceAr: sourceQuote.sourceAr,
    ...(sourceQuote.bookId ? { bookId: sourceQuote.bookId } : {}),
    ...(sourceQuote.authorId ? { authorId: sourceQuote.authorId } : {}),
    provenance,
    searchTextNormalized,
    searchTokens,
    isPublic: true,
    savedFrom: {
      ownerId: sourceOwnerId,
      quoteId: sourceQuoteId,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    version: 2,
  });

  return {
    quote: {
      id: deterministicId,
      canonicalQuoteId,
      ownerId: uid,
      textEn: sourceQuote.textEn,
      textAr: sourceQuote.textAr,
      sourceEn: sourceQuote.sourceEn,
      sourceAr: sourceQuote.sourceAr,
      ...(sourceQuote.bookId ? { bookId: sourceQuote.bookId } : {}),
      ...(sourceQuote.authorId ? { authorId: sourceQuote.authorId } : {}),
      provenance,
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
  const quoteOwnerId = normalizeOptionalString(data.quoteOwnerId, "quoteOwnerId", 128);

  if (typeof data.active !== "boolean") {
    throw new HttpsError("invalid-argument", "active must be boolean.");
  }

  let sourceQuote: CanonicalQuote | null = null;

  const rootSnap = await rootQuoteRef(quoteId).get();
  if (rootSnap.exists) {
    sourceQuote = parseRootQuote(quoteId, rootSnap.data() as DocumentData);
  }

  if (!sourceQuote && quoteOwnerId) {
    const legacySnap = await quoteDocRef(quoteOwnerId, quoteId).get();
    if (legacySnap.exists) {
      sourceQuote = parseQuote(
        quoteOwnerId,
        quoteId,
        legacySnap.data() as DocumentData
      );
    }
  }

  if (!sourceQuote) {
    throw new HttpsError("not-found", "Quote not found.");
  }

  const canonicalQuoteId = sourceQuote.canonicalQuoteId || sourceQuote.id;
  if (!canonicalQuoteId) {
    throw new HttpsError("internal", "Quote payload is invalid.");
  }

  if (!sourceQuote.isPublic && uid !== sourceQuote.ownerId) {
    throw new HttpsError("permission-denied", "Quote is private.");
  }

  const bookmarkId = quoteBookmarkId(canonicalQuoteId);
  const bookmarkRef = db
    .collection("users")
    .doc(uid)
    .collection("bookmarks")
    .doc(bookmarkId);

  if (data.active) {
    await bookmarkRef.set(
      {
        type: "quote",
        entityId: canonicalQuoteId,
        ...(sourceQuote.ownerId ? { quoteOwnerId: sourceQuote.ownerId } : {}),
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
