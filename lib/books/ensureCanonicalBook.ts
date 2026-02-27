import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase.ts';

export type EnsureCanonicalBookResult = {
  canonicalBookId: string;
  bookId: string;
  editionId?: string;
  status?: string;
};

type EnsureCanonicalBookParams = {
  providerExternalId: string;
  source: 'googleBooks' | 'openLibrary';
  rawBook: Record<string, unknown>;
};

type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

type FailureEnvelope = {
  success: false;
  error?: {
    code?: string;
    message?: string;
  };
};

export async function ensureCanonicalBook(
  params: EnsureCanonicalBookParams
): Promise<EnsureCanonicalBookResult | null> {
  try {
    const functions = getFirebaseFunctions();
    const ingestFn = httpsCallable(functions, 'ingestBook');
    const result = await ingestFn({
      providerExternalId: params.providerExternalId,
      source: params.source,
      rawBook: params.rawBook,
    });

    const payload = result?.data as unknown;
    const envelope =
      payload && typeof payload === 'object'
        ? (payload as Partial<SuccessEnvelope<EnsureCanonicalBookResult>> & FailureEnvelope)
        : null;
    const data =
      envelope?.success === true && envelope.data
        ? envelope.data
        : (payload as Partial<EnsureCanonicalBookResult> | null);

    if (envelope?.success === false) {
      console.warn('[ensureCanonicalBook][BACKEND_FAILURE]', envelope.error);
      return null;
    }

    const canonicalBookId =
      typeof data?.canonicalBookId === 'string' && data.canonicalBookId.trim().length > 0
        ? data.canonicalBookId
        : typeof data?.bookId === 'string' && data.bookId.trim().length > 0
        ? data.bookId
        : null;

    if (!canonicalBookId) {
      if (import.meta.env.DEV) {
        console.assert(
          false,
          '[ensureCanonicalBook] Canonical resolution failed',
          {
            source: params.source,
            providerExternalId: params.providerExternalId,
          }
        );
        throw new Error('Canonical resolution failed');
      }
      return null;
    }

    return {
      canonicalBookId,
      bookId: canonicalBookId,
      editionId: data?.editionId,
      status: data?.status,
    };
  } catch (error) {
    console.warn('[ensureCanonicalBook][FAILURE]', error);
    return null;
  }
}
