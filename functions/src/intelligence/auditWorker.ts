import { createHash } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../firebaseAdmin";
import {
  buildAnchorsFromWindow,
  computeAggregationDelta,
} from "./aggregationWorker";

const db = admin.firestore();

const QUEUE_COLLECTION = "intelligence_signal_queue";
const SUGGESTIONS_COLLECTION = "librarian_suggestions";
const AGGREGATE_COLLECTION = "intelligence_aggregates_global";
const AGGREGATE_DOC_ID = "librarian_global_v1";

const AUDIT_RUNS_COLLECTION = "intelligence_audit_runs";
const AUDIT_ANOMALIES_COLLECTION = "intelligence_audit_anomalies";

const SAMPLE_ANCHORS_PER_RUN = 100;
const MAX_ANCHOR_AGE_DAYS = 7;
const SUGGESTION_SCAN_DOC_LIMIT = 600;
const QUERY_BATCH_SIZE = 200;
const MAX_FIRESTORE_READS = 2000;
const MAX_AUDIT_MISMATCH_RATIO = 0.1;

type AggregateMode =
  | "Reinforcement"
  | "AdjacentExpansion"
  | "Contrast"
  | "HighConfidencePrecision"
  | "ReReadingReflection";

type Signals = {
  suggested: boolean;
  accepted: boolean;
  engaged: boolean;
  completed: boolean;
  positive: boolean;
};

type SuggestionBook = {
  bookId: string;
  suggestionId: string;
  rankPosition: number;
  mode: string;
};

type SuggestionSession = {
  uid: string;
  suggestionSessionId: string;
  books: SuggestionBook[];
};

type QueueEvent = {
  uid: string;
  signalType: string;
  payload: Record<string, unknown>;
};

export type AuditAnchor = {
  uid: string;
  suggestionSessionId: string;
  bookId: string;
  suggestionId: string;
  rankPosition: number;
  mode: string;
};

export type AggregateSnapshot = {
  modePerformance: Record<
    AggregateMode,
    {
      suggested: number;
      accepted: number;
      engaged: number;
      completed: number;
      positive: number;
    }
  >;
  rankPerformance: Record<
    "1" | "2" | "3",
    {
      suggested: number;
      accepted: number;
    }
  >;
  rawModes: Record<string, Record<string, number>>;
  rawRanks: Record<string, Record<string, number>>;
};

export type AuditAnomalyType =
  | "missing_signal"
  | "extra_signal"
  | "ordering_violation"
  | "anchor_incomplete";

export type AuditAnomaly = {
  type: AuditAnomalyType;
  severity: "low" | "medium" | "critical";
  anchorId: string;
  uid: string;
  bookId: string;
  sessionId: string;
  expectedSignals: Record<string, unknown>;
  computedSignals: Record<string, unknown>;
};

type ReadBudget = {
  used: number;
  max: number;
};

function emptySignals(): Signals {
  return {
    suggested: false,
    accepted: false,
    engaged: false,
    completed: false,
    positive: false,
  };
}

function normalizeString(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function normalizeUid(value: unknown): string {
  return normalizeString(value, 128);
}

function normalizeMode(value: unknown): AggregateMode | null {
  const raw = normalizeString(value, 40).toLowerCase();
  if (!raw) return null;
  if (raw === "reinforcement") return "Reinforcement";
  if (raw === "adjacentexpansion") return "AdjacentExpansion";
  if (raw === "structuredcontrast" || raw === "contrast") return "Contrast";
  if (raw === "highconfidenceprecision") return "HighConfidencePrecision";
  if (raw === "rereadingreflection") return "ReReadingReflection";
  return null;
}

function normalizeRank(value: unknown): 1 | 2 | 3 | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rank = Math.trunc(numeric);
  if (rank < 1 || rank > 3) return null;
  return rank as 1 | 2 | 3;
}

function toTimestamp(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }
  if (typeof value === "object" && value !== null) {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") {
      const date = (candidate.toDate as () => Date)();
      if (!Number.isNaN(date.getTime())) {
        return Timestamp.fromDate(date);
      }
    }
  }
  return null;
}

function trackReads(budget: ReadBudget, count: number, context: string): void {
  if (count <= 0) return;
  budget.used += count;
  if (budget.used > budget.max) {
    throw new Error(`READ_BUDGET_EXCEEDED:${context}`);
  }
}

function parseNumericMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const raw = value as Record<string, unknown>;
  const mapped: Record<string, number> = {};
  for (const [key, item] of Object.entries(raw)) {
    const num = Number(item);
    mapped[key] = Number.isFinite(num) && num > 0 ? Math.trunc(num) : 0;
  }
  return mapped;
}

function parseAggregateSnapshot(
  snap: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>
): AggregateSnapshot {
  const modeDefaults: AggregateSnapshot["modePerformance"] = {
    Reinforcement: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
    AdjacentExpansion: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
    Contrast: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
    HighConfidencePrecision: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
    ReReadingReflection: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
  };
  const rankDefaults: AggregateSnapshot["rankPerformance"] = {
    "1": { suggested: 0, accepted: 0 },
    "2": { suggested: 0, accepted: 0 },
    "3": { suggested: 0, accepted: 0 },
  };

  if (!snap.exists) {
    return {
      modePerformance: modeDefaults,
      rankPerformance: rankDefaults,
      rawModes: {},
      rawRanks: {},
    };
  }

  const modeRaw = snap.get("modePerformance");
  const rankRaw = snap.get("rankPerformance");
  const rawModes: Record<string, Record<string, number>> = {};
  const rawRanks: Record<string, Record<string, number>> = {};

  if (modeRaw && typeof modeRaw === "object" && !Array.isArray(modeRaw)) {
    for (const [modeKey, modeValue] of Object.entries(modeRaw as Record<string, unknown>)) {
      rawModes[modeKey] = parseNumericMap(modeValue);
      const mode = normalizeMode(modeKey);
      if (!mode) continue;
      modeDefaults[mode] = {
        suggested: rawModes[modeKey].suggested ?? 0,
        accepted: rawModes[modeKey].accepted ?? 0,
        engaged: rawModes[modeKey].engaged ?? 0,
        completed: rawModes[modeKey].completed ?? 0,
        positive: rawModes[modeKey].positive ?? 0,
      };
    }
  }

  if (rankRaw && typeof rankRaw === "object" && !Array.isArray(rankRaw)) {
    for (const [rankKey, rankValue] of Object.entries(rankRaw as Record<string, unknown>)) {
      rawRanks[rankKey] = parseNumericMap(rankValue);
      const rank = normalizeRank(rankKey);
      if (!rank) continue;
      const normalizedRank = String(rank) as "1" | "2" | "3";
      rankDefaults[normalizedRank] = {
        suggested: rawRanks[rankKey].suggested ?? 0,
        accepted: rawRanks[rankKey].accepted ?? 0,
      };
    }
  }

  return {
    modePerformance: modeDefaults,
    rankPerformance: rankDefaults,
    rawModes,
    rawRanks,
  };
}

function parseSuggestionSessionDoc(
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): SuggestionSession | null {
  const uid = normalizeUid(docSnap.get("uid"));
  if (!uid) return null;
  const booksRaw = docSnap.get("books");
  if (!Array.isArray(booksRaw)) return null;

  const books: SuggestionBook[] = [];
  for (const row of booksRaw) {
    const item =
      row && typeof row === "object" && !Array.isArray(row)
        ? (row as Record<string, unknown>)
        : null;
    if (!item) continue;
    const bookId = normalizeString(item.bookId, 128);
    const suggestionId = normalizeString(item.suggestionId, 96);
    const rankPosition = normalizeRank(item.rankPosition);
    const mode = normalizeString(item.mode, 40);
    if (!bookId || !suggestionId || !rankPosition || !mode) continue;
    books.push({
      bookId,
      suggestionId,
      rankPosition,
      mode,
    });
  }

  if (books.length === 0) return null;
  return {
    uid,
    suggestionSessionId: docSnap.id,
    books,
  };
}

function parseQueueEventDoc(
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): QueueEvent | null {
  const uid = normalizeUid(docSnap.get("uid"));
  if (!uid) return null;
  const signalType = normalizeString(docSnap.get("signalType"), 96).toLowerCase();
  const payloadRaw = docSnap.get("payload");
  const payload =
    payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)
      ? (payloadRaw as Record<string, unknown>)
      : {};

  return {
    uid,
    signalType,
    payload,
  };
}

function parseRecommendationOrigin(
  value: unknown
): {
  suggestionSessionId: string;
  suggestionId: string;
  rankPosition: number;
  mode: string;
} | null {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!raw) return null;
  if (raw.source !== "librarian") return null;

  const suggestionSessionId = normalizeString(raw.suggestionSessionId, 96);
  const suggestionId = normalizeString(raw.suggestionId, 96);
  const rankPosition = normalizeRank(raw.rankPosition);
  const mode = normalizeString(raw.mode, 40);
  if (!suggestionSessionId || !suggestionId || !rankPosition || !mode) {
    return null;
  }

  return {
    suggestionSessionId,
    suggestionId,
    rankPosition,
    mode,
  };
}

function collectSessionIdsFromPayload(payload: Record<string, unknown>): Set<string> {
  const sessionIds = new Set<string>();

  const direct = parseRecommendationOrigin(payload.recommendationOrigin);
  if (direct) {
    sessionIds.add(direct.suggestionSessionId);
  }

  const addedRaw = payload.addedRecommendationOrigins;
  if (Array.isArray(addedRaw)) {
    for (const row of addedRaw) {
      const item =
        row && typeof row === "object" && !Array.isArray(row)
          ? (row as Record<string, unknown>)
          : null;
      if (!item) continue;
      const nested = parseRecommendationOrigin(item.recommendationOrigin);
      if (!nested) continue;
      sessionIds.add(nested.suggestionSessionId);
    }
  }

  return sessionIds;
}

function anchorKey(uid: string, sessionId: string, bookId: string): string {
  return `${uid}|${sessionId}|${bookId}`;
}

export function deriveAuditRunId(invocationStart: Timestamp): string {
  const bucketMs = 6 * 60 * 60 * 1000;
  const roundedMs = Math.floor(invocationStart.toMillis() / bucketMs) * bucketMs;
  return `librarian_audit_v1_${roundedMs}`;
}

function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function buildAuditAnomalyDocId(
  runId: string,
  type: AuditAnomalyType,
  anchorId: string
): string {
  return stableHash(`${runId}|${type}|${anchorId}`).slice(0, 32);
}

export function buildAnchorCatalogFromSessions(sessions: SuggestionSession[]): AuditAnchor[] {
  const anchors: AuditAnchor[] = [];
  for (const session of sessions) {
    for (const book of session.books) {
      anchors.push({
        uid: session.uid,
        suggestionSessionId: session.suggestionSessionId,
        bookId: book.bookId,
        suggestionId: book.suggestionId,
        rankPosition: book.rankPosition,
        mode: book.mode,
      });
    }
  }
  return anchors;
}

export function deterministicSampleAnchors(params: {
  anchors: AuditAnchor[];
  runSeed: string;
  maxAnchors: number;
}): AuditAnchor[] {
  const deduped = new Map<string, AuditAnchor>();
  for (const anchor of params.anchors) {
    deduped.set(anchorKey(anchor.uid, anchor.suggestionSessionId, anchor.bookId), anchor);
  }

  const scored = Array.from(deduped.values()).map((anchor) => ({
    anchor,
    score: stableHash(`${params.runSeed}|${anchorKey(anchor.uid, anchor.suggestionSessionId, anchor.bookId)}`),
  }));

  scored.sort((a, b) => {
    if (a.score === b.score) {
      return anchorKey(a.anchor.uid, a.anchor.suggestionSessionId, a.anchor.bookId).localeCompare(
        anchorKey(b.anchor.uid, b.anchor.suggestionSessionId, b.anchor.bookId)
      );
    }
    return a.score.localeCompare(b.score);
  });

  return scored.slice(0, params.maxAnchors).map((row) => row.anchor);
}

function buildSampledSuggestionSessions(sampledAnchors: AuditAnchor[]): SuggestionSession[] {
  const sessions = new Map<string, SuggestionSession>();

  for (const anchor of sampledAnchors) {
    const key = `${anchor.uid}|${anchor.suggestionSessionId}`;
    const existing = sessions.get(key);
    if (!existing) {
      sessions.set(key, {
        uid: anchor.uid,
        suggestionSessionId: anchor.suggestionSessionId,
        books: [
          {
            bookId: anchor.bookId,
            suggestionId: anchor.suggestionId,
            rankPosition: anchor.rankPosition,
            mode: anchor.mode,
          },
        ],
      });
      continue;
    }

    const duplicate = existing.books.some((book) => book.bookId === anchor.bookId);
    if (duplicate) continue;
    existing.books.push({
      bookId: anchor.bookId,
      suggestionId: anchor.suggestionId,
      rankPosition: anchor.rankPosition,
      mode: anchor.mode,
    });
  }

  return Array.from(sessions.values());
}

function anchorSignalsFromAny(value: unknown): Signals {
  const raw = value as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return emptySignals();
  return {
    suggested: raw.suggested === true,
    accepted: raw.accepted === true,
    engaged: raw.engaged === true,
    completed: raw.completed === true,
    positive: raw.positive === true,
  };
}

function detectGlobalOrderingAnomalies(aggregate: AggregateSnapshot): AuditAnomaly[] {
  const anomalies: AuditAnomaly[] = [];

  for (const [mode, stats] of Object.entries(aggregate.modePerformance)) {
    if (stats.accepted > stats.suggested) {
      anomalies.push({
        type: "ordering_violation",
        severity: "critical",
        anchorId: `global|mode|${mode}|accepted_gt_suggested`,
        uid: "__system__",
        bookId: "__system__",
        sessionId: "__system__",
        expectedSignals: { acceptedLTEsuggested: true },
        computedSignals: { suggested: stats.suggested, accepted: stats.accepted },
      });
    }
    if (stats.engaged > stats.accepted) {
      anomalies.push({
        type: "ordering_violation",
        severity: "critical",
        anchorId: `global|mode|${mode}|engaged_gt_accepted`,
        uid: "__system__",
        bookId: "__system__",
        sessionId: "__system__",
        expectedSignals: { engagedLTEaccepted: true },
        computedSignals: { accepted: stats.accepted, engaged: stats.engaged },
      });
    }
    if (stats.completed > stats.engaged) {
      anomalies.push({
        type: "ordering_violation",
        severity: "critical",
        anchorId: `global|mode|${mode}|completed_gt_engaged`,
        uid: "__system__",
        bookId: "__system__",
        sessionId: "__system__",
        expectedSignals: { completedLTEengaged: true },
        computedSignals: { engaged: stats.engaged, completed: stats.completed },
      });
    }
    if (stats.positive > stats.engaged) {
      anomalies.push({
        type: "ordering_violation",
        severity: "critical",
        anchorId: `global|mode|${mode}|positive_gt_engaged`,
        uid: "__system__",
        bookId: "__system__",
        sessionId: "__system__",
        expectedSignals: { positiveLTEengaged: true },
        computedSignals: { engaged: stats.engaged, positive: stats.positive },
      });
    }
    if (stats.suggested === 0 && (stats.accepted > 0 || stats.engaged > 0 || stats.completed > 0 || stats.positive > 0)) {
      anomalies.push({
        type: "extra_signal",
        severity: "critical",
        anchorId: `global|mode|${mode}|signals_without_suggested`,
        uid: "__system__",
        bookId: "__system__",
        sessionId: "__system__",
        expectedSignals: { suggested: { gt: 0 } },
        computedSignals: {
          suggested: stats.suggested,
          accepted: stats.accepted,
          engaged: stats.engaged,
          completed: stats.completed,
          positive: stats.positive,
        },
      });
    }
  }

  for (const [rank, stats] of Object.entries(aggregate.rankPerformance)) {
    if (stats.accepted > stats.suggested) {
      anomalies.push({
        type: "ordering_violation",
        severity: "critical",
        anchorId: `global|rank|${rank}|accepted_gt_suggested`,
        uid: "__system__",
        bookId: "__system__",
        sessionId: "__system__",
        expectedSignals: { acceptedLTEsuggested: true },
        computedSignals: { suggested: stats.suggested, accepted: stats.accepted },
      });
    }
  }

  for (const [rawMode, rawCounts] of Object.entries(aggregate.rawModes)) {
    if (normalizeMode(rawMode)) continue;
    const hasSignals = Object.values(rawCounts).some((value) => value > 0);
    if (!hasSignals) continue;
    anomalies.push({
      type: "extra_signal",
      severity: "medium",
      anchorId: `global|unknown_mode|${rawMode}`,
      uid: "__system__",
      bookId: "__system__",
      sessionId: "__system__",
      expectedSignals: { knownMode: true },
      computedSignals: rawCounts,
    });
  }

  for (const [rawRank, rawCounts] of Object.entries(aggregate.rawRanks)) {
    if (normalizeRank(rawRank)) continue;
    const hasSignals = Object.values(rawCounts).some((value) => value > 0);
    if (!hasSignals) continue;
    anomalies.push({
      type: "extra_signal",
      severity: "medium",
      anchorId: `global|unknown_rank|${rawRank}`,
      uid: "__system__",
      bookId: "__system__",
      sessionId: "__system__",
      expectedSignals: { knownRank: true },
      computedSignals: rawCounts,
    });
  }

  return anomalies;
}

export function detectAuditAnomalies(params: {
  sampledAnchors: AuditAnchor[];
  recomputedAnchors: Array<Record<string, unknown>>;
  aggregate: AggregateSnapshot;
}): AuditAnomaly[] {
  const anomalies: AuditAnomaly[] = [];
  const recomputedByKey = new Map<string, Record<string, unknown>>();

  for (const row of params.recomputedAnchors) {
    const uid = normalizeUid(row.uid);
    const suggestionSessionId = normalizeString(row.suggestionSessionId, 96);
    const bookId = normalizeString(row.bookId, 128);
    if (!uid || !suggestionSessionId || !bookId) continue;
    recomputedByKey.set(anchorKey(uid, suggestionSessionId, bookId), row);
  }

  for (const anchor of params.sampledAnchors) {
    const key = anchorKey(anchor.uid, anchor.suggestionSessionId, anchor.bookId);
    const recomputed = recomputedByKey.get(key);

    if (!recomputed) {
      anomalies.push({
        type: "anchor_incomplete",
        severity: "medium",
        anchorId: key,
        uid: anchor.uid,
        bookId: anchor.bookId,
        sessionId: anchor.suggestionSessionId,
        expectedSignals: { suggested: true },
        computedSignals: emptySignals(),
      });
      continue;
    }

    const signals = anchorSignalsFromAny(recomputed);
    const normalizedMode = normalizeMode(recomputed.mode ?? anchor.mode);
    const normalizedRank = normalizeRank(recomputed.rankPosition ?? anchor.rankPosition);

    if (!normalizedMode || !normalizedRank) {
      anomalies.push({
        type: "anchor_incomplete",
        severity: "low",
        anchorId: key,
        uid: anchor.uid,
        bookId: anchor.bookId,
        sessionId: anchor.suggestionSessionId,
        expectedSignals: { modeAndRankPresent: true },
        computedSignals: {
          mode: normalizeString(recomputed.mode, 40),
          rankPosition: Number(recomputed.rankPosition),
        },
      });
      continue;
    }

    const modeCounts = params.aggregate.modePerformance[normalizedMode];
    const rankCounts = params.aggregate.rankPerformance[String(normalizedRank) as "1" | "2" | "3"];

    const missingMetrics: string[] = [];
    if (signals.suggested && modeCounts.suggested <= 0) missingMetrics.push("mode.suggested");
    if (signals.accepted && modeCounts.accepted <= 0) missingMetrics.push("mode.accepted");
    if (signals.engaged && modeCounts.engaged <= 0) missingMetrics.push("mode.engaged");
    if (signals.completed && modeCounts.completed <= 0) missingMetrics.push("mode.completed");
    if (signals.positive && modeCounts.positive <= 0) missingMetrics.push("mode.positive");
    if (signals.suggested && rankCounts.suggested <= 0) missingMetrics.push("rank.suggested");
    if (signals.accepted && rankCounts.accepted <= 0) missingMetrics.push("rank.accepted");

    if (missingMetrics.length > 0) {
      const severity =
        missingMetrics.includes("mode.completed") || missingMetrics.includes("mode.positive")
          ? "critical"
          : "medium";
      anomalies.push({
        type: "missing_signal",
        severity,
        anchorId: key,
        uid: anchor.uid,
        bookId: anchor.bookId,
        sessionId: anchor.suggestionSessionId,
        expectedSignals: {
          suggested: signals.suggested,
          accepted: signals.accepted,
          engaged: signals.engaged,
          completed: signals.completed,
          positive: signals.positive,
        },
        computedSignals: {
          missingMetrics,
          mode: normalizedMode,
          rankPosition: normalizedRank,
          modeCounts,
          rankCounts,
        },
      });
    }
  }

  anomalies.push(...detectGlobalOrderingAnomalies(params.aggregate));
  return anomalies;
}

async function loadRecentSuggestionSessions(params: {
  windowStart: Timestamp;
  windowEnd: Timestamp;
  budget: ReadBudget;
}): Promise<SuggestionSession[]> {
  const sessions: SuggestionSession[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

  while (sessions.length < SUGGESTION_SCAN_DOC_LIMIT) {
    let query = db
      .collection(SUGGESTIONS_COLLECTION)
      .where("createdAt", ">", params.windowStart)
      .where("createdAt", "<=", params.windowEnd)
      .orderBy("createdAt", "desc")
      .limit(QUERY_BATCH_SIZE);

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snap = await query.get();
    trackReads(params.budget, snap.size, "suggestions");
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const parsed = parseSuggestionSessionDoc(docSnap);
      if (parsed) {
        sessions.push(parsed);
      }
      if (sessions.length >= SUGGESTION_SCAN_DOC_LIMIT) break;
    }

    if (snap.docs.length < QUERY_BATCH_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  return sessions;
}

async function loadQueueEventsForSample(params: {
  sampledAnchors: AuditAnchor[];
  windowStart: Timestamp;
  windowEnd: Timestamp;
  budget: ReadBudget;
}): Promise<QueueEvent[]> {
  const byUidSessions = new Map<string, Set<string>>();
  for (const anchor of params.sampledAnchors) {
    if (!byUidSessions.has(anchor.uid)) byUidSessions.set(anchor.uid, new Set<string>());
    byUidSessions.get(anchor.uid)!.add(anchor.suggestionSessionId);
  }

  const events: QueueEvent[] = [];

  for (const [uid, sessionIds] of byUidSessions.entries()) {
    let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;
    while (true) {
      const remainingReads = params.budget.max - params.budget.used;
      if (remainingReads <= 0) {
        throw new Error("READ_BUDGET_EXCEEDED:queue");
      }

      const queryLimit = Math.min(QUERY_BATCH_SIZE, remainingReads);
      let query = db
        .collection(QUEUE_COLLECTION)
        .where("uid", "==", uid)
        .where("createdAt", ">", params.windowStart)
        .where("createdAt", "<=", params.windowEnd)
        .orderBy("createdAt")
        .limit(queryLimit);

      if (cursor) {
        query = query.startAfter(cursor);
      }

      const snap = await query.get();
      trackReads(params.budget, snap.size, "queue");
      if (snap.empty) break;

      for (const docSnap of snap.docs) {
        const parsed = parseQueueEventDoc(docSnap);
        if (!parsed) continue;
        const sessionIdsInPayload = collectSessionIdsFromPayload(parsed.payload);
        const isRelevant = Array.from(sessionIdsInPayload).some((sessionId) => sessionIds.has(sessionId));
        if (!isRelevant) continue;
        events.push(parsed);
      }

      if (snap.docs.length < queryLimit) break;
      cursor = snap.docs[snap.docs.length - 1];
    }
  }

  return events;
}

async function persistAnomalies(runId: string, anomalies: AuditAnomaly[]): Promise<void> {
  if (anomalies.length === 0) return;

  for (let i = 0; i < anomalies.length; i += 350) {
    const chunk = anomalies.slice(i, i + 350);
    const batch = db.batch();

    for (const anomaly of chunk) {
      const docId = buildAuditAnomalyDocId(runId, anomaly.type, anomaly.anchorId);
      const ref = db.collection(AUDIT_ANOMALIES_COLLECTION).doc(docId);
      batch.set(
        ref,
        {
          runId,
          type: anomaly.type,
          anchorId: anomaly.anchorId,
          uid: anomaly.uid,
          bookId: anomaly.bookId,
          sessionId: anomaly.sessionId,
          expectedSignals: anomaly.expectedSignals,
          computedSignals: anomaly.computedSignals,
          severity: anomaly.severity,
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    await batch.commit();
  }
}

function resolveInvocationTimestamp(event: unknown): Timestamp {
  const scheduleTimeRaw =
    event && typeof event === "object" && "scheduleTime" in (event as Record<string, unknown>)
      ? (event as { scheduleTime?: unknown }).scheduleTime
      : null;
  const scheduleTime = toTimestamp(scheduleTimeRaw);
  return scheduleTime ?? Timestamp.now();
}

export async function runIntelligenceAuditWindow(params?: {
  invocationStart?: Timestamp;
}): Promise<{
  runId: string;
  anchorsChecked: number;
  anomaliesDetected: number;
  mismatchRatio: number;
  durationMs: number;
}> {
  const invocationStart = params?.invocationStart ?? Timestamp.now();
  const runId = deriveAuditRunId(invocationStart);
  const runRef = db.collection(AUDIT_RUNS_COLLECTION).doc(runId);
  const startedAtMs = Date.now();
  const budget: ReadBudget = { used: 0, max: MAX_FIRESTORE_READS };

  const existingRunSnap = await runRef.get();
  trackReads(budget, 1, "audit_run_existing");
  if (existingRunSnap.exists && existingRunSnap.get("status") === "success") {
    logger.info("[INTELLIGENCE][AUDIT][audit_summary]", {
      runId,
      status: "already_success",
      anchorsChecked: Number(existingRunSnap.get("anchorsChecked")) || 0,
      anomaliesDetected: Number(existingRunSnap.get("anomaliesDetected")) || 0,
      durationMs: Number(existingRunSnap.get("durationMs")) || 0,
      mismatchRatio: Number(existingRunSnap.get("mismatchRatio")) || 0,
      readCount: budget.used,
    });
    return {
      runId,
      anchorsChecked: Number(existingRunSnap.get("anchorsChecked")) || 0,
      anomaliesDetected: Number(existingRunSnap.get("anomaliesDetected")) || 0,
      mismatchRatio: Number(existingRunSnap.get("mismatchRatio")) || 0,
      durationMs: Number(existingRunSnap.get("durationMs")) || 0,
    };
  }

  await runRef.set(
    {
      runId,
      status: "running",
      startedAt: FieldValue.serverTimestamp(),
      scheduleBucketAt: Timestamp.fromMillis(invocationStart.toMillis()),
    },
    { merge: true }
  );

  const windowEnd = Timestamp.fromMillis(invocationStart.toMillis());
  const windowStart = Timestamp.fromMillis(
    windowEnd.toMillis() - MAX_ANCHOR_AGE_DAYS * 24 * 60 * 60 * 1000
  );

  logger.info("[INTELLIGENCE][AUDIT][audit_start]", {
    runId,
    windowStart: windowStart.toDate().toISOString(),
    windowEnd: windowEnd.toDate().toISOString(),
    sampleTarget: SAMPLE_ANCHORS_PER_RUN,
    readBudgetMax: MAX_FIRESTORE_READS,
  });

  try {
    const aggregateSnap = await db.collection(AGGREGATE_COLLECTION).doc(AGGREGATE_DOC_ID).get();
    trackReads(budget, 1, "aggregate_doc");
    if (!aggregateSnap.exists) {
      throw new Error(`MISSING_AGGREGATE_DOC:${AGGREGATE_DOC_ID}`);
    }
    const aggregate = parseAggregateSnapshot(aggregateSnap);

    const suggestionSessions = await loadRecentSuggestionSessions({
      windowStart,
      windowEnd,
      budget,
    });
    const anchorCatalog = buildAnchorCatalogFromSessions(suggestionSessions);
    const sampledAnchors = deterministicSampleAnchors({
      anchors: anchorCatalog,
      runSeed: runId,
      maxAnchors: SAMPLE_ANCHORS_PER_RUN,
    });

    const sampledSessions = buildSampledSuggestionSessions(sampledAnchors);
    const queueEvents = await loadQueueEventsForSample({
      sampledAnchors,
      windowStart,
      windowEnd,
      budget,
    });

    logger.info("[INTELLIGENCE][AUDIT][anchor_replay]", {
      runId,
      sessionsScanned: suggestionSessions.length,
      anchorsAvailable: anchorCatalog.length,
      anchorsSampled: sampledAnchors.length,
      queueEventsReplayed: queueEvents.length,
      readCount: budget.used,
    });

    const recomputed = buildAnchorsFromWindow({
      suggestionSessions: sampledSessions,
      queueEvents,
    });
    void computeAggregationDelta(recomputed);

    const sampledAnchorKeys = new Set<string>(
      sampledAnchors.map((anchor) => anchorKey(anchor.uid, anchor.suggestionSessionId, anchor.bookId))
    );
    const recomputedSampled = (recomputed as Array<Record<string, unknown>>).filter((row) => {
      const uid = normalizeUid(row.uid);
      const sessionId = normalizeString(row.suggestionSessionId, 96);
      const bookId = normalizeString(row.bookId, 128);
      if (!uid || !sessionId || !bookId) return false;
      return sampledAnchorKeys.has(anchorKey(uid, sessionId, bookId));
    });

    const anomalies = detectAuditAnomalies({
      sampledAnchors,
      recomputedAnchors: recomputedSampled,
      aggregate,
    });

    await persistAnomalies(runId, anomalies);

    for (const anomaly of anomalies) {
      logger.warn("[INTELLIGENCE][AUDIT][anomaly_detected]", {
        runId,
        type: anomaly.type,
        severity: anomaly.severity,
        anchorId: anomaly.anchorId,
      });
    }

    const anchorsChecked = sampledAnchors.length;
    const anomaliesDetected = anomalies.length;
    const mismatchRatio = anchorsChecked > 0 ? anomaliesDetected / anchorsChecked : 0;
    const durationMs = Date.now() - startedAtMs;

    const status = mismatchRatio > MAX_AUDIT_MISMATCH_RATIO ? "failed" : "success";

    await runRef.set(
      {
        runId,
        completedAt: FieldValue.serverTimestamp(),
        anchorsChecked,
        anomaliesDetected,
        mismatchRatio: Number(mismatchRatio.toFixed(6)),
        status,
        durationMs,
        readCount: budget.used,
      },
      { merge: true }
    );

    logger.info("[INTELLIGENCE][AUDIT][audit_summary]", {
      runId,
      status,
      anchorsChecked,
      anomaliesDetected,
      mismatchRatio: Number(mismatchRatio.toFixed(6)),
      durationMs,
      readCount: budget.used,
    });

    if (status === "failed") {
      throw new Error(
        `AUDIT_MISMATCH_THRESHOLD_EXCEEDED:${mismatchRatio.toFixed(6)}`
      );
    }

    return {
      runId,
      anchorsChecked,
      anomaliesDetected,
      mismatchRatio,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    await runRef.set(
      {
        runId,
        status: "failed",
        completedAt: FieldValue.serverTimestamp(),
        durationMs,
        error: String(error),
      },
      { merge: true }
    );
    throw error;
  }
}

export const scheduledIntelligenceAuditWorker = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "UTC",
    memory: "512MiB",
    timeoutSeconds: 120,
    maxInstances: 1,
    retryCount: 3,
  },
  async (event) => {
    const invocationStart = resolveInvocationTimestamp(event);
    await runIntelligenceAuditWindow({ invocationStart });
  }
);
