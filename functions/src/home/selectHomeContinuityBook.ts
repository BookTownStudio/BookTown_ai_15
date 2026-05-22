import * as logger from "firebase-functions/logger";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { buildCatalogBookView, isPublicReadableBook } from "../catalog/catalogBookView";
import { resolveBookToEbookAttachment } from "../attachments/resolveBookToEbookAttachment";
import { canUserReadBook } from "../rights/bookRights";
import { selectContinuityStarter } from "./continuityStarterPool";

const db = admin.firestore();
const CANDIDATE_LIMIT = 120;
const PROFILE_LIMIT = 40;
const RECENT_SURFACE_LIMIT = 48;

type Mode = "surprise" | "starter";

type ReaderProfile = {
  bookIds: Set<string>;
  recentSurfaceIds: Set<string>;
  authors: Set<string>;
  forms: Set<string>;
  traditions: Set<string>;
  languages: Set<string>;
  dominantLanguage: string;
  dominantTradition: string;
};

function asString(value: unknown, maxLen = 300): string {
  return typeof value === "string" ? value.trim().slice(0, maxLen) : "";
}

function asNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry, 120))
    .filter((entry) => entry.length > 0);
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function increment(map: Map<string, number>, key: string): void {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  map.set(normalized, (map.get(normalized) ?? 0) + 1);
}

function topKey(map: Map<string, number>): string {
  return Array.from(map.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "";
}

function bookDimensions(data: Record<string, unknown>) {
  return {
    author: normalizeKey(
      asString(data.authorEn) || asString(data.author) || asString(data.primaryAuthorName)
    ),
    form: normalizeKey(
      asString(data.form) || asString(data.literaryForm) || readStringArray(data.forms)[0] || ""
    ),
    tradition: normalizeKey(
      asString(data.canonicalTradition) || asString(data.tradition) || readStringArray(data.traditions)[0] || ""
    ),
    language: normalizeKey(asString(data.language, 12)),
  };
}

function deterministicIndex(seed: string, size: number): number {
  if (size <= 1) return 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % size;
}

function daySeed(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readReaderProfile(uid: string): Promise<ReaderProfile> {
  const bookIds = new Set<string>();
  const recentSurfaceIds = new Set<string>();
  const authorCounts = new Map<string, number>();
  const formCounts = new Map<string, number>();
  const traditionCounts = new Map<string, number>();
  const languageCounts = new Map<string, number>();

  const [progressSnap, recentHomeSnap, recentSurpriseSnap] = await Promise.all([
    db
      .collection("reading_progress")
      .where("uid", "==", uid)
      .orderBy("lastActiveAt", "desc")
      .limit(PROFILE_LIMIT)
      .get()
      .catch(() => null),
    db
      .collection("home_surface_impressions")
      .where("uid", "==", uid)
      .orderBy("surfacedAt", "desc")
      .limit(RECENT_SURFACE_LIMIT)
      .get()
      .catch(() => null),
    db
      .collection("home_surprise_selections")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(RECENT_SURFACE_LIMIT)
      .get()
      .catch(() => null),
  ]);

  progressSnap?.docs.forEach((doc) => {
    const bookId = asString(doc.get("bookId"), 180);
    if (bookId) bookIds.add(bookId);
  });
  recentHomeSnap?.docs.forEach((doc) => {
    const bookId = asString(doc.get("bookId"), 180);
    if (bookId) recentSurfaceIds.add(bookId);
  });
  recentSurpriseSnap?.docs.forEach((doc) => {
    const bookId = asString(doc.get("bookId"), 180);
    if (bookId) recentSurfaceIds.add(bookId);
  });

  const ids = Array.from(bookIds).slice(0, 30);
  if (ids.length > 0) {
    const snaps = await db.getAll(...ids.map((id) => db.collection("books").doc(id)));
    snaps.forEach((snap) => {
      if (!snap.exists) return;
      const dims = bookDimensions((snap.data() ?? {}) as Record<string, unknown>);
      increment(authorCounts, dims.author);
      increment(formCounts, dims.form);
      increment(traditionCounts, dims.tradition);
      increment(languageCounts, dims.language);
    });
  }

  return {
    bookIds,
    recentSurfaceIds,
    authors: new Set(authorCounts.keys()),
    forms: new Set(formCounts.keys()),
    traditions: new Set(traditionCounts.keys()),
    languages: new Set(languageCounts.keys()),
    dominantLanguage: topKey(languageCounts),
    dominantTradition: topKey(traditionCounts),
  };
}

function scoreCandidate(params: {
  data: Record<string, unknown>;
  profile: ReaderProfile;
  mode: Mode;
}): number {
  const { data, profile, mode } = params;
  const dims = bookDimensions(data);
  const title = normalizeKey(asString(data.titleEn) || asString(data.title));
  const author = normalizeKey(asString(data.authorEn) || asString(data.author));
  const rating = Math.max(0, asNumber(data.rating));
  const ratingVolume = Math.log1p(Math.max(0, asNumber(data.ratingsCount ?? data.reviewsCount)));
  const canonicalDepth =
    (dims.tradition ? 0.9 : 0) +
    (dims.form ? 0.35 : 0) +
    (asString(data.canonicalType) ? 0.25 : 0) +
    (readStringArray(data.literaryRelationships).length > 0 ? 0.15 : 0);
  const languageCoherence =
    !profile.dominantLanguage || !dims.language || dims.language === profile.dominantLanguage ? 0.35 : -0.3;

  if (mode === "starter") {
    const starterMatch =
      title.includes("the prophet") && (author.includes("gibran") || author.includes("jibran"));
    return (
      (starterMatch ? 100 : 0) +
      canonicalDepth +
      rating * 0.24 +
      Math.min(1.2, ratingVolume * 0.14) +
      languageCoherence
    );
  }

  const outsideAffinity =
    (dims.author && !profile.authors.has(dims.author) ? 1.1 : 0) +
    (dims.tradition && !profile.traditions.has(dims.tradition) ? 1.3 : 0) +
    (dims.form && !profile.forms.has(dims.form) ? 0.55 : 0);
  const strongAffinityPenalty =
    (dims.author && profile.authors.has(dims.author) ? 2.4 : 0) +
    (dims.tradition && profile.dominantTradition && dims.tradition === profile.dominantTradition ? 1.8 : 0);

  return (
    canonicalDepth +
    outsideAffinity +
    rating * 0.28 +
    Math.min(1.4, ratingVolume * 0.16) +
    languageCoherence -
    strongAffinityPenalty
  );
}

async function selectBook(uid: string, mode: Mode) {
  const profile = await readReaderProfile(uid);
  const snap = await db.collection("books").orderBy("rating", "desc").limit(CANDIDATE_LIMIT).get();

  const strictCandidates: Array<{
    id: string;
    data: Record<string, unknown>;
    score: number;
  }> = [];
  const relaxedCandidates: Array<{
    id: string;
    data: Record<string, unknown>;
    score: number;
  }> = [];

  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    if (!isPublicReadableBook(data) || !canUserReadBook(data, uid)) continue;
    if (profile.bookIds.has(doc.id)) continue;
    const attachment = await resolveBookToEbookAttachment(doc.id).catch(() => null);
    if (!attachment?.storagePath) continue;

    const dims = bookDimensions(data);
    const score = scoreCandidate({ data, profile, mode });
    const candidate = { id: doc.id, data, score };
    relaxedCandidates.push(candidate);

    if (profile.recentSurfaceIds.has(doc.id)) continue;
    if (
      mode === "surprise" &&
      ((dims.author && profile.authors.has(dims.author)) ||
        (dims.tradition && profile.dominantTradition && dims.tradition === profile.dominantTradition))
    ) {
      continue;
    }
    strictCandidates.push(candidate);
  }

  const candidates = (strictCandidates.length > 0 ? strictCandidates : relaxedCandidates)
    .sort((left, right) => right.score - left.score)
    .slice(0, mode === "starter" ? 1 : 12);

  if (candidates.length === 0) {
    throw new HttpsError("unavailable", "No readable continuity book is available.");
  }

  const selected =
    mode === "starter"
      ? candidates[0]
      : candidates[deterministicIndex(`${uid}:${mode}:${daySeed()}`, candidates.length)];

  await db.collection("home_surprise_selections").add({
    uid,
    mode,
    bookId: selected.id,
    authority: "server_literary_serendipity_v1",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }).catch((error) => {
    logger.warn("[HOME][CONTINUITY_SELECTION_LOG_FAILED]", {
      uid,
      mode,
      bookId: selected.id,
      error: String(error),
    });
  });

  logger.info("[HOME][CONTINUITY_BOOK_SELECTED]", {
    uid,
    mode,
    bookId: selected.id,
    authority: "server_literary_serendipity_v1",
  });

  return buildCatalogBookView(selected.id, selected.data);
}

export const selectHomeContinuityBook = onCall({ cors: true }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }

  const mode = request.data?.mode === "starter" ? "starter" : "surprise";
  if (mode === "starter") {
    return selectContinuityStarter(uid);
  }
  return selectBook(uid, mode);
});
