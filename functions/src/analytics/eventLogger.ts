import { admin } from "../firebaseAdmin";
import { createHash } from "crypto";

const db = admin.firestore();

export type SystemEventType =
  | "user_created"
  | "post_created"
  | "review_created"
  | "quote_created"
  | "follow_created"
  | "deletion_request_created"
  | "deletion_executed"
  | "post_viewed"
  | "book_opened"
  | "read_session_started"
  | "read_session_ended"
  | "write_project_opened"
  | "write_project_saved";

const ALLOWED_EVENT_TYPES: Set<SystemEventType> = new Set([
  "user_created",
  "post_created",
  "review_created",
  "quote_created",
  "follow_created",
  "deletion_request_created",
  "deletion_executed",
  "post_viewed",
  "book_opened",
  "read_session_started",
  "read_session_ended",
  "write_project_opened",
  "write_project_saved",
]);

const MAX_METADATA_BYTES = 2048;
const MAX_ENTITY_ID_LENGTH = 200;
const MAX_DEDUPE_KEY_LENGTH = 200;

function validateMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return;

  const json = JSON.stringify(metadata);
  const bytes = Buffer.byteLength(json, "utf8");

  if (bytes > MAX_METADATA_BYTES) {
    throw new Error("Event metadata exceeds size limit.");
  }
}

function validateEntityId(entityId?: string) {
  if (!entityId) return;

  if (typeof entityId !== "string") {
    throw new Error("entityId must be a string.");
  }

  if (entityId.length > MAX_ENTITY_ID_LENGTH) {
    throw new Error("entityId exceeds maximum length.");
  }
}

function validateDedupeKey(dedupeKey?: string) {
  if (!dedupeKey) return;

  if (typeof dedupeKey !== "string") {
    throw new Error("dedupeKey must be a string.");
  }

  if (dedupeKey.length > MAX_DEDUPE_KEY_LENGTH) {
    throw new Error("dedupeKey exceeds maximum length.");
  }
}

function generateDeterministicId(
  type: SystemEventType,
  uid: string,
  createdAtMillis: number,
  entityId?: string,
  dedupeKey?: string
): string {
  const base = dedupeKey
    ? `${type}|${uid}|${dedupeKey}|${entityId ?? ""}`
    : `${type}|${uid}|${createdAtMillis}|${entityId ?? ""}`;
  return createHash("sha256").update(base).digest("hex");
}

export async function logSystemEvent(params: {
  type: SystemEventType;
  uid: string;
  entityId?: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
  environment: "prod" | "staging";
  appVersion: string;
}) {
  const { type, uid, entityId, dedupeKey, metadata, environment, appVersion } = params;

  if (!ALLOWED_EVENT_TYPES.has(type)) {
    throw new Error(`Event type not allowed: ${type}`);
  }

  if (!uid || typeof uid !== "string") {
    throw new Error("Invalid uid for event logging.");
  }

  validateEntityId(entityId);
  validateDedupeKey(dedupeKey);
  validateMetadata(metadata);

  const createdAt = admin.firestore.Timestamp.now();
  const createdAtMillis = createdAt.toMillis();

  const eventId = generateDeterministicId(
    type,
    uid,
    createdAtMillis,
    entityId,
    dedupeKey
  );

  await db
    .collection("system_events")
    .doc(eventId)
    .set(
      {
        type,
        uid,
        entityId: entityId ?? null,
        metadata: metadata ?? null,
        environment,
        appVersion,
        createdAt,
      },
      { merge: true }
    );
}
