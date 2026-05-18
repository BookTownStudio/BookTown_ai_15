import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

type ReaderDiagnosticSeverity = "info" | "warn" | "error";

const MAX_PAYLOAD_KEYS = 24;
const MAX_STRING_LENGTH = 160;
const SAFE_EVENT_NAMES = new Set([
  "reader_bootstrap_start",
  "reader_bootstrap_success",
  "reader_bootstrap_failed",
  "reader_manifest_failed",
  "reader_manifest_pending",
  "reader_runtime_failed",
  "reader_runtime_ready",
  "reader_replay_flush",
  "reader_replay_failed",
  "reader_continuity_write_failed",
]);
const SAFE_PAYLOAD_KEYS = new Set([
  "bookId",
  "format",
  "engine",
  "phase",
  "category",
  "code",
  "severity",
  "correlationId",
  "manifestVersion",
  "pipelineVersion",
  "locationMapStatus",
  "sectionGraphStatus",
  "stableAnchorMapStatus",
  "navigationIndexStatus",
  "searchIndexStatus",
  "highlightAnchorsStatus",
  "accepted",
  "applied",
  "deduped",
  "rejected",
  "failureRate",
  "durationMs",
  "queueSize",
  "remainingQueueSize",
  "isOffline",
  "recoverable",
]);
const FORBIDDEN_KEY_PATTERN = /(text|quote|note|highlight|selection|content|cfi|anchor|url|signed|storagePath)/i;

function asNonEmptyString(value: unknown, maxLength = MAX_STRING_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function sanitizeSeverity(value: unknown): ReaderDiagnosticSeverity {
  return value === "error" || value === "warn" || value === "info" ? value : "info";
}

function sanitizePayload(value: unknown): Record<string, string | number | boolean | null> {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const output: Record<string, string | number | boolean | null> = {};

  for (const [key, rawValue] of Object.entries(input)) {
    if (Object.keys(output).length >= MAX_PAYLOAD_KEYS) break;
    if (!SAFE_PAYLOAD_KEYS.has(key) || FORBIDDEN_KEY_PATTERN.test(key)) continue;

    if (typeof rawValue === "string") {
      output[key] = rawValue.trim().slice(0, MAX_STRING_LENGTH);
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      output[key] = Number.isInteger(rawValue) ? rawValue : Number(rawValue.toFixed(4));
    } else if (typeof rawValue === "boolean" || rawValue === null) {
      output[key] = rawValue;
    }
  }

  return output;
}

export const recordReaderDiagnosticHandler = async (request: any) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const uid = request.auth.uid;
  const data =
    request.data && typeof request.data === "object" && !Array.isArray(request.data)
      ? (request.data as Record<string, unknown>)
      : {};
  const eventName = asNonEmptyString(data.eventName, 96);
  if (!eventName || !SAFE_EVENT_NAMES.has(eventName)) {
    throw new HttpsError("invalid-argument", "Invalid reader diagnostic event.");
  }

  const severity = sanitizeSeverity(data.severity);
  const payload = sanitizePayload(data.payload);
  const diagnostic = {
    uid,
    eventName,
    severity,
    ...payload,
  };

  if (severity === "error") {
    logger.error("[READER][DIAGNOSTIC]", diagnostic);
  } else if (severity === "warn") {
    logger.warn("[READER][DIAGNOSTIC]", diagnostic);
  } else {
    logger.info("[READER][DIAGNOSTIC]", diagnostic);
  }

  return { ok: true };
};

export const recordReaderDiagnostic = onCall(
  { cors: true },
  recordReaderDiagnosticHandler
);
