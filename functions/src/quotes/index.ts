import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Query, DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import * as logger from "firebase-functions/logger";
import { createHash } from "crypto";
import { normalizeSearchText, tokenizeSearchText } from "../search/normalization";
import { assertActiveAuthenticatedUser, assertRoleFromClaims } from "../shared/auth";
import {
  toQuoteInteraction,
  writeUserEntityInteractionDirect,
} from "../identityGraph/userEntityInteractionRuntime";
import {
  BOOK_QUOTE_PROJECTION_COLLECTION,
  SOCIAL_QUOTE_PROJECTION_COLLECTION,
  USER_QUOTE_PROJECTION_COLLECTION,
  userQuoteProjectionId,
} from "../projections/quoteProjections";

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

export type QuoteProvenance = {
  sourceType: "book" | "author" | "manual";
  verificationStatus: "unverified" | "canonical_linked" | "saved_reference";
  sourceBookId?: string;
  sourceAuthorId?: string;
  savedFromOwnerId?: string;
  savedFromQuoteId?: string;
  readerSource?: {
    sourceSignatureHash: string;
    attachmentId: string | null;
    manifestVersion: number;
    sourceType: string;
    editionId?: string | null;
  };
};

type QuoteLifecycleState =
  | "canonical"
  | "merged"
  | "duplicate"
  | "disputed"
  | "translation"
  | "variant"
  | "paraphrase"
  | "reader_highlight"
  | "imported"
  | "archived";

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
  lifecycleState?: QuoteLifecycleState;
  searchTextNormalized: string;
};

type RootQuoteOriginType = "user_authored" | "saved_reference" | "dataset_import";
type RootQuoteAttributionType = "book" | "author" | "label";
type AdminQuoteStatus = "active" | "archived";

type AdminQuoteShape = {
  quoteId: string;
  canonicalQuoteId: string;
  canonicalQuoteHash?: string;
  slug?: string;
  canonicalText: string;
  normalizedText: string;
  textEn: string;
  textAr: string;
  sourceEn: string;
  sourceAr: string;
  authorId?: string;
  authorName?: string;
  bookId?: string;
  bookTitle?: string;
  chapter?: string;
  page?: number;
  section?: string;
  year?: number;
  language?: string;
  originalLanguage?: string;
  translatedFrom?: string;
  translationStatus?: string;
  themes?: string[];
  mood?: string;
  concepts?: string[];
  keywords?: string[];
  tags?: string[];
  attributionConfidence?: number;
  sourceType?: string;
  sourceReference?: string;
  provenance?: QuoteProvenance;
  lifecycleState?: QuoteLifecycleState;
  quoteLifecycleState?: QuoteLifecycleState;
  variantOfQuoteId?: string;
  paraphraseOfQuoteId?: string;
  disputed?: boolean;
  status: AdminQuoteStatus;
  isPublic: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
};

export type CanonicalQuoteCreateInput = {
  actorUid: string;
  textEn: string;
  textAr: string;
  sourceEn: string;
  sourceAr: string;
  bookId?: string;
  authorId?: string;
  isPublic: boolean;
  originType: RootQuoteOriginType;
  createdBy?: string;
  updatedBy?: string;
  status?: AdminQuoteStatus;
  chapter?: string;
  page?: number;
  section?: string;
  year?: number;
  language?: string;
  originalLanguage?: string;
  translatedFrom?: string;
  translationStatus?: string;
  themes?: string[];
  mood?: string;
  concepts?: string[];
  keywords?: string[];
  tags?: string[];
  attributionConfidence?: number;
  sourceType?: string;
  sourceReference?: string;
  savedFromOwnerId?: string;
  savedFromQuoteId?: string;
  lifecycleState?: QuoteLifecycleState;
  variantOfQuoteId?: string;
  paraphraseOfQuoteId?: string;
  disputed?: boolean;
  authorNameOverride?: string;
  bookTitleOverride?: string;
  readerSource?: QuoteProvenance["readerSource"];
};

export type PreparedCanonicalQuoteWrite = {
  canonicalQuoteId: string;
  canonicalQuoteHash: string;
  canonicalLinks: {
    bookId?: string;
    authorId?: string;
  };
  searchTextNormalized: string;
  rootQuoteData: Record<string, unknown>;
  identityData: Record<string, unknown>;
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

function normalizeReaderQuoteProvenance(value: unknown): QuoteProvenance["readerSource"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const sourceSignatureHash = normalizeOptionalString(
    record.sourceSignatureHash,
    "readerProvenance.sourceSignatureHash",
    120
  );
  const sourceType = normalizeOptionalString(
    record.sourceType,
    "readerProvenance.sourceType",
    80
  );
  const attachmentId =
    record.attachmentId === null
      ? null
      : normalizeOptionalString(record.attachmentId, "readerProvenance.attachmentId", 180);
  const editionId =
    record.editionId === null
      ? null
      : normalizeOptionalString(record.editionId, "readerProvenance.editionId", 180);
  const manifestVersion =
    typeof record.manifestVersion === "number" && Number.isFinite(record.manifestVersion)
      ? Math.trunc(record.manifestVersion)
      : null;

  if (!sourceSignatureHash || !sourceType || !manifestVersion || manifestVersion <= 0) {
    return undefined;
  }

  return {
    sourceSignatureHash,
    attachmentId: attachmentId ?? null,
    manifestVersion,
    sourceType,
    ...(editionId !== undefined ? { editionId } : {}),
  };
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

function normalizeStringAllowEmpty(
  value: unknown,
  field: string,
  maxLength: number
): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }

  const normalized = value.trim();
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

export function rootQuoteRef(canonicalQuoteId: string) {
  return db.collection("quotes").doc(canonicalQuoteId);
}

function allocateCanonicalQuoteId(): string {
  return `cq_${db.collection("quotes").doc().id}`;
}

export function normalizeQuoteSearchText(parts: Array<string | undefined>): string {
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

function normalizeQuoteLifecycleState(value: unknown): QuoteLifecycleState | undefined {
  return value === "canonical" ||
    value === "merged" ||
    value === "duplicate" ||
    value === "disputed" ||
    value === "translation" ||
    value === "variant" ||
    value === "paraphrase" ||
    value === "reader_highlight" ||
    value === "imported" ||
    value === "archived"
    ? value
    : undefined;
}

function resolveQuoteLifecycleState(params: {
  readonly explicit?: QuoteLifecycleState;
  readonly originType?: RootQuoteOriginType;
  readonly status?: AdminQuoteStatus;
  readonly translationStatus?: string;
  readonly translatedFrom?: string;
  readonly readerSource?: QuoteProvenance["readerSource"];
  readonly variantOfQuoteId?: string;
  readonly paraphraseOfQuoteId?: string;
  readonly disputed?: boolean;
}): QuoteLifecycleState {
  if (params.status === "archived") return "archived";
  if (params.explicit) return params.explicit;
  if (params.disputed === true) return "disputed";
  if (params.paraphraseOfQuoteId) return "paraphrase";
  if (params.variantOfQuoteId) return "variant";
  if (params.readerSource) return "reader_highlight";
  if (params.originType === "dataset_import") return "imported";
  if (params.translationStatus || params.translatedFrom) return "translation";
  return "canonical";
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
  const readerSource = normalizeReaderQuoteProvenance(raw.readerSource);

  return {
    sourceType,
    verificationStatus,
    ...(sourceBookId ? { sourceBookId } : {}),
    ...(sourceAuthorId ? { sourceAuthorId } : {}),
    ...(savedFromOwnerId ? { savedFromOwnerId } : {}),
    ...(savedFromQuoteId ? { savedFromQuoteId } : {}),
    ...(readerSource ? { readerSource } : {}),
  };
}

export function buildQuoteProvenance(params: {
  bookId?: string;
  authorId?: string;
  savedFromOwnerId?: string;
  savedFromQuoteId?: string;
  readerSource?: QuoteProvenance["readerSource"];
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
    ...(params.readerSource ? { readerSource: params.readerSource } : {}),
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
    lifecycleState: normalizeQuoteLifecycleState(raw.lifecycleState),
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
    typeof raw.authorUid === "string" && raw.authorUid.trim()
      ? raw.authorUid.trim()
      : typeof raw.ownerId === "string" && raw.ownerId.trim()
        ? raw.ownerId.trim()
        : "";
  const textEn =
    typeof raw.textEn === "string" && raw.textEn.trim()
      ? raw.textEn.trim()
      : typeof raw.quoteText === "string"
        ? raw.quoteText.trim()
        : "";
  const textAr =
    typeof raw.textAr === "string" && raw.textAr.trim()
      ? raw.textAr.trim()
      : typeof raw.quoteText === "string"
        ? raw.quoteText.trim()
        : "";
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
    isPublic: raw.status !== "archived" && raw.status !== "deleted" && raw.visibility !== "private" && raw.isPublic !== false,
    provenance: parseQuoteProvenance(raw.provenance),
    lifecycleState: normalizeQuoteLifecycleState(raw.lifecycleState),
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
    ...(quote.lifecycleState ? { lifecycleState: quote.lifecycleState } : {}),
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

async function searchQuoteProjection(params: {
  collection: string;
  ownerId?: string;
  bookId?: string;
  authorId?: string;
  query?: string;
  limit: number;
  publicOnly?: boolean;
}): Promise<CanonicalQuote[]> {
  let queryRef: Query = db.collection(params.collection);

  if (params.ownerId) {
    queryRef = queryRef.where("ownerId", "==", params.ownerId);
  }
  if (params.publicOnly !== false) {
    queryRef = queryRef.where("isPublic", "==", true);
  }
  if (params.bookId) {
    queryRef = queryRef.where("bookId", "==", params.bookId);
  } else if (params.authorId) {
    queryRef = queryRef.where("authorId", "==", params.authorId);
  } else if (params.query) {
    const searchTokens = tokenizeSearchText(params.query, 8);
    const primaryToken = searchTokens.sort((left, right) => right.length - left.length)[0];
    if (!primaryToken) return [];
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
      .filter((quote) => params.publicOnly === false || quote.isPublic)
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

function normalizeStringArray(
  value: unknown,
  max = 20
): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,\n;]/)
      : [];
  const seen = new Set<string>();

  for (const entry of rawValues) {
    if (typeof entry !== "string") continue;
    const normalized = entry.trim();
    if (!normalized) continue;
    seen.add(normalized);
    if (seen.size >= max) break;
  }

  return Array.from(seen);
}

function normalizeOptionalInteger(
  value: unknown,
  field: string,
  minimum = 0,
  maximum = 1_000_000
): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numeric)) {
    throw new HttpsError("invalid-argument", `${field} must be a finite number.`);
  }

  const integer = Math.trunc(numeric);
  if (integer < minimum || integer > maximum) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be between ${minimum} and ${maximum}.`
    );
  }

  return integer;
}

function normalizeOptionalConfidence(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 1) {
    throw new HttpsError(
      "invalid-argument",
      "attributionConfidence must be between 0 and 1."
    );
  }

  return numeric;
}

function slugifyQuoteValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "")
    .slice(0, 120);
}

export function quoteIdentityRef(canonicalQuoteHash: string) {
  return db.collection("quote_identity").doc(canonicalQuoteHash);
}

export function buildCanonicalQuoteHash(params: {
  bookId?: string;
  authorId?: string;
  textEn: string;
  textAr: string;
  sourceEn: string;
  sourceAr: string;
}): string {
  const anchorScope = params.bookId ? "book" : "author";
  const anchorId = params.bookId || params.authorId || "manual";
  const payload = [
    anchorScope,
    anchorId,
    normalizeSearchText(params.textEn),
    normalizeSearchText(params.textAr),
    normalizeSearchText(params.sourceEn),
    normalizeSearchText(params.sourceAr),
  ].join("||");

  return createHash("sha256").update(payload).digest("hex");
}

export async function resolveQuoteDisplayMetadata(params: {
  bookId?: string;
  authorId?: string;
}): Promise<{ authorName?: string; bookTitle?: string }> {
  const tasks: Array<Promise<FirebaseFirestore.DocumentSnapshot<DocumentData>>> = [];
  if (params.bookId) {
    tasks.push(db.collection("books").doc(params.bookId).get());
  }
  if (params.authorId) {
    tasks.push(db.collection("authors").doc(params.authorId).get());
  }
  const [bookSnap, authorSnap] = await Promise.all(tasks);

  const bookTitle =
    params.bookId && bookSnap?.exists
      ? (
          typeof bookSnap.data()?.titleEn === "string" && bookSnap.data()?.titleEn.trim()
            ? String(bookSnap.data()?.titleEn).trim()
            : typeof bookSnap.data()?.title === "string"
              ? String(bookSnap.data()?.title).trim()
              : ""
        )
      : undefined;
  const authorName =
    params.authorId && authorSnap?.exists
      ? (
          typeof authorSnap.data()?.canonicalName === "string" && authorSnap.data()?.canonicalName.trim()
            ? String(authorSnap.data()?.canonicalName).trim()
            : typeof authorSnap.data()?.nameEn === "string"
              ? String(authorSnap.data()?.nameEn).trim()
              : ""
        )
      : undefined;

  return {
    ...(bookTitle ? { bookTitle } : {}),
    ...(authorName ? { authorName } : {}),
  };
}

function mapAdminQuote(raw: DocumentData, quoteId: string): AdminQuoteShape {
  const canonicalText =
    typeof raw.canonicalText === "string" && raw.canonicalText.trim()
      ? raw.canonicalText.trim()
      : typeof raw.textEn === "string" && raw.textEn.trim()
        ? raw.textEn.trim()
        : typeof raw.textAr === "string"
          ? raw.textAr.trim()
          : "";
  const normalizedText =
    typeof raw.normalizedText === "string" && raw.normalizedText.trim()
      ? raw.normalizedText.trim()
      : normalizeSearchText(canonicalText);

  return {
    quoteId,
    canonicalQuoteId:
      typeof raw.canonicalQuoteId === "string" && raw.canonicalQuoteId.trim()
        ? raw.canonicalQuoteId.trim()
        : quoteId,
    canonicalQuoteHash:
      typeof raw.canonicalQuoteHash === "string" && raw.canonicalQuoteHash.trim()
        ? raw.canonicalQuoteHash.trim()
        : undefined,
    slug:
      typeof raw.slug === "string" && raw.slug.trim()
        ? raw.slug.trim()
        : undefined,
    canonicalText,
    normalizedText,
    textEn: typeof raw.textEn === "string" ? raw.textEn.trim() : "",
    textAr: typeof raw.textAr === "string" ? raw.textAr.trim() : "",
    sourceEn: typeof raw.sourceEn === "string" ? raw.sourceEn.trim() : "",
    sourceAr: typeof raw.sourceAr === "string" ? raw.sourceAr.trim() : "",
    authorId:
      typeof raw.authorId === "string" && raw.authorId.trim()
        ? raw.authorId.trim()
        : undefined,
    authorName:
      typeof raw.authorName === "string" && raw.authorName.trim()
        ? raw.authorName.trim()
        : undefined,
    bookId:
      typeof raw.bookId === "string" && raw.bookId.trim()
        ? raw.bookId.trim()
        : undefined,
    bookTitle:
      typeof raw.bookTitle === "string" && raw.bookTitle.trim()
        ? raw.bookTitle.trim()
        : undefined,
    chapter:
      typeof raw.chapter === "string" && raw.chapter.trim()
        ? raw.chapter.trim()
        : undefined,
    page:
      typeof raw.page === "number" && Number.isFinite(raw.page)
        ? Math.trunc(raw.page)
        : undefined,
    section:
      typeof raw.section === "string" && raw.section.trim()
        ? raw.section.trim()
        : undefined,
    year:
      typeof raw.year === "number" && Number.isFinite(raw.year)
        ? Math.trunc(raw.year)
        : undefined,
    language:
      typeof raw.language === "string" && raw.language.trim()
        ? raw.language.trim()
        : undefined,
    originalLanguage:
      typeof raw.originalLanguage === "string" && raw.originalLanguage.trim()
        ? raw.originalLanguage.trim()
        : undefined,
    translatedFrom:
      typeof raw.translatedFrom === "string" && raw.translatedFrom.trim()
        ? raw.translatedFrom.trim()
        : undefined,
    translationStatus:
      typeof raw.translationStatus === "string" && raw.translationStatus.trim()
        ? raw.translationStatus.trim()
        : undefined,
    themes: normalizeStringArray(raw.themes, 20),
    mood:
      typeof raw.mood === "string" && raw.mood.trim()
        ? raw.mood.trim()
        : undefined,
    concepts: normalizeStringArray(raw.concepts, 20),
    keywords: normalizeStringArray(raw.keywords, 20),
    tags: normalizeStringArray(raw.tags, 20),
    attributionConfidence:
      typeof raw.attributionConfidence === "number" &&
      Number.isFinite(raw.attributionConfidence)
        ? raw.attributionConfidence
        : undefined,
    sourceType:
      typeof raw.sourceType === "string" && raw.sourceType.trim()
        ? raw.sourceType.trim()
        : undefined,
    sourceReference:
      typeof raw.sourceReference === "string" && raw.sourceReference.trim()
        ? raw.sourceReference.trim()
        : undefined,
    provenance: parseQuoteProvenance(raw.provenance),
    lifecycleState: normalizeQuoteLifecycleState(raw.lifecycleState),
    quoteLifecycleState: normalizeQuoteLifecycleState(raw.quoteLifecycleState),
    variantOfQuoteId:
      typeof raw.variantOfQuoteId === "string" && raw.variantOfQuoteId.trim()
        ? raw.variantOfQuoteId.trim()
        : undefined,
    paraphraseOfQuoteId:
      typeof raw.paraphraseOfQuoteId === "string" && raw.paraphraseOfQuoteId.trim()
        ? raw.paraphraseOfQuoteId.trim()
        : undefined,
    disputed: raw.disputed === true,
    status: raw.status === "archived" ? "archived" : "active",
    isPublic: raw.isPublic !== false,
    createdAt: timestampToIso(raw.createdAt),
    updatedAt: timestampToIso(raw.updatedAt),
    createdBy:
      typeof raw.createdBy === "string" && raw.createdBy.trim()
        ? raw.createdBy.trim()
        : undefined,
    updatedBy:
      typeof raw.updatedBy === "string" && raw.updatedBy.trim()
        ? raw.updatedBy.trim()
        : undefined,
  };
}

export async function findExistingCanonicalQuote(params: {
  canonicalQuoteHash: string;
  searchTextNormalized: string;
  bookId?: string;
  authorId?: string;
}): Promise<{ canonicalQuoteId: string } | null> {
  const identitySnap = await quoteIdentityRef(params.canonicalQuoteHash).get();
  if (identitySnap.exists) {
    const canonicalQuoteId =
      typeof identitySnap.data()?.canonicalQuoteId === "string" &&
      identitySnap.data()?.canonicalQuoteId.trim()
        ? String(identitySnap.data()?.canonicalQuoteId).trim()
        : "";
    if (canonicalQuoteId) {
      return { canonicalQuoteId };
    }
  }

  const searchSnap = await db
    .collection("quotes")
    .where("searchTextNormalized", "==", params.searchTextNormalized)
    .limit(20)
    .get();

  for (const docSnap of searchSnap.docs) {
    const raw = docSnap.data();
    const rawHash = buildCanonicalQuoteHash({
      bookId:
        typeof raw.bookId === "string" && raw.bookId.trim()
          ? raw.bookId.trim()
          : undefined,
      authorId:
        typeof raw.authorId === "string" && raw.authorId.trim()
          ? raw.authorId.trim()
          : undefined,
      textEn: typeof raw.textEn === "string" ? raw.textEn : "",
      textAr: typeof raw.textAr === "string" ? raw.textAr : "",
      sourceEn: typeof raw.sourceEn === "string" ? raw.sourceEn : "",
      sourceAr: typeof raw.sourceAr === "string" ? raw.sourceAr : "",
    });
    if (rawHash === params.canonicalQuoteHash) {
      return { canonicalQuoteId: docSnap.id };
    }
  }

  return null;
}

export async function resolveCanonicalQuoteLinks(params: {
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

export async function prepareCanonicalQuoteWrite(
  input: CanonicalQuoteCreateInput,
  canonicalQuoteId = allocateCanonicalQuoteId()
): Promise<PreparedCanonicalQuoteWrite> {
  if (!input.bookId && !input.authorId) {
    throw new HttpsError(
      "invalid-argument",
      "Canonical quotes require bookId or authorId."
    );
  }

  const canonicalLinks = await resolveCanonicalQuoteLinks({
    bookId: input.bookId,
    authorId: input.authorId,
  });
  const provenance = buildQuoteProvenance({
    bookId: canonicalLinks.bookId,
    authorId: canonicalLinks.authorId,
    savedFromOwnerId: input.savedFromOwnerId,
    savedFromQuoteId: input.savedFromQuoteId,
    readerSource: input.readerSource,
  });
  const searchTextNormalized = normalizeQuoteSearchText([
    input.textEn,
    input.textAr,
    input.sourceEn,
    input.sourceAr,
  ]);
  const searchTokens = tokenizeSearchText(searchTextNormalized, 40);
  const canonicalQuoteHash = buildCanonicalQuoteHash({
    bookId: canonicalLinks.bookId,
    authorId: canonicalLinks.authorId,
    textEn: input.textEn,
    textAr: input.textAr,
    sourceEn: input.sourceEn,
    sourceAr: input.sourceAr,
  });
  const linkMetadata =
    input.authorNameOverride || input.bookTitleOverride
      ? {
          ...(input.bookTitleOverride ? { bookTitle: input.bookTitleOverride } : {}),
          ...(input.authorNameOverride ? { authorName: input.authorNameOverride } : {}),
        }
      : await resolveQuoteDisplayMetadata(canonicalLinks);
  const canonicalText = input.textEn || input.textAr;
  const normalizedText = normalizeSearchText(canonicalText);
  const slug = slugifyQuoteValue(canonicalText) || canonicalQuoteId;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const lifecycleState = resolveQuoteLifecycleState({
    explicit: input.lifecycleState,
    originType: input.originType,
    status: input.status,
    translationStatus: input.translationStatus,
    translatedFrom: input.translatedFrom,
    readerSource: input.readerSource,
    variantOfQuoteId: input.variantOfQuoteId,
    paraphraseOfQuoteId: input.paraphraseOfQuoteId,
    disputed: input.disputed,
  });

  return {
    canonicalQuoteId,
    canonicalQuoteHash,
    canonicalLinks,
    searchTextNormalized,
    rootQuoteData: {
      canonicalQuoteId,
      canonicalQuoteHash,
      quoteText: canonicalText,
      ownerId: input.actorUid,
      authorUid: input.actorUid,
      textEn: input.textEn,
      textAr: input.textAr,
      sourceEn: input.sourceEn,
      sourceAr: input.sourceAr,
      canonicalText,
      normalizedText,
      slug,
      originType: input.originType,
      lifecycleState,
      quoteLifecycleState: lifecycleState,
      attributionType: resolveRootAttributionType(canonicalLinks),
      attributionLabel: input.sourceEn,
      authorId: canonicalLinks.authorId ?? null,
      authorName: linkMetadata.authorName ?? null,
      bookId: canonicalLinks.bookId ?? null,
      bookTitle: linkMetadata.bookTitle ?? null,
      chapter: input.chapter ?? null,
      page: input.page ?? null,
      section: input.section ?? null,
      year: input.year ?? null,
      language: input.language ?? null,
      originalLanguage: input.originalLanguage ?? null,
      translatedFrom: input.translatedFrom ?? null,
      translationStatus: input.translationStatus ?? null,
      variantOfQuoteId: input.variantOfQuoteId ?? null,
      paraphraseOfQuoteId: input.paraphraseOfQuoteId ?? null,
      disputed: input.disputed === true,
      themes: input.themes ?? [],
      mood: input.mood ?? null,
      concepts: input.concepts ?? [],
      keywords: input.keywords ?? [],
      tags: input.tags ?? [],
      attributionConfidence: input.attributionConfidence ?? null,
      sourceType: input.sourceType ?? provenance.sourceType,
      sourceReference: input.sourceReference ?? input.sourceEn,
      sourceChapterId: null,
      sourceOffset: null,
      isPublic: input.isPublic,
      visibility: input.isPublic ? "public" : "private",
      status: input.status ?? "active",
      provenance,
      anchor: input.readerSource ?? null,
      searchTextNormalized,
      searchTokens,
      createdBy: input.createdBy ?? input.actorUid,
      updatedBy: input.updatedBy ?? input.actorUid,
      createdAt: now,
      updatedAt: now,
      version: 2,
    },
    identityData: {
      canonicalQuoteHash,
      canonicalQuoteId,
      searchTextNormalized,
      bookId: canonicalLinks.bookId ?? null,
      authorId: canonicalLinks.authorId ?? null,
      lifecycleState,
      createdAt: now,
      updatedAt: now,
    },
  };
}

async function createCanonicalQuoteServerSide(
  input: CanonicalQuoteCreateInput
): Promise<{ canonicalQuote: AdminQuoteShape; duplicate: boolean }> {
  const prepared = await prepareCanonicalQuoteWrite(input);
  const duplicateCandidate = await findExistingCanonicalQuote({
    canonicalQuoteHash: prepared.canonicalQuoteHash,
    searchTextNormalized: prepared.searchTextNormalized,
    bookId: prepared.canonicalLinks.bookId,
    authorId: prepared.canonicalLinks.authorId,
  });

  if (duplicateCandidate) {
    const existingSnap = await rootQuoteRef(duplicateCandidate.canonicalQuoteId).get();
    if (!existingSnap.exists) {
      throw new HttpsError("internal", "Duplicate quote identity points to missing root.");
    }

    const existingQuote = mapAdminQuote(existingSnap.data() as DocumentData, existingSnap.id);
    await quoteIdentityRef(prepared.canonicalQuoteHash).set(
      {
        canonicalQuoteHash: prepared.canonicalQuoteHash,
        canonicalQuoteId: existingQuote.canonicalQuoteId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt:
          existingSnap.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return {
      canonicalQuote: existingQuote,
      duplicate: true,
    };
  }

  const canonicalRef = rootQuoteRef(prepared.canonicalQuoteId);

  await db.runTransaction(async (tx) => {
    const identitySnap = await tx.get(quoteIdentityRef(prepared.canonicalQuoteHash));
    const existingCanonicalQuoteId =
      typeof identitySnap.data()?.canonicalQuoteId === "string" &&
      identitySnap.data()?.canonicalQuoteId.trim()
        ? String(identitySnap.data()?.canonicalQuoteId).trim()
        : "";
    if (existingCanonicalQuoteId) {
      return;
    }

    tx.set(canonicalRef, prepared.rootQuoteData);
    tx.set(quoteIdentityRef(prepared.canonicalQuoteHash), prepared.identityData);
  });

  const createdSnap = await canonicalRef.get();
  if (!createdSnap.exists) {
    const duplicateSnap = await quoteIdentityRef(prepared.canonicalQuoteHash).get();
    const recoveredId =
      typeof duplicateSnap.data()?.canonicalQuoteId === "string" &&
      duplicateSnap.data()?.canonicalQuoteId.trim()
        ? String(duplicateSnap.data()?.canonicalQuoteId).trim()
        : "";
    if (!recoveredId) {
      throw new HttpsError("internal", "Quote creation failed.");
    }
    const recoveredSnap = await rootQuoteRef(recoveredId).get();
    if (!recoveredSnap.exists) {
      throw new HttpsError("internal", "Quote recovery failed.");
    }
    return {
      canonicalQuote: mapAdminQuote(recoveredSnap.data() as DocumentData, recoveredSnap.id),
      duplicate: true,
    };
  }

  return {
    canonicalQuote: mapAdminQuote(createdSnap.data() as DocumentData, createdSnap.id),
    duplicate: false,
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

  const rootMatches = await searchQuoteProjection({
    collection: USER_QUOTE_PROJECTION_COLLECTION,
    ownerId,
    ...(bookId ? { bookId } : {}),
    ...(authorId ? { authorId } : {}),
    ...(queryValue ? { query: queryValue } : {}),
    limit,
    publicOnly: false,
  });

  return {
    quotes: rootMatches.map(publicQuotePayload),
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

  const projectionRef =
    ownerId && requesterUid === ownerId
      ? db.collection(USER_QUOTE_PROJECTION_COLLECTION).doc(userQuoteProjectionId(ownerId, quoteId))
      : db.collection(SOCIAL_QUOTE_PROJECTION_COLLECTION).doc(quoteId);
  const snap = await projectionRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Quote not found.");
  }

  const parsed = parseRootQuote(quoteId, snap.data() as DocumentData);
  if (!parsed) {
    logger.error("[QUOTES][DETAILS][INVALID_DOC]", { ownerId, quoteId });
    throw new HttpsError("internal", "Quote payload is invalid.");
  }

  if (!parsed.isPublic && requesterUid !== parsed.ownerId) {
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

  const rootMatches = await searchQuoteProjection({
    collection: bookId ? BOOK_QUOTE_PROJECTION_COLLECTION : SOCIAL_QUOTE_PROJECTION_COLLECTION,
    ...(bookId ? { bookId } : {}),
    ...(authorId ? { authorId } : {}),
    ...(queryValue ? { query: queryValue } : {}),
    limit,
  });

  return {
    quotes: rootMatches.map(publicQuotePayload),
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
    readerSource: normalizeReaderQuoteProvenance(data.readerProvenance),
  };
  const nowIso = new Date().toISOString();
  const { canonicalQuote } = await createCanonicalQuoteServerSide({
    actorUid: uid,
    textEn: rawQuote.textEn,
    textAr: rawQuote.textAr,
    sourceEn: rawQuote.sourceEn,
    sourceAr: rawQuote.sourceAr,
    bookId: rawQuote.bookId,
    authorId: rawQuote.authorId,
    isPublic: rawQuote.isPublic,
    originType: "user_authored",
    readerSource: rawQuote.readerSource,
  });
  await writeUserEntityInteractionDirect(
    db,
    toQuoteInteraction({
      uid,
      quoteId: canonicalQuote.canonicalQuoteId,
      ...(canonicalQuote.bookId ? { bookId: canonicalQuote.bookId } : {}),
      isPublic: canonicalQuote.isPublic,
      occurredAt: nowIso,
    })
  );

  return {
    id: canonicalQuote.canonicalQuoteId,
    canonicalQuoteId: canonicalQuote.canonicalQuoteId,
    ownerId: uid,
    textEn: rawQuote.textEn,
    textAr: rawQuote.textAr,
    sourceEn: rawQuote.sourceEn,
    sourceAr: rawQuote.sourceAr,
    ...(canonicalQuote.bookId ? { bookId: canonicalQuote.bookId } : {}),
    ...(canonicalQuote.authorId ? { authorId: canonicalQuote.authorId } : {}),
    provenance: canonicalQuote.provenance,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
});

export const adminListQuotes = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const limit = Math.min(normalizePageSize(data.limit), 50);
  const queryValue = normalizeQueryValue(data.query);
  const bookId = normalizeOptionalString(data.bookId, "bookId", 180);
  const authorId = normalizeOptionalString(data.authorId, "authorId", 180);
  const status =
    data.status === "archived" || data.status === "active" ? data.status : "all";

  let queryRef: Query = db.collection("quotes");
  if (bookId) {
    queryRef = queryRef.where("bookId", "==", bookId);
  }
  if (authorId) {
    queryRef = queryRef.where("authorId", "==", authorId);
  }
  if (status === "archived") {
    queryRef = queryRef.where("status", "==", "archived");
  }
  if (queryValue) {
    const searchTokens = tokenizeSearchText(queryValue, 8);
    const primaryToken = searchTokens.sort((left, right) => right.length - left.length)[0];
    if (primaryToken) {
      queryRef = queryRef.where("searchTokens", "array-contains", primaryToken);
    }
  }

  const snap = await queryRef.limit(Math.max(limit, 50)).get();
  const items = snap.docs
    .map((docSnap) => mapAdminQuote(docSnap.data(), docSnap.id))
    .filter((quote) =>
      status === "all"
        ? true
        : status === "active"
          ? quote.status !== "archived"
          : quote.status === "archived"
    )
    .filter((quote) =>
      queryValue
        ? quote.normalizedText.includes(queryValue) ||
          quote.canonicalText.toLowerCase().includes(queryValue) ||
          (quote.authorName || "").toLowerCase().includes(queryValue) ||
          (quote.bookTitle || "").toLowerCase().includes(queryValue)
        : true
    )
    .sort((left, right) =>
      (right.updatedAt || right.createdAt || "").localeCompare(
        left.updatedAt || left.createdAt || ""
      )
    )
    .slice(0, limit);

  return {
    quotes: items,
  };
});

export const adminGetQuote = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const quoteId = normalizeRequiredString(data.quoteId, "quoteId", 180);
  const snap = await rootQuoteRef(quoteId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Quote not found.");
  }

  return {
    quote: mapAdminQuote(snap.data() as DocumentData, snap.id),
  };
});

export const adminQuoteCreate = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const bookId = normalizeOptionalString(data.bookId, "bookId", 180);
  const authorId = normalizeOptionalString(data.authorId, "authorId", 180);
  if (!bookId && !authorId) {
    throw new HttpsError(
      "invalid-argument",
      "Canonical quotes require bookId or authorId."
    );
  }
  const { canonicalQuote, duplicate } = await createCanonicalQuoteServerSide({
    actorUid: caller.uid,
    textEn: normalizeRequiredString(data.textEn, "textEn", QUOTE_TEXT_MAX),
    textAr: normalizeRequiredString(data.textAr, "textAr", QUOTE_TEXT_MAX),
    sourceEn: normalizeRequiredString(data.sourceEn, "sourceEn", QUOTE_SOURCE_MAX),
    sourceAr: normalizeRequiredString(data.sourceAr, "sourceAr", QUOTE_SOURCE_MAX),
    bookId,
    authorId,
    isPublic: data.isPublic === undefined ? true : data.isPublic === true,
    originType: "user_authored",
    createdBy: caller.uid,
    updatedBy: caller.uid,
    status: "active",
    chapter: normalizeOptionalString(data.chapter, "chapter", 120),
    page: normalizeOptionalInteger(data.page, "page", 1, 200_000),
    section: normalizeOptionalString(data.section, "section", 120),
    year: normalizeOptionalInteger(data.year, "year", 0, 4000),
    language: normalizeOptionalString(data.language, "language", 16),
    originalLanguage: normalizeOptionalString(data.originalLanguage, "originalLanguage", 16),
    translatedFrom: normalizeOptionalString(data.translatedFrom, "translatedFrom", 16),
    translationStatus: normalizeOptionalString(data.translationStatus, "translationStatus", 40),
    themes: normalizeStringArray(data.themes, 20),
    mood: normalizeOptionalString(data.mood, "mood", 80),
    concepts: normalizeStringArray(data.concepts, 20),
    keywords: normalizeStringArray(data.keywords, 20),
    attributionConfidence: normalizeOptionalConfidence(data.attributionConfidence),
    sourceType: normalizeOptionalString(data.sourceType, "sourceType", 80),
    sourceReference: normalizeOptionalString(data.sourceReference, "sourceReference", 240),
    lifecycleState: normalizeQuoteLifecycleState(data.lifecycleState),
    variantOfQuoteId: normalizeOptionalString(data.variantOfQuoteId, "variantOfQuoteId", 180),
    paraphraseOfQuoteId: normalizeOptionalString(data.paraphraseOfQuoteId, "paraphraseOfQuoteId", 180),
    disputed: data.disputed === true,
  });

  return {
    quote: canonicalQuote,
    duplicate,
  };
});

export const adminQuoteUpdate = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const quoteId = normalizeRequiredString(data.quoteId, "quoteId", 180);
  const existingSnap = await rootQuoteRef(quoteId).get();
  if (!existingSnap.exists) {
    throw new HttpsError("not-found", "Quote not found.");
  }

  const existing = mapAdminQuote(existingSnap.data() as DocumentData, existingSnap.id);
  const nextTextEn = normalizeRequiredString(
    data.textEn ?? existing.textEn,
    "textEn",
    QUOTE_TEXT_MAX
  );
  const nextTextAr = normalizeStringAllowEmpty(
    data.textAr ?? existing.textAr,
    "textAr",
    QUOTE_TEXT_MAX
  );
  const nextSourceEn = normalizeRequiredString(
    data.sourceEn ?? existing.sourceEn,
    "sourceEn",
    QUOTE_SOURCE_MAX
  );
  const nextSourceAr = normalizeStringAllowEmpty(
    data.sourceAr ?? existing.sourceAr,
    "sourceAr",
    QUOTE_SOURCE_MAX
  );
  const canonicalLinks = await resolveCanonicalQuoteLinks({
    bookId: normalizeOptionalString(data.bookId ?? existing.bookId, "bookId", 180),
    authorId: normalizeOptionalString(data.authorId ?? existing.authorId, "authorId", 180),
  });
  const searchTextNormalized = normalizeQuoteSearchText([
    nextTextEn,
    nextTextAr,
    nextSourceEn,
    nextSourceAr,
  ]);
  const canonicalQuoteHash = buildCanonicalQuoteHash({
    bookId: canonicalLinks.bookId,
    authorId: canonicalLinks.authorId,
    textEn: nextTextEn,
    textAr: nextTextAr,
    sourceEn: nextSourceEn,
    sourceAr: nextSourceAr,
  });
  const duplicate = await findExistingCanonicalQuote({
    canonicalQuoteHash,
    searchTextNormalized,
    bookId: canonicalLinks.bookId,
    authorId: canonicalLinks.authorId,
  });
  if (duplicate && duplicate.canonicalQuoteId !== quoteId) {
    throw new HttpsError("already-exists", "A canonical duplicate quote already exists.");
  }

  const linkMetadata = await resolveQuoteDisplayMetadata(canonicalLinks);
  const provenance = buildQuoteProvenance({
    bookId: canonicalLinks.bookId,
    authorId: canonicalLinks.authorId,
  });
  const searchTokens = tokenizeSearchText(searchTextNormalized, 40);
  const nextStatus =
    data.status === "archived" || existing.status === "archived" ? "archived" : "active";
  const nextVariantOfQuoteId =
    normalizeOptionalString(data.variantOfQuoteId ?? existing.variantOfQuoteId, "variantOfQuoteId", 180);
  const nextParaphraseOfQuoteId =
    normalizeOptionalString(data.paraphraseOfQuoteId ?? existing.paraphraseOfQuoteId, "paraphraseOfQuoteId", 180);
  const nextDisputed =
    data.disputed === undefined ? existing.disputed === true : data.disputed === true;
  const nextLifecycleState = resolveQuoteLifecycleState({
    explicit: normalizeQuoteLifecycleState(data.lifecycleState ?? existing.lifecycleState),
    status: nextStatus,
    translationStatus:
      normalizeOptionalString(data.translationStatus ?? existing.translationStatus, "translationStatus", 40),
    translatedFrom:
      normalizeOptionalString(data.translatedFrom ?? existing.translatedFrom, "translatedFrom", 16),
    variantOfQuoteId: nextVariantOfQuoteId,
    paraphraseOfQuoteId: nextParaphraseOfQuoteId,
    disputed: nextDisputed,
  });
  const updatePayload = {
    canonicalQuoteId: quoteId,
    canonicalQuoteHash,
    textEn: nextTextEn,
    textAr: nextTextAr,
    sourceEn: nextSourceEn,
    sourceAr: nextSourceAr,
    canonicalText: nextTextEn || nextTextAr,
    normalizedText: normalizeSearchText(nextTextEn || nextTextAr),
    slug:
      slugifyQuoteValue(nextTextEn || nextTextAr) ||
      existing.slug ||
      quoteId,
    authorId: canonicalLinks.authorId ?? null,
    authorName: linkMetadata.authorName ?? null,
    bookId: canonicalLinks.bookId ?? null,
    bookTitle: linkMetadata.bookTitle ?? null,
    chapter: normalizeOptionalString(data.chapter ?? existing.chapter, "chapter", 120) ?? null,
    page:
      normalizeOptionalInteger(data.page ?? existing.page, "page", 1, 200_000) ?? null,
    section:
      normalizeOptionalString(data.section ?? existing.section, "section", 120) ?? null,
    year:
      normalizeOptionalInteger(data.year ?? existing.year, "year", 0, 4000) ?? null,
    language:
      normalizeOptionalString(data.language ?? existing.language, "language", 16) ?? null,
    originalLanguage:
      normalizeOptionalString(
        data.originalLanguage ?? existing.originalLanguage,
        "originalLanguage",
        16
      ) ?? null,
    translatedFrom:
      normalizeOptionalString(
        data.translatedFrom ?? existing.translatedFrom,
        "translatedFrom",
        16
      ) ?? null,
    translationStatus:
      normalizeOptionalString(
        data.translationStatus ?? existing.translationStatus,
        "translationStatus",
        40
      ) ?? null,
    lifecycleState: nextLifecycleState,
    quoteLifecycleState: nextLifecycleState,
    variantOfQuoteId: nextVariantOfQuoteId ?? null,
    paraphraseOfQuoteId: nextParaphraseOfQuoteId ?? null,
    disputed: nextDisputed,
    themes: normalizeStringArray(data.themes ?? existing.themes, 20),
    mood: normalizeOptionalString(data.mood ?? existing.mood, "mood", 80) ?? null,
    concepts: normalizeStringArray(data.concepts ?? existing.concepts, 20),
    keywords: normalizeStringArray(data.keywords ?? existing.keywords, 20),
    attributionConfidence:
      normalizeOptionalConfidence(
        data.attributionConfidence ?? existing.attributionConfidence
      ) ?? null,
    sourceType:
      normalizeOptionalString(data.sourceType ?? existing.sourceType, "sourceType", 80) ??
      provenance.sourceType,
    sourceReference:
      normalizeOptionalString(
        data.sourceReference ?? existing.sourceReference,
        "sourceReference",
        240
      ) ?? nextSourceEn,
    attributionType: resolveRootAttributionType(canonicalLinks),
    attributionLabel: nextSourceEn,
    provenance,
    searchTextNormalized,
    searchTokens,
    isPublic: data.isPublic === undefined ? existing.isPublic : data.isPublic === true,
    status: nextStatus,
    updatedBy: caller.uid,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.runTransaction(async (tx) => {
    const existingRoot = await tx.get(rootQuoteRef(quoteId));
    if (!existingRoot.exists) {
      throw new HttpsError("not-found", "Quote not found.");
    }

    const previousHash =
      typeof existingRoot.data()?.canonicalQuoteHash === "string" &&
      existingRoot.data()?.canonicalQuoteHash.trim()
        ? String(existingRoot.data()?.canonicalQuoteHash).trim()
        : "";
    if (previousHash && previousHash !== canonicalQuoteHash) {
      tx.delete(quoteIdentityRef(previousHash));
    }

    tx.set(rootQuoteRef(quoteId), updatePayload, { merge: true });
    tx.set(
      quoteIdentityRef(canonicalQuoteHash),
      {
        canonicalQuoteHash,
        canonicalQuoteId: quoteId,
        searchTextNormalized,
        bookId: canonicalLinks.bookId ?? null,
        authorId: canonicalLinks.authorId ?? null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt:
          existingRoot.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const legacyQuoteId =
      typeof existingRoot.data()?.legacyQuoteId === "string" &&
      existingRoot.data()?.legacyQuoteId.trim()
        ? String(existingRoot.data()?.legacyQuoteId).trim()
        : "";
    const ownerId =
      typeof existingRoot.data()?.ownerId === "string" &&
      existingRoot.data()?.ownerId.trim()
        ? String(existingRoot.data()?.ownerId).trim()
        : "";
    if (legacyQuoteId && ownerId) {
      tx.set(
        quoteDocRef(ownerId, legacyQuoteId),
        {
          textEn: nextTextEn,
          textAr: nextTextAr,
          sourceEn: nextSourceEn,
          sourceAr: nextSourceAr,
          ...(canonicalLinks.bookId ? { bookId: canonicalLinks.bookId } : { bookId: null }),
          ...(canonicalLinks.authorId ? { authorId: canonicalLinks.authorId } : { authorId: null }),
          provenance,
          searchTextNormalized,
          searchTokens,
          isPublic: updatePayload.isPublic,
          status: nextStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  const updatedSnap = await rootQuoteRef(quoteId).get();
  return {
    quote: mapAdminQuote(updatedSnap.data() as DocumentData, updatedSnap.id),
  };
});

export const adminQuoteArchive = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const quoteId = normalizeRequiredString(data.quoteId, "quoteId", 180);
  await db.runTransaction(async (tx) => {
    const rootSnap = await tx.get(rootQuoteRef(quoteId));
    if (!rootSnap.exists) {
      throw new HttpsError("not-found", "Quote not found.");
    }

    tx.set(
      rootQuoteRef(quoteId),
      {
        status: "archived",
        isPublic: false,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        archivedBy: caller.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: caller.uid,
      },
      { merge: true }
    );

    const legacyQuoteId =
      typeof rootSnap.data()?.legacyQuoteId === "string" &&
      rootSnap.data()?.legacyQuoteId.trim()
        ? String(rootSnap.data()?.legacyQuoteId).trim()
        : "";
    const ownerId =
      typeof rootSnap.data()?.ownerId === "string" &&
      rootSnap.data()?.ownerId.trim()
        ? String(rootSnap.data()?.ownerId).trim()
        : "";
    if (legacyQuoteId && ownerId) {
      tx.set(
        quoteDocRef(ownerId, legacyQuoteId),
        {
          status: "archived",
          isPublic: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  });

  return {
    archived: true,
    quoteId,
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

  const sourceSnap = await db.collection(SOCIAL_QUOTE_PROJECTION_COLLECTION).doc(sourceQuoteId).get();
  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", "Source quote not found.");
  }

  const sourceQuote = parseRootQuote(sourceQuoteId, sourceSnap.data() as DocumentData);

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

  const nowIso = new Date().toISOString();
  const { canonicalQuote, duplicate } = await createCanonicalQuoteServerSide({
    actorUid: uid,
    textEn: sourceQuote.textEn,
    textAr: sourceQuote.textAr,
    sourceEn: sourceQuote.sourceEn,
    sourceAr: sourceQuote.sourceAr,
    bookId: sourceQuote.bookId,
    authorId: sourceQuote.authorId,
    isPublic: true,
    originType: "saved_reference",
    savedFromOwnerId: sourceOwnerId,
    savedFromQuoteId: sourceQuoteId,
  });
  await writeUserEntityInteractionDirect(
    db,
    toQuoteInteraction({
      uid,
      quoteId: canonicalQuote.canonicalQuoteId,
      ...(canonicalQuote.bookId ? { bookId: canonicalQuote.bookId } : {}),
      isPublic: canonicalQuote.isPublic,
      occurredAt: nowIso,
      idempotencyKey: `save_reference:${sourceOwnerId}:${sourceQuoteId}`,
    })
  );

  return {
    quote: {
      id: canonicalQuote.canonicalQuoteId,
      canonicalQuoteId: canonicalQuote.canonicalQuoteId,
      ownerId: uid,
      textEn: sourceQuote.textEn,
      textAr: sourceQuote.textAr,
      sourceEn: sourceQuote.sourceEn,
      sourceAr: sourceQuote.sourceAr,
      ...(sourceQuote.bookId ? { bookId: sourceQuote.bookId } : {}),
      ...(sourceQuote.authorId ? { authorId: sourceQuote.authorId } : {}),
      provenance: canonicalQuote.provenance,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    alreadySaved: duplicate,
  };
});
