import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { Query, DocumentData, FieldValue } from "firebase-admin/firestore";

import { admin } from "../firebaseAdmin";
import { normalizeSearchText } from "../search/normalization";
import { materializeBookAuthority } from "../library/materializeBookAuthority";
import {
  fetchGoogleBooksCanonicalMetadata,
  ingestBookServerSide,
  materializeSeedOnlyCanonicalFallback,
} from "../library/ingestBook";
import { fetchOpenLibraryCanonicalMetadata } from "../library/providers/openLibrary";
import {
  authorMatchesCanonicalSeedAuthority,
  hasContributorRoleSignal,
  hasRejectedCandidateTitleSignal,
  hasRejectedContributorCandidateSignal,
  normalizeBatchCanonicalSeedPayload,
  resolveCanonicalSeedAuthorityAuthor,
} from "../library/normalization/canonicalIngest";
import { buildCanonicalKey, normalizeCanonicalPart } from "../library/persistence/canonicalKey";
import {
  buildCanonicalAuthorKey,
  extractCanonicalAuthorKeyRoot,
} from "../library/persistence/canonicalAuthorKey";
import { detectCanonicalConflicts } from "../library/canonicalConflictDetection";
import {
  buildBookSearchPatch,
  buildEditionSearchPatch,
} from "../library/search/searchIndexing";
import {
  areAuthorityAuthorsEquivalent,
  extractAuthorityAuthorReference,
} from "../library/authorityAuthorLock";
import {
  getAcceptedAuthorityForProvider,
  getAcceptedAuthorityRank,
  getProviderAuthorityRank,
} from "../library/providerRoleRegistry";
import {
  unifiedSearch,
  type UnifiedSearchResult,
} from "../library/search/searchEngine";
import { assertRoleFromClaims } from "../shared/auth";
import {
  type AdminAuthorUpsertInput,
  upsertAdminAuthorInTransaction,
} from "../library/authors/authorCatalog";
import {
  parseInput,
  adminAuthorCreateSchema,
  adminAuthorUpdateSchema,
  adminCreateCanonicalBookSchema,
  adminAuthorIdSchema,
  adminMergeCanonicalBooksSchema,
} from "../shared/validation";

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
  status: "created" | "existing" | "failed" | "timeout_fallback";
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

const PROVIDER_PHASE_TIMEOUT_MS = 10_000;

const CANONICAL_SEED_DESCRIPTION_FALLBACKS: Array<{
  title: string;
  author: string;
  description: string;
}> = [
  {
    title: "Don Quixote",
    author: "Miguel de Cervantes",
    description:
      "Don Quixote follows an aging hidalgo who reinvents himself as a knight errant, traveling with Sancho Panza through comic misadventures that test illusion, honor, storytelling, and the boundary between fantasy and reality.",
  },
  {
    title: "The Iliad",
    author: "Homer",
    description:
      "The Iliad recounts the wrath of Achilles during the Trojan War, tracing conflict among Greek warriors, Trojan defenders, and the gods as questions of honor, mortality, grief, and glory drive the epic toward Hector's death.",
  },
  {
    title: "Beloved",
    author: "Toni Morrison",
    description:
      "Beloved follows Sethe, a formerly enslaved woman in post-Civil War Ohio, as the return of a mysterious young woman forces her household to confront trauma, memory, motherhood, and the living presence of the past.",
  },
  {
    title: "The Tale of Genji",
    author: "Murasaki Shikibu",
    description:
      "The Tale of Genji follows Hikaru Genji and generations of the Heian court, using romance, exile, rivalry, and ritual to examine desire, impermanence, politics, and the emotional costs of aristocratic life.",
  },
  {
    title: "The Divine Comedy",
    author: "Dante Alighieri",
    description:
      "The Divine Comedy follows Dante through Hell, Purgatory, and Paradise, using an allegorical journey through the afterlife to examine sin, justice, redemption, and the soul's movement toward divine understanding.",
  },
  {
    title: "War and Peace",
    author: "Leo Tolstoy",
    description:
      "War and Peace follows aristocratic families during the Napoleonic wars, weaving battles, domestic life, political change, and philosophical reflection into a large-scale study of history, fate, and human choice.",
  },
  {
    title: "The Aleph",
    author: "Jorge Luis Borges",
    description:
      "The Aleph gathers Borges's stories of mirrors, labyrinths, infinity, and memory, where philosophical puzzles and fictional inventions unsettle the boundaries between reality, language, and imagination.",
  },
  {
    title: "Hamlet",
    author: "William Shakespeare",
    description:
      "Hamlet follows the prince of Denmark as he confronts his father's murder, his mother's remarriage, political corruption, revenge, madness, mortality, and the collapse of trust inside the royal court.",
  },
  {
    title: "Pride and Prejudice",
    author: "Jane Austen",
    description:
      "Pride and Prejudice follows Elizabeth Bennet as questions of manners, family, class, judgment, and marriage shape her changing understanding of Fitzwilliam Darcy and herself.",
  },
  {
    title: "The Muqaddimah",
    author: "Ibn Khaldun",
    description:
      "The Muqaddimah introduces Ibn Khaldun's theory of society, history, power, labor, and civilizational rise and decline.",
  },
  {
    title: "The Bhagavad Gita",
    author: "Anonymous",
    description:
      "The Bhagavad Gita presents a dialogue on duty, action, devotion, knowledge, and liberation on the battlefield of Kurukshetra.",
  },
  {
    title: "The Mahabharata",
    author: "Anonymous",
    description:
      "The Mahabharata follows dynastic conflict, exile, war, and moral struggle across one of the largest epic traditions in world literature.",
  },
  {
    title: "The Prince",
    author: "Niccolò Machiavelli",
    description:
      "The Prince examines political power, statecraft, force, prudence, and rule under unstable historical conditions.",
  },
  {
    title: "Faust Part Two",
    author: "Johann Wolfgang von Goethe",
    description:
      "Faust Part Two expands Faust's journey through empire, myth, ambition, and redemption across political and symbolic worlds.",
  },
  {
    title: "The Aeneid",
    author: "Virgil",
    description:
      "The Aeneid follows Aeneas from Troy to Italy, joining exile, war, prophecy, and imperial destiny in Rome's foundational epic.",
  },
  {
    title: "The Waste Land",
    author: "T. S. Eliot",
    description:
      "The Waste Land gathers fractured voices, cultural fragments, and ritual echoes to examine spiritual exhaustion, historical rupture, and modern consciousness.",
  },
  {
    title: "Divan of Hafez",
    author: "Hafez",
    description:
      "The Divan of Hafez gathers lyric poems of love, longing, divine beauty, irony, and mystical reflection in Persian poetic tradition.",
  },
  {
    title: "The Conference of the Birds",
    author: "Farid ud-Din Attar",
    description:
      "The Conference of the Birds follows birds seeking the Simorgh through trials of desire, loss, self-knowledge, and mystical transformation.",
  },
  {
    title: "The Tale of Kieu",
    author: "Nguyễn Du",
    description:
      "The Tale of Kieu follows Thuy Kieu through sacrifice, separation, injustice, and endurance in a major work of Vietnamese poetic tradition.",
  },
  {
    title: "Their Eyes Were Watching God",
    author: "Zora Neale Hurston",
    description:
      "Their Eyes Were Watching God follows Janie Crawford through love, voice, independence, and self-realization across changing stages of her life.",
  },
  {
    title: "The Epic of Gilgamesh",
    author: "Anonymous",
    description:
      "The Epic of Gilgamesh follows friendship, kingship, grief, and the search for mortality's meaning in one of humanity's earliest epics.",
  },
  {
    title: "Hopscotch",
    author: "Julio Cortázar",
    description:
      "Hopscotch follows Horacio Oliveira across Paris and Buenos Aires, using fractured sequence, exile, love, and play to test narrative form.",
  },
  {
    title: "The Magic Mountain",
    author: "Thomas Mann",
    description:
      "The Magic Mountain follows Hans Castorp in a Swiss sanatorium, where illness, time, intellect, and European crisis reshape his education.",
  },
  {
    title: "Dream of the Red Chamber",
    author: "Cao Xueqin",
    description:
      "Dream of the Red Chamber follows the Jia family through love, decline, memory, and social order in Qing aristocratic life.",
  },
  {
    title: "Cities of Salt",
    author: "Abdul Rahman Munif",
    description:
      "Cities of Salt follows desert communities transformed by oil, labor, exile, and political change in the modern Arab world.",
  },
  {
    title: "Journey to the West",
    author: "Wu Cheng'en",
    description:
      "Journey to the West follows a monk and his companions through pilgrimage, trial, transformation, and spiritual discipline across mythic landscapes.",
  },
  {
    title: "The Cairo Trilogy",
    author: "Naguib Mahfouz",
    description:
      "The Cairo Trilogy follows a Cairo family across generations, tracing authority, domestic life, nationalism, and social transformation.",
  },
  {
    title: "The Palm-Wine Drinkard",
    author: "Amos Tutuola",
    description:
      "The Palm-Wine Drinkard follows a drinker through supernatural journeys, oral invention, and encounters with spirits in Yoruba imaginative tradition.",
  },
  {
    title: "The Man Without Qualities",
    author: "Robert Musil",
    description:
      "The Man Without Qualities follows Ulrich through intellectual uncertainty, political drift, and social fragmentation in late imperial Europe.",
  },
  {
    title: "The Leopard",
    author: "Giuseppe Tomasi di Lampedusa",
    description:
      "The Leopard follows a Sicilian aristocratic family confronting political transition, mortality, and historical decline during Italian unification.",
  },
  {
    title: "Independent People",
    author: "Halldór Laxness",
    description:
      "Independent People follows an Icelandic farmer through poverty, endurance, family strain, and the hard demands of independence.",
  },
  {
    title: "Dead Souls",
    author: "Nikolai Vasilievich Gogol",
    description:
      "Dead Souls follows Chichikov through provincial Russia, using comic transactions to expose greed, bureaucracy, and moral emptiness.",
  },
  {
    title: "Moby-Dick; or, The Whale",
    author: "Herman Melville",
    description:
      "Moby-Dick follows Captain Ahab's pursuit of a white whale, joining obsession, labor, fate, and metaphysical struggle at sea.",
  },
];

class ProviderPhaseTimeoutError extends Error {
  readonly code = "PROVIDER_PHASE_TIMEOUT";

  constructor(readonly timeoutMs: number) {
    super(`Provider phase exceeded ${timeoutMs}ms.`);
    this.name = "ProviderPhaseTimeoutError";
  }
}

type AdminDeleteBookCascadeCounts = {
  books: number;
  editions: number;
  attachments: number;
  attachmentUploadIntents: number;
  bookIdentity: number;
  bookIngestions: number;
  coverJobs: number;
  readingProgress: number;
  userLibraryBooks: number;
  userReviews: number;
  bookStats: number;
  shelfRefs: number;
  quoteLinks: number;
  quoteSourceLinks: number;
  authorRefs: number;
  reviews: number;
  ratings: number;
  readerArtifacts: number;
  searchProjectionDocs: number;
  coverStorageFiles: number;
  originalStorageFiles: number;
  ebookStorageFiles: number;
  attachmentStorageFiles: number;
  otherSubcollectionDocs: number;
};

type AdminDeleteCanonicalBookInput = {
  bookId: string;
  dryRun?: boolean;
  confirmation?: string;
};

type AdminDeleteTargetType = "book" | "edition" | "unresolved";

type AdminDeleteGraph = {
  inputId: string;
  inputType: AdminDeleteTargetType;
  resolvedBookId: string | null;
  resolvedEditionId: string | null;
  editionIds: string[];
  attachmentIds: string[];
  touchedCollections: string[];
  storagePrefixes: string[];
  storagePaths: string[];
  searchProjectionSources: string[];
};

type AdminDeleteCanonicalBookResponse = {
  bookId: string;
  deleted: boolean;
  dryRun?: boolean;
  resolved?: boolean;
  inputType?: AdminDeleteTargetType;
  collectionCounts?: Record<string, number>;
  storageCounts?: Record<string, number>;
  deleteGraph?: AdminDeleteGraph;
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

type AdminDestructiveOperation =
  | "adminMergeCanonicalBooks"
  | "adminMergeCanonicalDuplicateGroup"
  | "adminDeleteCanonicalBook"
  | "adminDeleteCanonicalSeedList"
  | "adminDeleteAllBooks";

type AdminDestructiveAuditPayload = Record<string, unknown>;

type DeleteCanonicalBookCascadeOptions = {
  dryRun?: boolean;
  audit?: {
    operation: AdminDestructiveOperation;
    actorUid: string;
    action: string;
    requestedInputId: string;
  };
};

const ADMIN_DESTRUCTIVE_AUTHORITY_CONTRACT_VERSION = 1;
const ADMIN_DESTRUCTIVE_ALLOWED_OPERATIONS = new Set<AdminDestructiveOperation>([
  "adminMergeCanonicalBooks",
  "adminMergeCanonicalDuplicateGroup",
  "adminDeleteCanonicalBook",
  "adminDeleteCanonicalSeedList",
  "adminDeleteAllBooks",
]);

const ADMIN_MERGE_EDITION_PATCH_FIELDS = new Set([
  "bookId",
  "workId",
  "canonicalBookId",
  "updatedAt",
]);

const ADMIN_MERGE_QUOTE_PATCH_FIELDS = new Set(["bookId", "sourceBookId", "updatedAt"]);
const ADMIN_MERGE_SHELF_PATCH_FIELDS = new Set(["orderedBookIds", "updatedAt"]);
const ADMIN_DUPLICATE_GROUP_SURVIVOR_PATCH_FIELDS = new Set([
  "titleAliases",
  "canonicalAuthorIds",
  "workIdentity",
  "providerExternalIds",
  "identityKeys",
  "externalReadableSources",
  "canonicalKey",
  "editionId",
  "canonicalRelations",
  "ebookAttachmentId",
  "ebookStoragePath",
  "epubStoragePath",
  "storagePath",
  "acquiredFromProvider",
  "hasEbook",
  "downloadable",
  "isEbookAvailable",
  "coverState",
  "cover",
  "coverUrl",
  "coverSource",
  "coverAuthority",
  "normalizedTitle",
  "titleEnNormalized",
  "canonicalTitleAuthorities",
  "authorNamesNormalized",
  "searchableTitleAuthor",
  "search",
  "updatedAt",
]);
const ADMIN_DUPLICATE_GROUP_EDITION_PATCH_FIELDS = new Set([
  "bookId",
  "workId",
  "canonicalKey",
  "searchTitleNormalized",
  "searchAuthorNormalized",
  "searchTokens",
  "downloadable",
  "hasEbook",
  "isEbookAvailable",
  "updatedAt",
]);
const ADMIN_DUPLICATE_GROUP_IDENTITY_PATCH_FIELDS = new Set(["bookId", "updatedAt"]);
const ADMIN_DUPLICATE_GROUP_INGESTION_PATCH_FIELDS = new Set([
  "bookId",
  "canonicalKey",
  "updatedAt",
]);
const ADMIN_DUPLICATE_GROUP_DUPLICATE_BOOK_PATCH_FIELDS = new Set([
  "mergedInto",
  "mergeState",
  "updatedAt",
]);
const ADMIN_DUPLICATE_GROUP_COVER_JOB_PATCH_FIELDS = new Set([
  "id",
  "bookId",
  "source",
  "externalId",
  "candidateUrls",
  "status",
  "updatedAt",
]);
const ADMIN_DUPLICATE_GROUP_COVER_JOB_REDIRECT_PATCH_FIELDS = new Set([
  "bookId",
  "redirectBookId",
  "mergedInto",
  "status",
  "lastError",
  "updatedAt",
  "completedAt",
]);

function assertAdminDestructiveAuthority(params: {
  operation: AdminDestructiveOperation;
  actorUid: string;
  resourceId: string;
}): void {
  if (!ADMIN_DESTRUCTIVE_ALLOWED_OPERATIONS.has(params.operation)) {
    throw new HttpsError(
      "failed-precondition",
      `Unsupported destructive operation "${params.operation}".`
    );
  }
  if (!params.actorUid || !params.actorUid.trim()) {
    throw new HttpsError("unauthenticated", "Destructive admin operation requires an actor.");
  }
  if (!params.resourceId || !params.resourceId.trim()) {
    throw new HttpsError(
      "invalid-argument",
      "Destructive admin operation requires a resource id."
    );
  }
}

function assertAllowedDestructivePatch(
  patch: Record<string, unknown>,
  allowedFields: Set<string>,
  context: string
): void {
  const forbidden = Object.keys(patch).filter((field) => !allowedFields.has(field));
  if (forbidden.length > 0) {
    throw new HttpsError(
      "failed-precondition",
      `${context} attempted to write non-contract fields: ${forbidden.join(", ")}.`
    );
  }
}

async function writeAdminDestructiveAudit(params: {
  operation: AdminDestructiveOperation;
  action: string;
  actorUid: string;
  resourceType: string;
  resourceId: string;
  payload?: AdminDestructiveAuditPayload;
}): Promise<void> {
  assertAdminDestructiveAuthority({
    operation: params.operation,
    actorUid: params.actorUid,
    resourceId: params.resourceId,
  });

  await db.collection("admin_audit_log").add({
    action: params.action,
    authority: "admin_destructive",
    authorityContractVersion: ADMIN_DESTRUCTIVE_AUTHORITY_CONTRACT_VERSION,
    allowedOperation: params.operation,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    actorUid: params.actorUid,
    timestamp: admin.firestore.Timestamp.now(),
    source: "admin_api",
    ...(params.payload || {}),
  });
}

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

function isProviderPhaseTimeoutError(error: unknown): error is ProviderPhaseTimeoutError {
  return error instanceof ProviderPhaseTimeoutError;
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new ProviderPhaseTimeoutError(timeoutMs));
        }, timeoutMs);
        (timeoutHandle as { unref?: () => void }).unref?.();
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
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

function buildSeedOnlyFallbackRawBook(params: {
  title: string;
  author: string;
}): Record<string, unknown> {
  const canonicalAuthor =
    resolveCanonicalSeedAuthorityAuthor({
      title: params.title,
      fallbackAuthor: params.author,
    }) || params.author;
  const description = resolveCanonicalSeedDescriptionFallback({
    requestedTitle: params.title,
    requestedAuthor: canonicalAuthor,
  });

  return applyCanonicalSeedAuthorOverrideAtFinalPayloadWrite({
    requestedTitle: params.title,
    requestedAuthor: canonicalAuthor,
    rawBook: {
      title: params.title,
      titleEn: params.title,
      author: canonicalAuthor,
      authorEn: canonicalAuthor,
      authors: [canonicalAuthor],
      language: "en",
      canonicalLocked: true,
      authorityStatus: "canonical",
      workType: "canonical",
      rightsMode: "public_free",
      visibility: "public",
      publicationState: "published",
      ...(description
        ? {
            description,
            descriptionEn: description,
            abstractDescription: description,
          }
        : {}),
    },
  });
}

async function resolveSeedBatchProviderPhase(params: {
  title: string;
  author: string;
}): Promise<{
  providerCandidate: UnifiedSearchResult | null;
  providerSource: "googleBooks" | "openLibrary" | null;
  preparedRawBook?: Record<string, unknown>;
  searchResults: UnifiedSearchResult[];
  message?: string;
}> {
  const query = `${params.title} ${params.author}`.trim();
  const search = await unifiedSearch(query, {
    limit: 10,
  });

  const searchResults = Array.isArray(search.results) ? search.results : [];
  let providerCandidate = selectStrongestBulkProviderCandidate({
    results: searchResults,
    requestedTitle: params.title,
    requestedAuthor: params.author,
  });

  if (providerCandidate?.source === "googleBooks") {
    const openLibraryRetryCandidate = await retryOpenLibraryBulkProviderCandidate({
      requestedTitle: params.title,
      requestedAuthor: params.author,
    });
    if (openLibraryRetryCandidate) {
      providerCandidate = openLibraryRetryCandidate;
    }
  }

  if (!providerCandidate) {
    return {
      providerCandidate: null,
      providerSource: null,
      searchResults,
      message: "No provider candidate matched this row.",
    };
  }

  const providerSource: "googleBooks" | "openLibrary" | null =
    providerCandidate.source === "googleBooks" || providerCandidate.source === "openLibrary"
      ? providerCandidate.source
      : null;

  if (!providerSource) {
    return {
      providerCandidate: null,
      providerSource: null,
      searchResults,
      message: "Provider candidate source is unsupported.",
    };
  }

  providerCandidate = await enrichGoogleWinnerWithOpenLibraryAliases({
    selectedCandidate: providerCandidate,
    requestedTitle: params.title,
    requestedAuthor: params.author,
    initialResults: searchResults,
  });
  providerCandidate = await hydrateSeedCandidateDescription({
    result: providerCandidate,
    requestedTitle: params.title,
    requestedAuthor: params.author,
    searchResults,
  });

  const preparedRawBook = prepareBulkCandidateRawBook({
    result: providerCandidate,
    requestedTitle: params.title,
    requestedAuthor: params.author,
  });

  if (!preparedRawBook) {
    return {
      providerCandidate,
      providerSource,
      searchResults,
      message: "Provider candidate could not be normalized into canonical seed input.",
    };
  }

  return {
    providerCandidate,
    providerSource,
    preparedRawBook,
    searchResults,
  };
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
  return typeof source === "string" ? getProviderAuthorityRank(source) : 0;
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

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry !== null);
}

function uniqueReadableSourceRecords(
  values: ReadonlyArray<Record<string, unknown>>
): Record<string, unknown>[] {
  const dedup = new Map<string, Record<string, unknown>>();
  for (const value of values) {
    const provider = asNonEmptyString(value.provider);
    const providerExternalId = asNonEmptyString(value.providerExternalId);
    const key =
      provider && providerExternalId
        ? `${provider}:${providerExternalId}`
        : JSON.stringify(value);
    if (!key) {
      continue;
    }
    dedup.set(key, value);
  }
  return Array.from(dedup.values());
}

function pickFirstNonEmptyString(values: ReadonlyArray<unknown>): string {
  for (const value of values) {
    const normalized = asNonEmptyString(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
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
    asNonEmptyString(rawBook.originalTitle),
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
  return getAcceptedAuthorityRank(value);
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
  const acceptedAuthorityFromSource = getAcceptedAuthorityForProvider(source);
  if (
    acceptedAuthorityFromSource === "openLibrary" ||
    acceptedAuthorityFromSource === "wikidata" ||
    acceptedAuthorityFromSource === "googleBooks"
  ) {
    return acceptedAuthorityFromSource;
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

function extractBookNormalizedTitleAuthorities(data: Record<string, unknown>): string[] {
  return uniqueStrings([
    normalizeSearchText(asNonEmptyString(data.canonicalTitle)),
    normalizeSearchText(asNonEmptyString(data.originalTitle)),
    normalizeSearchText(asNonEmptyString(data.title)),
    normalizeSearchText(asNonEmptyString(data.titleEn)),
    ...asStringArray(data.titleAliases).map((entry) => normalizeSearchText(entry)),
    ...asStringArray(data.aliases).map((entry) => normalizeSearchText(entry)),
  ].filter(Boolean));
}

async function persistAlternateProviderWorkIds(params: {
  bookId: string;
  data: Record<string, unknown>;
  providerWorkIds: string[];
}): Promise<Record<string, unknown>> {
  const workIdentity = asRecord(params.data.workIdentity) || {};
  const primaryProviderWorkId = extractBookProviderWorkId(params.data);
  const alternateProviderWorkIds = uniqueStrings([
    ...asStringArray(workIdentity.alternateProviderWorkIds),
    ...params.providerWorkIds.map((value) => normalizeBookProviderWorkId(value)),
  ]).filter((entry) => entry && entry !== primaryProviderWorkId);

  if (alternateProviderWorkIds.length === asStringArray(workIdentity.alternateProviderWorkIds).length) {
    return params.data;
  }

  await db.collection("books").doc(params.bookId).set(
    {
      workIdentity: {
        alternateProviderWorkIds,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    ...params.data,
    workIdentity: {
      ...workIdentity,
      alternateProviderWorkIds,
    },
  };
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
}): Promise<{
  survivorId: string;
  survivorData: Record<string, unknown>;
  mergedBookIds: string[];
} | null> {
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
    return {
      survivorId: survivor.bookId,
      survivorData: survivor.data,
      mergedBookIds: [],
    };
  }

  assertAdminDestructiveAuthority({
    operation: "adminMergeCanonicalDuplicateGroup",
    actorUid: "system",
    resourceId: params.providerWorkId,
  });

  const mergeResult = await db.runTransaction(async (tx) => {
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
    const freshDuplicates = freshOrdered.slice(1).filter((candidate) => {
      const equivalent = areAuthorityAuthorsEquivalent(freshSurvivor.data, candidate.data);
      if (!equivalent) {
        logger.warn("[ADMIN_AUTHORITY][AUTHOR_LOCK_REJECTED_DUPLICATE_MERGE]", {
          providerWorkId: params.providerWorkId,
          survivorId: freshSurvivor.bookId,
          duplicateBookId: candidate.bookId,
          survivorAuthor: extractAuthorityAuthorReference(freshSurvivor.data),
          duplicateAuthor: extractAuthorityAuthorReference(candidate.data),
        });
      }
      return equivalent;
    });
    if (freshDuplicates.length === 0) {
      return {
        survivorId: freshSurvivor.bookId,
        survivorData: freshSurvivor.data,
        mergedBookIds: [],
      };
    }

    const survivorRef = db.collection("books").doc(freshSurvivor.bookId);
    const duplicateBookIds = freshDuplicates.map((candidate) => candidate.bookId);
    const now = FieldValue.serverTimestamp();
    const editionDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>();
    const identityDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>();
    const ingestionDocs = new Map<string, { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>();
    const coverJobCollections = ["cover_jobs", "coverJobs"] as const;
    const coverJobRefs = [
      ...coverJobCollections.map((collectionName) =>
        db.collection(collectionName).doc(freshSurvivor.bookId)
      ),
      ...duplicateBookIds.flatMap((bookId) =>
        coverJobCollections.map((collectionName) => db.collection(collectionName).doc(bookId))
      ),
    ];
    const coverJobSnaps =
      coverJobRefs.length > 0 ? await tx.getAll(...coverJobRefs) : [];
    const coverJobDataByPath = new Map<string, Record<string, unknown>>();
    for (const snap of coverJobSnaps) {
      if (!snap.exists) {
        continue;
      }
      coverJobDataByPath.set(snap.ref.path, (snap.data() || {}) as Record<string, unknown>);
    }

    for (const duplicateBookId of duplicateBookIds) {
      const editionBookSnap = (await tx.get(
        db.collection("editions").where("bookId", "==", duplicateBookId).limit(50)
      )) as FirebaseFirestore.QuerySnapshot;
      for (const doc of editionBookSnap.docs) {
        editionDocs.set(doc.id, { ref: doc.ref, data: (doc.data() || {}) as Record<string, unknown> });
      }

      const editionWorkSnap = (await tx.get(
        db.collection("editions").where("workId", "==", duplicateBookId).limit(50)
      )) as FirebaseFirestore.QuerySnapshot;
      for (const doc of editionWorkSnap.docs) {
        editionDocs.set(doc.id, { ref: doc.ref, data: (doc.data() || {}) as Record<string, unknown> });
      }

      const identitySnap = (await tx.get(
        db.collection("book_identity").where("bookId", "==", duplicateBookId).limit(50)
      )) as FirebaseFirestore.QuerySnapshot;
      for (const doc of identitySnap.docs) {
        identityDocs.set(doc.id, { ref: doc.ref, data: (doc.data() || {}) as Record<string, unknown> });
      }

      const ingestionSnap = (await tx.get(
        db.collection("book_ingestions").where("bookId", "==", duplicateBookId).limit(50)
      )) as FirebaseFirestore.QuerySnapshot;
      for (const doc of ingestionSnap.docs) {
        ingestionDocs.set(doc.id, { ref: doc.ref, data: (doc.data() || {}) as Record<string, unknown> });
      }
    }

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
      alternateProviderWorkIds: uniqueStrings([
        ...asStringArray(asRecord(freshSurvivor.data.workIdentity)?.alternateProviderWorkIds),
        ...freshDuplicates.flatMap((candidate) =>
          asStringArray(asRecord(candidate.data.workIdentity)?.alternateProviderWorkIds)
        ),
      ]),
      providerWorkId: params.providerWorkId,
    };
    const survivorProviderExternalIds = uniqueStrings([
      ...asStringArray(freshSurvivor.data.providerExternalIds),
      ...freshDuplicates.flatMap((candidate) => asStringArray(candidate.data.providerExternalIds)),
    ]);
    const survivorIdentityKeys = uniqueStrings([
      ...asStringArray(freshSurvivor.data.identityKeys),
      ...freshDuplicates.flatMap((candidate) => asStringArray(candidate.data.identityKeys)),
      ...Array.from(identityDocs.keys()),
    ]);
    const survivorExternalReadableSources = uniqueReadableSourceRecords([
      ...asRecordArray(freshSurvivor.data.externalReadableSources),
      ...freshDuplicates.flatMap((candidate) => asRecordArray(candidate.data.externalReadableSources)),
    ]);
    const movedEditionIds = Array.from(editionDocs.keys()).sort();
    const survivorCanonicalKey =
      asNonEmptyString(freshSurvivor.data.canonicalKey) ||
      asNonEmptyString(survivorWorkIdentity.canonicalKey);
    const survivorEditionId =
      asNonEmptyString(freshSurvivor.data.editionId) || movedEditionIds[0] || "";
    const survivorPrimaryEditionId =
      asNonEmptyString(asRecord(freshSurvivor.data.canonicalRelations)?.primaryEditionId) ||
      survivorEditionId;
    const survivorHasReadyCover =
      asNonEmptyString(freshSurvivor.data.coverState) === "READY" ||
      asNonEmptyString(asRecord(freshSurvivor.data.cover)?.state) === "READY";
    const duplicateReadyCover =
      !survivorHasReadyCover
        ? freshDuplicates.find(
            (candidate) =>
              asNonEmptyString(candidate.data.coverState) === "READY" ||
              asNonEmptyString(asRecord(candidate.data.cover)?.state) === "READY"
          ) || null
        : null;
    const mergedCoverCandidateUrls = uniqueStrings([
      ...coverJobCollections.flatMap((collectionName) =>
        asStringArray(
          coverJobDataByPath.get(
            db.collection(collectionName).doc(freshSurvivor.bookId).path
          )?.candidateUrls
        )
      ),
      ...duplicateBookIds.flatMap((bookId) =>
        coverJobCollections.flatMap((collectionName) =>
          asStringArray(
            coverJobDataByPath.get(db.collection(collectionName).doc(bookId).path)?.candidateUrls
          )
        )
      ),
    ]);
    const survivorBookDraft: Record<string, unknown> = {
      ...freshSurvivor.data,
      titleAliases: survivorAliases,
      canonicalAuthorIds: survivorCanonicalAuthorIds,
      workIdentity: survivorWorkIdentity,
      providerExternalIds: survivorProviderExternalIds,
      identityKeys: survivorIdentityKeys,
      externalReadableSources: survivorExternalReadableSources,
      canonicalKey: survivorCanonicalKey,
      editionId: survivorEditionId || asNonEmptyString(freshSurvivor.data.editionId) || undefined,
      canonicalRelations: {
        ...(asRecord(freshSurvivor.data.canonicalRelations) || {}),
        ...(survivorPrimaryEditionId ? { primaryEditionId: survivorPrimaryEditionId } : {}),
      },
      ebookAttachmentId: pickFirstNonEmptyString([
        freshSurvivor.data.ebookAttachmentId,
        ...freshDuplicates.map((candidate) => candidate.data.ebookAttachmentId),
      ]) || null,
      ebookStoragePath: pickFirstNonEmptyString([
        freshSurvivor.data.ebookStoragePath,
        ...freshDuplicates.map((candidate) => candidate.data.ebookStoragePath),
      ]) || null,
      epubStoragePath: pickFirstNonEmptyString([
        freshSurvivor.data.epubStoragePath,
        ...freshDuplicates.map((candidate) => candidate.data.epubStoragePath),
      ]) || null,
      storagePath: pickFirstNonEmptyString([
        freshSurvivor.data.storagePath,
        ...freshDuplicates.map((candidate) => candidate.data.storagePath),
      ]) || null,
      acquiredFromProvider: pickFirstNonEmptyString([
        freshSurvivor.data.acquiredFromProvider,
        ...freshDuplicates.map((candidate) => candidate.data.acquiredFromProvider),
      ]) || null,
      hasEbook:
        freshSurvivor.data.hasEbook === true ||
        freshDuplicates.some((candidate) => candidate.data.hasEbook === true),
      downloadable:
        freshSurvivor.data.downloadable === true ||
        freshDuplicates.some((candidate) => candidate.data.downloadable === true),
      isEbookAvailable:
        freshSurvivor.data.isEbookAvailable === true ||
        freshDuplicates.some((candidate) => candidate.data.isEbookAvailable === true),
      updatedAt: now,
    };

    if (duplicateReadyCover) {
      survivorBookDraft.coverState =
        asNonEmptyString(duplicateReadyCover.data.coverState) || "READY";
      survivorBookDraft.cover = asRecord(duplicateReadyCover.data.cover) || freshSurvivor.data.cover;
      survivorBookDraft.coverUrl =
        asNonEmptyString(duplicateReadyCover.data.coverUrl) ||
        asNonEmptyString(freshSurvivor.data.coverUrl) ||
        "";
      survivorBookDraft.coverSource =
        asNonEmptyString(duplicateReadyCover.data.coverSource) ||
        asNonEmptyString(freshSurvivor.data.coverSource) ||
        null;
      survivorBookDraft.coverAuthority =
        typeof duplicateReadyCover.data.coverAuthority === "number"
          ? duplicateReadyCover.data.coverAuthority
          : freshSurvivor.data.coverAuthority;
    }

    const survivorSearchPatch = buildBookSearchPatch(survivorBookDraft);

    const survivorData = {
      ...survivorBookDraft,
      ...survivorSearchPatch,
    };

    const survivorPatch = {
      titleAliases: survivorAliases,
      canonicalAuthorIds: survivorCanonicalAuthorIds,
      workIdentity: survivorWorkIdentity,
      providerExternalIds: survivorProviderExternalIds,
      identityKeys: survivorIdentityKeys,
      externalReadableSources: survivorExternalReadableSources,
      canonicalKey: survivorCanonicalKey,
      ...(survivorEditionId ? { editionId: survivorEditionId } : {}),
      canonicalRelations: {
        ...(asRecord(freshSurvivor.data.canonicalRelations) || {}),
        ...(survivorPrimaryEditionId ? { primaryEditionId: survivorPrimaryEditionId } : {}),
      },
      ebookAttachmentId: survivorBookDraft.ebookAttachmentId,
      ebookStoragePath: survivorBookDraft.ebookStoragePath,
      epubStoragePath: survivorBookDraft.epubStoragePath,
      storagePath: survivorBookDraft.storagePath,
      acquiredFromProvider: survivorBookDraft.acquiredFromProvider,
      hasEbook: survivorBookDraft.hasEbook === true,
      downloadable: survivorBookDraft.downloadable === true,
      isEbookAvailable: survivorBookDraft.isEbookAvailable === true,
      ...(duplicateReadyCover
        ? {
            coverState: survivorBookDraft.coverState,
            cover: survivorBookDraft.cover,
            coverUrl: survivorBookDraft.coverUrl,
            coverSource: survivorBookDraft.coverSource,
            coverAuthority: survivorBookDraft.coverAuthority,
          }
        : {}),
      ...survivorSearchPatch,
      updatedAt: now,
    };
    assertAllowedDestructivePatch(
      survivorPatch,
      ADMIN_DUPLICATE_GROUP_SURVIVOR_PATCH_FIELDS,
      "adminMergeCanonicalDuplicateGroup.survivor"
    );
    tx.set(
      survivorRef,
      survivorPatch,
      { merge: true }
    );

    for (const { ref, data } of editionDocs.values()) {
      const nextEdition = {
        ...data,
        bookId: freshSurvivor.bookId,
        workId: freshSurvivor.bookId,
        canonicalKey: survivorCanonicalKey || asNonEmptyString(data.canonicalKey),
      };
      const editionPatch = {
        bookId: freshSurvivor.bookId,
        workId: freshSurvivor.bookId,
        canonicalKey: survivorCanonicalKey || asNonEmptyString(data.canonicalKey),
        ...buildEditionSearchPatch(nextEdition),
        updatedAt: now,
      };
      assertAllowedDestructivePatch(
        editionPatch,
        ADMIN_DUPLICATE_GROUP_EDITION_PATCH_FIELDS,
        "adminMergeCanonicalDuplicateGroup.edition"
      );
      tx.set(
        ref,
        editionPatch,
        { merge: true }
      );
    }

    for (const { ref } of identityDocs.values()) {
      const identityPatch = {
        bookId: freshSurvivor.bookId,
        updatedAt: now,
      };
      assertAllowedDestructivePatch(
        identityPatch,
        ADMIN_DUPLICATE_GROUP_IDENTITY_PATCH_FIELDS,
        "adminMergeCanonicalDuplicateGroup.identity"
      );
      tx.set(
        ref,
        identityPatch,
        { merge: true }
      );
    }

    for (const { ref, data } of ingestionDocs.values()) {
      const ingestionPatch = {
        bookId: freshSurvivor.bookId,
        canonicalKey: survivorCanonicalKey || asNonEmptyString(data.canonicalKey),
        updatedAt: now,
      };
      assertAllowedDestructivePatch(
        ingestionPatch,
        ADMIN_DUPLICATE_GROUP_INGESTION_PATCH_FIELDS,
        "adminMergeCanonicalDuplicateGroup.ingestion"
      );
      tx.set(
        ref,
        ingestionPatch,
        { merge: true }
      );
    }

    if (!survivorHasReadyCover && mergedCoverCandidateUrls.length > 0) {
      const coverJobPatch = {
        id: freshSurvivor.bookId,
        bookId: freshSurvivor.bookId,
        source: pickFirstNonEmptyString([
          coverJobDataByPath.get(db.collection("cover_jobs").doc(freshSurvivor.bookId).path)?.source,
          ...duplicateBookIds.map(
            (bookId) =>
              coverJobDataByPath.get(db.collection("cover_jobs").doc(bookId).path)?.source
          ),
        ]) || asNonEmptyString(freshSurvivor.data.source) || null,
        externalId: pickFirstNonEmptyString([
          coverJobDataByPath.get(db.collection("cover_jobs").doc(freshSurvivor.bookId).path)?.externalId,
          ...duplicateBookIds.map(
            (bookId) =>
              coverJobDataByPath.get(db.collection("cover_jobs").doc(bookId).path)?.externalId
          ),
        ]) || null,
        candidateUrls: mergedCoverCandidateUrls,
        status: "PENDING",
        updatedAt: now,
      };
      assertAllowedDestructivePatch(
        coverJobPatch,
        ADMIN_DUPLICATE_GROUP_COVER_JOB_PATCH_FIELDS,
        "adminMergeCanonicalDuplicateGroup.coverJob"
      );
      tx.set(
        db.collection("cover_jobs").doc(freshSurvivor.bookId),
        coverJobPatch,
        { merge: true }
      );
    }

    for (const duplicate of freshDuplicates) {
      const duplicateBookPatch = {
        mergedInto: freshSurvivor.bookId,
        mergeState: "merged_duplicate",
        updatedAt: now,
      };
      assertAllowedDestructivePatch(
        duplicateBookPatch,
        ADMIN_DUPLICATE_GROUP_DUPLICATE_BOOK_PATCH_FIELDS,
        "adminMergeCanonicalDuplicateGroup.duplicateBook"
      );
      tx.set(
        db.collection("books").doc(duplicate.bookId),
        duplicateBookPatch,
        { merge: true }
      );

      for (const collectionName of coverJobCollections) {
        const coverJobData = coverJobDataByPath.get(
          db.collection(collectionName).doc(duplicate.bookId).path
        );
        if (!coverJobData) {
          continue;
        }
        const coverJobRedirectPatch = {
          bookId: duplicate.bookId,
          redirectBookId: freshSurvivor.bookId,
          mergedInto: freshSurvivor.bookId,
          status: "FAILED",
          lastError: "MERGED_REDIRECT",
          updatedAt: now,
          completedAt: now,
        };
        assertAllowedDestructivePatch(
          coverJobRedirectPatch,
          ADMIN_DUPLICATE_GROUP_COVER_JOB_REDIRECT_PATCH_FIELDS,
          "adminMergeCanonicalDuplicateGroup.coverJobRedirect"
        );
        tx.set(
          db.collection(collectionName).doc(duplicate.bookId),
          coverJobRedirectPatch,
          { merge: true }
        );
      }
    }

    return {
      survivorId: freshSurvivor.bookId,
      survivorData,
      mergedBookIds: freshDuplicates.map((candidate) => candidate.bookId),
    };
  });

  if (mergeResult && mergeResult.mergedBookIds.length > 0) {
    await writeAdminDestructiveAudit({
      operation: "adminMergeCanonicalDuplicateGroup",
      action: "canonical_duplicate_group_merge",
      resourceType: "provider_work",
      resourceId: params.providerWorkId,
      actorUid: "system",
      payload: {
        survivorId: mergeResult.survivorId,
        mergedBookIds: mergeResult.mergedBookIds,
        mergedCount: mergeResult.mergedBookIds.length,
        protectedIdentityOwner: "materializeBookAuthority",
      },
    });
  }

  return mergeResult;
}

function scoreExistingSeedWork(params: {
  data: Record<string, unknown>;
  requestedCanonicalKey: string;
  requestedTitleNorm: string;
  requestedAuthorNorm: string;
  matchedProviderWorkIds?: ReadonlySet<string>;
  matchedAliasCanonicalKeys?: ReadonlySet<string>;
  allowOpenLibraryTranslationReuse?: boolean;
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
  const normalizedTitleAuthorities = extractBookNormalizedTitleAuthorities(params.data);
  const authorEquivalent = areAuthorityAuthorsEquivalent(
    { authorNamesNormalized: [params.requestedAuthorNorm] },
    params.data
  );

  let score = 0;
  if (asNonEmptyString(params.data.mergedInto)) return Number.NEGATIVE_INFINITY;
  if (params.matchedProviderWorkIds?.has(providerWorkId) && authorEquivalent) score += 220;
  if (dataCanonicalKey === params.requestedCanonicalKey) score += 100;
  if (mergeKeys.includes(params.requestedCanonicalKey)) score += 140;
  if (params.matchedAliasCanonicalKeys?.has(dataCanonicalKey) && authorEquivalent) score += 120;
  if (
    params.allowOpenLibraryTranslationReuse &&
    authorEquivalent &&
    normalizedTitleAuthorities.includes(params.requestedTitleNorm)
  ) {
    score += 180;
  }
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
  const openLibraryCandidateWorkId =
    params.candidate?.source === "openLibrary"
      ? extractOpenLibrarySeedWorkIdentifier(params.candidate)
      : "";
  const candidateAuthorData =
    (params.candidate && asRecord(params.candidate.rawBook)) ||
    (params.candidate
      ? {
          authorEn: asNonEmptyString(params.candidate.authorEn),
          authors: Array.isArray(params.candidate.authors) ? params.candidate.authors : [],
        }
      : null);
  const candidateAuthorEquivalent =
    Boolean(candidateAuthorData) &&
    areAuthorityAuthorsEquivalent(
      { authorNamesNormalized: [requestedAuthorNorm] },
      candidateAuthorData
    );
  const matchedProviderWorkIds = new Set(
    params.candidate && candidateAuthorEquivalent
      ? extractCandidateStableWorkIdentifiers(params.candidate)
      : []
  );
  const matchedAliasCanonicalKeys = new Set(
    params.candidate && candidateAuthorEquivalent
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

  if (openLibraryCandidateWorkId && requestedAuthorNorm) {
    queryJobs.push(
      db.collection("books").where("authorNamesNormalized", "array-contains", requestedAuthorNorm).limit(10).get()
    );
  }

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
      .filter((data) =>
        areAuthorityAuthorsEquivalent({ authorNamesNormalized: [requestedAuthorNorm] }, data)
      )
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
    for (const mergedBookId of mergeResult.mergedBookIds) {
      const existing = candidates.get(mergedBookId);
      if (!existing) {
        continue;
      }
      candidates.set(mergedBookId, {
        ...existing,
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
      allowOpenLibraryTranslationReuse: Boolean(openLibraryCandidateWorkId),
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
    if (discoveredProviderWorkIds.length > 0) {
      const updatedData = await persistAlternateProviderWorkIds({
        bookId: best.bookId,
        data: best.data,
        providerWorkIds: discoveredProviderWorkIds,
      });
      return { bookId: best.bookId, data: updatedData };
    }
    return { bookId: best.bookId, data: best.data };
  }

  const survivorSnap = await db.collection("books").doc(mergedInto).get();
  if (!survivorSnap.exists) {
    return { bookId: best.bookId, data: best.data };
  }

  const survivorData = (survivorSnap.data() || {}) as Record<string, unknown>;
  if (discoveredProviderWorkIds.length > 0) {
    const updatedSurvivorData = await persistAlternateProviderWorkIds({
      bookId: survivorSnap.id,
      data: survivorData,
      providerWorkIds: discoveredProviderWorkIds,
    });
    return {
      bookId: survivorSnap.id,
      data: updatedSurvivorData,
    };
  }

  return {
    bookId: survivorSnap.id,
    data: survivorData,
  };
}

async function resolveFinalCanonicalSurvivorBeforeCreate(params: {
  title: string;
  author: string;
  candidate: UnifiedSearchResult;
  rawBook: Record<string, unknown>;
}): Promise<{ bookId: string; data: Record<string, unknown> } | null> {
  let strictMatch = await resolveExistingCanonicalByAuthorAndTitle({
    title: params.title,
    author: params.author,
  });

  if (!strictMatch) {
    strictMatch = await resolveExistingCanonicalWorkForSeed({
      title: params.title,
      author: params.author,
      candidate: {
        ...params.candidate,
        title: asNonEmptyString(params.rawBook.title) || params.candidate.title,
        titleEn: asNonEmptyString(params.rawBook.titleEn) || params.candidate.titleEn,
        rawBook: params.rawBook,
      },
    });
  }

  if (!strictMatch) {
    return null;
  }

  const workIdentity = asRecord(params.rawBook.workIdentity);
  const candidateProviderWorkIds = uniqueStrings([
    ...extractCandidateStableWorkIdentifiers(params.candidate),
    normalizeBookProviderWorkId(asNonEmptyString(params.rawBook.providerWorkId)),
    normalizeBookProviderWorkId(asNonEmptyString(workIdentity?.providerWorkId)),
    normalizeBookProviderWorkId(asNonEmptyString(params.rawBook.openLibraryWorkId)),
    normalizeBookProviderWorkId(asNonEmptyString(params.rawBook.workId)),
    normalizeBookProviderWorkId(asNonEmptyString(params.rawBook.key)),
  ]);

  if (candidateProviderWorkIds.length === 0) {
    return strictMatch;
  }

  const updatedData = await persistAlternateProviderWorkIds({
    bookId: strictMatch.bookId,
    data: strictMatch.data,
    providerWorkIds: candidateProviderWorkIds,
  });
  return {
    bookId: strictMatch.bookId,
    data: updatedData,
  };
}

async function resolveExistingCanonicalByAuthorAndTitle(params: {
  title: string;
  author: string;
}): Promise<{ bookId: string; data: Record<string, unknown> } | null> {
  const requestedTitleNorm = normalizeSearchText(params.title);
  const requestedAuthorNorm = normalizeSearchText(params.author);
  if (!requestedTitleNorm || !requestedAuthorNorm) {
    return null;
  }

  const authorSnap = await db
    .collection("books")
    .where("authorNamesNormalized", "array-contains", requestedAuthorNorm)
    .limit(10)
    .get();

  const candidates = authorSnap.docs
    .map((doc) => ({
      bookId: doc.id,
      data: (doc.data() || {}) as Record<string, unknown>,
    }))
    .filter((candidate) => !asNonEmptyString(candidate.data.mergedInto))
    .filter((candidate) => normalizeBookAuthorForSeedMatch(candidate.data) === requestedAuthorNorm)
    .filter((candidate) => extractBookNormalizedTitleAuthorities(candidate.data).includes(requestedTitleNorm));

  if (candidates.length === 0) {
    return null;
  }

  const best = [...candidates].sort(compareCanonicalSurvivors)[0];
  return best ? { bookId: best.bookId, data: best.data } : null;
}

function emptyDeleteCascadeCounts(): AdminDeleteBookCascadeCounts {
  return {
    books: 0,
    editions: 0,
    attachments: 0,
    attachmentUploadIntents: 0,
    bookIdentity: 0,
    bookIngestions: 0,
    coverJobs: 0,
    readingProgress: 0,
    userLibraryBooks: 0,
    userReviews: 0,
    bookStats: 0,
    shelfRefs: 0,
    quoteLinks: 0,
    quoteSourceLinks: 0,
    authorRefs: 0,
    reviews: 0,
    ratings: 0,
    readerArtifacts: 0,
    searchProjectionDocs: 0,
    coverStorageFiles: 0,
    originalStorageFiles: 0,
    ebookStorageFiles: 0,
    attachmentStorageFiles: 0,
    otherSubcollectionDocs: 0,
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

async function countStoragePrefix(prefix: string): Promise<number> {
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles({ prefix });
  return Array.isArray(files) ? files.length : 0;
}

async function deleteStoragePaths(paths: Iterable<string>): Promise<number> {
  const bucket = admin.storage().bucket();
  const uniquePaths = Array.from(
    new Set(
      Array.from(paths)
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
  if (uniquePaths.length === 0) {
    return 0;
  }
  await Promise.all(uniquePaths.map((path) => bucket.file(path).delete({ ignoreNotFound: true })));
  return uniquePaths.length;
}

function docRefFromPath(path: string): FirebaseFirestore.DocumentReference<DocumentData> {
  const segments = path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length < 2 || segments.length % 2 !== 0) {
    throw new HttpsError("failed-precondition", `Invalid Firestore document path: ${path}`);
  }
  const collectionPath = segments.slice(0, -1).join("/");
  const docId = segments[segments.length - 1];
  return db.collection(collectionPath).doc(docId);
}

function incrementCount(target: Record<string, number>, key: string, delta = 1): void {
  target[key] = (target[key] || 0) + delta;
}

function addDocRef(
  refs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>,
  ref: FirebaseFirestore.DocumentReference<DocumentData>,
  collectionCounts: Record<string, number>,
  collectionName: string
): void {
  if (refs.has(ref.path)) {
    return;
  }
  refs.set(ref.path, ref);
  incrementCount(collectionCounts, collectionName);
}

function addStoragePath(target: Set<string>, value: unknown): void {
  const normalized = readOptionalString(value, "storagePath", 2048);
  if (normalized) {
    target.add(normalized);
  }
}

function addAttachmentId(target: Set<string>, value: unknown): void {
  const normalized = readOptionalString(value, "attachmentId", 256);
  if (normalized) {
    target.add(normalized);
  }
}

function collectAttachmentPointers(
  source: Record<string, unknown> | null | undefined,
  attachmentIds: Set<string>,
  storagePaths: Set<string>
): void {
  if (!source) {
    return;
  }
  addAttachmentId(attachmentIds, source.ebookAttachmentId);
  addStoragePath(storagePaths, source.ebookStoragePath);
  addStoragePath(storagePaths, source.epubStoragePath);
  addStoragePath(storagePaths, source.storagePath);
}

function readCanonicalAuthorIds(source: Record<string, unknown>): string[] {
  return Array.from(
    new Set(
      [
        readOptionalString(source.authorId, "authorId", 180),
        ...((Array.isArray(source.canonicalAuthorIds) ? source.canonicalAuthorIds : [])
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter((entry) => entry.length > 0)),
      ].filter((entry): entry is string => Boolean(entry))
    )
  );
}

function readParentBookCandidates(source: Record<string, unknown>): string[] {
  return Array.from(
    new Set(
      [
        readOptionalString(source.bookId, "bookId", 256),
        readOptionalString(source.workId, "workId", 256),
        readOptionalString(source.canonicalBookId, "canonicalBookId", 256),
      ].filter((entry): entry is string => Boolean(entry))
    )
  );
}

async function getDocsForCollectionPath(path: string): Promise<FirebaseFirestore.QueryDocumentSnapshot<DocumentData>[]> {
  const snap = await db.collection(path).get();
  return snap.docs;
}

async function getSubcollectionDocs(
  ref: FirebaseFirestore.DocumentReference<DocumentData>,
  knownCollectionIds: string[]
): Promise<Array<{ collectionId: string; doc: FirebaseFirestore.QueryDocumentSnapshot<DocumentData> }>> {
  const collectionIds = new Set(
    knownCollectionIds.map((value) => value.trim()).filter((value) => value.length > 0)
  );
  const listCollectionsFn = (ref as FirebaseFirestore.DocumentReference<DocumentData> & {
    listCollections?: () => Promise<Array<FirebaseFirestore.CollectionReference<DocumentData>>>;
  }).listCollections;
  if (typeof listCollectionsFn === "function") {
    const collections = await listCollectionsFn.call(ref);
    for (const collectionRef of collections) {
      collectionIds.add(collectionRef.id);
    }
  }

  const docs: Array<{ collectionId: string; doc: FirebaseFirestore.QueryDocumentSnapshot<DocumentData> }> = [];
  for (const collectionId of collectionIds) {
    const path = `${ref.path}/${collectionId}`;
    const snapshots = await getDocsForCollectionPath(path);
    for (const doc of snapshots) {
      docs.push({ collectionId, doc });
    }
  }
  return docs;
}

type DeleteTargetResolution =
  | {
      inputId: string;
      inputType: "book";
      resolvedBookId: string;
      resolvedEditionId: null;
      bookRef: FirebaseFirestore.DocumentReference<DocumentData>;
      bookSnap: FirebaseFirestore.DocumentSnapshot<DocumentData>;
      editionSnap: null;
    }
  | {
      inputId: string;
      inputType: "edition";
      resolvedBookId: string;
      resolvedEditionId: string;
      bookRef: FirebaseFirestore.DocumentReference<DocumentData>;
      bookSnap: FirebaseFirestore.DocumentSnapshot<DocumentData>;
      editionSnap: FirebaseFirestore.DocumentSnapshot<DocumentData>;
    }
  | {
      inputId: string;
      inputType: "unresolved";
      resolvedBookId: null;
      resolvedEditionId: null;
      bookRef: FirebaseFirestore.DocumentReference<DocumentData> | null;
      bookSnap: FirebaseFirestore.DocumentSnapshot<DocumentData> | null;
      editionSnap: FirebaseFirestore.DocumentSnapshot<DocumentData> | null;
    };

async function resolveDeleteTarget(inputId: string): Promise<DeleteTargetResolution> {
  const normalizedId = readRequiredString(inputId, "bookId", 180);
  const bookRef = db.collection("books").doc(normalizedId);
  const editionRef = db.collection("editions").doc(normalizedId);
  const [bookSnap, editionSnap] = await Promise.all([bookRef.get(), editionRef.get()]);

  if (bookSnap.exists && editionSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      `Delete target ${normalizedId} is ambiguous because it matches both a work and an edition.`
    );
  }

  if (bookSnap.exists) {
    return {
      inputId: normalizedId,
      inputType: "book",
      resolvedBookId: normalizedId,
      resolvedEditionId: null,
      bookRef,
      bookSnap,
      editionSnap: null,
    };
  }

  if (!editionSnap.exists) {
    return {
      inputId: normalizedId,
      inputType: "unresolved",
      resolvedBookId: null,
      resolvedEditionId: null,
      bookRef: null,
      bookSnap: null,
      editionSnap: null,
    };
  }

  const editionData = (editionSnap.data() || {}) as Record<string, unknown>;
  const parentBookIds = readParentBookCandidates(editionData);
  if (parentBookIds.length !== 1) {
    throw new HttpsError(
      "failed-precondition",
      `Edition ${normalizedId} does not resolve to exactly one canonical work.`
    );
  }

  const resolvedBookId = parentBookIds[0];
  return {
    inputId: normalizedId,
    inputType: "edition",
    resolvedBookId,
    resolvedEditionId: normalizedId,
    bookRef: db.collection("books").doc(resolvedBookId),
    bookSnap: await db.collection("books").doc(resolvedBookId).get(),
    editionSnap,
  };
}

type DeleteExecutionPlan = {
  resolution: DeleteTargetResolution;
  bookRef: FirebaseFirestore.DocumentReference<DocumentData> | null;
  bookSnap: FirebaseFirestore.DocumentSnapshot<DocumentData> | null;
  bookData: Record<string, unknown> | null;
  cascade: AdminDeleteBookCascadeCounts;
  collectionCounts: Record<string, number>;
  storageCounts: Record<string, number>;
  deleteGraph: AdminDeleteGraph;
  editionRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  attachmentRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  attachmentIntentRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  identityRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  ingestionRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  readingProgressRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  libraryRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  userReviewRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  reviewRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  ratingRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  readerArtifactRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  otherSubcollectionRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  shelfRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  quoteBookRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  quoteSourceRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  authorRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  bookStatsRef: FirebaseFirestore.DocumentReference<DocumentData> | null;
  coverJobRefs: Map<string, FirebaseFirestore.DocumentReference<DocumentData>>;
  storagePrefixes: Set<string>;
  exactStoragePaths: Set<string>;
};

function extractCandidateAuthorNames(result: UnifiedSearchResult): string[] {
  const rawBook = asRecord(result.rawBook) || {};
  return uniqueStrings([
    ...(Array.isArray(result.authors)
      ? result.authors.filter((entry): entry is string => typeof entry === "string")
      : []),
    ...asStringArray(rawBook.providerAuthors),
    ...asStringArray(rawBook.rawProviderAuthors),
    ...asStringArray(rawBook.authors),
    ...asStringArray(rawBook.author_name),
    result.authorEn,
    asNonEmptyString(rawBook.author),
    asNonEmptyString(rawBook.authorEn),
  ]);
}

function extractCandidateTitle(result: UnifiedSearchResult): string {
  const rawBook = asRecord(result.rawBook) || {};
  return (
    asNonEmptyString(result.title) ||
    asNonEmptyString(rawBook.title) ||
    asNonEmptyString(rawBook.titleEn) ||
    ""
  );
}

function resolvePreferredCandidateAuthor(
  result: UnifiedSearchResult,
  requestedAuthorNorm = "",
  requestedTitle = ""
): string {
  const authors = extractCandidateAuthorNames(result);
  const overriddenAuthor = resolveCanonicalSeedAuthorityAuthor({
    title: requestedTitle,
  });

  if (authors.length === 0) {
    return overriddenAuthor || "";
  }

  if (
    overriddenAuthor &&
    !authors.some((author) =>
      authorMatchesCanonicalSeedAuthority({
        title: requestedTitle,
        author,
      })
    )
  ) {
    return overriddenAuthor;
  }

  const exactRequestedMatch = authors.find(
    (author) => normalizeSearchText(author) === requestedAuthorNorm
  );
  if (exactRequestedMatch) {
    return exactRequestedMatch;
  }

  const cleanPrimary = authors.find(
    (author) =>
      !hasContributorRoleSignal(author) &&
      !hasRejectedContributorCandidateSignal(author)
  );
  return cleanPrimary || authors[0] || "";
}

function normalizeCandidateAuthor(
  result: UnifiedSearchResult,
  requestedAuthorNorm = "",
  requestedTitle = ""
): string {
  return normalizeSearchText(
    resolvePreferredCandidateAuthor(result, requestedAuthorNorm, requestedTitle)
  );
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

function normalizeSeedDescriptionText(value: string): string {
  const stripped =
    value.includes("<") && value.includes(">")
      ? value.replace(/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?\s*\/?>/gu, " ")
      : value;
  return stripped.replace(/\s+/gu, " ").trim();
}

function isUsableSeedDescriptionText(value: string): boolean {
  const normalized = normalizeSeedDescriptionText(value);
  if (normalized.length < 80) {
    return false;
  }
  if (normalized.includes("\uFFFD")) {
    return false;
  }
  if (
    /\b(summary|publisher|marketing|biography|catalog(?:ed|ue)?|commentary|compilation|lesson material|contextual material|archival image|unabridged|abridged|illustrated edition|collector(?:'s)? edition|special edition|paperback edition|hardcover edition|movie tie-?in|box set|omnibus)\b/iu.test(
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

function resolveSeedDescription(rawBook: Record<string, unknown>): string {
  return (
    asNonEmptyString(rawBook.descriptionEn) ||
    asNonEmptyString(rawBook.description) ||
    asNonEmptyString(rawBook.abstractDescription) ||
    asNonEmptyString(rawBook.summary) ||
    ""
  );
}

function normalizeOpenLibraryWorkIdForFetch(value: string): string {
  return value
    .replace(/^openLibrary:/i, "")
    .replace(/^\/works\//i, "")
    .replace(/^OL_/i, "")
    .replace(/^ol_/i, "")
    .trim();
}

function normalizeOpenLibrarySeedWorkIdCandidate(value: unknown): string {
  const normalized = normalizeOpenLibraryWorkIdForFetch(asNonEmptyString(value));
  return /^OL\d+W$/iu.test(normalized) ? normalized : "";
}

function extractOpenLibrarySeedWorkIdForFetch(result: UnifiedSearchResult): string {
  if (result.source !== "openLibrary") {
    return "";
  }

  const rawBook = asRecord(result.rawBook) || {};
  const workIdentity = asRecord(rawBook.workIdentity);
  const providerIds = asRecord(rawBook.providerIds);
  const candidates = [
    rawBook.openLibraryWorkId,
    rawBook.workId,
    rawBook.key,
    rawBook.providerWorkId,
    workIdentity?.providerWorkId,
    providerIds?.openLibrary,
    result.workId,
    result.externalId,
    result.id,
    ...asStringArray(rawBook.providerExternalIds),
    ...asStringArray(workIdentity?.alternateProviderWorkIds),
  ];

  for (const candidate of candidates) {
    const workId = normalizeOpenLibrarySeedWorkIdCandidate(candidate);
    if (workId) {
      return workId;
    }
  }

  return "";
}

function mergeSeedHydratedMetadata(params: {
  result: UnifiedSearchResult;
  hydratedRawBook: Record<string, unknown>;
  hydratedSource: "googleBooks" | "openLibrary";
  description: string;
  providerExternalId: string;
}): UnifiedSearchResult {
  const rawBook =
    params.result.rawBook && typeof params.result.rawBook === "object" && !Array.isArray(params.result.rawBook)
      ? ({ ...(params.result.rawBook as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const hydrated = params.hydratedRawBook;
  const coverImages = asRecord(hydrated.coverImages);
  const imageLinks = asRecord(hydrated.imageLinks);
  const coverUrl = pickFirstNonEmptyString([
    hydrated.coverUrl,
    hydrated.thumbnail,
    coverImages?.large,
    coverImages?.medium,
    coverImages?.small,
  ]);
  const coverId = pickFirstNonEmptyString([hydrated.coverId, hydrated.cover_i]);
  const providerPatch =
    params.hydratedSource === "openLibrary"
      ? {
          openLibraryWorkId: params.providerExternalId,
          ...(asNonEmptyString(hydrated.openLibraryEditionId)
            ? { openLibraryEditionId: asNonEmptyString(hydrated.openLibraryEditionId) }
            : {}),
          ...(asNonEmptyString(hydrated.editionExternalId)
            ? { editionExternalId: asNonEmptyString(hydrated.editionExternalId) }
            : {}),
        }
      : params.hydratedSource === "googleBooks"
        ? {
            googleBooksVolumeId: params.providerExternalId,
          }
        : {};

  return {
    ...params.result,
    rawBook: {
      ...rawBook,
      description: params.description,
      descriptionEn: params.description,
      abstractDescription: params.description,
      ...(coverUrl ? { coverUrl } : {}),
      ...(coverId ? { coverId, cover_i: coverId } : {}),
      ...(imageLinks ? { imageLinks } : {}),
      ...providerPatch,
    },
  };
}

function resolveCanonicalSeedDescriptionFallback(params: {
  requestedTitle: string;
  requestedAuthor: string;
}): string {
  const requestedTitleNorm = normalizeSearchText(params.requestedTitle);
  const requestedAuthorNorm = normalizeSearchText(params.requestedAuthor);
  const fallback = CANONICAL_SEED_DESCRIPTION_FALLBACKS.find(
    (entry) =>
      normalizeSearchText(entry.title) === requestedTitleNorm &&
      normalizeSearchText(entry.author) === requestedAuthorNorm
  );
  const description = normalizeSeedDescriptionText(fallback?.description || "");
  return isUsableSeedDescriptionText(description) ? description : "";
}

function mergeSeedDescriptionOnly(params: {
  result: UnifiedSearchResult;
  description: string;
  canonicalFallback?: boolean;
}): UnifiedSearchResult {
  const rawBook =
    params.result.rawBook && typeof params.result.rawBook === "object" && !Array.isArray(params.result.rawBook)
      ? ({ ...(params.result.rawBook as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  return {
    ...params.result,
    rawBook: {
      ...rawBook,
      description: params.description,
      descriptionEn: params.description,
      abstractDescription: params.description,
      ...(params.canonicalFallback === false ? {} : { canonicalSeedDescriptionFallback: true }),
    },
  };
}

function selectGoogleBooksDescriptionFallbackCandidate(params: {
  searchResults: UnifiedSearchResult[];
  requestedTitle: string;
  requestedAuthor: string;
}): UnifiedSearchResult | null {
  const requestedTitleNorm = normalizeSearchText(params.requestedTitle);
  const requestedAuthorNorm = normalizeSearchText(params.requestedAuthor);
  const candidates = params.searchResults.filter(
    (result) =>
      result.resultType === "external" &&
      result.source === "googleBooks" &&
      typeof result.externalId === "string" &&
      result.externalId.trim().length > 0 &&
      !isWeakBulkCandidate({
        result,
        requestedTitleNorm,
        requestedAuthorNorm,
        requestedTitle: params.requestedTitle,
      })
  );

  return [...candidates].sort((left, right) => {
    const scoreDelta =
      computeBulkCandidateScore({
        result: right,
        requestedTitleNorm,
        requestedAuthorNorm,
        requestedTitle: params.requestedTitle,
      }) -
      computeBulkCandidateScore({
        result: left,
        requestedTitleNorm,
        requestedAuthorNorm,
        requestedTitle: params.requestedTitle,
      });
    if (scoreDelta !== 0) return scoreDelta;
    return left.rank - right.rank;
  })[0] || null;
}

async function resolveGoogleBooksSeedDescriptionFallback(params: {
  result: UnifiedSearchResult;
  requestedTitle: string;
  requestedAuthor: string;
  searchResults: UnifiedSearchResult[];
}): Promise<UnifiedSearchResult> {
  const googleFallbackCandidate =
    params.result.source === "googleBooks"
      ? params.result
      : selectGoogleBooksDescriptionFallbackCandidate({
          searchResults: params.searchResults,
          requestedTitle: params.requestedTitle,
          requestedAuthor: params.requestedAuthor,
        });
  const googleVolumeId = asNonEmptyString(googleFallbackCandidate?.externalId);
  if (!googleVolumeId) {
    return params.result;
  }

  const hydratedRawBook = await fetchGoogleBooksCanonicalMetadata(googleVolumeId);
  if (!hydratedRawBook) {
    return params.result;
  }

  const hydratedDescription = normalizeSeedDescriptionText(resolveSeedDescription(hydratedRawBook));
  if (!isUsableSeedDescriptionText(hydratedDescription)) {
    return params.result;
  }

  return mergeSeedHydratedMetadata({
    result: params.result,
    hydratedRawBook,
    hydratedSource: "googleBooks",
    description: hydratedDescription,
    providerExternalId: googleVolumeId,
  });
}

async function resolveSeedDescriptionFallback(params: {
  result: UnifiedSearchResult;
  requestedTitle: string;
  requestedAuthor: string;
  searchResults: UnifiedSearchResult[];
  allowCanonicalSeedDescription: boolean;
}): Promise<UnifiedSearchResult> {
  const googleFallback = await resolveGoogleBooksSeedDescriptionFallback(params);
  const googleFallbackRawBook = asRecord(googleFallback.rawBook) || {};
  if (isUsableSeedDescriptionText(resolveSeedDescription(googleFallbackRawBook))) {
    return googleFallback;
  }

  if (!params.allowCanonicalSeedDescription) {
    return params.result;
  }

  const canonicalSeedDescription = resolveCanonicalSeedDescriptionFallback({
    requestedTitle: params.requestedTitle,
    requestedAuthor: params.requestedAuthor,
  });
  if (!canonicalSeedDescription) {
    return params.result;
  }

  return mergeSeedDescriptionOnly({
    result: params.result,
    description: canonicalSeedDescription,
  });
}

async function hydrateSeedCandidateDescription(params: {
  result: UnifiedSearchResult;
  requestedTitle: string;
  requestedAuthor: string;
  searchResults: UnifiedSearchResult[];
}): Promise<UnifiedSearchResult> {
  const result = params.result;
  if (result.source !== "openLibrary" && result.source !== "googleBooks") {
    return result;
  }

  const rawBook =
    result.rawBook && typeof result.rawBook === "object" && !Array.isArray(result.rawBook)
      ? (result.rawBook as Record<string, unknown>)
      : {};
  const selectedSeedDescription = normalizeSeedDescriptionText(resolveSeedDescription(rawBook));
  if (isUsableSeedDescriptionText(selectedSeedDescription)) {
    return mergeSeedDescriptionOnly({
      result,
      description: selectedSeedDescription,
      canonicalFallback: false,
    });
  }
  const canUseCanonicalSeedDescription = !isUsableSeedDescriptionText(selectedSeedDescription);

  if (result.source === "googleBooks") {
    return resolveSeedDescriptionFallback({
      ...params,
      allowCanonicalSeedDescription: canUseCanonicalSeedDescription,
    });
  }

  const providerExternalId =
    extractOpenLibrarySeedWorkIdForFetch(result);
  if (!providerExternalId) {
    return resolveSeedDescriptionFallback({
      ...params,
      allowCanonicalSeedDescription: canUseCanonicalSeedDescription,
    });
  }

  const hydratedRawBook = await fetchOpenLibraryCanonicalMetadata(providerExternalId);
  if (!hydratedRawBook) {
    return resolveSeedDescriptionFallback({
      ...params,
      allowCanonicalSeedDescription: canUseCanonicalSeedDescription,
    });
  }

  const hydratedDescription = normalizeSeedDescriptionText(resolveSeedDescription(hydratedRawBook));
  if (!isUsableSeedDescriptionText(hydratedDescription)) {
    return resolveSeedDescriptionFallback({
      ...params,
      allowCanonicalSeedDescription: canUseCanonicalSeedDescription,
    });
  }

  return mergeSeedHydratedMetadata({
    result,
    hydratedRawBook,
    hydratedSource: "openLibrary",
    description: hydratedDescription,
    providerExternalId,
  });
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

function applyCanonicalSeedAuthorOverrideAtFinalPayloadWrite(params: {
  rawBook: Record<string, unknown>;
  requestedTitle: string;
  requestedAuthor: string;
}): Record<string, unknown> {
  const seedAuthor =
    resolveCanonicalSeedAuthorityAuthor({
      title: params.requestedTitle,
      fallbackAuthor: params.requestedAuthor,
    }) || params.requestedAuthor.trim();

  if (!seedAuthor) {
    return params.rawBook;
  }

  const seedAuthorCanonicalKey = buildCanonicalKey({
    author: seedAuthor,
    title: "unknown",
  });
  const seedAuthorNorm = normalizeSearchText(seedAuthor);

  const priorAuthorCandidates = uniqueStrings([
    asNonEmptyString(params.rawBook.author),
    asNonEmptyString(params.rawBook.authorEn),
    ...asStringArray(params.rawBook.authors),
    ...asStringArray(params.rawBook.authorAliases),
  ]).filter((author) => normalizeSearchText(author) !== seedAuthorNorm);

  return {
    ...params.rawBook,
    author: seedAuthor,
    authorEn: seedAuthor,
    authors: [seedAuthor],
    authorCanonicalKey: seedAuthorCanonicalKey,
    seedAuthorLock: {
      author: seedAuthor,
      authorEn: seedAuthor,
      authors: [seedAuthor],
      authorCanonicalKey: seedAuthorCanonicalKey,
      source: "canonical_seed",
    },
    ...(priorAuthorCandidates.length > 0
      ? {
          authorAliases: uniqueStrings([
            ...priorAuthorCandidates,
            ...asStringArray(params.rawBook.authorAliases),
          ]),
        }
      : {}),
  };
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
  const authoritativeSeedAuthor =
    resolveCanonicalSeedAuthorityAuthor({
      title: params.requestedTitle,
      fallbackAuthor: requestedAuthor,
    }) || requestedAuthor;
  const providerTitleNorm = normalizeSearchText(providerTitle);
  const requestedTitleNorm = normalizeSearchText(params.requestedTitle);
  const providerAuthor =
    typeof rawBook.author === "string" && rawBook.author.trim().length > 0
      ? rawBook.author
      : params.result.authorEn || "";
  const providerAuthorNorm = normalizeSearchText(providerAuthor);
  const requestedAuthorNorm = normalizeSearchText(requestedAuthor);
  const providerAuthors = uniqueStrings([
    ...asStringArray(rawBook.authors),
    ...asStringArray(rawBook.author_name),
    providerAuthor,
  ]);

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
  rawBook.providerAuthors = providerAuthors;
  rawBook.author = authoritativeSeedAuthor;
  rawBook.authorEn = authoritativeSeedAuthor;
  rawBook.authors = [authoritativeSeedAuthor];
  rawBook.authorityStatus = "canonical";
  rawBook.canonicalLocked = true;
  rawBook.workType = "canonical";
  const normalizedSeedPayload = normalizeBatchCanonicalSeedPayload({
    rawBook,
    requestedTitle: params.requestedTitle,
    requestedAuthor: authoritativeSeedAuthor,
  });
  return normalizedSeedPayload
    ? applyCanonicalSeedAuthorOverrideAtFinalPayloadWrite({
        rawBook: normalizedSeedPayload,
        requestedTitle: params.requestedTitle,
        requestedAuthor: authoritativeSeedAuthor,
      })
    : undefined;
}

function resolveCandidateTitleAuthorities(result: UnifiedSearchResult): string[] {
  const rawBook = asRecord(result.rawBook) || {};
  return uniqueStrings([
    asNonEmptyString(result.title),
    asNonEmptyString(rawBook.title),
    asNonEmptyString(rawBook.originalTitle),
    asNonEmptyString(rawBook.titleEn),
    asNonEmptyString(rawBook.titleAr),
    ...asStringArray(rawBook.titleAliases),
    ...asStringArray(rawBook.alternateTitles),
    ...asStringArray(rawBook.otherTitles),
  ]);
}

function titlesMatchRequestedAuthor(authorNorm: string, requestedAuthorNorm: string): boolean {
  if (!authorNorm || !requestedAuthorNorm) {
    return false;
  }
  return (
    authorNorm === requestedAuthorNorm ||
    authorNorm.startsWith(requestedAuthorNorm) ||
    requestedAuthorNorm.startsWith(authorNorm)
  );
}

function extractTrustedOpenLibraryAliasTitles(params: {
  selectedCandidate: UnifiedSearchResult;
  secondaryCandidates: UnifiedSearchResult[];
  requestedTitle: string;
  requestedAuthor: string;
}): string[] {
  const requestedTitleNorm = normalizeSearchText(params.requestedTitle);
  const requestedAuthorNorm = normalizeSearchText(params.requestedAuthor);
  const selectedTitleNorms = new Set(
    resolveCandidateTitleAuthorities(params.selectedCandidate)
      .map((entry) => normalizeSearchText(entry))
      .filter(Boolean)
  );

  return uniqueStrings(
    params.secondaryCandidates
      .filter(
        (candidate) =>
          candidate.resultType === "external" &&
          candidate.source === "openLibrary" &&
          typeof candidate.externalId === "string" &&
          candidate.externalId.trim().length > 0
      )
      .filter(
        (candidate) =>
          !isWeakBulkCandidate({
            result: candidate,
            requestedTitleNorm,
            requestedAuthorNorm,
          })
      )
      .filter((candidate) =>
        titlesMatchRequestedAuthor(
          normalizeCandidateAuthor(candidate, requestedAuthorNorm, params.requestedTitle),
          requestedAuthorNorm
        )
      )
      .flatMap((candidate) => resolveCandidateTitleAuthorities(candidate))
      .filter((title) => {
        const normalized = normalizeSearchText(title);
        if (!normalized) {
          return false;
        }
        if (selectedTitleNorms.has(normalized)) {
          return false;
        }
        if (requestedAuthorNorm && normalized.includes(requestedAuthorNorm)) {
          return false;
        }
        return true;
      })
  ).slice(0, 12);
}

async function enrichGoogleWinnerWithOpenLibraryAliases(params: {
  selectedCandidate: UnifiedSearchResult;
  requestedTitle: string;
  requestedAuthor: string;
  initialResults: UnifiedSearchResult[];
}): Promise<UnifiedSearchResult> {
  if (params.selectedCandidate.source !== "googleBooks") {
    return params.selectedCandidate;
  }

  let secondaryCandidates = params.initialResults.filter(
    (candidate) => candidate.source === "openLibrary" && candidate.resultType === "external"
  );

  let trustedAliases = extractTrustedOpenLibraryAliasTitles({
    selectedCandidate: params.selectedCandidate,
    secondaryCandidates,
    requestedTitle: params.requestedTitle,
    requestedAuthor: params.requestedAuthor,
  });

  if (trustedAliases.length === 0) {
    const normalizedQuery = [
      normalizeSearchText(params.requestedTitle),
      normalizeSearchText(params.requestedAuthor),
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    if (normalizedQuery) {
      const secondarySearch = await unifiedSearch(normalizedQuery, {
        limit: 10,
      });
      secondaryCandidates = Array.isArray(secondarySearch?.results)
        ? secondarySearch.results.filter(
            (candidate) => candidate.source === "openLibrary" && candidate.resultType === "external"
          )
        : [];
      trustedAliases = extractTrustedOpenLibraryAliasTitles({
        selectedCandidate: params.selectedCandidate,
        secondaryCandidates,
        requestedTitle: params.requestedTitle,
        requestedAuthor: params.requestedAuthor,
      });
    }
  }

  if (trustedAliases.length === 0) {
    return params.selectedCandidate;
  }

  const rawBook =
    params.selectedCandidate.rawBook &&
    typeof params.selectedCandidate.rawBook === "object" &&
    !Array.isArray(params.selectedCandidate.rawBook)
      ? ({ ...(params.selectedCandidate.rawBook as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  return {
    ...params.selectedCandidate,
    rawBook: {
      ...rawBook,
      titleAliases: uniqueStrings([
        ...asStringArray(rawBook.titleAliases),
        ...trustedAliases,
      ]),
    },
  };
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
  requestedTitle?: string;
}): boolean {
  const titleNorm = normalizeSearchText(extractCandidateTitle(params.result));
  const requestedTitle = params.requestedTitle || params.requestedTitleNorm;
  const authorNorm = normalizeCandidateAuthor(
    params.result,
    params.requestedAuthorNorm,
    requestedTitle
  );
  const candidateAuthors = extractCandidateAuthorNames(params.result);
  const overrideAuthor = resolveCanonicalSeedAuthorityAuthor({
    title: requestedTitle,
  });

  if (!titleNorm || !authorNorm) {
    return true;
  }

  if (candidateAuthors.every((author) => hasRejectedContributorCandidateSignal(author))) {
    return true;
  }

  if (candidateAuthors.some((author) => hasRejectedContributorCandidateSignal(author))) {
    if (!candidateAuthors.some((author) => normalizeSearchText(author) === params.requestedAuthorNorm)) {
      return true;
    }
  }

  if (hasRejectedCandidateTitleSignal(extractCandidateTitle(params.result))) {
    return true;
  }

  if (
    overrideAuthor &&
    candidateAuthors.length > 0 &&
    !candidateAuthors.some((author) =>
      authorMatchesCanonicalSeedAuthority({
        title: requestedTitle,
        author,
      })
    )
  ) {
    return false;
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
  requestedTitle?: string;
}): number {
  const requestedTitle = params.requestedTitle || params.requestedTitleNorm;
  const titleNorm = normalizeSearchText(extractCandidateTitle(params.result));
  const authorNorm = normalizeCandidateAuthor(
    params.result,
    params.requestedAuthorNorm,
    requestedTitle
  );
  const preferredAuthor = resolvePreferredCandidateAuthor(
    params.result,
    params.requestedAuthorNorm,
    requestedTitle
  );
  const candidateAuthors = extractCandidateAuthorNames(params.result);
  const overrideAuthor = resolveCanonicalSeedAuthorityAuthor({
    title: requestedTitle,
  });
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

  if (preferredAuthor && !hasContributorRoleSignal(preferredAuthor)) {
    score += 30;
  }

  if (
    overrideAuthor &&
    normalizeSearchText(preferredAuthor) === normalizeSearchText(overrideAuthor)
  ) {
    score += 160;
  }

  if (candidateAuthors.some((author) => hasRejectedContributorCandidateSignal(author))) {
    score -= 120;
  }

  if (hasRejectedCandidateTitleSignal(extractCandidateTitle(params.result))) {
    score -= 140;
  }

  score += Number.isFinite(params.result.confidence) ? params.result.confidence : 0;
  score -= typeof params.result.rank === "number" ? params.result.rank : 0;

  return score;
}

function extractOpenLibrarySeedWorkIdentifier(result: UnifiedSearchResult): string {
  if (result.source !== "openLibrary") {
    return "";
  }

  const rawBook = asRecord(result.rawBook) || {};
  return normalizeStableExternalWorkIdentifier(
    "openLibrary",
    asNonEmptyString(rawBook.openLibraryWorkId) ||
      asNonEmptyString(rawBook.key) ||
      asNonEmptyString(rawBook.workId) ||
      asNonEmptyString(result.externalId)
  );
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

  const openLibraryWorkCandidates = providerCandidates.filter(
    (result) => Boolean(extractOpenLibrarySeedWorkIdentifier(result))
  );
  const prioritizedCandidates =
    openLibraryWorkCandidates.length > 0 ? openLibraryWorkCandidates : providerCandidates;

  const strongCandidates = prioritizedCandidates.filter(
    (result) =>
      !isWeakBulkCandidate({
        result,
        requestedTitleNorm,
        requestedAuthorNorm,
        requestedTitle: params.requestedTitle,
      })
  );

  const candidates = strongCandidates.length > 0 ? strongCandidates : prioritizedCandidates;
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    const scoreDelta =
      computeBulkCandidateScore({
        result: right,
        requestedTitleNorm,
        requestedAuthorNorm,
        requestedTitle: params.requestedTitle,
      }) -
      computeBulkCandidateScore({
        result: left,
        requestedTitleNorm,
        requestedAuthorNorm,
        requestedTitle: params.requestedTitle,
      });
    if (scoreDelta !== 0) return scoreDelta;
    const sourceDelta = sourceAuthorityRank(right.source) - sourceAuthorityRank(left.source);
    if (sourceDelta !== 0) return sourceDelta;
    return left.rank - right.rank;
  })[0] || null;
}

async function retryOpenLibraryBulkProviderCandidate(params: {
  requestedTitle: string;
  requestedAuthor: string;
}): Promise<UnifiedSearchResult | null> {
  const normalizedQuery = [
    normalizeSearchText(params.requestedTitle),
    normalizeSearchText(params.requestedAuthor),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!normalizedQuery) {
    return null;
  }

  const retrySearch = await unifiedSearch(normalizedQuery, {
    limit: 10,
  });
  if (!retrySearch || !Array.isArray(retrySearch.results)) {
    return null;
  }
  const openLibraryRetryCandidates = retrySearch.results.filter(
    (result) =>
      result.resultType === "external" &&
      result.source === "openLibrary" &&
      Boolean(extractOpenLibrarySeedWorkIdentifier(result))
  );

  if (openLibraryRetryCandidates.length === 0) {
    return null;
  }

  return selectStrongestBulkProviderCandidate({
    results: openLibraryRetryCandidates,
    requestedTitle: params.requestedTitle,
    requestedAuthor: params.requestedAuthor,
  });
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

async function buildDeleteExecutionPlan(inputId: string): Promise<DeleteExecutionPlan> {
  const resolution = await resolveDeleteTarget(inputId);
  const cascade = emptyDeleteCascadeCounts();
  const collectionCounts: Record<string, number> = {};
  const storageCounts: Record<string, number> = {};
  const editionRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const attachmentRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const attachmentIntentRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const identityRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const ingestionRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const readingProgressRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const libraryRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const userReviewRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const reviewRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const ratingRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const readerArtifactRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const otherSubcollectionRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const shelfRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const quoteBookRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const quoteSourceRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const authorRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const coverJobRefs = new Map<string, FirebaseFirestore.DocumentReference<DocumentData>>();
  const storagePrefixes = new Set<string>();
  const exactStoragePaths = new Set<string>();

  const plan: DeleteExecutionPlan = {
    resolution,
    bookRef: resolution.bookRef,
    bookSnap: resolution.bookSnap,
    bookData:
      resolution.bookSnap && resolution.bookSnap.exists
        ? ((resolution.bookSnap.data() || {}) as Record<string, unknown>)
        : null,
    cascade,
    collectionCounts,
    storageCounts,
    deleteGraph: {
      inputId: resolution.inputId,
      inputType: resolution.inputType,
      resolvedBookId: resolution.resolvedBookId,
      resolvedEditionId: resolution.resolvedEditionId,
      editionIds: [],
      attachmentIds: [],
      touchedCollections: [],
      storagePrefixes: [],
      storagePaths: [],
      searchProjectionSources: [],
    },
    editionRefs,
    attachmentRefs,
    attachmentIntentRefs,
    identityRefs,
    ingestionRefs,
    readingProgressRefs,
    libraryRefs,
    userReviewRefs,
    reviewRefs,
    ratingRefs,
    readerArtifactRefs,
    otherSubcollectionRefs,
    shelfRefs,
    quoteBookRefs,
    quoteSourceRefs,
    authorRefs,
    bookStatsRef: null,
    coverJobRefs,
    storagePrefixes,
    exactStoragePaths,
  };

  if (!resolution.resolvedBookId) {
    return plan;
  }

  const bookId = resolution.resolvedBookId;
  const bookRef = resolution.bookRef;
  const bookSnap = resolution.bookSnap;
  const bookData = plan.bookData;
  if (bookRef && bookSnap?.exists) {
    incrementCount(collectionCounts, "books");
    cascade.books = 1;
    cascade.searchProjectionDocs += 1;
    plan.deleteGraph.searchProjectionSources.push("books");
  }

  const editionSnapshots = await Promise.all([
    db.collection("editions").where("bookId", "==", bookId).get(),
    db.collection("editions").where("workId", "==", bookId).get(),
    db.collection("editions").where("canonicalBookId", "==", bookId).get(),
  ]);

  for (const snap of editionSnapshots) {
    for (const doc of snap.docs) {
      addDocRef(editionRefs, doc.ref, collectionCounts, "editions");
    }
  }
  if (resolution.editionSnap?.exists) {
    addDocRef(editionRefs, resolution.editionSnap.ref, collectionCounts, "editions");
  }
  cascade.editions = editionRefs.size;
  cascade.searchProjectionDocs += editionRefs.size;
  if (editionRefs.size > 0) {
    plan.deleteGraph.searchProjectionSources.push("editions");
  }

  const editionIds = Array.from(editionRefs.values()).map((ref) => ref.id);
  const attachmentIds = new Set<string>();
  const parentAttachmentQueries = editionIds.map((editionId) =>
    db.collection("attachments").where("parentId", "==", editionId).get()
  );
  const [
    identitySnap,
    ingestionSnap,
    readingProgressSnap,
    librarySnap,
    quoteBookSnap,
    quoteSourceSnap,
    userReviewSnap,
    readerHighlightSnap,
    readerBookmarkSnap,
    readerEventSnap,
    readerAuditSnap,
    readerSyncSnap,
    attachmentByBookSnap,
    ...attachmentByEditionSnaps
  ] = await Promise.all([
    db.collection("book_identity").where("bookId", "==", bookId).get(),
    db.collection("book_ingestions").where("bookId", "==", bookId).get(),
    db.collection("reading_progress").where("bookId", "==", bookId).get(),
    db.collection("user_library_books").where("bookId", "==", bookId).get(),
    db.collection("quotes").where("bookId", "==", bookId).get(),
    db.collection("quotes").where("sourceBookId", "==", bookId).get(),
    db.collection("user_reviews").where("bookId", "==", bookId).get(),
    db.collection("reader_highlights").where("bookId", "==", bookId).get(),
    db.collection("reader_bookmarks").where("bookId", "==", bookId).get(),
    db.collection("reader_events").where("bookId", "==", bookId).get(),
    db.collection("reader_audit").where("bookId", "==", bookId).get(),
    db.collection("reader_sync_idempotency").where("bookId", "==", bookId).get(),
    db.collection("attachments").where("bookId", "==", bookId).get(),
    ...parentAttachmentQueries,
  ]);

  for (const doc of identitySnap.docs) {
    addDocRef(identityRefs, doc.ref, collectionCounts, "book_identity");
  }
  cascade.bookIdentity = identityRefs.size;

  for (const doc of ingestionSnap.docs) {
    addDocRef(ingestionRefs, doc.ref, collectionCounts, "book_ingestions");
  }
  cascade.bookIngestions = ingestionRefs.size;

  for (const doc of readingProgressSnap.docs) {
    addDocRef(readingProgressRefs, doc.ref, collectionCounts, "reading_progress");
  }
  cascade.readingProgress = readingProgressRefs.size;

  for (const doc of librarySnap.docs) {
    addDocRef(libraryRefs, doc.ref, collectionCounts, "user_library_books");
    const data = (doc.data() || {}) as Record<string, unknown>;
    const shelfIds = Array.isArray(data.shelfIds) ? data.shelfIds : [];
    for (const shelfId of shelfIds) {
      const normalizedShelfId = typeof shelfId === "string" ? shelfId.trim() : "";
      if (!normalizedShelfId) continue;
      const shelfRef = db.collection("shelves").doc(normalizedShelfId);
      const shelfSnap = await shelfRef.get();
      if (shelfSnap.exists) {
        addDocRef(shelfRefs, shelfRef, collectionCounts, "shelves");
      }
    }
  }
  cascade.userLibraryBooks = libraryRefs.size;
  cascade.shelfRefs = shelfRefs.size;

  for (const doc of quoteBookSnap.docs) {
    addDocRef(quoteBookRefs, doc.ref, collectionCounts, "quotes");
  }
  for (const doc of quoteSourceSnap.docs) {
    addDocRef(quoteSourceRefs, doc.ref, collectionCounts, "quotes");
  }
  cascade.quoteLinks = quoteBookRefs.size;
  cascade.quoteSourceLinks = quoteSourceRefs.size;

  for (const doc of userReviewSnap.docs) {
    addDocRef(userReviewRefs, doc.ref, collectionCounts, "user_reviews");
  }
  cascade.userReviews = userReviewRefs.size;

  for (const doc of readerHighlightSnap.docs) {
    addDocRef(readerArtifactRefs, doc.ref, collectionCounts, "reader_highlights");
  }
  for (const doc of readerBookmarkSnap.docs) {
    addDocRef(readerArtifactRefs, doc.ref, collectionCounts, "reader_bookmarks");
  }
  for (const doc of readerEventSnap.docs) {
    addDocRef(readerArtifactRefs, doc.ref, collectionCounts, "reader_events");
  }
  for (const doc of readerAuditSnap.docs) {
    addDocRef(readerArtifactRefs, doc.ref, collectionCounts, "reader_audit");
  }
  for (const doc of readerSyncSnap.docs) {
    addDocRef(readerArtifactRefs, doc.ref, collectionCounts, "reader_sync_idempotency");
  }

  collectAttachmentPointers(bookData, attachmentIds, exactStoragePaths);
  for (const doc of attachmentByBookSnap.docs) {
    addDocRef(attachmentRefs, doc.ref, collectionCounts, "attachments");
    collectAttachmentPointers((doc.data() || {}) as Record<string, unknown>, attachmentIds, exactStoragePaths);
    attachmentIds.add(doc.id);
  }
  for (const snap of attachmentByEditionSnaps) {
    for (const doc of snap.docs) {
      addDocRef(attachmentRefs, doc.ref, collectionCounts, "attachments");
      collectAttachmentPointers((doc.data() || {}) as Record<string, unknown>, attachmentIds, exactStoragePaths);
      attachmentIds.add(doc.id);
    }
  }

  const editionSubcollections = await Promise.all(
    Array.from(editionRefs.values()).map(async (editionRef) => {
      const editionSnap = await editionRef.get();
      if (!editionSnap.exists) {
        return [];
      }
      const editionData = (editionSnap.data() || {}) as Record<string, unknown>;
      collectAttachmentPointers(editionData, attachmentIds, exactStoragePaths);
      return getSubcollectionDocs(editionRef, []);
    })
  );
  for (const groups of editionSubcollections) {
    for (const { collectionId, doc } of groups) {
      addDocRef(otherSubcollectionRefs, doc.ref, collectionCounts, `editions.${collectionId}`);
    }
  }

  if (bookRef) {
    const bookSubcollections = await getSubcollectionDocs(bookRef, ["reviews", "ratings"]);
    for (const { collectionId, doc } of bookSubcollections) {
      if (collectionId === "reviews") {
        addDocRef(reviewRefs, doc.ref, collectionCounts, "books.reviews");
      } else if (collectionId === "ratings") {
        addDocRef(ratingRefs, doc.ref, collectionCounts, "books.ratings");
      } else {
        addDocRef(otherSubcollectionRefs, doc.ref, collectionCounts, `books.${collectionId}`);
      }
    }
  }
  cascade.reviews = reviewRefs.size;
  cascade.ratings = ratingRefs.size;
  cascade.otherSubcollectionDocs = otherSubcollectionRefs.size;

  for (const attachmentId of attachmentIds) {
    const attachmentRef = db.collection("attachments").doc(attachmentId);
    const attachmentSnap = await attachmentRef.get();
    if (attachmentSnap.exists) {
      addDocRef(attachmentRefs, attachmentRef, collectionCounts, "attachments");
      collectAttachmentPointers(
        (attachmentSnap.data() || {}) as Record<string, unknown>,
        attachmentIds,
        exactStoragePaths
      );
    }

    const intentRef = db.collection("_attachment_upload_intents").doc(attachmentId);
    const intentSnap = await intentRef.get();
    if (intentSnap.exists) {
      addDocRef(attachmentIntentRefs, intentRef, collectionCounts, "_attachment_upload_intents");
      addStoragePath(exactStoragePaths, (intentSnap.data() || {}).storagePath);
    }
  }
  cascade.attachments = attachmentRefs.size;
  cascade.attachmentUploadIntents = attachmentIntentRefs.size;

  const authorIds = bookData ? readCanonicalAuthorIds(bookData) : [];
  for (const authorId of authorIds) {
    const authorRef = db.collection("authors").doc(authorId);
    const authorSnap = await authorRef.get();
    if (authorSnap.exists) {
      addDocRef(authorRefs, authorRef, collectionCounts, "authors");
    }
  }
  cascade.authorRefs = authorRefs.size;

  const bookStatsRef = db.collection("book_stats").doc(bookId);
  const bookStatsSnap = await bookStatsRef.get();
  if (bookStatsSnap.exists) {
    plan.bookStatsRef = bookStatsRef;
    incrementCount(collectionCounts, "book_stats");
    cascade.bookStats = 1;
  }

  const directReaderRefs = [
    db.collection("reader_manifests").doc(bookId),
    db.collection("reader_location_map").doc(bookId),
    db.collection("reader_search_index").doc(bookId),
    db.collection("reader_highlight_anchors").doc(bookId),
  ];
  const directReaderSnaps = await Promise.all(directReaderRefs.map((ref) => ref.get()));
  for (let index = 0; index < directReaderRefs.length; index += 1) {
    if (!directReaderSnaps[index].exists) continue;
    addDocRef(
      readerArtifactRefs,
      directReaderRefs[index],
      collectionCounts,
      directReaderRefs[index].path.split("/")[0]
    );
  }

  const manifestRef = db.collection("reader_manifests").doc(bookId);
  const manifestSnap = await manifestRef.get();
  if (manifestSnap.exists) {
    const manifestData = (manifestSnap.data() || {}) as Record<string, unknown>;
    const nestedDocPaths = [
      readOptionalString((manifestData.locationMap as Record<string, unknown> | undefined)?.docPath, "docPath", 512),
      readOptionalString((manifestData.searchIndex as Record<string, unknown> | undefined)?.docPath, "docPath", 512),
      readOptionalString(
        (manifestData.highlightAnchors as Record<string, unknown> | undefined)?.docPath,
        "docPath",
        512
      ),
    ].filter((entry): entry is string => Boolean(entry));
    for (const path of nestedDocPaths) {
      const ref = docRefFromPath(path);
      const snap = await ref.get();
      if (snap.exists) {
        addDocRef(readerArtifactRefs, ref, collectionCounts, ref.path.split("/")[0]);
      }
    }
  }
  cascade.readerArtifacts = readerArtifactRefs.size;

  const coverRefs = [db.collection("cover_jobs").doc(bookId), db.collection("coverJobs").doc(bookId)];
  const coverSnaps = await Promise.all(coverRefs.map((ref) => ref.get()));
  for (let index = 0; index < coverRefs.length; index += 1) {
    if (!coverSnaps[index].exists) continue;
    addDocRef(coverJobRefs, coverRefs[index], collectionCounts, coverRefs[index].path.split("/")[0]);
  }
  cascade.coverJobs = coverJobRefs.size;

  storagePrefixes.add(`books/${bookId}/covers/`);
  storagePrefixes.add(`books/${bookId}/original/`);
  storagePrefixes.add(`ebooks/${bookId}/`);
  const exactAttachmentPaths = Array.from(exactStoragePaths).filter(
    (path) =>
      !path.startsWith(`books/${bookId}/covers/`) &&
      !path.startsWith(`books/${bookId}/original/`) &&
      !path.startsWith(`ebooks/${bookId}/`)
  );
  plan.deleteGraph.editionIds = editionIds.sort();
  plan.deleteGraph.attachmentIds = Array.from(attachmentIds).sort();
  plan.deleteGraph.storagePrefixes = Array.from(storagePrefixes).sort();
  plan.deleteGraph.storagePaths = exactAttachmentPaths.sort();

  const [coverStorageFiles, originalStorageFiles, ebookStorageFiles] = await Promise.all([
    countStoragePrefix(`books/${bookId}/covers/`),
    countStoragePrefix(`books/${bookId}/original/`),
    countStoragePrefix(`ebooks/${bookId}/`),
  ]);
  storageCounts.coverStorageFiles = coverStorageFiles;
  storageCounts.originalStorageFiles = originalStorageFiles;
  storageCounts.ebookStorageFiles = ebookStorageFiles;
  storageCounts.attachmentStorageFiles = exactAttachmentPaths.length;
  cascade.coverStorageFiles = coverStorageFiles;
  cascade.originalStorageFiles = originalStorageFiles;
  cascade.ebookStorageFiles = ebookStorageFiles;
  cascade.attachmentStorageFiles = exactAttachmentPaths.length;
  plan.deleteGraph.touchedCollections = Object.keys(collectionCounts).sort();

  return plan;
}

async function executeDeleteExecutionPlan(plan: DeleteExecutionPlan): Promise<void> {
  const bookId = plan.resolution.resolvedBookId;
  if (!bookId) {
    return;
  }

  for (const shelfRef of plan.shelfRefs.values()) {
    const shelfSnap = await shelfRef.get();
    if (!shelfSnap.exists) continue;
    const shelfData = (shelfSnap.data() || {}) as Record<string, unknown>;
    const orderedBookIds = Array.isArray(shelfData.orderedBookIds)
      ? shelfData.orderedBookIds.filter((entry) => entry !== bookId)
      : undefined;
    await shelfRef.set(
      {
        ...(orderedBookIds ? { orderedBookIds } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  for (const quoteRef of plan.quoteBookRefs.values()) {
    await quoteRef.set(
      {
        bookId: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  for (const quoteRef of plan.quoteSourceRefs.values()) {
    await quoteRef.set(
      {
        sourceBookId: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  for (const authorRef of plan.authorRefs.values()) {
    const authorSnap = await authorRef.get();
    if (!authorSnap.exists) continue;
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
  }

  const deleteRefs = [
    ...plan.reviewRefs.values(),
    ...plan.ratingRefs.values(),
    ...plan.otherSubcollectionRefs.values(),
    ...plan.readerArtifactRefs.values(),
    ...plan.userReviewRefs.values(),
    ...plan.readingProgressRefs.values(),
    ...plan.libraryRefs.values(),
    ...plan.attachmentIntentRefs.values(),
    ...plan.attachmentRefs.values(),
    ...plan.identityRefs.values(),
    ...plan.ingestionRefs.values(),
    ...(plan.bookStatsRef ? [plan.bookStatsRef] : []),
    ...plan.coverJobRefs.values(),
    ...plan.editionRefs.values(),
    ...(plan.bookRef && plan.bookSnap?.exists ? [plan.bookRef] : []),
  ];

  for (const ref of deleteRefs) {
    await ref.delete();
  }

  await Promise.all([
    deleteStoragePrefix(`books/${bookId}/covers/`),
    deleteStoragePrefix(`books/${bookId}/original/`),
    deleteStoragePrefix(`ebooks/${bookId}/`),
    deleteStoragePaths(plan.deleteGraph.storagePaths),
  ]);
}

async function deleteCanonicalBookCascade(
  inputId: string,
  options?: DeleteCanonicalBookCascadeOptions
): Promise<AdminDeleteCanonicalBookResponse> {
  const plan = await buildDeleteExecutionPlan(inputId);
  const resolvedBookId = plan.resolution.resolvedBookId || readRequiredString(inputId, "bookId", 180);
  const shouldDelete = options?.dryRun !== true && Boolean(plan.resolution.resolvedBookId);

  if (shouldDelete) {
    await executeDeleteExecutionPlan(plan);
  }

  const result = {
    bookId: resolvedBookId,
    deleted: shouldDelete,
    dryRun: options?.dryRun === true,
    resolved: Boolean(plan.resolution.resolvedBookId),
    inputType: plan.resolution.inputType,
    collectionCounts: plan.collectionCounts,
    storageCounts: plan.storageCounts,
    deleteGraph: plan.deleteGraph,
    cascade: plan.cascade,
  };

  if (options?.audit) {
    await writeAdminDestructiveAudit({
      operation: options.audit.operation,
      action: options.audit.action,
      actorUid: options.audit.actorUid,
      resourceType: "book",
      resourceId: resolvedBookId,
      payload: {
        requestedInputId: options.audit.requestedInputId,
        dryRun: result.dryRun,
        deleted: result.deleted,
        resolved: result.resolved,
        inputType: result.inputType,
        collectionCounts: result.collectionCounts,
        storageCounts: result.storageCounts,
        deleteGraph: result.deleteGraph,
        cascade: result.cascade,
      },
    });
  }

  return result;
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
  titleAliases: string[];
  isbn10?: string;
  isbn13?: string;
} {
  const title = readRequiredString(data.title, "title", 300);
  const author = readRequiredString(data.author, "author", 240);
  const language = normalizeLanguage(readOptionalString(data.language, "language", 16));
  const description = readOptionalString(data.description, "description", 5000);
  const coverUrl = readOptionalUrl(data.coverUrl, "coverUrl", 500);
  const titleAliases = readStringArray(data.titleAliases, 24);
  const { isbn10, isbn13 } = parseOptionalIsbn(data.isbn);

  return {
    title,
    author,
    titleAliases,
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
  const authorId = parseInput(adminAuthorIdSchema, request.data?.authorId);
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
  const validatedData = parseInput(adminAuthorCreateSchema, request.data);
  const input = buildAuthorInput(validatedData);

  const canonicalName = input.canonicalName || "Unknown";
  const canonicalKey = buildCanonicalAuthorKey({
    name: canonicalName,
    birthYear: input.birthDate?.substring(0, 4),
  });

  const existingSnap = await db
    .collection("author_identity")
    .doc(canonicalKey)
    .get();

  if (existingSnap.exists) {
    const existingData = existingSnap.data() as Record<string, unknown>;
    const existingAuthorId = typeof existingData.authorId === "string" 
      ? existingData.authorId 
      : "unknown";
    logger.warn("[ADMIN_AUTHOR][DUPLICATE_CREATE_ATTEMPT]", {
      actorUid: caller.uid,
      canonicalKey,
      existingAuthorId,
    });
    throw new HttpsError(
      "already-exists",
      `Author with canonical key "${canonicalKey}" already exists (ID: ${existingAuthorId}).`
    );
  }

  const result = await db.runTransaction((tx) =>
    upsertAdminAuthorInTransaction({
      tx,
      actorUid: caller.uid,
      input,
    })
  );

  const snap = await db.collection("authors").doc(result.authorId).get();
  const now = admin.firestore.Timestamp.now();
  
  await db.collection("admin_audit_log").add({
    action: "author_create",
    resourceType: "author",
    resourceId: result.authorId,
    actorUid: caller.uid,
    canonicalKey: canonicalKey,
    canonicalName: input.canonicalName,
    status: result.status,
    timestamp: now,
    source: "admin_api",
  });

  logger.info("[ADMIN_AUDIT][AUTHOR_CREATED]", {
    actorUid: caller.uid,
    authorId: result.authorId,
    canonicalKey,
    status: result.status,
  });

  return {
    author: mapAdminAuthor(snap.data() as DocumentData, snap.id),
    status: result.status,
  };
});

export const adminAuthorUpdate = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const validatedData = parseInput(adminAuthorUpdateSchema, request.data);

  const authorId = parseInput(adminAuthorIdSchema, validatedData.authorId);

  const authorSnap = await db.collection("authors").doc(authorId).get();
  if (!authorSnap.exists) {
    throw new HttpsError("not-found", `Author with ID "${authorId}" not found.`);
  }

  const input = {
    ...buildAuthorInput(validatedData),
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
  const now = admin.firestore.Timestamp.now();
  
  await db.collection("admin_audit_log").add({
    action: "author_update",
    resourceType: "author",
    resourceId: result.authorId,
    actorUid: caller.uid,
    canonicalKey: buildCanonicalAuthorKey({
      name: input.canonicalName,
      birthYear: input.birthDate?.substring(0, 4),
    }),
    canonicalName: input.canonicalName,
    status: result.status,
    timestamp: now,
    source: "admin_api",
  });

  logger.info("[ADMIN_AUDIT][AUTHOR_UPDATED]", {
    actorUid: caller.uid,
    authorId: result.authorId,
    status: result.status,
  });

  return {
    author: mapAdminAuthor(snap.data() as DocumentData, snap.id),
    status: result.status,
  };
});

export const adminAuthorArchive = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const authorId = parseInput(adminAuthorIdSchema, request.data?.authorId);
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
  const now = admin.firestore.Timestamp.now();

  await db.collection("admin_audit_log").add({
    action: "author_archive",
    resourceType: "author",
    resourceId: authorId,
    actorUid: caller.uid,
    status: "archived",
    timestamp: now,
    source: "admin_api",
  });

  logger.info("[ADMIN_AUDIT][AUTHOR_ARCHIVED]", {
    actorUid: caller.uid,
    authorId,
  });

  return {
    author: mapAdminAuthor(archivedSnap.data() as DocumentData, archivedSnap.id),
    archived: true,
  };
});

export const adminCreateCanonicalBook = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const validatedData = parseInput(adminCreateCanonicalBookSchema, request.data);
  const input = buildCanonicalBookInput(validatedData);
  const language = input.language || "en";
  const isArabic = language.startsWith("ar");

  const canonicalKey = buildCanonicalKey({
    title: input.title,
    author: input.author,
  });

  // Pre-write conflict detection
  const conflictDetection = await detectCanonicalConflicts({
    title: input.title,
    author: input.author,
    similarityThreshold: 0.9,
    maxCandidates: 5,
  });

  if (conflictDetection.hasExactMatch) {
    const existingBookId = conflictDetection.exactMatchBookId;
    logger.warn("[ADMIN_BOOK][DUPLICATE_CREATE_ATTEMPT]", {
      actorUid: caller.uid,
      canonicalKey,
      existingBookId,
      conflictType: "exact",
    });
    throw new HttpsError(
      "already-exists",
      `Canonical book with key "${canonicalKey}" already exists (ID: ${existingBookId}).`,
      {
        conflictType: "exact",
        existingBookId,
        canonicalKey,
      }
    );
  }

  if (conflictDetection.hasSimilarConflicts) {
    logger.warn("[ADMIN_BOOK][SIMILAR_CONFLICT_DETECTED]", {
      actorUid: caller.uid,
      canonicalKey,
      title: input.title,
      author: input.author,
      conflictCount: conflictDetection.conflictCandidates.length,
      topCandidate: conflictDetection.conflictCandidates[0],
    });
    throw new HttpsError(
      "failed-precondition",
      `Similar canonical books already exist. Please review the conflicts before proceeding.`,
      {
        conflictType: "similar",
        canonicalKey,
        conflictCandidates: conflictDetection.conflictCandidates,
      }
    );
  }

  const authorNameNormalized = normalizeCanonicalPart(input.author);
  const authorKeySnaps = await db
    .collection("author_identity")
    .where("identityType", "==", "canonical")
    .limit(100)
    .get();

  const matchingAuthorId = authorKeySnaps.docs
    .map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const keyRoot = extractCanonicalAuthorKeyRoot(doc.id);
      return { keyRoot, authorId: data.authorId };
    })
    .find(
      (entry) =>
        typeof entry.authorId === "string" &&
        entry.keyRoot === authorNameNormalized
    )?.authorId;

  if (!matchingAuthorId) {
    logger.warn("[ADMIN_BOOK][AUTHOR_NOT_FOUND]", {
      actorUid: caller.uid,
      authorName: input.author,
      authorNameNormalized,
    });
    throw new HttpsError(
      "failed-precondition",
      `No canonical author found for "${input.author}". Please create the author first.`
    );
  }

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
      ...(input.titleAliases.length > 0 ? { titleAliases: input.titleAliases } : {}),
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

  const now = admin.firestore.Timestamp.now();

  await db.collection("admin_audit_log").add({
    action: "book_create",
    resourceType: "book",
    resourceId: result.bookId,
    actorUid: caller.uid,
    canonicalKey: canonicalKey,
    title: input.title,
    author: input.author,
    status: result.status,
    timestamp: now,
    source: "admin_api",
  });

  logger.info("[ADMIN_AUDIT][BOOK_CREATED]", {
    actorUid: caller.uid,
    bookId: result.bookId,
    canonicalKey,
    status: result.status,
  });

  return {
    book: mapAdminCanonicalBook(bookSnap.data() as DocumentData, bookSnap.id),
    status: result.status,
  };
});

export const adminMergeCanonicalBooks = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const validatedData = parseInput(adminMergeCanonicalBooksSchema, request.data);
  const sourceBookId = validatedData.sourceBookId;
  const targetBookId = validatedData.targetBookId;

  assertAdminDestructiveAuthority({
    operation: "adminMergeCanonicalBooks",
    actorUid: caller.uid,
    resourceId: `${sourceBookId}->${targetBookId}`,
  });

  if (sourceBookId === targetBookId) {
    throw new HttpsError(
      "invalid-argument",
      "Source and target books must be different."
    );
  }

  // Fetch both books
  const [sourceSnap, targetSnap] = await Promise.all([
    db.collection("books").doc(sourceBookId).get(),
    db.collection("books").doc(targetBookId).get(),
  ]);

  if (!sourceSnap.exists) {
    throw new HttpsError("not-found", `Source book "${sourceBookId}" not found.`);
  }
  if (!targetSnap.exists) {
    throw new HttpsError("not-found", `Target book "${targetBookId}" not found.`);
  }

  const sourceData = sourceSnap.data() as Record<string, unknown>;
  const targetData = targetSnap.data() as Record<string, unknown>;

  logger.info("[ADMIN_BOOK][MERGE_START]", {
    actorUid: caller.uid,
    sourceBookId,
    targetBookId,
    sourceTitle: sourceData.title || sourceData.titleEn,
    targetTitle: targetData.title || targetData.titleEn,
  });

  // Execute merge in a transaction to ensure atomicity
  const mergeResult = await db.runTransaction(async (tx) => {
    const referenceCounts = {
      editionsFromSource: 0,
      quotesFromSource: 0,
      quotesAsSource: 0,
      shelvesUpdated: 0,
    };

    // Find all editions linked to source book
    const editionSnaps = await Promise.all([
      tx.get(db.collection("editions").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("editions").where("workId", "==", sourceBookId)),
      tx.get(db.collection("editions").where("canonicalBookId", "==", sourceBookId)),
    ]);

    for (const snap of editionSnaps) {
      for (const doc of snap.docs) {
        const editionData = doc.data() as Record<string, unknown>;
        const updateData: Record<string, unknown> = {};

        if (editionData.bookId === sourceBookId) updateData.bookId = targetBookId;
        if (editionData.workId === sourceBookId) updateData.workId = targetBookId;
        if (editionData.canonicalBookId === sourceBookId) {
          updateData.canonicalBookId = targetBookId;
        }
        updateData.updatedAt = FieldValue.serverTimestamp();

        assertAllowedDestructivePatch(
          updateData,
          ADMIN_MERGE_EDITION_PATCH_FIELDS,
          "adminMergeCanonicalBooks.edition"
        );
        tx.set(doc.ref, updateData, { merge: true });
        referenceCounts.editionsFromSource += 1;
      }
    }

    // Find all quotes linked to source book
    const quoteSnaps = await Promise.all([
      tx.get(db.collection("quotes").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("quotes").where("sourceBookId", "==", sourceBookId)),
    ]);

    for (const doc of quoteSnaps[0].docs) {
      const quotePatch = {
        bookId: targetBookId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      assertAllowedDestructivePatch(
        quotePatch,
        ADMIN_MERGE_QUOTE_PATCH_FIELDS,
        "adminMergeCanonicalBooks.quote"
      );
      tx.set(
        doc.ref,
        quotePatch,
        { merge: true }
      );
      referenceCounts.quotesFromSource += 1;
    }

    for (const doc of quoteSnaps[1].docs) {
      const quotePatch = {
        sourceBookId: targetBookId,
        updatedAt: FieldValue.serverTimestamp(),
      };
      assertAllowedDestructivePatch(
        quotePatch,
        ADMIN_MERGE_QUOTE_PATCH_FIELDS,
        "adminMergeCanonicalBooks.quoteSource"
      );
      tx.set(
        doc.ref,
        quotePatch,
        { merge: true }
      );
      referenceCounts.quotesAsSource += 1;
    }

    // Find all shelves with source book
    const userLibrarySnap = await tx.get(
      db.collection("user_library_books").where("bookId", "==", sourceBookId)
    );

    for (const doc of userLibrarySnap.docs) {
      const libraryData = doc.data() as Record<string, unknown>;
      const shelfIds = Array.isArray(libraryData.shelfIds) ? libraryData.shelfIds : [];

      for (const shelfId of shelfIds) {
        const normalizedShelfId = typeof shelfId === "string" ? shelfId.trim() : "";
        if (!normalizedShelfId) continue;

        const shelfRef = db.collection("shelves").doc(normalizedShelfId);
        const shelfSnap = await tx.get(shelfRef);
        if (!shelfSnap.exists) continue;

        const shelfData = shelfSnap.data() as Record<string, unknown>;
        const orderedBookIds = Array.isArray(shelfData.orderedBookIds)
          ? shelfData.orderedBookIds.map((id) =>
              id === sourceBookId ? targetBookId : id
            )
          : [];
        const shelfPatch = {
          orderedBookIds,
          updatedAt: FieldValue.serverTimestamp(),
        };
        assertAllowedDestructivePatch(
          shelfPatch,
          ADMIN_MERGE_SHELF_PATCH_FIELDS,
          "adminMergeCanonicalBooks.shelfProjection"
        );

        tx.set(
          shelfRef,
          shelfPatch,
          { merge: true }
        );
        referenceCounts.shelvesUpdated += 1;
      }
    }

    // Delete all source book references
    const sourceRefSnaps = await Promise.all([
      tx.get(db.collection("book_identity").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("book_ingestions").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("reading_progress").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("user_library_books").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("user_reviews").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("reader_highlights").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("reader_bookmarks").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("reader_events").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("reader_audit").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("reader_sync_idempotency").where("bookId", "==", sourceBookId)),
      tx.get(db.collection("attachments").where("bookId", "==", sourceBookId)),
    ]);

    for (const snap of sourceRefSnaps) {
      for (const doc of snap.docs) {
        tx.delete(doc.ref);
      }
    }

    // Delete the source book document itself
    tx.delete(sourceSnap.ref);

    return referenceCounts;
  });

  await writeAdminDestructiveAudit({
    operation: "adminMergeCanonicalBooks",
    action: "book_merge",
    resourceType: "book",
    resourceId: targetBookId,
    actorUid: caller.uid,
    payload: {
      sourceBookId,
      targetBookId,
      sourceTitle: sourceData.title || sourceData.titleEn,
      targetTitle: targetData.title || targetData.titleEn,
      protectedIdentityOwner: "materializeBookAuthority",
      mergeStats: mergeResult,
    },
  });

  logger.info("[ADMIN_AUDIT][BOOK_MERGED]", {
    actorUid: caller.uid,
    sourceBookId,
    targetBookId,
    mergeStats: mergeResult,
  });

  const mergedTargetSnap = await db.collection("books").doc(targetBookId).get();

  return {
    sourceBookId,
    targetBookId,
    merged: true,
    mergeStats: mergeResult,
    targetBook: mergedTargetSnap.exists
      ? mapAdminCanonicalBook(mergedTargetSnap.data() as DocumentData, targetBookId)
      : null,
  };
});

export const adminDeleteCanonicalBook = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as AdminDeleteCanonicalBookInput;
  const bookId = readRequiredString(data.bookId, "bookId", 180);
  const dryRun = data.dryRun === true;
  assertAdminDestructiveAuthority({
    operation: "adminDeleteCanonicalBook",
    actorUid: caller.uid,
    resourceId: bookId,
  });
  if (!dryRun && typeof data.confirmation === "string" && data.confirmation.trim().length > 0) {
    const preview = await buildDeleteExecutionPlan(bookId);
    if (!preview.resolution.resolvedBookId) {
      return {
        bookId,
        deleted: false,
        dryRun: false,
        resolved: false,
        inputType: preview.resolution.inputType,
        collectionCounts: preview.collectionCounts,
        storageCounts: preview.storageCounts,
        deleteGraph: preview.deleteGraph,
        cascade: preview.cascade,
      };
    }
    if (data.confirmation.trim() !== preview.resolution.resolvedBookId) {
      throw new HttpsError(
        "failed-precondition",
        `confirmation must equal the resolved canonical work id ${preview.resolution.resolvedBookId}.`
      );
    }
  }
  return deleteCanonicalBookCascade(bookId, {
    dryRun,
    audit: {
      operation: "adminDeleteCanonicalBook",
      action: dryRun ? "book_delete_dry_run" : "book_delete",
      actorUid: caller.uid,
      requestedInputId: bookId,
    },
  });
});

export const adminDeleteCanonicalSeedList = onCall({ cors: true }, async (request) => {
  const caller = assertRoleFromClaims(request.auth, "superadmin");
  const data = (request.data ?? {}) as AdminDeleteCanonicalSeedListInput;
  const rows = parseBulkSeedRows(data.rows);
  const results: AdminDeleteCanonicalSeedListRow[] = [];
  assertAdminDestructiveAuthority({
    operation: "adminDeleteCanonicalSeedList",
    actorUid: caller.uid,
    resourceId: "seed-list",
  });

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

      const deleted = await deleteCanonicalBookCascade(bookId, {
        audit: {
          operation: "adminDeleteCanonicalSeedList",
          action: "book_delete_seed_list",
          actorUid: caller.uid,
          requestedInputId: bookId,
        },
      });
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
  const caller = assertRoleFromClaims(request.auth, "superadmin");

  const confirmation = readRequiredString(
    (request.data as AdminDeleteAllBooksInput | null | undefined)?.confirmation,
    "confirmation",
    64
  );
  if (confirmation !== "DELETE ALL BOOKS") {
    throw new HttpsError("invalid-argument", 'confirmation must equal "DELETE ALL BOOKS".');
  }
  assertAdminDestructiveAuthority({
    operation: "adminDeleteAllBooks",
    actorUid: caller.uid,
    resourceId: "books",
  });

  const booksSnap = await db.collection("books").get();
  let deletedCount = 0;
  const cascade = emptyDeleteCascadeCounts();

  for (const doc of booksSnap.docs) {
    const result = await deleteCanonicalBookCascade(doc.id);
    if (!result.deleted) continue;
    deletedCount += 1;
    cascade.books += result.cascade.books;
    cascade.editions += result.cascade.editions;
    cascade.attachments += result.cascade.attachments;
    cascade.attachmentUploadIntents += result.cascade.attachmentUploadIntents;
    cascade.bookIdentity += result.cascade.bookIdentity;
    cascade.bookIngestions += result.cascade.bookIngestions;
    cascade.coverJobs += result.cascade.coverJobs;
    cascade.readingProgress += result.cascade.readingProgress;
    cascade.userLibraryBooks += result.cascade.userLibraryBooks;
    cascade.userReviews += result.cascade.userReviews;
    cascade.bookStats += result.cascade.bookStats;
    cascade.shelfRefs += result.cascade.shelfRefs;
    cascade.quoteLinks += result.cascade.quoteLinks;
    cascade.quoteSourceLinks += result.cascade.quoteSourceLinks;
    cascade.authorRefs += result.cascade.authorRefs;
    cascade.reviews += result.cascade.reviews;
    cascade.ratings += result.cascade.ratings;
    cascade.readerArtifacts += result.cascade.readerArtifacts;
    cascade.searchProjectionDocs += result.cascade.searchProjectionDocs;
    cascade.coverStorageFiles += result.cascade.coverStorageFiles;
    cascade.originalStorageFiles += result.cascade.originalStorageFiles;
    cascade.ebookStorageFiles += result.cascade.ebookStorageFiles;
    cascade.attachmentStorageFiles += result.cascade.attachmentStorageFiles;
    cascade.otherSubcollectionDocs += result.cascade.otherSubcollectionDocs;
  }

  await writeAdminDestructiveAudit({
    operation: "adminDeleteAllBooks",
    action: "book_delete_all",
    actorUid: caller.uid,
    resourceType: "book_collection",
    resourceId: "books",
    payload: {
      deletedCount,
      cascade,
    },
  });

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

      let providerPhase;
      try {
        providerPhase = await withTimeout(
          resolveSeedBatchProviderPhase({
            title: entry.title,
            author: entry.author,
          }),
          PROVIDER_PHASE_TIMEOUT_MS
        );
      } catch (error) {
        if (!isProviderPhaseTimeoutError(error)) {
          throw error;
        }

        const fallbackRawBook = buildSeedOnlyFallbackRawBook({
          title: entry.title,
          author: entry.author,
        });
        const fallbackAuthor =
          asNonEmptyString(fallbackRawBook.author) || entry.author;
        const normalizedFallbackRawBook = normalizeBatchCanonicalSeedPayload({
          rawBook: fallbackRawBook,
          requestedTitle: entry.title,
          requestedAuthor: fallbackAuthor,
        });

        const fallback = await materializeSeedOnlyCanonicalFallback({
          rawBook: normalizedFallbackRawBook,
          ingestionKey: `canonical_seed_timeout:${normalizeSearchText(entry.author)}::${normalizeSearchText(entry.title)}`,
        });

        results.push({
          row: entry.row,
          input: entry.input,
          title: entry.title,
          author: entry.author,
          status: "timeout_fallback",
          canonicalBookId: fallback.canonicalBookId,
          bookId: fallback.bookId,
          editionId: fallback.editionId || undefined,
          message: `Provider phase exceeded ${PROVIDER_PHASE_TIMEOUT_MS}ms; saved canonical seed fallback.`,
        });
        continue;
      }

      const { providerCandidate, providerSource, preparedRawBook, message } = providerPhase;

      if (!providerCandidate) {
        const canonicalReuse = await resolveExistingCanonicalByAuthorAndTitle({
          title: entry.title,
          author: entry.author,
        });
        if (canonicalReuse) {
          const existingSource = asNonEmptyString(canonicalReuse.data.source);
          results.push({
            row: entry.row,
            input: entry.input,
            title: entry.title,
            author: entry.author,
            status: "existing",
            canonicalBookId: canonicalReuse.bookId,
            bookId: canonicalReuse.bookId,
            editionId: asNonEmptyString(canonicalReuse.data.editionId) || undefined,
            ...(existingSource === "googleBooks" || existingSource === "openLibrary"
              ? { source: existingSource }
              : {}),
            message: `Reused canonical work ${canonicalReuse.bookId}; provider miss fell back to strict canonical authority reuse.`,
          });
          continue;
        }

        const fallbackRawBook = buildSeedOnlyFallbackRawBook({
          title: entry.title,
          author: entry.author,
        });
        const fallbackAuthor =
          asNonEmptyString(fallbackRawBook.author) || entry.author;
        const normalizedFallbackRawBook = normalizeBatchCanonicalSeedPayload({
          rawBook: fallbackRawBook,
          requestedTitle: entry.title,
          requestedAuthor: fallbackAuthor,
        });
        if (
          asNonEmptyString(normalizedFallbackRawBook.literaryForm) &&
          asNonEmptyString(normalizedFallbackRawBook.description)
        ) {
          const fallback = await materializeSeedOnlyCanonicalFallback({
            rawBook: normalizedFallbackRawBook,
            ingestionKey: `canonical_seed_provider_miss:${normalizeSearchText(entry.author)}::${normalizeSearchText(entry.title)}`,
          });

          results.push({
            row: entry.row,
            input: entry.input,
            title: entry.title,
            author: entry.author,
            status: mapBatchRowStatus(fallback.status),
            canonicalBookId: fallback.canonicalBookId,
            bookId: fallback.bookId,
            editionId: fallback.editionId || undefined,
            message: "Provider miss saved deterministic canonical seed fallback.",
          });
          continue;
        }

        results.push({
          row: entry.row,
          input: entry.input,
          title: entry.title,
          author: entry.author,
          status: "failed",
          message: message || "No provider candidate matched this row.",
        });
        continue;
      }

      if (!providerSource) {
        results.push({
          row: entry.row,
          input: entry.input,
          title: entry.title,
          author: entry.author,
          status: "failed",
          message: message || "Provider candidate source is unsupported.",
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

      if (!preparedRawBook) {
        results.push({
          row: entry.row,
          input: entry.input,
          title: entry.title,
          author: entry.author,
          status: "failed",
          message: message || "Provider candidate could not be normalized into canonical seed input.",
        });
        continue;
      }

      const finalSurvivor = await resolveFinalCanonicalSurvivorBeforeCreate({
        title: entry.title,
        author: entry.author,
        candidate: providerCandidate,
        rawBook: preparedRawBook,
      });
      if (finalSurvivor) {
        const existingSource = asNonEmptyString(finalSurvivor.data.source);
        results.push({
          row: entry.row,
          input: entry.input,
          title: entry.title,
          author: entry.author,
          status: "existing",
          canonicalBookId: finalSurvivor.bookId,
          bookId: finalSurvivor.bookId,
          editionId: asNonEmptyString(finalSurvivor.data.editionId) || undefined,
          ...(existingSource === "googleBooks" || existingSource === "openLibrary"
            ? { source: existingSource }
            : { source: providerSource }),
          providerExternalId: providerCandidate.externalId,
          message: `Reused canonical work ${finalSurvivor.bookId}; final survivor gate prevented duplicate canonical create.`,
        });
        continue;
      }

      const ingestion = await ingestBookServerSide({
        uid: request.auth?.uid || "admin",
        source: providerSource,
        providerExternalId: providerCandidate.externalId,
        rawBook: preparedRawBook,
        trustedDescriptionAuthoritySource:
          preparedRawBook.canonicalSeedDescriptionFallback === true ? "manualAdmin" : undefined,
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
