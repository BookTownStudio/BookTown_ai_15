import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebase.ts";

type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

type FailureEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

function toError(endpoint: string, code: string, message: string): Error {
  return new Error(`[${endpoint}] [${code}] ${message}`);
}

export function extractCallableData<T>(
  endpoint: string,
  payload: unknown
): T {
  if (!payload || typeof payload !== "object") {
    throw new Error(`[${endpoint}] Invalid callable response envelope.`);
  }

  const envelope = payload as
    | SuccessEnvelope<T>
    | FailureEnvelope
    | { success?: boolean; data?: unknown; error?: unknown };

  if (envelope.success === false) {
    const error =
      envelope && typeof envelope === "object" && "error" in envelope
        ? (envelope as FailureEnvelope).error
        : undefined;

    const code =
      error && typeof error.code === "string" && error.code.trim()
        ? error.code.trim()
        : "UNKNOWN";
    const message =
      error && typeof error.message === "string" && error.message.trim()
        ? error.message.trim()
        : "Callable request failed.";

    throw toError(endpoint, code, message);
  }

  if (envelope.success !== true || !("data" in envelope)) {
    throw new Error(`[${endpoint}] Missing success envelope data.`);
  }

  return (envelope as SuccessEnvelope<T>).data;
}

export async function callCallableEndpoint<Req, Res>(
  endpoint: string,
  payload: Req
): Promise<Res> {
  const fn = httpsCallable<Req, SuccessEnvelope<Res> | FailureEnvelope>(
    getFirebaseFunctions(),
    endpoint
  );
  const result = await fn(payload);
  return extractCallableData<Res>(endpoint, result.data);
}
