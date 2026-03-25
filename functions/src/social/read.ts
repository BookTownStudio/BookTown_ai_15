import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldPath, Timestamp } from "firebase-admin/firestore";
import { admin } from "../firebaseAdmin";

const db = admin.firestore();

const FEED_PAGE_SIZE = 20;
const FEED_QUERY_BATCH_SIZE = 40;
const FEED_FETCH_ATTEMPTS = 3;
const FOLLOWING_BATCH_SIZE = 10;
const FOLLOWING_LOOKUP_LIMIT = 500;
const COMMENT_PAGE_SIZE = 20;

type FeedScope = "explore" | "following" | "books" | "discover";
type FeedFilter = "media" | "text" | "book" | "quote" | "project";
type StructuredEntityType =
  | "book"
  | "author"
  | "quote"
  | "shelf"
  | "venue"
  | "publication";

type FeedCursor = {
  v: 1;
  scope: FeedScope;
  createdAtMs: number;
  postId: string;
};

type CommentCursor = {
  v: 1;
  timestampMs: number;
  commentId: string;
};

type HydratedEntity = {
  type: StructuredEntityType;
  id: string;
  data: Record<string, unknown>;
  ownerId?: string;
};

type NormalizedPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  content: {
    text: string | null;
    attachments: Array<{
      attachmentId: string;
      entityId?: string;
      entityOwnerId?: string;
      type: string;
      role: string;
      renderHint: string;
    }>;
  };
  visibility: "public" | "followers" | "private" | "restricted";
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
  };
  flags: {
    edited: boolean;
    hasAttachments: boolean;
  };
  primaryEntityType?: StructuredEntityType | null;
  primaryEntityId?: string | null;
  hydratedEntity?: HydratedEntity | null;
};

const base64UrlEncode = (raw: string): string =>
  Buffer.from(raw, "utf8").toString("base64url");

const base64UrlDecode = (raw: string): string =>
  Buffer.from(raw, "base64url").toString("utf8");

function readTrimmedString(value: unknown, maxLength = 2048): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function toIsoString(value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (
    value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    const parsed = (value as { toDate: () => Date }).toDate();
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  return new Date(0).toISOString();
}

function toNullableIsoString(value: unknown): string | null {
  const iso = toIsoString(value);
  return iso === new Date(0).toISOString() ? null : iso;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  return 0;
}

function encodeFeedCursor(cursor: FeedCursor): string {
  return base64UrlEncode(JSON.stringify(cursor));
}

function decodeFeedCursor(
  raw: unknown,
  scope: FeedScope
): FeedCursor | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(raw.trim())) as Partial<FeedCursor>;
    if (
      parsed.v !== 1 ||
      parsed.scope !== scope ||
      typeof parsed.createdAtMs !== "number" ||
      !Number.isFinite(parsed.createdAtMs) ||
      parsed.createdAtMs <= 0 ||
      typeof parsed.postId !== "string" ||
      parsed.postId.trim().length === 0
    ) {
      return null;
    }
    return {
      v: 1,
      scope,
      createdAtMs: Math.trunc(parsed.createdAtMs),
      postId: parsed.postId.trim(),
    };
  } catch {
    return null;
  }
}

function encodeCommentCursor(cursor: CommentCursor): string {
  return base64UrlEncode(JSON.stringify(cursor));
}

function decodeCommentCursor(raw: unknown): CommentCursor | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(raw.trim())) as Partial<CommentCursor>;
    if (
      parsed.v !== 1 ||
      typeof parsed.timestampMs !== "number" ||
      !Number.isFinite(parsed.timestampMs) ||
      parsed.timestampMs <= 0 ||
      typeof parsed.commentId !== "string" ||
      parsed.commentId.trim().length === 0
    ) {
      return null;
    }

    return {
      v: 1,
      timestampMs: Math.trunc(parsed.timestampMs),
      commentId: parsed.commentId.trim(),
    };
  } catch {
    return null;
  }
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}

function isModerator(auth: { token?: Record<string, unknown> } | null | undefined): boolean {
  const token =
    auth?.token && typeof auth.token === "object"
      ? auth.token
      : {};
  return (
    token.admin === true ||
    token.role === "moderator" ||
    token.role === "superadmin" ||
    token.role === "system"
  );
}

function normalizePostVisibility(
  value: unknown
): "public" | "followers" | "private" | "restricted" {
  const normalized = readTrimmedString(value, 32).toLowerCase();
  if (
    normalized === "public" ||
    normalized === "followers" ||
    normalized === "private" ||
    normalized === "restricted"
  ) {
    return normalized;
  }
  return "public";
}

function normalizeStructuredEntityType(value: unknown): StructuredEntityType | null {
  const normalized = readTrimmedString(value, 32).toLowerCase();
  if (
    normalized === "book" ||
    normalized === "author" ||
    normalized === "quote" ||
    normalized === "shelf" ||
    normalized === "venue" ||
    normalized === "publication"
  ) {
    return normalized;
  }
  return null;
}

function normalizeAttachmentRefs(
  value: unknown
): Array<{
  attachmentId: string;
  entityId?: string;
  entityOwnerId?: string;
  type: string;
  role: string;
  renderHint: string;
}> {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const attachmentId = readTrimmedString(item.attachmentId, 256);
      if (!attachmentId) return null;

      const entityId = readTrimmedString(item.entityId, 256);
      const entityOwnerId = readTrimmedString(item.entityOwnerId, 256);

      return {
        attachmentId,
        ...(entityId ? { entityId } : {}),
        ...(entityOwnerId ? { entityOwnerId } : {}),
        type: readTrimmedString(item.type, 64) || "IMAGE",
        role: readTrimmedString(item.role, 32) || "primary",
        renderHint: readTrimmedString(item.renderHint, 32) || "card",
      };
    })
    .filter(
      (
        item
      ): item is {
        attachmentId: string;
        entityId?: string;
        entityOwnerId?: string;
        type: string;
        role: string;
        renderHint: string;
      } => item !== null
    );
}

function normalizePostDoc(
  docId: string,
  source: Record<string, unknown>,
  stats?: Record<string, unknown>,
  hydratedEntity?: HydratedEntity | null
): NormalizedPost {
  const content =
    source.content && typeof source.content === "object"
      ? (source.content as Record<string, unknown>)
      : {};
  const counters =
    source.counters && typeof source.counters === "object"
      ? (source.counters as Record<string, unknown>)
      : {};
  const statCounters =
    stats?.counters && typeof stats.counters === "object"
      ? (stats.counters as Record<string, unknown>)
      : {};
  const timestamps =
    source.timestamps && typeof source.timestamps === "object"
      ? (source.timestamps as Record<string, unknown>)
      : {};
  const flags =
    source.flags && typeof source.flags === "object"
      ? (source.flags as Record<string, unknown>)
      : {};

  const attachments = normalizeAttachmentRefs(content.attachments);
  const primaryEntityType = normalizeStructuredEntityType(source.primaryEntityType);
  const primaryEntityId = readTrimmedString(source.primaryEntityId, 256);

  return {
    id: readTrimmedString(docId, 128),
    authorId: readTrimmedString(source.authorId, 128),
    authorName: readTrimmedString(source.authorName, 120) || "Unknown",
    authorHandle: readTrimmedString(source.authorHandle, 120) || "@user",
    authorAvatar: readTrimmedString(source.authorAvatar, 2048),
    content: {
      text:
        typeof content.text === "string"
          ? content.text.slice(0, 10000)
          : null,
      attachments,
    },
    visibility: normalizePostVisibility(source.visibility),
    status: "published",
    counters: {
      likes: toNonNegativeInt(statCounters.likes ?? counters.likes),
      comments: toNonNegativeInt(statCounters.comments ?? counters.comments),
      reposts: toNonNegativeInt(statCounters.reposts ?? counters.reposts),
      bookmarks: toNonNegativeInt(statCounters.bookmarks ?? counters.bookmarks),
    },
    timestamps: {
      createdAt: toIsoString(
        timestamps.createdAt ?? source.createdAt ?? source.timestamp
      ),
      updatedAt: toNullableIsoString(timestamps.updatedAt ?? source.updatedAt),
      publishedAt: toNullableIsoString(
        timestamps.publishedAt ?? source.publishedAt
      ),
    },
    flags: {
      edited: flags.edited === true || source.isEdited === true,
      hasAttachments: flags.hasAttachments === true || attachments.length > 0,
    },
    ...(primaryEntityType ? { primaryEntityType } : {}),
    ...(primaryEntityId ? { primaryEntityId } : {}),
    ...(hydratedEntity === undefined ? {} : { hydratedEntity }),
  };
}

function matchesFeedFilters(post: NormalizedPost, filters: FeedFilter[]): boolean {
  if (!Array.isArray(filters) || filters.length === 0) {
    return true;
  }

  const normalizedFilters = filters.map((filter) => filter.toLowerCase());
  const text = (post.content.text || "").trim();
  const attachments = Array.isArray(post.content.attachments)
    ? post.content.attachments
    : [];
  const attachmentTypes = new Set(
    attachments.map((attachment) => readTrimmedString(attachment.type, 64).toLowerCase())
  );

  return normalizedFilters.every((filter) => {
    if (filter === "text") return text.length > 0;
    if (filter === "media") return attachments.length > 0;
    if (filter === "book") return attachmentTypes.has("book");
    if (filter === "quote") return attachmentTypes.has("quote");
    if (filter === "project") return attachmentTypes.has("project");
    return true;
  });
}

function isDeletedPost(source: Record<string, unknown>): boolean {
  const timestamps =
    source.timestamps && typeof source.timestamps === "object"
      ? (source.timestamps as Record<string, unknown>)
      : {};
  return (
    source.isDeleted === true ||
    readTrimmedString(source.status, 32).toLowerCase() === "deleted" ||
    timestamps.deletedAt != null ||
    source.deletedAt != null
  );
}

async function isViewerFollowingAuthor(
  viewerUid: string,
  authorId: string
): Promise<boolean> {
  if (!viewerUid || !authorId || viewerUid === authorId) {
    return true;
  }

  const followSnap = await db
    .collection("users")
    .doc(authorId)
    .collection("followers")
    .doc(viewerUid)
    .get();
  return followSnap.exists;
}

async function canViewerAccessPost(
  source: Record<string, unknown>,
  viewerUid: string,
  moderator: boolean,
  knownFollowedAuthorIds?: ReadonlySet<string>
): Promise<boolean> {
  const authorId = readTrimmedString(source.authorId, 128);
  if (viewerUid && authorId && viewerUid === authorId) {
    return true;
  }

  if (moderator) {
    return true;
  }

  if (
    readTrimmedString(source.status, 32).toLowerCase() !== "published" ||
    isDeletedPost(source)
  ) {
    return false;
  }

  const visibility = normalizePostVisibility(source.visibility);
  if (visibility === "public") {
    return true;
  }
  if (visibility === "followers") {
    if (!viewerUid || !authorId) {
      return false;
    }
    if (knownFollowedAuthorIds?.has(authorId)) {
      return true;
    }
    return isViewerFollowingAuthor(viewerUid, authorId);
  }

  return false;
}

async function readPostStatsMap(
  postIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const uniqueIds = Array.from(new Set(postIds.filter((value) => value.length > 0)));
  const statsMap = new Map<string, Record<string, unknown>>();
  const idChunks = chunk(uniqueIds, FOLLOWING_BATCH_SIZE);

  await Promise.all(
    idChunks.map(async (postIdBatch) => {
      const snap = await db
        .collection("post_stats")
        .where(FieldPath.documentId(), "in", postIdBatch)
        .get();
      snap.docs.forEach((docSnap) => {
        statsMap.set(docSnap.id, (docSnap.data() ?? {}) as Record<string, unknown>);
      });
    })
  );

  uniqueIds.forEach((postId) => {
    if (!statsMap.has(postId)) {
      statsMap.set(postId, {});
    }
  });

  return statsMap;
}

async function hydratePrimaryEntities(
  posts: Array<{ id: string; authorId: string; raw: Record<string, unknown> }>,
  normalizedPosts: NormalizedPost[]
): Promise<Map<string, HydratedEntity | null>> {
  const hydratedByPostId = new Map<string, HydratedEntity | null>();
  const rootEntityRequests = new Map<Exclude<StructuredEntityType, "quote">, Set<string>>([
    ["book", new Set<string>()],
    ["author", new Set<string>()],
    ["shelf", new Set<string>()],
    ["venue", new Set<string>()],
    ["publication", new Set<string>()],
  ]);
  const quoteRequests = new Map<string, { ownerId: string; quoteId: string }>();
  const postPrimaryKeys = new Map<string, { type: StructuredEntityType; id: string; ownerId?: string }>();

  posts.forEach((post, index) => {
    const normalized = normalizedPosts[index];
    const primaryType = normalizeStructuredEntityType(post.raw.primaryEntityType);
    const primaryId = readTrimmedString(post.raw.primaryEntityId, 256);
    if (!primaryType || !primaryId) {
      hydratedByPostId.set(post.id, null);
      return;
    }

    if (primaryType === "quote") {
      const ownerId =
        normalized.content.attachments.find(
          (attachment) =>
            readTrimmedString(attachment.type, 64).toLowerCase() === "quote" &&
            (
              readTrimmedString(attachment.entityId, 256) === primaryId ||
              readTrimmedString(attachment.attachmentId, 256) === primaryId
            )
        )?.entityOwnerId || post.authorId;

      const compositeKey = `${ownerId}:${primaryId}`;
      quoteRequests.set(compositeKey, { ownerId, quoteId: primaryId });
      postPrimaryKeys.set(post.id, { type: primaryType, id: primaryId, ownerId });
      return;
    }

    rootEntityRequests.get(primaryType)?.add(primaryId);
    postPrimaryKeys.set(post.id, { type: primaryType, id: primaryId });
  });

  const rootHydrated = new Map<string, HydratedEntity>();
  await Promise.all(
    Array.from(rootEntityRequests.entries()).map(async ([entityType, ids]) => {
      if (ids.size === 0) return;
      const collectionName =
        entityType === "book"
          ? "books"
          : entityType === "author"
            ? "authors"
            : entityType === "shelf"
              ? "shelves"
              : entityType === "venue"
                ? "venues"
                : "longform_publications";

      await Promise.all(
        chunk(Array.from(ids), FOLLOWING_BATCH_SIZE).map(async (idBatch) => {
          const snap = await db
            .collection(collectionName)
            .where(FieldPath.documentId(), "in", idBatch)
            .get();

          snap.docs.forEach((docSnap) => {
            rootHydrated.set(`${entityType}:${docSnap.id}`, {
              type: entityType,
              id: docSnap.id,
              data: (docSnap.data() ?? {}) as Record<string, unknown>,
            });
          });
        })
      );
    })
  );

  const quoteHydrated = new Map<string, HydratedEntity>();
  const uniqueQuoteIds = Array.from(
    new Set(Array.from(quoteRequests.values()).map((request) => request.quoteId))
  );

  await Promise.all(
    chunk(uniqueQuoteIds, FOLLOWING_BATCH_SIZE).map(async (quoteIdBatch) => {
      if (quoteIdBatch.length === 0) return;
      const rootSnap = await db
        .collection("quotes")
        .where(FieldPath.documentId(), "in", quoteIdBatch)
        .get();

      rootSnap.docs.forEach((docSnap) => {
        const data = (docSnap.data() ?? {}) as Record<string, unknown>;
        const ownerId = readTrimmedString(data.ownerId, 128);
        quoteHydrated.set(docSnap.id, {
          type: "quote",
          id: docSnap.id,
          ...(ownerId ? { ownerId } : {}),
          data,
        });
      });

      const unresolvedLegacyIds = quoteIdBatch.filter((quoteId) => !quoteHydrated.has(quoteId));
      if (unresolvedLegacyIds.length === 0) return;

      const legacySnap = await db
        .collectionGroup("quotes")
        .where(FieldPath.documentId(), "in", unresolvedLegacyIds)
        .get();

      legacySnap.docs.forEach((docSnap) => {
        const ownerId = docSnap.ref.parent.parent?.id;
        if (!ownerId) return;

        const compositeKey = `${ownerId}:${docSnap.id}`;
        if (!quoteRequests.has(compositeKey)) return;

        const data = (docSnap.data() ?? {}) as Record<string, unknown>;
        const canonicalQuoteId = readTrimmedString(data.canonicalQuoteId, 256);
        if (!canonicalQuoteId) return;

        quoteHydrated.set(compositeKey, {
          type: "quote",
          id: canonicalQuoteId,
          ownerId,
          data,
        });
      });
    })
  );

  posts.forEach((post) => {
    const primary = postPrimaryKeys.get(post.id);
    if (!primary) {
      hydratedByPostId.set(post.id, null);
      return;
    }

    if (primary.type === "quote") {
      hydratedByPostId.set(
        post.id,
        quoteHydrated.get(primary.id) ??
          quoteHydrated.get(`${primary.ownerId}:${primary.id}`) ??
          null
      );
      return;
    }

    hydratedByPostId.set(
      post.id,
      rootHydrated.get(`${primary.type}:${primary.id}`) ?? null
    );
  });

  return hydratedByPostId;
}

async function buildNormalizedPosts(
  posts: Array<{ id: string; authorId: string; raw: Record<string, unknown> }>
): Promise<NormalizedPost[]> {
  const statsMap = await readPostStatsMap(posts.map((post) => post.id));
  const basePosts = posts.map((post) =>
    normalizePostDoc(post.id, post.raw, statsMap.get(post.id))
  );
  const hydrationMap = await hydratePrimaryEntities(posts, basePosts);

  return posts.map((post) =>
    normalizePostDoc(
      post.id,
      post.raw,
      statsMap.get(post.id),
      hydrationMap.get(post.id) ?? null
    )
  );
}

async function readFollowingAuthorIds(uid: string): Promise<string[]> {
  const followingSnap = await db
    .collection("users")
    .doc(uid)
    .collection("following")
    .limit(FOLLOWING_LOOKUP_LIMIT)
    .get();

  const ids = new Set<string>();
  ids.add(uid);

  for (const docSnap of followingSnap.docs) {
    ids.add(docSnap.id);
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    const targetUid = readTrimmedString(data.targetUid, 128);
    const linkedUid = readTrimmedString(data.uid, 128);
    if (targetUid) ids.add(targetUid);
    if (linkedUid) ids.add(linkedUid);
  }

  return Array.from(ids.values());
}

export const listSocialFeed = onCall({ cors: true }, async (request) => {
  const scopeRaw = readTrimmedString(request.data?.scope, 32).toLowerCase();
  const scope =
    scopeRaw === "following" ||
    scopeRaw === "books" ||
    scopeRaw === "discover"
      ? (scopeRaw as FeedScope)
      : "explore";
  const filters = Array.isArray(request.data?.filters)
    ? request.data.filters
        .map((value: unknown) => readTrimmedString(value, 32).toLowerCase())
        .filter(
          (
            value: string
          ): value is FeedFilter =>
            value === "media" ||
            value === "text" ||
            value === "book" ||
            value === "quote" ||
            value === "project"
        )
    : [];
  const viewerUid =
    request.auth && typeof request.auth.uid === "string"
      ? request.auth.uid.trim()
      : "";

  const decodedCursor = decodeFeedCursor(request.data?.cursor, scope);

  if (scope === "following" && !viewerUid) {
    return { posts: [] as NormalizedPost[] };
  }

  if (scope === "following") {
    const authorIds = await readFollowingAuthorIds(viewerUid);
    if (authorIds.length === 0) {
      return { posts: [] as NormalizedPost[] };
    }
    const followedAuthorIds = new Set(authorIds);

    const authorChunks = chunk(authorIds, FOLLOWING_BATCH_SIZE);
    const perBatchLimit = Math.max(
      2,
      Math.ceil((FEED_PAGE_SIZE * 2) / Math.max(1, authorChunks.length))
    );
    const batchSnapshots = await Promise.all(
      authorChunks.map(async (authorBatch) => {
        let queryRef: FirebaseFirestore.Query = db
          .collection("posts")
          .where("authorId", "in", authorBatch)
          .where("status", "==", "published")
          .orderBy("timestamps.createdAt", "desc")
          .orderBy(FieldPath.documentId(), "desc")
          .limit(perBatchLimit);

        if (decodedCursor) {
          queryRef = queryRef.startAfter(
            Timestamp.fromMillis(decodedCursor.createdAtMs),
            decodedCursor.postId
          );
        }

        return queryRef.get();
      })
    );

    const deduped = new Map<string, { id: string; authorId: string; raw: Record<string, unknown> }>();
    for (const snap of batchSnapshots) {
      for (const docSnap of snap.docs) {
        const raw = (docSnap.data() ?? {}) as Record<string, unknown>;
        if (isDeletedPost(raw)) continue;
        if (!(await canViewerAccessPost(raw, viewerUid, false, followedAuthorIds))) continue;

        const normalizedCandidate = normalizePostDoc(docSnap.id, raw);
        if (!matchesFeedFilters(normalizedCandidate, filters)) continue;

        if (!deduped.has(docSnap.id)) {
          deduped.set(docSnap.id, {
            id: docSnap.id,
            authorId: readTrimmedString(raw.authorId, 128),
            raw,
          });
        }
      }
    }

    const sorted = Array.from(deduped.values()).sort((left, right) => {
      const leftMs = Date.parse(toIsoString(left.raw.timestamps && typeof left.raw.timestamps === "object"
        ? (left.raw.timestamps as Record<string, unknown>).createdAt
        : null));
      const rightMs = Date.parse(toIsoString(right.raw.timestamps && typeof right.raw.timestamps === "object"
        ? (right.raw.timestamps as Record<string, unknown>).createdAt
        : null));
      if (rightMs !== leftMs) {
        return rightMs - leftMs;
      }
      return right.id.localeCompare(left.id);
    });

    const page = sorted.slice(0, FEED_PAGE_SIZE);
    const posts = await buildNormalizedPosts(page);
    const hasMore =
      sorted.length > FEED_PAGE_SIZE ||
      batchSnapshots.some((snap) => snap.docs.length === perBatchLimit);

    if (!hasMore || page.length === 0) {
      return { posts };
    }

    const lastPost = posts[posts.length - 1];
    const createdAtMs = Date.parse(lastPost.timestamps.createdAt);
    return {
      posts,
      nextCursor: encodeFeedCursor({
        v: 1,
        scope,
        createdAtMs: Math.trunc(createdAtMs),
        postId: lastPost.id,
      }),
    };
  }

  let cursor = decodedCursor;
  let attempt = 0;
  const collected = new Map<string, { id: string; authorId: string; raw: Record<string, unknown> }>();
  let lastFetchedDocs = 0;

  while (collected.size < FEED_PAGE_SIZE && attempt < FEED_FETCH_ATTEMPTS) {
    let queryRef: FirebaseFirestore.Query = db
      .collection("posts")
      .where("status", "==", "published")
      .where("visibility", "==", "public")
      .orderBy("timestamps.createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .limit(FEED_QUERY_BATCH_SIZE);

    if (cursor) {
      queryRef = queryRef.startAfter(
        Timestamp.fromMillis(cursor.createdAtMs),
        cursor.postId
      );
    }

    const snap = await queryRef.get();
    lastFetchedDocs = snap.docs.length;
    if (snap.empty) {
      break;
    }

    for (const docSnap of snap.docs) {
      const raw = (docSnap.data() ?? {}) as Record<string, unknown>;
      if (isDeletedPost(raw)) continue;

      const normalizedCandidate = normalizePostDoc(docSnap.id, raw);
      if (scope === "books" && normalizedCandidate.flags.hasAttachments !== true) {
        continue;
      }
      if (!matchesFeedFilters(normalizedCandidate, filters)) continue;

      if (!collected.has(docSnap.id)) {
        collected.set(docSnap.id, {
          id: docSnap.id,
          authorId: readTrimmedString(raw.authorId, 128),
          raw,
        });
      }
    }

    const lastDoc = snap.docs[snap.docs.length - 1];
    if (!lastDoc) {
      break;
    }
    const lastRaw = (lastDoc.data() ?? {}) as Record<string, unknown>;
    const lastCreatedAt = toIsoString(
      lastRaw.timestamps && typeof lastRaw.timestamps === "object"
        ? (lastRaw.timestamps as Record<string, unknown>).createdAt
        : null
    );
    const lastCreatedAtMs = Date.parse(lastCreatedAt);
    if (!Number.isFinite(lastCreatedAtMs) || lastCreatedAtMs <= 0) {
      break;
    }
    cursor = {
      v: 1,
      scope,
      createdAtMs: Math.trunc(lastCreatedAtMs),
      postId: lastDoc.id,
    };
    attempt += 1;
  }

  const page = Array.from(collected.values()).slice(0, FEED_PAGE_SIZE);
  const posts = await buildNormalizedPosts(page);
  const hasMore = page.length === FEED_PAGE_SIZE && lastFetchedDocs === FEED_QUERY_BATCH_SIZE && cursor;

  if (!hasMore || !cursor) {
    return { posts };
  }

  return {
    posts,
    nextCursor: encodeFeedCursor(cursor),
  };
});

export const getSocialPost = onCall({ cors: true }, async (request) => {
  const postId = readTrimmedString(request.data?.postId, 128);
  if (!postId) {
    throw new HttpsError("invalid-argument", "postId is required.");
  }

  const viewerUid =
    request.auth && typeof request.auth.uid === "string"
      ? request.auth.uid.trim()
      : "";
  const moderator = isModerator(request.auth);

  const postSnap = await db.collection("posts").doc(postId).get();
  if (!postSnap.exists) {
    throw new HttpsError("not-found", "Post not found.");
  }

  const raw = (postSnap.data() ?? {}) as Record<string, unknown>;
  const canAccess = await canViewerAccessPost(raw, viewerUid, moderator);
  if (!canAccess) {
    throw new HttpsError("permission-denied", "Post is not accessible.");
  }

  const posts = await buildNormalizedPosts([
    {
      id: postSnap.id,
      authorId: readTrimmedString(raw.authorId, 128),
      raw,
    },
  ]);

  if (posts.length === 0) {
    throw new HttpsError("not-found", "Post not found.");
  }

  return posts[0];
});

export const listSocialComments = onCall({ cors: true }, async (request) => {
  const postId = readTrimmedString(request.data?.postId, 128);
  if (!postId) {
    throw new HttpsError("invalid-argument", "postId is required.");
  }

  const viewerUid =
    request.auth && typeof request.auth.uid === "string"
      ? request.auth.uid.trim()
      : "";
  const moderator = isModerator(request.auth);

  const postSnap = await db.collection("posts").doc(postId).get();
  if (!postSnap.exists) {
    throw new HttpsError("not-found", "Post not found.");
  }

  const postRaw = (postSnap.data() ?? {}) as Record<string, unknown>;
  const canAccess = await canViewerAccessPost(postRaw, viewerUid, moderator);
  if (!canAccess) {
    throw new HttpsError("permission-denied", "Comments are not accessible.");
  }

  const decodedCursor = decodeCommentCursor(request.data?.cursor);
  let queryRef: FirebaseFirestore.Query = db
    .collection("posts")
    .doc(postId)
    .collection("comments")
    .where("status", "==", "published")
    .orderBy("timestamp", "asc")
    .orderBy(FieldPath.documentId(), "asc")
    .limit(COMMENT_PAGE_SIZE);

  if (decodedCursor) {
    queryRef = queryRef.startAfter(
      Timestamp.fromMillis(decodedCursor.timestampMs),
      decodedCursor.commentId
    );
  }

  const snap = await queryRef.get();
  const comments = snap.docs.map((docSnap) => {
    const data = (docSnap.data() ?? {}) as Record<string, unknown>;
    return {
      id: docSnap.id,
      authorId: readTrimmedString(data.authorId, 128),
      authorName: readTrimmedString(data.authorName, 120) || "Unknown",
      authorHandle: readTrimmedString(data.authorHandle, 120) || "@user",
      authorAvatar: readTrimmedString(data.authorAvatar, 2048),
      text: readTrimmedString(data.text, 4000),
      createdAt: toIsoString(data.timestamp ?? data.createdAt),
      parentId: readTrimmedString(data.parentId, 128) || null,
      likesCount: toNonNegativeInt(data.likesCount),
      liked: false,
    };
  });

  const lastDoc = snap.docs[snap.docs.length - 1];
  if (!lastDoc || snap.docs.length < COMMENT_PAGE_SIZE) {
    return {
      comments,
      hasMore: false,
    };
  }

  const lastData = (lastDoc.data() ?? {}) as Record<string, unknown>;
  const lastTimestampMs = Date.parse(toIsoString(lastData.timestamp ?? lastData.createdAt));
  if (!Number.isFinite(lastTimestampMs) || lastTimestampMs <= 0) {
    return {
      comments,
      hasMore: false,
    };
  }

  return {
    comments,
    hasMore: true,
    nextCursor: encodeCommentCursor({
      v: 1,
      timestampMs: Math.trunc(lastTimestampMs),
      commentId: lastDoc.id,
    }),
  };
});
