import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";
import { isPublicReadableBook } from "../catalog/catalogBookView";
import { canUserReadBook } from "../rights/bookRights";
import {
  isMatchMakerHomeDiscoveryEnabled,
  runHomeMatchMakerDiscovery,
} from "./matchmakerHomeIntegration";

const db = admin.firestore();

const GOVERNANCE_VERSION = "home_discovery_console_v1";
const TTL_SECONDS = 120;
const MAX_ROWS = 4;
const CONTINUE_LIMIT = 8;
const READ_NOW_LIMIT = 12;
const READ_NOW_FETCH_LIMIT = 36;
const DYNAMIC_LIMIT = 12;
const DYNAMIC_FETCH_LIMIT = 80;
const TOWN_LIMIT = 6;
const TOWN_FETCH_LIMIT = 32;
const READ_NOW_EDITORIAL_MAX = 2;
const DYNAMIC_EDITORIAL_MAX = 2;
const TOWN_EDITORIAL_MAX = 3;
const MAX_AUTHOR_REPEAT_AFTER_CONTINUE = 2;
const PROFILE_LOOKUP_LIMIT = 60;
const MAX_DIMENSION_REPEAT = 3;
const LOW_CONFIDENCE_REASON_LIMIT = 2;
const CONTINUITY_LOOKUP_LIMIT = 24;
const HOME_LATENCY_TARGET_MS = 900;
const HOME_FIRESTORE_READ_TARGET = 220;

type HomeRowType = "continueReading" | "readNow" | "dynamicDiscovery" | "fromTheTown";

type HomeBookItem = {
  kind: "book";
  bookId: string;
  title: string;
  author: string;
  coverUrl: string;
  source: "algorithmic" | "editorial";
  score: number;
  progress?: number;
  reason?: string;
};

type HomeTownItem = {
  kind: "townSignal";
  signalType: "post" | "quote" | "shelf" | "reflection" | "author" | "literaryMoment";
  signalId: string;
  postId?: string;
  title: string;
  subtitle: string;
  source: "algorithmic" | "editorial";
  score: number;
  reason?: string;
};

type HomeConsoleRow =
  | { type: "continueReading"; items: HomeBookItem[] }
  | { type: "readNow"; items: HomeBookItem[] }
  | { type: "dynamicDiscovery"; items: HomeBookItem[]; editorialCount: number }
  | { type: "fromTheTown"; items: HomeTownItem[]; editorialCount: number };

type HomeDiagnostics = {
  cacheHit: boolean;
  emptyRows: number;
  duplicateSuppressions: number;
  literaryObjectSuppressions: number;
  authorSuppressions: number;
  expiredEditorialFiltered: number;
  invalidEditorialFiltered: number;
  firestoreDocumentsRead: number;
  personalizationConfidence: number;
  recommendationDiversity: number;
  sourceBalance: Record<string, number>;
  explainabilityGenerated: number;
  explorationRatio: number;
  recommendationQualityScore: number;
  diversityHealthScore: number;
  explorationBalanceScore: number;
  recommendationFreshnessScore: number;
  literaryCalmScore: number;
  culturalCoherenceScore: number;
  feedContaminationRisk: number;
  recommendationAggressionScore: number;
  lowConfidenceExplanations: number;
  staleRecommendationCount: number;
  unreadableAttachmentSuppressions: number;
  editorialHardPins: number;
  editorialSoftBoosts: number;
  editorialOccupancyAttempts: number;
  continuityCoherenceScore: number;
  crossSystemDiversityScore: number;
  continuityDriftRisk: number;
  literaryIdentityStability: number;
  ecosystemCalmScore: number;
  continuitySources: Record<string, number>;
  recommendationFatigueRisk: number;
  diversityDegradationRisk: number;
  explorationFamiliarityDrift: number;
  feedContaminationTrendRisk: number;
  editorialOverreachRisk: number;
  runtimeAmplificationRisk: number;
  orchestrationVolatilityRisk: number;
  frontendAuthorityDriftRisk: number;
  preservationIntegrityScore: number;
  degraded: boolean;
  partialPayload: boolean;
  fallbackActivations: number;
  subsystemFailures: Record<string, number>;
};

type ReaderSignalProfile = {
  bookIds: Set<string>;
  authors: Map<string, number>;
  languages: Map<string, number>;
  forms: Map<string, number>;
  traditions: Map<string, number>;
  genres: Map<string, number>;
  quoteTerms: Set<string>;
  searchTerms: Set<string>;
  shelfTerms: Set<string>;
  writingTerms: Set<string>;
  culturalTerms: Set<string>;
  continuitySourceWeights: Map<string, number>;
  completedCount: number;
  activeCount: number;
};

type TownCandidate = HomeTownItem & {
  literaryKeys: string[];
};

type EditorialSlot = {
  rowType: "readNow" | "dynamicDiscovery" | "fromTheTown";
  entityType: "book" | "post";
  entityId: string;
  slotKind: "hard_pin" | "soft_boost";
  position: number;
};

function clampUnit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value > 1) return Math.max(0, Math.min(1, value / 100));
  return Math.max(0, Math.min(1, value));
}

function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Timestamp) return value.toMillis();
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return Number.isFinite(date.getTime()) ? date.getTime() : 0;
  }
  return 0;
}

function asString(value: unknown, maxLength = 240): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function asNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function statusRank(value: unknown): number {
  return value === "reading" ? 0 : value === "paused" ? 1 : 2;
}

function normalizeAuthorKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLiteraryTerms(value: string): string[] {
  const normalized = value.toLowerCase();
  const terms = [
    "book",
    "novel",
    "read",
    "reader",
    "reading",
    "quote",
    "author",
    "shelf",
    "poem",
    "poetry",
    "literary",
    "chapter",
    "مؤلف",
    "كتاب",
    "رواية",
    "قراءة",
    "اقتباس",
    "شعر",
    "رف",
  ];
  return terms.filter((term) => normalized.includes(term));
}

function extractContinuityTerms(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .trim();
  const generic = new Set([
    "book",
    "books",
    "read",
    "reading",
    "shelf",
    "shelves",
    "project",
    "draft",
    "write",
    "writing",
  ]);
  return normalized
    .split(/\s+/)
    .map((term) => term.slice(0, 40))
    .filter((term) => term.length >= 4 && !generic.has(term))
    .slice(0, 8);
}

function extractAttachmentLiteraryKeys(attachments: unknown[]): string[] {
  return attachments
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const record = entry as Record<string, unknown>;
      const type = asString(record.type, 40).toLowerCase();
      if (type !== "book" && type !== "quote" && type !== "shelf" && type !== "publication") {
        return "";
      }
      const id =
        asString(record.entityId, 180) ||
        asString(record.bookId, 180) ||
        asString(record.quoteId, 180) ||
        asString(record.shelfId, 180) ||
        asString(record.publicationId, 180);
      return id ? `${type}:${id}` : "";
    })
    .filter((key) => key.length > 0);
}

function increment(map: Map<string, number>, key: string, by = 1): void {
  const normalized = key.trim();
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + by);
}

function addTerms(target: Set<string>, value: string): void {
  extractLiteraryTerms(value).forEach((term) => target.add(term));
  extractContinuityTerms(value).forEach((term) => target.add(term));
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry, 80))
    .filter((entry) => entry.length > 0);
}

function bookDimensions(data: Record<string, unknown>): {
  author: string;
  language: string;
  form: string;
  tradition: string;
  genre: string;
} {
  return {
    author: normalizeAuthorKey(asString(data.authorEn) || asString(data.author) || asString(data.primaryAuthorName)),
    language: asString(data.language, 12).toLowerCase(),
    form: asString(data.form, 80) || asString(data.literaryForm, 80) || readStringArray(data.forms)[0] || "",
    tradition: asString(data.canonicalTradition, 120) || asString(data.tradition, 120) || readStringArray(data.traditions)[0] || "",
    genre: readStringArray(data.genresEn ?? data.genres)[0] || asString(data.genre, 80),
  };
}

function topKey(map: Map<string, number>): string {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function boundedScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function boundedNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function finiteScore(value: unknown): number {
  const numeric = boundedNumber(value, 0);
  return Number(Math.max(0, numeric).toFixed(6));
}

function neutralReaderSignalProfile(): ReaderSignalProfile {
  return {
    bookIds: new Set(),
    authors: new Map(),
    languages: new Map(),
    forms: new Map(),
    traditions: new Map(),
    genres: new Map(),
    quoteTerms: new Set(),
    searchTerms: new Set(),
    shelfTerms: new Set(),
    writingTerms: new Set(),
    culturalTerms: new Set(),
    continuitySourceWeights: new Map(),
    completedCount: 0,
    activeCount: 0,
  };
}

function recordSubsystemFailure(params: {
  uid: string;
  subsystem: string;
  diagnostics: HomeDiagnostics;
  error: unknown;
}): void {
  params.diagnostics.degraded = true;
  params.diagnostics.partialPayload = true;
  params.diagnostics.fallbackActivations += 1;
  params.diagnostics.subsystemFailures[params.subsystem] =
    (params.diagnostics.subsystemFailures[params.subsystem] ?? 0) + 1;
  logger.warn("[HOME][DISCOVERY_SUBSYSTEM_DEGRADED]", {
    uid: params.uid,
    subsystem: params.subsystem,
    error: params.error instanceof HttpsError ? params.error.code : String(params.error),
  });
}

async function recoverable<T>(params: {
  uid: string;
  subsystem: string;
  diagnostics: HomeDiagnostics;
  fallback: T;
  run: () => Promise<T>;
}): Promise<T> {
  try {
    const value = await params.run();
    return value ?? params.fallback;
  } catch (error) {
    recordSubsystemFailure({
      uid: params.uid,
      subsystem: params.subsystem,
      diagnostics: params.diagnostics,
      error,
    });
    return params.fallback;
  }
}

function sanitizeBookItems(items: HomeBookItem[], limit: number): HomeBookItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (!item || item.kind !== "book" || !item.bookId || !item.title) return false;
      if (seen.has(item.bookId)) return false;
      seen.add(item.bookId);
      item.score = finiteScore(item.score);
      if (item.progress !== undefined) item.progress = clampUnit(item.progress);
      if (item.reason !== undefined) item.reason = asString(item.reason, 160) || "A measured literary recommendation";
      return true;
    })
    .slice(0, limit);
}

function sanitizeTownItems(items: HomeTownItem[], limit: number): HomeTownItem[] {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (!item || item.kind !== "townSignal" || !item.signalId || !item.title) return false;
      if (seen.has(item.signalId)) return false;
      seen.add(item.signalId);
      item.score = finiteScore(item.score);
      if (item.reason !== undefined) item.reason = asString(item.reason, 160) || "A reflective literary conversation";
      return true;
    })
    .slice(0, limit);
}

function hasReadableAttachmentProjection(data: Record<string, unknown>): boolean {
  const readerAuthority =
    data.readerAuthority && typeof data.readerAuthority === "object" && !Array.isArray(data.readerAuthority)
      ? data.readerAuthority as Record<string, unknown>
      : null;
  return (
    readerAuthority?.hasReadableAttachment === true &&
    asString(readerAuthority.attachmentId, 160).length > 0
  );
}

function resolveReadableAttachmentId(data: Record<string, unknown>): string {
  const readerAuthority =
    data.readerAuthority && typeof data.readerAuthority === "object" && !Array.isArray(data.readerAuthority)
      ? data.readerAuthority as Record<string, unknown>
      : null;
  return asString(data.ebookAttachmentId, 160) || asString(readerAuthority?.attachmentId, 160);
}

async function canReaderOpenProjectedAttachment(
  bookId: string,
  data: Record<string, unknown>,
  diagnostics: HomeDiagnostics
): Promise<boolean> {
  const attachmentId = resolveReadableAttachmentId(data);
  if (!attachmentId) {
    diagnostics.unreadableAttachmentSuppressions += 1;
    return false;
  }

  try {
    const snap = await db.collection("attachments").doc(attachmentId).get();
    diagnostics.firestoreDocumentsRead += snap.exists ? 1 : 0;
    if (!snap.exists) {
      diagnostics.unreadableAttachmentSuppressions += 1;
      logger.warn("[HOME][READ_NOW_ATTACHMENT_MISSING]", { bookId, attachmentId });
      return false;
    }

    const attachment = (snap.data() ?? {}) as Record<string, unknown>;
    const visibility = asString(attachment.visibility, 32).toLowerCase();
    const storagePath = asString(attachment.storagePath, 2048);
    if (!storagePath || visibility === "private" || visibility === "restricted") {
      diagnostics.unreadableAttachmentSuppressions += 1;
      logger.warn("[HOME][READ_NOW_ATTACHMENT_NOT_READER_AUTHORIZED]", {
        bookId,
        attachmentId,
        visibility: visibility || null,
        hasStoragePath: storagePath.length > 0,
      });
      return false;
    }

    return true;
  } catch (error) {
    diagnostics.unreadableAttachmentSuppressions += 1;
    logger.warn("[HOME][READ_NOW_ATTACHMENT_AUTH_CHECK_FAILED]", {
      bookId,
      attachmentId,
      error: String(error),
    });
    return false;
  }
}

async function readEvergreenBookFallback(
  uid: string,
  diagnostics: HomeDiagnostics,
  limit: number
): Promise<HomeBookItem[]> {
  try {
    const snap = await db
      .collection("books")
      .where("readerAuthority.hasReadableAttachment", "==", true)
      .orderBy("rating", "desc")
      .limit(Math.max(4, Math.min(24, limit * 3)))
      .get();
    diagnostics.firestoreDocumentsRead += snap.size;

    const items: HomeBookItem[] = [];
    for (const docSnap of snap.docs) {
      if (items.length >= limit) break;
      const data = (docSnap.data() ?? {}) as Record<string, unknown>;
      if (!isPublicReadableBook(data) || !canUserReadBook(data, uid)) continue;
      if (!hasReadableAttachmentProjection(data)) continue;
      if (!(await canReaderOpenProjectedAttachment(docSnap.id, data, diagnostics))) continue;
      const item = mapBookItem(docSnap.id, data, 0.2 - items.length / 100);
      if (!item) continue;
      item.reason = "A quiet place to begin";
      items.push(item);
    }

    if (items.length > 0) diagnostics.fallbackActivations += 1;
    return sanitizeBookItems(items, limit);
  } catch (error) {
    recordSubsystemFailure({
      uid,
      subsystem: "evergreen_book_fallback",
      diagnostics,
      error,
    });
    return [];
  }
}

function literarySignalFallback(): HomeTownItem[] {
  return [
    {
      kind: "townSignal",
      signalType: "reflection",
      signalId: "starter_reflection_slow_reading",
      title: "A quiet note from the reading life",
      subtitle: "Begin with a page, not a feed.",
      source: "algorithmic",
      score: 0.2,
      reason: "A reflective starter signal",
    },
    {
      kind: "townSignal",
      signalType: "quote",
      signalId: "starter_quote_commonplace",
      title: "Commonplace shelves gather meaning over time",
      subtitle: "Save passages that ask to be reread.",
      source: "algorithmic",
      score: 0.18,
      reason: "A seed for literary attention",
    },
    {
      kind: "townSignal",
      signalType: "literaryMoment",
      signalId: "starter_moment_return",
      title: "Return to an author you have not finished with",
      subtitle: "Some books become clearer on the second approach.",
      source: "algorithmic",
      score: 0.16,
      reason: "A slow literary prompt",
    },
  ];
}

function sanitizeDiagnostics(diagnostics: HomeDiagnostics): HomeDiagnostics {
  for (const [key, value] of Object.entries(diagnostics)) {
    if (typeof value === "number") {
      (diagnostics as Record<string, unknown>)[key] = boundedNumber(value, 0);
    }
  }
  for (const [key, value] of Object.entries(diagnostics.sourceBalance)) {
    diagnostics.sourceBalance[key] = boundedNumber(value, 0);
  }
  for (const [key, value] of Object.entries(diagnostics.continuitySources)) {
    diagnostics.continuitySources[key] = boundedNumber(value, 0);
  }
  for (const [key, value] of Object.entries(diagnostics.subsystemFailures)) {
    diagnostics.subsystemFailures[key] = Math.max(0, Math.trunc(boundedNumber(value, 0)));
  }
  return diagnostics;
}

function logHomeSchemaRejection(params: {
  uid: string;
  row: HomeRowType;
  index: number;
  reason: string;
  item?: unknown;
}): void {
  const record = params.item && typeof params.item === "object"
    ? (params.item as Record<string, unknown>)
    : {};
  logger.error("[HOME][SCHEMA_REJECTION]", {
    uid: params.uid,
    row: params.row,
    index: params.index,
    signalType: typeof record.signalType === "string" ? record.signalType : null,
    signalId: typeof record.signalId === "string" ? record.signalId : null,
    bookId: typeof record.bookId === "string" ? record.bookId : null,
    reason: params.reason,
    malformedObject: {
      kind: typeof record.kind === "string" ? record.kind : null,
      signalType: typeof record.signalType === "string" ? record.signalType : null,
      signalId: typeof record.signalId === "string" ? record.signalId : null,
      postId: typeof record.postId === "string" ? record.postId : null,
      bookId: typeof record.bookId === "string" ? record.bookId : null,
      source: typeof record.source === "string" ? record.source : null,
      scoreType: typeof record.score,
      hasTitle: typeof record.title === "string" && record.title.trim().length > 0,
    },
  });
}

function finalizeHomeRows(candidateRows: HomeConsoleRow[], uid: string, diagnostics: HomeDiagnostics): HomeConsoleRow[] {
  const output: HomeConsoleRow[] = [];
  for (const row of candidateRows) {
    if (!row.items || row.items.length === 0) {
      diagnostics.emptyRows += 1;
      logger.info("[HOME][ROW_OMITTED_EMPTY]", { uid, row: row.type });
      continue;
    }

    if (row.type === "continueReading" || row.type === "readNow") {
      const items = sanitizeBookItems(row.items, row.type === "continueReading" ? CONTINUE_LIMIT : READ_NOW_LIMIT);
      if (items.length === 0) {
        diagnostics.emptyRows += 1;
        continue;
      }
      output.push({ type: row.type, items });
      continue;
    }

    if (row.type === "dynamicDiscovery") {
      const items = sanitizeBookItems(row.items, DYNAMIC_LIMIT);
      if (items.length === 0) {
        diagnostics.emptyRows += 1;
        continue;
      }
      output.push({
        type: "dynamicDiscovery",
        items,
        editorialCount: Math.min(DYNAMIC_EDITORIAL_MAX, items.filter((item) => item.source === "editorial").length),
      });
      continue;
    }

    row.items.forEach((item, index) => {
      if (!item || item.kind !== "townSignal") {
        logHomeSchemaRejection({ uid, row: row.type, index, reason: "invalid town signal kind", item });
        return;
      }
      if (!item.signalType) {
        logHomeSchemaRejection({ uid, row: row.type, index, reason: "missing signalType", item });
      }
      if (!item.signalId) {
        logHomeSchemaRejection({ uid, row: row.type, index, reason: "missing signalId", item });
      }
    });
    const items = sanitizeTownItems(row.items, TOWN_LIMIT);
    if (items.length === 0) {
      diagnostics.emptyRows += 1;
      continue;
    }
    output.push({
      type: "fromTheTown",
      items,
      editorialCount: Math.min(TOWN_EDITORIAL_MAX, items.filter((item) => item.source === "editorial").length),
    });
  }
  return output.slice(0, MAX_ROWS);
}

function reasonConfidence(reason: string): number {
  if (!reason) return 0;
  if (
    reason === "A measured step beyond your recent reading" ||
    reason === "A strong catalog signal with literary breadth"
  ) {
    return 0.45;
  }
  if (reason === "Because your saved passages point this way") return 0.65;
  return 0.85;
}

async function readReaderSignalProfile(uid: string, diagnostics: HomeDiagnostics): Promise<ReaderSignalProfile> {
  const profile: ReaderSignalProfile = {
    bookIds: new Set(),
    authors: new Map(),
    languages: new Map(),
    forms: new Map(),
    traditions: new Map(),
    genres: new Map(),
    quoteTerms: new Set(),
    searchTerms: new Set(),
    shelfTerms: new Set(),
    writingTerms: new Set(),
    culturalTerms: new Set(),
    continuitySourceWeights: new Map(),
    completedCount: 0,
    activeCount: 0,
  };

  const [progressSnap, quoteSnap, shelfSnap, searchClickSnap, projectSnap] = await Promise.all([
    db.collection("reading_progress")
      .where("uid", "==", uid)
      .orderBy("lastActiveAt", "desc")
      .limit(PROFILE_LOOKUP_LIMIT)
      .get(),
    db.collectionGroup("quotes")
      .where("ownerId", "==", uid)
      .limit(30)
      .get()
      .catch(() => null),
    db.collection("shelves")
      .where("ownerId", "==", uid)
      .limit(CONTINUITY_LOOKUP_LIMIT)
      .get()
      .catch(() => null),
    db.collection("search_clicks")
      .where("uid", "==", uid)
      .limit(CONTINUITY_LOOKUP_LIMIT)
      .get()
      .catch(() => null),
    db.collection("users")
      .doc(uid)
      .collection("projects")
      .limit(CONTINUITY_LOOKUP_LIMIT)
      .get()
      .catch(() => null),
  ]);
  diagnostics.firestoreDocumentsRead +=
    progressSnap.size +
    (quoteSnap?.size ?? 0) +
    (shelfSnap?.size ?? 0) +
    (searchClickSnap?.size ?? 0) +
    (projectSnap?.size ?? 0);

  progressSnap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const bookId = asString(data.bookId, 180);
    if (bookId) profile.bookIds.add(bookId);
    const state = asString(data.status_state, 32);
    if (state === "completed") profile.completedCount += 1;
    if (state === "reading" || state === "paused") profile.activeCount += 1;
    increment(profile.continuitySourceWeights, "reading", state === "completed" ? 1.15 : 0.85);
  });

  if (profile.bookIds.size > 0) {
    const ids = Array.from(profile.bookIds).slice(0, 30);
    const snaps = await db.getAll(...ids.map((id) => db.collection("books").doc(id)));
    diagnostics.firestoreDocumentsRead += snaps.length;
    snaps.forEach((snap) => {
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const dims = bookDimensions(data);
      increment(profile.authors, dims.author);
      increment(profile.languages, dims.language);
      increment(profile.forms, dims.form);
      increment(profile.traditions, dims.tradition);
      increment(profile.genres, dims.genre);
    });
  }

  quoteSnap?.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const text = `${asString(data.textEn, 500)} ${asString(data.textAr, 500)} ${asString(data.canonicalText, 500)}`;
    addTerms(profile.quoteTerms, text);
    addTerms(profile.culturalTerms, asString(data.authorName, 160) || asString(data.author, 160));
    readStringArray(data.themes).forEach((theme) => profile.quoteTerms.add(theme.toLowerCase()));
    increment(profile.continuitySourceWeights, "quotes", 1.05);
  });

  shelfSnap?.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const title = `${asString(data.titleEn, 160)} ${asString(data.titleAr, 160)} ${asString(data.description, 240)}`;
    addTerms(profile.shelfTerms, title);
    const bookCount = Math.max(0, asNumber(data.bookCount));
    const intentionalWeight = data.isSystem === true ? 0.35 : bookCount >= 3 ? 1.15 : 0.65;
    increment(profile.continuitySourceWeights, "shelves", intentionalWeight);
  });

  searchClickSnap?.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    addTerms(profile.searchTerms, asString(data.normalizedQuery, 280));
    increment(profile.continuitySourceWeights, "search", 0.45);
  });

  projectSnap?.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const metadataOnly = [
      asString(data.titleEn, 160),
      asString(data.titleAr, 160),
      asString(data.typeEn, 80),
      asString(data.typeAr, 80),
      asString(data.status, 80),
    ].join(" ");
    addTerms(profile.writingTerms, metadataOnly);
    increment(profile.continuitySourceWeights, "writing", 0.8);
  });

  return profile;
}

function mapBookItem(
  bookId: string,
  data: Record<string, unknown>,
  score: number,
  progress?: number
): HomeBookItem | null {
  const title =
    asString(data.titleEn) ||
    asString(data.title) ||
    asString(data.canonicalTitle);
  const author =
    asString(data.authorEn) ||
    asString(data.author) ||
    asString(data.primaryAuthorName) ||
    "Unknown";
  if (!bookId || !title) return null;

  const cover = data.cover && typeof data.cover === "object"
    ? (data.cover as Record<string, unknown>)
    : {};

  return {
    kind: "book",
    bookId,
    title,
    author,
    coverUrl:
      asString(data.coverUrl, 2048) ||
      asString(cover.medium, 2048) ||
      asString(cover.large, 2048) ||
      asString(cover.original, 2048),
    source: "algorithmic",
    score: finiteScore(score),
    ...(progress !== undefined ? { progress } : {}),
  };
}

function explainBookRecommendation(params: {
  item: HomeBookItem;
  data: Record<string, unknown>;
  profile: ReaderSignalProfile;
  source: string;
  lowConfidenceUsed: number;
}): string {
  if (params.source === "editorial") return "Selected by BookTown editors";
  const dims = bookDimensions(params.data);
  const haystack = [
    params.item.title,
    params.item.author,
    dims.form,
    dims.tradition,
    dims.genre,
  ].join(" ").toLowerCase();
  const hasShelfContinuity = Array.from(params.profile.shelfTerms).some((term) => haystack.includes(term));
  const hasQuoteContinuity = Array.from(params.profile.quoteTerms).some((term) => haystack.includes(term));
  const hasWritingContinuity = Array.from(params.profile.writingTerms).some((term) => haystack.includes(term));
  const hasSearchContinuity = Array.from(params.profile.searchTerms).some((term) => haystack.includes(term));
  if (hasShelfContinuity) return "Your recent shelves point toward this tradition";
  if (hasQuoteContinuity) return "Echoes themes from passages you saved";
  if (hasWritingContinuity) return "Near the literary forms you have been shaping";
  if (hasSearchContinuity) return "A gentle continuation of recent literary searches";
  if (dims.tradition && params.profile.traditions.has(dims.tradition)) {
    return `Because you return to ${dims.tradition}`;
  }
  if (dims.form && params.profile.forms.has(dims.form)) {
    return `Because you read ${dims.form}`;
  }
  if (dims.language && params.profile.languages.has(dims.language)) {
    return `Because you read in ${dims.language.toUpperCase()}`;
  }
  if (dims.author && params.profile.authors.has(dims.author)) {
    return `Near an author you have been reading`;
  }
  if (params.profile.quoteTerms.size > 0) {
    return "Because your saved passages point this way";
  }
  if (params.lowConfidenceUsed >= LOW_CONFIDENCE_REASON_LIMIT) {
    return "A quieter path into something adjacent";
  }
  return params.source === "catalog"
    ? "A strong catalog signal with literary breadth"
    : "A measured step beyond your recent reading";
}

async function readContinueReading(uid: string, diagnostics: HomeDiagnostics): Promise<HomeBookItem[]> {
  const snap = await db
    .collection("reading_progress")
    .where("uid", "==", uid)
    .where("status_state", "in", ["reading", "paused"])
    .orderBy("lastActiveAt", "desc")
    .limit(CONTINUE_LIMIT)
    .get();
  diagnostics.firestoreDocumentsRead += snap.size;

  const rows = snap.docs
    .map((docSnap) => {
      const data = docSnap.data();
      const bookId = asString(data.bookId, 160);
      if (!bookId) return null;
      return {
        bookId,
        progress: clampUnit(data.progress),
        status: asString(data.status_state, 32),
        lastActiveAtMs: toMillis(data.lastActiveAt ?? data.updatedAt),
      };
    })
    .filter((row): row is { bookId: string; progress: number; status: string; lastActiveAtMs: number } => row !== null)
    .sort((left, right) => {
      const stateDelta = statusRank(left.status) - statusRank(right.status);
      if (stateDelta !== 0) return stateDelta;
      return right.lastActiveAtMs - left.lastActiveAtMs;
    });

  if (rows.length === 0) return [];

  const bookSnaps = await db.getAll(...rows.map((row) => db.collection("books").doc(row.bookId)));
  diagnostics.firestoreDocumentsRead += bookSnaps.length;
  const booksById = new Map(bookSnaps.map((snap) => [snap.id, snap.data() ?? {}]));

  return rows
    .map((row, index) =>
      mapBookItem(row.bookId, booksById.get(row.bookId) ?? {}, 1 - index / 100, row.progress)
    )
    .filter((item): item is HomeBookItem => item !== null);
}

async function readReadNow(uid: string, diagnostics: HomeDiagnostics): Promise<HomeBookItem[]> {
  const snap = await db
    .collection("books")
    .where("readerAuthority.hasReadableAttachment", "==", true)
    .orderBy("rating", "desc")
    .limit(READ_NOW_FETCH_LIMIT)
    .get();
  diagnostics.firestoreDocumentsRead += snap.size;

  const items: HomeBookItem[] = [];
  let rank = 0;
  for (const docSnap of snap.docs) {
    if (items.length >= READ_NOW_LIMIT) break;
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    if (!isPublicReadableBook(data) || !canUserReadBook(data, uid)) continue;
    if (!hasReadableAttachmentProjection(data)) continue;
    if (!(await canReaderOpenProjectedAttachment(docSnap.id, data, diagnostics))) continue;
    const item = mapBookItem(docSnap.id, data, 1 - rank / 100);
    if (!item) continue;
    items.push(item);
    rank += 1;
  }
  return items;
}

async function readDynamicDiscovery(
  profile: ReaderSignalProfile,
  diagnostics: HomeDiagnostics
): Promise<HomeBookItem[]> {
  const snap = await db
    .collection("books")
    .orderBy("rating", "desc")
    .limit(DYNAMIC_FETCH_LIMIT)
    .get();
  diagnostics.firestoreDocumentsRead += snap.size;

  const seen = new Set<string>();
  const items: HomeBookItem[] = [];
  const dimensionCounts = {
    author: new Map<string, number>(),
    language: new Map<string, number>(),
    form: new Map<string, number>(),
    tradition: new Map<string, number>(),
    genre: new Map<string, number>(),
  };
  let lowConfidenceUsed = 0;

  for (const docSnap of snap.docs) {
    if (seen.has(docSnap.id)) continue;
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    if (!isPublicReadableBook(data)) continue;
    if (profile.bookIds.has(docSnap.id)) continue;

    const dims = bookDimensions(data);
    const authorCount = dimensionCounts.author.get(dims.author) ?? 0;
    const formCount = dimensionCounts.form.get(dims.form) ?? 0;
    const traditionCount = dimensionCounts.tradition.get(dims.tradition) ?? 0;
    const genreCount = dimensionCounts.genre.get(dims.genre) ?? 0;
    if (
      (dims.author && authorCount >= 1) ||
      (dims.form && formCount >= MAX_DIMENSION_REPEAT) ||
      (dims.tradition && traditionCount >= MAX_DIMENSION_REPEAT) ||
      (dims.genre && genreCount >= MAX_DIMENSION_REPEAT)
    ) {
      diagnostics.authorSuppressions += dims.author && authorCount >= 1 ? 1 : 0;
      continue;
    }

    const rating = asNumber(data.rating);
    const reviews = asNumber(data.reviewsCount ?? data.ratingsCount);
    const catalogScore = Math.min(3, rating * 0.36) + Math.min(1.05, Math.log1p(Math.max(0, reviews)) * 0.14);
    const continuityScore =
      (dims.author && profile.authors.has(dims.author) ? 0.42 : 0) +
      (dims.language && profile.languages.has(dims.language) ? 0.38 : 0) +
      (dims.form && profile.forms.has(dims.form) ? 0.5 : 0) +
      (dims.tradition && profile.traditions.has(dims.tradition) ? 0.62 : 0) +
      (dims.genre && profile.genres.has(dims.genre) ? 0.25 : 0);
    const explorationScore =
      (dims.author && !profile.authors.has(dims.author) ? 0.35 : 0) +
      (dims.tradition && !profile.traditions.has(dims.tradition) ? 0.45 : 0) +
      (dims.form && !profile.forms.has(dims.form) ? 0.25 : 0) +
      (dims.language && !profile.languages.has(dims.language) ? 0.15 : 0);
    const continuityText = [
      asString(data.titleEn) || asString(data.title) || asString(data.canonicalTitle),
      asString(data.authorEn) || asString(data.author) || asString(data.primaryAuthorName),
      dims.form,
      dims.tradition,
      dims.genre,
    ].join(" ").toLowerCase();
    const sourceContinuityScore =
      (Array.from(profile.quoteTerms).some((term) => continuityText.includes(term)) ? 0.28 : 0) +
      (Array.from(profile.shelfTerms).some((term) => continuityText.includes(term)) ? 0.32 : 0) +
      (Array.from(profile.writingTerms).some((term) => continuityText.includes(term)) ? 0.22 : 0) +
      (Array.from(profile.searchTerms).some((term) => continuityText.includes(term)) ? 0.12 : 0);
    const languageAnchor = topKey(profile.languages);
    const languagePenalty = languageAnchor && dims.language && dims.language !== languageAnchor ? -0.05 : 0;
    const overCouplingPenalty = sourceContinuityScore > 0.55 ? 0.08 : 0;
    const score =
      catalogScore +
      Math.min(1.7, continuityScore) +
      Math.min(1.05, explorationScore) +
      Math.min(0.62, sourceContinuityScore) +
      languagePenalty -
      overCouplingPenalty;
    const item = mapBookItem(docSnap.id, data, finiteScore(score));
    if (!item) continue;
    item.reason = explainBookRecommendation({ item, data, profile, source: "catalog", lowConfidenceUsed });
    if (reasonConfidence(item.reason) < 0.6) {
      lowConfidenceUsed += 1;
      diagnostics.lowConfidenceExplanations += 1;
    }
    diagnostics.explainabilityGenerated += 1;
    diagnostics.sourceBalance.catalog = (diagnostics.sourceBalance.catalog ?? 0) + 1;
    seen.add(docSnap.id);
    increment(dimensionCounts.author, dims.author);
    increment(dimensionCounts.language, dims.language);
    increment(dimensionCounts.form, dims.form);
    increment(dimensionCounts.tradition, dims.tradition);
    increment(dimensionCounts.genre, dims.genre);
    items.push(item);
    if (items.length >= DYNAMIC_LIMIT) break;
  }
  return items.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.bookId.localeCompare(right.bookId);
  });
}

async function readFromTheTown(diagnostics: HomeDiagnostics): Promise<HomeTownItem[]> {
  const snap = await db
    .collection("posts")
    .where("status", "==", "published")
    .where("visibility", "==", "public")
    .orderBy("timestamps.createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc")
    .limit(TOWN_FETCH_LIMIT)
    .get();
  diagnostics.firestoreDocumentsRead += snap.size;

  const candidates: TownCandidate[] = [];
  const seen = new Set<string>();
  const seenLiteraryObjects = new Set<string>();

  for (const docSnap of snap.docs) {
    if (seen.has(docSnap.id)) continue;
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    if (data.isDeleted === true || data.moderation && typeof data.moderation === "object" && (data.moderation as Record<string, unknown>).autoHidden === true) {
      continue;
    }

    const content = data.content && typeof data.content === "object"
      ? (data.content as Record<string, unknown>)
      : {};
    const attachments = Array.isArray(content.attachments) ? content.attachments : [];
    const literaryKeys = extractAttachmentLiteraryKeys(attachments);
    const hasLiteraryAttachment = literaryKeys.length > 0;
    const text = asString(content.text, 180);
    const literaryTerms = extractLiteraryTerms(text);
    if (!hasLiteraryAttachment && literaryTerms.length === 0) continue;
    if (!hasLiteraryAttachment && text.length < 36) continue;
    if (literaryKeys.some((key) => seenLiteraryObjects.has(key))) {
      diagnostics.literaryObjectSuppressions += 1;
      continue;
    }

    const counters = data.counters && typeof data.counters === "object"
      ? (data.counters as Record<string, unknown>)
      : {};
    const commentsCount = asNumber(counters.comments);
    const bookmarksCount = asNumber(counters.bookmarks);
    const repostsCount = asNumber(counters.reposts);
    const likesCount = asNumber(counters.likes);
    const createdAtMs = toMillis(
      data.timestamps && typeof data.timestamps === "object"
        ? (data.timestamps as Record<string, unknown>).createdAt
        : null
    );
    const meaningfulInteractions = commentsCount * 3.1 + bookmarksCount * 2.2 + repostsCount * 0.7;
    const shallowInteractions = Math.max(0, likesCount - commentsCount - bookmarksCount);
    const baitPenalty = shallowInteractions > 0
      ? Math.min(1.1, Math.log1p(shallowInteractions) * (meaningfulInteractions > 0 ? 0.12 : 0.24))
      : 0;
    const ageDays = Math.max(0, (Date.now() - createdAtMs) / 86_400_000);
    const qualityBoost = (hasLiteraryAttachment ? 1.35 : 0) + Math.min(0.95, literaryTerms.length * 0.24);
    const discussionDepth = text.length >= 160 ? 0.7 : text.length >= 100 ? 0.45 : text.length >= 70 ? 0.22 : 0;
    const culturalWeight = literaryTerms.some((term) => ["poetry", "quote", "author", "شعر", "اقتباس"].includes(term)) ? 0.34 : 0;
    const resonance = Math.min(1.35, Math.log1p(Math.max(0, meaningfulInteractions)) * 0.28);
    const recencyBalance = 1 / (1 + ageDays / 28);
    const score = qualityBoost + discussionDepth + culturalWeight + resonance + recencyBalance - baitPenalty;

    candidates.push({
      kind: "townSignal",
      signalType: "post",
      signalId: docSnap.id,
      postId: docSnap.id,
      title: text || "Literary conversation",
      subtitle: asString(data.authorName, 120) || "From the Town",
      source: "algorithmic",
      score: finiteScore(score),
      reason: hasLiteraryAttachment
        ? "A literary object is drawing thoughtful attention"
        : "A reflective discussion from the town",
      literaryKeys,
    });
    diagnostics.explainabilityGenerated += 1;
    seen.add(docSnap.id);
    literaryKeys.forEach((key) => seenLiteraryObjects.add(key));
    if (candidates.length >= TOWN_LIMIT * 2) break;
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.signalId.localeCompare(right.signalId);
  });

  return candidates.slice(0, TOWN_LIMIT).map(({ literaryKeys, ...item }) => item);
}

function isActiveUnexpiredSlot(data: Record<string, unknown>, now: Timestamp): boolean {
  if (data.isActive !== true && asString(data.status, 32) !== "active") return false;
  const expiresAt = data.endAt instanceof Timestamp ? data.endAt : data.expiresAt;
  if (!(expiresAt instanceof Timestamp)) return false;
  return expiresAt.toMillis() > now.toMillis();
}

async function readActiveEditorialSlots(
  rowType: "readNow" | "dynamicDiscovery" | "fromTheTown",
  diagnostics: HomeDiagnostics
): Promise<EditorialSlot[]> {
  const max = rowType === "readNow" ? READ_NOW_EDITORIAL_MAX
    : rowType === "dynamicDiscovery" ? DYNAMIC_EDITORIAL_MAX
    : rowType === "fromTheTown" ? TOWN_EDITORIAL_MAX
      : 0;
  if (max === 0) return [];

  const now = Timestamp.now();
  const snap = await db
    .collection("home_editorial_slots")
    .where("rowType", "==", rowType)
    .orderBy("position", "asc")
    .limit(max * 4)
    .get();
  diagnostics.firestoreDocumentsRead += snap.size;

  const slots: EditorialSlot[] = [];
  for (const docSnap of snap.docs) {
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    if (!isActiveUnexpiredSlot(data, now)) {
      diagnostics.expiredEditorialFiltered += 1;
      continue;
    }
    const entityTypeRaw = asString(data.targetType, 32) || asString(data.entityType, 32);
    const entityType = entityTypeRaw === "book" || entityTypeRaw === "post" ? entityTypeRaw : null;
    const entityId = asString(data.targetId, 180) || asString(data.entityId, 180);
    const slotKindRaw = asString(data.mode, 32) || asString(data.slotKind, 32);
    const slotKind = slotKindRaw === "hard_pin" || slotKindRaw === "soft_boost" ? slotKindRaw : null;
    const position = Math.max(0, Math.trunc(asNumber(data.slot ?? data.position)));
    if (!entityType || !entityId || !slotKind) {
      diagnostics.invalidEditorialFiltered += 1;
      continue;
    }
    diagnostics.editorialOccupancyAttempts += 1;
    if (slotKind === "hard_pin") diagnostics.editorialHardPins += 1;
    if (slotKind === "soft_boost") diagnostics.editorialSoftBoosts += 1;
    slots.push({ rowType, entityType, entityId, slotKind, position });
    if (slots.length >= max) break;
  }
  return slots;
}

async function hydrateEditorialBooks(
  slots: EditorialSlot[],
  uid: string,
  diagnostics: HomeDiagnostics
): Promise<HomeBookItem[]> {
  const bookSlots = slots.filter((slot) => slot.entityType === "book");
  if (bookSlots.length === 0) return [];
  const snaps = await db.getAll(...bookSlots.map((slot) => db.collection("books").doc(slot.entityId)));
  diagnostics.firestoreDocumentsRead += snaps.length;
  const items: HomeBookItem[] = [];
  for (let index = 0; index < snaps.length; index += 1) {
    const snap = snaps[index];
    const slot = bookSlots[index];
    if (!snap?.exists || !slot) {
      diagnostics.invalidEditorialFiltered += 1;
      continue;
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    if (!isPublicReadableBook(data)) {
      diagnostics.invalidEditorialFiltered += 1;
      continue;
    }
    if (slot.rowType === "readNow") {
      if (!canUserReadBook(data, uid)) {
        diagnostics.invalidEditorialFiltered += 1;
        continue;
      }
      if (!hasReadableAttachmentProjection(data)) {
        diagnostics.invalidEditorialFiltered += 1;
        continue;
      }
      if (!(await canReaderOpenProjectedAttachment(snap.id, data, diagnostics))) {
        diagnostics.invalidEditorialFiltered += 1;
        continue;
      }
    }
    const item = mapBookItem(snap.id, data, 100 - index);
    if (item) items.push({ ...item, source: "editorial" as const, reason: "Selected by BookTown editors" });
  }
  return items;
}

async function hydrateEditorialTownSignals(
  slots: EditorialSlot[],
  diagnostics: HomeDiagnostics
): Promise<HomeTownItem[]> {
  const postSlots = slots.filter((slot) => slot.entityType === "post");
  if (postSlots.length === 0) return [];
  const snaps = await db.getAll(...postSlots.map((slot) => db.collection("posts").doc(slot.entityId)));
  diagnostics.firestoreDocumentsRead += snaps.length;
  return snaps
    .map((snap, index): HomeTownItem | null => {
      if (!snap.exists) {
        diagnostics.invalidEditorialFiltered += 1;
        return null;
      }
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      if (
        asString(data.status, 32) !== "published" ||
        asString(data.visibility, 32) !== "public" ||
        data.isDeleted === true
      ) {
        diagnostics.invalidEditorialFiltered += 1;
        return null;
      }
      const content = data.content && typeof data.content === "object"
        ? (data.content as Record<string, unknown>)
        : {};
      const text = asString(content.text, 180);
      if (!text) {
        diagnostics.invalidEditorialFiltered += 1;
        return null;
      }
      return {
        kind: "townSignal" as const,
        signalType: "post" as const,
        signalId: snap.id,
        postId: snap.id,
        title: text,
        subtitle: asString(data.authorName, 120) || "From the Town",
        source: "editorial" as const,
        score: 100 - index,
        reason: "Selected by BookTown editors",
      };
    })
    .filter((item): item is HomeTownItem => item !== null);
}

function mergeBookEditorial(
  organic: HomeBookItem[],
  editorial: HomeBookItem[],
  maxEditorial: number,
  limit: number,
  diagnostics: HomeDiagnostics
): { items: HomeBookItem[]; editorialCount: number } {
  const maxMinority = Math.max(0, Math.min(maxEditorial, Math.floor((limit - 1) / 2)));
  const allowedEditorial = editorial.slice(0, maxMinority);
  const byBook = new Set<string>();
  const merged: HomeBookItem[] = [];

  for (const item of allowedEditorial) {
    if (byBook.has(item.bookId)) {
      diagnostics.duplicateSuppressions += 1;
      continue;
    }
    byBook.add(item.bookId);
    merged.push(item);
  }
  for (const item of organic) {
    if (byBook.has(item.bookId)) {
      diagnostics.duplicateSuppressions += 1;
      continue;
    }
    byBook.add(item.bookId);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return {
    items: merged.slice(0, limit),
    editorialCount: merged.filter((item) => item.source === "editorial").length,
  };
}

function mergeTownEditorial(
  organic: HomeTownItem[],
  editorial: HomeTownItem[],
  diagnostics: HomeDiagnostics
): { items: HomeTownItem[]; editorialCount: number } {
  const maxMinority = Math.max(0, Math.min(TOWN_EDITORIAL_MAX, Math.floor((TOWN_LIMIT - 1) / 2)));
  const bySignal = new Set<string>();
  const merged: HomeTownItem[] = [];
  for (const item of editorial.slice(0, maxMinority)) {
    if (bySignal.has(item.signalId)) {
      diagnostics.duplicateSuppressions += 1;
      continue;
    }
    bySignal.add(item.signalId);
    merged.push(item);
  }
  for (const item of organic) {
    if (bySignal.has(item.signalId)) {
      diagnostics.duplicateSuppressions += 1;
      continue;
    }
    bySignal.add(item.signalId);
    merged.push(item);
    if (merged.length >= TOWN_LIMIT) break;
  }
  return {
    items: merged.slice(0, TOWN_LIMIT),
    editorialCount: merged.filter((item) => item.source === "editorial").length,
  };
}

function suppressCrossRowBookDuplicates(params: {
  continueReading: HomeBookItem[];
  readNow: HomeBookItem[];
  dynamicDiscovery: HomeBookItem[];
  diagnostics: HomeDiagnostics;
}): { readNow: HomeBookItem[]; dynamicDiscovery: HomeBookItem[] } {
  const protectedBooks = new Set(params.continueReading.map((item) => item.bookId));
  const authorCounts = new Map<string, number>();

  const filterRow = (items: HomeBookItem[], suppressExistingBooks: boolean): HomeBookItem[] => {
    const output: HomeBookItem[] = [];
    for (const item of items) {
      if (item.source !== "editorial" && suppressExistingBooks && protectedBooks.has(item.bookId)) {
        params.diagnostics.duplicateSuppressions += 1;
        continue;
      }
      const authorKey = normalizeAuthorKey(item.author);
      const currentAuthorCount = authorCounts.get(authorKey) ?? 0;
      if (item.source !== "editorial" && authorKey && currentAuthorCount >= MAX_AUTHOR_REPEAT_AFTER_CONTINUE) {
        params.diagnostics.authorSuppressions += 1;
        continue;
      }
      output.push(item);
      protectedBooks.add(item.bookId);
      if (authorKey) authorCounts.set(authorKey, currentAuthorCount + 1);
    }
    return output;
  };

  return {
    readNow: filterRow(params.readNow, true),
    dynamicDiscovery: filterRow(params.dynamicDiscovery, true),
  };
}

function computeDiversity(bookRows: HomeBookItem[][]): number {
  const all = bookRows.flat();
  if (all.length === 0) return 0;
  const uniqueAuthors = new Set(all.map((item) => normalizeAuthorKey(item.author)).filter(Boolean));
  const uniqueBooks = new Set(all.map((item) => item.bookId));
  return Number((((uniqueAuthors.size / all.length) + (uniqueBooks.size / all.length)) / 2).toFixed(4));
}

function computeRecommendationFreshness(params: {
  profile: ReaderSignalProfile;
  dynamicDiscovery: HomeBookItem[];
}): { score: number; staleCount: number } {
  if (params.dynamicDiscovery.length === 0) return { score: 0, staleCount: 0 };
  const staleCount = params.dynamicDiscovery.filter((item) => params.profile.bookIds.has(item.bookId)).length;
  return {
    score: boundedScore(1 - staleCount / params.dynamicDiscovery.length),
    staleCount,
  };
}

function computeHomeQualityScores(params: {
  diagnostics: HomeDiagnostics;
  profile: ReaderSignalProfile;
  continueReading: HomeBookItem[];
  readNow: HomeBookItem[];
  dynamicDiscovery: HomeBookItem[];
  fromTheTown: HomeTownItem[];
  editorialCount: number;
  rowCount: number;
}): Pick<
  HomeDiagnostics,
  | "recommendationQualityScore"
  | "diversityHealthScore"
  | "explorationBalanceScore"
  | "literaryCalmScore"
  | "culturalCoherenceScore"
  | "feedContaminationRisk"
  | "recommendationAggressionScore"
  | "continuityCoherenceScore"
  | "crossSystemDiversityScore"
  | "continuityDriftRisk"
  | "literaryIdentityStability"
  | "ecosystemCalmScore"
  | "recommendationFatigueRisk"
  | "diversityDegradationRisk"
  | "explorationFamiliarityDrift"
  | "feedContaminationTrendRisk"
  | "editorialOverreachRisk"
  | "runtimeAmplificationRisk"
  | "orchestrationVolatilityRisk"
  | "frontendAuthorityDriftRisk"
  | "preservationIntegrityScore"
> {
  const bookCount = params.continueReading.length + params.readNow.length + params.dynamicDiscovery.length;
  const editorialRatio = bookCount + params.fromTheTown.length > 0
    ? params.editorialCount / (bookCount + params.fromTheTown.length)
    : 0;
  const lowConfidenceRatio = params.diagnostics.explainabilityGenerated > 0
    ? params.diagnostics.lowConfidenceExplanations / params.diagnostics.explainabilityGenerated
    : 0;
  const suppressionLoad = params.diagnostics.duplicateSuppressions + params.diagnostics.authorSuppressions;
  const suppressionRatio = bookCount > 0 ? suppressionLoad / bookCount : 0;
  const townRatio = params.rowCount > 0 ? params.fromTheTown.length / Math.max(1, bookCount + params.fromTheTown.length) : 0;
  const explorationBalance = 1 - Math.abs(params.diagnostics.explorationRatio - 0.45) / 0.45;
  const recommendationAggression = boundedScore(
    editorialRatio * 0.5 +
    Math.max(0, params.diagnostics.explorationRatio - 0.7) * 0.35 +
    Math.min(1, suppressionRatio) * 0.15
  );
  const feedRisk = boundedScore(
    townRatio * 0.35 +
    Math.max(0, params.fromTheTown.length - TOWN_LIMIT) * 0.1 +
    recommendationAggression * 0.35 +
    editorialRatio * 0.2
  );
  const literaryCalm = boundedScore(1 - recommendationAggression * 0.65 - feedRisk * 0.35);
  const activeContinuitySources = Array.from(params.profile.continuitySourceWeights.entries())
    .filter(([, weight]) => weight > 0);
  const sourceCount = activeContinuitySources.length;
  const totalSourceWeight = activeContinuitySources.reduce((sum, [, weight]) => sum + weight, 0);
  const dominantSourceRatio = totalSourceWeight > 0
    ? Math.max(...activeContinuitySources.map(([, weight]) => weight)) / totalSourceWeight
    : 0;
  const crossSystemDiversity = boundedScore(sourceCount / 5);
  const continuityCoherence = boundedScore(
    (params.continueReading.length > 0 ? 0.26 : 0) +
    (params.profile.quoteTerms.size > 0 ? 0.18 : 0) +
    (params.profile.shelfTerms.size > 0 ? 0.2 : 0) +
    (params.profile.writingTerms.size > 0 ? 0.14 : 0) +
    (params.profile.searchTerms.size > 0 ? 0.08 : 0) +
    Math.min(0.14, params.diagnostics.recommendationDiversity * 0.14)
  );
  const continuityDriftRisk = boundedScore(
    Math.max(0, dominantSourceRatio - 0.55) * 0.55 +
    Math.max(0, params.diagnostics.explorationRatio - 0.75) * 0.25 +
    feedRisk * 0.2
  );
  const literaryIdentityStability = boundedScore(
    continuityCoherence * 0.45 +
    crossSystemDiversity * 0.25 +
    literaryCalm * 0.3
  );
  const ecosystemCalm = boundedScore(
    1 -
    continuityDriftRisk * 0.45 -
    recommendationAggression * 0.35 -
    feedRisk * 0.2
  );
  const recommendationFatigueRisk = boundedScore(
    params.diagnostics.staleRecommendationCount / Math.max(1, params.dynamicDiscovery.length) * 0.45 +
    params.diagnostics.lowConfidenceExplanations / Math.max(1, params.diagnostics.explainabilityGenerated) * 0.3 +
    Math.max(0, 0.55 - params.diagnostics.recommendationDiversity) * 0.25
  );
  const diversityDegradationRisk = boundedScore(1 - params.diagnostics.recommendationDiversity);
  const explorationFamiliarityDrift = boundedScore(Math.abs(params.diagnostics.explorationRatio - 0.45) / 0.45);
  const editorialOverreachRisk = boundedScore(
    editorialRatio * 0.55 +
    params.diagnostics.editorialHardPins / Math.max(1, params.diagnostics.editorialOccupancyAttempts) * 0.3 +
    params.diagnostics.invalidEditorialFiltered / Math.max(1, params.diagnostics.editorialOccupancyAttempts) * 0.15
  );
  const runtimeAmplificationRisk = boundedScore(params.diagnostics.firestoreDocumentsRead / HOME_FIRESTORE_READ_TARGET);
  const orchestrationVolatilityRisk = boundedScore(
    continuityDriftRisk * 0.4 +
    explorationFamiliarityDrift * 0.3 +
    recommendationAggression * 0.3
  );
  const frontendAuthorityDriftRisk = params.rowCount <= MAX_ROWS ? 0 : 1;
  const feedContaminationTrendRisk = boundedScore(
    feedRisk * 0.5 +
    recommendationAggression * 0.3 +
    Math.max(0, townRatio - 0.35) * 0.2
  );
  const preservationIntegrity = boundedScore(
    1 -
    feedContaminationTrendRisk * 0.24 -
    editorialOverreachRisk * 0.18 -
    orchestrationVolatilityRisk * 0.2 -
    runtimeAmplificationRisk * 0.13 -
    recommendationFatigueRisk * 0.15 -
    frontendAuthorityDriftRisk * 0.1
  );

  return {
    recommendationQualityScore: boundedScore(
      params.diagnostics.recommendationDiversity * 0.35 +
      params.diagnostics.recommendationFreshnessScore * 0.25 +
      boundedScore(explorationBalance) * 0.25 +
      (1 - lowConfidenceRatio) * 0.15
    ),
    diversityHealthScore: boundedScore(params.diagnostics.recommendationDiversity),
    explorationBalanceScore: boundedScore(explorationBalance),
    literaryCalmScore: literaryCalm,
    culturalCoherenceScore: boundedScore(
      (params.dynamicDiscovery.length > 0 ? 0.45 : 0) +
      (params.fromTheTown.length > 0 ? 0.25 : 0) +
      Math.min(0.3, params.diagnostics.recommendationDiversity * 0.3)
    ),
    feedContaminationRisk: feedRisk,
    recommendationAggressionScore: recommendationAggression,
    continuityCoherenceScore: continuityCoherence,
    crossSystemDiversityScore: crossSystemDiversity,
    continuityDriftRisk,
    literaryIdentityStability,
    ecosystemCalmScore: ecosystemCalm,
    recommendationFatigueRisk,
    diversityDegradationRisk,
    explorationFamiliarityDrift,
    feedContaminationTrendRisk,
    editorialOverreachRisk,
    runtimeAmplificationRisk,
    orchestrationVolatilityRisk,
    frontendAuthorityDriftRisk,
    preservationIntegrityScore: preservationIntegrity,
  };
}

export const getHomeDiscoveryConsole = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid || null;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Auth required.");
  }

  const startedAtMs = Date.now();
  const diagnostics: HomeDiagnostics = {
    cacheHit: false,
    emptyRows: 0,
    duplicateSuppressions: 0,
    literaryObjectSuppressions: 0,
    authorSuppressions: 0,
    expiredEditorialFiltered: 0,
    invalidEditorialFiltered: 0,
    firestoreDocumentsRead: 0,
    personalizationConfidence: 0,
    recommendationDiversity: 0,
    sourceBalance: {},
    explainabilityGenerated: 0,
    explorationRatio: 0,
    recommendationQualityScore: 0,
    diversityHealthScore: 0,
    explorationBalanceScore: 0,
    recommendationFreshnessScore: 0,
    literaryCalmScore: 0,
    culturalCoherenceScore: 0,
    feedContaminationRisk: 0,
    recommendationAggressionScore: 0,
    lowConfidenceExplanations: 0,
    staleRecommendationCount: 0,
    unreadableAttachmentSuppressions: 0,
    editorialHardPins: 0,
    editorialSoftBoosts: 0,
    editorialOccupancyAttempts: 0,
    continuityCoherenceScore: 0,
    crossSystemDiversityScore: 0,
    continuityDriftRisk: 0,
    literaryIdentityStability: 0,
    ecosystemCalmScore: 0,
    continuitySources: {},
    recommendationFatigueRisk: 0,
    diversityDegradationRisk: 0,
    explorationFamiliarityDrift: 0,
    feedContaminationTrendRisk: 0,
    editorialOverreachRisk: 0,
    runtimeAmplificationRisk: 0,
    orchestrationVolatilityRisk: 0,
    frontendAuthorityDriftRisk: 0,
    preservationIntegrityScore: 0,
    degraded: false,
    partialPayload: false,
    fallbackActivations: 0,
    subsystemFailures: {},
  };

  try {
    const profile = await recoverable({
      uid,
      subsystem: "continuity_profile",
      diagnostics,
      fallback: neutralReaderSignalProfile(),
      run: () => readReaderSignalProfile(uid, diagnostics),
    });
    const [
      continueReading,
      readNow,
      dynamicDiscovery,
      fromTheTown,
      readNowEditorialSlots,
      dynamicEditorialSlots,
      townEditorialSlots,
    ] = await Promise.all([
      recoverable({
        uid,
        subsystem: "continue_reading",
        diagnostics,
        fallback: [] as HomeBookItem[],
        run: () => readContinueReading(uid, diagnostics),
      }),
      recoverable({
        uid,
        subsystem: "read_now",
        diagnostics,
        fallback: [] as HomeBookItem[],
        run: () => readReadNow(uid, diagnostics),
      }),
      recoverable({
        uid,
        subsystem: "dynamic_discovery",
        diagnostics,
        fallback: [] as HomeBookItem[],
        run: () => readDynamicDiscovery(profile, diagnostics),
      }),
      recoverable({
        uid,
        subsystem: "from_the_town",
        diagnostics,
        fallback: [] as HomeTownItem[],
        run: () => readFromTheTown(diagnostics),
      }),
      recoverable({
        uid,
        subsystem: "read_now_editorial_slots",
        diagnostics,
        fallback: [] as EditorialSlot[],
        run: () => readActiveEditorialSlots("readNow", diagnostics),
      }),
      recoverable({
        uid,
        subsystem: "dynamic_editorial_slots",
        diagnostics,
        fallback: [] as EditorialSlot[],
        run: () => readActiveEditorialSlots("dynamicDiscovery", diagnostics),
      }),
      recoverable({
        uid,
        subsystem: "town_editorial_slots",
        diagnostics,
        fallback: [] as EditorialSlot[],
        run: () => readActiveEditorialSlots("fromTheTown", diagnostics),
      }),
    ]);

    const [readNowEditorialItems, dynamicEditorialItems, townEditorialItems] = await Promise.all([
      recoverable({
        uid,
        subsystem: "read_now_editorial_hydration",
        diagnostics,
        fallback: [] as HomeBookItem[],
        run: () => hydrateEditorialBooks(readNowEditorialSlots, uid, diagnostics),
      }),
      recoverable({
        uid,
        subsystem: "dynamic_editorial_hydration",
        diagnostics,
        fallback: [] as HomeBookItem[],
        run: () => hydrateEditorialBooks(dynamicEditorialSlots, uid, diagnostics),
      }),
      recoverable({
        uid,
        subsystem: "town_editorial_hydration",
        diagnostics,
        fallback: [] as HomeTownItem[],
        run: () => hydrateEditorialTownSignals(townEditorialSlots, diagnostics),
      }),
    ]);
    const matchMakerFeatureFlagState = isMatchMakerHomeDiscoveryEnabled();
    const matchMakerDynamicDiscovery = runHomeMatchMakerDiscovery({
      uid,
      candidateItems: dynamicDiscovery,
      generatedAt: new Date(startedAtMs).toISOString(),
      featureFlagEnabled: matchMakerFeatureFlagState,
    });
    if (matchMakerDynamicDiscovery.usedMatchMaker) {
      diagnostics.sourceBalance.matchmaker =
        (diagnostics.sourceBalance.matchmaker ?? 0) +
        matchMakerDynamicDiscovery.items.length;
    } else if (
      matchMakerFeatureFlagState &&
      matchMakerDynamicDiscovery.fallbackReason !== "feature_flag_off"
    ) {
      diagnostics.fallbackActivations += 1;
      diagnostics.subsystemFailures.matchmaker_home =
        (diagnostics.subsystemFailures.matchmaker_home ?? 0) + 1;
    }

    const safeContinueReading = sanitizeBookItems(continueReading, CONTINUE_LIMIT);
    const safeReadNow = sanitizeBookItems(readNow, READ_NOW_LIMIT);
    const safeDynamicDiscovery = sanitizeBookItems(matchMakerDynamicDiscovery.items, DYNAMIC_LIMIT);
    const safeFromTheTown = sanitizeTownItems(fromTheTown, TOWN_LIMIT);

    const readNowMerged = mergeBookEditorial(
      safeReadNow,
      sanitizeBookItems(readNowEditorialItems, READ_NOW_EDITORIAL_MAX),
      READ_NOW_EDITORIAL_MAX,
      READ_NOW_LIMIT,
      diagnostics
    );
    const dynamicMerged = mergeBookEditorial(
      safeDynamicDiscovery,
      sanitizeBookItems(dynamicEditorialItems, DYNAMIC_EDITORIAL_MAX),
      DYNAMIC_EDITORIAL_MAX,
      DYNAMIC_LIMIT,
      diagnostics
    );
    const townMerged = mergeTownEditorial(
      safeFromTheTown,
      sanitizeTownItems(townEditorialItems, TOWN_EDITORIAL_MAX),
      diagnostics
    );
    const suppressed = suppressCrossRowBookDuplicates({
      continueReading: safeContinueReading,
      readNow: readNowMerged.items,
      dynamicDiscovery: dynamicMerged.items,
      diagnostics,
    });
    if (suppressed.readNow.length === 0) {
      suppressed.readNow = await readEvergreenBookFallback(uid, diagnostics, READ_NOW_LIMIT);
    }
    if (suppressed.dynamicDiscovery.length === 0) {
      const fallbackBooks = await readEvergreenBookFallback(uid, diagnostics, DYNAMIC_LIMIT);
      suppressed.dynamicDiscovery = fallbackBooks.map((item, index) => ({
        ...item,
        score: finiteScore(0.15 - index / 100),
        reason: "A calm literary starting point",
      }));
    }
    if (townMerged.items.length === 0) {
      townMerged.items = literarySignalFallback();
      diagnostics.fallbackActivations += 1;
    }
    diagnostics.personalizationConfidence = safeContinueReading.length > 0 ? 0.35 : 0.15;
    diagnostics.recommendationDiversity = computeDiversity([
      safeContinueReading,
      suppressed.readNow,
      suppressed.dynamicDiscovery,
    ]);
    diagnostics.explorationRatio = suppressed.dynamicDiscovery.length > 0
      ? Number((
        suppressed.dynamicDiscovery.filter((item) => !profile.authors.has(normalizeAuthorKey(item.author))).length /
        suppressed.dynamicDiscovery.length
      ).toFixed(4))
      : 0;
    diagnostics.sourceBalance.editorial = readNowMerged.editorialCount + dynamicMerged.editorialCount + townMerged.editorialCount;
    diagnostics.sourceBalance.readNow = suppressed.readNow.length;
    diagnostics.sourceBalance.fromTheTown = townMerged.items.filter((item) => item.source === "algorithmic").length;
    const freshness = computeRecommendationFreshness({
      profile,
      dynamicDiscovery: suppressed.dynamicDiscovery,
    });
    diagnostics.recommendationFreshnessScore = freshness.score;
    diagnostics.staleRecommendationCount = freshness.staleCount;

    const candidateRows: HomeConsoleRow[] = [
      { type: "continueReading", items: safeContinueReading },
      { type: "readNow", items: suppressed.readNow },
      {
        type: "dynamicDiscovery",
        items: suppressed.dynamicDiscovery,
        editorialCount: suppressed.dynamicDiscovery.filter((item) => item.source === "editorial").length,
      },
      { type: "fromTheTown", items: townMerged.items, editorialCount: townMerged.editorialCount },
    ];

    const rows = finalizeHomeRows(candidateRows, uid, diagnostics);
    const qualityScores = computeHomeQualityScores({
      diagnostics,
      profile,
      continueReading: safeContinueReading,
      readNow: suppressed.readNow,
      dynamicDiscovery: suppressed.dynamicDiscovery,
      fromTheTown: townMerged.items,
      editorialCount: readNowMerged.editorialCount + dynamicMerged.editorialCount + townMerged.editorialCount,
      rowCount: rows.length,
    });
    Object.assign(diagnostics, qualityScores);
    diagnostics.continuitySources = Object.fromEntries(profile.continuitySourceWeights.entries());
    sanitizeDiagnostics(diagnostics);

    logger.info("[HOME][DISCOVERY_CONSOLE_READY]", {
      uid,
      governanceVersion: GOVERNANCE_VERSION,
      rowCount: rows.length,
      latencyMs: Date.now() - startedAtMs,
      emptyRows: diagnostics.emptyRows,
      editorialOccupancy: {
        readNow: readNowMerged.editorialCount,
        dynamicDiscovery: dynamicMerged.editorialCount,
        fromTheTown: townMerged.editorialCount,
      },
      cacheHit: diagnostics.cacheHit,
      duplicateSuppressions: diagnostics.duplicateSuppressions,
      literaryObjectSuppressions: diagnostics.literaryObjectSuppressions,
      authorSuppressions: diagnostics.authorSuppressions,
      expiredEditorialFiltered: diagnostics.expiredEditorialFiltered,
      invalidEditorialFiltered: diagnostics.invalidEditorialFiltered,
      firestoreDocumentsRead: diagnostics.firestoreDocumentsRead,
      personalizationConfidence: diagnostics.personalizationConfidence,
      recommendationDiversity: diagnostics.recommendationDiversity,
      sourceBalance: diagnostics.sourceBalance,
      explainabilityGenerated: diagnostics.explainabilityGenerated,
      explorationRatio: diagnostics.explorationRatio,
      recommendationQualityScore: diagnostics.recommendationQualityScore,
      diversityHealthScore: diagnostics.diversityHealthScore,
      explorationBalanceScore: diagnostics.explorationBalanceScore,
      recommendationFreshnessScore: diagnostics.recommendationFreshnessScore,
      lowConfidenceExplanations: diagnostics.lowConfidenceExplanations,
      staleRecommendationCount: diagnostics.staleRecommendationCount,
      unreadableAttachmentSuppressions: diagnostics.unreadableAttachmentSuppressions,
      literaryCalmScore: diagnostics.literaryCalmScore,
      culturalCoherenceScore: diagnostics.culturalCoherenceScore,
      feedContaminationRisk: diagnostics.feedContaminationRisk,
      recommendationAggressionScore: diagnostics.recommendationAggressionScore,
      editorialCalibration: {
        occupancyAttempts: diagnostics.editorialOccupancyAttempts,
        hardPins: diagnostics.editorialHardPins,
        softBoosts: diagnostics.editorialSoftBoosts,
      },
      ecosystemContinuity: {
        continuityCoherenceScore: diagnostics.continuityCoherenceScore,
        crossSystemDiversityScore: diagnostics.crossSystemDiversityScore,
        continuityDriftRisk: diagnostics.continuityDriftRisk,
        literaryIdentityStability: diagnostics.literaryIdentityStability,
        ecosystemCalmScore: diagnostics.ecosystemCalmScore,
        sources: diagnostics.continuitySources,
      },
      behavioralObservation: {
        recommendationFatigueRisk: diagnostics.recommendationFatigueRisk,
        diversityDegradationRisk: diagnostics.diversityDegradationRisk,
        explorationFamiliarityDrift: diagnostics.explorationFamiliarityDrift,
        feedContaminationTrendRisk: diagnostics.feedContaminationTrendRisk,
        editorialOverreachRisk: diagnostics.editorialOverreachRisk,
        orchestrationVolatilityRisk: diagnostics.orchestrationVolatilityRisk,
      },
      preservationGuardrails: {
        maxRows: MAX_ROWS,
        actualRows: rows.length,
        frontendAuthorityDriftRisk: diagnostics.frontendAuthorityDriftRisk,
        runtimeAmplificationRisk: diagnostics.runtimeAmplificationRisk,
        latencyTargetMs: HOME_LATENCY_TARGET_MS,
        latencyMs: Date.now() - startedAtMs,
        firestoreReadTarget: HOME_FIRESTORE_READ_TARGET,
        firestoreDocumentsRead: diagnostics.firestoreDocumentsRead,
        preservationIntegrityScore: diagnostics.preservationIntegrityScore,
      },
      resilience: {
        degraded: diagnostics.degraded,
        partialPayload: diagnostics.partialPayload,
        fallbackActivations: diagnostics.fallbackActivations,
        subsystemFailures: diagnostics.subsystemFailures,
      },
      matchmakerHome: {
        featureFlagState: matchMakerDynamicDiscovery.telemetry.featureFlagState,
        usedMatchMaker: matchMakerDynamicDiscovery.usedMatchMaker,
        outputCount: matchMakerDynamicDiscovery.telemetry.outputCount,
        confidenceBands: matchMakerDynamicDiscovery.telemetry.confidenceBands,
        evidenceSourceClasses: matchMakerDynamicDiscovery.telemetry.evidenceSourceClasses,
        latencyBucket: matchMakerDynamicDiscovery.telemetry.latencyBucket,
        fallbackReason: matchMakerDynamicDiscovery.telemetry.fallbackReason ?? null,
      },
    });

    return {
      rows,
      generatedAt: new Date().toISOString(),
      ttlSeconds: TTL_SECONDS,
      governanceVersion: GOVERNANCE_VERSION,
    };
  } catch (error) {
    logger.error("[HOME][DISCOVERY_CONSOLE_FAILED]", {
      uid,
      latencyMs: Date.now() - startedAtMs,
      error: String(error),
      degraded: true,
    });
    return {
      rows: [],
      generatedAt: new Date().toISOString(),
      ttlSeconds: Math.min(TTL_SECONDS, 30),
      governanceVersion: GOVERNANCE_VERSION,
    };
  }
});
