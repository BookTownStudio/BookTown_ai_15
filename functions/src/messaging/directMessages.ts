import { onCall, HttpsError } from "firebase-functions/v2/https";
import { admin } from "../firebaseAdmin";
import { SOCIAL_QUOTE_PROJECTION_COLLECTION } from "../projections/quoteProjections";
import {
  buildNotificationSummaryPatch,
  notificationSummaryRef,
} from "../notifications/notificationSummary";

const db = admin.firestore();

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONVERSATION_LIST_LIMIT = 50;
const MAX_MESSAGES_LIST_LIMIT = 200;
const MAX_MESSAGES_PER_MINUTE = 30;
const RATE_WINDOW_MS = 60_000;
const DM_CALLABLE_OPTIONS = { cors: true, enforceAppCheck: true };
const DM_NOTIFICATION_CLEAR_LIMIT = 100;
const DM_REPORT_REASONS = [
  "spam",
  "harassment",
  "hate_speech",
  "scam",
  "copyright",
  "other",
] as const;

type DmPrivacyMode = "nobody" | "mutual_follows" | "everyone";
type ConversationStatus = "active" | "request_pending" | "request_declined";
type DirectMessageAttachmentType =
  | "book"
  | "author"
  | "shelf"
  | "quote"
  | "media"
  | "venue"
  | "publication";

type ParticipantProfile = {
  name: string;
  avatarUrl: string;
  handle: string;
};

type DirectMessageAttachment = {
  type: DirectMessageAttachmentType;
  entityId: string;
  title?: string;
  author?: string;
  coverUrl?: string;
  canonicalSlug?: string;
  ownerId?: string;
  bookCount?: number;
  covers?: string[];
  quoteOwnerId?: string;
  quoteText?: string;
};

type ConversationDoc = {
  kind: "direct";
  participantIds: string[];
  participantSet: Record<string, boolean>;
  participantProfiles: Record<string, ParticipantProfile>;
  lastMessageText: string;
  lastMessageAt: admin.firestore.Timestamp | null;
  lastMessageSenderId: string | null;
  unreadCounts: Record<string, number>;
  lastReadAtByUser: Record<
    string,
    admin.firestore.FieldValue | admin.firestore.Timestamp | null
  >;
  createdAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  updatedAt: admin.firestore.FieldValue | admin.firestore.Timestamp;
  status?: ConversationStatus;
  requestedByUid?: string | null;
  acceptedAt?: admin.firestore.FieldValue | admin.firestore.Timestamp | null;
  declinedAt?: admin.firestore.FieldValue | admin.firestore.Timestamp | null;
  conversationContext?: {
    type: "book" | "author" | "shelf" | "quote" | "venue" | "media";
    entityId: string;
    title?: string;
    snapshot?: Record<string, unknown>;
  } | null;
  version: number;
};

function normalizeUid(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", `${field} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }
  return normalized;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "text must be a string.");
  }
  const normalized = value.trim();
  if (!normalized) {
    throw new HttpsError("invalid-argument", "Message text cannot be empty.");
  }
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `Message text exceeds ${MAX_MESSAGE_LENGTH} characters.`
    );
  }
  return normalized;
}

function normalizeOptionalText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "text must be a string.");
  }
  const normalized = value.trim();
  if (normalized.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError(
      "invalid-argument",
      `Message text exceeds ${MAX_MESSAGE_LENGTH} characters.`
    );
  }
  return normalized;
}

function readTrimmedString(value: unknown, maxLength = 2048): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeDirectMessageAttachment(
  value: unknown
): { type: DirectMessageAttachmentType; entityId: string } | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const type = readTrimmedString(raw.type, 32).toLowerCase();
  if (
    type !== "book" &&
    type !== "author" &&
    type !== "shelf" &&
    type !== "quote" &&
    type !== "media" &&
    type !== "venue" &&
    type !== "publication"
  ) {
    throw new HttpsError("invalid-argument", "attachment.type is invalid.");
  }
  const entityId = readTrimmedString(raw.entityId, 256);
  if (!entityId) {
    throw new HttpsError("invalid-argument", "attachment.entityId is required.");
  }
  return {
    type,
    entityId,
  };
}

function normalizeStoredAttachment(value: unknown): DirectMessageAttachment | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const type = readTrimmedString(raw.type, 32).toLowerCase();
  if (
    type !== "book" &&
    type !== "author" &&
    type !== "shelf" &&
    type !== "quote" &&
    type !== "media" &&
    type !== "venue" &&
    type !== "publication"
  ) {
    return undefined;
  }
  const entityId = readTrimmedString(raw.entityId, 256);
  if (!entityId) {
    return undefined;
  }
  const title = readTrimmedString(raw.title, 300);
  const author = readTrimmedString(raw.author, 300);
  const coverUrl = readTrimmedString(raw.coverUrl, 2048);
  const canonicalSlug = readTrimmedString(raw.canonicalSlug, 160);
  const ownerId = readTrimmedString(raw.ownerId, 128);
  const bookCount =
    typeof raw.bookCount === "number" && Number.isFinite(raw.bookCount)
      ? Math.max(0, Math.trunc(raw.bookCount))
      : undefined;
  const covers = Array.isArray(raw.covers)
    ? raw.covers
        .map((cover) => readTrimmedString(cover, 2048))
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const quoteOwnerId = readTrimmedString(raw.quoteOwnerId, 128);
  const quoteText = readTrimmedString(raw.quoteText, 600);

  return {
    type,
    entityId,
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
    ...(coverUrl ? { coverUrl } : {}),
    ...(canonicalSlug ? { canonicalSlug } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(bookCount !== undefined ? { bookCount } : {}),
    ...(covers.length > 0 ? { covers } : {}),
    ...(quoteOwnerId ? { quoteOwnerId } : {}),
    ...(quoteText ? { quoteText } : {}),
  };
}

function normalizeLimit(value: unknown, fallbackValue: number, max: number): number {
  if (value === undefined || value === null) {
    return fallbackValue;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new HttpsError("invalid-argument", "limit must be a positive integer.");
  }
  return Math.min(value, max);
}

function normalizeIdempotencyKey(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "idempotencyKey must be a string.");
  }
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{8,96}$/.test(normalized)) {
    throw new HttpsError(
      "invalid-argument",
      "idempotencyKey must be 8-96 chars [A-Za-z0-9_-]."
    );
  }
  return normalized;
}

function toTimestamp(value: unknown): admin.firestore.Timestamp | null {
  if (!value) return null;
  if (value instanceof admin.firestore.Timestamp) {
    return value;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate?: unknown }).toDate === "function"
  ) {
    return value as admin.firestore.Timestamp;
  }
  return null;
}

function toIsoString(value: unknown): string {
  const timestamp = toTimestamp(value);
  if (timestamp) {
    return timestamp.toDate().toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return new Date().toISOString();
}

function conversationIdForUsers(uidA: string, uidB: string): string {
  const sorted = [uidA, uidB].sort();
  return `dm_${sorted[0]}__${sorted[1]}`;
}

function asParticipantProfile(payload: unknown): ParticipantProfile {
  const data = (payload ?? {}) as Record<string, unknown>;
  return {
    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Unknown",
    avatarUrl: typeof data.avatarUrl === "string" ? data.avatarUrl : "",
    handle: typeof data.handle === "string" ? data.handle : "",
  };
}

function normalizeConversationFolder(value: unknown): "inbox" | "requests" {
  if (value === undefined || value === null) return "inbox";
  if (value === "requests") return "requests";
  if (value === "inbox") return "inbox";
  throw new HttpsError("invalid-argument", "folder must be inbox or requests.");
}

function normalizePrivacyMode(value: unknown): DmPrivacyMode {
  if (value === "nobody" || value === "mutual_follows" || value === "everyone") {
    return value;
  }
  return "mutual_follows";
}

function normalizeReportReason(value: unknown): typeof DM_REPORT_REASONS[number] {
  const normalized = readTrimmedString(value, 32).toLowerCase();
  if ((DM_REPORT_REASONS as readonly string[]).includes(normalized)) {
    return normalized as typeof DM_REPORT_REASONS[number];
  }
  throw new HttpsError("invalid-argument", "reason is invalid.");
}

function normalizeOptionalReportDetails(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "details must be a string.");
  }
  return value.trim().slice(0, 1000);
}

function conversationStatus(data: Partial<ConversationDoc>): ConversationStatus {
  return data.status === "request_pending" || data.status === "request_declined"
    ? data.status
    : "active";
}

async function getDmPrivacyMode(uid: string): Promise<DmPrivacyMode> {
  const snap = await db.collection("notification_preferences").doc(uid).get();
  return normalizePrivacyMode(snap.data()?.dmPrivacyMode);
}

async function getRelationship(uid: string, peerUid: string): Promise<{
  senderFollowsRecipient: boolean;
  recipientFollowsSender: boolean;
}> {
  const [senderFollowsRecipient, recipientFollowsSender] = await Promise.all([
    db.collection("users").doc(peerUid).collection("followers").doc(uid).get(),
    db.collection("users").doc(uid).collection("followers").doc(peerUid).get(),
  ]);
  return {
    senderFollowsRecipient: senderFollowsRecipient.exists,
    recipientFollowsSender: recipientFollowsSender.exists,
  };
}

async function resolveInitialConversationStatus(uid: string, peerUid: string): Promise<ConversationStatus> {
  const privacyMode = await getDmPrivacyMode(peerUid);
  if (privacyMode === "nobody") {
    throw new HttpsError("failed-precondition", "This user is not accepting direct messages.");
  }
  if (privacyMode === "everyone") {
    return "active";
  }
  const relationship = await getRelationship(uid, peerUid);
  return relationship.senderFollowsRecipient && relationship.recipientFollowsSender
    ? "active"
    : "request_pending";
}

async function resolveAttachmentSnapshot(
  transaction: FirebaseFirestore.Transaction,
  attachment: { type: DirectMessageAttachmentType; entityId: string },
  uid: string
): Promise<DirectMessageAttachment> {
  if (attachment.type === "book") {
    const snap = await transaction.get(db.collection("books").doc(attachment.entityId));
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced book not found.");
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const title =
      readTrimmedString(data.titleEn, 300) ||
      readTrimmedString(data.titleAr, 300);
    const author =
      readTrimmedString(data.authorEn, 300) ||
      readTrimmedString(data.authorAr, 300);
    const coverUrl = readTrimmedString(data.coverUrl, 2048);

    return {
      type: "book",
      entityId: attachment.entityId,
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      ...(coverUrl ? { coverUrl } : {}),
    };
  }

  if (attachment.type === "publication") {
    const snap = await transaction.get(
      db.collection("longform_publications").doc(attachment.entityId)
    );
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced publication not found.");
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const ownerUid = readTrimmedString(data.ownerUid, 128);
    const visibility = readTrimmedString(data.visibility, 32).toLowerCase();
    if (ownerUid && ownerUid !== uid && visibility !== "public") {
      throw new HttpsError("permission-denied", "Referenced publication is not accessible.");
    }

    const title = readTrimmedString(data.title, 300);
    const author = readTrimmedString(data.authorDisplayName, 300);
    const coverUrl = readTrimmedString(data.coverUrl, 2048);
    const canonicalSlug = readTrimmedString(data.canonicalSlug, 160);

    return {
      type: "publication",
      entityId: attachment.entityId,
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      ...(coverUrl ? { coverUrl } : {}),
      ...(canonicalSlug ? { canonicalSlug } : {}),
    };
  }

  if (attachment.type === "author") {
    const snap = await transaction.get(db.collection("authors").doc(attachment.entityId));
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced author not found.");
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const title =
      readTrimmedString(data.nameEn, 300) ||
      readTrimmedString(data.nameAr, 300) ||
      readTrimmedString(data.name, 300);
    const author =
      readTrimmedString(data.countryEn, 300) ||
      readTrimmedString(data.countryAr, 300);
    const coverUrl = readTrimmedString(data.avatarUrl, 2048);

    return {
      type: "author",
      entityId: attachment.entityId,
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      ...(coverUrl ? { coverUrl } : {}),
    };
  }

  if (attachment.type === "shelf") {
    const docRef = db.collection("users").doc(uid).collection("shelves").doc(attachment.entityId);
    const snap = await transaction.get(docRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced shelf not found.");
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const ownerId =
      readTrimmedString(data.ownerId, 128) ||
      readTrimmedString(data.uid, 128) ||
      uid;
    const title =
      readTrimmedString(data.titleEn, 300) ||
      readTrimmedString(data.titleAr, 300) ||
      readTrimmedString(data.name, 300);
    const bookCount =
      typeof data.bookCount === "number" && Number.isFinite(data.bookCount)
        ? Math.max(0, Math.trunc(data.bookCount))
        : Array.isArray(data.bookIds)
          ? data.bookIds.length
          : undefined;

    return {
      type: "shelf",
      entityId: attachment.entityId,
      ...(title ? { title } : {}),
      ...(ownerId ? { ownerId } : {}),
      ...(bookCount !== undefined ? { bookCount } : {}),
    };
  }

  if (attachment.type === "venue") {
    const snap = await transaction.get(db.collection("venues").doc(attachment.entityId));
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced venue not found.");
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const title =
      readTrimmedString(data.name, 300) ||
      readTrimmedString(data.titleEn, 300) ||
      readTrimmedString(data.titleAr, 300);
    const author =
      readTrimmedString(data.address, 300) ||
      readTrimmedString(data.type, 300);
    const coverUrl = readTrimmedString(data.imageUrl, 2048);

    return {
      type: "venue",
      entityId: attachment.entityId,
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      ...(coverUrl ? { coverUrl } : {}),
    };
  }

  if (attachment.type === "media") {
    const snap = await transaction.get(db.collection("attachments").doc(attachment.entityId));
    if (!snap.exists) {
      throw new HttpsError("not-found", "Referenced media not found.");
    }
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const ownerUid = readTrimmedString(data.ownerUid, 128) || readTrimmedString(data.uploaderUid, 128);
    if (ownerUid && ownerUid !== uid) {
      throw new HttpsError("permission-denied", "Referenced media is not accessible.");
    }
    const title = readTrimmedString(data.fileName, 300) || readTrimmedString(data.name, 300) || "Media";
    const coverUrl = readTrimmedString(data.url, 2048) || readTrimmedString(data.downloadUrl, 2048);

    return {
      type: "media",
      entityId: attachment.entityId,
      title,
      ...(coverUrl ? { coverUrl } : {}),
    };
  }

  const quoteSnap = await transaction.get(
    db.collection(SOCIAL_QUOTE_PROJECTION_COLLECTION).doc(attachment.entityId)
  );
  if (!quoteSnap.exists) {
    throw new HttpsError("not-found", "Referenced quote not found.");
  }
  const data = (quoteSnap.data() ?? {}) as Record<string, unknown>;
  const quoteOwnerId = readTrimmedString(data.ownerId, 128) || readTrimmedString(data.authorUid, 128);
  const canonicalQuoteId = readTrimmedString(data.canonicalQuoteId, 256) || attachment.entityId;
  const quoteText =
    readTrimmedString(data.textEn, 600) ||
    readTrimmedString(data.textAr, 600) ||
    readTrimmedString(data.quoteText, 600);

  return {
    type: "quote",
    entityId: canonicalQuoteId,
    quoteOwnerId,
    ...(quoteText ? { quoteText } : {}),
  };
}

async function assertUserExists(uid: string): Promise<void> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "User not found.");
  }
  const data = snap.data();
  if (data?.isSuspended === true) {
    throw new HttpsError("failed-precondition", "Target user is not available.");
  }
}

async function assertNoBlockRelationship(uid: string, peerUid: string): Promise<void> {
  const [aBlocksB, bBlocksA] = await Promise.all([
    db.collection("users").doc(uid).collection("blocks").doc(peerUid).get(),
    db.collection("users").doc(peerUid).collection("blocks").doc(uid).get(),
  ]);

  if (aBlocksB.exists || bBlocksA.exists) {
    throw new HttpsError("failed-precondition", "Direct messaging is blocked.");
  }
}

export const createDirectConversation = onCall(DM_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const peerUid = normalizeUid((request.data as { peerUid?: unknown })?.peerUid, "peerUid");

  if (peerUid === uid) {
    throw new HttpsError("invalid-argument", "Cannot create a conversation with yourself.");
  }

  await Promise.all([assertUserExists(uid), assertUserExists(peerUid)]);
  await assertNoBlockRelationship(uid, peerUid);
  const initialStatus = await resolveInitialConversationStatus(uid, peerUid);

  const conversationId = conversationIdForUsers(uid, peerUid);
  const conversationRef = db.collection("conversations").doc(conversationId);

  await db.runTransaction(async (transaction) => {
    const [conversationSnap, userSnap, peerSnap] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(db.collection("users").doc(uid)),
      transaction.get(db.collection("users").doc(peerUid)),
    ]);

    const participantIds = [uid, peerUid].sort();

    if (conversationSnap.exists) {
      const existing = conversationSnap.data() as Partial<ConversationDoc>;
      const existingParticipants = Array.isArray(existing.participantIds)
        ? existing.participantIds
        : [];
      const sameParticipants =
        existingParticipants.length === 2 &&
        existingParticipants[0] === participantIds[0] &&
        existingParticipants[1] === participantIds[1];
      if (!sameParticipants) {
        throw new HttpsError("failed-precondition", "Conversation identity mismatch.");
      }
      return;
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const participantSet: Record<string, boolean> = {
      [participantIds[0]]: true,
      [participantIds[1]]: true,
    };

    const userProfile = asParticipantProfile(userSnap.data());
    const peerProfile = asParticipantProfile(peerSnap.data());

    const participantProfiles: Record<string, ParticipantProfile> = {
      [uid]: userProfile,
      [peerUid]: peerProfile,
    };

    const unreadCounts: Record<string, number> = {
      [uid]: 0,
      [peerUid]: 0,
    };

    const lastReadAtByUser: Record<string, admin.firestore.FieldValue> = {
      [uid]: now,
      [peerUid]: now,
    };

    transaction.set(conversationRef, {
      kind: "direct",
      participantIds,
      participantSet,
      participantProfiles,
      lastMessageText: "",
      lastMessageAt: null,
      lastMessageSenderId: null,
      unreadCounts,
      lastReadAtByUser,
      createdAt: now,
      updatedAt: now,
      status: initialStatus,
      requestedByUid: initialStatus === "request_pending" ? uid : null,
      acceptedAt: initialStatus === "active" ? now : null,
      declinedAt: null,
      version: 1,
    } satisfies ConversationDoc);
  });

  return { conversationId };
});

export const listDirectConversations = onCall(DM_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const listLimit = normalizeLimit(
    (request.data as { limit?: unknown })?.limit,
    MAX_CONVERSATION_LIST_LIMIT,
    MAX_CONVERSATION_LIST_LIMIT
  );
  const folder = normalizeConversationFolder((request.data as { folder?: unknown })?.folder);

  const snap = await db
    .collection("conversations")
    .where("participantIds", "array-contains", uid)
    .orderBy("updatedAt", "desc")
    .limit(listLimit)
    .get();

  const conversations = snap.docs
    .map((docSnap) => {
      const data = docSnap.data() as Partial<ConversationDoc>;
      const participantIds = Array.isArray(data.participantIds)
        ? data.participantIds
        : [];
      const contactId = participantIds.find((id) => id !== uid);
      if (!contactId) {
        return null;
      }
      const status = conversationStatus(data);
      const requestedByUid = typeof data.requestedByUid === "string" ? data.requestedByUid : null;
      if (folder === "requests") {
        if (status !== "request_pending" || requestedByUid === uid) return null;
      } else if (status !== "active") {
        return null;
      }

      const participantProfiles =
        data.participantProfiles && typeof data.participantProfiles === "object"
          ? data.participantProfiles
          : {};
      const contactProfile = asParticipantProfile(
        (participantProfiles as Record<string, unknown>)[contactId]
      );

      const unreadCounts =
        data.unreadCounts && typeof data.unreadCounts === "object"
          ? (data.unreadCounts as Record<string, unknown>)
          : {};
      const rawUnread = unreadCounts[uid];
      const unreadCount = typeof rawUnread === "number" && rawUnread > 0 ? Math.floor(rawUnread) : 0;

      return {
        id: docSnap.id,
        contactId,
        contactName: contactProfile.name,
        contactAvatar: contactProfile.avatarUrl,
        lastMessage: typeof data.lastMessageText === "string" ? data.lastMessageText : "",
        timestamp: toIsoString(data.lastMessageAt ?? data.updatedAt ?? data.createdAt),
        unreadCount,
        status,
        requestedByUid,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return { conversations };
});

export const listDirectMessages = onCall(DM_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const data = (request.data ?? {}) as {
    conversationId?: unknown;
    limit?: unknown;
  };
  const conversationId = normalizeUid(data.conversationId, "conversationId");
  const listLimit = normalizeLimit(
    data.limit,
    MAX_MESSAGES_LIST_LIMIT,
    MAX_MESSAGES_LIST_LIMIT
  );

  const conversationRef = db.collection("conversations").doc(conversationId);
  const conversationSnap = await conversationRef.get();
  if (!conversationSnap.exists) {
    throw new HttpsError("not-found", "Conversation not found.");
  }

  const conversation = conversationSnap.data() as Partial<ConversationDoc>;
  const participantSet =
    conversation.participantSet && typeof conversation.participantSet === "object"
      ? (conversation.participantSet as Record<string, unknown>)
      : {};
  if (participantSet[uid] !== true) {
    throw new HttpsError("permission-denied", "Not a conversation participant.");
  }

  const participantIds = Array.isArray(conversation.participantIds)
    ? conversation.participantIds
    : [];
  const peerUid = participantIds.find((id) => id !== uid) ?? null;
  const lastReadAtByUser =
    conversation.lastReadAtByUser && typeof conversation.lastReadAtByUser === "object"
      ? (conversation.lastReadAtByUser as Record<string, unknown>)
      : {};
  const peerReadTimestamp = peerUid ? toTimestamp(lastReadAtByUser[peerUid]) : null;
  const peerReadMillis = peerReadTimestamp ? peerReadTimestamp.toMillis() : null;

  const messagesSnap = await conversationRef
    .collection("messages")
    .orderBy("createdAt", "desc")
    .limit(listLimit)
    .get();

  const messages = messagesSnap.docs.reverse().map((messageSnap) => {
    const messageData = messageSnap.data() as Record<string, unknown>;
    const createdAt = toTimestamp(messageData.createdAt);
    const createdMillis = createdAt ? createdAt.toMillis() : null;
    const senderId =
      typeof messageData.senderId === "string" ? messageData.senderId : "unknown";
    const isReadByPeer =
      senderId === uid &&
      peerReadMillis !== null &&
      createdMillis !== null &&
      peerReadMillis >= createdMillis;

    return {
      id: messageSnap.id,
      senderId,
      text: typeof messageData.text === "string" ? messageData.text : "",
      ...(normalizeStoredAttachment(messageData.attachment)
        ? { attachment: normalizeStoredAttachment(messageData.attachment) }
        : {}),
      timestamp: toIsoString(messageData.createdAt),
      readByPeer: isReadByPeer,
      ...(isReadByPeer && peerReadTimestamp
        ? { seenAt: peerReadTimestamp.toDate().toISOString() }
        : {}),
    };
  });

  return { messages };
});

export const sendDirectMessage = onCall(DM_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const data = (request.data ?? {}) as {
    conversationId?: unknown;
    text?: unknown;
    attachment?: unknown;
    idempotencyKey?: unknown;
  };
  const conversationId = normalizeUid(data.conversationId, "conversationId");
  const text = normalizeOptionalText(data.text);
  const attachment = normalizeDirectMessageAttachment(data.attachment);
  const idempotencyKey = normalizeIdempotencyKey(data.idempotencyKey);
  if (!text && !attachment) {
    throw new HttpsError(
      "invalid-argument",
      "Message text or attachment is required."
    );
  }

  const conversationRef = db.collection("conversations").doc(conversationId);
  const messageRef = conversationRef.collection("messages").doc();
  const dedupeRef = conversationRef
    .collection("idempotency")
    .doc(`${uid}_${idempotencyKey}`);
  const rateRef = db.collection("users").doc(uid).collection("meta").doc("dm_rate_limit");

  const result = await db.runTransaction(async (transaction) => {
    const conversationSnap = await transaction.get(conversationRef);
    if (!conversationSnap.exists) {
      throw new HttpsError("not-found", "Conversation not found.");
    }

    const conversation = conversationSnap.data() as Partial<ConversationDoc>;
    const participantIds = Array.isArray(conversation.participantIds)
      ? conversation.participantIds
      : [];
    if (participantIds.length !== 2) {
      throw new HttpsError("failed-precondition", "Only direct conversations are supported.");
    }

    const participantSet =
      conversation.participantSet && typeof conversation.participantSet === "object"
        ? (conversation.participantSet as Record<string, unknown>)
        : {};
    if (participantSet[uid] !== true) {
      throw new HttpsError("permission-denied", "Not a conversation participant.");
    }

    const peerUid = participantIds.find((id) => id !== uid);
    if (!peerUid) {
      throw new HttpsError("failed-precondition", "Invalid direct conversation.");
    }
    const status = conversationStatus(conversation);
    const requestedByUid =
      typeof conversation.requestedByUid === "string" ? conversation.requestedByUid : null;
    if (status === "request_declined") {
      throw new HttpsError("failed-precondition", "Direct message request was declined.");
    }
    const shouldAcceptPendingRequest =
      status === "request_pending" && requestedByUid !== null && requestedByUid !== uid;

    const attachmentSnapshot = attachment
      ? await resolveAttachmentSnapshot(transaction, attachment, uid)
      : null;

    const prefRef = db.collection("notification_preferences").doc(peerUid);
    const [dedupeSnap, rateSnap, senderBlocksPeerSnap, peerBlocksSenderSnap, prefSnap] =
      await Promise.all([
        transaction.get(dedupeRef),
        transaction.get(rateRef),
        transaction.get(db.collection("users").doc(uid).collection("blocks").doc(peerUid)),
        transaction.get(db.collection("users").doc(peerUid).collection("blocks").doc(uid)),
        transaction.get(prefRef),
      ]);

    if (senderBlocksPeerSnap.exists || peerBlocksSenderSnap.exists) {
      throw new HttpsError("failed-precondition", "Direct messaging is blocked.");
    }

    if (dedupeSnap.exists) {
      const dedupeData = dedupeSnap.data() as { messageId?: unknown };
      const existingMessageId =
        typeof dedupeData.messageId === "string" ? dedupeData.messageId : "";
      if (!existingMessageId) {
        throw new HttpsError(
          "failed-precondition",
          "Idempotency state is invalid for this conversation."
        );
      }
      return {
        conversationId,
        messageId: existingMessageId,
      };
    }

    const nowMs = Date.now();
    const currentBucketStart = nowMs - (nowMs % RATE_WINDOW_MS);
    const rateData = (rateSnap.data() ?? {}) as Record<string, unknown>;
    const storedBucketStart =
      typeof rateData.bucketStartMs === "number" ? rateData.bucketStartMs : 0;
    const storedCount = typeof rateData.count === "number" ? rateData.count : 0;
    const sameWindow = storedBucketStart === currentBucketStart;
    const nextCount = sameWindow ? storedCount + 1 : 1;

    if (nextCount > MAX_MESSAGES_PER_MINUTE) {
      throw new HttpsError(
        "resource-exhausted",
        "Message rate limit exceeded. Please retry in one minute."
      );
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(
      rateRef,
      {
        bucketStartMs: currentBucketStart,
        count: nextCount,
        updatedAt: now,
      },
      { merge: true }
    );

    const unreadCounts =
      conversation.unreadCounts && typeof conversation.unreadCounts === "object"
        ? { ...(conversation.unreadCounts as Record<string, number>) }
        : {};

    for (const participantId of participantIds) {
      if (participantId === uid) {
        unreadCounts[participantId] = 0;
      } else {
        const current = Number(unreadCounts[participantId] ?? 0);
        unreadCounts[participantId] = Number.isFinite(current) ? current + 1 : 1;
      }
    }

    const lastReadAtByUser =
      conversation.lastReadAtByUser && typeof conversation.lastReadAtByUser === "object"
        ? { ...(conversation.lastReadAtByUser as Record<string, unknown>) }
        : {};
    lastReadAtByUser[uid] = now;

    const participantProfiles =
      conversation.participantProfiles && typeof conversation.participantProfiles === "object"
        ? (conversation.participantProfiles as Record<string, unknown>)
        : {};
    const senderProfile = asParticipantProfile(participantProfiles[uid]);
    const senderName = senderProfile.name || "Someone";
    const conversationPreviewText =
      text ||
      (attachmentSnapshot
        ? `Shared ${attachmentSnapshot.type === "author" ? "an" : "a"} ${attachmentSnapshot.type}`
        : "");

    transaction.set(messageRef, {
      senderId: uid,
      text,
      ...(attachmentSnapshot ? { attachment: attachmentSnapshot } : {}),
      createdAt: now,
      idempotencyKey,
      version: 1,
    });

    transaction.set(dedupeRef, {
      senderId: uid,
      messageId: messageRef.id,
      createdAt: now,
    });

    transaction.set(
      conversationRef,
      {
        lastMessageText: conversationPreviewText,
        lastMessageAt: now,
        lastMessageSenderId: uid,
        unreadCounts,
        lastReadAtByUser,
        updatedAt: now,
        ...(shouldAcceptPendingRequest
          ? {
              status: "active",
              acceptedAt: now,
              declinedAt: null,
            }
          : {}),
      },
      { merge: true }
    );

    let canSendInAppNotification = true;
    if (prefSnap.exists) {
      const prefData = prefSnap.data() as Record<string, unknown>;
      const channels =
        prefData.channels && typeof prefData.channels === "object"
          ? (prefData.channels as Record<string, unknown>)
          : {};
      const categories =
        prefData.categories && typeof prefData.categories === "object"
          ? (prefData.categories as Record<string, unknown>)
          : {};

      canSendInAppNotification = channels.in_app !== false && categories.messages !== false;
    } else {
      transaction.set(
        prefRef,
        {
          uid: peerUid,
          channels: {
            in_app: true,
            email: false,
            push: false,
          },
          categories: {
            likes: true,
            comments: true,
            reposts: true,
            follows: true,
            mentions: true,
            quotes: true,
            system: true,
            messages: true,
          },
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    if (canSendInAppNotification) {
      const preview =
        conversationPreviewText.length > 96
          ? `${conversationPreviewText.slice(0, 93).trimEnd()}...`
          : conversationPreviewText;
      const notificationId = `dm_${conversationId}_${messageRef.id}_${peerUid}`;
      const notificationRef = db.collection("notifications").doc(notificationId);
      const unreadRef = db.collection("users").doc(peerUid).collection("meta").doc("unread");
      const summaryRef = notificationSummaryRef(peerUid);

      transaction.set(notificationRef, {
        uid: peerUid,
        type: "dm",
        priority: "medium",
        actor: { uid, name: senderName },
        target: { entity_type: "conversation", entity_id: conversationId },
        actorId: uid,
        actorType: "user",
        entityType: "conversation",
        entityId: conversationId,
        postId: null,
        message: `${senderName}: ${preview}`,
        createdAt: now,
        readAt: null,
        read: false,
        sourceActivityId: `dm_${messageRef.id}`,
        dedupeId: notificationId,
        count: 1,
      });

      transaction.set(
        unreadRef,
        {
          notificationsCount: admin.firestore.FieldValue.increment(1),
          lastUpdatedAt: now,
        },
        { merge: true }
      );
      transaction.set(
        summaryRef,
        buildNotificationSummaryPatch({
          unreadCount: admin.firestore.FieldValue.increment(1),
          latestNotificationAt: now,
        }),
        { merge: true }
      );
    }

    return {
      conversationId,
      messageId: messageRef.id,
    };
  });

  return result;
});

export const markDirectConversationRead = onCall(DM_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const conversationId = normalizeUid(
    (request.data as { conversationId?: unknown })?.conversationId,
    "conversationId"
  );

  const conversationRef = db.collection("conversations").doc(conversationId);

  await db.runTransaction(async (transaction) => {
    const conversationSnap = await transaction.get(conversationRef);
    if (!conversationSnap.exists) {
      throw new HttpsError("not-found", "Conversation not found.");
    }

    const conversation = conversationSnap.data() as Partial<ConversationDoc>;
    const participantSet =
      conversation.participantSet && typeof conversation.participantSet === "object"
        ? (conversation.participantSet as Record<string, unknown>)
        : {};
    if (participantSet[uid] !== true) {
      throw new HttpsError("permission-denied", "Not a conversation participant.");
    }

    const unreadCounts =
      conversation.unreadCounts && typeof conversation.unreadCounts === "object"
        ? { ...(conversation.unreadCounts as Record<string, number>) }
        : {};
    unreadCounts[uid] = 0;

    const now = admin.firestore.FieldValue.serverTimestamp();
    const lastReadAtByUser =
      conversation.lastReadAtByUser && typeof conversation.lastReadAtByUser === "object"
        ? { ...(conversation.lastReadAtByUser as Record<string, unknown>) }
        : {};
    lastReadAtByUser[uid] = now;

    transaction.set(
      conversationRef,
      {
        unreadCounts,
        lastReadAtByUser,
      },
      { merge: true }
    );
  });

  const unreadNotificationsSnap = await db
    .collection("notifications")
    .where("uid", "==", uid)
    .where("type", "==", "dm")
    .where("entityId", "==", conversationId)
    .where("read", "==", false)
    .limit(DM_NOTIFICATION_CLEAR_LIMIT)
    .get();

  if (!unreadNotificationsSnap.empty) {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    unreadNotificationsSnap.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        read: true,
        readAt: now,
      });
    });
    batch.set(
      db.collection("users").doc(uid).collection("meta").doc("unread"),
      {
        notificationsCount: admin.firestore.FieldValue.increment(-unreadNotificationsSnap.docs.length),
        lastUpdatedAt: now,
      },
      { merge: true }
    );
    batch.set(
      notificationSummaryRef(uid),
      buildNotificationSummaryPatch({
        unreadCount: admin.firestore.FieldValue.increment(-unreadNotificationsSnap.docs.length),
        lastReadAt: now,
      }),
      { merge: true }
    );
    await batch.commit();
  }

  return {
    conversationId,
    unreadCount: 0,
    clearedNotificationCount: unreadNotificationsSnap.docs.length,
  };
});

export const acceptDirectMessageRequest = onCall(DM_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const conversationId = normalizeUid(
    (request.data as { conversationId?: unknown })?.conversationId,
    "conversationId"
  );
  const conversationRef = db.collection("conversations").doc(conversationId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(conversationRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Conversation not found.");
    }
    const data = snap.data() as Partial<ConversationDoc>;
    const participantSet =
      data.participantSet && typeof data.participantSet === "object"
        ? (data.participantSet as Record<string, unknown>)
        : {};
    if (participantSet[uid] !== true) {
      throw new HttpsError("permission-denied", "Not a conversation participant.");
    }
    if (conversationStatus(data) !== "request_pending") {
      throw new HttpsError("failed-precondition", "Conversation is not a pending request.");
    }
    if (data.requestedByUid === uid) {
      throw new HttpsError("failed-precondition", "Requester cannot accept their own request.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(
      conversationRef,
      {
        status: "active",
        acceptedAt: now,
        declinedAt: null,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  return { conversationId, status: "active" };
});

export const declineDirectMessageRequest = onCall(DM_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const conversationId = normalizeUid(
    (request.data as { conversationId?: unknown })?.conversationId,
    "conversationId"
  );
  const conversationRef = db.collection("conversations").doc(conversationId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(conversationRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Conversation not found.");
    }
    const data = snap.data() as Partial<ConversationDoc>;
    const participantSet =
      data.participantSet && typeof data.participantSet === "object"
        ? (data.participantSet as Record<string, unknown>)
        : {};
    if (participantSet[uid] !== true) {
      throw new HttpsError("permission-denied", "Not a conversation participant.");
    }
    if (conversationStatus(data) !== "request_pending") {
      throw new HttpsError("failed-precondition", "Conversation is not a pending request.");
    }
    if (data.requestedByUid === uid) {
      throw new HttpsError("failed-precondition", "Requester cannot decline their own request.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(
      conversationRef,
      {
        status: "request_declined",
        declinedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  return { conversationId, status: "request_declined" };
});

export const reportDirectMessage = onCall(DM_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const data = (request.data ?? {}) as Record<string, unknown>;
  const conversationId = normalizeUid(data.conversationId, "conversationId");
  const messageId = normalizeUid(data.messageId, "messageId");
  const reason = normalizeReportReason(data.reason);
  const details = normalizeOptionalReportDetails(data.details);

  const conversationRef = db.collection("conversations").doc(conversationId);
  const messageRef = conversationRef.collection("messages").doc(messageId);
  const reportRef = db.collection("reports").doc(`dm_${uid}_${conversationId}_${messageId}`);

  await db.runTransaction(async (transaction) => {
    const [conversationSnap, messageSnap, reportSnap] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(messageRef),
      transaction.get(reportRef),
    ]);
    if (!conversationSnap.exists || !messageSnap.exists) {
      throw new HttpsError("not-found", "Message not found.");
    }
    const conversation = conversationSnap.data() as Partial<ConversationDoc>;
    const participantSet =
      conversation.participantSet && typeof conversation.participantSet === "object"
        ? (conversation.participantSet as Record<string, unknown>)
        : {};
    if (participantSet[uid] !== true) {
      throw new HttpsError("permission-denied", "Not a conversation participant.");
    }
    if (reportSnap.exists) return;

    const message = messageSnap.data() as Record<string, unknown>;
    const senderId = readTrimmedString(message.senderId, 128);
    const participantIds = Array.isArray(conversation.participantIds)
      ? conversation.participantIds.filter((id): id is string => typeof id === "string")
      : [];
    const recipientId = participantIds.find((id) => id !== senderId) || "";
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(reportRef, {
      entityType: "direct_message",
      entityId: messageId,
      conversationId,
      messageId,
      reportedByUid: uid,
      reason,
      details,
      status: "open",
      evidence: {
        text: typeof message.text === "string" ? message.text : "",
        senderId,
        recipientId,
        conversationId,
        messageId,
        createdAt: message.createdAt ?? null,
        attachment: normalizeStoredAttachment(message.attachment) ?? null,
      },
      createdAt: now,
      updatedAt: now,
      version: "1.0",
    });
  });

  return { success: true };
});

export const reportConversation = onCall(DM_CALLABLE_OPTIONS, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const data = (request.data ?? {}) as Record<string, unknown>;
  const conversationId = normalizeUid(data.conversationId, "conversationId");
  const reason = normalizeReportReason(data.reason);
  const details = normalizeOptionalReportDetails(data.details);

  const conversationRef = db.collection("conversations").doc(conversationId);
  const reportRef = db.collection("reports").doc(`dm_conversation_${uid}_${conversationId}`);

  await db.runTransaction(async (transaction) => {
    const [conversationSnap, reportSnap] = await Promise.all([
      transaction.get(conversationRef),
      transaction.get(reportRef),
    ]);
    if (!conversationSnap.exists) {
      throw new HttpsError("not-found", "Conversation not found.");
    }
    const conversation = conversationSnap.data() as Partial<ConversationDoc>;
    const participantSet =
      conversation.participantSet && typeof conversation.participantSet === "object"
        ? (conversation.participantSet as Record<string, unknown>)
        : {};
    if (participantSet[uid] !== true) {
      throw new HttpsError("permission-denied", "Not a conversation participant.");
    }
    if (reportSnap.exists) return;

    const participantIds = Array.isArray(conversation.participantIds)
      ? conversation.participantIds.filter((id): id is string => typeof id === "string")
      : [];
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(reportRef, {
      entityType: "direct_conversation",
      entityId: conversationId,
      conversationId,
      reportedByUid: uid,
      participantIds,
      reason,
      details,
      status: "open",
      evidence: {
        conversationId,
        participantIds,
        lastMessageText: conversation.lastMessageText ?? "",
        lastMessageAt: conversation.lastMessageAt ?? null,
        lastMessageSenderId: conversation.lastMessageSenderId ?? null,
      },
      createdAt: now,
      updatedAt: now,
      version: "1.0",
    });
  });

  return { success: true };
});
