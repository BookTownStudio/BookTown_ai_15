import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import {
  computeReadingProgressMutation,
  ReadingState,
} from "./readingProgressStateMachine";
import {
  resolveAuthoritativeRecommendationOrigin,
  sanitizeRecommendationOrigin,
} from "../attribution/recommendationOrigin";

const db = admin.firestore();

type ReaderSyncOpType =
  | "upsert_progress"
  | "upsert_highlight"
  | "delete_highlight"
  | "upsert_bookmark"
  | "delete_bookmark";

interface ReaderSyncOperation {
  opId: string;
  idempotencyKey: string;
  type: ReaderSyncOpType;
  bookId: string;
  clientTimestampMs: number;
  payload?: Record<string, unknown>;
}

interface ReaderSyncError {
  opId: string;
  code: string;
  message: string;
}

const MAX_OPS_PER_CALL = 100;
const ID_TOKEN_PATTERN = /^[A-Za-z0-9:_-]{1,128}$/;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function asFiniteInt(value: unknown): number | null {
  const n = asFiniteNumber(value);
  if (n === null) return null;
  return Math.trunc(n);
}

function asPositiveInt(value: unknown): number | null {
  const n = asFiniteInt(value);
  if (n === null || n <= 0) return null;
  return n;
}

function asNonNegativeInt(value: unknown): number | null {
  const n = asFiniteInt(value);
  if (n === null || n < 0) return null;
  return n;
}

function sanitizeCanonicalAnchor(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const kind = asNonEmptyString(record.kind);
  const manifestVersion = asPositiveInt(record.manifestVersion);

  if (!kind || manifestVersion === null) {
    return null;
  }

  switch (kind) {
  case "epub_point": {
    const locationId = asNonEmptyString(record.locationId);
    const spineItemId = asNonEmptyString(record.spineItemId);
    const cfi = asNonEmptyString(record.cfi);
    if (!locationId || !spineItemId || !cfi) return null;
    return { kind, manifestVersion, locationId, spineItemId, cfi };
  }
  case "epub_range": {
    const startLocationId = asNonEmptyString(record.startLocationId);
    const endLocationId = asNonEmptyString(record.endLocationId);
    const spineItemId = asNonEmptyString(record.spineItemId);
    const startCfi = asNonEmptyString(record.startCfi);
    const endCfi = asNonEmptyString(record.endCfi);
    if (!startLocationId || !endLocationId || !spineItemId || !startCfi || !endCfi) {
      return null;
    }
    return {
      kind,
      manifestVersion,
      startLocationId,
      endLocationId,
      spineItemId,
      startCfi,
      endCfi,
    };
  }
  case "pdf_point": {
    const locationId = asNonEmptyString(record.locationId);
    const pageIndex = asNonNegativeInt(record.pageIndex);
    const textOffset = asNonNegativeInt(record.textOffset);
    if (!locationId || pageIndex === null || textOffset === null) return null;
    return { kind, manifestVersion, locationId, pageIndex, textOffset };
  }
  case "pdf_range": {
    const startLocationId = asNonEmptyString(record.startLocationId);
    const endLocationId = asNonEmptyString(record.endLocationId);
    const pageIndex = asNonNegativeInt(record.pageIndex);
    const startOffset = asNonNegativeInt(record.startOffset);
    const endOffset = asNonNegativeInt(record.endOffset);
    const quote = typeof record.quote === "string" ? record.quote : null;
    const prefix = typeof record.prefix === "string" ? record.prefix : null;
    const suffix = typeof record.suffix === "string" ? record.suffix : null;
    if (
      !startLocationId ||
      !endLocationId ||
      pageIndex === null ||
      startOffset === null ||
      endOffset === null ||
      quote === null ||
      prefix === null ||
      suffix === null
    ) {
      return null;
    }
    return {
      kind,
      manifestVersion,
      startLocationId,
      endLocationId,
      pageIndex,
      startOffset,
      endOffset,
      quote,
      prefix,
      suffix,
    };
  }
  default:
    return null;
  }
}

function assertTokenLike(value: string, fieldName: string): void {
  if (!ID_TOKEN_PATTERN.test(value)) {
    throw new Error(`${fieldName} is invalid.`);
  }
}

function sanitizeOperation(raw: unknown): ReaderSyncOperation {
  const record =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;

  if (!record) {
    throw new Error("Operation must be an object.");
  }

  const opId = asNonEmptyString(record.opId);
  if (!opId) throw new Error("opId is required.");
  assertTokenLike(opId, "opId");

  const type = asNonEmptyString(record.type) as ReaderSyncOpType | null;
  if (
    !type ||
    ![
      "upsert_progress",
      "upsert_highlight",
      "delete_highlight",
      "upsert_bookmark",
      "delete_bookmark",
    ].includes(type)
  ) {
    throw new Error("type is invalid.");
  }

  const bookId = asNonEmptyString(record.bookId);
  if (!bookId) throw new Error("bookId is required.");
  assertTokenLike(bookId, "bookId");

  const idempotencyKey = asNonEmptyString(record.idempotencyKey) || opId;
  assertTokenLike(idempotencyKey, "idempotencyKey");

  const clientTimestampMs = asFiniteInt(record.clientTimestampMs);
  if (clientTimestampMs === null || clientTimestampMs <= 0) {
    throw new Error("clientTimestampMs is required.");
  }

  const payload =
    record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : undefined;

  return {
    opId,
    idempotencyKey,
    type,
    bookId,
    clientTimestampMs,
    payload,
  };
}

function resolveProgressState(payload: Record<string, unknown> | undefined): ReadingState | undefined {
  const raw = asNonEmptyString(payload?.status_state);
  if (raw === "reading" || raw === "paused" || raw === "completed") {
    return raw;
  }
  return undefined;
}

async function applyProgressOperationInTx(params: {
  tx: FirebaseFirestore.Transaction;
  uid: string;
  op: ReaderSyncOperation;
  now: Timestamp;
}): Promise<void> {
  const { tx, uid, op, now } = params;
  const payload = op.payload || {};
  const percentage = asFiniteNumber(payload.percentage);
  if (percentage === null || percentage < 0 || percentage > 1) {
    throw new Error("payload.percentage must be between 0 and 1.");
  }

  const lastPosition =
    payload.lastPosition && typeof payload.lastPosition === "object"
      ? payload.lastPosition
      : null;
  const lastAnchor = sanitizeCanonicalAnchor(payload.lastAnchor);
  const requestedState = resolveProgressState(payload);
  const recommendationOrigin = sanitizeRecommendationOrigin(payload.recommendationContext);

  const progressId = `${uid}_${op.bookId}`;
  const progressRef = db.collection("reading_progress").doc(progressId);
  const eventsRef = db.collection("reader_events");
  const progressSnap = await tx.get(progressRef);
  const previousData = progressSnap.exists ? progressSnap.data() || {} : {};
  const existingRecommendationOrigin = sanitizeRecommendationOrigin(
    previousData.recommendationOrigin
  );
  const authoritativeRecommendationOrigin =
    existingRecommendationOrigin ||
    (recommendationOrigin
      ? await resolveAuthoritativeRecommendationOrigin({
        uid,
        bookId: op.bookId,
        input: recommendationOrigin,
        tx,
      })
      : null);

  const mutation = computeReadingProgressMutation({
    uid,
    bookId: op.bookId,
    normalizedProgress: percentage,
    normalizedLastPosition: lastPosition,
    requestedStateRaw: requestedState,
    now,
    previousData,
  });

  const progressPayload: Record<string, unknown> = {
    ...mutation.payload,
    updatedAt: FieldValue.serverTimestamp(),
    ...(authoritativeRecommendationOrigin
      ? { recommendationOrigin: authoritativeRecommendationOrigin }
      : {}),
  };

  if (lastAnchor) {
    progressPayload.lastAnchor = lastAnchor;
    progressPayload.anchorManifestVersion = lastAnchor.manifestVersion;
  }

  tx.set(progressRef, progressPayload, { merge: true });

  if (mutation.event) {
    tx.set(eventsRef.doc(), {
      uid,
      bookId: op.bookId,
      event: mutation.event,
      fromState: mutation.previousState,
      toState: mutation.nextState,
      progress: percentage,
      occurredAt: now,
      ...(authoritativeRecommendationOrigin
        ? { recommendationOrigin: authoritativeRecommendationOrigin }
        : {}),
    });
  }
}

function resolveEntityId(payload: Record<string, unknown> | undefined, field: string): string {
  const value = asNonEmptyString(payload?.[field]);
  if (!value) {
    throw new Error(`payload.${field} is required.`);
  }
  assertTokenLike(value, field);
  return value;
}

async function applyOperationInTx(params: {
  tx: FirebaseFirestore.Transaction;
  uid: string;
  op: ReaderSyncOperation;
  now: Timestamp;
}): Promise<void> {
  const { tx, uid, op, now } = params;

  if (op.type === "upsert_progress") {
    await applyProgressOperationInTx({
      tx,
      uid,
      op,
      now,
    });
    return;
  }

  if (op.type === "upsert_highlight") {
    const highlightId = resolveEntityId(op.payload, "highlightId");
    const ref = db.collection("reader_highlights").doc(`${uid}_${op.bookId}_${highlightId}`);
    const anchor = sanitizeCanonicalAnchor(op.payload?.anchor);
    const highlightPayload: Record<string, unknown> = {
      uid,
      bookId: op.bookId,
      highlightId,
      quote: asNonEmptyString(op.payload?.quote) || "",
      note: asNonEmptyString(op.payload?.note) || "",
      color: asNonEmptyString(op.payload?.color) || "yellow",
      cfi: asNonEmptyString(op.payload?.cfi) || null,
      page: asFiniteInt(op.payload?.page),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    };

    if (anchor) {
      highlightPayload.anchor = anchor;
      highlightPayload.anchorManifestVersion = anchor.manifestVersion;
    }

    tx.set(
      ref,
      highlightPayload,
      { merge: true }
    );
    return;
  }

  if (op.type === "delete_highlight") {
    const highlightId = resolveEntityId(op.payload, "highlightId");
    const ref = db.collection("reader_highlights").doc(`${uid}_${op.bookId}_${highlightId}`);
    tx.delete(ref);
    return;
  }

  if (op.type === "upsert_bookmark") {
    const bookmarkId = resolveEntityId(op.payload, "bookmarkId");
    const ref = db.collection("reader_bookmarks").doc(`${uid}_${op.bookId}_${bookmarkId}`);
    const anchor = sanitizeCanonicalAnchor(op.payload?.anchor);
    const bookmarkPayload: Record<string, unknown> = {
      uid,
      bookId: op.bookId,
      bookmarkId,
      label: asNonEmptyString(op.payload?.label) || "",
      cfi: asNonEmptyString(op.payload?.cfi) || null,
      page: asFiniteInt(op.payload?.page),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    };

    if (anchor) {
      bookmarkPayload.anchor = anchor;
      bookmarkPayload.anchorManifestVersion = anchor.manifestVersion;
    }

    tx.set(
      ref,
      bookmarkPayload,
      { merge: true }
    );
    return;
  }

  if (op.type === "delete_bookmark") {
    const bookmarkId = resolveEntityId(op.payload, "bookmarkId");
    const ref = db.collection("reader_bookmarks").doc(`${uid}_${op.bookId}_${bookmarkId}`);
    tx.delete(ref);
    return;
  }

  throw new Error("Unsupported operation type.");
}

export const syncReaderOperationsHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const uid = request.auth.uid;
  const operationsRaw = request.data?.operations;
  if (!Array.isArray(operationsRaw) || operationsRaw.length === 0) {
    throw new HttpsError("invalid-argument", "operations must be a non-empty array.");
  }

  if (operationsRaw.length > MAX_OPS_PER_CALL) {
    throw new HttpsError(
      "invalid-argument",
      `operations exceeds max size (${MAX_OPS_PER_CALL}).`
    );
  }

  logger.info("[READER][SYNC_OPS_REQUEST]", {
    uid,
    requestedOps: operationsRaw.length,
  });

  const sanitizedOps: ReaderSyncOperation[] = [];
  const errors: ReaderSyncError[] = [];

  for (let i = 0; i < operationsRaw.length; i += 1) {
    try {
      sanitizedOps.push(sanitizeOperation(operationsRaw[i]));
    } catch (error: any) {
      const fallbackOpId = `invalid_${i}`;
      errors.push({
        opId: fallbackOpId,
        code: "invalid-argument",
        message: String(error?.message || error),
      });
    }
  }

  let applied = 0;
  let deduped = 0;

  for (const op of sanitizedOps) {
    try {
      const result = await db.runTransaction(async (tx) => {
        const dedupeId = `${uid}_${op.idempotencyKey}`;
        const dedupeRef = db.collection("reader_sync_idempotency").doc(dedupeId);
        const dedupeSnap = await tx.get(dedupeRef);

        if (dedupeSnap.exists) {
          return "deduped" as const;
        }

        const now = Timestamp.now();
        await applyOperationInTx({
          tx,
          uid,
          op,
          now,
        });

        tx.set(dedupeRef, {
          uid,
          bookId: op.bookId,
          opId: op.opId,
          idempotencyKey: op.idempotencyKey,
          type: op.type,
          clientTimestampMs: op.clientTimestampMs,
          appliedAt: FieldValue.serverTimestamp(),
        });

        return "applied" as const;
      });

      if (result === "deduped") {
        deduped += 1;
      } else {
        applied += 1;
      }
    } catch (error: any) {
      errors.push({
        opId: op.opId,
        code: error instanceof HttpsError ? error.code : "internal",
        message: String(error?.message || error),
      });
    }
  }

  const accepted = sanitizedOps.length;
  const rejected = errors.length;

  logger.info("[READER][SYNC_OPS_RESULT]", {
    uid,
    accepted,
    applied,
    deduped,
    rejected,
  });

  return {
    accepted,
    applied,
    deduped,
    rejected,
    errors,
  };
};

export const syncReaderOperations = onCall({ cors: true }, syncReaderOperationsHandler);
