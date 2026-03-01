import { createHash } from "crypto";
import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { admin } from "../firebaseAdmin";
import {
  enqueueIntelligenceSignal,
  formatFailureReason,
  shouldDeadLetter,
  toBackoffTimestamp,
} from "./signalQueue";
import {
  INTELLIGENCE_EMBEDDING_VERSION,
  INTELLIGENCE_LOCK_TTL_MS,
  INTELLIGENCE_MAX_PROFILE_UPDATES_PER_UID_PER_MINUTE,
  INTELLIGENCE_MAX_SIGNALS_PER_BATCH,
  INTELLIGENCE_PRIVACY_TIER,
  INTELLIGENCE_QUEUE_TTL_DAYS,
  INTELLIGENCE_SCHEMA_VERSION,
  type IntelligenceSignalEnvelope,
  type IntelligenceSnapshot,
  type PersistedMetadata,
} from "./types";

const db = admin.firestore();

const LOCK_COLLECTION = "_intelligence_profile_locks";
const PROFILE_COLLECTION = "user_intelligence_profiles";
const QUEUE_COLLECTION = "intelligence_signal_queue";

const MAX_LIBRARY_BOOKS = 300;
const MAX_READING_PROGRESS_DOCS = 600;
const MAX_USER_REVIEWS = 300;
const MAX_TASTE_SHIFTS = 24;

function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function normalizeUid(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  if (!normalized) return "";
  return normalized.slice(0, 128);
}

function normalizeBucketLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 120);
}

function incrementCounter(target: Record<string, number>, key: string, amount = 1): void {
  target[key] = round((target[key] || 0) + amount);
}

function sortedEntries(source: Record<string, number>): Array<[string, number]> {
  return Object.entries(source)
    .filter(([, weight]) => Number.isFinite(weight) && weight > 0)
    .sort((a, b) => b[1] - a[1]);
}

function topMap(source: Record<string, number>, limit: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of sortedEntries(source).slice(0, Math.max(0, limit))) {
    out[key] = round(value);
  }
  return out;
}

function computeEntropy(distribution: Record<string, number>): number {
  const entries = sortedEntries(distribution);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0 || entries.length <= 1) return 0;

  let entropy = 0;
  for (const [, count] of entries) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }

  const maxEntropy = Math.log2(entries.length);
  if (maxEntropy <= 0) return 0;
  return round(clamp(entropy / maxEntropy));
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const kv = keys.map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
  return `{${kv.join(",")}}`;
}

function buildSourceHash(snapshot: Omit<IntelligenceSnapshot, "sourceHash">): string {
  return createHash("sha256").update(stableJson(snapshot)).digest("hex");
}

async function safeCount(queryRef: FirebaseFirestore.Query<DocumentData>): Promise<number> {
  try {
    const snap = await queryRef.count().get();
    return Math.max(0, Math.trunc(Number(snap.data().count || 0)));
  } catch {
    return 0;
  }
}

async function fetchLibraryFeatures(uid: string): Promise<{
  totalBooksRead: number;
  genreDistribution: Record<string, number>;
  authorDistribution: Record<string, number>;
  recentGenres: Record<string, number>;
  recentAuthors: Record<string, number>;
}> {
  const librarySnap = await db
    .collection("user_library_books")
    .where("uid", "==", uid)
    .orderBy("updatedAt", "desc")
    .limit(MAX_LIBRARY_BOOKS)
    .get();

  const totalBooksRead = librarySnap.size;
  if (librarySnap.empty) {
    return {
      totalBooksRead,
      genreDistribution: {},
      authorDistribution: {},
      recentGenres: {},
      recentAuthors: {},
    };
  }

  const bookIds = Array.from(
    new Set(
      librarySnap.docs
        .map((docSnap) => normalizeBucketLabel(docSnap.get("bookId"), ""))
        .filter((id) => id.length > 0)
    )
  );

  const chunks: string[][] = [];
  const CHUNK_SIZE = 30;
  for (let i = 0; i < bookIds.length; i += CHUNK_SIZE) {
    chunks.push(bookIds.slice(i, i + CHUNK_SIZE));
  }

  const booksById = new Map<string, Record<string, unknown>>();
  for (const chunk of chunks) {
    const snap = await db
      .collection("books")
      .where(FieldPath.documentId(), "in", chunk)
      .get();
    for (const docSnap of snap.docs) {
      booksById.set(docSnap.id, (docSnap.data() || {}) as Record<string, unknown>);
    }
  }

  const genreDistribution: Record<string, number> = {};
  const authorDistribution: Record<string, number> = {};
  const recentGenres: Record<string, number> = {};
  const recentAuthors: Record<string, number> = {};

  for (const [index, libraryDoc] of librarySnap.docs.entries()) {
    const bookId = normalizeBucketLabel(libraryDoc.get("bookId"), "");
    if (!bookId) continue;

    const source = booksById.get(bookId) || {};

    const author = normalizeBucketLabel(source.authorEn ?? source.author ?? source.authorId, "unknown_author");
    incrementCounter(authorDistribution, author, 1);

    const genresRaw = Array.isArray(source.genresEn)
      ? source.genresEn
      : Array.isArray(source.categories)
      ? source.categories
      : [];

    const normalizedGenres = genresRaw
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .slice(0, 4);

    if (normalizedGenres.length === 0) {
      incrementCounter(genreDistribution, "Uncategorized", 1);
      if (index < 40) {
        incrementCounter(recentGenres, "Uncategorized", 1);
      }
    } else {
      for (const genre of normalizedGenres) {
        incrementCounter(genreDistribution, genre, 1);
        if (index < 40) {
          incrementCounter(recentGenres, genre, 1);
        }
      }
    }

    if (index < 40) {
      incrementCounter(recentAuthors, author, 1);
    }
  }

  return {
    totalBooksRead,
    genreDistribution,
    authorDistribution,
    recentGenres: topMap(recentGenres, 8),
    recentAuthors: topMap(recentAuthors, 8),
  };
}

async function fetchReadingProgressFeatures(uid: string): Promise<{
  completionRate: number;
  readingVelocity: number;
}> {
  const [userIdSnap, legacyUidSnap] = await Promise.all([
    db.collection("reading_progress").where("userId", "==", uid).limit(MAX_READING_PROGRESS_DOCS).get(),
    db.collection("reading_progress").where("uid", "==", uid).limit(MAX_READING_PROGRESS_DOCS).get(),
  ]);

  const merged = new Map<string, Record<string, unknown>>();
  for (const docSnap of userIdSnap.docs) {
    merged.set(docSnap.id, docSnap.data() as Record<string, unknown>);
  }
  for (const docSnap of legacyUidSnap.docs) {
    if (!merged.has(docSnap.id)) {
      merged.set(docSnap.id, docSnap.data() as Record<string, unknown>);
    }
  }

  if (merged.size === 0) {
    return {
      completionRate: 0,
      readingVelocity: 0,
    };
  }

  let completed = 0;
  let updatedInLast30d = 0;
  const nowMs = Date.now();
  const windowMs = 30 * 24 * 60 * 60 * 1000;

  for (const row of merged.values()) {
    const status = normalizeBucketLabel(row.status_state, "reading").toLowerCase();
    const progress = Number(row.progress);
    if (status === "completed" || progress >= 0.999) {
      completed += 1;
    }

    const updatedAt = row.updatedAt as { toDate?: () => Date } | string | undefined;
    const updatedMs =
      typeof updatedAt === "string"
        ? Date.parse(updatedAt)
        : updatedAt && typeof updatedAt === "object" && typeof updatedAt.toDate === "function"
        ? updatedAt.toDate().getTime()
        : Number.NaN;

    if (Number.isFinite(updatedMs) && nowMs - updatedMs <= windowMs) {
      updatedInLast30d += 1;
    }
  }

  const completionRate = clamp(completed / Math.max(1, merged.size));
  const readingVelocity = round(updatedInLast30d / 30, 4);

  return {
    completionRate: round(completionRate),
    readingVelocity,
  };
}

async function fetchEngagementFeatures(uid: string, totalBooksRead: number): Promise<{
  socialEngagementIndex: number;
  quoteDensity: number;
  reviewFrequency: number;
}> {
  const [
    reviews,
    quotes,
    followers,
    following,
    likes,
    reposts,
    postBookmarks,
    quoteBookmarks,
  ] = await Promise.all([
    safeCount(db.collection("user_reviews").where("uid", "==", uid).where("domain", "==", "book")),
    safeCount(db.collection("users").doc(uid).collection("quotes")),
    safeCount(db.collection("users").doc(uid).collection("followers")),
    safeCount(db.collection("users").doc(uid).collection("following")),
    safeCount(db.collection("users").doc(uid).collection("likes")),
    safeCount(db.collection("users").doc(uid).collection("reposts")),
    safeCount(db.collection("users").doc(uid).collection("post_bookmarks")),
    safeCount(db.collection("users").doc(uid).collection("bookmarks")),
  ]);

  const quoteDensity = round(quotes / Math.max(1, totalBooksRead));
  const reviewFrequency = round(reviews / Math.max(1, totalBooksRead));

  const interactionBase = likes + reposts + postBookmarks + quoteBookmarks + followers + following;
  const authoringBase = reviews * 2 + quotes * 1.5;
  const denominator = Math.max(12, totalBooksRead * 4);

  return {
    socialEngagementIndex: round(clamp((interactionBase + authoringBase) / denominator)),
    quoteDensity,
    reviewFrequency,
  };
}

export async function computeIntelligenceSnapshot(uid: string): Promise<IntelligenceSnapshot> {
  const library = await fetchLibraryFeatures(uid);
  const reading = await fetchReadingProgressFeatures(uid);
  const engagement = await fetchEngagementFeatures(uid, library.totalBooksRead);

  const dominantGenre = sortedEntries(library.genreDistribution)[0]?.[0] || "";
  const entropyScore = computeEntropy(library.genreDistribution);

  const noveltyTolerance = round(clamp(0.4 + entropyScore * 0.6));
  const depthPreference = round(clamp(engagement.reviewFrequency));
  const abandonmentRate = round(clamp(1 - reading.completionRate));
  const deviationTolerance = round(
    clamp((noveltyTolerance * 0.55) + ((1 - abandonmentRate) * 0.45))
  );

  const explorationIndex = round(
    clamp((entropyScore * 0.6) + (noveltyTolerance * 0.4))
  );
  const completionConsistency = round(clamp(reading.completionRate));
  const culturalDepthIndex = round(
    clamp((depthPreference * 0.6) + (engagement.reviewFrequency * 0.4))
  );

  const partial: Omit<IntelligenceSnapshot, "sourceHash"> = {
    reading: {
      totalBooksRead: Math.max(0, Math.trunc(library.totalBooksRead)),
      completionRate: reading.completionRate,
      readingVelocity: reading.readingVelocity,
      recentGenres: library.recentGenres,
      recentAuthors: library.recentAuthors,
    },
    genres: {
      distribution: topMap(library.genreDistribution, 30),
      dominantGenre,
      entropyScore,
    },
    authors: {
      affinityScores: topMap(library.authorDistribution, 40),
    },
    behavior: {
      noveltyTolerance,
      deviationTolerance,
      depthPreference,
      abandonmentRate,
    },
    engagement,
    indices: {
      explorationIndex,
      completionConsistency,
      culturalDepthIndex,
    },
    history: {
      recentTrend: topMap(library.recentGenres, 6),
    },
  };

  return {
    ...partial,
    sourceHash: buildSourceHash(partial),
  };
}

async function acquireProfileLock(uid: string, owner: string): Promise<boolean> {
  const ref = db.collection(LOCK_COLLECTION).doc(uid);
  const now = Timestamp.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) {
      const expiresAt = snap.get("expiresAt") as Timestamp | undefined;
      if (expiresAt && expiresAt.toMillis() > now.toMillis()) {
        return false;
      }
    }

    tx.set(ref, {
      uid,
      owner,
      expiresAt: Timestamp.fromMillis(now.toMillis() + INTELLIGENCE_LOCK_TTL_MS),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return true;
  });
}

async function releaseProfileLock(uid: string, owner: string): Promise<void> {
  const ref = db.collection(LOCK_COLLECTION).doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const lockOwner = typeof snap.get("owner") === "string" ? String(snap.get("owner")) : "";
    if (lockOwner !== owner) return;
    tx.delete(ref);
  });
}

function profileRoot(uid: string) {
  return db.collection(PROFILE_COLLECTION).doc(uid);
}

function docRef(uid: string, subcollection: string) {
  return profileRoot(uid).collection(subcollection).doc("current");
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
    return null;
  }
  if (typeof value === "object") {
    const candidate = value as { toDate?: unknown };
    if (typeof candidate.toDate === "function") {
      const parsed = (candidate.toDate as () => Date)();
      if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
    }
  }
  return null;
}

async function persistSnapshot(params: {
  uid: string;
  snapshot: IntelligenceSnapshot;
  maxSignalCreatedAt: Timestamp;
  signalCount: number;
  reconciliationMode: boolean;
}): Promise<{ profileVersion: number; schemaVersion: number; updated: boolean }> {
  const { uid, snapshot, maxSignalCreatedAt, signalCount, reconciliationMode } = params;

  const metadataRef = docRef(uid, "metadata");
  const genresRef = docRef(uid, "genres");
  const historyRef = docRef(uid, "history");
  const embeddingsRef = docRef(uid, "embeddings");

  const [metadataSnap, genresSnap, historySnap, embeddingsSnap] = await Promise.all([
    metadataRef.get(),
    genresRef.get(),
    historyRef.get(),
    embeddingsRef.get(),
  ]);

  const existingMetadata = (metadataSnap.exists ? metadataSnap.data() : {}) as PersistedMetadata;
  const previousDominantGenre =
    genresSnap.exists && typeof genresSnap.get("dominantGenre") === "string"
      ? String(genresSnap.get("dominantGenre"))
      : "";

  const existingTasteShifts =
    historySnap.exists && Array.isArray(historySnap.get("tasteShifts"))
      ? (historySnap.get("tasteShifts") as Array<Record<string, unknown>>)
      : [];

  const existingProfileVersion =
    typeof existingMetadata.profileVersion === "number"
      ? Math.max(0, Math.trunc(existingMetadata.profileVersion))
      : 0;

  if (existingMetadata.sourceHash === snapshot.sourceHash) {
    if (reconciliationMode) {
      await metadataRef.set(
        {
          lastReconciledAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    return {
      profileVersion: existingProfileVersion,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      updated: false,
    };
  }

  const nextTasteShifts = [...existingTasteShifts];
  if (
    previousDominantGenre &&
    snapshot.genres.dominantGenre &&
    previousDominantGenre !== snapshot.genres.dominantGenre
  ) {
    nextTasteShifts.push({
      from: previousDominantGenre,
      to: snapshot.genres.dominantGenre,
      at: new Date().toISOString(),
    });
  }

  const trimmedTasteShifts = nextTasteShifts.slice(-MAX_TASTE_SHIFTS);

  const nowMs = Date.now();
  const minuteKey = Math.floor(nowMs / 60_000);

  let profileVersion = 0;
  let throttled = false;

  await db.runTransaction(async (tx) => {
    const txMetadataSnap = await tx.get(metadataRef);
    const txMetadata = (txMetadataSnap.exists ? txMetadataSnap.data() : {}) as PersistedMetadata;

    const rateLimiter = txMetadata.rateLimiter;
    const previousMinute =
      rateLimiter && typeof rateLimiter.minuteKey === "number"
        ? Math.trunc(rateLimiter.minuteKey)
        : -1;
    const previousCount =
      rateLimiter && typeof rateLimiter.count === "number"
        ? Math.max(0, Math.trunc(rateLimiter.count))
        : 0;

    const nextCount = previousMinute === minuteKey ? previousCount + 1 : 1;
    if (nextCount > INTELLIGENCE_MAX_PROFILE_UPDATES_PER_UID_PER_MINUTE) {
      throttled = true;
      return;
    }

    const previousProfileVersion =
      typeof txMetadata.profileVersion === "number"
        ? Math.max(0, Math.trunc(txMetadata.profileVersion))
        : 0;

    profileVersion = previousProfileVersion + 1;

    tx.set(
      metadataRef,
      {
        schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
        profileVersion,
        computedAt: FieldValue.serverTimestamp(),
        lastComputedSignalAt: maxSignalCreatedAt,
        lastSignalBatchSize: signalCount,
        privacyTier: INTELLIGENCE_PRIVACY_TIER,
        sourceHash: snapshot.sourceHash,
        ...(reconciliationMode
          ? { lastReconciledAt: FieldValue.serverTimestamp() }
          : {}),
        rateLimiter: {
          minuteKey,
          count: nextCount,
        },
      },
      { merge: true }
    );

    tx.set(
      profileRoot(uid),
      {
        uid,
        schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
        profileVersion,
        computedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        privacyTier: INTELLIGENCE_PRIVACY_TIER,
      },
      { merge: true }
    );
  });

  if (throttled || profileVersion <= 0) {
    throw new Error("INTELLIGENCE_PROFILE_THROTTLED");
  }

  const embeddingVectorRef =
    embeddingsSnap.exists && typeof embeddingsSnap.get("vectorRef") === "string"
      ? String(embeddingsSnap.get("vectorRef"))
      : null;

  const batch = db.batch();
  batch.set(
    docRef(uid, "reading"),
    {
      ...snapshot.reading,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      profileVersion,
      computedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    docRef(uid, "genres"),
    {
      ...snapshot.genres,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      profileVersion,
      computedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    docRef(uid, "authors"),
    {
      ...snapshot.authors,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      profileVersion,
      computedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    docRef(uid, "behavior"),
    {
      ...snapshot.behavior,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      profileVersion,
      computedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    docRef(uid, "engagement"),
    {
      ...snapshot.engagement,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      profileVersion,
      computedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    docRef(uid, "indices"),
    {
      ...snapshot.indices,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      profileVersion,
      computedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    docRef(uid, "history"),
    {
      tasteShifts: trimmedTasteShifts,
      recentTrend: snapshot.history.recentTrend,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      profileVersion,
      computedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  batch.set(
    docRef(uid, "embeddings"),
    {
      embeddingVersion: INTELLIGENCE_EMBEDDING_VERSION,
      vectorRef: embeddingVectorRef,
      sourceHash: snapshot.sourceHash,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      profileVersion,
      computedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await batch.commit();

  const wasUpdated = existingMetadata.sourceHash !== snapshot.sourceHash;

  return {
    profileVersion,
    schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
    updated: wasUpdated,
  };
}

type QueueSignal = {
  id: string;
  ref: FirebaseFirestore.DocumentReference<DocumentData>;
  uid: string;
  signalType: string;
  signalFamily: string;
  payload: Record<string, unknown>;
  createdAt: Timestamp;
  retryCount: number;
};

function parseQueueSignal(docSnap: QueryDocumentSnapshot<DocumentData>): QueueSignal | null {
  const uid = normalizeUid(docSnap.get("uid"));
  if (!uid) return null;

  const createdAt = docSnap.get("createdAt") as Timestamp | undefined;
  if (!(createdAt instanceof Timestamp)) return null;

  const signalType = normalizeBucketLabel(docSnap.get("signalType"), "unknown_signal").toLowerCase();
  const signalFamily = normalizeBucketLabel(docSnap.get("signalFamily"), "behavior").toLowerCase();

  const payloadRaw = docSnap.get("payload");
  const payload =
    payloadRaw && typeof payloadRaw === "object" && !Array.isArray(payloadRaw)
      ? (payloadRaw as Record<string, unknown>)
      : {};

  const retryCountRaw = Number(docSnap.get("retryCount"));

  return {
    id: docSnap.id,
    ref: docSnap.ref,
    uid,
    signalType,
    signalFamily,
    payload,
    createdAt,
    retryCount:
      Number.isFinite(retryCountRaw) && retryCountRaw >= 0
        ? Math.trunc(retryCountRaw)
        : 0,
  };
}

async function markSignalsProcessed(signals: QueueSignal[], profileVersion: number): Promise<void> {
  if (signals.length === 0) return;

  const chunks: QueueSignal[][] = [];
  for (let i = 0; i < signals.length; i += 400) {
    chunks.push(signals.slice(i, i + 400));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const signal of chunk) {
      batch.set(
        signal.ref,
        {
          processed: true,
          processedAt: FieldValue.serverTimestamp(),
          profileVersion,
          failed: false,
          failedReason: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
  }
}

async function markSignalsFailed(signals: QueueSignal[], error: unknown): Promise<void> {
  if (signals.length === 0) return;

  const reason = formatFailureReason(error);
  const now = Timestamp.now();

  const chunks: QueueSignal[][] = [];
  for (let i = 0; i < signals.length; i += 400) {
    chunks.push(signals.slice(i, i + 400));
  }

  for (const chunk of chunks) {
    const batch = db.batch();
    for (const signal of chunk) {
      const nextRetryCount = signal.retryCount + 1;
      if (shouldDeadLetter(nextRetryCount)) {
        batch.set(
          signal.ref,
          {
            processed: true,
            failed: true,
            failedReason: reason,
            retryCount: nextRetryCount,
            failedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        batch.set(
          signal.ref,
          {
            processed: false,
            failed: false,
            failedReason: reason,
            retryCount: nextRetryCount,
            nextAttemptAt: toBackoffTimestamp(now, nextRetryCount),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
    await batch.commit();
  }
}

async function postponeSignals(signals: QueueSignal[], seconds: number): Promise<void> {
  if (signals.length === 0) return;
  const now = Timestamp.now();
  const nextAttemptAt = Timestamp.fromMillis(now.toMillis() + Math.max(1, seconds) * 1000);

  const batch = db.batch();
  for (const signal of signals) {
    batch.set(
      signal.ref,
      {
        nextAttemptAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

function metricLog(params: Record<string, unknown>): void {
  logger.info("[INTELLIGENCE][METRIC]", params);
}

export async function rebuildUserIntelligenceProfile(params: {
  uid: string;
  signals: QueueSignal[];
  reconciliationMode?: boolean;
}): Promise<{ profileVersion: number; schemaVersion: number; updated: boolean; sourceHash: string }> {
  const uid = normalizeUid(params.uid);
  if (!uid) {
    throw new Error("INVALID_UID");
  }

  const snapshot = await computeIntelligenceSnapshot(uid);
  const maxSignalCreatedAt = params.signals.reduce(
    (max, signal) =>
      signal.createdAt.toMillis() > max.toMillis() ? signal.createdAt : max,
    Timestamp.now()
  );

  const persisted = await persistSnapshot({
    uid,
    snapshot,
    maxSignalCreatedAt,
    signalCount: params.signals.length,
    reconciliationMode: params.reconciliationMode === true,
  });

  return {
    ...persisted,
    sourceHash: snapshot.sourceHash,
  };
}

export async function processIntelligenceSignalBatch(source: "queue" | "schedule"): Promise<void> {
  const now = Timestamp.now();
  const snap = await db
    .collection(QUEUE_COLLECTION)
    .where("processed", "==", false)
    .where("nextAttemptAt", "<=", now)
    .orderBy("nextAttemptAt", "asc")
    .limit(INTELLIGENCE_MAX_SIGNALS_PER_BATCH)
    .get();

  if (snap.empty) {
    return;
  }

  const parsedSignals = snap.docs
    .map((docSnap) => parseQueueSignal(docSnap))
    .filter((item): item is QueueSignal => item !== null);

  if (parsedSignals.length === 0) {
    return;
  }

  const grouped = new Map<string, QueueSignal[]>();
  for (const signal of parsedSignals) {
    if (!grouped.has(signal.uid)) grouped.set(signal.uid, []);
    grouped.get(signal.uid)!.push(signal);
  }

  const batchSizes = Array.from(grouped.values()).map((signals) => signals.length);

  metricLog({
    metric: "batch_size_distribution",
    source,
    signalCount: parsedSignals.length,
    uniqueUids: grouped.size,
    batchSizes,
  });

  for (const [uid, signals] of grouped.entries()) {
    const owner = `${source}_${Date.now()}_${uid}`;
    const acquired = await acquireProfileLock(uid, owner);

    if (!acquired) {
      await postponeSignals(signals, 10);
      continue;
    }

    const startedAt = Date.now();

    try {
      const result = await rebuildUserIntelligenceProfile({
        uid,
        signals,
        reconciliationMode: false,
      });

      await markSignalsProcessed(signals, result.profileVersion);

      const latencyMs = Date.now() - startedAt;

      metricLog({
        metric: "signals_processed_count",
        uid,
        source,
        value: signals.length,
        profileVersion: result.profileVersion,
        schemaVersion: result.schemaVersion,
      });

      metricLog({
        metric: "profile_updates_count",
        uid,
        source,
        value: 1,
        updated: result.updated,
        profileVersion: result.profileVersion,
        schemaVersion: result.schemaVersion,
      });

      metricLog({
        metric: "profile_update_latency",
        uid,
        source,
        value: latencyMs,
        profileVersion: result.profileVersion,
        schemaVersion: result.schemaVersion,
      });
    } catch (error) {
      const errorMessage = String(error);
      if (errorMessage.includes("INTELLIGENCE_PROFILE_THROTTLED")) {
        await postponeSignals(signals, 20);
      } else {
        await markSignalsFailed(signals, error);
      }
      logger.error("[INTELLIGENCE][BATCH][UID_FAILED]", {
        uid,
        source,
        signalCount: signals.length,
        error: errorMessage,
      });
    } finally {
      await releaseProfileLock(uid, owner);
    }
  }
}

export const onIntelligenceSignalQueued = onDocumentCreated(
  "intelligence_signal_queue/{signalId}",
  async () => {
    await processIntelligenceSignalBatch("queue");
  }
);

export const scheduledIntelligenceProfileBuilder = onSchedule(
  {
    schedule: "* * * * *",
    timeZone: "UTC",
    memory: "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    await processIntelligenceSignalBatch("schedule");
  }
);

export const scheduledIntelligenceQueueCleanup = onSchedule(
  {
    schedule: "13 */6 * * *",
    timeZone: "UTC",
    memory: "256MiB",
    timeoutSeconds: 300,
  },
  async () => {
    const cutoff = Timestamp.fromMillis(Date.now() - INTELLIGENCE_QUEUE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const processedSnap = await db
      .collection(QUEUE_COLLECTION)
      .where("processed", "==", true)
      .where("processedAt", "<", cutoff)
      .limit(300)
      .get();

    if (processedSnap.empty) {
      return;
    }

    const batch = db.batch();
    for (const docSnap of processedSnap.docs) {
      batch.delete(docSnap.ref);
    }
    await batch.commit();

    metricLog({
      metric: "queue_cleanup_deleted",
      value: processedSnap.size,
      cutoff: cutoff.toDate().toISOString(),
    });
  }
);

export async function emitIntelligenceSignalSafe(params: {
  uid: string;
  signalType: string;
  signalFamily: IntelligenceSignalEnvelope["signalFamily"];
  payload?: Record<string, unknown>;
  sourceEventId?: string | null;
  sourcePath?: string | null;
  }): Promise<void> {
  try {
    await enqueueIntelligenceSignal(params);
  } catch (error) {
    logger.error("[INTELLIGENCE][SIGNAL_EMIT_FAILED]", {
      uid: params.uid,
      signalType: params.signalType,
      signalFamily: params.signalFamily,
      sourceEventId: params.sourceEventId ?? null,
      error: String(error),
    });
    throw error;
  }
}

export async function readProfileSourceHash(uid: string): Promise<string | null> {
  const metadataSnap = await docRef(uid, "metadata").get();
  if (!metadataSnap.exists) return null;
  const sourceHash = metadataSnap.get("sourceHash");
  return typeof sourceHash === "string" ? sourceHash : null;
}

export async function ensureIntelligenceProfileExists(uid: string): Promise<void> {
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) return;

  const rootRef = profileRoot(normalizedUid);
  const rootSnap = await rootRef.get();
  if (rootSnap.exists) return;

  await rootRef.set(
    {
      uid: normalizedUid,
      schemaVersion: INTELLIGENCE_SCHEMA_VERSION,
      profileVersion: 0,
      privacyTier: INTELLIGENCE_PRIVACY_TIER,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await emitIntelligenceSignalSafe({
    uid: normalizedUid,
    signalType: "profile_bootstrap",
    signalFamily: "behavior",
    payload: { bootstrap: true },
    sourcePath: `${PROFILE_COLLECTION}/${normalizedUid}`,
  });
}

export function timestampToIso(value: unknown): string | null {
  return toIso(value);
}
