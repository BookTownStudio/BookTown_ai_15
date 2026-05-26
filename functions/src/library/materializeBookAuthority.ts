import { FieldValue, Transaction } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { v4 as uuidv4 } from "uuid";

import { admin } from "../firebaseAdmin";
import { normalizeSearchText } from "../search/normalization";
import { normalizeIsbn } from "./normalization/bookSearchNormalization";
import {
  areAuthorityAuthorsEquivalent,
  extractAuthorityAuthorReference,
} from "./authorityAuthorLock";
import {
  assertProviderCanEnterCanonicalBookWritePath,
  canProviderEnrichExistingCanonicalBook,
  canProviderEnterCanonicalBookWritePath,
  getProviderAllowedAuthorityFields,
  getAcceptedAuthorityForProvider,
  getAcceptedAuthorityRank,
  isDirectAuthorityProvider,
  isRegisteredProvider,
  isRestrictedAuthorityProvider,
  isWeightedEvidenceProvider,
} from "./providerRoleRegistry";
import {
  buildRawAuthorFromBookPayload,
  materializeCanonicalAuthorInTransaction,
} from "./authors/authorCatalog";
import {
  isTrustedAuthorBirthYearForCanonicalRoot,
  isUnknownAuthorDisplayName,
  normalizeCanonicalAuthorDisplayName,
} from "./authors/authorNameNormalization";
import { resolveAuthorProviderPayload } from "./authors/providerSources";
import { buildCanonicalKey } from "./persistence/canonicalKey";
import {
  canonicalAuthorKeysShareRoot,
  extractCanonicalAuthorKeyRoot,
  normalizeAuthorYear,
} from "./persistence/canonicalAuthorKey";
import {
  buildBookOntology,
  normalizeBookOntologyConfidence,
  normalizeBookOntologySource,
  normalizeBookForm,
  readBookOntology,
  type BookOntology,
  type BookOntologySource,
} from "./ontology/bookOntology";
import { buildBookSearchPatch, buildEditionSearchPatch } from "./search/searchIndexing";

const db = admin.firestore();

const PROTECTED_FIELDS = [
  "title",
  "author",
  "authorCanonicalKey",
  "publicationYear",
  "canonicalEra",
  "literaryForm",
  "description",
  "coverUrl",
  "language",
  "originalLanguage",
] as const;

export type BookAuthorityState = "canonical" | "provisional";

export type LiteraryAuthoritySource =
  | "booktown_canonical"
  | "booktownRefinery"
  | "canonical_seed"
  | "googleBooks"
  | "goodreads_import"
  | "loc"
  | "openLibrary"
  | "worldcat"
  | "user_upload"
  | "write_publish"
  | "write_release";

type MetadataAuthorityField = "cover" | "description";
type MetadataAuthoritySource =
  | "manualAdmin"
  | "googleBooks"
  | "goodreads_import"
  | "openLibrary";
type AuthorityConfidence = "high" | "medium" | "low";
type AcceptedAuthority = "manualAuthority" | "openLibrary" | "wikidata" | "googleBooks";
type FieldConfidenceLevel = "restricted" | "direct" | "weighted";
type FieldConfidenceField = "publicationYear" | "publisher" | "language" | "oclcNumber";
type FieldConfidenceRecord = {
  source: string;
  confidence: FieldConfidenceLevel;
  supportingSources: string[];
};
type CanonicalFieldName =
  | "canonicalTitle"
  | "canonicalAuthorIds"
  | "canonicalKey"
  | "originalLanguage"
  | "workIdentity";
type CanonicalFieldTrustRecord = {
  value: unknown;
  source: string;
  confidence: AuthorityConfidence;
  acceptedAuthority: AcceptedAuthority;
  locked: boolean;
};

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
  descriptionAuthorityOverride?: "manualAdmin";
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

function applyCanonicalProtection(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown>
): Record<string, unknown> {
  if (existing?.canonicalLocked !== true) {
    return incoming;
  }

  const protectedIncoming = { ...incoming };
  for (const field of PROTECTED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(protectedIncoming, field)) {
      continue;
    }
    if (existing[field] !== undefined && existing[field] !== null) {
      protectedIncoming[field] = existing[field];
    }
  }
  return protectedIncoming;
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
  ].map((entry) => normalizeCanonicalAuthorDisplayName(entry)))
    .filter((entry) => !isUnknownAuthorDisplayName(entry));

  if (arrayAuthors.length > 0) {
    return arrayAuthors;
  }

  const fallback = uniqueStrings([
    normalizeCanonicalAuthorDisplayName(rawBook.author),
    normalizeCanonicalAuthorDisplayName(rawBook.authorEn),
    normalizeCanonicalAuthorDisplayName(rawBook.authorAr),
  ]).filter((entry) => !isUnknownAuthorDisplayName(entry));

  return fallback.length > 0 ? fallback : ["Unknown"];
}

type SeedAuthorLock = {
  author: string;
  authorEn: string;
  authors: string[];
  authorCanonicalKey: string;
  source?: string;
};

function readSeedAuthorLock(value: unknown): SeedAuthorLock | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const authorCanonicalKey = asNonEmptyString(record.authorCanonicalKey);
  const authorRootDisplay = canonicalAuthorRootToDisplayName(
    extractCanonicalAuthorKeyRoot(authorCanonicalKey)
  );
  const rawAuthor = normalizeCanonicalAuthorDisplayName(record.author);
  const rawAuthorEn = normalizeCanonicalAuthorDisplayName(record.authorEn);
  const author = isUnknownAuthorDisplayName(rawAuthor)
    ? isUnknownAuthorDisplayName(rawAuthorEn)
      ? authorRootDisplay
      : rawAuthorEn
    : rawAuthor;
  const authorEn = isUnknownAuthorDisplayName(rawAuthorEn) ? author : rawAuthorEn;
  const authors = uniqueStrings([author, authorEn])
    .filter((entry) => !isUnknownAuthorDisplayName(entry));

  if (
    isUnknownAuthorDisplayName(author) ||
    isUnknownAuthorDisplayName(authorEn) ||
    authors.length === 0 ||
    !authorCanonicalKey
  ) {
    return null;
  }

  return {
    author,
    authorEn,
    authors,
    authorCanonicalKey,
  };
}

function canonicalAuthorRootToDisplayName(root: string): string {
  const normalizedRoot = root.trim();
  if (!normalizedRoot || normalizedRoot === "unknown") {
    return "";
  }

  return normalizedRoot
    .split(/\s+/)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function resolveSeedAuthorLock(params: {
  source: LiteraryAuthoritySource;
  rawBook: Record<string, unknown>;
  existingBook: Record<string, unknown> | null;
}): SeedAuthorLock | null {
  const incomingExplicitLock = readSeedAuthorLock(params.rawBook.seedAuthorLock);
  const existingLock = readSeedAuthorLock(asRecord(params.existingBook?.provenance)?.seedAuthorLock);
  const incomingLock =
    params.source === "canonical_seed"
      ? readSeedAuthorLock({
          author: asNonEmptyString(params.rawBook.author),
          authorEn: asNonEmptyString(params.rawBook.authorEn) || asNonEmptyString(params.rawBook.author),
          authors: extractAuthors(params.rawBook),
          authorCanonicalKey: asNonEmptyString(params.rawBook.authorCanonicalKey),
        })
      : null;

  return incomingExplicitLock || incomingLock || existingLock;
}

function extractCanonicalAuthorKeyYear(value: string): string {
  const [, rawYear = ""] = value.split("::");
  return normalizeAuthorYear(rawYear);
}

function isSyntheticAncientSeedAuthorYear(value: string): boolean {
  const year = normalizeAuthorYear(value);
  return /^0\d{3}$/.test(year);
}

function canUpgradeSeedAuthorCanonicalKey(params: {
  seedAuthorLock: SeedAuthorLock;
  materializedAuthorCanonicalKey: string;
}): boolean {
  const seedCanonicalKey = params.seedAuthorLock.authorCanonicalKey;
  const materializedCanonicalKey = params.materializedAuthorCanonicalKey;

  if (seedCanonicalKey === materializedCanonicalKey) {
    return false;
  }

  if (!canonicalAuthorKeysShareRoot(materializedCanonicalKey, seedCanonicalKey)) {
    return false;
  }

  const seedYear = extractCanonicalAuthorKeyYear(seedCanonicalKey);
  const materializedYear = extractCanonicalAuthorKeyYear(materializedCanonicalKey);
  if (seedYear && seedYear !== "unknown") {
    return false;
  }

  if (!materializedYear || materializedYear === "unknown") {
    return false;
  }

  if (isSyntheticAncientSeedAuthorYear(materializedYear)) {
    return false;
  }

  const seedRoot = extractCanonicalAuthorKeyRoot(seedCanonicalKey);
  return isTrustedAuthorBirthYearForCanonicalRoot(seedRoot, materializedYear);
}

function seedAuthorBirthYearPatch(
  seedAuthorLock: SeedAuthorLock,
  rawBook: Record<string, unknown>
): { birthYear?: string; birthDate?: string } {
  const candidateBirthYear =
    normalizeAuthorYear(rawBook.birthYear as string | number | null) ||
    normalizeAuthorYear(asNonEmptyString(rawBook.birthDate));

  if (!candidateBirthYear) {
    return {};
  }

  if (isSyntheticAncientSeedAuthorYear(candidateBirthYear)) {
    logger.warn("[BOOK_AUTHORITY][SEED_AUTHOR_BIRTH_YEAR_REJECTED]", {
      lockedAuthor: seedAuthorLock.author,
      lockedAuthorCanonicalKey: seedAuthorLock.authorCanonicalKey,
      rejectedBirthYear: candidateBirthYear,
      reason: "synthetic_ancient_year",
    });
    return {
      birthYear: "",
      birthDate: "",
    };
  }

  const seedRoot = extractCanonicalAuthorKeyRoot(seedAuthorLock.authorCanonicalKey);
  if (isTrustedAuthorBirthYearForCanonicalRoot(seedRoot, candidateBirthYear)) {
    return {};
  }

  logger.warn("[BOOK_AUTHORITY][SEED_AUTHOR_BIRTH_YEAR_REJECTED]", {
    lockedAuthor: seedAuthorLock.author,
    lockedAuthorCanonicalKey: seedAuthorLock.authorCanonicalKey,
    rejectedBirthYear: candidateBirthYear,
  });
  return {
    birthYear: "",
    birthDate: "",
  };
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

  const isbn13Array = asStringArray(rawBook.isbn_13);
  const isbn10Array = asStringArray(rawBook.isbn_10);
  for (const candidate of [...isbn13Array, ...isbn10Array]) {
    if (!isbn13) isbn13 = normalizeIsbn(candidate, 13);
    if (!isbn10) isbn10 = normalizeIsbn(candidate, 10);
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

function normalizeMetadataAuthoritySource(
  source: LiteraryAuthoritySource
): MetadataAuthoritySource | null {
  if (source === "booktown_canonical" || source === "canonical_seed") {
    return "manualAdmin";
  }
  if (source === "goodreads_import") {
    return "goodreads_import";
  }
  if (
    isDirectAuthorityProvider(source) &&
    (source === "googleBooks" || source === "openLibrary")
  ) {
    return source;
  }
  return null;
}

function getMetadataAuthorityScore(
  field: MetadataAuthorityField,
  source: MetadataAuthoritySource | null
): number {
  if (!source) return 0;
  if (field === "cover") {
    if (source === "manualAdmin") return 100;
    if (source === "googleBooks") return 90;
    if (source === "openLibrary") return 70;
    if (source === "goodreads_import") return 0;
    return 0;
  }

  if (source === "manualAdmin") return 100;
  if (source === "googleBooks") return 80;
  if (source === "openLibrary") return 70;
  if (source === "goodreads_import") return 0;
  return 0;
}

function isTrustedProviderDescriptionFillSource(
  source: LiteraryAuthoritySource
): boolean {
  return source === "googleBooks" || source === "openLibrary";
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeDescriptionText(value: string): string {
  const stripped =
    value.includes("<") && value.includes(">")
      ? value.replace(/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?\s*\/?>/gu, " ")
      : value;
  return stripped.replace(/\s+/gu, " ").trim();
}

function isValidDescriptionText(value: string): boolean {
  const normalized = normalizeDescriptionText(value);
  if (normalized.length < 80) {
    return false;
  }
  if (normalized.includes("\uFFFD")) {
    return false;
  }
  if (
    /\b(unabridged|abridged|illustrated edition|collector(?:'s)? edition|special edition|paperback edition|hardcover edition|movie tie-?in|box set|omnibus)\b/iu.test(
      normalized
    )
  ) {
    return false;
  }
  if (/[^\p{L}\p{N}\s]{6,}/u.test(normalized)) {
    return false;
  }
  return true;
}

function resolveExistingMetadataAuthority(params: {
  field: MetadataAuthorityField;
  existingBook: Record<string, unknown> | null;
}): {
  source: MetadataAuthoritySource | null;
  authority: number;
} {
  const sourceField = params.field === "cover" ? "coverSource" : "descriptionSource";
  const authorityField =
    params.field === "cover" ? "coverAuthority" : "descriptionAuthority";
  const storedSourceRaw = asNonEmptyString(params.existingBook?.[sourceField]);
  const storedSource: MetadataAuthoritySource | null =
    storedSourceRaw === "manualAdmin" ||
    storedSourceRaw === "googleBooks" ||
    storedSourceRaw === "goodreads_import" ||
    storedSourceRaw === "openLibrary"
      ? storedSourceRaw
      : normalizeMetadataAuthoritySource(asNonEmptyString(params.existingBook?.source) as LiteraryAuthoritySource);

  const storedAuthorityValue = params.existingBook?.[authorityField];
  if (typeof storedAuthorityValue === "number" && Number.isFinite(storedAuthorityValue)) {
    return {
      source: storedSource,
      authority: storedAuthorityValue,
    };
  }

  return {
    source: storedSource,
    authority: getMetadataAuthorityScore(params.field, storedSource),
  };
}

function resolveMetadataField(params: {
  field: MetadataAuthorityField;
  existingBook: Record<string, unknown> | null;
  existingValue: string;
  incomingValue: string;
  incomingRawSource: LiteraryAuthoritySource;
  incomingSource: MetadataAuthoritySource | null;
}): {
  value: string;
  source: MetadataAuthoritySource | null;
  authority: number | null;
  acceptedIncoming: boolean;
  authorityMode?: "provider_fill";
  filledBySource?: LiteraryAuthoritySource;
} {
  const existingValue = params.existingValue.trim();
  const incomingValue =
    params.field === "description"
      ? normalizeDescriptionText(params.incomingValue)
      : params.incomingValue.trim();

  const incomingIsValid =
    params.field === "cover"
      ? incomingValue.length > 0 && isValidHttpUrl(incomingValue)
      : incomingValue.length > 0 && isValidDescriptionText(incomingValue);

  const existingAuthority = resolveExistingMetadataAuthority({
    field: params.field,
    existingBook: params.existingBook,
  });
  const incomingAuthority = getMetadataAuthorityScore(params.field, params.incomingSource);
  const hasSeedLineage = Boolean(asRecord(params.existingBook?.provenance)?.seedAuthorLock);
  const canApplyProviderFill =
    params.field === "description" &&
    !existingValue &&
    hasSeedLineage &&
    isTrustedProviderDescriptionFillSource(params.incomingRawSource);

  if (!incomingIsValid) {
    return {
      value: existingValue,
      source: existingValue ? existingAuthority.source : null,
      authority: existingValue ? existingAuthority.authority : null,
      acceptedIncoming: false,
    };
  }

  if (canApplyProviderFill) {
    return {
      value: incomingValue,
      source: existingAuthority.source || "manualAdmin",
      authority:
        existingAuthority.authority ||
        getMetadataAuthorityScore(params.field, "manualAdmin"),
      acceptedIncoming: true,
      authorityMode: "provider_fill",
      filledBySource: params.incomingRawSource,
    };
  }

  if (!existingValue) {
    return {
      value: incomingValue,
      source: params.incomingSource,
      authority: incomingAuthority,
      acceptedIncoming: true,
    };
  }

  if (incomingAuthority > existingAuthority.authority) {
    return {
      value: incomingValue,
      source: params.incomingSource,
      authority: incomingAuthority,
      acceptedIncoming: true,
    };
  }

  return {
    value: existingValue,
    source: existingAuthority.source,
    authority: existingAuthority.authority,
    acceptedIncoming: false,
  };
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

function resolveTrustedTitleAliases(params: {
  existingBook: Record<string, unknown> | null;
  rawBook: Record<string, unknown>;
  canonicalTitle: string;
  originalTitle: string;
}): string[] {
  const excluded = new Set(
    uniqueStrings([
      params.canonicalTitle,
      params.originalTitle,
    ]).map((entry) => normalizeSearchText(entry))
  );

  return uniqueStrings([
    ...asStringArray(params.existingBook?.titleAliases),
    ...asStringArray(params.rawBook.titleAliases),
    ...asStringArray(params.rawBook.alternateTitles),
    ...asStringArray(params.rawBook.otherTitles),
    asNonEmptyString(params.rawBook.title),
    asNonEmptyString(params.rawBook.titleEn),
    asNonEmptyString(params.rawBook.titleAr),
  ]).filter((entry) => {
    const normalized = normalizeSearchText(entry);
    return Boolean(normalized) && !excluded.has(normalized);
  });
}

function buildCanonicalKeys(rawBook: Record<string, unknown>, primaryAuthor: string): string[] {
  const titleAuthorities = resolveTitleAuthorities(rawBook);
  const primaryTitle = extractPrimaryTitle(rawBook);
  return uniqueStrings([
    buildCanonicalKey({ title: primaryTitle, author: primaryAuthor }),
    ...titleAuthorities.map((title) => buildCanonicalKey({ title, author: primaryAuthor })),
  ], 12);
}

function resolveWorkProviderIdentity(params: {
  source: LiteraryAuthoritySource;
  providerExternalId: string;
}): string {
  if (!params.providerExternalId) return "";
  if (params.source === "openLibrary") {
    return normalizeSourceIdentityValue(params.source, params.providerExternalId);
  }
  if (params.source === "booktown_canonical" || params.source === "canonical_seed") {
    return params.providerExternalId.trim();
  }
  return "";
}

function resolveEditionProviderIdentity(params: {
  source: LiteraryAuthoritySource;
  providerExternalId: string;
  rawBook: Record<string, unknown>;
}): string {
  const explicitEditionId = uniqueStrings([
    asNonEmptyString(params.rawBook.editionExternalId),
    asNonEmptyString(params.rawBook.openLibraryEditionId),
    asNonEmptyString(params.rawBook.volumeId),
    asNonEmptyString(params.rawBook.volume_id),
    asNonEmptyString(params.rawBook.editionId),
  ])[0];

  if (explicitEditionId) {
    return normalizeSourceIdentityValue(params.source, explicitEditionId);
  }

  if (params.providerExternalId) {
    return normalizeSourceIdentityValue(params.source, params.providerExternalId);
  }

  return "";
}

function resolvePublisher(rawBook: Record<string, unknown>): string | null {
  const direct = asNonEmptyString(rawBook.publisher);
  if (direct) return direct;
  const publishers = uniqueStrings([
    ...asStringArray(rawBook.publishers),
    ...asStringArray(rawBook.publisher_name),
  ]);
  return publishers[0] || null;
}

function isFinitePublicationYearValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function canAcceptRestrictedAuthorityString(params: {
  existingValue: unknown;
  incomingValue: string;
  allowPlaceholderReplacement?: boolean;
}): boolean {
  const incomingValue = params.incomingValue.trim();
  if (!incomingValue) {
    return false;
  }

  const existingValue = asNonEmptyString(params.existingValue);
  if (!existingValue) {
    return true;
  }

  return Boolean(
    params.allowPlaceholderReplacement &&
      isCanonicalPlaceholderValue(existingValue) &&
      !isCanonicalPlaceholderValue(incomingValue)
  );
}

function resolveLocControlNumber(
  rawBook: Record<string, unknown>,
  providerExternalId: string
): string {
  return (
    asNonEmptyString(rawBook.locControlNumber) ||
    asNonEmptyString(rawBook.lccn) ||
    providerExternalId
  );
}

function resolveWorldcatOclcNumber(
  rawBook: Record<string, unknown>,
  providerExternalId: string
): string {
  const candidates = uniqueStrings([
    asNonEmptyString(rawBook.oclcNumber),
    asNonEmptyString(rawBook.oclc),
    asNonEmptyString(rawBook.oclc_number),
    asNonEmptyString(rawBook.worldcatId),
    asNonEmptyString(rawBook.worldcat_id),
    providerExternalId,
  ]);

  for (const candidate of candidates) {
    const normalized = candidate.replace(/^(oclc|worldcat)[:\s-]*/i, "").trim();
    if (/^\d+$/.test(normalized)) {
      return normalized;
    }
  }

  return "";
}

function resolveEditionCountSupport(rawBook: Record<string, unknown>): number | null {
  const numericCandidates = [
    rawBook.editionCount,
    rawBook.editionsCount,
    rawBook.numberOfEditions,
    rawBook.edition_count,
  ];

  for (const candidate of numericCandidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return Math.trunc(candidate);
    }
  }

  const stringCandidates = uniqueStrings([
    asNonEmptyString(rawBook.editionCount),
    asNonEmptyString(rawBook.editionsCount),
    asNonEmptyString(rawBook.numberOfEditions),
    asNonEmptyString(rawBook.edition_count),
  ]);

  for (const candidate of stringCandidates) {
    if (/^\d+$/.test(candidate)) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.trunc(parsed);
      }
    }
  }

  return null;
}

function isCanonicalAuthorityBook(data: Record<string, unknown> | null): boolean {
  if (!data) {
    return false;
  }
  return (
    asNonEmptyString(data.authorityStatus) === "canonical" ||
    asNonEmptyString(data.workType) === "canonical" ||
    data.canonicalLocked === true
  );
}

async function resolveRestrictedAuthorityExistingBook(params: {
  tx: Transaction;
  preferredBookId?: string;
  incomingRawBook: Record<string, unknown>;
  canonicalKeys: string[];
}): Promise<{
  bookId: string;
  data: Record<string, unknown>;
} | null> {
  const loadBook = async (
    bookId: string
  ): Promise<{
    bookId: string;
    data: Record<string, unknown>;
  } | null> => {
    if (!bookId) {
      return null;
    }
    const snap = await params.tx.get(db.collection("books").doc(bookId));
    const data = (snap.data() || null) as Record<string, unknown> | null;
    return data ? { bookId, data } : null;
  };

  let candidate =
    (params.preferredBookId ? await loadBook(params.preferredBookId) : null) ||
    null;

  if (!candidate) {
    const resolvedBookId = await resolveExistingBookByFields({
      tx: params.tx,
      incomingRawBook: params.incomingRawBook,
      canonicalKeys: params.canonicalKeys,
      isbn13: "",
      isbn10: "",
      allowIsbnFallback: false,
    });
    candidate = resolvedBookId ? await loadBook(resolvedBookId) : null;
  }

  const visited = new Set<string>();
  while (candidate) {
    const mergedInto = asNonEmptyString(candidate.data.mergedInto);
    if (!mergedInto || visited.has(mergedInto)) {
      break;
    }
    visited.add(candidate.bookId);
    const redirected = await loadBook(mergedInto);
    if (!redirected) {
      break;
    }
    candidate = redirected;
  }

  return candidate;
}

function resolveEditionFormat(rawBook: Record<string, unknown>): string | null {
  return (
    asNonEmptyString(rawBook.format) ||
    asNonEmptyString(rawBook.binding) ||
    asNonEmptyString(rawBook.printType) ||
    asNonEmptyString(rawBook.fileType) ||
    null
  );
}

function toAuthorityEvidence(source: LiteraryAuthoritySource): {
  source: string;
  confidence: AuthorityConfidence;
  lastAcceptedAt: FirebaseFirestore.FieldValue;
} {
  let confidence: AuthorityConfidence = "medium";

  if (source === "booktown_canonical" || source === "canonical_seed") {
    confidence = "high";
  } else if (source === "user_upload" || source === "goodreads_import") {
    confidence = "low";
  }

  return {
    source,
    confidence,
    lastAcceptedAt: FieldValue.serverTimestamp(),
  };
}

function resolveOntologySource(params: {
  source: LiteraryAuthoritySource;
  rawOntology: unknown;
}): BookOntologySource {
  const rawRecord = asRecord(params.rawOntology);
  const explicit = normalizeBookOntologySource(rawRecord?.source);
  if (explicit) {
    return explicit;
  }

  if (params.source === "canonical_seed") {
    return "seed";
  }
  if (params.source === "booktown_canonical") {
    return "admin";
  }
  if (
    params.source === "googleBooks" ||
    params.source === "goodreads_import" ||
    params.source === "loc" ||
    params.source === "openLibrary" ||
    params.source === "worldcat"
  ) {
    return "provider";
  }

  return "migration";
}

function canOverwriteExistingOntology(params: {
  source: LiteraryAuthoritySource;
  authorityStatus: BookAuthorityState;
}): boolean {
  return (
    params.authorityStatus === "canonical" ||
    params.source === "booktown_canonical" ||
    params.source === "canonical_seed"
  );
}

function resolveMaterializedOntology(params: {
  existingBook: Record<string, unknown> | null;
  rawBook: Record<string, unknown>;
  source: LiteraryAuthoritySource;
  authorityStatus: BookAuthorityState;
  updatedAt: FirebaseFirestore.FieldValue;
}): BookOntology {
  const existingOntology = readBookOntology(params.existingBook?.ontology);
  const incomingOntology = readBookOntology(params.rawBook.ontology);
  const canOverwrite = canOverwriteExistingOntology({
    source: params.source,
    authorityStatus: params.authorityStatus,
  });

  if (existingOntology && !canOverwrite) {
    return existingOntology;
  }

  if (incomingOntology) {
    return {
      ...incomingOntology,
      updatedAt: params.updatedAt,
    };
  }

  const legacyLiteraryForm =
    asNonEmptyString(params.rawBook.literaryForm) ||
    asNonEmptyString(params.existingBook?.literaryForm);
  if (existingOntology && !legacyLiteraryForm) {
    return existingOntology;
  }

  const rawOntologyRecord = asRecord(params.rawBook.ontology);
  return buildBookOntology({
    literaryForm: legacyLiteraryForm || "unknown",
    source: resolveOntologySource({
      source: params.source,
      rawOntology: params.rawBook.ontology,
    }),
    confidence:
      normalizeBookOntologyConfidence(rawOntologyRecord?.confidence) ||
      (legacyLiteraryForm ? "mapped" : "unknown"),
    updatedAt: params.updatedAt,
    canonicalTradition:
      rawOntologyRecord?.canonicalTradition ?? params.rawBook.canonicalTradition,
  });
}

function enforceOntologyInvariant(params: {
  ontology: BookOntology | null;
  source: LiteraryAuthoritySource;
  updatedAt: FirebaseFirestore.FieldValue;
}): BookOntology {
  const form = normalizeBookForm(params.ontology?.form);
  if (params.ontology && form) {
    return {
      ...params.ontology,
      form,
    };
  }

  logger.error("[BOOK_AUTHORITY][ONTOLOGY_FORM_MISSING]", {
    source: params.source,
  });
  return buildBookOntology({
    literaryForm: "unknown",
    source: resolveOntologySource({
      source: params.source,
      rawOntology: null,
    }),
    confidence: "unknown",
    updatedAt: params.updatedAt,
  });
}

function normalizeAuthorityConfidence(value: unknown): AuthorityConfidence | null {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return null;
}

function normalizeFieldConfidenceLevel(value: unknown): FieldConfidenceLevel | null {
  if (value === "restricted" || value === "direct" || value === "weighted") {
    return value;
  }
  return null;
}

function resolveFieldConfidenceLevel(
  source: LiteraryAuthoritySource
): FieldConfidenceLevel | null {
  if (source === "loc") {
    return "restricted";
  }
  if (source === "openLibrary" || source === "googleBooks") {
    return "direct";
  }
  if (source === "worldcat") {
    return "weighted";
  }
  return null;
}

function getFieldConfidenceRank(value: FieldConfidenceLevel): number {
  if (value === "restricted") return 3;
  if (value === "direct") return 2;
  return 1;
}

function normalizeSupportingSources(value: unknown): string[] {
  return uniqueStrings(asStringArray(value), 8);
}

function readExistingFieldConfidenceRecord(params: {
  existingBook: Record<string, unknown> | null;
  field: FieldConfidenceField;
}): FieldConfidenceRecord | null {
  const root = asRecord(asRecord(params.existingBook?.provenance)?.fieldConfidence);
  const raw = asRecord(root?.[params.field]);
  const source = asNonEmptyString(raw?.source);
  const confidence = normalizeFieldConfidenceLevel(raw?.confidence);

  if (!source || !confidence) {
    return null;
  }

  return {
    source,
    confidence,
    supportingSources: normalizeSupportingSources(raw?.supportingSources),
  };
}

function resolveUpdatedFieldConfidenceRecord(params: {
  existingBook: Record<string, unknown> | null;
  field: FieldConfidenceField;
  source: LiteraryAuthoritySource;
  previousValue: unknown;
  finalValue: unknown;
  incomingValue: unknown;
}): FieldConfidenceRecord | null {
  const incomingConfidence = resolveFieldConfidenceLevel(params.source);
  if (!incomingConfidence) {
    return null;
  }
  if (!hasCanonicalFieldValue(params.finalValue) || !hasCanonicalFieldValue(params.incomingValue)) {
    return null;
  }
  if (!canonicalFieldValuesEqual(params.finalValue, params.incomingValue)) {
    return null;
  }

  const existingRecord = readExistingFieldConfidenceRecord({
    existingBook: params.existingBook,
    field: params.field,
  });

  if (!existingRecord) {
    return {
      source: params.source,
      confidence: incomingConfidence,
      supportingSources: [],
    };
  }

  const incomingRank = getFieldConfidenceRank(incomingConfidence);
  const existingRank = getFieldConfidenceRank(existingRecord.confidence);
  const sameValueAsBefore = canonicalFieldValuesEqual(params.previousValue, params.finalValue);

  if (incomingRank > existingRank) {
    return {
      source: params.source,
      confidence: incomingConfidence,
      supportingSources: sameValueAsBefore
        ? normalizeSupportingSources([
            ...existingRecord.supportingSources,
            existingRecord.source,
          ])
        : [],
    };
  }

  if (params.source === existingRecord.source) {
    return existingRecord;
  }

  return {
    ...existingRecord,
    supportingSources: normalizeSupportingSources([
      ...existingRecord.supportingSources,
      params.source,
    ]),
  };
}

function buildFieldConfidencePatch(params: {
  existingBook: Record<string, unknown> | null;
  entries: Array<{
    field: FieldConfidenceField;
    source: LiteraryAuthoritySource;
    previousValue: unknown;
    finalValue: unknown;
    incomingValue: unknown;
  }>;
}): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};

  for (const entry of params.entries) {
    const record = resolveUpdatedFieldConfidenceRecord({
      existingBook: params.existingBook,
      field: entry.field,
      source: entry.source,
      previousValue: entry.previousValue,
      finalValue: entry.finalValue,
      incomingValue: entry.incomingValue,
    });

    if (!record) {
      continue;
    }

    patch[entry.field] = record;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function resolveAcceptedAuthority(source: string): AcceptedAuthority {
  if (source === "booktown_canonical" || source === "canonical_seed" || source === "manualAuthority") {
    return "manualAuthority";
  }
  const acceptedAuthority = getAcceptedAuthorityForProvider(source);
  if (
    acceptedAuthority === "openLibrary" ||
    acceptedAuthority === "wikidata" ||
    acceptedAuthority === "googleBooks"
  ) {
    return acceptedAuthority;
  }
  return "googleBooks";
}

function acceptedAuthorityRank(value: AcceptedAuthority): number {
  return getAcceptedAuthorityRank(value);
}

function isExplicitCanonicalAuthoritySource(source: LiteraryAuthoritySource): boolean {
  return (
    source === "booktown_canonical" ||
    source === "canonical_seed" ||
    canProviderEnterCanonicalBookWritePath(source)
  );
}

function hasCanonicalFieldValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
  return value !== null && value !== undefined;
}

function deepSortCanonicalFieldValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => deepSortCanonicalFieldValue(entry));
  }
  const record = asRecord(value);
  if (!record) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, deepSortCanonicalFieldValue(record[key])])
  );
}

function canonicalFieldValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(deepSortCanonicalFieldValue(left)) === JSON.stringify(deepSortCanonicalFieldValue(right));
}

function isCanonicalPlaceholderValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === "unknown" ||
    normalized === "untitled" ||
    normalized === "und" ||
    normalized === "unknown language"
  );
}

function isMateriallyBetterCanonicalValue(params: {
  field: CanonicalFieldName;
  existingValue: unknown;
  incomingValue: unknown;
}): boolean {
  if (params.field === "canonicalKey") {
    return false;
  }

  if (params.field === "canonicalAuthorIds") {
    const existing = new Set(asStringArray(params.existingValue));
    return asStringArray(params.incomingValue).some((entry) => !existing.has(entry));
  }

  if (params.field === "workIdentity") {
    const existing = normalizeWorkIdentityValue(params.existingValue, "");
    const incoming = normalizeWorkIdentityValue(
      params.incomingValue,
      asNonEmptyString(existing.canonicalKey)
    );
    const existingMergeKeys = new Set(asStringArray(existing.mergeKeys));
    return (
      asStringArray(incoming.mergeKeys).some((entry) => !existingMergeKeys.has(entry)) ||
      (!asNonEmptyString(existing.providerWorkId) && Boolean(asNonEmptyString(incoming.providerWorkId)))
    );
  }

  const existing = asNonEmptyString(params.existingValue);
  const incoming = asNonEmptyString(params.incomingValue);
  if (!incoming) {
    return false;
  }
  if (!existing) {
    return true;
  }

  if (params.field === "originalLanguage") {
    return isCanonicalPlaceholderValue(existing) && !isCanonicalPlaceholderValue(incoming);
  }

  return (
    (isCanonicalPlaceholderValue(existing) && !isCanonicalPlaceholderValue(incoming)) ||
    incoming.length > existing.length + 3
  );
}

function toCanonicalFieldTrust(params: {
  source: LiteraryAuthoritySource;
  value: unknown;
  locked: boolean;
}): CanonicalFieldTrustRecord {
  const evidence = toAuthorityEvidence(params.source);
  return {
    value: params.value,
    source: evidence.source,
    confidence: evidence.confidence,
    acceptedAuthority: resolveAcceptedAuthority(params.source),
    locked: params.locked,
  };
}

function readExistingCanonicalFieldTrust(params: {
  existingBook: Record<string, unknown> | null;
  field: CanonicalFieldName;
  fallbackValue: unknown;
  fallbackLocked: boolean;
}): CanonicalFieldTrustRecord | null {
  const trustRoot = asRecord(params.existingBook?.canonicalFieldTrust);
  const rawTrust = asRecord(trustRoot?.[params.field]);
  const value = rawTrust && "value" in rawTrust ? rawTrust.value : params.fallbackValue;

  if (!hasCanonicalFieldValue(value)) {
    return null;
  }

  const source = asNonEmptyString(rawTrust?.source) || asNonEmptyString(params.existingBook?.source) || "booktown_canonical";
  const confidence =
    normalizeAuthorityConfidence(rawTrust?.confidence) ||
    toAuthorityEvidence(source as LiteraryAuthoritySource).confidence;
  const acceptedAuthority =
    (rawTrust?.acceptedAuthority === "manualAuthority" ||
    rawTrust?.acceptedAuthority === "openLibrary" ||
    rawTrust?.acceptedAuthority === "wikidata" ||
    rawTrust?.acceptedAuthority === "googleBooks"
      ? rawTrust.acceptedAuthority
      : resolveAcceptedAuthority(source)) as AcceptedAuthority;
  const locked =
    typeof rawTrust?.locked === "boolean" ? rawTrust.locked : params.fallbackLocked;

  return {
    value,
    source,
    confidence,
    acceptedAuthority,
    locked,
  };
}

function resolveCanonicalFieldTrust(params: {
  existingBook: Record<string, unknown> | null;
  field: CanonicalFieldName;
  existingValue: unknown;
  incomingValue: unknown;
  source: LiteraryAuthoritySource;
  requestedLock: boolean;
}): CanonicalFieldTrustRecord {
  const existingTrust = readExistingCanonicalFieldTrust({
    existingBook: params.existingBook,
    field: params.field,
    fallbackValue: params.existingValue,
    fallbackLocked: params.existingBook?.canonicalLocked === true,
  });
  const incomingTrust = toCanonicalFieldTrust({
    source: params.source,
    value: params.incomingValue,
    locked: params.requestedLock,
  });

  if (!existingTrust) {
    return incomingTrust;
  }

  if (!hasCanonicalFieldValue(existingTrust.value) && hasCanonicalFieldValue(params.incomingValue)) {
    return incomingTrust;
  }

  const incomingExplicit = isExplicitCanonicalAuthoritySource(params.source);
  const incomingRank = acceptedAuthorityRank(incomingTrust.acceptedAuthority);
  const existingRank = acceptedAuthorityRank(existingTrust.acceptedAuthority);
  const incomingStronger =
    incomingRank > existingRank;
  const incomingEqual = incomingRank === existingRank;
  const sameValue = canonicalFieldValuesEqual(existingTrust.value, params.incomingValue);
  const materiallyBetter = isMateriallyBetterCanonicalValue({
    field: params.field,
    existingValue: existingTrust.value,
    incomingValue: params.incomingValue,
  });

  if (params.field === "canonicalKey") {
    if (incomingExplicit && params.requestedLock && sameValue) {
      return {
        ...incomingTrust,
        value: existingTrust.value,
      };
    }
    return {
      ...existingTrust,
      locked: existingTrust.locked || (incomingExplicit && params.requestedLock && sameValue),
    };
  }

  if (params.field === "canonicalAuthorIds" || params.field === "workIdentity") {
    if (incomingExplicit && incomingStronger && (sameValue || materiallyBetter)) {
      return {
        ...incomingTrust,
        locked: existingTrust.locked || params.requestedLock,
      };
    }
    if (incomingExplicit && incomingEqual && sameValue) {
      return {
        ...existingTrust,
        locked: existingTrust.locked || params.requestedLock,
      };
    }
    return existingTrust;
  }

  if (existingTrust.locked) {
    if (
      incomingExplicit &&
      incomingStronger &&
      hasCanonicalFieldValue(params.incomingValue) &&
      (sameValue || materiallyBetter)
    ) {
      return {
        ...incomingTrust,
        locked: true,
      };
    }
    if (incomingExplicit && incomingEqual && sameValue) {
      return {
        ...existingTrust,
        locked: true,
      };
    }
    return existingTrust;
  }

  if (
    incomingExplicit &&
    hasCanonicalFieldValue(params.incomingValue) &&
    (sameValue || (incomingStronger && materiallyBetter))
  ) {
    if (sameValue || incomingStronger) {
      return incomingTrust;
    }
  }

  return {
    ...existingTrust,
    locked: existingTrust.locked || (incomingExplicit && params.requestedLock && sameValue),
  };
}

function mergeCanonicalAuthorIds(existingValue: unknown, incomingValue: unknown): string[] {
  return uniqueStrings([
    ...asStringArray(existingValue),
    ...asStringArray(incomingValue),
  ], 8);
}

function normalizeWorkIdentityValue(
  value: unknown,
  fallbackCanonicalKey: string
): Record<string, unknown> {
  const record = asRecord(value) || {};
  const canonicalKey = asNonEmptyString(record.canonicalKey) || fallbackCanonicalKey;
  const mergeKeys = uniqueStrings([
    canonicalKey,
    ...asStringArray(record.mergeKeys),
  ], 12);
  const providerWorkId = asNonEmptyString(record.providerWorkId);

  return {
    canonicalKey,
    mergeKeys,
    ...(providerWorkId ? { providerWorkId } : {}),
  };
}

function mergeWorkIdentityValues(params: {
  existingValue: unknown;
  incomingValue: unknown;
  canonicalKey: string;
}): Record<string, unknown> {
  const existing = normalizeWorkIdentityValue(params.existingValue, params.canonicalKey);
  const incoming = normalizeWorkIdentityValue(params.incomingValue, params.canonicalKey);
  const providerWorkId =
    asNonEmptyString(existing.providerWorkId) || asNonEmptyString(incoming.providerWorkId);

  return {
    canonicalKey: params.canonicalKey,
    mergeKeys: uniqueStrings([
      params.canonicalKey,
      ...asStringArray(existing.mergeKeys),
      ...asStringArray(incoming.mergeKeys),
    ], 12),
    ...(providerWorkId ? { providerWorkId } : {}),
  };
}

function toCompatibilityAuthorityEvidence(params: {
  trust: CanonicalFieldTrustRecord;
  existing: Record<string, unknown> | null;
}): {
  source: string;
  confidence: AuthorityConfidence;
  lastAcceptedAt: FirebaseFirestore.FieldValue | unknown;
} {
  const existingSource = asNonEmptyString(params.existing?.source);
  const existingConfidence = normalizeAuthorityConfidence(params.existing?.confidence);

  if (existingSource === params.trust.source && existingConfidence === params.trust.confidence) {
    return {
      source: existingSource || params.trust.source,
      confidence: existingConfidence || params.trust.confidence,
      lastAcceptedAt: params.existing?.lastAcceptedAt || FieldValue.serverTimestamp(),
    };
  }

  return {
    source: params.trust.source,
    confidence: params.trust.confidence,
    lastAcceptedAt: FieldValue.serverTimestamp(),
  };
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
  incomingRawBook: Record<string, unknown>;
  canonicalKeys: string[];
  isbn13: string;
  isbn10: string;
  allowIsbnFallback: boolean;
}): Promise<string> {
  const candidates = new Map<
    string,
    {
      data: Record<string, unknown>;
      matchedFields: Set<string>;
    }
  >();
  const queries = [
    ...params.canonicalKeys.slice(0, 6).map((canonicalKey) => ({
      field: "canonicalKey",
      value: canonicalKey,
    })),
    ...(params.allowIsbnFallback && params.isbn13
      ? [{ field: "isbn13", value: params.isbn13 }]
      : []),
    ...(params.allowIsbnFallback && params.isbn10
      ? [{ field: "isbn10", value: params.isbn10 }]
      : []),
  ];

  for (const query of queries) {
    const docs = await findExistingBooksByQuery({
      tx: params.tx,
      field: query.field,
      value: query.value,
    });
    for (const doc of docs) {
      const existing = candidates.get(doc.id);
      const data = (doc.data() || {}) as Record<string, unknown>;
      if (existing) {
        existing.matchedFields.add(query.field);
        existing.data = data;
        continue;
      }
      candidates.set(doc.id, {
        data,
        matchedFields: new Set([query.field]),
      });
    }
  }

  let bestId = "";
  let bestScore = -1;
  for (const [bookId, candidate] of candidates.entries()) {
    if (!areAuthorityAuthorsEquivalent(params.incomingRawBook, candidate.data)) {
      logger.warn("[BOOK_AUTHORITY][AUTHOR_LOCK_REJECTED_FIELD_REUSE]", {
        bookId,
        matchedFields: Array.from(candidate.matchedFields),
        incomingAuthor: extractAuthorityAuthorReference(params.incomingRawBook),
        existingAuthor: extractAuthorityAuthorReference(candidate.data),
      });
      continue;
    }

    const score = scoreExistingBook(candidate.data);
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

  const primaryAuthor = normalizeCanonicalAuthorDisplayName(params.primaryAuthor);
  const author = normalizeCanonicalAuthorDisplayName(params.rawBook.author);
  const authorEn = normalizeCanonicalAuthorDisplayName(params.rawBook.authorEn);
  const authorAr = normalizeCanonicalAuthorDisplayName(params.rawBook.authorAr);

  return {
    source: "booktown",
    rawAuthor: {
      name: isUnknownAuthorDisplayName(author) ? primaryAuthor : author,
      nameEn: isUnknownAuthorDisplayName(authorEn) ? primaryAuthor : authorEn,
      nameAr: isUnknownAuthorDisplayName(authorAr) ? "" : authorAr,
      birthYear: asNonEmptyString(params.rawBook.birthYear),
      birthDate: asNonEmptyString(params.rawBook.birthDate),
      deathYear: asNonEmptyString(params.rawBook.deathYear),
      deathDate: asNonEmptyString(params.rawBook.deathDate),
      aliases: uniqueStrings([
        ...asStringArray(params.rawBook.authors).map((entry) =>
          normalizeCanonicalAuthorDisplayName(entry)
        ),
        author,
        authorEn,
        authorAr,
      ]).filter((entry) => !isUnknownAuthorDisplayName(entry)),
    },
  };
}

function resolveCoverState(params: {
  existingBook: Record<string, unknown> | null;
  coverCandidates: string[];
  coverJobStatus: CoverJobStatus | undefined;
  acceptedIncomingCover: boolean;
}): string {
  const existingState =
    asNonEmptyString(params.existingBook?.coverState) ||
    asNonEmptyString(asRecord(params.existingBook?.cover)?.state);

  if (params.acceptedIncomingCover && params.coverCandidates.length > 0) {
    return "PENDING";
  }

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
  rawBook: Record<string, unknown>;
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
    const externalId =
      resolveEditionProviderIdentity({
        source: params.source,
        providerExternalId: params.providerExternalId,
        rawBook: params.rawBook,
      }) || normalizeSourceIdentityValue(params.source, params.providerExternalId);
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

async function materializeRestrictedAuthorityEnrichmentInTransaction(
  params: MaterializeBookAuthorityParams
): Promise<MaterializeBookAuthorityResult> {
  if (
    (!isRestrictedAuthorityProvider(params.source) &&
      !isWeightedEvidenceProvider(params.source)) ||
    !canProviderEnrichExistingCanonicalBook(params.source)
  ) {
    throw new Error(`[PROVIDER_ROLE] ${params.source} may not enrich canonical books.`);
  }

  const rawBook = params.rawBook || {};
  const incomingTitle = extractPrimaryTitle(rawBook);
  const incomingAuthors = extractAuthors(rawBook);
  const incomingPrimaryAuthor = incomingAuthors[0] || "Unknown";
  const canonicalKeys = buildCanonicalKeys(rawBook, incomingPrimaryAuthor);
  const incomingCanonicalKey =
    canonicalKeys[0] || buildCanonicalKey({ title: incomingTitle, author: incomingPrimaryAuthor });
  const existingTarget = await resolveRestrictedAuthorityExistingBook({
    tx: params.tx,
    preferredBookId: params.preferredBookId,
    incomingRawBook: rawBook,
    canonicalKeys,
  });

  if (!existingTarget || !isCanonicalAuthorityBook(existingTarget.data)) {
    throw new Error(`[PROVIDER_ROLE] ${params.source} may enrich only an existing canonical book.`);
  }

  if (!areAuthorityAuthorsEquivalent(rawBook, existingTarget.data)) {
    logger.warn("[BOOK_AUTHORITY][AUTHOR_LOCK_REJECTED_RESTRICTED_ENRICHMENT]", {
      source: params.source,
      bookId: existingTarget.bookId,
      incomingAuthor: extractAuthorityAuthorReference(rawBook),
      existingAuthor: extractAuthorityAuthorReference(existingTarget.data),
    });
    throw new Error(`[PROVIDER_ROLE] ${params.source} author lock failed for restricted enrichment.`);
  }

  const allowedFields = new Set(getProviderAllowedAuthorityFields(params.source));
  const providerExternalId = asNonEmptyString(params.providerExternalId);
  const locControlNumber = allowedFields.has("locControlNumber")
    ? resolveLocControlNumber(rawBook, providerExternalId)
    : "";
  const oclcNumber = allowedFields.has("oclcNumber")
    ? resolveWorldcatOclcNumber(rawBook, providerExternalId)
    : "";
  const editionCountSupport = allowedFields.has("editionCountSupport")
    ? resolveEditionCountSupport(rawBook)
    : null;
  const originalTitle = allowedFields.has("originalTitle")
    ? asNonEmptyString(rawBook.originalTitle)
    : "";
  const language = allowedFields.has("languageEvidence") ? extractLanguage(rawBook) : "";
  const publicationYear = allowedFields.has("publicationYear")
    ? resolvePublicationYear(rawBook)
    : null;
  const publisher = allowedFields.has("publisher") ? resolvePublisher(rawBook) : null;
  const format = allowedFields.has("formatEvidence") ? resolveEditionFormat(rawBook) : null;
  const now = FieldValue.serverTimestamp();
  const bookRef = db.collection("books").doc(existingTarget.bookId);
  const existingBook = existingTarget.data;
  const existingCanonicalRelations = asRecord(existingBook.canonicalRelations);
  const editionId =
    asNonEmptyString(existingBook.editionId) ||
    asNonEmptyString(existingCanonicalRelations?.primaryEditionId) ||
    null;
  const editionRef = editionId ? db.collection("editions").doc(editionId) : null;
  const editionSnap = editionRef ? await params.tx.get(editionRef) : null;
  const existingEdition = (editionSnap?.data() || null) as Record<string, unknown> | null;

  const bookPatch: Record<string, unknown> = {};
  if (
    canAcceptRestrictedAuthorityString({
      existingValue: existingBook.originalTitle,
      incomingValue: originalTitle,
      allowPlaceholderReplacement: true,
    })
  ) {
    bookPatch.originalTitle = originalTitle;
  }
  if (
    canAcceptRestrictedAuthorityString({
      existingValue: existingBook.locControlNumber,
      incomingValue: locControlNumber,
    })
  ) {
    bookPatch.locControlNumber = locControlNumber;
  }
  if (
    canAcceptRestrictedAuthorityString({
      existingValue: existingBook.oclcNumber,
      incomingValue: oclcNumber,
    })
  ) {
    bookPatch.oclcNumber = oclcNumber;
  }
  if (
    !isFinitePublicationYearValue(existingBook.editionCount) &&
    isFinitePublicationYearValue(editionCountSupport)
  ) {
    bookPatch.editionCount = editionCountSupport;
  }
  if (
    !isFinitePublicationYearValue(existingBook.publicationYear) &&
    isFinitePublicationYearValue(publicationYear)
  ) {
    bookPatch.publicationYear = publicationYear;
  }
  if (
    canAcceptRestrictedAuthorityString({
      existingValue: existingBook.language,
      incomingValue: language,
      allowPlaceholderReplacement: true,
    })
  ) {
    bookPatch.language = language;
  }

  const protectedBookPatch = applyCanonicalProtection(existingBook, bookPatch);
  const mergedBook = { ...existingBook, ...protectedBookPatch };
  if (Object.keys(protectedBookPatch).length > 0) {
    params.tx.set(
      bookRef,
      {
        ...protectedBookPatch,
        updatedAt: now,
        ...buildBookSearchPatch(mergedBook),
      },
      { merge: true }
    );
  }

  const editionPatch: Record<string, unknown> = {};
  if (editionRef && existingEdition) {
    if (
      !isFinitePublicationYearValue(existingEdition.publicationYear) &&
      isFinitePublicationYearValue(publicationYear)
    ) {
      editionPatch.publicationYear = publicationYear;
    }
    if (
      canAcceptRestrictedAuthorityString({
        existingValue: existingEdition.publisher,
        incomingValue: publisher || "",
        allowPlaceholderReplacement: isWeightedEvidenceProvider(params.source),
      })
    ) {
      editionPatch.publisher = publisher;
    }
    if (
      canAcceptRestrictedAuthorityString({
        existingValue: existingEdition.language,
        incomingValue: language,
        allowPlaceholderReplacement: true,
      })
    ) {
      editionPatch.language = language;
    }
    if (
      canAcceptRestrictedAuthorityString({
        existingValue: existingEdition.format,
        incomingValue: format || "",
        allowPlaceholderReplacement: true,
      })
    ) {
      editionPatch.format = format;
    }

    if (Object.keys(editionPatch).length > 0) {
      params.tx.set(
        editionRef,
        {
          ...editionPatch,
          updatedAt: now,
          ...buildEditionSearchPatch({ ...existingEdition, ...editionPatch }),
        },
        { merge: true }
      );
    }
  }

  const fieldConfidencePatch = buildFieldConfidencePatch({
    existingBook,
    entries: [
      {
        field: "publicationYear",
        source: params.source,
        previousValue: existingBook.publicationYear,
        finalValue: mergedBook.publicationYear,
        incomingValue: publicationYear,
      },
      {
        field: "language",
        source: params.source,
        previousValue: existingBook.language,
        finalValue: mergedBook.language,
        incomingValue: language,
      },
      {
        field: "oclcNumber",
        source: params.source,
        previousValue: existingBook.oclcNumber,
        finalValue: mergedBook.oclcNumber,
        incomingValue: oclcNumber,
      },
      {
        field: "publisher",
        source: params.source,
        previousValue: existingEdition?.publisher,
        finalValue:
          (editionRef && existingEdition ? { ...existingEdition, ...editionPatch } : existingEdition)
            ?.publisher,
        incomingValue: publisher,
      },
    ],
  });

  if (fieldConfidencePatch) {
    const existingProvenance = asRecord(existingBook.provenance);
    params.tx.set(
      bookRef,
      applyCanonicalProtection(
        existingBook,
        {
          provenance: {
            ...(existingProvenance || {}),
            fieldConfidence: {
              ...(asRecord(existingProvenance?.fieldConfidence) || {}),
              ...fieldConfidencePatch,
            },
          },
          updatedAt: now,
        }
      ),
      { merge: true }
    );
  }

  if (isWeightedEvidenceProvider(params.source)) {
    const existingProvenance = asRecord(existingBook.provenance);
    const existingWeightedEvidence = asRecord(existingProvenance?.weightedBookEvidence);
    const existingSourceEvidence = asRecord(existingWeightedEvidence?.[params.source]);

    params.tx.set(
      bookRef,
      applyCanonicalProtection(
        existingBook,
        {
          provenance: {
            weightedBookEvidence: {
              ...(existingWeightedEvidence || {}),
              [params.source]: {
                ...(existingSourceEvidence || {}),
                source: params.source,
                confidence: "medium",
                ...(oclcNumber
                  ? { oclcNumber }
                  : existingSourceEvidence?.oclcNumber
                    ? { oclcNumber: existingSourceEvidence.oclcNumber }
                    : {}),
                ...(isFinitePublicationYearValue(editionCountSupport)
                  ? { editionCount: editionCountSupport }
                  : typeof existingSourceEvidence?.editionCount === "number"
                    ? { editionCount: existingSourceEvidence.editionCount }
                    : {}),
                ...(isFinitePublicationYearValue(publicationYear)
                  ? { publicationYear }
                  : {}),
                ...(language ? { language } : {}),
                ...(publisher ? { publisher } : {}),
                ...(format ? { format } : {}),
                updatedAt: now,
              },
            },
          },
          updatedAt: now,
        }
      ),
      { merge: true }
    );
  }

  if (params.ingestionKey) {
    params.tx.set(
      db.collection("book_ingestions").doc(params.ingestionKey),
      {
        ingestionKey: params.ingestionKey,
        source: params.source,
        externalId:
          locControlNumber || oclcNumber || providerExternalId || incomingCanonicalKey,
        canonicalKey: asNonEmptyString(existingBook.canonicalKey) || incomingCanonicalKey,
        identityKeys: [],
        bookId: existingTarget.bookId,
        editionId,
        state: "COMPLETE",
        authorityStatus: "canonical",
        createdAt: existingBook.createdAt || now,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  logger.info("[BOOK_AUTHORITY][RESTRICTED_ENRICHMENT_APPLIED]", {
    source: params.source,
    bookId: existingTarget.bookId,
    editionId,
    appliedBookFields: Object.keys(protectedBookPatch),
    appliedEditionFields:
      editionRef && existingEdition
        ? Object.keys({
            ...(!isFinitePublicationYearValue(existingEdition.publicationYear) &&
            isFinitePublicationYearValue(publicationYear)
              ? { publicationYear }
              : {}),
            ...(canAcceptRestrictedAuthorityString({
              existingValue: existingEdition.publisher,
              incomingValue: publisher || "",
              allowPlaceholderReplacement: isWeightedEvidenceProvider(params.source),
            })
              ? { publisher }
              : {}),
            ...(canAcceptRestrictedAuthorityString({
              existingValue: existingEdition.language,
              incomingValue: language,
              allowPlaceholderReplacement: true,
            })
              ? { language }
              : {}),
            ...(canAcceptRestrictedAuthorityString({
              existingValue: existingEdition.format,
              incomingValue: format || "",
              allowPlaceholderReplacement: true,
            })
              ? { format }
              : {}),
          })
        : [],
  });

  return {
    canonicalBookId: existingTarget.bookId,
    bookId: existingTarget.bookId,
    editionId,
    status: "ALREADY_COMPLETE",
    authorityStatus: "canonical",
    canonicalKey: asNonEmptyString(existingBook.canonicalKey) || incomingCanonicalKey,
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

async function validateBooktownRefineryTransport(
  params: MaterializeBookAuthorityParams
): Promise<MaterializeBookAuthorityResult> {
  const preferredBookId = asNonEmptyString(params.preferredBookId);
  const incomingCanonicalKey = asNonEmptyString(params.rawBook?.canonicalKey);
  let bookSnap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

  if (preferredBookId) {
    bookSnap = await params.tx.get(db.collection("books").doc(preferredBookId));
  } else if (incomingCanonicalKey) {
    const snap = await params.tx.get(
      db.collection("books")
        .where("canonicalKey", "==", incomingCanonicalKey)
        .limit(2)
    );
    if (snap.size === 1) {
      bookSnap = snap.docs[0] ?? null;
    }
  }

  if (!bookSnap?.exists) {
    throw new Error("[BOOK_REFINERY][NO_CANONICAL_TARGET]");
  }

  const existingBook = (bookSnap.data() || {}) as Record<string, unknown>;
  const existingCanonicalKey = asNonEmptyString(existingBook.canonicalKey);
  if (incomingCanonicalKey && existingCanonicalKey && incomingCanonicalKey !== existingCanonicalKey) {
    throw new Error("[BOOK_REFINERY][CANONICAL_KEY_MISMATCH]");
  }

  logger.info("[BOOK_REFINERY][AUTHORITY_PIPELINE_VALIDATED]", {
    bookId: bookSnap.id,
    canonicalKey: existingCanonicalKey || incomingCanonicalKey || null,
    provider: params.source,
    mode: "enrichment_only_noop",
  });

  return {
    canonicalBookId: bookSnap.id,
    bookId: bookSnap.id,
    editionId: asNonEmptyString(existingBook.editionId) || null,
    status: "ALREADY_COMPLETE",
    authorityStatus: "canonical",
    canonicalKey: existingCanonicalKey || incomingCanonicalKey,
  };
}

export async function materializeBookAuthorityInTransaction(
  params: MaterializeBookAuthorityParams
): Promise<MaterializeBookAuthorityResult> {
  if (params.source === "booktownRefinery") {
    return validateBooktownRefineryTransport(params);
  }

  if (isRegisteredProvider(params.source)) {
    if (canProviderEnterCanonicalBookWritePath(params.source)) {
      assertProviderCanEnterCanonicalBookWritePath(params.source);
    } else if (canProviderEnrichExistingCanonicalBook(params.source)) {
      return materializeRestrictedAuthorityEnrichmentInTransaction(params);
    } else {
      assertProviderCanEnterCanonicalBookWritePath(params.source);
    }
  }

  const rawBook = params.rawBook || {};
  const incomingTitle = extractPrimaryTitle(rawBook);
  const incomingAuthors = extractAuthors(rawBook);
  const incomingPrimaryAuthor = incomingAuthors[0] || "Unknown";
  const canonicalKeys = buildCanonicalKeys(rawBook, incomingPrimaryAuthor);
  const incomingCanonicalKey =
    canonicalKeys[0] || buildCanonicalKey({ title: incomingTitle, author: incomingPrimaryAuthor });
  const { isbn13, isbn10 } = extractIsbns(rawBook);
  const providerExternalId = asNonEmptyString(params.providerExternalId);
  const allowIdentityReuse = params.allowIdentityReuse !== false;
  const incomingCoverCandidates = uniqueStrings(
    [
      ...(params.coverCandidates || []),
      asNonEmptyString(rawBook.coverUrl),
    ].filter((entry): entry is string => typeof entry === "string" && isValidHttpUrl(entry)),
    30
  );
  const identityCandidates = buildIdentityCandidates({
    allowIdentityReuse,
    source: params.source,
    providerExternalId,
    canonicalKeys,
    extraIdentityKeys: uniqueStrings(params.extraIdentityKeys || [], 20),
  });

  let resolvedBookId = "";
  const conflictingBookIds = new Set<string>();
  const identitySnapshotsByKey = new Map<
    string,
    FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
  >();
  const bookSnapshotsById = new Map<
    string,
    FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
  >();
  const rejectedIdentityKeys = new Set<string>();

  if (allowIdentityReuse) {
    for (const candidate of identityCandidates) {
      const identityRef = db.collection("book_identity").doc(candidate.key);
      const identitySnap = await params.tx.get(identityRef);
      identitySnapshotsByKey.set(candidate.key, identitySnap);
      const mappedBookId = asNonEmptyString(identitySnap.data()?.bookId);
      if (!mappedBookId) continue;
      let mappedBookSnap = bookSnapshotsById.get(mappedBookId);
      if (!mappedBookSnap) {
        mappedBookSnap = await params.tx.get(db.collection("books").doc(mappedBookId));
        bookSnapshotsById.set(mappedBookId, mappedBookSnap);
      }
      const mappedBookData = (mappedBookSnap.data() || null) as Record<string, unknown> | null;
      if (
        !mappedBookData ||
        !areAuthorityAuthorsEquivalent(rawBook, mappedBookData)
      ) {
        rejectedIdentityKeys.add(candidate.key);
        logger.warn("[BOOK_AUTHORITY][AUTHOR_LOCK_REJECTED_IDENTITY_REUSE]", {
          identityKey: candidate.key,
          mappedBookId,
          incomingAuthor: extractAuthorityAuthorReference(rawBook),
          existingAuthor: extractAuthorityAuthorReference(mappedBookData),
        });
        continue;
      }
      conflictingBookIds.add(mappedBookId);
      if (!resolvedBookId) {
        resolvedBookId = mappedBookId;
      }
    }

    if (!resolvedBookId) {
      resolvedBookId = await resolveExistingBookByFields({
        tx: params.tx,
        incomingRawBook: rawBook,
        canonicalKeys,
        isbn13,
        isbn10,
        allowIsbnFallback:
          params.source === "booktown_canonical" || params.source === "canonical_seed",
      });
    }
  }

  const bookId = resolvedBookId || params.preferredBookId || uuidv4();
  const bookRef = db.collection("books").doc(bookId);
  const bookSnap = await params.tx.get(bookRef);
  const existingBook = (bookSnap.data() || null) as Record<string, unknown> | null;
  const existingProvenance = asRecord(existingBook?.provenance);
  const seedAuthorLock = resolveSeedAuthorLock({
    source: params.source,
    rawBook,
    existingBook,
  });
  const coverJobRef = db.collection("cover_jobs").doc(bookId);
  const coverJobSnap = await params.tx.get(coverJobRef);
  const existingCoverJob = (coverJobSnap.data() || {}) as Record<string, unknown>;
  const title = asNonEmptyString(existingBook?.title) || incomingTitle;
  const authors =
    seedAuthorLock?.authors ||
    (asStringArray(existingBook?.authors).length > 0
      ? asStringArray(existingBook?.authors)
      : incomingAuthors);
  const primaryAuthor =
    seedAuthorLock?.author ||
    asNonEmptyString(existingBook?.author) ||
    incomingPrimaryAuthor;
  const language = asNonEmptyString(existingBook?.language) || extractLanguage(rawBook);
  const titleEn = asNonEmptyString(existingBook?.titleEn) || asNonEmptyString(rawBook.titleEn) || title;
  const titleAr = asNonEmptyString(existingBook?.titleAr) || asNonEmptyString(rawBook.titleAr);
  const authorEn =
    seedAuthorLock?.authorEn ||
    asNonEmptyString(existingBook?.authorEn) ||
    asNonEmptyString(rawBook.authorEn) ||
    primaryAuthor;
  const authorAr = asNonEmptyString(existingBook?.authorAr) || asNonEmptyString(rawBook.authorAr);
  const metadataSource = normalizeMetadataAuthoritySource(params.source);
  const now = FieldValue.serverTimestamp();
  const shouldCreateEdition =
    params.createEdition === true ||
    params.source === "googleBooks" ||
    params.source === "openLibrary" ||
    params.source === "goodreads_import" ||
    params.source === "user_upload" ||
    Boolean(asNonEmptyString(rawBook.storagePath));
  const editionId = resolveEditionId({
    explicitEditionId: params.explicitEditionId,
    source: params.source,
    providerExternalId,
    rawBook,
    bookId,
    shouldCreateEdition,
  });
  const editionRef = editionId ? db.collection("editions").doc(editionId) : null;
  const existingEditionSnap = editionRef ? await params.tx.get(editionRef) : null;
  const existingEdition = (existingEditionSnap?.data() || {}) as Record<string, unknown>;
  const descriptionDecision = resolveMetadataField({
    field: "description",
    existingBook,
    existingValue: asNonEmptyString(existingBook?.description),
    incomingValue: resolveDescription(rawBook),
    incomingRawSource: params.source,
    incomingSource:
      params.descriptionAuthorityOverride === "manualAdmin"
        ? "manualAdmin"
        : metadataSource,
  });
  const coverDecision = resolveMetadataField({
    field: "cover",
    existingBook,
    existingValue: asNonEmptyString(existingBook?.coverUrl),
    incomingValue: incomingCoverCandidates[0] || "",
    incomingRawSource: params.source,
    incomingSource: metadataSource,
  });
  const effectiveCoverCandidates = coverDecision.acceptedIncoming ? incomingCoverCandidates : [];
  const description = descriptionDecision.value;
  const descriptionEn = descriptionDecision.acceptedIncoming
    ? normalizeDescriptionText(asNonEmptyString(rawBook.descriptionEn) || description)
    : asNonEmptyString(existingBook?.descriptionEn) || description;
  const descriptionAr = descriptionDecision.acceptedIncoming
    ? asNonEmptyString(rawBook.descriptionAr)
    : asNonEmptyString(existingBook?.descriptionAr);
  const authorMaterializationRawBook = seedAuthorLock
    ? {
        ...rawBook,
        ...seedAuthorBirthYearPatch(seedAuthorLock, rawBook),
        author: seedAuthorLock.author,
        authorEn: seedAuthorLock.authorEn,
        authors: seedAuthorLock.authors,
        authorCanonicalKey: seedAuthorLock.authorCanonicalKey,
      }
    : rawBook;
  const author =
    asNonEmptyString(existingBook?.authorId) &&
    asNonEmptyString(existingBook?.authorCanonicalKey) &&
    (!seedAuthorLock ||
      asNonEmptyString(existingBook?.authorCanonicalKey) === seedAuthorLock.authorCanonicalKey)
      ? {
          authorId: asNonEmptyString(existingBook?.authorId),
          canonicalKey: asNonEmptyString(existingBook?.authorCanonicalKey),
        }
      : await materializeCanonicalAuthor({
          tx: params.tx,
          source: params.source,
          rawBook: authorMaterializationRawBook,
          primaryAuthor,
        });

  const seedAuthorKeyUpgradeAllowed = seedAuthorLock
    ? canUpgradeSeedAuthorCanonicalKey({
        seedAuthorLock,
        materializedAuthorCanonicalKey: author.canonicalKey,
      })
    : false;
  const effectiveAuthorCanonicalKey = seedAuthorKeyUpgradeAllowed
    ? author.canonicalKey
    : seedAuthorLock?.authorCanonicalKey || author.canonicalKey;

  if (
    seedAuthorLock &&
    author.canonicalKey !== seedAuthorLock.authorCanonicalKey &&
    !canonicalAuthorKeysShareRoot(author.canonicalKey, seedAuthorLock.authorCanonicalKey)
  ) {
    const materializedRoot = extractCanonicalAuthorKeyRoot(author.canonicalKey);
    const seedRoot = extractCanonicalAuthorKeyRoot(seedAuthorLock.authorCanonicalKey);
    if (materializedRoot === "unknown" && seedRoot && seedRoot !== "unknown") {
      logger.warn("[BOOK_AUTHORITY][SEED_AUTHOR_LOCK_IGNORED_UNKNOWN_PROVIDER_AUTHOR]", {
        source: params.source,
        bookId,
        lockedAuthor: seedAuthorLock.author,
        lockedAuthorCanonicalKey: seedAuthorLock.authorCanonicalKey,
        materializedAuthorCanonicalKey: author.canonicalKey,
      });
    } else {
      logger.error("[BOOK_AUTHORITY][SEED_AUTHOR_LOCK_CONFLICT]", {
        source: params.source,
        bookId,
        lockedAuthor: seedAuthorLock.author,
        lockedAuthorCanonicalKey: seedAuthorLock.authorCanonicalKey,
        materializedAuthorCanonicalKey: author.canonicalKey,
      });
      throw new Error("[BOOK_AUTHORITY] seed author lock conflict.");
    }
  }

  if (
    seedAuthorLock &&
    author.canonicalKey !== seedAuthorLock.authorCanonicalKey &&
    canonicalAuthorKeysShareRoot(author.canonicalKey, seedAuthorLock.authorCanonicalKey) &&
    !seedAuthorKeyUpgradeAllowed
  ) {
    logger.warn("[BOOK_AUTHORITY][SEED_AUTHOR_KEY_UPGRADE_REJECTED]", {
      source: params.source,
      bookId,
      lockedAuthor: seedAuthorLock.author,
      lockedAuthorCanonicalKey: seedAuthorLock.authorCanonicalKey,
      materializedAuthorCanonicalKey: author.canonicalKey,
    });
  }

  const authorityFields = toAuthorityFields({
    requestedAuthorityStatus: params.authorityStatus,
    existingBook,
    literaryAuthorityClass: asNonEmptyString(params.literaryAuthorityClass),
  });

  const publicationYear =
    typeof existingBook?.publicationYear === "number" && Number.isFinite(existingBook.publicationYear)
      ? Math.trunc(existingBook.publicationYear)
      : resolvePublicationYear(rawBook);
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
    coverCandidates: effectiveCoverCandidates,
    coverJobStatus: params.coverJobStatus,
    acceptedIncomingCover: coverDecision.acceptedIncoming,
  });
  const providerExternalIds = uniqueStrings([
    ...asStringArray(existingBook?.providerExternalIds),
    ...(providerExternalId && (params.source === "googleBooks" || params.source === "openLibrary")
      ? [
          `${
            params.source
          }:${resolveEditionProviderIdentity({
            source: params.source,
            providerExternalId,
            rawBook,
          })}`,
        ]
      : []),
    ...asStringArray(rawBook.providerExternalIds),
  ], 20);
  // Availability ownership:
  // - hasEbook is classified here by materializeBookAuthority.
  // - externalReadableSources is owned by acquireExternalEbookForRead; this path
  //   preserves an existing value but must not be treated as the source of
  //   external availability truth.
  // - ebookAttachmentId / ebookStoragePath / epubStoragePath are attachment
  //   pointers owned by createEbookAttachment or acquisition finalization.
  // - downloadable / isEbookAvailable are compatibility projections derived
  //   from the authoritative fields above.
  const externalReadableSources = Array.isArray(existingBook?.externalReadableSources)
    ? existingBook?.externalReadableSources
    : [];
  const existingPointerProjection = {
    ebookAttachmentId: asNonEmptyString(existingBook?.ebookAttachmentId) || null,
    ebookStoragePath: asNonEmptyString(existingBook?.ebookStoragePath) || null,
    epubStoragePath: asNonEmptyString(existingBook?.epubStoragePath) || null,
  };

  const canonicalTitleTrust = resolveCanonicalFieldTrust({
    existingBook,
    field: "canonicalTitle",
    existingValue: asNonEmptyString(existingBook?.canonicalTitle),
    incomingValue: titleEn || title,
    source: params.source,
    requestedLock: authorityFields.canonicalLocked,
  });
  const canonicalAuthorIdsTrust = resolveCanonicalFieldTrust({
    existingBook,
    field: "canonicalAuthorIds",
    existingValue: asStringArray(existingBook?.canonicalAuthorIds),
    incomingValue: [author.authorId],
    source: params.source,
    requestedLock: authorityFields.canonicalLocked,
  });
  const canonicalKeyTrust = resolveCanonicalFieldTrust({
    existingBook,
    field: "canonicalKey",
    existingValue: asNonEmptyString(existingBook?.canonicalKey),
    incomingValue: incomingCanonicalKey,
    source: params.source,
    requestedLock: authorityFields.canonicalLocked,
  });
  const canonicalKey = asNonEmptyString(canonicalKeyTrust.value) || incomingCanonicalKey;
  const canonicalAuthorIds = mergeCanonicalAuthorIds(
    canonicalAuthorIdsTrust.value,
    [author.authorId]
  );
  const originalLanguageTrust = resolveCanonicalFieldTrust({
    existingBook,
    field: "originalLanguage",
    existingValue: asNonEmptyString(existingBook?.originalLanguage),
    incomingValue: language,
    source: params.source,
    requestedLock: authorityFields.canonicalLocked,
  });
  const canonicalTitle = asNonEmptyString(canonicalTitleTrust.value) || titleEn || title;
  const originalTitle =
    asNonEmptyString(existingBook?.originalTitle) ||
    asNonEmptyString(rawBook.title) ||
    title;
  const titleAliases = resolveTrustedTitleAliases({
    existingBook,
    rawBook,
    canonicalTitle,
    originalTitle,
  });
  const originalLanguage = asNonEmptyString(originalLanguageTrust.value) || language;
  const workProviderIdentity = resolveWorkProviderIdentity({
    source: params.source,
    providerExternalId,
  });
  const incomingWorkIdentity = normalizeWorkIdentityValue(
    {
      canonicalKey,
      mergeKeys: canonicalKeys,
      ...(workProviderIdentity ? { providerWorkId: `${params.source}:${workProviderIdentity}` } : {}),
    },
    canonicalKey
  );
  const workIdentityTrustBase = resolveCanonicalFieldTrust({
    existingBook,
    field: "workIdentity",
    existingValue: normalizeWorkIdentityValue(existingBook?.workIdentity, canonicalKey),
    incomingValue: incomingWorkIdentity,
    source: params.source,
    requestedLock: authorityFields.canonicalLocked,
  });
  const workIdentity = mergeWorkIdentityValues({
    existingValue: workIdentityTrustBase.value,
    incomingValue: incomingWorkIdentity,
    canonicalKey,
  });
  const canonicalFieldTrust = {
    canonicalTitle: {
      ...canonicalTitleTrust,
      value: canonicalTitle,
    },
    canonicalAuthorIds: {
      ...canonicalAuthorIdsTrust,
      value: canonicalAuthorIds,
    },
    canonicalKey: {
      ...canonicalKeyTrust,
      value: canonicalKey,
    },
    originalLanguage: {
      ...originalLanguageTrust,
      value: originalLanguage,
    },
    workIdentity: {
      ...workIdentityTrustBase,
      value: workIdentity,
    },
  };
  const titleAuthority = toCompatibilityAuthorityEvidence({
    trust: canonicalFieldTrust.canonicalTitle,
    existing: asRecord(existingBook?.titleAuthority),
  });
  const abstractDescriptionAuthority =
    descriptionDecision.authorityMode === "provider_fill"
      ? toAuthorityEvidence("canonical_seed")
      : descriptionDecision.acceptedIncoming || !asNonEmptyString(existingBook?.abstractDescription)
      ? toAuthorityEvidence(params.source)
      : asRecord(existingBook?.abstractDescriptionAuthority);
  const originalLanguageAuthority = toCompatibilityAuthorityEvidence({
    trust: canonicalFieldTrust.originalLanguage,
    existing: asRecord(existingBook?.originalLanguageAuthority),
  });
  const existingCanonicalRelations = asRecord(existingBook?.canonicalRelations);
  const primaryEditionId =
    asNonEmptyString(existingCanonicalRelations?.primaryEditionId) ||
    asNonEmptyString(existingBook?.editionId) ||
    editionId ||
    null;
  const directPublisher = resolvePublisher(rawBook);
  const ontology = enforceOntologyInvariant({
    ontology: resolveMaterializedOntology({
      existingBook,
      rawBook,
      source: params.source,
      authorityStatus: authorityFields.authorityStatus,
      updatedAt: now,
    }),
    source: params.source,
    updatedAt: now,
  });
  const needsEnrichment =
    rawBook.needsEnrichment === true || existingBook?.needsEnrichment === true;
  const fieldConfidencePatch = buildFieldConfidencePatch({
    existingBook,
    entries: [
      {
        field: "publicationYear",
        source: params.source,
        previousValue: existingBook?.publicationYear,
        finalValue: publicationYear,
        incomingValue: resolvePublicationYear(rawBook),
      },
      {
        field: "language",
        source: params.source,
        previousValue: existingBook?.language,
        finalValue: language,
        incomingValue: extractLanguage(rawBook),
      },
      {
        field: "oclcNumber",
        source: params.source,
        previousValue: existingBook?.oclcNumber,
        finalValue: asNonEmptyString(existingBook?.oclcNumber),
        incomingValue: asNonEmptyString(rawBook.oclcNumber),
      },
      {
        field: "publisher",
        source: params.source,
        previousValue: existingEdition?.publisher,
        finalValue: directPublisher,
        incomingValue: directPublisher,
      },
    ],
  });
  const descriptionFillProvenance =
    descriptionDecision.authorityMode === "provider_fill"
      ? {
          mode: "provider_fill" as const,
          filledBySource: descriptionDecision.filledBySource || params.source,
          updatedAt: now,
        }
      : null;

  const bookBase: Record<string, unknown> = {
    id: bookId,
    bookId,
    source: asNonEmptyString(existingBook?.source) || params.source,
    authorityStatus: authorityFields.authorityStatus,
    sourcePriority: authorityFields.sourcePriority,
    workType: authorityFields.workType,
    literaryAuthorityClass: authorityFields.literaryAuthorityClass,
    canonicalLocked: authorityFields.canonicalLocked,
    canonicalTitle,
    originalTitle,
    canonicalAuthorIds,
    originalLanguage,
    ontology,
    literaryForm: ontology.form,
    workIdentity,
    canonicalFieldTrust,
    abstractDescription: description,
    titleAliases,
    canonicalRelations: {
      ...(primaryEditionId ? { primaryEditionId } : {}),
    },
    ...(titleAuthority ? { titleAuthority } : {}),
    ...(abstractDescriptionAuthority ? { abstractDescriptionAuthority } : {}),
    ...(originalLanguageAuthority ? { originalLanguageAuthority } : {}),
    title,
    titleEn,
    titleAr,
    author: seedAuthorLock?.author || primaryAuthor,
    authorEn: seedAuthorLock?.authorEn || authorEn,
    authorAr,
    authors: seedAuthorLock?.authors || authors,
    authorId: author.authorId,
    authorCanonicalKey: effectiveAuthorCanonicalKey,
    description,
    descriptionEn,
    descriptionAr,
    descriptionSource: descriptionDecision.source,
    descriptionAuthority: descriptionDecision.authority,
    language,
    publicationYear,
    isbn13: asNonEmptyString(existingBook?.isbn13) || isbn13 || null,
    isbn10: asNonEmptyString(existingBook?.isbn10) || isbn10 || null,
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
    coverSource: coverDecision.source,
    coverAuthority: coverDecision.authority,
    cover: {
      state: coverState,
      original: asNonEmptyString(asRecord(existingBook?.cover)?.original),
      large: asNonEmptyString(asRecord(existingBook?.cover)?.large),
      medium: asNonEmptyString(asRecord(existingBook?.cover)?.medium),
      small: asNonEmptyString(asRecord(existingBook?.cover)?.small),
    },
    coverUrl: coverDecision.value,
    needsEnrichment,
    ...(fieldConfidencePatch
      ? {
          provenance: {
            ...(existingProvenance || {}),
            fieldConfidence: {
              ...(asRecord(existingProvenance?.fieldConfidence) || {}),
              ...fieldConfidencePatch,
            },
            ...(descriptionFillProvenance
              ? {
                  descriptionAuthority: descriptionFillProvenance,
                }
              : {}),
            ...(seedAuthorLock
              ? {
                  seedAuthorLock: {
                    author: seedAuthorLock.author,
                    authorEn: seedAuthorLock.authorEn,
                    authors: seedAuthorLock.authors,
                    authorCanonicalKey: seedAuthorLock.authorCanonicalKey,
                    source: "canonical_seed",
                  },
                }
              : {}),
          },
        }
      : seedAuthorLock
        ? {
            provenance: {
              ...(existingProvenance || {}),
              ...(descriptionFillProvenance
                ? {
                    descriptionAuthority: descriptionFillProvenance,
                  }
                : {}),
              seedAuthorLock: {
                author: seedAuthorLock.author,
                authorEn: seedAuthorLock.authorEn,
                authors: seedAuthorLock.authors,
                authorCanonicalKey: seedAuthorLock.authorCanonicalKey,
                source: "canonical_seed",
              },
            },
          }
      : descriptionFillProvenance
        ? {
            provenance: {
              ...(existingProvenance || {}),
              descriptionAuthority: descriptionFillProvenance,
            },
          }
      : {}),
    createdAt: existingBook?.createdAt || now,
    updatedAt: now,
  };

  const protectedBookBase = applyCanonicalProtection(existingBook, bookBase);
  const searchPatch = buildBookSearchPatch({
    ...protectedBookBase,
    ...existingPointerProjection,
  });
  // materializeBookAuthority owns the canonical hasEbook classification.
  // downloadable and isEbookAvailable remain derived compatibility projections.
  const shouldHaveEbook =
    params.source === "user_upload" ||
    searchPatch.hasEbook === true ||
    rawBook.hasEbook === true ||
    rawBook.downloadable === true ||
    rawBook.isEbookAvailable === true;

  const finalBookPayload: Record<string, unknown> = {
    ...protectedBookBase,
    ...searchPatch,
    hasEbook: shouldHaveEbook,
    downloadable: shouldHaveEbook || searchPatch.downloadable === true,
    isEbookAvailable: shouldHaveEbook || searchPatch.isEbookAvailable === true,
  };

  if (editionId) {
    finalBookPayload.editionId =
      asNonEmptyString(existingBook?.editionId) || editionId;
  }

  const writableIdentityCandidates = identityCandidates.filter(
    (candidate) => !rejectedIdentityKeys.has(candidate.key)
  );

  if (writableIdentityCandidates.length > 0) {
    finalBookPayload.identityKeys = FieldValue.arrayUnion(
      ...writableIdentityCandidates.map((entry) => entry.key)
    );
  }

  params.tx.set(
    bookRef,
    applyCanonicalProtection(existingBook, finalBookPayload),
    { merge: true }
  );

  if (editionId) {
    const editionProviderIdentity = resolveEditionProviderIdentity({
      source: params.source,
      providerExternalId,
      rawBook,
    });
    const publisher = resolvePublisher(rawBook);
    const format = resolveEditionFormat(rawBook);
    const editionContributors = uniqueStrings([
      ...asStringArray(existingEdition?.editionContributors),
      ...asStringArray(rawBook.editionContributors),
    ]);
    const coverSourceUrl =
      coverDecision.acceptedIncoming ? incomingCoverCandidates[0] || "" : asNonEmptyString(existingEdition?.coverUrl);
    const editionBase: Record<string, unknown> = {
      id: editionId,
      editionId,
      bookId,
      workId: bookId,
      source: params.source,
      externalId:
        editionProviderIdentity &&
        (params.source === "googleBooks" || params.source === "openLibrary")
          ? editionProviderIdentity
          : null,
      providerIds: {
        ...(asRecord(existingEdition?.providerIds) || {}),
        ...(editionProviderIdentity ? { [params.source]: editionProviderIdentity } : {}),
      },
      authorId: author.authorId,
      canonicalKey,
      title,
      titleEn,
      titleAr,
      authors,
      ...(editionContributors.length > 0 ? { editionContributors } : {}),
      authorEn,
      authorAr,
      description,
      descriptionEn,
      descriptionAr,
      language,
      publicationYear,
      isbn13: isbn13 || null,
      isbn10: isbn10 || null,
      publisher,
      format,
      rightsMode,
      visibility,
      status: "active",
      providerExternalIds,
      externalReadableSources,
      cover: {
        ...(asRecord(existingEdition?.cover) || {}),
        ...(coverSourceUrl ? { sourceUrl: coverSourceUrl } : {}),
      },
      ...(coverSourceUrl ? { coverUrl: coverSourceUrl } : {}),
      // Edition-level readability fields mirror the canonical book projection
      // for legacy DTO compatibility. They are not independent availability
      // authorities.
      readabilityFlags: {
        hasEbook: finalBookPayload.hasEbook === true,
        downloadable: finalBookPayload.downloadable === true,
        isEbookAvailable: finalBookPayload.isEbookAvailable === true,
      },
      storagePath:
        asNonEmptyString(rawBook.storagePath) || asNonEmptyString(existingBook?.storagePath) || null,
      createdAt: existingBook?.createdAt || now,
      updatedAt: now,
      hasEbook: finalBookPayload.hasEbook,
      downloadable: finalBookPayload.downloadable,
      isEbookAvailable: finalBookPayload.isEbookAvailable,
    };

    params.tx.set(
      editionRef!,
      {
        ...editionBase,
        ...buildEditionSearchPatch({
          ...editionBase,
          ebookAttachmentId: asNonEmptyString(existingEdition?.ebookAttachmentId) || null,
          ebookStoragePath: asNonEmptyString(existingEdition?.ebookStoragePath) || null,
          epubStoragePath: asNonEmptyString(existingEdition?.epubStoragePath) || null,
        }),
      },
      { merge: true }
    );
  }

  for (const candidate of writableIdentityCandidates) {
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
        identityKeys: writableIdentityCandidates.map((entry) => entry.key),
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

  if (params.coverJobStatus || effectiveCoverCandidates.length > 0) {
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
        candidateUrls: uniqueStrings([...existingCandidateUrls, ...effectiveCoverCandidates], 30),
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
