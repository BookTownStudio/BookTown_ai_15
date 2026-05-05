import { createHash } from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import {
  buildSearchFieldsFromTextParts,
  extractHashtags,
  normalizeSearchText,
  tokenizeSearchText,
} from "../search/normalization";

const db = admin.firestore();

const SEARCH_RANKING_VERSION = "social_v1" as const;
const MAX_QUERY_LENGTH = 64;
const MAX_LIMIT = 20;
const MAX_CANDIDATES = 220;
const MAX_BLOCKED_LOOKUP = 800;
const MAX_FOLLOWING_LOOKUP = 1000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS_PER_WINDOW = 45;
const EMAIL_LIKE_QUERY_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

type SearchType = "users" | "posts" | "topics";

type CursorPayload = {
  v: 1;
  signature: string;
  usersOffset: number;
  postsOffset: number;
  topicsOffset: number;
};

type SocialSearchResponse = {
  rankingVersion: typeof SEARCH_RANKING_VERSION;
  queryHash: string;
  users: SocialSearchUser[];
  posts: SocialSearchPost[];
  topics: SocialSearchTopic[];
  nextCursor?: string;
  hasMore: boolean;
};

type SocialSearchUser = {
  uid: string;
  name: string;
  handle: string;
  avatarUrl: string;
  bannerUrl: string;
  bioEn: string;
  bioAr: string;
  joinDate: string;
  updatedAt: string;
  followers: number;
  following: number;
  score: number;
  rankReasons: string[];
};

type SocialSearchTopic = {
  topic: string;
  postCount: number;
  score: number;
};

type SocialSearchPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  content: {
    text: string | null;
    attachments: Array<{
      attachmentId: string;
      type: string;
      role: string;
      renderHint: string;
    }>;
  };
  visibility: "public";
  status: "published";
  counters: {
    likes: number;
    comments: number;
    reposts: number;
    bookmarks: number;
  };
  timestamps: {
    createdAt: string;
    updatedAt: string | null;
    publishedAt: string | null;
    deletedAt?: string | null;
  };
  flags: {
    edited: boolean;
    hasAttachments: boolean;
  };
  score: number;
  rankReasons: string[];
};

type UserCandidate = {
  uid: string;
  name: string;
  handle: string;
  avatarUrl: string;
  bannerUrl: string;
  bioEn: string;
  bioAr: string;
  joinDateIso: string;
  updatedAtIso: string;
  updatedAtMs: number;
  followers: number;
  following: number;
  nameNormalized: string;
  handleNormalized: string;
  bioNormalized: string;
};

type RankedUser = UserCandidate & {
  score: number;
  rankReasons: string[];
};

type PostCandidate = {
  postId: string;
  authorId: string;
  authorNameNormalized: string;
  authorHandleNormalized: string;
  textNormalized: string;
  hashtags: string[];
  createdAtMs: number;
  createdAtIso: string;
  likesCount: number;
  commentsCount: number;
  repostsCount: number;
  bookmarksCount: number;
};

type RankedPost = PostCandidate & {
  score: number;
  rankReasons: string[];
};

function toIsoString(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const parsed = (value as { toDate: () => Date }).toDate();
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return new Date(0).toISOString();
}

function toTimestampMs(value: unknown): number {
  const iso = toIsoString(value);
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    return 0;
  }
  return parsed;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  return 0;
}

function uniqueSearchTypes(raw: unknown): SearchType[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return ["users", "posts", "topics"];
  }

  const dedup = new Set<SearchType>();
  for (const entry of raw) {
    if (entry === "users" || entry === "posts" || entry === "topics") {
      dedup.add(entry);
    }
  }

  if (dedup.size === 0) {
    return ["users", "posts", "topics"];
  }

  return Array.from(dedup.values());
}

function hashSha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isEmailLikeQuery(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (EMAIL_LIKE_QUERY_REGEX.test(trimmed)) {
    return true;
  }

  const atIndex = trimmed.indexOf("@");
  if (atIndex <= 0 || atIndex !== trimmed.lastIndexOf("@")) {
    return false;
  }

  const domain = trimmed.slice(atIndex + 1);
  return (
    domain.includes(".") &&
    !domain.startsWith(".") &&
    !domain.endsWith(".")
  );
}

function parseCursor(rawCursor: unknown, signature: string): CursorPayload {
  if (typeof rawCursor !== "string" || rawCursor.trim().length === 0) {
    return {
      v: 1,
      signature,
      usersOffset: 0,
      postsOffset: 0,
      topicsOffset: 0,
    };
  }

  try {
    const decoded = Buffer.from(rawCursor, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<CursorPayload>;
    if (
      parsed.v !== 1 ||
      parsed.signature !== signature ||
      typeof parsed.usersOffset !== "number" ||
      typeof parsed.postsOffset !== "number" ||
      typeof parsed.topicsOffset !== "number"
    ) {
      throw new Error("invalid_cursor");
    }

    if (
      parsed.usersOffset < 0 ||
      parsed.postsOffset < 0 ||
      parsed.topicsOffset < 0
    ) {
      throw new Error("invalid_cursor");
    }

    return {
      v: 1,
      signature,
      usersOffset: Math.trunc(parsed.usersOffset),
      postsOffset: Math.trunc(parsed.postsOffset),
      topicsOffset: Math.trunc(parsed.topicsOffset),
    };
  } catch {
    throw new HttpsError("invalid-argument", "Invalid search cursor.");
  }
}

function encodeCursor(cursor: CursorPayload): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function chunked<T>(values: readonly T[], chunkSize: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    output.push(values.slice(i, i + chunkSize));
  }
  return output;
}

async function enforceSearchRateLimit(uid: string): Promise<void> {
  const nowMs = Date.now();
  const windowStartMs = nowMs - (nowMs % RATE_LIMIT_WINDOW_MS);
  const windowEndMs = windowStartMs + RATE_LIMIT_WINDOW_MS;
  const rateRef = db
    .collection("users")
    .doc(uid)
    .collection("meta")
    .doc(`social_search_rate_${windowStartMs}`);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(rateRef);
    const count =
      snap.exists &&
      typeof snap.get("count") === "number" &&
      Number.isFinite(snap.get("count") as number)
        ? Math.max(0, Math.trunc(snap.get("count") as number))
        : 0;

    if (count >= RATE_LIMIT_REQUESTS_PER_WINDOW) {
      throw new HttpsError(
        "resource-exhausted",
        "Search rate limit exceeded. Please retry shortly."
      );
    }

    transaction.set(
      rateRef,
      {
        uid,
        count: count + 1,
        limit: RATE_LIMIT_REQUESTS_PER_WINDOW,
        windowStartMs,
        windowEndMs,
        expiresAt: admin.firestore.Timestamp.fromMillis(windowStartMs + 2 * 60 * 1000),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );
  });
}

async function loadViewerBlockSet(uid: string): Promise<Set<string>> {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("blocks")
    .limit(MAX_BLOCKED_LOOKUP)
    .get();

  const blocked = new Set<string>();
  for (const docSnap of snap.docs) {
    blocked.add(docSnap.id);
  }
  return blocked;
}

async function loadFollowingSet(uid: string): Promise<Set<string>> {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("following")
    .limit(MAX_FOLLOWING_LOOKUP)
    .get();

  const following = new Set<string>();
  for (const docSnap of snap.docs) {
    following.add(docSnap.id);
    const data = (docSnap.data() || {}) as Record<string, unknown>;
    if (typeof data.targetUid === "string" && data.targetUid.trim()) {
      following.add(data.targetUid.trim());
    }
  }
  return following;
}

async function loadUsersWhoBlockedViewer(
  viewerUid: string,
  candidateUids: readonly string[]
): Promise<Set<string>> {
  const unique = Array.from(
    new Set(candidateUids.filter((uid) => typeof uid === "string" && uid.trim()))
  ).slice(0, MAX_BLOCKED_LOOKUP);

  if (unique.length === 0) {
    return new Set<string>();
  }

  const blockedViewer = new Set<string>();
  for (const batch of chunked(unique, 200)) {
    const refs = batch.map((uid) =>
      db.collection("users").doc(uid).collection("blocks").doc(viewerUid)
    );
    const snaps = await db.getAll(...refs);
    for (let i = 0; i < snaps.length; i += 1) {
      if (snaps[i].exists) {
        blockedViewer.add(batch[i]);
      }
    }
  }

  return blockedViewer;
}

async function queryUserCandidates(
  leadToken: string,
  maxCandidates: number
): Promise<UserCandidate[]> {
  const byPrefixSnap = await db
    .collection("public_profiles")
    .where("searchPrefixes", "array-contains", leadToken)
    .limit(maxCandidates)
    .get();

  const docs = byPrefixSnap.docs;
  if (docs.length === 0) {
    const fallbackSnap = await db
      .collection("public_profiles")
      .orderBy("updatedAt", "desc")
      .limit(maxCandidates)
      .get();
    return fallbackSnap.docs.map((docSnap) => {
      const data = (docSnap.data() || {}) as Record<string, unknown>;
      const name = typeof data.name === "string" ? data.name.trim() : "";
      const handle = typeof data.handle === "string" ? data.handle.trim() : "";
      const bioEn = typeof data.bioEn === "string" ? data.bioEn.trim() : "";
      const bioAr = typeof data.bioAr === "string" ? data.bioAr.trim() : "";
      const normalized = buildSearchFieldsFromTextParts([name, handle, bioEn, bioAr]);
      const updatedAtIso = toIsoString(data.updatedAt);

      return {
        uid: docSnap.id,
        name: name || "New User",
        handle: handle || `@${docSnap.id.slice(0, 12)}`,
        avatarUrl:
          typeof data.avatarUrl === "string" && data.avatarUrl.trim()
            ? data.avatarUrl.trim()
            : `https://api.dicebear.com/8.x/lorelei/svg?seed=${docSnap.id}`,
        bannerUrl: typeof data.bannerUrl === "string" ? data.bannerUrl.trim() : "",
        bioEn,
        bioAr,
        joinDateIso: toIsoString(data.joinDate),
        updatedAtIso,
        updatedAtMs: toTimestampMs(updatedAtIso),
        followers: toNonNegativeInt(data.followers ?? data.followerCount),
        following: toNonNegativeInt(data.following ?? data.followingCount),
        nameNormalized: normalizeSearchText(name),
        handleNormalized: normalizeSearchText(handle),
        bioNormalized: normalized.normalizedText,
      };
    });
  }

  return docs.map((docSnap) => {
    const data = (docSnap.data() || {}) as Record<string, unknown>;
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const handle = typeof data.handle === "string" ? data.handle.trim() : "";
    const bioEn = typeof data.bioEn === "string" ? data.bioEn.trim() : "";
    const bioAr = typeof data.bioAr === "string" ? data.bioAr.trim() : "";
    const normalized = buildSearchFieldsFromTextParts([name, handle, bioEn, bioAr]);
    const updatedAtIso = toIsoString(data.updatedAt);

    return {
      uid: docSnap.id,
      name: name || "New User",
      handle: handle || `@${docSnap.id.slice(0, 12)}`,
      avatarUrl:
        typeof data.avatarUrl === "string" && data.avatarUrl.trim()
          ? data.avatarUrl.trim()
          : `https://api.dicebear.com/8.x/lorelei/svg?seed=${docSnap.id}`,
      bannerUrl: typeof data.bannerUrl === "string" ? data.bannerUrl.trim() : "",
      bioEn,
      bioAr,
      joinDateIso: toIsoString(data.joinDate),
      updatedAtIso,
      updatedAtMs: toTimestampMs(updatedAtIso),
      followers: toNonNegativeInt(data.followers ?? data.followerCount),
      following: toNonNegativeInt(data.following ?? data.followingCount),
      nameNormalized:
        typeof data.nameNormalized === "string"
          ? normalizeSearchText(data.nameNormalized)
          : normalizeSearchText(name),
      handleNormalized:
        typeof data.handleNormalized === "string"
          ? normalizeSearchText(data.handleNormalized)
          : normalizeSearchText(handle),
      bioNormalized:
        typeof data.bioNormalized === "string"
          ? normalizeSearchText(data.bioNormalized)
          : normalized.normalizedText,
    };
  });
}

function mapSearchFeedDocToPostCandidate(
  docId: string,
  data: Record<string, unknown>
): PostCandidate {
  const hashtagsRaw = Array.isArray(data.hashtags) ? data.hashtags : [];
  const hashtags = hashtagsRaw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeSearchText(entry))
    .filter((entry) => entry.length >= 2)
    .slice(0, 40);

  const createdAtIso = toIsoString(data.createdAt);
  const createdAtMs = toTimestampMs(createdAtIso);

  return {
    postId: docId,
    authorId: typeof data.authorId === "string" ? data.authorId : "",
    authorNameNormalized: normalizeSearchText(data.authorNameNormalized),
    authorHandleNormalized: normalizeSearchText(data.authorHandleNormalized),
    textNormalized: normalizeSearchText(data.textNormalized),
    hashtags,
    createdAtMs,
    createdAtIso,
    likesCount: toNonNegativeInt(data.likesCount),
    commentsCount: toNonNegativeInt(data.commentsCount),
    repostsCount: toNonNegativeInt(data.repostsCount),
    bookmarksCount: toNonNegativeInt(data.bookmarksCount),
  };
}

async function queryPostCandidates(
  leadToken: string,
  maxCandidates: number
): Promise<PostCandidate[]> {
  const prefixSnap = await db
    .collection("search_feed")
    .where("searchPrefixes", "array-contains", leadToken)
    .limit(maxCandidates)
    .get();

  const candidates = prefixSnap.docs.map((docSnap) =>
    mapSearchFeedDocToPostCandidate(
      docSnap.id,
      (docSnap.data() || {}) as Record<string, unknown>
    )
  );

  if (candidates.length >= Math.floor(maxCandidates * 0.5)) {
    return candidates;
  }

  // Safety fallback for stale/unbackfilled search index.
  const fallbackSnap = await db
    .collection("posts")
    .where("status", "==", "published")
    .where("visibility", "==", "public")
    .where("isDeleted", "!=", true)
    .orderBy("isDeleted")
    .orderBy("timestamps.createdAt", "desc")
    .limit(maxCandidates)
    .get();

  const fallbackCandidates = fallbackSnap.docs.map((docSnap) => {
    const data = (docSnap.data() || {}) as Record<string, unknown>;
    const rawText =
      typeof data.content === "string"
        ? data.content
        : typeof (data.content as { text?: unknown } | undefined)?.text === "string"
        ? ((data.content as { text?: string }).text as string)
        : "";
    const authorName = typeof data.authorName === "string" ? data.authorName : "";
    const authorHandle = typeof data.authorHandle === "string" ? data.authorHandle : "";
    const searchFields = buildSearchFieldsFromTextParts([
      rawText,
      authorName,
      authorHandle,
    ]);

    const counters = (data.counters || {}) as Record<string, unknown>;
    const createdAtIso = toIsoString(
      (data.timestamps as { createdAt?: unknown } | undefined)?.createdAt ??
        data.createdAt
    );

    return {
      postId: docSnap.id,
      authorId: typeof data.authorId === "string" ? data.authorId : "",
      authorNameNormalized: normalizeSearchText(authorName),
      authorHandleNormalized: normalizeSearchText(authorHandle),
      textNormalized: searchFields.normalizedText,
      hashtags: extractHashtags(rawText),
      createdAtMs: toTimestampMs(createdAtIso),
      createdAtIso,
      likesCount: toNonNegativeInt(counters.likes),
      commentsCount: toNonNegativeInt(counters.comments),
      repostsCount: toNonNegativeInt(counters.reposts),
      bookmarksCount: toNonNegativeInt(counters.bookmarks),
    } as PostCandidate;
  });

  const mergedById = new Map<string, PostCandidate>();
  for (const candidate of [...candidates, ...fallbackCandidates]) {
    if (!mergedById.has(candidate.postId)) {
      mergedById.set(candidate.postId, candidate);
    }
  }
  return Array.from(mergedById.values()).slice(0, maxCandidates);
}

function rankUsers(
  candidates: readonly UserCandidate[],
  normalizedQuery: string,
  queryTokens: readonly string[],
  followingSet: ReadonlySet<string>
): RankedUser[] {
  const ranked: RankedUser[] = [];

  for (const candidate of candidates) {
    const searchable = `${candidate.nameNormalized} ${candidate.handleNormalized} ${candidate.bioNormalized}`;
    const handleSansAt = candidate.handleNormalized.replace(/^@/, "");
    const reasons: string[] = [];
    let score = 0;
    let lexicalMatched = false;

    if (candidate.handleNormalized === normalizedQuery || handleSansAt === normalizedQuery) {
      score += 3.2;
      reasons.push("exact_handle");
      lexicalMatched = true;
    }
    if (candidate.nameNormalized === normalizedQuery) {
      score += 2.6;
      reasons.push("exact_name");
      lexicalMatched = true;
    }
    if (candidate.nameNormalized.startsWith(normalizedQuery)) {
      score += 1.8;
      reasons.push("name_prefix");
      lexicalMatched = true;
    }
    if (handleSansAt.startsWith(normalizedQuery)) {
      score += 1.7;
      reasons.push("handle_prefix");
      lexicalMatched = true;
    }
    if (searchable.includes(normalizedQuery)) {
      score += 1.3;
      reasons.push("full_match");
      lexicalMatched = true;
    }

    let tokenHits = 0;
    for (const token of queryTokens) {
      if (searchable.includes(token)) {
        tokenHits += 1;
      }
    }
    if (tokenHits > 0) {
      score += (tokenHits / Math.max(1, queryTokens.length)) * 1.5;
      reasons.push("token_coverage");
      lexicalMatched = true;
    }

    // Hard gate: no lexical match means candidate is ineligible.
    if (!lexicalMatched) {
      continue;
    }

    if (followingSet.has(candidate.uid)) {
      score += 0.9;
      reasons.push("follow_graph");
    }

    const followerBoost = Math.min(1.2, Math.log1p(candidate.followers) * 0.12);
    score += followerBoost;
    if (followerBoost > 0.05) {
      reasons.push("follower_signal");
    }

    const ageDays = Math.max(0, (Date.now() - candidate.updatedAtMs) / 86_400_000);
    const recencyBoost = 0.35 / (1 + ageDays / 30);
    score += recencyBoost;
    reasons.push("profile_recency");

    if (score <= 0.2) {
      continue;
    }

    ranked.push({
      ...candidate,
      score: Number(score.toFixed(6)),
      rankReasons: reasons.slice(0, 6),
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.followers !== a.followers) return b.followers - a.followers;
    return a.uid.localeCompare(b.uid);
  });

  return ranked;
}

function rankPosts(
  candidates: readonly PostCandidate[],
  normalizedQuery: string,
  queryTokens: readonly string[],
  followingSet: ReadonlySet<string>
): RankedPost[] {
  const ranked: RankedPost[] = [];

  for (const candidate of candidates) {
    const searchable = `${candidate.textNormalized} ${candidate.authorNameNormalized} ${candidate.authorHandleNormalized}`;
    const reasons: string[] = [];
    let score = 0;
    let lexicalMatched = false;

    if (candidate.textNormalized.includes(normalizedQuery)) {
      score += 2.4;
      reasons.push("content_match");
      lexicalMatched = true;
    }
    if (candidate.authorNameNormalized.includes(normalizedQuery)) {
      score += 1.5;
      reasons.push("author_match");
      lexicalMatched = true;
    }
    if (candidate.authorHandleNormalized.includes(normalizedQuery)) {
      score += 1.2;
      reasons.push("handle_match");
      lexicalMatched = true;
    }
    if (candidate.hashtags.some((tag) => tag === normalizedQuery)) {
      score += 1.8;
      reasons.push("hashtag_exact");
      lexicalMatched = true;
    }
    if (candidate.hashtags.some((tag) => tag.includes(normalizedQuery))) {
      score += 0.8;
      reasons.push("hashtag_related");
      lexicalMatched = true;
    }

    let tokenHits = 0;
    for (const token of queryTokens) {
      if (searchable.includes(token) || candidate.hashtags.includes(token)) {
        tokenHits += 1;
      }
    }
    if (tokenHits > 0) {
      score += (tokenHits / Math.max(1, queryTokens.length)) * 1.8;
      reasons.push("token_coverage");
      lexicalMatched = true;
    }

    // Hard gate: ranking boosts must never surface non-matching candidates.
    if (!lexicalMatched) {
      continue;
    }

    if (followingSet.has(candidate.authorId)) {
      score += 0.9;
      reasons.push("follow_graph");
    }

    const engagementRaw =
      candidate.likesCount +
      candidate.commentsCount * 2 +
      candidate.repostsCount * 2 +
      candidate.bookmarksCount * 1.5;
    const engagementBoost = Math.min(1.5, Math.log1p(engagementRaw) * 0.22);
    score += engagementBoost;
    if (engagementBoost > 0.05) {
      reasons.push("engagement");
    }

    const ageDays = Math.max(0, (Date.now() - candidate.createdAtMs) / 86_400_000);
    const recencyBoost = 1 / (1 + ageDays / 8);
    score += recencyBoost;
    reasons.push("recency");

    if (score <= 0.25) {
      continue;
    }

    ranked.push({
      ...candidate,
      score: Number(score.toFixed(6)),
      rankReasons: reasons.slice(0, 6),
    });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.createdAtMs !== a.createdAtMs) return b.createdAtMs - a.createdAtMs;
    return a.postId.localeCompare(b.postId);
  });

  return ranked;
}

function rankTopicsFromPosts(posts: readonly RankedPost[]): SocialSearchTopic[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    for (const topic of post.hashtags) {
      counts.set(topic, (counts.get(topic) || 0) + 1);
    }
  }

  const ranked = Array.from(counts.entries())
    .map(([topic, count]) => ({
      topic,
      postCount: count,
      score: Number((count + Math.log1p(count)).toFixed(6)),
    }))
    .sort((a, b) => {
      if (b.postCount !== a.postCount) return b.postCount - a.postCount;
      return a.topic.localeCompare(b.topic);
    });

  return ranked;
}

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePostResponse(
  docId: string,
  data: Record<string, unknown>,
  ranked: RankedPost
): SocialSearchPost | null {
  const visibilityRaw = data.visibility;
  const visibility =
    typeof visibilityRaw === "string"
      ? visibilityRaw
      : typeof visibilityRaw === "object" &&
        visibilityRaw !== null &&
        typeof (visibilityRaw as { scope?: unknown }).scope === "string"
      ? ((visibilityRaw as { scope: string }).scope as string)
      : "public";

  const status = toStringOrEmpty(data.status) || "published";
  const isDeleted =
    data.isDeleted === true ||
    status === "deleted" ||
    (data.timestamps &&
      typeof data.timestamps === "object" &&
      (data.timestamps as { deletedAt?: unknown }).deletedAt != null);

  if (visibility !== "public" || status !== "published" || isDeleted) {
    return null;
  }

  const contentValue = data.content;
  const text =
    typeof contentValue === "string"
      ? contentValue
      : contentValue &&
        typeof contentValue === "object" &&
        typeof (contentValue as { text?: unknown }).text === "string"
      ? (((contentValue as { text: string }).text as string).trim() || null)
      : null;

  const rawAttachmentRefs =
    contentValue &&
    typeof contentValue === "object" &&
    Array.isArray((contentValue as { attachments?: unknown[] }).attachments)
      ? ((contentValue as { attachments: unknown[] }).attachments as unknown[])
      : [];

  const attachmentRefs = rawAttachmentRefs
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const ref = entry as Record<string, unknown>;
      const attachmentId = toStringOrEmpty(ref.attachmentId ?? ref.id);
      if (!attachmentId) return null;
      return {
        attachmentId,
        type: toStringOrEmpty(ref.type) || "IMAGE",
        role: toStringOrEmpty(ref.role) || "primary",
        renderHint: toStringOrEmpty(ref.renderHint) || "card",
      };
    })
    .filter(
      (
        value
      ): value is {
        attachmentId: string;
        type: string;
        role: string;
        renderHint: string;
      } => value !== null
    );

  const countersRaw =
    data.counters && typeof data.counters === "object"
      ? (data.counters as Record<string, unknown>)
      : {};
  const timestampsRaw =
    data.timestamps && typeof data.timestamps === "object"
      ? (data.timestamps as Record<string, unknown>)
      : {};

  const editedFlag = Boolean(
    data.flags &&
      typeof data.flags === "object" &&
      (data.flags as { edited?: unknown }).edited === true
  );

  return {
    id: docId,
    authorId: toStringOrEmpty(data.authorId),
    authorName: toStringOrEmpty(data.authorName) || "Unknown User",
    authorHandle: toStringOrEmpty(data.authorHandle) || "@user",
    authorAvatar:
      toStringOrEmpty(data.authorAvatar) ||
      `https://api.dicebear.com/8.x/lorelei/svg?seed=${docId}`,
    content: {
      text,
      attachments: attachmentRefs,
    },
    visibility: "public",
    status: "published",
    counters: {
      likes: toNonNegativeInt(countersRaw.likes),
      comments: toNonNegativeInt(countersRaw.comments),
      reposts: toNonNegativeInt(countersRaw.reposts),
      bookmarks: toNonNegativeInt(countersRaw.bookmarks),
    },
    timestamps: {
      createdAt: toIsoString(timestampsRaw.createdAt ?? data.createdAt),
      updatedAt:
        timestampsRaw.updatedAt == null ? null : toIsoString(timestampsRaw.updatedAt),
      publishedAt:
        timestampsRaw.publishedAt == null
          ? null
          : toIsoString(timestampsRaw.publishedAt),
      deletedAt:
        timestampsRaw.deletedAt == null ? null : toIsoString(timestampsRaw.deletedAt),
    },
    flags: {
      edited: editedFlag || data.isEdited === true,
      hasAttachments: attachmentRefs.length > 0,
    },
    score: ranked.score,
    rankReasons: ranked.rankReasons,
  };
}

async function hydratePosts(rankedPosts: readonly RankedPost[]): Promise<SocialSearchPost[]> {
  if (rankedPosts.length === 0) return [];

  const refs = rankedPosts.map((post) => db.collection("posts").doc(post.postId));
  const snaps = await db.getAll(...refs);
  const byId = new Map<string, FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>>();
  for (const snap of snaps) {
    byId.set(snap.id, snap);
  }

  const output: SocialSearchPost[] = [];
  for (const ranked of rankedPosts) {
    const snap = byId.get(ranked.postId);
    if (!snap || !snap.exists) continue;
    const normalized = normalizePostResponse(
      ranked.postId,
      (snap.data() || {}) as Record<string, unknown>,
      ranked
    );
    if (normalized) {
      output.push(normalized);
    }
  }
  return output;
}

export const searchSocial = onCall({ cors: true }, async (request): Promise<SocialSearchResponse> => {
  const startedAt = Date.now();
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const payload = (request.data || {}) as Record<string, unknown>;
  const queryRaw = typeof payload.query === "string" ? payload.query : "";
  const queryBounded = queryRaw.trim().slice(0, MAX_QUERY_LENGTH);
  if (isEmailLikeQuery(queryBounded)) {
    const blockedQueryHash = hashSha256(normalizeSearchText(queryBounded));
    logger.info("SOCIAL_SEARCH_QUERY_BLOCKED_V1", {
      uid,
      queryHash: blockedQueryHash,
      reason: "email_like_query",
      rankingVersion: SEARCH_RANKING_VERSION,
    });
    return {
      rankingVersion: SEARCH_RANKING_VERSION,
      queryHash: blockedQueryHash,
      users: [],
      posts: [],
      topics: [],
      hasMore: false,
    };
  }

  const normalizedQuery = normalizeSearchText(queryBounded).slice(0, MAX_QUERY_LENGTH);
  if (normalizedQuery.length < 2) {
    throw new HttpsError("invalid-argument", "query must be at least 2 characters.");
  }

  const rawLimit = typeof payload.limit === "number" ? payload.limit : 20;
  const limit = Math.max(1, Math.min(MAX_LIMIT, Math.trunc(rawLimit || 20)));
  const types = uniqueSearchTypes(payload.types);
  const typeSet = new Set<SearchType>(types);
  const queryTokens = tokenizeSearchText(normalizedQuery, 10);
  const leadToken = queryTokens[0] || normalizedQuery;

  const signature = hashSha256(
    `${normalizedQuery}|${types.sort().join(",")}|${limit}|${SEARCH_RANKING_VERSION}`
  );
  const cursor = parseCursor(payload.cursor, signature);

  await enforceSearchRateLimit(uid);

  const [viewerBlockSet, followingSet, userCandidates, postCandidates] = await Promise.all([
    loadViewerBlockSet(uid),
    loadFollowingSet(uid),
    typeSet.has("users") ? queryUserCandidates(leadToken, MAX_CANDIDATES) : Promise.resolve([]),
    typeSet.has("posts") || typeSet.has("topics")
      ? queryPostCandidates(leadToken, MAX_CANDIDATES)
      : Promise.resolve([]),
  ]);

  const candidateUids = Array.from(
    new Set([
      ...userCandidates.map((entry) => entry.uid),
      ...postCandidates.map((entry) => entry.authorId),
    ])
  );
  const blockedViewerSet = await loadUsersWhoBlockedViewer(uid, candidateUids);

  const canSeeUser = (candidateUid: string): boolean =>
    !viewerBlockSet.has(candidateUid) && !blockedViewerSet.has(candidateUid);

  const visibleUsers = userCandidates.filter((candidate) => canSeeUser(candidate.uid));
  const visiblePosts = postCandidates.filter((candidate) => canSeeUser(candidate.authorId));

  const rankedUsers = typeSet.has("users")
    ? rankUsers(visibleUsers, normalizedQuery, queryTokens, followingSet)
    : [];
  const rankedPosts = typeSet.has("posts") || typeSet.has("topics")
    ? rankPosts(visiblePosts, normalizedQuery, queryTokens, followingSet)
    : [];
  const rankedTopics = typeSet.has("topics") ? rankTopicsFromPosts(rankedPosts) : [];

  const usersPage = typeSet.has("users")
    ? rankedUsers.slice(cursor.usersOffset, cursor.usersOffset + limit)
    : [];
  const postsPage = typeSet.has("posts")
    ? rankedPosts.slice(cursor.postsOffset, cursor.postsOffset + limit)
    : [];
  const topicsPage = typeSet.has("topics")
    ? rankedTopics.slice(cursor.topicsOffset, cursor.topicsOffset + limit)
    : [];

  const users: SocialSearchUser[] = usersPage.map((entry) => ({
    uid: entry.uid,
    name: entry.name,
    handle: entry.handle,
    avatarUrl: entry.avatarUrl,
    bannerUrl: entry.bannerUrl,
    bioEn: entry.bioEn,
    bioAr: entry.bioAr,
    joinDate: entry.joinDateIso,
    updatedAt: entry.updatedAtIso,
    followers: entry.followers,
    following: entry.following,
    score: entry.score,
    rankReasons: entry.rankReasons,
  }));

  const posts = await hydratePosts(postsPage);
  const topics: SocialSearchTopic[] = topicsPage.map((topic) => ({
    topic: topic.topic,
    postCount: topic.postCount,
    score: topic.score,
  }));

  const nextOffsets: CursorPayload = {
    v: 1,
    signature,
    usersOffset: cursor.usersOffset + usersPage.length,
    postsOffset: cursor.postsOffset + postsPage.length,
    topicsOffset: cursor.topicsOffset + topicsPage.length,
  };

  const hasMore =
    (typeSet.has("users") && rankedUsers.length > nextOffsets.usersOffset) ||
    (typeSet.has("posts") && rankedPosts.length > nextOffsets.postsOffset) ||
    (typeSet.has("topics") && rankedTopics.length > nextOffsets.topicsOffset);

  const response: SocialSearchResponse = {
    rankingVersion: SEARCH_RANKING_VERSION,
    queryHash: hashSha256(normalizedQuery),
    users,
    posts,
    topics,
    hasMore,
    ...(hasMore ? { nextCursor: encodeCursor(nextOffsets) } : {}),
  };

  const latencyMs = Date.now() - startedAt;
  logger.info("SOCIAL_SEARCH_QUERY_EXECUTED_V1", {
    uid,
    queryHash: response.queryHash,
    rankingVersion: SEARCH_RANKING_VERSION,
    types,
    limit,
    latencyMs,
    candidateCounts: {
      users: userCandidates.length,
      posts: postCandidates.length,
    },
    resultCounts: {
      users: users.length,
      posts: posts.length,
      topics: topics.length,
    },
    hasMore,
  });

  return response;
});
