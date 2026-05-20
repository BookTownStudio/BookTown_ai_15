import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { admin } from "../firebaseAdmin";
import { assertRoleAtLeast } from "../control/assertRole";
import { listFeedbackAttachmentsForAdmin } from "./feedbackAttachments";
import type {
  AdminAddFeedbackNoteResponse,
  AdminFeedbackActivity,
  AdminFeedbackReport,
  AdminExportFeedbackCsvResponse,
  AdminExportFeedbackJsonResponse,
  AdminExportFeedbackRequest,
  AdminGetFeedbackReportResponse,
  AdminListFeedbackReportsRequest,
  AdminListFeedbackReportsResponse,
  FeedbackExportRow,
  FeedbackStatus,
} from "../contracts/shared/apiContracts";

const FEEDBACK_COLLECTION = "feedback_reports";
const ACTIVITY_COLLECTION = "activity";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_EXPORT_ROWS = 5000;
const EXPORT_COLUMNS: Array<keyof FeedbackExportRow> = [
  "feedbackId",
  "createdAt",
  "updatedAt",
  "status",
  "source",
  "intentType",
  "text",
  "contactEmail",
  "route",
  "entityType",
  "entityId",
  "appVersion",
  "platform",
  "assignedTo",
];
const STATUS_TRANSITIONS: Record<FeedbackStatus, readonly FeedbackStatus[]> = {
  new: ["triaged", "in_progress", "rejected"],
  triaged: ["in_progress", "resolved", "rejected"],
  in_progress: ["resolved", "rejected"],
  resolved: ["closed", "in_progress"],
  closed: [],
  rejected: ["triaged"],
};

const db = admin.firestore();

type CursorPayload = {
  createdAtMillis: number;
  id: string;
};

function toIsoTimestamp(value: unknown): string {
  if (value && typeof value === "object" && typeof (value as { toDate?: unknown }).toDate === "function") {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function toMillis(value: unknown): number {
  if (value && typeof value === "object" && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return new Date(toIsoTimestamp(value)).getTime();
}

function toTimestamp(value: string): FirebaseFirestore.Timestamp {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new HttpsError("invalid-argument", "Invalid timestamp filter.");
  }
  return admin.firestore.Timestamp.fromMillis(millis);
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): CursorPayload | null {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (
      typeof decoded.createdAtMillis === "number" &&
      Number.isFinite(decoded.createdAtMillis) &&
      typeof decoded.id === "string" &&
      decoded.id.trim()
    ) {
      return { createdAtMillis: decoded.createdAtMillis, id: decoded.id.trim() };
    }
  } catch {
    // fall through
  }
  throw new HttpsError("invalid-argument", "Invalid feedback pagination cursor.");
}

function normalizeLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

function normalizeExportLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? MAX_EXPORT_ROWS, 1), MAX_EXPORT_ROWS);
}

function serializeReport(id: string, data: FirebaseFirestore.DocumentData): AdminFeedbackReport {
  return {
    id,
    uid: typeof data.uid === "string" ? data.uid : "",
    source: data.source,
    intentType: data.intentType,
    status: data.status,
    text: typeof data.text === "string" ? data.text : "",
    contactEmail: typeof data.contactEmail === "string" ? data.contactEmail : null,
    clientContext: data.clientContext && typeof data.clientContext === "object" ? data.clientContext : null,
    serverContext: data.serverContext && typeof data.serverContext === "object"
      ? data.serverContext
      : {
          authRole: "unknown",
          callableRegion: "unknown",
          correlationId: "unknown",
          schemaVersion: 1,
        },
    createdAt: toIsoTimestamp(data.createdAt),
    updatedAt: toIsoTimestamp(data.updatedAt),
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : null,
  };
}

function serializeActivity(id: string, data: FirebaseFirestore.DocumentData): AdminFeedbackActivity {
  return {
    id,
    type: data.type,
    actorUid: typeof data.actorUid === "string" ? data.actorUid : "",
    createdAt: toIsoTimestamp(data.createdAt),
    payload: data.payload && typeof data.payload === "object" ? data.payload : {},
  };
}

function readStringField(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toExportRow(report: AdminFeedbackReport): FeedbackExportRow {
  const context = report.clientContext && typeof report.clientContext === "object"
    ? report.clientContext as Record<string, unknown>
    : {};
  const entity = context.entity && typeof context.entity === "object"
    ? context.entity as Record<string, unknown>
    : {};
  const assignedToValue = (report as unknown as Record<string, unknown>).assignedTo;
  return {
    feedbackId: report.id,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
    status: report.status,
    source: report.source,
    intentType: report.intentType,
    text: report.text,
    contactEmail: report.contactEmail,
    route: readStringField(context, "route"),
    entityType: readStringField(entity, "type"),
    entityId: readStringField(entity, "id"),
    appVersion: readStringField(context, "appVersion"),
    platform: readStringField(context, "platform"),
    assignedTo: typeof assignedToValue === "string"
      ? (assignedToValue.trim() || null)
      : null,
  };
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function rowsToCsv(rows: FeedbackExportRow[]): string {
  const header = EXPORT_COLUMNS.join(",");
  const body = rows.map((row) =>
    EXPORT_COLUMNS.map((column) => csvEscape(row[column])).join(",")
  );
  return [header, ...body].join("\n");
}

function buildExportFilename(kind: "csv" | "json"): string {
  return `booktown-feedback-${new Date().toISOString().slice(0, 10)}.${kind}`;
}

function applyFeedbackFilters(
  query: FirebaseFirestore.Query,
  payload: AdminListFeedbackReportsRequest | AdminExportFeedbackRequest
): FirebaseFirestore.Query {
  let next = query;
  if (payload.status) next = next.where("status", "==", payload.status);
  if (payload.source) next = next.where("source", "==", payload.source);
  if (payload.intentType) next = next.where("intentType", "==", payload.intentType);
  if (payload.createdFrom) next = next.where("createdAt", ">=", toTimestamp(payload.createdFrom));
  if (payload.createdTo) next = next.where("createdAt", "<=", toTimestamp(payload.createdTo));
  return next;
}

async function loadExportRows(payload: AdminExportFeedbackRequest): Promise<FeedbackExportRow[]> {
  if (payload.feedbackId) {
    const { report } = await loadReport(payload.feedbackId);
    return [toExportRow(report)];
  }

  let query = applyFeedbackFilters(db.collection(FEEDBACK_COLLECTION), payload)
    .orderBy("createdAt", "desc")
    .orderBy(admin.firestore.FieldPath.documentId(), "desc")
    .limit(normalizeExportLimit(payload.limit));

  const snap = await query.get();
  return snap.docs.map((doc) => toExportRow(serializeReport(doc.id, doc.data())));
}

async function loadReport(feedbackId: string): Promise<{ ref: FirebaseFirestore.DocumentReference; report: AdminFeedbackReport; raw: FirebaseFirestore.DocumentData }> {
  const ref = db.collection(FEEDBACK_COLLECTION).doc(feedbackId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Feedback report not found.");
  }
  const raw = snap.data() ?? {};
  return { ref, report: serializeReport(snap.id, raw), raw };
}

export const adminListFeedbackReports = onCall({ cors: true }, async (request): Promise<AdminListFeedbackReportsResponse> => {
  const { uid } = assertRoleAtLeast(request, "moderator");
  const payload = request.data as AdminListFeedbackReportsRequest;
  const pageSize = normalizeLimit(payload.limit);
  const cursor = decodeCursor(payload.cursor);

  let query = applyFeedbackFilters(db.collection(FEEDBACK_COLLECTION), payload)
    .orderBy("createdAt", "desc")
    .orderBy(admin.firestore.FieldPath.documentId(), "desc");
  if (cursor) {
    query = query.startAfter(admin.firestore.Timestamp.fromMillis(cursor.createdAtMillis), cursor.id);
  }

  const snap = await query.limit(pageSize + 1).get();
  const visibleDocs = snap.docs.slice(0, pageSize);
  const reports = visibleDocs.map((doc) => serializeReport(doc.id, doc.data()));
  const lastDoc = visibleDocs[visibleDocs.length - 1];
  const nextCursor = snap.docs.length > pageSize && lastDoc
    ? encodeCursor({ createdAtMillis: toMillis(lastDoc.data().createdAt), id: lastDoc.id })
    : null;

  logger.info("[FEEDBACK_ADMIN][LIST]", {
    actorUid: uid,
    count: reports.length,
    hasNextPage: nextCursor !== null,
    filters: {
      status: payload.status ?? null,
      source: payload.source ?? null,
      intentType: payload.intentType ?? null,
      createdFrom: payload.createdFrom ?? null,
      createdTo: payload.createdTo ?? null,
    },
  });

  return { reports, nextCursor };
});

export const adminGetFeedbackReport = onCall({ cors: true }, async (request): Promise<AdminGetFeedbackReportResponse> => {
  const { uid } = assertRoleAtLeast(request, "moderator");
  const feedbackId = (request.data as { feedbackId: string }).feedbackId;
  const { ref, report } = await loadReport(feedbackId);
  const activitySnap = await ref.collection(ACTIVITY_COLLECTION).orderBy("createdAt", "asc").limit(200).get();

  logger.info("[FEEDBACK_ADMIN][GET]", { actorUid: uid, feedbackId });

  return {
    report,
    activity: activitySnap.docs.map((doc) => serializeActivity(doc.id, doc.data())),
    attachments: await listFeedbackAttachmentsForAdmin(feedbackId),
  };
});

export const adminUpdateFeedbackStatus = onCall({ cors: true }, async (request): Promise<{ report: AdminFeedbackReport }> => {
  const { uid } = assertRoleAtLeast(request, "moderator");
  const payload = request.data as { feedbackId: string; status: FeedbackStatus };
  const now = admin.firestore.Timestamp.now();

  const report = await db.runTransaction(async (transaction) => {
    const ref = db.collection(FEEDBACK_COLLECTION).doc(payload.feedbackId);
    const snap = await transaction.get(ref);
    if (!snap.exists) {
      throw new HttpsError("not-found", "Feedback report not found.");
    }

    const raw = snap.data() ?? {};
    const currentStatus = raw.status as FeedbackStatus;
    if (currentStatus === payload.status) {
      return serializeReport(snap.id, raw);
    }

    const allowed = STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(payload.status)) {
      throw new HttpsError("failed-precondition", `Invalid feedback status transition: ${currentStatus} -> ${payload.status}`);
    }

    transaction.update(ref, {
      status: payload.status,
      updatedAt: now,
      updatedBy: uid,
    });
    transaction.set(ref.collection(ACTIVITY_COLLECTION).doc(), {
      type: "status_changed",
      actorUid: uid,
      createdAt: now,
      payload: {
        fromStatus: currentStatus,
        toStatus: payload.status,
      },
    });

    return serializeReport(snap.id, {
      ...raw,
      status: payload.status,
      updatedAt: now,
      updatedBy: uid,
    });
  });

  logger.info("[FEEDBACK_ADMIN][STATUS_UPDATED]", {
    actorUid: uid,
    feedbackId: payload.feedbackId,
    status: payload.status,
  });

  return { report };
});

export const adminAddFeedbackNote = onCall({ cors: true }, async (request): Promise<AdminAddFeedbackNoteResponse> => {
  const { uid } = assertRoleAtLeast(request, "moderator");
  const payload = request.data as { feedbackId: string; note: string };
  const { ref } = await loadReport(payload.feedbackId);
  const now = admin.firestore.Timestamp.now();
  const activityRef = ref.collection(ACTIVITY_COLLECTION).doc();
  const activity = {
    type: "note_added",
    actorUid: uid,
    createdAt: now,
    payload: {
      note: payload.note.trim(),
    },
  };

  await db.runTransaction(async (transaction) => {
    transaction.set(activityRef, activity);
    transaction.update(ref, {
      updatedAt: now,
      updatedBy: uid,
    });
  });

  logger.info("[FEEDBACK_ADMIN][NOTE_ADDED]", {
    actorUid: uid,
    feedbackId: payload.feedbackId,
    activityId: activityRef.id,
  });

  return {
    activity: serializeActivity(activityRef.id, activity),
  };
});

export const adminExportFeedbackCsv = onCall({ cors: true }, async (request): Promise<AdminExportFeedbackCsvResponse> => {
  const { uid } = assertRoleAtLeast(request, "moderator");
  const payload = request.data as AdminExportFeedbackRequest;
  try {
    const rows = await loadExportRows(payload);
    logger.info("[FEEDBACK_ADMIN][EXPORT]", {
      actorUid: uid,
      exportType: "csv",
      rowCount: rows.length,
      feedbackId: payload.feedbackId ?? null,
      filters: {
        status: payload.status ?? null,
        source: payload.source ?? null,
        intentType: payload.intentType ?? null,
        createdFrom: payload.createdFrom ?? null,
        createdTo: payload.createdTo ?? null,
      },
    });
    return {
      filename: buildExportFilename("csv"),
      mimeType: "text/csv; charset=utf-8",
      rowCount: rows.length,
      csv: rowsToCsv(rows),
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("[FEEDBACK_ADMIN][EXPORT_FAILED]", {
      actorUid: uid,
      exportType: "csv",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

export const adminExportFeedbackJson = onCall({ cors: true }, async (request): Promise<AdminExportFeedbackJsonResponse> => {
  const { uid } = assertRoleAtLeast(request, "moderator");
  const payload = request.data as AdminExportFeedbackRequest;
  try {
    const rows = await loadExportRows(payload);
    const generatedAt = new Date().toISOString();
    logger.info("[FEEDBACK_ADMIN][EXPORT]", {
      actorUid: uid,
      exportType: "json",
      rowCount: rows.length,
      feedbackId: payload.feedbackId ?? null,
      filters: {
        status: payload.status ?? null,
        source: payload.source ?? null,
        intentType: payload.intentType ?? null,
        createdFrom: payload.createdFrom ?? null,
        createdTo: payload.createdTo ?? null,
      },
    });
    return {
      filename: buildExportFilename("json"),
      mimeType: "application/json; charset=utf-8",
      rowCount: rows.length,
      export: {
        schemaVersion: 1,
        generatedAt,
        filters: payload,
        rows,
      },
    };
  } catch (error) {
    logger.error("[FEEDBACK_ADMIN][EXPORT_FAILED]", {
      actorUid: uid,
      exportType: "json",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});
