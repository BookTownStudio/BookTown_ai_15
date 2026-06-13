import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase.ts';

export type EnsureCanonicalBookResult = {
  canonicalBookId: string;
  bookId: string;
  primaryEditionId?: string;
  editionId?: string;
  status?: string;
};

type EnsureCanonicalBookIngestionParams = {
  providerExternalId: string;
  source: 'googleBooks' | 'openLibrary';
  rawBook?: Record<string, unknown>;
};

type EnsureCanonicalBookNavigationParams = {
  bookId: string;
  title?: string;
  author?: string;
  coverUrl?: string;
};

export type EnsureCanonicalBookParams =
  | EnsureCanonicalBookIngestionParams
  | EnsureCanonicalBookNavigationParams;

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

type CallableEnvelope<T> = SuccessEnvelope<T> | FailureEnvelope;

function isIngestionParams(value: EnsureCanonicalBookParams): value is EnsureCanonicalBookIngestionParams {
  const record = value as Record<string, unknown>;
  return (
    typeof record.providerExternalId === 'string' &&
    (record.source === 'googleBooks' || record.source === 'openLibrary') &&
    (record.rawBook === undefined ||
      (!!record.rawBook && typeof record.rawBook === 'object'))
  );
}

function parseSyntheticBookId(bookId: string): { source: 'googleBooks' | 'openLibrary'; providerExternalId: string } | null {
  const normalized = String(bookId || '').trim();
  if (!normalized) return null;

  const ext = normalized.match(/^ext_(googlebooks|openlibrary)_(.+)$/i);
  if (ext) {
    const provider = ext[1].toLowerCase();
    const externalId = ext[2].trim();
    if (!externalId) return null;
    return {
      source: provider === 'googlebooks' ? 'googleBooks' : 'openLibrary',
      providerExternalId: externalId,
    };
  }

  const gb = normalized.match(/^gb_(.+)$/i);
  if (gb) {
    const externalId = gb[1].trim();
    if (!externalId) return null;
    return { source: 'googleBooks', providerExternalId: externalId };
  }

  const ol = normalized.match(/^ol_(.+)$/i);
  if (ol) {
    const externalId = ol[1].trim();
    if (!externalId) return null;
    return { source: 'openLibrary', providerExternalId: externalId };
  }

  return null;
}

export async function ensureCanonicalBook(
  params: EnsureCanonicalBookParams
): Promise<EnsureCanonicalBookResult | null> {
  try {
    let requestPayload: Record<string, unknown>;

    if (isIngestionParams(params)) {
      requestPayload = {
        providerExternalId: params.providerExternalId,
        source: params.source,
      };
      if (params.rawBook && typeof params.rawBook === 'object') {
        requestPayload.rawBook = params.rawBook;
      }
    } else {
      const navigationParams = params as EnsureCanonicalBookNavigationParams;
      const incomingBookId = String(navigationParams.bookId || '').trim();
      if (!incomingBookId) {
        return null;
      }

      const parsedSynthetic = parseSyntheticBookId(incomingBookId);
      if (!parsedSynthetic) {
        requestPayload = {
          bookId: incomingBookId,
        };
      } else {
        requestPayload = {
          providerExternalId: parsedSynthetic.providerExternalId,
          source: parsedSynthetic.source,
        };
      }
    }

    const functions = getFirebaseFunctions();
    const ingestFn = httpsCallable(functions, 'ingestBook');

    const result = await ingestFn(requestPayload);

    const payload = result?.data as unknown;
    const envelope =
      payload && typeof payload === 'object'
        ? (payload as CallableEnvelope<EnsureCanonicalBookResult>)
        : null;
    const data =
      envelope?.success === true
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
          requestPayload
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
