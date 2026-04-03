import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "../firebase.ts";
import { SearchResultDTO } from "../../types/bookSearch.ts";

export type AcquireExternalEbookForReadParams =
  | { bookId: string }
  | { source: "googleBooks" | "openLibrary"; providerExternalId: string };

export type AcquireExternalEbookForReadResult = {
  bookId: string;
  editionId?: string;
  status: "already_available" | "acquired";
  provider: "booktown" | "openLibrary" | "gutenberg" | "hindawi" | "gallica";
  format: "epub" | "pdf" | "unknown";
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEnvelope<T>(value: unknown): T {
  const payload = value as any;
  if (payload?.success === false) {
    const code = asString(payload?.error?.code) || "unknown";
    const message = asString(payload?.error?.message) || "Callable request failed.";
    const error = new Error(`[${code}] ${message}`);
    (error as Error & { code?: string }).code = code;
    throw error;
  }
  return (payload?.success === true ? payload.data : payload) as T;
}

export function buildAcquireExternalReadParams(
  result: SearchResultDTO
): AcquireExternalEbookForReadParams | null {
  if (result.resultType === "canonical" && asString(result.bookId)) {
    return { bookId: asString(result.bookId) };
  }

  if (result.source === "googleBooks" || result.source === "openLibrary") {
    const providerExternalId = asString(result.externalId) || asString(result.id);
    if (!providerExternalId) return null;
    return {
      source: result.source,
      providerExternalId,
    };
  }

  return null;
}

export async function acquireExternalEbookForRead(
  params: AcquireExternalEbookForReadParams
): Promise<AcquireExternalEbookForReadResult> {
  const fn = httpsCallable<
    AcquireExternalEbookForReadParams,
    AcquireExternalEbookForReadResult
  >(getFirebaseFunctions(), "acquireExternalEbookForRead");

  const response = await fn(params);
  const payload = normalizeEnvelope<AcquireExternalEbookForReadResult>(response.data);

  if (!asString(payload.bookId)) {
    throw new Error("Invalid acquisition response.");
  }

  return payload;
}
