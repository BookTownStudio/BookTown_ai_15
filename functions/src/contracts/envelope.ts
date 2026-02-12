import { DEFAULT_ERROR_MESSAGES, ErrorCode } from "./shared/errorCodes";

export type FailureEnvelope = {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

export type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

export function successEnvelope<T>(data: T): SuccessEnvelope<T> {
  return {
    success: true,
    data,
  };
}

export function failureEnvelope(
  code: ErrorCode,
  message?: string,
  details?: unknown
): FailureEnvelope {
  return {
    success: false,
    error: {
      code,
      message: message && message.trim().length > 0 ? message : DEFAULT_ERROR_MESSAGES[code],
      ...(details === undefined ? {} : { details }),
    },
  };
}
