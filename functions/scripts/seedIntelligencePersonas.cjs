#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const DAY_MS = 24 * 60 * 60 * 1000;
const RUN_TAG = "intelligence_persona_seed_v1";
const DEFAULT_TIMEOUT_SECONDS = 300;
const POLL_INTERVAL_MS = 5000;

const PERSONAS = [
  {
    personaId: "classic_depth_reader",
    uid: "test_depth_reader_001",
    booksCount: 40,
    reviewsCount: 12,
    quotesCount: 25,
    completionRateTarget: 0.9,
    expected: {
      low_entropy: true,
      high_completionConsistency: true,
      high_culturalDepthIndex: true,
      moderate_explorationIndex: false,
    },
  },
  {
    personaId: "genre_explorer",
    uid: "test_explorer_001",
    booksCount: 25,
    reviewsCount: 3,
    quotesCount: 5,
    completionRateTarget: 0.6,
    expected: {
      high_entropy: true,
      high_explorationIndex: true,
      moderate_completionConsistency: true,
      low_culturalDepthIndex: true,
    },
  },
  {
    personaId: "casual_reader",
    uid: "test_casual_reader_001",
    booksCount: 10,
    reviewsCount: 0,
    quotesCount: 0,
    completionRateTarget: 0.3,
    expected: {
      low_entropy: true,
      low_completionConsistency: true,
      low_culturalDepthIndex: true,
      low_explorationIndex: true,
    },
  },
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const withoutPrefix = token.slice(2);
    if (!withoutPrefix) continue;
    if (withoutPrefix.includes("=")) {
      const [k, ...rest] = withoutPrefix.split("=");
      args[k] = rest.join("=");
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[withoutPrefix] = next;
      i += 1;
      continue;
    }
    args[withoutPrefix] = "true";
  }
  return args;
}

function asBool(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function asInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.trunc(parsed));
}

function hashSeed(input) {
  const text = String(input);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function createRng(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pickDeterministic(items, count, used, rng) {
  const pool = items.filter((item) => !used.has(item.id));
  const out = [];
  const copy = [...pool];
  while (copy.length > 0 && out.length < count) {
    const idx = Math.floor(rng() * copy.length);
    const next = copy[idx];
    copy.splice(idx, 1);
    if (used.has(next.id)) continue;
    used.add(next.id);
    out.push(next);
  }
  return out;
}

function uniqueById(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function toIso(value) {
  if (value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

function timestampDaysAgo(daysAgo, extraSeconds = 0) {
  return admin.firestore.Timestamp.fromDate(
    new Date(Date.now() - (daysAgo * DAY_MS + extraSeconds * 1000))
  );
}

function normalizeGenreName(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 80);
}

function logJson(label, payload) {
  console.log(`${label} ${JSON.stringify(payload)}`);
}

function loadServiceAccount(args) {
  const explicit = args["service-account"]
    ? path.resolve(process.cwd(), args["service-account"])
    : null;
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : null;
  const repoDefault = path.resolve(__dirname, "../../scripts/serviceAccountKey.json");

  const candidates = [explicit, fromEnv, repoDefault].filter(Boolean);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const raw = fs.readFileSync(candidate, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      continue;
    }
    return {
      path: candidate,
      credentials: {
        projectId: parsed.project_id,
        clientEmail: parsed.client_email,
        privateKey: String(parsed.private_key).replace(/\\n/g, "\n"),
      },
    };
  }
  return null;
}

function initializeAdmin(args) {
  if (admin.apps.length > 0) return;
  const account = loadServiceAccount(args);
  if (account) {
    const projectId = args["project-id"]
      ? String(args["project-id"]).trim()
      : account.credentials.projectId;
    admin.initializeApp({
      credential: admin.credential.cert(account.credentials),
      projectId,
    });
    logJson("[PERSONA_SEED][ADMIN_INIT]", {
      mode: "service_account",
      serviceAccountPath: account.path,
      projectId,
    });
    return;
  }
  admin.initializeApp();
  logJson("[PERSONA_SEED][ADMIN_INIT]", { mode: "application_default" });
}

async function loadBookCatalog(db) {
  const snap = await db.collection("books").get();
  const books = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const title = String(data.titleEn || data.title || "").trim();
    const genresRaw = Array.isArray(data.genresEn)
      ? data.genresEn
      : Array.isArray(data.categories)
      ? data.categories
      : [];
    const genres = uniqueById(
      genresRaw
        .filter((v) => typeof v === "string")
        .map((v) => ({ id: normalizeGenreName(v), value: normalizeGenreName(v) }))
        .filter((g) => g.value.length > 0)
    ).map((g) => g.value);
    books.push({
      id: doc.id,
      title,
      genres,
    });
  }
  return books;
}

function buildGenrePools(catalog) {
  const pools = new Map();
  for (const book of catalog) {
    for (const genre of book.genres) {
      if (!pools.has(genre)) pools.set(genre, []);
      pools.get(genre).push(book);
    }
  }
  for (const [genre, books] of pools.entries()) {
    books.sort((a, b) => a.id.localeCompare(b.id));
    pools.set(genre, uniqueById(books));
  }
  return pools;
}

function getPool(genrePools, genre) {
  return genrePools.get(genre) || [];
}

function fillWithFallback(catalog, current, target, used, rng) {
  if (current.length >= target) return current.slice(0, target);
  const withGenres = catalog.filter((book) => book.genres.length > 0 && !used.has(book.id));
  const fallback = pickDeterministic(withGenres, target - current.length, used, rng);
  return current.concat(fallback).slice(0, target);
}

function selectClassicDepthBooks(catalog, genrePools, rng) {
  const used = new Set();
  const out = [];
  const classicsProxyPool = uniqueById(
    getPool(genrePools, "Literary Fiction").concat(getPool(genrePools, "History"))
  );
  out.push(...pickDeterministic(classicsProxyPool, 28, used, rng));
  out.push(...pickDeterministic(getPool(genrePools, "Philosophy"), 8, used, rng));
  out.push(...pickDeterministic(getPool(genrePools, "Literary Fiction"), 4, used, rng));
  return fillWithFallback(catalog, out, 40, used, rng);
}

function selectGenreExplorerBooks(catalog, genrePools, rng) {
  const used = new Set();
  const out = [];
  const candidateGenres = [
    "Fantasy",
    "Mystery",
    "Sci-Fi",
    "Poetry",
    "Psychology",
    "Memoir",
    "Business",
    "Travel",
    "Biography",
    "History",
    "Philosophy",
    "Literary Fiction",
  ].filter((genre) => getPool(genrePools, genre).length > 0);

  const selectedGenres = candidateGenres.slice(0, Math.max(8, Math.min(10, candidateGenres.length)));
  const cursors = new Map(selectedGenres.map((genre) => [genre, 0]));
  while (out.length < 25) {
    let progressed = false;
    for (const genre of selectedGenres) {
      const pool = getPool(genrePools, genre);
      let cursor = cursors.get(genre) || 0;
      while (cursor < pool.length && used.has(pool[cursor].id)) {
        cursor += 1;
      }
      if (cursor < pool.length) {
        const book = pool[cursor];
        used.add(book.id);
        out.push(book);
        cursor += 1;
        progressed = true;
      }
      cursors.set(genre, cursor);
      if (out.length >= 25) break;
    }
    if (!progressed) break;
  }
  return fillWithFallback(catalog, out, 25, used, rng);
}

function selectCasualBooks(catalog, genrePools, rng) {
  const used = new Set();
  const out = [];
  const primary = getPool(genrePools, "Mystery").length > 0 ? "Mystery" : "Fantasy";
  const secondary = primary === "Mystery" ? "Fantasy" : "Mystery";
  out.push(...pickDeterministic(getPool(genrePools, primary), 6, used, rng));
  out.push(...pickDeterministic(getPool(genrePools, secondary), 4, used, rng));
  return fillWithFallback(catalog, out, 10, used, rng);
}

function selectBooksForPersona(persona, catalog, genrePools, seed) {
  const rng = createRng(`${seed}:${persona.uid}:${persona.personaId}`);
  if (persona.personaId === "classic_depth_reader") {
    return selectClassicDepthBooks(catalog, genrePools, rng);
  }
  if (persona.personaId === "genre_explorer") {
    return selectGenreExplorerBooks(catalog, genrePools, rng);
  }
  return selectCasualBooks(catalog, genrePools, rng);
}

function buildReadingProgressSpecs(params) {
  const { uid, books, completionRateTarget, seed, forceSignalUpdate } = params;
  const rng = createRng(`${seed}:${uid}:reading_progress`);
  const completedTarget = Math.round(books.length * completionRateTarget);
  const out = [];
  for (let i = 0; i < books.length; i += 1) {
    const book = books[i];
    const completed = i < completedTarget;
    const day = 1 + Math.floor(rng() * 60);
    const sec = Math.floor(rng() * 86399);
    const updatedAt = timestampDaysAgo(day, sec);
    const createdAt = timestampDaysAgo(Math.min(60, day + 2), sec);
    out.push({
      id: `${uid}_${book.id}`,
      bookId: book.id,
      data: {
        uid,
        userId: uid,
        bookId: book.id,
        progress: completed ? 1 : Number((0.08 + rng() * 0.82).toFixed(4)),
        status_state: completed ? "completed" : "reading",
        createdAt,
        updatedAt,
        source: RUN_TAG,
      },
      forceUpdate: forceSignalUpdate && i === 0,
    });
  }
  return out;
}

function buildReviewSpecs(params) {
  const { uid, books, reviewsCount, seed } = params;
  const rng = createRng(`${seed}:${uid}:reviews`);
  const out = [];
  const targetBooks = books.slice(0, Math.min(reviewsCount, books.length));
  for (let i = 0; i < targetBooks.length; i += 1) {
    const book = targetBooks[i];
    const day = 1 + Math.floor(rng() * 60);
    const sec = Math.floor(rng() * 86399);
    const createdAt = timestampDaysAgo(day, sec);
    const updatedAt = timestampDaysAgo(Math.max(1, day - 1), sec);
    const rating = 3 + (i % 3);
    out.push({
      id: `${uid}_review_${String(i + 1).padStart(3, "0")}`,
      bookId: book.id,
      data: {
        userId: uid,
        uid,
        rating,
        visibility: "public",
        text: `[${RUN_TAG}] ${uid} review ${i + 1} for ${book.title || book.id}`,
        authorName: uid,
        authorHandle: `@${uid.slice(0, 24)}`,
        authorAvatar: "",
        createdAt,
        updatedAt,
      },
    });
  }
  return out;
}

function buildQuoteSpecs(params) {
  const { uid, quotesCount, seed } = params;
  const rng = createRng(`${seed}:${uid}:quotes`);
  const out = [];
  for (let i = 0; i < quotesCount; i += 1) {
    const day = 1 + Math.floor(rng() * 60);
    const sec = Math.floor(rng() * 86399);
    const createdAt = timestampDaysAgo(day, sec);
    out.push({
      id: `${uid}_quote_${String(i + 1).padStart(3, "0")}`,
      data: {
        id: `${uid}_quote_${String(i + 1).padStart(3, "0")}`,
        textEn: `[${RUN_TAG}] quote ${i + 1} by ${uid}`,
        textAr: "",
        createdAt,
        updatedAt: createdAt,
      },
    });
  }
  return out;
}

async function ensureAuthUsers(auth, personas, dryRun) {
  const created = [];
  const existing = [];
  for (const persona of personas) {
    const uid = persona.uid;
    try {
      await auth.getUser(uid);
      existing.push(uid);
    } catch (error) {
      const code = error && error.code ? String(error.code) : "";
      if (!code.includes("user-not-found")) throw error;
      if (!dryRun) {
        await auth.createUser({
          uid,
          email: `${uid}@booktown.test`,
          emailVerified: true,
          displayName: persona.personaId,
          disabled: false,
        });
      }
      created.push(uid);
    }
  }
  return { created, existing };
}

async function ensureUserDocuments(db, personas, dryRun) {
  const created = [];
  const updated = [];
  for (const persona of personas) {
    const ref = db.collection("users").doc(persona.uid);
    const snap = await ref.get();
    if (!snap.exists) {
      created.push(persona.uid);
    } else {
      updated.push(persona.uid);
    }
    if (dryRun) continue;
    await ref.set(
      {
        uid: persona.uid,
        name: persona.personaId,
        handle: `@${persona.uid.slice(0, 24)}`,
        status: "active",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        seedTag: RUN_TAG,
      },
      { merge: true }
    );
  }
  return { created, updated };
}

async function upsertShelf(db, uid, books, dryRun) {
  const shelfDocId = `${uid}_persona_main`;
  const shelfRef = db.collection("shelves").doc(shelfDocId);
  const entries = {};
  for (let i = 0; i < books.length; i += 1) {
    entries[books[i].id] = {
      rank: i + 1,
      source: RUN_TAG,
    };
  }
  const payload = {
    id: "persona_main",
    ownerId: uid,
    isVirtual: false,
    titleEn: "Persona Main Shelf",
    titleAr: "رف الشخصية",
    entries,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    seedTag: RUN_TAG,
  };

  const before = await shelfRef.get();
  let changed = false;
  if (!before.exists) {
    changed = true;
  } else {
    const existingEntries = before.get("entries") || {};
    const currentKeys = Object.keys(existingEntries).sort();
    const nextKeys = Object.keys(entries).sort();
    changed = JSON.stringify(currentKeys) !== JSON.stringify(nextKeys);
  }

  if (!dryRun && changed) {
    await shelfRef.set(payload, { merge: true });
  }
  return { changed, shelfDocId, entryCount: books.length };
}

async function writeMissingReadingProgress(db, uid, readingSpecs, dryRun) {
  const refs = readingSpecs.map((spec) => db.collection("reading_progress").doc(spec.id));
  const existingSnaps = await db.getAll(...refs);
  const existingMap = new Map(existingSnaps.map((snap) => [snap.id, snap]));

  let created = 0;
  let forcedUpdates = 0;
  const batch = db.batch();
  for (const spec of readingSpecs) {
    const ref = db.collection("reading_progress").doc(spec.id);
    const exists = existingMap.get(spec.id)?.exists === true;
    if (!exists) {
      created += 1;
      if (!dryRun) batch.set(ref, spec.data, { merge: true });
      continue;
    }
    if (spec.forceUpdate) {
      forcedUpdates += 1;
      if (!dryRun) {
        batch.set(
          ref,
          {
            ...spec.data,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }
  if (!dryRun) {
    await batch.commit();
  }
  return { created, forcedUpdates };
}

async function writeReviews(db, uid, reviewSpecs, dryRun) {
  let writes = 0;
  const batch = db.batch();
  for (const spec of reviewSpecs) {
    const ref = db.collection("books").doc(spec.bookId).collection("reviews").doc(spec.id);
    writes += 1;
    if (dryRun) continue;
    batch.set(ref, spec.data, { merge: true });
  }
  if (!dryRun) {
    await batch.commit();
  }
  return { writes };
}

async function writeMissingQuotes(db, uid, quoteSpecs, dryRun) {
  const refs = quoteSpecs.map((spec) => db.collection("users").doc(uid).collection("quotes").doc(spec.id));
  if (refs.length === 0) return { created: 0 };
  const existingSnaps = await db.getAll(...refs);
  const existingMap = new Map(existingSnaps.map((snap) => [snap.id, snap]));
  let created = 0;
  const batch = db.batch();
  for (const spec of quoteSpecs) {
    const exists = existingMap.get(spec.id)?.exists === true;
    if (exists) continue;
    created += 1;
    if (!dryRun) {
      const ref = db.collection("users").doc(uid).collection("quotes").doc(spec.id);
      batch.set(ref, spec.data, { merge: true });
    }
  }
  if (!dryRun && created > 0) {
    await batch.commit();
  }
  return { created };
}

async function queueStatsForUid(db, uid, startedAtMs) {
  const snap = await db
    .collection("intelligence_signal_queue")
    .where("uid", "==", uid)
    .limit(2000)
    .get();

  let total = 0;
  let unprocessed = 0;
  let processed = 0;
  let failed = 0;
  let retries = 0;
  const byFamily = {};
  for (const doc of snap.docs) {
    const createdAt = doc.get("createdAt");
    const createdMs =
      createdAt && typeof createdAt.toMillis === "function"
        ? createdAt.toMillis()
        : Number.NaN;
    if (Number.isFinite(createdMs) && createdMs < startedAtMs) {
      continue;
    }
    total += 1;
    const family =
      typeof doc.get("signalFamily") === "string"
        ? String(doc.get("signalFamily"))
        : "unknown";
    byFamily[family] = (byFamily[family] || 0) + 1;

    const isProcessed = doc.get("processed") === true;
    const isFailed = doc.get("failed") === true;
    const retryCountRaw = Number(doc.get("retryCount"));
    if (Number.isFinite(retryCountRaw) && retryCountRaw > 0) retries += 1;
    if (isProcessed) processed += 1;
    if (!isProcessed) unprocessed += 1;
    if (isFailed) failed += 1;
  }

  return { uid, total, processed, unprocessed, failed, retries, byFamily };
}

async function waitForQueueSettlement(db, uids, startedAtMs, timeoutSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const stats = [];
    for (const uid of uids) {
      // Sequential on purpose to avoid burst query pressure against one index.
      // eslint-disable-next-line no-await-in-loop
      const uidStats = await queueStatsForUid(db, uid, startedAtMs);
      stats.push(uidStats);
    }
    const unprocessedTotal = stats.reduce((sum, row) => sum + row.unprocessed, 0);
    if (unprocessedTotal === 0) {
      return { settled: true, stats };
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  const finalStats = [];
  for (const uid of uids) {
    // eslint-disable-next-line no-await-in-loop
    finalStats.push(await queueStatsForUid(db, uid, startedAtMs));
  }
  return { settled: false, stats: finalStats };
}

async function profileSnapshot(db, uid) {
  const root = db.collection("user_intelligence_profiles").doc(uid);
  const [metadata, genres, indices] = await Promise.all([
    root.collection("metadata").doc("current").get(),
    root.collection("genres").doc("current").get(),
    root.collection("indices").doc("current").get(),
  ]);

  if (!metadata.exists) {
    return null;
  }
  return {
    uid,
    profileVersion: Number(metadata.get("profileVersion") || 0),
    schemaVersion: Number(metadata.get("schemaVersion") || 0),
    sourceHash: typeof metadata.get("sourceHash") === "string" ? metadata.get("sourceHash") : null,
    computedAt: toIso(metadata.get("computedAt")),
    dominantGenre: typeof genres.get("dominantGenre") === "string" ? genres.get("dominantGenre") : "",
    entropyScore: Number(genres.get("entropyScore") || 0),
    explorationIndex: Number(indices.get("explorationIndex") || 0),
    completionConsistency: Number(indices.get("completionConsistency") || 0),
    culturalDepthIndex: Number(indices.get("culturalDepthIndex") || 0),
  };
}

function validatePersonaOutcomes(persona, snapshot, dominantGenreAllowlist) {
  if (!snapshot) {
    return [`${persona.uid}: missing profile snapshot`];
  }
  const errors = [];
  const thresholds = {
    lowEntropyMax: 0.45,
    highEntropyMin: 0.65,
    highCompletionMin: 0.75,
    moderateCompletionMin: 0.45,
    moderateCompletionMax: 0.75,
    lowCompletionMax: 0.45,
    highCulturalDepthMin: 0.55,
    lowCulturalDepthMax: 0.30,
    highExplorationMin: 0.65,
    lowExplorationMax: 0.45,
    moderateExplorationMaxForDepth: 0.50,
  };

  const e = snapshot.entropyScore;
  const cc = snapshot.completionConsistency;
  const cd = snapshot.culturalDepthIndex;
  const ex = snapshot.explorationIndex;

  if (persona.expected.low_entropy === true && !(e <= thresholds.lowEntropyMax)) {
    errors.push(`${persona.uid}: expected low entropy, got ${e.toFixed(4)}`);
  }
  if (persona.expected.high_entropy === true && !(e >= thresholds.highEntropyMin)) {
    errors.push(`${persona.uid}: expected high entropy, got ${e.toFixed(4)}`);
  }
  if (persona.expected.high_completionConsistency === true && !(cc >= thresholds.highCompletionMin)) {
    errors.push(`${persona.uid}: expected high completionConsistency, got ${cc.toFixed(4)}`);
  }
  if (
    persona.expected.moderate_completionConsistency === true &&
    !(cc >= thresholds.moderateCompletionMin && cc <= thresholds.moderateCompletionMax)
  ) {
    errors.push(`${persona.uid}: expected moderate completionConsistency, got ${cc.toFixed(4)}`);
  }
  if (persona.expected.low_completionConsistency === true && !(cc <= thresholds.lowCompletionMax)) {
    errors.push(`${persona.uid}: expected low completionConsistency, got ${cc.toFixed(4)}`);
  }
  if (persona.expected.high_culturalDepthIndex === true && !(cd >= thresholds.highCulturalDepthMin)) {
    errors.push(`${persona.uid}: expected high culturalDepthIndex, got ${cd.toFixed(4)}`);
  }
  if (persona.expected.low_culturalDepthIndex === true && !(cd <= thresholds.lowCulturalDepthMax)) {
    errors.push(`${persona.uid}: expected low culturalDepthIndex, got ${cd.toFixed(4)}`);
  }
  if (persona.expected.high_explorationIndex === true && !(ex >= thresholds.highExplorationMin)) {
    errors.push(`${persona.uid}: expected high explorationIndex, got ${ex.toFixed(4)}`);
  }
  if (persona.expected.low_explorationIndex === true && !(ex <= thresholds.lowExplorationMax)) {
    errors.push(`${persona.uid}: expected low explorationIndex, got ${ex.toFixed(4)}`);
  }
  if (
    persona.expected.moderate_explorationIndex === false &&
    !(ex <= thresholds.moderateExplorationMaxForDepth)
  ) {
    errors.push(`${persona.uid}: expected non-moderate exploration (low), got ${ex.toFixed(4)}`);
  }

  if (
    dominantGenreAllowlist.length > 0 &&
    !dominantGenreAllowlist.includes(snapshot.dominantGenre)
  ) {
    errors.push(
      `${persona.uid}: dominantGenre "${snapshot.dominantGenre}" not in expected set ${JSON.stringify(dominantGenreAllowlist)}`
    );
  }

  return errors;
}

async function runSecurityValidation(args) {
  const apiBaseUrl = args["api-base-url"] ? String(args["api-base-url"]).trim() : "";
  const idToken = args["id-token"] ? String(args["id-token"]).trim() : "";
  if (!apiBaseUrl || !idToken) {
    return {
      status: "SKIPPED",
      reason: "Provide --api-base-url and --id-token to run HTTP auth checks.",
    };
  }

  const endpoint = `${apiBaseUrl.replace(/\/+$/, "")}/api/ai/chat`;
  const body = {
    model: "gemini-2.5-flash",
    messages: [{ role: "user", content: "security check" }],
  };

  const noTokenRes = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const validRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const spoofRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      "x-booktown-uid": "spoof_attempt_uid_999",
    },
    body: JSON.stringify(body),
  });

  const validJson = await validRes.json().catch(() => ({}));
  const spoofJson = await spoofRes.json().catch(() => ({}));

  return {
    status: "OK",
    checks: {
      noTokenMustFail: noTokenRes.status === 401,
      validTokenMustSucceed: validRes.status === 200,
      spoofHeaderIgnored: validRes.status === 200 && spoofRes.status === 200 && JSON.stringify(validJson) === JSON.stringify(spoofJson),
    },
    responses: {
      noTokenStatus: noTokenRes.status,
      validStatus: validRes.status,
      spoofStatus: spoofRes.status,
    },
  };
}

async function ensureProjectionPresence(db, uid) {
  const [librarySnap, progressSnap, reviewsSnap, quotesSnap] = await Promise.all([
    db.collection("user_library_books").where("uid", "==", uid).limit(1).get(),
    db.collection("reading_progress").where("uid", "==", uid).limit(1).get(),
    db.collection("user_reviews").where("uid", "==", uid).limit(1).get(),
    db.collection("users").doc(uid).collection("quotes").limit(1).get(),
  ]);
  return {
    userLibraryBooksPresent: !librarySnap.empty,
    readingProgressPresent: !progressSnap.empty,
    userReviewsPresent: !reviewsSnap.empty,
    quotesPresent: !quotesSnap.empty,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = asBool(args["dry-run"], false);
  const runStress = asBool(args.stress, true);
  const runReplayCheck = asBool(args["replay-check"], true);
  const runSecurity = asBool(args["security-check"], true);
  const timeoutSeconds = asInt(args["timeout-seconds"], DEFAULT_TIMEOUT_SECONDS);
  const seed = String(args.seed || "booktown_intelligence_personas_v1");

  const confirm = String(args.confirm || "").trim().toUpperCase();
  if (!dryRun && confirm !== "SEED_INTELLIGENCE") {
    throw new Error("Refusing to run without --confirm=SEED_INTELLIGENCE (or use --dry-run=true).");
  }

  initializeAdmin(args);
  const db = admin.firestore();
  const auth = admin.auth();

  const runStartedAtMs = Date.now();

  logJson("[PERSONA_SEED][START]", {
    dryRun,
    runStress,
    runReplayCheck,
    runSecurity,
    timeoutSeconds,
    seed,
    personas: PERSONAS.map((p) => p.uid),
  });

  const catalog = await loadBookCatalog(db);
  if (catalog.length < 180) {
    throw new Error(`Insufficient books in canonical catalog for persona + stress test. Found=${catalog.length}`);
  }
  const genrePools = buildGenrePools(catalog);

  const personaPlans = [];
  for (const persona of PERSONAS) {
    const books = selectBooksForPersona(persona, catalog, genrePools, seed);
    if (books.length !== persona.booksCount) {
      throw new Error(`${persona.uid}: expected ${persona.booksCount} books, got ${books.length}`);
    }
    const readingSpecs = buildReadingProgressSpecs({
      uid: persona.uid,
      books,
      completionRateTarget: persona.completionRateTarget,
      seed,
      forceSignalUpdate: true,
    });
    const reviewSpecs = buildReviewSpecs({
      uid: persona.uid,
      books,
      reviewsCount: persona.reviewsCount,
      seed,
    });
    const quoteSpecs = buildQuoteSpecs({
      uid: persona.uid,
      quotesCount: persona.quotesCount,
      seed,
    });
    personaPlans.push({
      persona,
      books,
      readingSpecs,
      reviewSpecs,
      quoteSpecs,
    });
  }

  logJson("[PERSONA_SEED][PLAN]", {
    catalogBooks: catalog.length,
    personas: personaPlans.map((plan) => ({
      uid: plan.persona.uid,
      booksCount: plan.books.length,
      reviewsCount: plan.reviewSpecs.length,
      quotesCount: plan.quoteSpecs.length,
      topGenres: Object.entries(
        plan.books.reduce((acc, book) => {
          for (const genre of book.genres.slice(0, 2)) {
            acc[genre] = (acc[genre] || 0) + 1;
          }
          return acc;
        }, {})
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4),
    })),
  });

  const beforeProfiles = {};
  for (const plan of personaPlans) {
    // eslint-disable-next-line no-await-in-loop
    beforeProfiles[plan.persona.uid] = await profileSnapshot(db, plan.persona.uid);
  }

  const authResult = dryRun
    ? { created: [], existing: [], skipped: true }
    : await ensureAuthUsers(auth, PERSONAS, dryRun);
  const usersResult = dryRun
    ? { created: [], updated: [], skipped: true }
    : await ensureUserDocuments(db, PERSONAS, dryRun);

  const writeSummary = {
    auth: authResult,
    users: usersResult,
    shelves: [],
    readingProgress: [],
    reviews: [],
    quotes: [],
  };

  for (const plan of personaPlans) {
    // eslint-disable-next-line no-await-in-loop
    const shelfResult = await upsertShelf(db, plan.persona.uid, plan.books, dryRun);
    writeSummary.shelves.push({ uid: plan.persona.uid, ...shelfResult });

    // eslint-disable-next-line no-await-in-loop
    const readingResult = await writeMissingReadingProgress(
      db,
      plan.persona.uid,
      plan.readingSpecs,
      dryRun
    );
    writeSummary.readingProgress.push({ uid: plan.persona.uid, ...readingResult });

    // eslint-disable-next-line no-await-in-loop
    const reviewResult = await writeReviews(db, plan.persona.uid, plan.reviewSpecs, dryRun);
    writeSummary.reviews.push({ uid: plan.persona.uid, ...reviewResult });

    // eslint-disable-next-line no-await-in-loop
    const quoteResult = await writeMissingQuotes(db, plan.persona.uid, plan.quoteSpecs, dryRun);
    writeSummary.quotes.push({ uid: plan.persona.uid, ...quoteResult });
  }

  logJson("[PERSONA_SEED][WRITES]", writeSummary);

  if (dryRun) {
    logJson("[PERSONA_SEED][DRY_RUN_DONE]", { status: "SKIPPED_RUNTIME_VALIDATION" });
    return;
  }

  const queueWait = await waitForQueueSettlement(
    db,
    PERSONAS.map((p) => p.uid),
    runStartedAtMs,
    timeoutSeconds
  );
  logJson("[PERSONA_SEED][QUEUE_BASE]", queueWait);
  if (!queueWait.settled) {
    throw new Error("Queue did not settle within timeout for base persona run.");
  }

  const projectionPresence = {};
  for (const persona of PERSONAS) {
    // eslint-disable-next-line no-await-in-loop
    projectionPresence[persona.uid] = await ensureProjectionPresence(db, persona.uid);
  }

  const afterProfiles = {};
  for (const persona of PERSONAS) {
    // eslint-disable-next-line no-await-in-loop
    afterProfiles[persona.uid] = await profileSnapshot(db, persona.uid);
  }

  const outcomeErrors = [];
  for (const plan of personaPlans) {
    const uid = plan.persona.uid;
    const expectedDominant = (() => {
      if (plan.persona.personaId === "classic_depth_reader") {
        return ["Literary Fiction", "History", "Philosophy"];
      }
      if (plan.persona.personaId === "genre_explorer") {
        const topGenres = Object.entries(
          plan.books.reduce((acc, book) => {
            for (const genre of book.genres.slice(0, 2)) {
              acc[genre] = (acc[genre] || 0) + 1;
            }
            return acc;
          }, {})
        )
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([genre]) => genre);
        return topGenres;
      }
      return ["Mystery", "Fantasy"];
    })();

    outcomeErrors.push(
      ...validatePersonaOutcomes(
        plan.persona,
        afterProfiles[uid],
        expectedDominant
      )
    );
  }

  if (runReplayCheck) {
    const replayStartedAtMs = Date.now();
    for (const plan of personaPlans) {
      if (plan.reviewSpecs.length === 0) continue;
      const spec = plan.reviewSpecs[0];
      const ref = db
        .collection("books")
        .doc(spec.bookId)
        .collection("reviews")
        .doc(spec.id);
      // Force a trigger event without changing semantic aggregates.
      // eslint-disable-next-line no-await-in-loop
      await ref.set(
        {
          ...spec.data,
          replayNoopAt: admin.firestore.FieldValue.serverTimestamp(),
          seedTag: RUN_TAG,
        },
        { merge: true }
      );
    }

    const replayQueueWait = await waitForQueueSettlement(
      db,
      PERSONAS.map((p) => p.uid),
      replayStartedAtMs,
      timeoutSeconds
    );
    logJson("[PERSONA_SEED][QUEUE_REPLAY]", replayQueueWait);
    if (!replayQueueWait.settled) {
      throw new Error("Queue did not settle during replay check.");
    }

    for (const persona of PERSONAS) {
      // eslint-disable-next-line no-await-in-loop
      const replayProfile = await profileSnapshot(db, persona.uid);
      const baseProfile = afterProfiles[persona.uid];
      if (!replayProfile || !baseProfile) continue;
      if (
        replayProfile.sourceHash &&
        baseProfile.sourceHash &&
        replayProfile.sourceHash === baseProfile.sourceHash &&
        replayProfile.profileVersion !== baseProfile.profileVersion
      ) {
        outcomeErrors.push(
          `${persona.uid}: profileVersion changed on replay without sourceHash change (${baseProfile.profileVersion} -> ${replayProfile.profileVersion})`
        );
      }
    }
  }

  let stressSummary = { status: "SKIPPED" };
  if (runStress) {
    const stressPersona = personaPlans.find((plan) => plan.persona.personaId === "genre_explorer");
    if (!stressPersona) {
      throw new Error("Missing stress persona plan.");
    }

    const usedBookIds = new Set(stressPersona.books.map((book) => book.id));
    const extraBooks = catalog
      .filter((book) => !usedBookIds.has(book.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 100);
    if (extraBooks.length < 100) {
      throw new Error(`Cannot run stress test: expected 100 extra books, got ${extraBooks.length}`);
    }

    const stressStartedAtMs = Date.now();
    const stressBatch = db.batch();
    for (const book of extraBooks) {
      const ref = db
        .collection("reading_progress")
        .doc(`${stressPersona.persona.uid}_stress_${book.id}`);
      stressBatch.set(
        ref,
        {
          uid: stressPersona.persona.uid,
          userId: stressPersona.persona.uid,
          bookId: book.id,
          progress: 0.2,
          status_state: "reading",
          createdAt: timestampDaysAgo(2),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: `${RUN_TAG}_stress`,
        },
        { merge: true }
      );
    }
    await stressBatch.commit();
    const stressWriteElapsedMs = Date.now() - stressStartedAtMs;

    const stressQueueWait = await waitForQueueSettlement(
      db,
      [stressPersona.persona.uid],
      stressStartedAtMs,
      timeoutSeconds
    );
    if (!stressQueueWait.settled) {
      throw new Error("Stress queue did not settle within timeout.");
    }
    const stressStats = stressQueueWait.stats[0];
    stressSummary = {
      status: "OK",
      uid: stressPersona.persona.uid,
      writeElapsedMs: stressWriteElapsedMs,
      addedEntries: 100,
      queue: stressStats,
      within60Seconds: stressWriteElapsedMs <= 60_000,
      noDeadLetters: stressStats.failed === 0,
    };
  }

  let securitySummary = { status: "SKIPPED", reason: "disabled" };
  if (runSecurity) {
    securitySummary = await runSecurityValidation(args);
  }

  const queueFailedCount = queueWait.stats.reduce((sum, row) => sum + row.failed, 0);
  if (queueFailedCount > 0) {
    outcomeErrors.push(`dead-letter failures detected in base run: ${queueFailedCount}`);
  }
  for (const persona of PERSONAS) {
    const projection = projectionPresence[persona.uid];
    if (!projection.userLibraryBooksPresent) {
      outcomeErrors.push(`${persona.uid}: missing user_library_books projection`);
    }
    if (!projection.readingProgressPresent) {
      outcomeErrors.push(`${persona.uid}: missing reading_progress docs`);
    }
    if (!projection.userReviewsPresent && persona.reviewsCount > 0) {
      outcomeErrors.push(`${persona.uid}: missing user_reviews projection`);
    }
    if (!projection.quotesPresent && persona.quotesCount > 0) {
      outcomeErrors.push(`${persona.uid}: missing users/{uid}/quotes docs`);
    }
  }

  const entropyComparison = PERSONAS.map((persona) => ({
    uid: persona.uid,
    entropyScore: afterProfiles[persona.uid]?.entropyScore ?? null,
    explorationIndex: afterProfiles[persona.uid]?.explorationIndex ?? null,
    dominantGenre: afterProfiles[persona.uid]?.dominantGenre ?? null,
    profileVersionBefore: beforeProfiles[persona.uid]?.profileVersion ?? null,
    profileVersionAfter: afterProfiles[persona.uid]?.profileVersion ?? null,
  }));

  const result = {
    status: outcomeErrors.length === 0 ? "PASS" : "FAIL",
    runTag: RUN_TAG,
    writeSummary,
    queue: queueWait,
    projectionPresence,
    profiles: entropyComparison,
    stress: stressSummary,
    security: securitySummary,
    errors: outcomeErrors,
  };

  logJson("[PERSONA_SEED][RESULT]", result);

  if (outcomeErrors.length > 0) {
    throw new Error(`Validation failed with ${outcomeErrors.length} issue(s).`);
  }
}

run().catch((error) => {
  logJson("[PERSONA_SEED][FATAL]", { error: String(error) });
  process.exit(1);
});
