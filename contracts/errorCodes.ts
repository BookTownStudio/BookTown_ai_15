import { z } from "zod";

export const ERROR_CODES = [
  "INVALID_REQUEST_SCHEMA",
  "INVALID_RESPONSE_SCHEMA",
  "CONTRACT_NOT_FOUND",
  "INVALID_ARGUMENT",
  "UNAUTHENTICATED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "FAILED_PRECONDITION",
  "RESOURCE_EXHAUSTED",
  "DEADLINE_EXCEEDED",
  "UNAVAILABLE",
  "INTERNAL",
  "UNKNOWN",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

export const DEFAULT_ERROR_MESSAGES: Record<ErrorCode, string> = {
  INVALID_REQUEST_SCHEMA: "Request validation failed.",
  INVALID_RESPONSE_SCHEMA: "Response validation failed.",
  CONTRACT_NOT_FOUND: "Contract not found for endpoint.",
  INVALID_ARGUMENT: "Invalid request arguments.",
  UNAUTHENTICATED: "Authentication required.",
  PERMISSION_DENIED: "Permission denied.",
  NOT_FOUND: "Requested resource was not found.",
  FAILED_PRECONDITION: "Request precondition failed.",
  RESOURCE_EXHAUSTED: "Resource exhausted.",
  DEADLINE_EXCEEDED: "Deadline exceeded.",
  UNAVAILABLE: "Service temporarily unavailable.",
  INTERNAL: "Internal server error.",
  UNKNOWN: "Unexpected error.",
};
