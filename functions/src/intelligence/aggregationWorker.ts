import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

const QUEUE_COLLECTION = "intelligence_signal_queue";
const SUGGESTIONS_COLLECTION = "librarian_suggestions";
const CHECKPOINT_COLLECTION = "intelligence_aggregation_checkpoint";
const CHECKPOINT_DOC_ID = "librarian_global_v1";
const AGGREGATE_COLLECTION = "intelligence_aggregates_global";
const AGGREGATE_DOC_ID = "librarian_global_v1";

const AGGREGATION_VERSION = 1;
const WINDOW_READ_BATCH_SIZE = 500;
const MAX_QUEUE_DOCS_PER_WINDOW = 5000;
const MAX_SUGGESTION_DOCS_PER_WINDOW = 5000;

type AggregateMode =
  | "Reinforcement"
  | "AdjacentExpansion"
  | "Contrast"
  | "HighConfidencePrecision"
  | "ReReadingReflection";

type RecommendationOrigin = {
  source: "librarian";
  suggestionSessionId: string;
  suggestionId: string;
  rankPosition: number;
  mode: string;
};

type QueueEvent = {
  uid: string;
  signalType: string;
  payload: Record<string, unknown>;
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

type AnchorSignals = {
  uid: string;
  suggestionSessionId: string;
  bookId: string;
  suggestionId: string | null;
  rankPosition: number | null;
  mode: string | null;
  suggested: boolean;
  accepted: boolean;
  engaged: boolean;
  completed: boolean;
  positive: boolean;
  ignored: boolean;
};

type AggregationDelta = {
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
  totals: {
    suggested: number;
    accepted: number;
    engaged: number;
    completed: number;
    positive: number;
    ignored: number;
  };
};

function toTimestamp(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  if (typeof value === "object") {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") {
      const parsed = (candidate.toDate as () => Date)();
      if (!Number.isNaN(parsed.getTime())) {
        return Timestamp.fromDate(parsed);
      }
    }
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }
  return null;
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

function parseRecommendationOrigin(value: unknown): RecommendationOrigin | null {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!raw) return null;

  const source = raw.source === "librarian" ? "librarian" : null;
  const suggestionSessionId = normalizeString(raw.suggestionSessionId, 96);
  const suggestionId = normalizeString(raw.suggestionId, 96);
  const rankPosition = normalizeRank(raw.rankPosition);
  const mode = normalizeString(raw.mode, 40);
  if (!source || !suggestionSessionId || !suggestionId || !rankPosition || !mode) {
    return null;
  }

  return {
    source,
    suggestionSessionId,
    suggestionId,
    rankPosition,
    mode,
  };
}

function emptyDelta(): AggregationDelta {
  return {
    modePerformance: {
      Reinforcement: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
      AdjacentExpansion: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
      Contrast: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
      HighConfidencePrecision: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
      ReReadingReflection: { suggested: 0, accepted: 0, engaged: 0, completed: 0, positive: 0 },
    },
    rankPerformance: {
      "1": { suggested: 0, accepted: 0 },
      "2": { suggested: 0, accepted: 0 },
      "3": { suggested: 0, accepted: 0 },
    },
    totals: {
      suggested: 0,
      accepted: 0,
      engaged: 0,
      completed: 0,
      positive: 0,
      ignored: 0,
    },
  };
}

function anchorKey(uid: string, suggestionSessionId: string, bookId: string): string {
  return `${uid}|${suggestionSessionId}|${bookId}`;
}

function getOrCreateAnchor(
  anchors: Map<string, AnchorSignals>,
  params: {
    uid: string;
    suggestionSessionId: string;
    bookId: string;
    suggestionId?: string | null;
    rankPosition?: number | null;
    mode?: string | null;
  }
): AnchorSignals {
  const key = anchorKey(params.uid, params.suggestionSessionId, params.bookId);
  const existing = anchors.get(key);
  if (existing) {
    if (!existing.suggestionId && params.suggestionId) existing.suggestionId = params.suggestionId;
    if (!existing.rankPosition && params.rankPosition) existing.rankPosition = params.rankPosition;
    if (!existing.mode && params.mode) existing.mode = params.mode;
    return existing;
  }

  const created: AnchorSignals = {
    uid: params.uid,
    suggestionSessionId: params.suggestionSessionId,
    bookId: params.bookId,
    suggestionId: params.suggestionId ?? null,
    rankPosition: params.rankPosition ?? null,
    mode: params.mode ?? null,
    suggested: false,
    accepted: false,
    engaged: false,
    completed: false,
    positive: false,
    ignored: false,
  };
  anchors.set(key, created);
  return created;
}

function applyMonotonicClosure(anchor: AnchorSignals): AnchorSignals {
  const normalized: AnchorSignals = {
    ...anchor,
    suggested: anchor.suggested,
    accepted: anchor.accepted,
    engaged: anchor.engaged,
    completed: anchor.completed,
    positive: anchor.positive,
    ignored: false,
  };

  if (normalized.completed) {
    normalized.engaged = true;
  }
  if (normalized.positive) {
    normalized.engaged = true;
  }
  if (normalized.engaged) {
    normalized.accepted = true;
  }
  if (normalized.accepted || normalized.engaged || normalized.completed || normalized.positive) {
    normalized.suggested = true;
  }
  normalized.ignored = normalized.suggested && !normalized.accepted;

  return normalized;
}

function parseSuggestionSession(
  docSnap: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
): SuggestionSession | null {
  const uid = normalizeUid(docSnap.get("uid"));
  if (!uid) return null;
  const booksRaw = docSnap.get("books");
  if (!Array.isArray(booksRaw)) return null;

  const books: SuggestionBook[] = [];
  for (const row of booksRaw) {
    const rec =
      row && typeof row === "object" && !Array.isArray(row)
        ? (row as Record<string, unknown>)
        : null;
    if (!rec) continue;
    const bookId = normalizeString(rec.bookId, 128);
    const suggestionId = normalizeString(rec.suggestionId, 96);
    const rankPosition = normalizeRank(rec.rankPosition);
    const mode = normalizeString(rec.mode, 40);
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

function parseQueueEvent(
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

function applyQueueSignalToAnchor(
  anchor: AnchorSignals,
  signalType: string,
  payload: Record<string, unknown>
): void {
  if (signalType === "shelf_entries_changed") {
    anchor.accepted = true;
    return;
  }

  if (signalType === "reading_progress_written") {
    anchor.engaged = true;
    const statusState = normalizeString(payload.statusState, 24).toLowerCase();
    const progress = Number(payload.progress);
    if (statusState === "completed" || (Number.isFinite(progress) && progress >= 1)) {
      anchor.completed = true;
    }
    return;
  }

  if (signalType === "review_created" || signalType === "review_updated") {
    const afterRating = Number(payload.afterRating);
    if (Number.isFinite(afterRating) && afterRating >= 4) {
      anchor.positive = true;
    }
  }
}

export function buildAnchorsFromWindow(params: {
  suggestionSessions: SuggestionSession[];
  queueEvents: QueueEvent[];
}): AnchorSignals[] {
  const anchors = new Map<string, AnchorSignals>();

  for (const session of params.suggestionSessions) {
    for (const row of session.books) {
      const anchor = getOrCreateAnchor(anchors, {
        uid: session.uid,
        suggestionSessionId: session.suggestionSessionId,
        bookId: row.bookId,
        suggestionId: row.suggestionId,
        rankPosition: row.rankPosition,
        mode: row.mode,
      });
      anchor.suggested = true;
    }
  }

  for (const event of params.queueEvents) {
    const directOrigin = parseRecommendationOrigin(event.payload.recommendationOrigin);
    const directBookId = normalizeString(event.payload.bookId, 128);
    if (directOrigin && directBookId) {
      const anchor = getOrCreateAnchor(anchors, {
        uid: event.uid,
        suggestionSessionId: directOrigin.suggestionSessionId,
        bookId: directBookId,
        suggestionId: directOrigin.suggestionId,
        rankPosition: directOrigin.rankPosition,
        mode: directOrigin.mode,
      });
      anchor.suggested = true;
      applyQueueSignalToAnchor(anchor, event.signalType, event.payload);
    }

    const addedRecommendationOriginsRaw = event.payload.addedRecommendationOrigins;
    if (Array.isArray(addedRecommendationOriginsRaw)) {
      for (const row of addedRecommendationOriginsRaw) {
        const item =
          row && typeof row === "object" && !Array.isArray(row)
            ? (row as Record<string, unknown>)
            : null;
        if (!item) continue;
        const bookId = normalizeString(item.bookId, 128);
        const origin = parseRecommendationOrigin(item.recommendationOrigin);
        if (!bookId || !origin) continue;
        const anchor = getOrCreateAnchor(anchors, {
          uid: event.uid,
          suggestionSessionId: origin.suggestionSessionId,
          bookId,
          suggestionId: origin.suggestionId,
          rankPosition: origin.rankPosition,
          mode: origin.mode,
        });
        anchor.suggested = true;
        applyQueueSignalToAnchor(anchor, event.signalType, event.payload);
      }
    }
  }

  return Array.from(anchors.values()).map(applyMonotonicClosure);
}

export function computeAggregationDelta(anchors: AnchorSignals[]): AggregationDelta {
  const delta = emptyDelta();

  for (const anchor of anchors) {
    if (anchor.suggested) delta.totals.suggested += 1;
    if (anchor.accepted) delta.totals.accepted += 1;
    if (anchor.engaged) delta.totals.engaged += 1;
    if (anchor.completed) delta.totals.completed += 1;
    if (anchor.positive) delta.totals.positive += 1;
    if (anchor.ignored) delta.totals.ignored += 1;

    const mode = normalizeMode(anchor.mode);
    if (mode) {
      if (anchor.suggested) delta.modePerformance[mode].suggested += 1;
      if (anchor.accepted) delta.modePerformance[mode].accepted += 1;
      if (anchor.engaged) delta.modePerformance[mode].engaged += 1;
      if (anchor.completed) delta.modePerformance[mode].completed += 1;
      if (anchor.positive) delta.modePerformance[mode].positive += 1;
    }

    const rank = normalizeRank(anchor.rankPosition);
    if (rank) {
      const rankKey = String(rank) as "1" | "2" | "3";
      if (anchor.suggested) delta.rankPerformance[rankKey].suggested += 1;
      if (anchor.accepted) delta.rankPerformance[rankKey].accepted += 1;
    }
  }

  return delta;
}

async function loadWindowQueueEvents(params: {
  windowStart: Timestamp;
  windowEnd: Timestamp;
}): Promise<QueueEvent[]> {
  const collected: QueueEvent[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

  while (collected.length < MAX_QUEUE_DOCS_PER_WINDOW) {
    let query = db
      .collection(QUEUE_COLLECTION)
      .where("createdAt", ">", params.windowStart)
      .where("createdAt", "<=", params.windowEnd)
      .orderBy("createdAt")
      .limit(WINDOW_READ_BATCH_SIZE);

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snap = await query.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const parsed = parseQueueEvent(docSnap);
      if (parsed) collected.push(parsed);
      if (collected.length >= MAX_QUEUE_DOCS_PER_WINDOW) {
        cursor = docSnap;
        break;
      }
    }

    if (snap.docs.length < WINDOW_READ_BATCH_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  if (collected.length >= MAX_QUEUE_DOCS_PER_WINDOW && cursor) {
    const overflowSnap = await db
      .collection(QUEUE_COLLECTION)
      .where("createdAt", ">", params.windowStart)
      .where("createdAt", "<=", params.windowEnd)
      .orderBy("createdAt")
      .startAfter(cursor)
      .limit(1)
      .get();
    if (!overflowSnap.empty) {
      throw new Error("WINDOW_OVERFLOW:queue_docs_limit_exceeded");
    }
  }

  return collected;
}

async function loadWindowSuggestionSessions(params: {
  windowStart: Timestamp;
  windowEnd: Timestamp;
}): Promise<SuggestionSession[]> {
  const collected: SuggestionSession[] = [];
  let cursor: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData> | null = null;

  while (collected.length < MAX_SUGGESTION_DOCS_PER_WINDOW) {
    let query = db
      .collection(SUGGESTIONS_COLLECTION)
      .where("createdAt", ">", params.windowStart)
      .where("createdAt", "<=", params.windowEnd)
      .orderBy("createdAt")
      .limit(WINDOW_READ_BATCH_SIZE);

    if (cursor) {
      query = query.startAfter(cursor);
    }

    const snap = await query.get();
    if (snap.empty) break;

    for (const docSnap of snap.docs) {
      const parsed = parseSuggestionSession(docSnap);
      if (parsed) collected.push(parsed);
      if (collected.length >= MAX_SUGGESTION_DOCS_PER_WINDOW) {
        cursor = docSnap;
        break;
      }
    }

    if (snap.docs.length < WINDOW_READ_BATCH_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }

  if (collected.length >= MAX_SUGGESTION_DOCS_PER_WINDOW && cursor) {
    const overflowSnap = await db
      .collection(SUGGESTIONS_COLLECTION)
      .where("createdAt", ">", params.windowStart)
      .where("createdAt", "<=", params.windowEnd)
      .orderBy("createdAt")
      .startAfter(cursor)
      .limit(1)
      .get();
    if (!overflowSnap.empty) {
      throw new Error("WINDOW_OVERFLOW:suggestion_docs_limit_exceeded");
    }
  }

  return collected;
}

function fieldIncrementsFromDelta(delta: AggregationDelta): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  for (const [mode, counts] of Object.entries(delta.modePerformance)) {
    for (const [metric, value] of Object.entries(counts)) {
      if (value <= 0) continue;
      updates[`modePerformance.${mode}.${metric}`] = FieldValue.increment(value);
    }
  }

  for (const [rank, counts] of Object.entries(delta.rankPerformance)) {
    for (const [metric, value] of Object.entries(counts)) {
      if (value <= 0) continue;
      updates[`rankPerformance.${rank}.${metric}`] = FieldValue.increment(value);
    }
  }

  return updates;
}

function resolveWindowEnd(invocationStart: Timestamp): Timestamp {
  return Timestamp.fromMillis(invocationStart.toMillis());
}

function resolveInvocationTimestamp(event: unknown): Timestamp {
  const scheduleTimeRaw =
    event && typeof event === "object" && "scheduleTime" in (event as Record<string, unknown>)
      ? (event as { scheduleTime?: unknown }).scheduleTime
      : null;
  const scheduleTime = toTimestamp(scheduleTimeRaw);
  if (scheduleTime) return scheduleTime;
  return Timestamp.now();
}

export async function runLibrarianAggregationWindow(params?: {
  invocationStart?: Timestamp;
}): Promise<{
  windowStart: Timestamp;
  windowEnd: Timestamp;
  anchorsProcessed: number;
  deltaSummary: AggregationDelta["totals"];
  checkpointAdvanced: boolean;
}> {
  const checkpointRef = db.collection(CHECKPOINT_COLLECTION).doc(CHECKPOINT_DOC_ID);
  const aggregateRef = db.collection(AGGREGATE_COLLECTION).doc(AGGREGATE_DOC_ID);

  const checkpointSnap = await checkpointRef.get();
  const lastProcessedAt = checkpointSnap.exists
    ? toTimestamp(checkpointSnap.get("lastProcessedAt"))
    : null;

  const windowStart = lastProcessedAt ?? Timestamp.fromMillis(0);
  const invocationStart = params?.invocationStart ?? Timestamp.now();
  const windowEnd = resolveWindowEnd(invocationStart);

  if (windowEnd.toMillis() <= windowStart.toMillis()) {
    logger.info("[INTELLIGENCE][AGGREGATION_WORKER][NOOP_WINDOW]", {
      windowStart: windowStart.toDate().toISOString(),
      windowEnd: windowEnd.toDate().toISOString(),
      anchorsProcessed: 0,
      deltaSummary: emptyDelta().totals,
      checkpointAdvanced: false,
    });
    return {
      windowStart,
      windowEnd,
      anchorsProcessed: 0,
      deltaSummary: emptyDelta().totals,
      checkpointAdvanced: false,
    };
  }

  const [queueEvents, suggestionSessions] = await Promise.all([
    loadWindowQueueEvents({ windowStart, windowEnd }),
    loadWindowSuggestionSessions({ windowStart, windowEnd }),
  ]);
  const anchors = buildAnchorsFromWindow({
    suggestionSessions,
    queueEvents,
  });
  const delta = computeAggregationDelta(anchors);
  const fieldIncrements = fieldIncrementsFromDelta(delta);

  await db.runTransaction(async (tx) => {
    const [aggregateSnap, checkpointSnapInTx] = await Promise.all([
      tx.get(aggregateRef),
      tx.get(checkpointRef),
    ]);
    void aggregateSnap;

    const checkpointStartInTx = checkpointSnapInTx.exists
      ? toTimestamp(checkpointSnapInTx.get("lastProcessedAt")) ?? Timestamp.fromMillis(0)
      : Timestamp.fromMillis(0);

    if (checkpointStartInTx.toMillis() !== windowStart.toMillis()) {
      throw new Error("CHECKPOINT_CONFLICT");
    }

    tx.set(
      aggregateRef,
      {
        ...fieldIncrements,
        aggregationVersion: AGGREGATION_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    tx.set(
      checkpointRef,
      {
        lastProcessedAt: windowEnd,
        aggregationVersion: AGGREGATION_VERSION,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  logger.info("[INTELLIGENCE][AGGREGATION_WORKER][SUCCESS]", {
    windowStart: windowStart.toDate().toISOString(),
    windowEnd: windowEnd.toDate().toISOString(),
    anchorsProcessed: anchors.length,
    deltaSummary: delta.totals,
    checkpointAdvanced: true,
  });

  return {
    windowStart,
    windowEnd,
    anchorsProcessed: anchors.length,
    deltaSummary: delta.totals,
    checkpointAdvanced: true,
  };
}

export const scheduledLibrarianAggregationWorker = onSchedule(
  {
    schedule: "every 60 minutes",
    timeZone: "UTC",
    memory: "512MiB",
    timeoutSeconds: 30,
  },
  async (event) => {
    const invocationStart = resolveInvocationTimestamp(event);
    try {
      await runLibrarianAggregationWindow({ invocationStart });
    } catch (error) {
      logger.error("[INTELLIGENCE][AGGREGATION_WORKER][FAILED]", {
        windowStart: "unknown",
        windowEnd: invocationStart.toDate().toISOString(),
        anchorsProcessed: 0,
        deltaSummary: null,
        checkpointAdvanced: false,
        error: String(error),
      });
      throw error;
    }
  }
);
