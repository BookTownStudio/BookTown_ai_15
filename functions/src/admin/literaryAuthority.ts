import { onCall, HttpsError } from "firebase-functions/v2/https";
import { Query, DocumentData, FieldValue } from "firebase-admin/firestore";

import { admin } from "../firebaseAdmin";
import { normalizeSearchText } from "../search/normalization";
import { materializeBookAuthority } from "../library/materializeBookAuthority";
import { ingestBookServerSide } from "../library/ingestBook";
import { buildCanonicalKey } from "../library/persistence/canonicalKey";
import {
  unifiedSearch,
  type UnifiedSearchResult,
} from "../library/search/searchEngine";
import { assertRoleFromClaims } from "../shared/auth";
import {
  type AdminAuthorUpsertInput,
  upsertAdminAuthorInTransaction,
} from "../library/authors/authorCatalog";

const db = admin.firestore();
const MAX_ADMIN_LIMIT = 50;

type AdminAuthorShape = {
  authorId: string;
  canonicalName: string;
  normalizedName: string;
  displayName: string;
  aliases: string[];
  slug?: string;
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  deathPlace?: string;
  nationality?: string;
  languages: string[];
  genres: string[];
  movements: string[];
  period?: string;
  themes: string[];
  influenceTags: string[];
  shortBio?: string;
  fullBio?: string;
  wikipediaUrl?: string;
  goodreadsId?: string;
  openLibraryId?: string;
  wikidataId?: string;
  isni?: string;
  viaf?: string;
  portraitUrl?: string;
  gallery: string[];
  knownWorks: string[];
  bookIds: string[];
  status: "active" | "archived";
  source?: string;
  primarySource?: string;
  provenance?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
};

type AdminCanonicalBookShape = {
  bookId: string;
  canonicalBookId: string;
  title: string;
  author: string;
  language?: string;
  canonicalKey: string;
  authorId?: string;
  authorCanonicalKey?: string;
  authorityStatus: string;
  canonicalLocked: boolean;
  coverState?: string;
  coverSource?: string;
  coverAuthority?: number;
  descriptionSource?: string;
  descriptionAuthority?: number;
  editionId?: string;
};

type AdminSeedCanonicalBatchInput = {
  rows: string;
};

type AdminSeedCanonicalBatchRow = {
  row: number;
  input: string;
  title: string;
  author: string;
  status: "created" | "existing" | "failed";
  canonicalBookId?: string;
  bookId?: string;
  editionId?: string;
  source?: "googleBooks" | "openLibrary";
  providerExternalId?: string;
  message?: string;
};

type AdminSeedCanonicalBatchSummary = {
  successCount: number;
  existingCount: number;
  failedCount: number;
};

type AdminDeleteBookCascadeCounts = {
  books: number;
  editions: number;
  bookIdentity: number;
  bookIngestions: number;
  coverJobs: number;
  readingProgress: number;
  userLibraryBooks: number;
  shelfRefs: number;
  quoteLinks: number;
  authorRefs: number;
  coverStorageFiles: number;
};

type AdminDeleteCanonicalBookResponse = {
  bookId: string;
  deleted: boolean;
  cascade: AdminDeleteBookCascadeCounts;
};

type AdminDeleteCanonicalSeedListRow = {
  row: number;
  input: string;
  title: string;
  author: string;
  status: "success" | "missing" | "failed";
  bookId?: string;
  message?: string;
};

type AdminDeleteCanonicalSeedListSummary = {
  successCount: number;
  missingCount: number;
  failedCount: number;
};

type AdminDeleteCanonicalSeedListInput = {
  rows: string;
};

type AdminDeleteAllBooksInput = {
  confirmation?: unknown;
};

function readRequiredString(value: unknown, field: string, max = 300): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  if (normalized.length > max) {
    throw new HttpsError(
      "invalid-argument",
      `${field} exceeds ${max} characters.`
    );
  }
  return normalized;
}

function readOptionalString(value: unknown, field: string, max = 300): string | undefined {
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
  if (normalized.length > max) {
    throw new HttpsError(
      "invalid-argument",
      `${field} exceeds ${max} characters.`
    );
  }
  return normalized;
}

function readOptionalUrl(value: unknown, field: string, max = 500): string | undefined {
  const normalized = readOptionalString(value, field, max);
  if (!normalized) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new HttpsError("invalid-argument", `${field} must be a valid URL.`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpsError("invalid-argument", `${field} must use http or https.`);
  }

  return parsed.toString();
}

function normalizeLanguage(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.toLowerCase();
}

function parseBulkSeedLine(rawLine: string, row: number): { title: string; author: string; input: string } {
  const input = rawLine.trim();
  if (!input) {
    throw new HttpsError("invalid-argument", `Row ${row} is empty.`);
  }

  const parts = input.split("|");
  if (parts.length !== 2) {
    throw new HttpsError(
      "invalid-argument",
      `Row ${row} must use the format "Title | Author".`
    );
  }

  const title = readRequiredString(parts[0], `rows[${row}].title`, 300);
  const author = readRequiredString(parts[1], `rows[${row}].author`, 240);
  return { title, author, input };
}

function normalizeSeedTitle(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function normalizeSeedAuthor(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function parseBulkSeedRows(value: unknown): Array<{ row: number; title: string; author: string; input: string }> {
  const raw = readRequiredString(value, "rows", 30_000);
  const lines = raw
    .split(/\r?\n/u)
    .map((line, index) => ({ line, row: index + 1 }))
    .filter(({ line }) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new HttpsError("invalid-argument", "rows must contain at least one book.");
  }

  if (lines.length > 100) {
    throw new HttpsError("invalid-argument", "rows exceeds 100 books.");
  }

  return lines.map(({ line, row }) => {
    const parsed = parseBulkSeedLine(line, row);
    return {
      row,
      input: parsed.input,
      title: normalizeSeedTitle(parsed.title),
      author: normalizeSeedAuthor(parsed.author),
    };
  });
}

function mapBatchRowStatus(status: string): "created" | "existing" {
  return status === "CREATED" ? "created" : "existing";
}

function buildBatchSummary(rows: AdminSeedCanonicalBatchRow[]): AdminSeedCanonicalBatchSummary {
  return rows.reduce<AdminSeedCanonicalBatchSummary>(
    (acc, row) => {
      if (row.status === "failed") {
        acc.failedCount += 1;
      } else if (row.status === "existing") {
        acc.successCount += 1;
        acc.existingCount += 1;
      } else {
        acc.successCount += 1;
      }
      return acc;
    },
    {
      successCount: 0,
      existingCount: 0,
      failedCount: 0,
    }
  );
}

function buildDeleteListSummary(
  rows: AdminDeleteCanonicalSeedListRow[]
): AdminDeleteCanonicalSeedListSummary {
  return rows.reduce<AdminDeleteCanonicalSeedListSummary>(
    (acc, row) => {
      if (row.status === "success") acc.successCount += 1;
      if (row.status === "missing") acc.missingCount += 1;
      if (row.status === "failed") acc.failedCount += 1;
      return acc;
    },
    {
      successCount: 0,
      missingCount: 0,
      failedCount: 0,
    }
  );
}

function mapBatchError(error: unknown): string {
  if (error instanceof HttpsError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    seen.add(normalized);
  }
  return Array.from(seen);
}

function sourceAuthorityRank(source: unknown): number {
  if (source === "openLibrary") return 2;
  if (source === "googleBooks") return 1;
  return 0;
}

function canonicalSeedKey(title: string, author: string): string {
  return buildCanonicalKey({
    title: normalizeSeedTitle(title),
    author: normalizeSeedAuthor(author),
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeStableExternalWorkIdentifier(source: string, value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  if (source === "openLibrary") {
    return `openLibrary:${normalized
      .replace(/^openLibrary:/i, "")
      .replace(/^\/works\//i, "")
      .replace(/^OL_/i, "")
      .trim()}`;
  }

  if (source === "wikidata") {
    return `wikidata:${normalized
      .replace(/^wikidata:/i, "")
      .replace(/^https?:\/\/www\.wikidata\.org\/wiki\//i, "")
      .toUpperCase()}`;
  }

  if (normalized.includes(":")) {
    return normalized;
  }

  return normalized;
}

function extractCandidateStableWorkIdentifiers(result: UnifiedSearchResult): string[] {
  const rawBook = asRecord(result.rawBook) || {};
  const workIdentity = asRecord(rawBook.workIdentity);

  return uniqueStrings([
    normalizeStableExternalWorkIdentifier(
      "openLibrary",
      asNonEmptyString(rawBook.openLibraryWorkId)
    ),
    normalizeStableExternalWorkIdentifier(
      "openLibrary",
      asNonEmptyString(rawBook.workId)
    ),
    normalizeStableExternalWorkIdentifier(
      "openLibrary",
      asNonEmptyString(rawBook.key)
    ),
    normalizeStableExternalWorkIdentifier(
      "openLibrary",
      result.source === "openLibrary" ? asNonEmptyString(result.externalId) : ""
    ),
    normalizeStableExternalWorkIdentifier(
      "wikidata",
      asNonEmptyString(rawBook.wikidataId) ||
        asNonEmptyString(rawBook.wikidataQid) ||
        asNonEmptyString(rawBook.wikidata)
    ),
    normalizeStableExternalWorkIdentifier(
      "openLibrary",
      asNonEmptyString(rawBook.providerWorkId) ||
        asNonEmptyString(workIdentity?.providerWorkId)
    ),
    normalizeStableExternalWorkIdentifier(
      "wikidata",
      asNonEmptyString(rawBook.providerWorkId) ||
        asNonEmptyString(workIdentity?.providerWorkId)
    ),
  ]).slice(0, 6);
}

function extractCandidateAliasCanonicalKeys(params: {
  result: UnifiedSearchResult;
  requestedTitle: string;
  requestedAuthor: string;
}): string[] {
  const rawBook = asRecord(params.result.rawBook) || {};
  const requestedCanonicalKey = canonicalSeedKey(params.requestedTitle, params.requestedAuthor);
  const titles = uniqueStrings([
    asNonEmptyString(params.result.title),
    asNonEmptyString(rawBook.title),
    asNonEmptyString(rawBook.titleEn),
    asNonEmptyString(rawBook.titleAr),
    ...asStringArray(rawBook.titleAliases),
    ...asStringArray(rawBook.aliases),
    ...asStringArray(rawBook.alternateTitles),
    ...asStringArray(rawBook.otherTitles),
  ]).slice(0, 8);

  return titles
    .map((title) => canonicalSeedKey(title, params.requestedAuthor))
    .filter((canonicalKey) => canonicalKey && canonicalKey !== requestedCanonicalKey);
}

function normalizeBookAuthorForSeedMatch(data: Record<string, unknown>): string {
  const authorNamesNormalized = Array.isArray(data.authorNamesNormalized)
    ? data.authorNamesNormalized
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];
  if (authorNamesNormalized.length > 0) {
    return authorNamesNormalized[0];
  }
  return normalizeSearchText(
    asNonEmptyString(data.authorEn) || asNonEmptyString(data.author) || asNonEmptyString(data.authorAr)
  );
}

function acceptedAuthorityRankForSurvivor(value: string): number {
  if (value === "manualAuthority") return 400;
  if (value === "openLibrary") return 300;
  if (value === "wikidata") return 200;
  if (value === "googleBooks") return 100;
  return 0;
}

function inferBookAcceptedAuthority(data: Record<string, unknown>): string {
  const trust = asRecord(data.canonicalFieldTrust);
  const workIdentityTrust = asRecord(trust?.workIdentity);
  const titleTrust = asRecord(trust?.canonicalTitle);
  const acceptedAuthority =
    asNonEmptyString(workIdentityTrust?.acceptedAuthority) ||
    asNonEmptyString(titleTrust?.acceptedAuthority);
  if (acceptedAuthority) {
    return acceptedAuthority;
  }

  const source = asNonEmptyString(data.source);
  if (source === "booktown_canonical" || source === "canonical_seed" || source === "manualAuthority") {
    return "manualAuthority";
  }
  if (source === "openLibrary") {
    return "openLibrary";
  }
  if (source === "wikidata") {
    return "wikidata";
  }
  if (source === "googleBooks") {
    return "googleBooks";
  }
  return "";
}

function toSortableTimestampKey(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).padStart(20, "0");
  }
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return "";
}

function normalizeBookProviderWorkId(value: unknown): string {
  const raw = asNonEmptyString(value);
  if (!raw) {
    return "";
  }
  if (
    raw.startsWith("openLibrary:") ||
    raw.startsWith("/works/") ||
    /^OL\d+W$/iu.test(raw) ||
    /^OL_?/iu.test(raw)
  ) {
    return normalizeStableExternalWorkIdentifier("openLibrary", raw);
  }
  if (
    raw.startsWith("wikidata:") ||
    /^Q\d+$/iu.test(raw) ||
    /^https?:\/\/www\.wikidata\.org\/wiki\//iu.test(raw)
  ) {
    return normalizeStableExternalWorkIdentifier("wikidata", raw);
  }
  return raw;
}

function extractBookProviderWorkId(data: Record<string, unknown>): string {
  return normalizeBookProviderWorkId(asRecord(data.workIdentity)?.providerWorkId);
}

function extractBookWorkMergeKeys(data: Record<string, unknown>): string[] {
  const workIdentity = asRecord(data.workIdentity);
  return uniqueStrings([
    asNonEmptyString(data.canonicalKey),
    ...asStringArray(workIdentity?.mergeKeys),
  ]);
}

function collectDuplicateTitleAliases(data: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...asStringArray(data.titleAliases),
    asNonEmptyString(data.canonicalTitle),
    asNonEmptyString(data.originalTitle),
    asNonEmptyString(data.title),
    asNonEmptyString(data.titleEn),
  ]);
}

function compareCanonicalSurvivors(
  left: { bookId: string; data: Record<string, unknown> },
  right: { bookId: string; data: Record<string, unknown> }
): number {
  const rankDelta =
    acceptedAuthorityRankForSurvivor(inferBookAcceptedAuthority(right.data)) -
    acceptedAuthorityRankForSurvivor(inferBookAcceptedAuthority(left.data));
  if (rankDelta !== 0) {
    return rankDelta;
  }

  const leftCreatedAt =
    toSortableTimestampKey(left.data.createdAt) || toSortableTimestampKey(left.data.updatedAt) || left.bookId;
  const rightCreatedAt =
    toSortableTimestampKey(right.data.createdAt) || toSortableTimestampKey(right.data.updatedAt) || right.bookId;
  const ageDelta = leftCreatedAt.localeCompare(rightCreatedAt);
  if (ageDelta !== 0) {
    return ageDelta;
  }

  return left.bookId.localeCompare(right.bookId);
}

async function mergeCanonicalDuplicateGroup(params: {
  providerWorkId: string;
  candidates: Array<{ bookId: string; data: Record<string, unknown> }>;
}): Promise<{ survivorId: string; survivorData: Record<string, unknown> } | null> {
  const activeCandidates = params.candidates.filter((candidate) => {
    if (asNonEmptyString(candidate.data.mergedInto)) {
      return false;
    }
    if (extractBookProviderWorkId(candidate.data) !== params.providerWorkId) {
      return false;
    }
    return (
      asNonEmptyString(candidate.data.authorityStatus) === "canonical" ||
      asNonEmptyString(candidate.data.workType) === "canonical" ||
      candidate.data.canonicalLocked === true
    );
  });

  if (activeCandidates.length === 0) {
    return null;
  }

  const ordered = [...activeCandidates].sort(compareCanonicalSurvivors);
  const survivor = ordered[0];
  const duplicates = ordered.slice(1);
  if (duplicates.length === 0) {
    return { survivorId: survivor.bookId, survivorData: survivor.data };
  }

  return db.runTransaction(async (tx) => {
    const refs = ordered.map((candidate) => db.collection("books").doc(candidate.bookId));
    const snapshots = await tx.getAll(...refs);
    const freshCandidates = snapshots
      .filter((snap) => snap.exists)
      .map((snap) => ({
        bookId: snap.id,
        data: (snap.data() || {}) as Record<string, unknown>,
      }))
      .filter((candidate) => !asNonEmptyString(candidate.data.mergedInto))
      .filter((candidate) => extractBookProviderWorkId(candidate.data) === params.providerWorkId);

    if (freshCandidates.length === 0) {
      return null;
    }

    const freshOrdered = [...freshCandidates].sort(compareCanonicalSurvivors);
    const freshSurvivor = freshOrdered[0];
    const freshDuplicates = freshOrdered.slice(1);
    if (freshDuplicates.length === 0) {
      return {
        survivorId: freshSurvivor.bookId,
        survivorData: freshSurvivor.data,
      };
    }

    const survivorRef = db.collection("books").doc(freshSurvivor.bookId);
    const survivorAliases = uniqueStrings([
      ...asStringArray(freshSurvivor.data.titleAliases),
      ...freshDuplicates.flatMap((candidate) => collectDuplicateTitleAliases(candidate.data)),
    ]).filter((entry) => entry !== asNonEmptyString(freshSurvivor.data.canonicalTitle));
    const survivorCanonicalAuthorIds = uniqueStrings([
      ...asStringArray(freshSurvivor.data.canonicalAuthorIds),
      ...freshDuplicates.flatMap((candidate) => asStringArray(candidate.data.canonicalAuthorIds)),
    ]);
    const survivorWorkIdentity = {
      ...(asRecord(freshSurvivor.data.workIdentity) || {}),
      canonicalKey:
        asNonEmptyString(asRecord(freshSurvivor.data.workIdentity)?.canonicalKey) ||
        asNonEmptyString(freshSurvivor.data.canonicalKey),
      mergeKeys: uniqueStrings([
        ...extractBookWorkMergeKeys(freshSurvivor.data),
        ...freshDuplicates.flatMap((candidate) => extractBookWorkMergeKeys(candidate.data)),
      ]),
      providerWorkId: params.providerWorkId,
    };

    const survivorData = {
      ...freshSurvivor.data,
      titleAliases: survivorAliases,
      canonicalAuthorIds: survivorCanonicalAuthorIds,
      workIdentity: survivorWorkIdentity,
      updatedAt: FieldValue.serverTimestamp(),
    };

    tx.set(
      survivorRef,
      {
        titleAliases: survivorAliases,
        canonicalAuthorIds: survivorCanonicalAuthorIds,
        workIdentity: survivorWorkIdentity,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    for (const duplicate of freshDuplicates) {
      tx.set(
        db.collection("books").doc(duplicate.bookId),
        {
          mergedInto: freshSurvivor.bookId,
          mergeState: "merged_duplicate",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return {
      survivorId: freshSurvivor.bookId,
      survivorData,
    };
  });
}

function scoreExistingSeedWork(params: {
  data: Record<string, unknown>;
  requestedCanonicalKey: string;
  requestedTitleNorm: string;
  requestedAuthorNorm: string;
  matchedProviderWorkIds?: ReadonlySet<string>;
  matchedAliasCanonicalKeys?: ReadonlySet<string>;
}): number {
  const dataCanonicalKey = asNonEmptyString(params.data.canonicalKey);
  const normalizedTitle =
    asNonEmptyString(params.data.normalizedTitle) ||
    asNonEmptyString(params.data.titleEnNormalized) ||
    normalizeSearchText(
      asNonEmptyString(params.data.canonicalTitle) ||
        asNonEmptyString(params.data.titleEn) ||
        asNonEmptyString(params.data.title)
    );
  const normalizedAuthor = normalizeBookAuthorForSeedMatch(params.data);
  const providerWorkId = extractBookProviderWorkId(params.data);
  const mergeKeys = extractBookWorkMergeKeys(params.data);
  const isCanonical =
    asNonEmptyString(params.data.authorityStatus) === "canonical" ||
    asNonEmptyString(params.data.workType) === "canonical" ||
    params.data.canonicalLocked === true;

  let score = 0;
  if (asNonEmptyString(params.data.mergedInto)) return Number.NEGATIVE_INFINITY;
  if (params.matchedProviderWorkIds?.has(providerWorkId)) score += 220;
  if (dataCanonicalKey === params.requestedCanonicalKey) score += 100;
  if (mergeKeys.includes(params.requestedCanonicalKey)) score += 140;
  if (params.matchedAliasCanonicalKeys?.has(dataCanonicalKey)) score += 120;
  if (normalizedTitle === params.requestedTitleNorm) score += 60;
  if (normalizedAuthor === params.requestedAuthorNorm) score += 40;
  if (
    normalizedAuthor &&
    params.requestedAuthorNorm &&
    (normalizedAuthor.startsWith(params.requestedAuthorNorm) ||
      params.requestedAuthorNorm.startsWith(normalizedAuthor))
  ) {
    score += 10;
  }
  if (isCanonical) score += 20;
  return score;
}

async function resolveExistingCanonicalWorkForSeed(params: {
  title: string;
  author: string;
  candidate?: UnifiedSearchResult;
}): Promise<{ bookId: string; data: Record<string, unknown> } | null> {
  const requestedCanonicalKey = canonicalSeedKey(params.title, params.author);
  const requestedTitleNorm = normalizeSearchText(params.title);
  const requestedAuthorNorm = normalizeSearchText(params.author);
  const matchedProviderWorkIds = new Set(
    params.candidate ? extractCandidateStableWorkIdentifiers(params.candidate) : []
  );
  const matchedAliasCanonicalKeys = new Set(
    params.candidate
      ? extractCandidateAliasCanonicalKeys({
          result: params.candidate,
          requestedTitle: params.title,
          requestedAuthor: params.author,
        })
      : []
  );

  const queryJobs: Array<Promise<{ docs: Array<{ id: string; data: () => unknown }> }>> = [
    db.collection("books").where("canonicalKey", "==", requestedCanonicalKey).limit(5).get(),
    db.collection("books").where("normalizedTitle", "==", requestedTitleNorm).limit(10).get(),
    db.collection("books").where("titleEnNormalized", "==", requestedTitleNorm).limit(10).get(),
  ];

  for (const providerWorkId of matchedProviderWorkIds) {
    queryJobs.push(
      db.collection("books").where("workIdentity.providerWorkId", "==", providerWorkId).limit(5).get()
    );
  }

  for (const aliasCanonicalKey of matchedAliasCanonicalKeys) {
    queryJobs.push(
      db.collection("books").where("canonicalKey", "==", aliasCanonicalKey).limit(5).get()
    );
  }

  const snapshots = await Promise.all(queryJobs);

  const candidates = new Map<string, Record<string, unknown>>();
  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      candidates.set(doc.id, (doc.data() || {}) as Record<string, unknown>);
    }
  }

  const discoveredProviderWorkIds = uniqueStrings([
    ...matchedProviderWorkIds,
    ...Array.from(candidates.values())
      .map((data) => extractBookProviderWorkId(data))
      .filter(Boolean),
  ]);

  if (discoveredProviderWorkIds.length > 0) {
    const additionalProviderSnapshots = await Promise.all(
      discoveredProviderWorkIds.map((providerWorkId) =>
        db.collection("books").where("workIdentity.providerWorkId", "==", providerWorkId).limit(10).get()
      )
    );

    for (const snap of additionalProviderSnapshots) {
      for (const doc of snap.docs) {
        candidates.set(doc.id, (doc.data() || {}) as Record<string, unknown>);
      }
    }
  }

  const mergedIntoIds = uniqueStrings(
    Array.from(candidates.values())
      .map((data) => asNonEmptyString(data.mergedInto))
      .filter(Boolean)
  );
  if (mergedIntoIds.length > 0) {
    const mergedSurvivorSnapshots = await Promise.all(
      mergedIntoIds.map((bookId) => db.collection("books").doc(bookId).get())
    );
    for (const snap of mergedSurvivorSnapshots) {
      if (!snap.exists) continue;
      candidates.set(snap.id, (snap.data() || {}) as Record<string, unknown>);
    }
  }

  for (const providerWorkId of discoveredProviderWorkIds) {
    const mergeResult = await mergeCanonicalDuplicateGroup({
      providerWorkId,
      candidates: Array.from(candidates.entries()).map(([bookId, data]) => ({
        bookId,
        data,
      })),
    });
    if (!mergeResult) {
      continue;
    }

    candidates.set(mergeResult.survivorId, mergeResult.survivorData);
    for (const [bookId, data] of candidates.entries()) {
      if (bookId === mergeResult.survivorId) continue;
      if (extractBookProviderWorkId(data) !== providerWorkId) continue;
      candidates.set(bookId, {
        ...data,
        mergedInto: mergeResult.survivorId,
      });
    }
  }

  let best: { bookId: string; data: Record<string, unknown>; score: number } | null = null;

  for (const [bookId, data] of candidates.entries()) {
    const score = scoreExistingSeedWork({
      data,
      requestedCanonicalKey,
      requestedTitleNorm,
      requestedAuthorNorm,
      matchedProviderWorkIds,
      matchedAliasCanonicalKeys,
    });
    if (score < 100) {
      continue;
    }
    if (!best || score > best.score) {
      best = { bookId, data, score };
    }
  }

  if (!best) {
    return null;
  }

  const mergedInto = asNonEmptyString(best.data.mergedInto);
  if (!mergedInto || mergedInto === best.bookId) {
    return { bookId: best.bookId, data: best.data };
  }

  const survivorSnap = await db.collection("books").doc(mergedInto).get();
  if (!survivorSnap.exists) {
    return { bookId: best.bookId, data: best.data };
  }

  return {
    bookId: survivorSnap.id,
    data: (survivorSnap.data() || {}) as Record<string, unknown>,
  };
}

function emptyDeleteCascadeCounts(): AdminDeleteBookCascadeCounts {
  return {
    books: 0,
    editions: 0,
    bookIdentity: 0,
    bookIngestions: 0,
    coverJobs: 0,
    readingProgress: 0,
    userLibraryBooks: 0,
    shelfRefs: 0,
    quoteLinks: 0,
    authorRefs: 0,
    coverStorageFiles: 0,
  };
}

async function deleteStoragePrefix(prefix: string): Promise<number> {
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles({ prefix });
  if (!Array.isArray(files) || files.length === 0) {
    return 0;
  }
  await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
  return files.length;
}

function normalizeCandidateAuthor(result: UnifiedSearchResult): string {
  const author =
    (Array.isArray(result.authors) ? result.authors[0] : "") ||
    result.authorEn ||
    "";
  return normalizeSearchText(author);
}

function candidateHasUsableCover(result: UnifiedSearchResult): boolean {
  const rawBook =
    result.rawBook && typeof result.rawBook === "object" && !Array.isArray(result.rawBook)
      ? (result.rawBook as Record<string, unknown>)
      : null;

  const directCoverUrl =
    typeof result.coverUrl === "string" && result.coverUrl.trim().length > 0;
  const rawCoverUrl =
    typeof rawBook?.coverUrl === "string" && rawBook.coverUrl.trim().length > 0;
  const rawThumbnail =
    typeof rawBook?.thumbnail === "string" && rawBook.thumbnail.trim().length > 0;
  const rawCoverId =
    typeof rawBook?.coverId === "string" && rawBook.coverId.trim().length > 0;
  const rawCoverI =
    typeof rawBook?.cover_i === "string" && rawBook.cover_i.trim().length > 0;

  return directCoverUrl || rawCoverUrl || rawThumbnail || rawCoverId || rawCoverI;
}

function normalizeBulkCanonicalTitle(params: {
  providerTitle: string;
  requestedTitle: string;
  requestedAuthor: string;
}): string | null {
  const providerTitle = params.providerTitle.trim();
  const requestedTitle = params.requestedTitle.trim();
  const requestedAuthorNorm = normalizeSearchText(params.requestedAuthor);
  const providerTitleNorm = normalizeSearchText(providerTitle);
  const requestedTitleNorm = normalizeSearchText(requestedTitle);

  if (!providerTitle || !requestedTitle || !providerTitleNorm || !requestedTitleNorm) {
    return null;
  }

  if (providerTitleNorm === requestedTitleNorm) {
    return null;
  }

  if (!providerTitleNorm.startsWith(requestedTitleNorm)) {
    return null;
  }

  const trailingNorm = providerTitleNorm.slice(requestedTitleNorm.length).trim();
  if (!trailingNorm) {
    return null;
  }

  const hasAuthorSuffix =
    requestedAuthorNorm.length > 0 &&
    (trailingNorm.includes(`by ${requestedAuthorNorm}`) ||
      trailingNorm.includes(requestedAuthorNorm));
  const hasEditionNoise =
    /\bunabridged\b/u.test(trailingNorm) || /(?:^|\s)(1[0-9]{3}|20[0-9]{2})(?:\s|$)/u.test(trailingNorm);

  return hasAuthorSuffix || hasEditionNoise ? requestedTitle : null;
}

function prepareBulkCandidateRawBook(params: {
  result: UnifiedSearchResult;
  requestedTitle: string;
  requestedAuthor: string;
}): Record<string, unknown> | undefined {
  const rawBook =
    params.result.rawBook && typeof params.result.rawBook === "object" && !Array.isArray(params.result.rawBook)
      ? ({ ...(params.result.rawBook as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  const providerTitle =
    typeof rawBook.title === "string" && rawBook.title.trim().length > 0
      ? rawBook.title
      : params.result.title;
  const cleanedTitle = normalizeBulkCanonicalTitle({
    providerTitle,
    requestedTitle: params.requestedTitle,
    requestedAuthor: params.requestedAuthor,
  });

  const canonicalTitle = cleanedTitle || params.requestedTitle;
  const requestedAuthor = params.requestedAuthor.trim();
  const providerTitleNorm = normalizeSearchText(providerTitle);
  const requestedTitleNorm = normalizeSearchText(params.requestedTitle);
  const providerAuthor =
    typeof rawBook.author === "string" && rawBook.author.trim().length > 0
      ? rawBook.author
      : params.result.authorEn || "";
  const providerAuthorNorm = normalizeSearchText(providerAuthor);
  const requestedAuthorNorm = normalizeSearchText(requestedAuthor);

  if (providerTitleNorm && providerTitleNorm !== requestedTitleNorm) {
    rawBook.titleAliases = uniqueStrings([
      ...asStringArray(rawBook.titleAliases),
      providerTitle,
    ]);
  }

  if (providerAuthorNorm && providerAuthorNorm !== requestedAuthorNorm) {
    rawBook.authorAliases = uniqueStrings([
      ...asStringArray(rawBook.authorAliases),
      providerAuthor,
    ]);
  }

  rawBook.title = canonicalTitle;
  rawBook.titleEn = canonicalTitle;
  rawBook.author = requestedAuthor;
  rawBook.authorEn = requestedAuthor;
  rawBook.authors = [requestedAuthor];
  return rawBook;
}

function hasPublisherArtifactAuthor(authorNorm: string): boolean {
  if (!authorNorm) return true;
  return [
    "publisher",
    "publishing",
    "press",
    "books",
    "bookread",
    "read",
    "channel",
    "official",
    "media",
    "audiobook",
    "audio books",
    "tv",
    "studio",
  ].some((token) => authorNorm.includes(token));
}

function isWeakBulkCandidate(params: {
  result: UnifiedSearchResult;
  requestedTitleNorm: string;
  requestedAuthorNorm: string;
}): boolean {
  const titleNorm = normalizeSearchText(params.result.title);
  const authorNorm = normalizeCandidateAuthor(params.result);

  if (!titleNorm || !authorNorm) {
    return true;
  }

  if (titleNorm.includes(` by ${params.requestedAuthorNorm}`)) {
    return true;
  }

  if (hasPublisherArtifactAuthor(authorNorm)) {
    return true;
  }

  if (titleNorm.includes(params.requestedAuthorNorm)) {
    return true;
  }

  if (params.requestedAuthorNorm && titleNorm.includes(authorNorm)) {
    return true;
  }

  return false;
}

function computeBulkCandidateScore(params: {
  result: UnifiedSearchResult;
  requestedTitleNorm: string;
  requestedAuthorNorm: string;
}): number {
  const titleNorm = normalizeSearchText(params.result.title);
  const authorNorm = normalizeCandidateAuthor(params.result);
  let score = 0;

  if (titleNorm === params.requestedTitleNorm) {
    score += 100;
  } else if (
    params.requestedTitleNorm &&
    (titleNorm.startsWith(`${params.requestedTitleNorm} `) ||
      titleNorm.endsWith(` ${params.requestedTitleNorm}`))
  ) {
    score += 20;
  }

  if (authorNorm === params.requestedAuthorNorm) {
    score += 80;
  } else if (
    params.requestedAuthorNorm &&
    (authorNorm.startsWith(params.requestedAuthorNorm) ||
      params.requestedAuthorNorm.startsWith(authorNorm))
  ) {
    score += 15;
  }

  if (candidateHasUsableCover(params.result)) {
    score += 10;
  }

  score += Number.isFinite(params.result.confidence) ? params.result.confidence : 0;
  score -= typeof params.result.rank === "number" ? params.result.rank : 0;

  return score;
}

function selectStrongestBulkProviderCandidate(params: {
  results: UnifiedSearchResult[];
  requestedTitle: string;
  requestedAuthor: string;
}): UnifiedSearchResult | null {
  const requestedTitleNorm = normalizeSearchText(params.requestedTitle);
  const requestedAuthorNorm = normalizeSearchText(params.requestedAuthor);

  const providerCandidates = params.results.filter(
    (result) =>
      result.resultType === "external" &&
      (result.source === "googleBooks" || result.source === "openLibrary") &&
      typeof result.externalId === "string" &&
      result.externalId.trim().length > 0
  );

  const strongCandidates = providerCandidates.filter(
    (result) =>
      !isWeakBulkCandidate({
        result,
        requestedTitleNorm,
        requestedAuthorNorm,
      })
  );

  const candidates = strongCandidates.length > 0 ? strongCandidates : providerCandidates;
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    const scoreDelta =
      computeBulkCandidateScore({
        result: right,
        requestedTitleNorm,
        requestedAuthorNorm,
      }) -
      computeBulkCandidateScore({
        result: left,
        requestedTitleNorm,
        requestedAuthorNorm,
      });
    if (scoreDelta !== 0) return scoreDelta;
    const sourceDelta = sourceAuthorityRank(right.source) - sourceAuthorityRank(left.source);
    if (sourceDelta !== 0) return sourceDelta;
    return left.rank - right.rank;
  })[0] || null;
}

function computeDeleteCanonicalScore(params: {
  result: UnifiedSearchResult;
  requestedTitleNorm: string;
  requestedAuthorNorm: string;
}): number {
  if (params.result.resultType !== "canonical") {
    return Number.NEGATIVE_INFINITY;
  }

  const titleNorm = normalizeSearchText(params.result.title);
  const authorNorm = normalizeCandidateAuthor(params.result);
  let score = 0;

  if (titleNorm === params.requestedTitleNorm) {
    score += 100;
  } else if (
    params.requestedTitleNorm &&
    (titleNorm.startsWith(`${params.requestedTitleNorm} `) ||
      params.requestedTitleNorm.startsWith(titleNorm))
  ) {
    score += 20;
  }

  if (authorNorm === params.requestedAuthorNorm) {
    score += 80;
  } else if (
    params.requestedAuthorNorm &&
    (authorNorm.startsWith(params.requestedAuthorNorm) ||
      params.requestedAuthorNorm.startsWith(authorNorm))
  ) {
    score += 15;
  }

  score += Number.isFinite(params.result.confidence) ? params.result.confidence : 0;
  score -= typeof params.result.rank === "number" ? params.result.rank : 0;
  return score;
}

async function resolveCanonicalBookIdForDelete(params: {
  title: string;
  author: string;
}): Promise<string | null> {
  const search = await unifiedSearch(`${params.title} ${params.author}`.trim(), {
    limit: 10,
  });
  const requestedTitleNorm = normalizeSearchText(params.title);
  const requestedAuthorNorm = normalizeSearchText(params.author);
  const candidates = search.results.filter((result) => result.resultType === "canonical");
  if (candidates.length === 0) {
    return null;
  }

  const selected = [...candidates].sort((left, right) => {
    const scoreDelta =
      computeDeleteCanonicalScore({
        result: right,
        requestedTitleNorm,
        requestedAuthorNorm,
      }) -
      computeDeleteCanonicalScore({
        result: left,
        requestedTitleNorm,
        requestedAuthorNorm,
      });
    if (scoreDelta !== 0) return scoreDelta;
    return left.rank - right.rank;
  })[0];

  return selected?.bookId || null;
}

async function deleteCanonicalBookCascade(bookId: string): Promise<AdminDeleteCanonicalBookResponse> {
  const counts = emptyDeleteCascadeCounts();
  const bookRef = db.collection("books").doc(bookId);
  const [bookSnap, editionsSnap, identitySnap, ingestionSnap, readingProgressSnap, librarySnap, quotesSnap] =
    await Promise.all([
      bookRef.get(),
      db.collection("editions").where("bookId", "==", bookId).get(),
      db.collection("book_identity").where("bookId", "==", bookId).get(),
      db.collection("book_ingestions").where("bookId", "==", bookId).get(),
      db.collection("reading_progress").where("bookId", "==", bookId).get(),
      db.collection("user_library_books").where("bookId", "==", bookId).get(),
      db.collection("quotes").where("bookId", "==", bookId).get(),
    ]);

  if (!bookSnap.exists) {
    return {
      bookId,
      deleted: false,
      cascade: counts,
    };
  }

  const bookData = (bookSnap.data() || {}) as Record<string, unknown>;
  const authorId = readOptionalString(bookData.authorId, "authorId", 180);

  const shelfRefs = new Map<string, FirebaseFirestore.DocumentReference>();
  for (const doc of librarySnap.docs) {
    const data = (doc.data() || {}) as Record<string, unknown>;
    const shelfIds = Array.isArray(data.shelfIds) ? data.shelfIds : [];
    for (const shelfId of shelfIds) {
      const normalizedShelfId =
        typeof shelfId === "string" && shelfId.trim().length > 0 ? shelfId.trim() : "";
      if (normalizedShelfId && !shelfRefs.has(normalizedShelfId)) {
        shelfRefs.set(normalizedShelfId, db.collection("shelves").doc(normalizedShelfId));
      }
    }
  }

  for (const shelfRef of shelfRefs.values()) {
    const shelfSnap = await shelfRef.get();
    if (!shelfSnap.exists) continue;
    const shelfData = (shelfSnap.data() || {}) as Record<string, unknown>;
    const orderedBookIds = Array.isArray(shelfData.orderedBookIds)
      ? shelfData.orderedBookIds.filter((entry) => entry !== bookId)
      : undefined;
    await shelfRef.set(
      {
        [`entries.${bookId}`]: FieldValue.delete(),
        ...(orderedBookIds ? { orderedBookIds } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    counts.shelfRefs += 1;
  }

  for (const quoteDoc of quotesSnap.docs) {
    await quoteDoc.ref.set(
      {
        bookId: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    counts.quoteLinks += 1;
  }

  if (authorId) {
    const authorRef = db.collection("authors").doc(authorId);
    const authorSnap = await authorRef.get();
    if (authorSnap.exists) {
      const authorData = (authorSnap.data() || {}) as Record<string, unknown>;
      const nextBookIds = Array.isArray(authorData.bookIds)
        ? authorData.bookIds.filter((entry) => entry !== bookId)
        : [];
      await authorRef.set(
        {
          bookIds: nextBookIds,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      counts.authorRefs += 1;
    }
  }

  const coverJobRefs = [
    db.collection("cover_jobs").doc(bookId),
    db.collection("coverJobs").doc(bookId),
  ];
  for (const ref of coverJobRefs) {
    const snap = await ref.get();
    if (snap.exists) {
      await ref.delete();
      counts.coverJobs += 1;
    }
  }

  for (const doc of editionsSnap.docs) {
    await doc.ref.delete();
    counts.editions += 1;
  }
  for (const doc of identitySnap.docs) {
    await doc.ref.delete();
    counts.bookIdentity += 1;
  }
  for (const doc of ingestionSnap.docs) {
    await doc.ref.delete();
    counts.bookIngestions += 1;
  }
  for (const doc of readingProgressSnap.docs) {
    await doc.ref.delete();
    counts.readingProgress += 1;
  }
  for (const doc of librarySnap.docs) {
    await doc.ref.delete();
    counts.userLibraryBooks += 1;
  }

  await bookRef.delete();
  counts.books += 1;
  counts.coverStorageFiles += await deleteStoragePrefix(`books/${bookId}/covers/`);

  return {
    bookId,
    deleted: true,
    cascade: counts,
  };
}

function parseOptionalIsbn(value: unknown): { isbn10?: string; isbn13?: string } {
  const normalized = readOptionalString(value, "isbn", 32);
  if (!normalized) {
    return {};
  }

  const candidate = normalized.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (/^\d{13}$/.test(candidate)) {
    return { isbn13: candidate };
  }
  if (/^\d{9}[\dX]$/.test(candidate)) {
    return { isbn10: candidate };
  }

  throw new HttpsError("invalid-argument", "isbn must be a valid ISBN-10 or ISBN-13.");
}

function readStringArray(value: unknown, max = 24): string[] {
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
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return undefined;
}

function mapAdminAuthor(raw: DocumentData, authorId: string): AdminAuthorShape {
  const authorityLinks =
    raw.authorityLinks && typeof raw.authorityLinks === "object"
      ? (raw.authorityLinks as Record<string, unknown>)
      : {};

  return {
    authorId,
    canonicalName:
      typeof raw.canonicalName === "string" && raw.canonicalName.trim()
        ? raw.canonicalName.trim()
        : typeof raw.nameEn === "string" && raw.nameEn.trim()
          ? raw.nameEn.trim()
          : authorId,
    normalizedName:
      typeof raw.normalizedName === "string" && raw.normalizedName.trim()
        ? raw.normalizedName.trim()
        : normalizeSearchText(
            typeof raw.canonicalName === "string"
              ? raw.canonicalName
              : typeof raw.nameEn === "string"
                ? raw.nameEn
                : ""
          ),
   displayName:
      typeof raw.displayName === "string" && raw.displayName.trim()
        ? raw.displayName.trim()
        : typeof raw.nameEn === "string" && raw.nameEn.trim()
          ? raw.nameEn.trim()
          : authorId,
    aliases: readStringArray(raw.aliases, 40),
    slug:
      typeof raw.slug === "string" && raw.slug.trim()
        ? raw.slug.trim()
        : undefined,
    birthDate:
      typeof raw.birthDate === "string" && raw.birthDate.trim()
        ? raw.birthDate.trim()
        : undefined,
    deathDate:
      typeof raw.deathDate === "string" && raw.deathDate.trim()
        ? raw.deathDate.trim()
        : undefined,
    birthPlace:
      typeof raw.birthPlace === "string" && raw.birthPlace.trim()
        ? raw.birthPlace.trim()
        : undefined,
    deathPlace:
      typeof raw.deathPlace === "string" && raw.deathPlace.trim()
        ? raw.deathPlace.trim()
        : undefined,
    nationality:
      typeof raw.nationality === "string" && raw.nationality.trim()
        ? raw.nationality.trim()
        : typeof raw.countryEn === "string" && raw.countryEn.trim()
          ? raw.countryEn.trim()
          : undefined,
    languages: readStringArray(raw.languages, 12),
    genres: readStringArray(raw.genres, 16),
    movements: readStringArray(raw.movements, 16),
    period:
      typeof raw.period === "string" && raw.period.trim()
        ? raw.period.trim()
        : undefined,
    themes: readStringArray(raw.themes, 20),
    influenceTags: readStringArray(raw.influenceTags, 20),
    shortBio:
      typeof raw.shortBio === "string" && raw.shortBio.trim()
        ? raw.shortBio.trim()
        : undefined,
    fullBio:
      typeof raw.fullBio === "string" && raw.fullBio.trim()
        ? raw.fullBio.trim()
        : typeof raw.bioEn === "string" && raw.bioEn.trim()
          ? raw.bioEn.trim()
          : undefined,
    wikipediaUrl:
      typeof authorityLinks.wikipediaUrl === "string" && authorityLinks.wikipediaUrl.trim()
        ? authorityLinks.wikipediaUrl.trim()
        : undefined,
    goodreadsId:
      typeof authorityLinks.goodreadsId === "string" && authorityLinks.goodreadsId.trim()
        ? authorityLinks.goodreadsId.trim()
        : undefined,
    openLibraryId:
      typeof authorityLinks.openLibraryId === "string" && authorityLinks.openLibraryId.trim()
        ? authorityLinks.openLibraryId.trim()
        : undefined,
    wikidataId:
      typeof authorityLinks.wikidataId === "string" && authorityLinks.wikidataId.trim()
        ? authorityLinks.wikidataId.trim()
        : undefined,
    isni:
      typeof authorityLinks.isni === "string" && authorityLinks.isni.trim()
        ? authorityLinks.isni.trim()
        : undefined,
    viaf:
      typeof authorityLinks.viaf === "string" && authorityLinks.viaf.trim()
        ? authorityLinks.viaf.trim()
        : undefined,
    portraitUrl:
      typeof raw.portraitUrl === "string" && raw.portraitUrl.trim()
        ? raw.portraitUrl.trim()
        : typeof raw.avatarUrl === "string" && raw.avatarUrl.trim()
          ? raw.avatarUrl.trim()
          : undefined,
    gallery: readStringArray(raw.gallery, 12),
    knownWorks: readStringArray(raw.knownWorks, 24),
    bookIds: readStringArray(raw.bookIds, 48),
    status: raw.status === "archived" ? "archived" : "active",
    source:
      typeof raw.source === "string" && raw.source.trim()
        ? raw.source.trim()
        : undefined,
    primarySource:
      typeof raw.primarySource === "string" && raw.primarySource.trim()
        ? raw.primarySource.trim()
        : undefined,
    provenance:
      raw.provenance && typeof raw.provenance === "object"
        ? (raw.provenance as Record<string, unknown>)
        : undefined,
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

function mapAdminCanonicalBook(raw: DocumentData, bookId: string): AdminCanonicalBookShape {
  return {
    bookId,
    canonicalBookId: bookId,
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : typeof raw.titleEn === "string" && raw.titleEn.trim()
          ? raw.titleEn.trim()
          : "",
    author:
      typeof raw.author === "string" && raw.author.trim()
        ? raw.author.trim()
        : typeof raw.authorEn === "string" && raw.authorEn.trim()
          ? raw.authorEn.trim()
          : "",
    language:
      typeof raw.language === "string" && raw.language.trim()
        ? raw.language.trim()
        : undefined,
    canonicalKey:
      typeof raw.canonicalKey === "string" && raw.canonicalKey.trim()
        ? raw.canonicalKey.trim()
        : "",
    authorId:
      typeof raw.authorId === "string" && raw.authorId.trim()
        ? raw.authorId.trim()
        : undefined,
    authorCanonicalKey:
      typeof raw.authorCanonicalKey === "string" && raw.authorCanonicalKey.trim()
        ? raw.authorCanonicalKey.trim()
        : undefined,
    authorityStatus:
      typeof raw.authorityStatus === "string" && raw.authorityStatus.trim()
        ? raw.authorityStatus.trim()
        : "",
    canonicalLocked: raw.canonicalLocked === true,
    coverState:
      typeof raw.coverState === "string" && raw.coverState.trim()
        ? raw.coverState.trim()
        : undefined,
    coverSource:
      typeof raw.coverSource === "string" && raw.coverSource.trim()
        ? raw.coverSource.trim()
        : undefined,
    coverAuthority:
      typeof raw.coverAuthority === "number" && Number.isFinite(raw.coverAuthority)
        ? raw.coverAuthority
        : undefined,
    descriptionSource:
      typeof raw.descriptionSource === "string" && raw.descriptionSource.trim()
        ? raw.descriptionSource.trim()
        : undefined,
    descriptionAuthority:
      typeof raw.descriptionAuthority === "number" && Number.isFinite(raw.descriptionAuthority)
        ? raw.descriptionAuthority
        : undefined,
    editionId:
      typeof raw.editionId === "string" && raw.editionId.trim()
        ? raw.editionId.trim()
        : undefined,
  };
}

function buildAuthorInput(data: Record<string, unknown>): AdminAuthorUpsertInput {
  return {
    authorId: readOptionalString(data.authorId, "authorId", 180),
    canonicalName: readRequiredString(data.canonicalName, "canonicalName", 240),
    displayName: readOptionalString(data.displayName, "displayName", 240),
    aliases: readStringArray(data.aliases, 40),
    slug: readOptionalString(data.slug, "slug", 120),
    birthDate: readOptionalString(data.birthDate, "birthDate", 16),
    deathDate: readOptionalString(data.deathDate, "deathDate", 16),
    birthPlace: readOptionalString(data.birthPlace, "birthPlace", 160),
    deathPlace: readOptionalString(data.deathPlace, "deathPlace", 160),
    nationality: readOptionalString(data.nationality, "nationality", 120),
    languages: readStringArray(data.languages, 12),
    genres: readStringArray(data.genres, 16),
    movements: readStringArray(data.movements, 16),
    period: readOptionalString(data.period, "period", 120),
    themes: readStringArray(data.themes, 20),
    influenceTags: readStringArray(data.influenceTags, 20),
    shortBio: readOptionalString(data.shortBio, "shortBio", 800),
    fullBio: readOptionalString(data.fullBio, "fullBio", 5000),
    wikipediaUrl: readOptionalString(data.wikipediaUrl, "wikipediaUrl", 500),
    goodreadsId: readOptionalString(data.goodreadsId, "goodreadsId", 120),
    openLibraryId: readOptionalString(data.openLibraryId, "openLibraryId", 120),
    wikidataId: readOptionalString(data.wikidataId, "wikidataId", 120),
    isni: readOptionalString(data.isni, "isni", 120),
    viaf: readOptionalString(data.viaf, "viaf", 120),
    portraitUrl: readOptionalString(data.portraitUrl, "portraitUrl", 500),
    gallery: readStringArray(data.gallery, 12),
    knownWorks: readStringArray(data.knownWorks, 24),
    bookIds: readStringArray(data.bookIds, 48),
    status: data.status === "archived" ? "archived" : "active",
    source: readOptionalString(data.source, "source", 120),
    primarySource: readOptionalString(data.primarySource, "primarySource", 120),
    provenance:
      data.provenance && typeof data.provenance === "object" && !Array.isArray(data.provenance)
        ? (data.provenance as Record<string, unknown>)
        : undefined,
  };
}

function buildCanonicalBookInput(data: Record<string, unknown>): {
  title: string;
  author: string;
  language?: string;
  description?: string;
  coverUrl?: string;
  isbn10?: string;
  isbn13?: string;
} {
  const title = readRequiredString(data.title, "title", 300);
  const author = readRequiredString(data.author, "author", 240);
  const language = normalizeLanguage(readOptionalString(data.language, "language", 16));
  const description = readOptionalString(data.description, "description", 5000);
  const coverUrl = readOptionalUrl(data.coverUrl, "coverUrl", 500);
  const { isbn10, isbn13 } = parseOptionalIsbn(data.isbn);

  return {
    title,
    author,
    ...(language ? { language } : {}),
    ...(description ? { description } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ...(isbn10 ? { isbn10 } : {}),
    ...(isbn13 ? { isbn13 } : {}),
  };
}

export const adminListAuthors = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const limitRaw = data.limit;
  const limit =
    typeof limitRaw === "number" && Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(MAX_ADMIN_LIMIT, Math.trunc(limitRaw)))
      : 24;
  const queryValue = readOptionalString(data.query, "query", 120);
  const status =
    data.status === "archived" || data.status === "active" ? data.status : "all";

  let queryRef: Query = db.collection("authors");
  if (status === "archived") {
    queryRef = queryRef.where("status", "==", "archived");
  }
  if (queryValue) {
    queryRef = queryRef.where("searchPrefixes", "array-contains", normalizeSearchText(queryValue));
  }

  const snap = await queryRef.limit(Math.max(limit, 40)).get();
  const items = snap.docs
    .map((docSnap) => mapAdminAuthor(docSnap.data(), docSnap.id))
    .filter((author) =>
      status === "all"
        ? true
        : status === "active"
          ? author.status !== "archived"
          : author.status === "archived"
    )
    .filter((author) => {
      if (!queryValue) return true;
      const normalizedQuery = normalizeSearchText(queryValue);
      return (
        author.normalizedName.includes(normalizedQuery) ||
        author.aliases.some((alias) => normalizeSearchText(alias).includes(normalizedQuery))
      );
    })
    .sort((left, right) =>
      (right.updatedAt || right.createdAt || "").localeCompare(
        left.updatedAt || left.createdAt || ""
      )
    )
    .slice(0, limit);

  return {
    authors: items,
  };
});

export const adminGetAuthor = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const authorId = readRequiredString(data.authorId, "authorId", 180);
  const snap = await db.collection("authors").doc(authorId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Author not found.");
  }

  return {
    author: mapAdminAuthor(snap.data() as DocumentData, snap.id),
  };
});

export const adminAuthorCreate = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const input = buildAuthorInput(data);

  const result = await db.runTransaction((tx) =>
    upsertAdminAuthorInTransaction({
      tx,
      actorUid: caller.uid,
      input,
    })
  );

  const snap = await db.collection("authors").doc(result.authorId).get();
  return {
    author: mapAdminAuthor(snap.data() as DocumentData, snap.id),
    status: result.status,
  };
});

export const adminAuthorUpdate = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const authorId = readRequiredString(data.authorId, "authorId", 180);
  const input = {
    ...buildAuthorInput({
      ...data,
      authorId,
    }),
    authorId,
  };

  const result = await db.runTransaction((tx) =>
    upsertAdminAuthorInTransaction({
      tx,
      actorUid: caller.uid,
      input,
    })
  );

  const snap = await db.collection("authors").doc(result.authorId).get();
  return {
    author: mapAdminAuthor(snap.data() as DocumentData, snap.id),
    status: result.status,
  };
});

export const adminAuthorArchive = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const authorId = readRequiredString(data.authorId, "authorId", 180);
  const authorRef = db.collection("authors").doc(authorId);
  const snap = await authorRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Author not found.");
  }

  await authorRef.set(
    {
      status: "archived",
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      archivedBy: caller.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: caller.uid,
    },
    { merge: true }
  );

  const archivedSnap = await authorRef.get();

  return {
    author: mapAdminAuthor(archivedSnap.data() as DocumentData, archivedSnap.id),
    archived: true,
  };
});

export const adminCreateCanonicalBook = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as Record<string, unknown>;
  const input = buildCanonicalBookInput(data);
  const language = input.language || "en";
  const isArabic = language.startsWith("ar");
  const ingestionKey = `admin_canonical:${normalizeSearchText(input.author)}::${normalizeSearchText(input.title)}`;

  const result = await materializeBookAuthority({
    source: "booktown_canonical",
    authorityStatus: "canonical",
    rawBook: {
      title: input.title,
      titleEn: input.title,
      titleAr: isArabic ? input.title : "",
      author: input.author,
      authorEn: input.author,
      authorAr: isArabic ? input.author : "",
      authors: [input.author],
      description: input.description || "",
      descriptionEn: input.description || "",
      descriptionAr: isArabic ? input.description || "" : "",
      language,
      canonicalLocked: true,
      rightsMode: "public_free",
      visibility: "public",
      publicationState: "published",
      hasEbook: false,
      downloadable: false,
      isEbookAvailable: false,
      ...(input.isbn10 ? { isbn10: input.isbn10 } : {}),
      ...(input.isbn13 ? { isbn13: input.isbn13 } : {}),
      ...(input.coverUrl ? { coverUrl: input.coverUrl } : {}),
    },
    createEdition: Boolean(input.isbn10 || input.isbn13),
    coverCandidates: input.coverUrl ? [input.coverUrl] : [],
    ingestionKey,
  });

  const bookSnap = await db.collection("books").doc(result.bookId).get();
  if (!bookSnap.exists) {
    throw new HttpsError("internal", "Canonical book materialization completed without a book row.");
  }

  return {
    book: mapAdminCanonicalBook(bookSnap.data() as DocumentData, bookSnap.id),
    status: result.status,
  };
});

export const adminDeleteCanonicalBook = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const bookId = readRequiredString(request.data?.bookId, "bookId", 180);
  return deleteCanonicalBookCascade(bookId);
});

export const adminDeleteCanonicalSeedList = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as AdminDeleteCanonicalSeedListInput;
  const rows = parseBulkSeedRows(data.rows);
  const results: AdminDeleteCanonicalSeedListRow[] = [];

  for (const entry of rows) {
    try {
      const bookId = await resolveCanonicalBookIdForDelete({
        title: entry.title,
        author: entry.author,
      });

      if (!bookId) {
        results.push({
          row: entry.row,
          input: entry.input,
          title: entry.title,
          author: entry.author,
          status: "missing",
          message: "No canonical book matched this row.",
        });
        continue;
      }

      const deleted = await deleteCanonicalBookCascade(bookId);
      results.push({
        row: entry.row,
        input: entry.input,
        title: entry.title,
        author: entry.author,
        status: deleted.deleted ? "success" : "missing",
        bookId,
        ...(deleted.deleted ? {} : { message: "Canonical book not found." }),
      });
    } catch (error) {
      results.push({
        row: entry.row,
        input: entry.input,
        title: entry.title,
        author: entry.author,
        status: "failed",
        message: mapBatchError(error),
      });
    }
  }

  return {
    rows: results,
    summary: buildDeleteListSummary(results),
  };
});

export const adminDeleteAllBooks = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");

  const confirmation = readRequiredString(
    (request.data as AdminDeleteAllBooksInput | null | undefined)?.confirmation,
    "confirmation",
    64
  );
  if (confirmation !== "DELETE ALL BOOKS") {
    throw new HttpsError("invalid-argument", 'confirmation must equal "DELETE ALL BOOKS".');
  }

  const booksSnap = await db.collection("books").get();
  let deletedCount = 0;
  const cascade = emptyDeleteCascadeCounts();

  for (const doc of booksSnap.docs) {
    const result = await deleteCanonicalBookCascade(doc.id);
    if (!result.deleted) continue;
    deletedCount += 1;
    cascade.books += result.cascade.books;
    cascade.editions += result.cascade.editions;
    cascade.bookIdentity += result.cascade.bookIdentity;
    cascade.bookIngestions += result.cascade.bookIngestions;
    cascade.coverJobs += result.cascade.coverJobs;
    cascade.readingProgress += result.cascade.readingProgress;
    cascade.userLibraryBooks += result.cascade.userLibraryBooks;
    cascade.shelfRefs += result.cascade.shelfRefs;
    cascade.quoteLinks += result.cascade.quoteLinks;
    cascade.authorRefs += result.cascade.authorRefs;
    cascade.coverStorageFiles += result.cascade.coverStorageFiles;
  }

  return {
    deletedCount,
    cascade,
  };
});

export const adminSeedCanonicalBatch = onCall({ cors: true }, async (request) => {
  assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as AdminSeedCanonicalBatchInput;
  const rows = parseBulkSeedRows(data.rows);

  const results: AdminSeedCanonicalBatchRow[] = [];

  for (const entry of rows) {
    try {
      const existing = await resolveExistingCanonicalWorkForSeed({
        title: entry.title,
        author: entry.author,
      });
      if (existing) {
        const existingSource = asNonEmptyString(existing.data.source);
        results.push({
          row: entry.row,
          input: entry.input,
          title: entry.title,
          author: entry.author,
          status: "existing",
          canonicalBookId: existing.bookId,
          bookId: existing.bookId,
          editionId: asNonEmptyString(existing.data.editionId) || undefined,
          ...(existingSource === "googleBooks" || existingSource === "openLibrary"
            ? { source: existingSource }
            : {}),
          message: `Reused canonical work ${existing.bookId}; duplicate prevented by deterministic seed lookup.`,
        });
        continue;
      }

      const query = `${entry.title} ${entry.author}`.trim();
      const search = await unifiedSearch(query, {
        limit: 10,
      });
      const providerCandidate = selectStrongestBulkProviderCandidate({
        results: search.results,
        requestedTitle: entry.title,
        requestedAuthor: entry.author,
      });

      if (!providerCandidate) {
        results.push({
          row: entry.row,
          input: entry.input,
          title: entry.title,
          author: entry.author,
          status: "failed",
          message: "No provider candidate matched this row.",
        });
        continue;
      }

      const providerSource: "googleBooks" | "openLibrary" | null =
        providerCandidate.source === "googleBooks" || providerCandidate.source === "openLibrary"
          ? providerCandidate.source
          : null;
      if (!providerSource) {
        results.push({
          row: entry.row,
          input: entry.input,
          title: entry.title,
          author: entry.author,
          status: "failed",
          message: "Provider candidate source is unsupported.",
        });
        continue;
      }

      const candidateMatchedExisting = await resolveExistingCanonicalWorkForSeed({
        title: entry.title,
        author: entry.author,
        candidate: providerCandidate,
      });
      if (candidateMatchedExisting) {
        const existingSource = asNonEmptyString(candidateMatchedExisting.data.source);
        results.push({
          row: entry.row,
          input: entry.input,
          title: entry.title,
          author: entry.author,
          status: "existing",
          canonicalBookId: candidateMatchedExisting.bookId,
          bookId: candidateMatchedExisting.bookId,
          editionId: asNonEmptyString(candidateMatchedExisting.data.editionId) || undefined,
          ...(existingSource === "googleBooks" || existingSource === "openLibrary"
            ? { source: existingSource }
            : { source: providerSource }),
          providerExternalId: providerCandidate.externalId,
          message: `Reused canonical work ${candidateMatchedExisting.bookId}; duplicate prevented by multilingual authority convergence.`,
        });
        continue;
      }

      const ingestion = await ingestBookServerSide({
        uid: request.auth?.uid || "admin",
        source: providerSource,
        providerExternalId: providerCandidate.externalId,
        rawBook: prepareBulkCandidateRawBook({
          result: providerCandidate,
          requestedTitle: entry.title,
          requestedAuthor: entry.author,
        }),
      });

      results.push({
        row: entry.row,
        input: entry.input,
        title: entry.title,
        author: entry.author,
        status: mapBatchRowStatus(ingestion.status),
        canonicalBookId: ingestion.canonicalBookId,
        bookId: ingestion.bookId,
        editionId: ingestion.editionId || undefined,
        source: providerSource,
        providerExternalId: providerCandidate.externalId,
        message:
          ingestion.status === "CREATED"
            ? "Created canonical work through deterministic seed authority resolution."
            : "Reused canonical work through authority ingestion; duplicate prevented.",
      });
    } catch (error) {
      results.push({
        row: entry.row,
        input: entry.input,
        title: entry.title,
        author: entry.author,
        status: "failed",
        message: mapBatchError(error),
      });
    }
  }

  return {
    rows: results,
    summary: buildBatchSummary(results),
  };
});
