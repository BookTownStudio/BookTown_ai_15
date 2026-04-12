import { FieldValue, Transaction } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { v4 as uuidv4 } from "uuid";

import { admin } from "../firebaseAdmin";
import {
  buildRawAuthorFromBookPayload,
  materializeCanonicalAuthorInTransaction,
} from "./authors/authorCatalog";
import { resolveAuthorProviderPayload } from "./authors/providerSources";
import { buildCanonicalKey } from "./persistence/canonicalKey";
import { buildBookSearchPatch, buildEditionSearchPatch } from "./search/searchIndexing";

const db = admin.firestore();

export type BookAuthorityState = "canonical" | "provisional";

export type LiteraryAuthoritySource =
  | "booktown_canonical"
  | "canonical_seed"
  | "googleBooks"
  | "goodreads_import"
  | "openLibrary"
  | "user_upload";

type IdentityType =
  | "isbn13"
  | "isbn10"
  | "canonical"
  | "provider"
  | "source";

type IdentityRecord = {
  identityKey: string;
  identityType: IdentityType;
  value: string;
  precedence: number;
  bookId: string;
  createdAt?: FirebaseFirestore.FieldValue;
  updatedAt: FirebaseFirestore.FieldValue;
};

type CoverJobStatus =
  | "AWAITING_UPLOAD"
  | "PENDING"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "FAILED_RETRYABLE"
  | "FAILED_FATAL"
  | "COMPLETED";

export type MaterializeBookAuthorityParams = {
  tx: Transaction;
  source: LiteraryAuthoritySource;
  authorityStatus: BookAuthorityState;
  preferredBookId?: string;
  providerExternalId?: string | null;
  rawBook: Record<string, unknown>;
  searchedPhrase?: string | null;
  allowIdentityReuse?: boolean;
  extraIdentityKeys?: string[];
  createEdition?: boolean;
  explicitEditionId?: string | null;
  ingestionKey?: string | null;
  coverCandidates?: string[];
  coverJobStatus?: CoverJobStatus;
  coverJobMaxAttempts?: number;
  literaryAuthorityClass?: string | null;
};

export type MaterializeBookAuthorityResult = {
  canonicalBookId: string;
  bookId: string;
  editionId: string | null;
  status: "CREATED" | "MERGED" | "ALREADY_COMPLETE";
  authorityStatus: BookAuthorityState;
  canonicalKey: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueStrings(values: readonly string[], max = 40): string[] {
  const dedup = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    dedup.add(normalized);
    if (dedup.size >= max) break;
  }
  return Array.from(dedup);
}

function normalizeIsbn(value: unknown, length: 10 | 13): string {
  if (typeof value !== "string") return "";
  const digits = value.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (length === 10) {
    return /^\d{9}[\dX]$/.test(digits) ? digits : "";
  }
  return /^\d{13}$/.test(digits) ? digits : "";
}

function normalizeSourceIdentityValue(source: string, providerExternalId: string): string {
  if (source === "googleBooks") {
    return providerExternalId.replace(/^gb_/i, "").trim();
  }

  if (source === "openLibrary") {
    return providerExternalId
      .replace(/^ol_/i, "")
      .replace(/^\/works\//i, "")
      .replace(/^\/books\//i, "")
      .trim();
  }

  return providerExternalId.trim();
}

function extractPrimaryTitle(rawBook: Record<string, unknown>): string {
  return (
    asNonEmptyString(rawBook.title) ||
    asNonEmptyString(rawBook.titleEn) ||
    asNonEmptyString(rawBook.titleAr) ||
    "Untitled"
  );
}

function extractAuthors(rawBook: Record<string, unknown>): string[] {
  const arrayAuthors = uniqueStrings([
    ...asStringArray(rawBook.authors),
    ...asStringArray(rawBook.author_name),
  ]);

  if (arrayAuthors.length > 0) {
    return arrayAuthors;
  }

  const fallback = uniqueStrings([
    asNonEmptyString(rawBook.author),
    asNonEmptyString(rawBook.authorEn),
    asNonEmptyString(rawBook.authorAr),
  ]);

  return fallback.length > 0 ? fallback : ["Unknown"];
}

function extractLanguage(rawBook: Record<string, unknown>): string {
  const direct = asNonEmptyString(rawBook.language);
  if (direct) return direct.toLowerCase();

  const candidates = uniqueStrings([
    ...asStringArray(rawBook.languages),
    ...asStringArray(rawBook.language_code),
  ]);
  return (candidates[0] || "en").toLowerCase();
}

function extractIsbns(rawBook: Record<string, unknown>): {
  isbn13: string;
  isbn10: string;
} {
  const directIsbn13 = normalizeIsbn(rawBook.isbn13, 13);
  const directIsbn10 = normalizeIsbn(rawBook.isbn10, 10);
  if (directIsbn13 || directIsbn10) {
    return { isbn13: directIsbn13, isbn10: directIsbn10 };
  }

  const fromIndustryIds = Array.isArray(rawBook.industryIdentifiers)
    ? rawBook.industryIdentifiers
    : [];

  let isbn13 = "";
  let isbn10 = "";

  for (const entry of fromIndustryIds) {
    const record = asRecord(entry);
    if (!record) continue;
    const type = asNonEmptyString(record.type).toUpperCase();
    const identifier = asNonEmptyString(record.identifier);
    if (!type || !identifier) continue;
    if (!isbn13 && type.includes("ISBN_13")) {
      isbn13 = normalizeIsbn(identifier, 13);
    }
    if (!isbn10 && type.includes("ISBN_10")) {
      isbn10 = normalizeIsbn(identifier, 10);
    }
    if (isbn13 && isbn10) break;
  }

  if (isbn13 || isbn10) {
    return { isbn13, isbn10 };
  }

  const isbnCandidates = asStringArray(rawBook.isbn);
  for (const candidate of isbnCandidates) {
    if (!isbn13) isbn13 = normalizeIsbn(candidate, 13);
    if (!isbn10) isbn10 = normalizeIsbn(candidate, 10);
    if (isbn13 && isbn10) break;
  }

  return { isbn13, isbn10 };
}

function resolvePublicationYear(rawBook: Record<string, unknown>): number | null {
  const directNumber = rawBook.publicationYear;
  if (typeof directNumber === "number" && Number.isFinite(directNumber)) {
    return Math.trunc(directNumber);
  }

  const explicit = asNonEmptyString(rawBook.publicationYear);
  if (explicit && /^\d{4}$/.test(explicit)) {
    return Number(explicit);
  }

  const firstPublishYear = rawBook.firstPublishYear;
  if (typeof firstPublishYear === "number" && Number.isFinite(firstPublishYear)) {
    return Math.trunc(firstPublishYear);
  }

  const publishedDate = asNonEmptyString(rawBook.publishedDate);
  if (publishedDate && /^\d{4}/.test(publishedDate)) {
    return Number(publishedDate.slice(0, 4));
  }

  return null;
}

function resolveDescription(rawBook: Record<string, unknown>): string {
  return (
    asNonEmptyString(rawBook.description) ||
    asNonEmptyString(rawBook.descriptionEn) ||
    asNonEmptyString(rawBook.summary) ||
    ""
  );
}

function resolveTitleAuthorities(rawBook: Record<string, unknown>): string[] {
  return uniqueStrings([
    asNonEmptyString(rawBook.title),
    asNonEmptyString(rawBook.titleEn),
    asNonEmptyString(rawBook.titleAr),
    ...asStringArray(rawBook.aliases),
    ...asStringArray(rawBook.titleAliases),
    ...asStringArray(rawBook.alternateTitles),
    ...asStringArray(rawBook.otherTitles),
  ]);
}

function buildCanonicalKeys(rawBook: Record<string, unknown>, primaryAuthor: string): string[] {
  const titleAuthorities = resolveTitleAuthorities(rawBook);
  const primaryTitle = extractPrimaryTitle(rawBook);
  return uniqueStrings([
    buildCanonicalKey({ title: primaryTitle, author: primaryAuthor }),
    ...titleAuthorities.map((title) => buildCanonicalKey({ title, author: primaryAuthor })),
  ], 12);
}

function toAuthorityFields(params: {
  requestedAuthorityStatus: BookAuthorityState;
  existingBook: Record<string, unknown> | null;
  literaryAuthorityClass: string;
}): {
  authorityStatus: BookAuthorityState;
  workType: string;
  sourcePriority: string;
  literaryAuthorityClass: string;
  canonicalLocked: boolean;
} {
  const existingAuthorityStatus = asNonEmptyString(params.existingBook?.authorityStatus);
  const existingWorkType = asNonEmptyString(params.existingBook?.workType);
  const existingCanonicalLocked = params.existingBook?.canonicalLocked === true;
  const keepCanonical =
    existingAuthorityStatus === "canonical" ||
    existingWorkType === "canonical" ||
    existingCanonicalLocked;

  const authorityStatus: BookAuthorityState = keepCanonical
    ? "canonical"
    : params.requestedAuthorityStatus;

  if (authorityStatus === "canonical") {
    return {
      authorityStatus,
      workType: "canonical",
      sourcePriority: "canonical",
      literaryAuthorityClass:
        asNonEmptyString(params.existingBook?.literaryAuthorityClass) ||
        params.literaryAuthorityClass ||
        "classic_work",
      canonicalLocked: true,
    };
  }

  return {
    authorityStatus,
    workType: "provisional",
    sourcePriority: "provisional",
    literaryAuthorityClass:
      asNonEmptyString(params.existingBook?.literaryAuthorityClass) ||
      params.literaryAuthorityClass ||
      "standard_work",
    canonicalLocked: false,
  };
}

function buildIdentityCandidates(params: {
  allowIdentityReuse: boolean;
  source: LiteraryAuthoritySource;
  providerExternalId: string;
  canonicalKeys: string[];
  isbn13: string;
  isbn10: string;
  extraIdentityKeys: string[];
}): Array<{
  key: string;
  type: IdentityType;
  value: string;
  precedence: number;
}> {
  const entries: Array<{
    key: string;
    type: IdentityType;
    value: string;
    precedence: number;
  }> = [];

  const add = (
    key: string,
    type: IdentityType,
    value: string,
    precedence: number
  ): void => {
    if (!key || !value) return;
    if (entries.some((entry) => entry.key === key)) return;
    entries.push({ key, type, value, precedence });
  };

  if (params.allowIdentityReuse) {
    if (params.isbn13) {
      add(`isbn13:${params.isbn13}`, "isbn13", params.isbn13, 1);
    }
    if (params.isbn10) {
      add(`isbn10:${params.isbn10}`, "isbn10", params.isbn10, 2);
    }
    params.canonicalKeys.forEach((canonicalKey, index) => {
      add(`canonical:${canonicalKey}`, "canonical", canonicalKey, 10 + index);
    });
  }

  if (params.providerExternalId) {
    const normalizedProviderId = normalizeSourceIdentityValue(
      params.source,
      params.providerExternalId
    );
    add(
      `provider:${params.source}:${normalizedProviderId}`,
      "provider",
      `${params.source}:${normalizedProviderId}`,
      50
    );
  }

  params.extraIdentityKeys.forEach((identityKey, index) => {
    add(identityKey, "source", identityKey, 100 + index);
  });

  return entries;
}

function isReusableAuthorityBook(data: Record<string, unknown>): boolean {
  const source = asNonEmptyString(data.source);
  return source !== "user_upload";
}

function scoreExistingBook(data: Record<string, unknown>): number {
  let score = 0;
  if (asNonEmptyString(data.authorityStatus) === "canonical") score += 100;
  if (asNonEmptyString(data.workType) === "canonical") score += 50;
  if (data.canonicalLocked === true) score += 20;
  if (asNonEmptyString(data.sourcePriority) === "canonical") score += 10;
  return score;
}

async function findExistingBooksByQuery(params: {
  tx: Transaction;
  field: string;
  value: string;
}): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  if (!params.value) return [];
  const booksCollection = db.collection("books") as FirebaseFirestore.CollectionReference &
    Partial<{
      where: (
        fieldPath: string,
        opStr: FirebaseFirestore.WhereFilterOp,
        value: unknown
      ) => FirebaseFirestore.Query;
    }>;
  if (typeof booksCollection.where !== "function") {
    return [];
  }

  const snap = await params.tx.get(
    booksCollection.where(params.field, "==", params.value).limit(4)
  );
  return snap.docs.filter((doc) => isReusableAuthorityBook((doc.data() || {}) as Record<string, unknown>));
}

async function resolveExistingBookByFields(params: {
  tx: Transaction;
  canonicalKeys: string[];
  isbn13: string;
  isbn10: string;
}): Promise<string> {
  const candidates = new Map<string, Record<string, unknown>>();
  const queries = [
    ...(params.isbn13 ? [{ field: "isbn13", value: params.isbn13 }] : []),
    ...(params.isbn10 ? [{ field: "isbn10", value: params.isbn10 }] : []),
    ...params.canonicalKeys.slice(0, 6).map((canonicalKey) => ({
      field: "canonicalKey",
      value: canonicalKey,
    })),
  ];

  for (const query of queries) {
    const docs = await findExistingBooksByQuery({
      tx: params.tx,
      field: query.field,
      value: query.value,
    });
    for (const doc of docs) {
      candidates.set(doc.id, (doc.data() || {}) as Record<string, unknown>);
    }
  }

  let bestId = "";
  let bestScore = -1;
  for (const [bookId, data] of candidates.entries()) {
    const score = scoreExistingBook(data);
    if (score > bestScore) {
      bestScore = score;
      bestId = bookId;
    }
  }

  return bestId;
}

function buildRawAuthorPayload(params: {
  source: LiteraryAuthoritySource;
  rawBook: Record<string, unknown>;
  primaryAuthor: string;
}): {
  source: "booktown" | "googleBooks" | "openLibrary";
  providerExternalId?: string;
  rawAuthor: Record<string, unknown>;
} {
  if (params.source === "googleBooks" || params.source === "openLibrary") {
    const built = buildRawAuthorFromBookPayload({
      source: params.source,
      rawBook: params.rawBook,
      primaryAuthor: params.primaryAuthor,
    });

    return {
      source: params.source,
      providerExternalId: built.providerExternalId,
      rawAuthor: built.rawAuthor,
    };
  }

  return {
    source: "booktown",
    rawAuthor: {
      name: asNonEmptyString(params.rawBook.author) || params.primaryAuthor,
      nameEn: asNonEmptyString(params.rawBook.authorEn) || params.primaryAuthor,
      nameAr: asNonEmptyString(params.rawBook.authorAr),
      aliases: uniqueStrings([
        ...asStringArray(params.rawBook.authors),
        asNonEmptyString(params.rawBook.author),
        asNonEmptyString(params.rawBook.authorEn),
        asNonEmptyString(params.rawBook.authorAr),
      ]),
    },
  };
}

function resolveCoverState(params: {
  existingBook: Record<string, unknown> | null;
  coverCandidates: string[];
  coverJobStatus: CoverJobStatus | undefined;
}): string {
  const existingState =
    asNonEmptyString(params.existingBook?.coverState) ||
    asNonEmptyString(asRecord(params.existingBook?.cover)?.state);

  if (existingState === "READY") {
    return "READY";
  }

  if (params.coverJobStatus === "AWAITING_UPLOAD") {
    return "PENDING";
  }

  if (params.coverCandidates.length > 0) {
    return "PENDING";
  }

  return existingState || "FAILED";
}

function resolveEditionId(params: {
  explicitEditionId?: string | null;
  source: LiteraryAuthoritySource;
  providerExternalId: string;
  bookId: string;
  shouldCreateEdition: boolean;
}): string | null {
  if (!params.shouldCreateEdition) {
    return null;
  }

  if (params.explicitEditionId) {
    return params.explicitEditionId;
  }

  if (
    (params.source === "googleBooks" || params.source === "openLibrary") &&
    params.providerExternalId
  ) {
    const externalId = normalizeSourceIdentityValue(params.source, params.providerExternalId);
    return `${params.source}:${externalId}`;
  }

  if (params.source === "user_upload") {
    return `uploaded:${params.bookId}`;
  }

  if (params.source === "goodreads_import") {
    return `goodreads:${params.bookId}`;
  }

  if (params.source === "booktown_canonical" || params.source === "canonical_seed") {
    return `canonical:${params.bookId}`;
  }

  return null;
}

async function materializeCanonicalAuthor(params: {
  tx: Transaction;
  source: LiteraryAuthoritySource;
  rawBook: Record<string, unknown>;
  primaryAuthor: string;
}): Promise<{
  authorId: string;
  canonicalKey: string;
}> {
  const authorInput = buildRawAuthorPayload(params);
  const rawAuthor =
    authorInput.source === "googleBooks" || authorInput.source === "openLibrary"
      ? await resolveAuthorProviderPayload({
          source: authorInput.source,
          providerExternalId: authorInput.providerExternalId,
          rawAuthor: authorInput.rawAuthor,
        })
      : authorInput.rawAuthor;

  const canonicalAuthor = await materializeCanonicalAuthorInTransaction({
    tx: params.tx,
    source: authorInput.source,
    providerExternalId: authorInput.providerExternalId,
    rawAuthor,
  });

  return {
    authorId: canonicalAuthor.authorId,
    canonicalKey: canonicalAuthor.canonicalKey,
  };
}

export async function materializeBookAuthority(
  params: Omit<MaterializeBookAuthorityParams, "tx">
): Promise<MaterializeBookAuthorityResult> {
  return db.runTransaction(async (tx) =>
    materializeBookAuthorityInTransaction({
      ...params,
      tx,
    })
  );
}

export async function materializeBookAuthorityInTransaction(
  params: MaterializeBookAuthorityParams
): Promise<MaterializeBookAuthorityResult> {
  const rawBook = params.rawBook || {};
  const title = extractPrimaryTitle(rawBook);
  const authors = extractAuthors(rawBook);
  const primaryAuthor = authors[0] || "Unknown";
  const canonicalKeys = buildCanonicalKeys(rawBook, primaryAuthor);
  const canonicalKey = canonicalKeys[0] || buildCanonicalKey({ title, author: primaryAuthor });
  const { isbn13, isbn10 } = extractIsbns(rawBook);
  const providerExternalId = asNonEmptyString(params.providerExternalId);
  const allowIdentityReuse = params.allowIdentityReuse !== false;
  const coverCandidates = uniqueStrings(params.coverCandidates || [], 30);
  const identityCandidates = buildIdentityCandidates({
    allowIdentityReuse,
    source: params.source,
    providerExternalId,
    canonicalKeys,
    isbn13,
    isbn10,
    extraIdentityKeys: uniqueStrings(params.extraIdentityKeys || [], 20),
  });

  let resolvedBookId = "";
  const conflictingBookIds = new Set<string>();
  const identitySnapshotsByKey = new Map<
    string,
    FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
  >();

  if (allowIdentityReuse) {
    for (const candidate of identityCandidates) {
      const identityRef = db.collection("book_identity").doc(candidate.key);
      const identitySnap = await params.tx.get(identityRef);
      identitySnapshotsByKey.set(candidate.key, identitySnap);
      const mappedBookId = asNonEmptyString(identitySnap.data()?.bookId);
      if (!mappedBookId) continue;
      conflictingBookIds.add(mappedBookId);
      if (!resolvedBookId) {
        resolvedBookId = mappedBookId;
      }
    }

    if (!resolvedBookId) {
      resolvedBookId = await resolveExistingBookByFields({
        tx: params.tx,
        canonicalKeys,
        isbn13,
        isbn10,
      });
    }
  }

  const bookId = resolvedBookId || params.preferredBookId || uuidv4();
  const bookRef = db.collection("books").doc(bookId);
  const bookSnap = await params.tx.get(bookRef);
  const existingBook = (bookSnap.data() || null) as Record<string, unknown> | null;
  const coverJobRef = db.collection("cover_jobs").doc(bookId);
  const coverJobSnap = await params.tx.get(coverJobRef);
  const existingCoverJob = (coverJobSnap.data() || {}) as Record<string, unknown>;
  const author = await materializeCanonicalAuthor({
    tx: params.tx,
    source: params.source,
    rawBook,
    primaryAuthor,
  });

  const authorityFields = toAuthorityFields({
    requestedAuthorityStatus: params.authorityStatus,
    existingBook,
    literaryAuthorityClass: asNonEmptyString(params.literaryAuthorityClass),
  });

  const now = FieldValue.serverTimestamp();
  const titleEn = asNonEmptyString(rawBook.titleEn) || title;
  const titleAr = asNonEmptyString(rawBook.titleAr);
  const authorEn = asNonEmptyString(rawBook.authorEn) || primaryAuthor;
  const authorAr = asNonEmptyString(rawBook.authorAr);
  const description = resolveDescription(rawBook);
  const descriptionEn = asNonEmptyString(rawBook.descriptionEn) || description;
  const descriptionAr = asNonEmptyString(rawBook.descriptionAr);
  const language = extractLanguage(rawBook);
  const publicationYear = resolvePublicationYear(rawBook);
  const rightsMode =
    asNonEmptyString(rawBook.rightsMode) ||
    asNonEmptyString(existingBook?.rightsMode) ||
    (params.source === "user_upload" ? "private" : "public_free");
  const visibility =
    asNonEmptyString(rawBook.visibility) ||
    asNonEmptyString(existingBook?.visibility) ||
    (params.source === "user_upload" ? "private" : "public");
  const publicationState =
    asNonEmptyString(rawBook.publicationState) ||
    asNonEmptyString(existingBook?.publicationState) ||
    (params.source === "user_upload" ? "uploaded" : "published");
  const coverState = resolveCoverState({
    existingBook,
    coverCandidates,
    coverJobStatus: params.coverJobStatus,
  });
  const providerExternalIds = uniqueStrings([
    ...asStringArray(existingBook?.providerExternalIds),
    ...(providerExternalId && (params.source === "googleBooks" || params.source === "openLibrary")
      ? [`${params.source}:${normalizeSourceIdentityValue(params.source, providerExternalId)}`]
      : []),
    ...asStringArray(rawBook.providerExternalIds),
  ], 20);
  const externalReadableSources = Array.isArray(rawBook.externalReadableSources)
    ? rawBook.externalReadableSources
    : Array.isArray(existingBook?.externalReadableSources)
      ? existingBook?.externalReadableSources
      : [];

  const bookBase: Record<string, unknown> = {
    id: bookId,
    bookId,
    source: asNonEmptyString(existingBook?.source) || params.source,
    authorityStatus: authorityFields.authorityStatus,
    sourcePriority: authorityFields.sourcePriority,
    workType: authorityFields.workType,
    literaryAuthorityClass: authorityFields.literaryAuthorityClass,
    canonicalLocked: authorityFields.canonicalLocked,
    title,
    titleEn,
    titleAr,
    author: primaryAuthor,
    authorEn,
    authorAr,
    authors,
    authorId: author.authorId,
    authorCanonicalKey: author.canonicalKey,
    description,
    descriptionEn,
    descriptionAr,
    language,
    publicationYear,
    isbn13: isbn13 || null,
    isbn10: isbn10 || null,
    canonicalKey,
    rightsMode,
    visibility,
    publicationState,
    searchedPhrase: asNonEmptyString(params.searchedPhrase) || null,
    ownerUid: asNonEmptyString(rawBook.ownerUid) || asNonEmptyString(existingBook?.ownerUid) || null,
    fileName: asNonEmptyString(rawBook.fileName) || asNonEmptyString(existingBook?.fileName) || null,
    fileType: asNonEmptyString(rawBook.fileType) || asNonEmptyString(existingBook?.fileType) || null,
    fileSize:
      typeof rawBook.fileSize === "number"
        ? rawBook.fileSize
        : typeof existingBook?.fileSize === "number"
          ? existingBook.fileSize
          : null,
    storagePath:
      asNonEmptyString(rawBook.storagePath) || asNonEmptyString(existingBook?.storagePath) || null,
    ebookAttachmentId:
      asNonEmptyString(rawBook.ebookAttachmentId) ||
      asNonEmptyString(existingBook?.ebookAttachmentId) ||
      null,
    ebookStoragePath:
      asNonEmptyString(rawBook.ebookStoragePath) ||
      asNonEmptyString(existingBook?.ebookStoragePath) ||
      null,
    epubStoragePath:
      asNonEmptyString(rawBook.epubStoragePath) ||
      asNonEmptyString(existingBook?.epubStoragePath) ||
      null,
    acquiredFromProvider:
      asNonEmptyString(rawBook.acquiredFromProvider) ||
      asNonEmptyString(existingBook?.acquiredFromProvider) ||
      null,
    providerExternalIds,
    externalReadableSources,
    popularityScore: Number(existingBook?.popularityScore || 0),
    engagementScore: Number(existingBook?.engagementScore || 0),
    recentActivityAt: existingBook?.recentActivityAt || now,
    coverState,
    cover: {
      state: coverState,
      original: asNonEmptyString(asRecord(existingBook?.cover)?.original),
      large: asNonEmptyString(asRecord(existingBook?.cover)?.large),
      medium: asNonEmptyString(asRecord(existingBook?.cover)?.medium),
      small: asNonEmptyString(asRecord(existingBook?.cover)?.small),
    },
    coverUrl: asNonEmptyString(existingBook?.coverUrl) || "",
    createdAt: existingBook?.createdAt || now,
    updatedAt: now,
  };

  const searchPatch = buildBookSearchPatch(bookBase);
  const shouldHaveEbook =
    params.source === "user_upload" ||
    searchPatch.hasEbook === true ||
    rawBook.hasEbook === true ||
    rawBook.downloadable === true ||
    rawBook.isEbookAvailable === true;

  const finalBookPayload: Record<string, unknown> = {
    ...bookBase,
    ...searchPatch,
    hasEbook: shouldHaveEbook,
    downloadable: shouldHaveEbook || searchPatch.downloadable === true,
    isEbookAvailable: shouldHaveEbook || searchPatch.isEbookAvailable === true,
  };

  const shouldCreateEdition =
    params.createEdition === true ||
    params.source === "googleBooks" ||
    params.source === "openLibrary" ||
    params.source === "goodreads_import" ||
    params.source === "user_upload" ||
    Boolean(asNonEmptyString(rawBook.storagePath)) ||
    Boolean(asNonEmptyString(rawBook.ebookAttachmentId)) ||
    Boolean(asNonEmptyString(rawBook.ebookStoragePath));
  const editionId = resolveEditionId({
    explicitEditionId: params.explicitEditionId,
    source: params.source,
    providerExternalId,
    bookId,
    shouldCreateEdition,
  });

  if (editionId) {
    finalBookPayload.editionId = editionId;
  }

  if (identityCandidates.length > 0) {
    finalBookPayload.identityKeys = FieldValue.arrayUnion(
      ...identityCandidates.map((entry) => entry.key)
    );
  }

  params.tx.set(bookRef, finalBookPayload, { merge: true });

  if (editionId) {
    const editionBase: Record<string, unknown> = {
      id: editionId,
      editionId,
      bookId,
      source: params.source,
      externalId:
        providerExternalId &&
        (params.source === "googleBooks" || params.source === "openLibrary")
          ? normalizeSourceIdentityValue(params.source, providerExternalId)
          : null,
      authorId: author.authorId,
      canonicalKey,
      title,
      titleEn,
      titleAr,
      authors,
      authorEn,
      authorAr,
      description,
      descriptionEn,
      descriptionAr,
      language,
      publicationYear,
      isbn13: isbn13 || null,
      isbn10: isbn10 || null,
      rightsMode,
      visibility,
      status: "active",
      providerExternalIds,
      externalReadableSources,
      ebookAttachmentId:
        asNonEmptyString(rawBook.ebookAttachmentId) ||
        asNonEmptyString(existingBook?.ebookAttachmentId) ||
        null,
      ebookStoragePath:
        asNonEmptyString(rawBook.ebookStoragePath) ||
        asNonEmptyString(existingBook?.ebookStoragePath) ||
        null,
      epubStoragePath:
        asNonEmptyString(rawBook.epubStoragePath) ||
        asNonEmptyString(existingBook?.epubStoragePath) ||
        null,
      storagePath:
        asNonEmptyString(rawBook.storagePath) || asNonEmptyString(existingBook?.storagePath) || null,
      createdAt: existingBook?.createdAt || now,
      updatedAt: now,
      hasEbook: finalBookPayload.hasEbook,
      downloadable: finalBookPayload.downloadable,
      isEbookAvailable: finalBookPayload.isEbookAvailable,
    };

    params.tx.set(
      db.collection("editions").doc(editionId),
      {
        ...editionBase,
        ...buildEditionSearchPatch(editionBase),
      },
      { merge: true }
    );
  }

  for (const candidate of identityCandidates) {
    const ref = db.collection("book_identity").doc(candidate.key);
    const existingIdentity =
      (identitySnapshotsByKey.get(candidate.key)?.data() || null) as Record<string, unknown> | null;
    const identityRecord: IdentityRecord = {
      identityKey: candidate.key,
      identityType: candidate.type,
      value: candidate.value,
      precedence: candidate.precedence,
      bookId,
      updatedAt: now,
    };
    if (!existingIdentity) {
      identityRecord.createdAt = now;
    }
    params.tx.set(ref, identityRecord, { merge: true });
  }

  if (params.ingestionKey) {
    params.tx.set(
      db.collection("book_ingestions").doc(params.ingestionKey),
      {
        ingestionKey: params.ingestionKey,
        source: params.source,
        externalId: providerExternalId || canonicalKey,
        canonicalKey,
        identityKeys: identityCandidates.map((entry) => entry.key),
        bookId,
        editionId,
        state: "COMPLETE",
        authorityStatus: authorityFields.authorityStatus,
        coverState,
        createdAt: existingBook?.createdAt || now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  if (params.coverJobStatus || coverCandidates.length > 0) {
    const existingCandidateUrls = asStringArray(existingCoverJob.candidateUrls);
    const coverJobStatus =
      params.coverJobStatus ||
      ((asNonEmptyString(existingCoverJob.status) === "PROCESSING"
        ? "PROCESSING"
        : "PENDING") as CoverJobStatus);

    params.tx.set(
      coverJobRef,
      {
        id: bookId,
        bookId,
        ownerUid:
          asNonEmptyString(rawBook.ownerUid) || asNonEmptyString(existingCoverJob.ownerUid) || null,
        source: params.source,
        externalId:
          providerExternalId &&
          (params.source === "googleBooks" || params.source === "openLibrary")
            ? normalizeSourceIdentityValue(params.source, providerExternalId)
            : null,
        fileType: asNonEmptyString(rawBook.fileType) || asNonEmptyString(existingCoverJob.fileType) || null,
        storagePath:
          asNonEmptyString(rawBook.storagePath) ||
          asNonEmptyString(existingCoverJob.storagePath) ||
          null,
        status: coverJobStatus,
        attempts: Number(existingCoverJob.attempts || 0),
        maxAttempts:
          typeof params.coverJobMaxAttempts === "number"
            ? params.coverJobMaxAttempts
            : Number(existingCoverJob.maxAttempts || 3),
        candidateUrls: uniqueStrings([...existingCandidateUrls, ...coverCandidates], 30),
        lastError: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        createdAt: existingCoverJob.createdAt || now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  if (conflictingBookIds.size > 1) {
    logger.warn("[BOOK_AUTHORITY][IDENTITY_CONFLICT_COLLAPSED]", {
      resolvedBookId: bookId,
      candidates: Array.from(conflictingBookIds),
      source: params.source,
      canonicalKey,
    });
  }

  return {
    canonicalBookId: bookId,
    bookId,
    editionId,
    status: resolvedBookId || bookSnap.exists ? "MERGED" : "CREATED",
    authorityStatus: authorityFields.authorityStatus,
    canonicalKey,
  };
}
