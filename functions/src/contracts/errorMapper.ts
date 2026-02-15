import { ErrorCode, DEFAULT_ERROR_MESSAGES } from "./shared/errorCodes";

type CanonicalError = {
  code: ErrorCode;
  message: string;
  details?: unknown;
};

const FIREBASE_TO_CANONICAL: Record<string, ErrorCode> = {
  "invalid-argument": "INVALID_ARGUMENT",
  unauthenticated: "UNAUTHENTICATED",
  "permission-denied": "PERMISSION_DENIED",
  "not-found": "NOT_FOUND",
  "failed-precondition": "FAILED_PRECONDITION",
  "resource-exhausted": "RESOURCE_EXHAUSTED",
  "deadline-exceeded": "DEADLINE_EXCEEDED",
  unavailable: "UNAVAILABLE",
  internal: "INTERNAL",
};

function asMessage(error: unknown): string | null {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim().length > 0) {
      return message;
    }
  }

  return null;
}

function asCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.trim().length > 0) {
      return code.trim().toLowerCase();
    }
  }

  return null;
}

export function fromValidationFailure(
  stage: "request" | "response",
  details: unknown
): CanonicalError {
  if (stage === "request") {
    return {
      code: "INVALID_REQUEST_SCHEMA",
      message: DEFAULT_ERROR_MESSAGES.INVALID_REQUEST_SCHEMA,
      details,
    };
  }

  return {
    code: "INVALID_RESPONSE_SCHEMA",
    message: DEFAULT_ERROR_MESSAGES.INVALID_RESPONSE_SCHEMA,
    details,
  };
}

export function fromError(error: unknown): CanonicalError {
  const message = asMessage(error);
  const rawCode = asCode(error);
  const mappedCode = rawCode ? FIREBASE_TO_CANONICAL[rawCode] : undefined;

  if (mappedCode) {
    return {
      code: mappedCode,
      message: message ?? DEFAULT_ERROR_MESSAGES[mappedCode],
    };
  }

  const normalizedMessage = message?.toLowerCase() ?? "";
  if (
    normalizedMessage.includes("iam.serviceaccounts.signblob") ||
    (normalizedMessage.includes("permission") &&
      normalizedMessage.includes("signblob"))
  ) {
    return {
      code: "INTERNAL",
      message: "Storage URL signing is not configured for this environment.",
    };
  }

  return {
    code: "UNKNOWN",
    message: message ?? DEFAULT_ERROR_MESSAGES.UNKNOWN,
  };
}

export function fromHttpStatus(
  status: number,
  body?: unknown
): CanonicalError {
  const statusMap: Record<number, ErrorCode> = {
    400: "INVALID_ARGUMENT",
    401: "UNAUTHENTICATED",
    403: "PERMISSION_DENIED",
    404: "NOT_FOUND",
    409: "FAILED_PRECONDITION",
    412: "FAILED_PRECONDITION",
    429: "RESOURCE_EXHAUSTED",
    503: "UNAVAILABLE",
    504: "DEADLINE_EXCEEDED",
  };

  const code = statusMap[status] ?? (status >= 500 ? "INTERNAL" : "UNKNOWN");

  let message: string | undefined;
  if (body && typeof body === "object" && "error" in body) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string" && err.trim().length > 0) {
      message = err;
    }
  }

  return {
    code,
    message: message ?? DEFAULT_ERROR_MESSAGES[code],
  };
}
