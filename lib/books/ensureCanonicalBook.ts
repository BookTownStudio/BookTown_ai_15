import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from '../firebase.ts';

export type EnsureCanonicalBookResult = {
  canonicalBookId: string;
  bookId: string;
  editionId?: string;
  status?: string;
};

type EnsureCanonicalBookIngestionParams = {
  providerExternalId: string;
  source: 'googleBooks' | 'openLibrary';
  rawBook: Record<string, unknown>;
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

function isIngestionParams(value: EnsureCanonicalBookParams): value is EnsureCanonicalBookIngestionParams {
  const record = value as Record<string, unknown>;
  return (
    typeof record.providerExternalId === 'string' &&
    (record.source === 'googleBooks' || record.source === 'openLibrary') &&
    !!record.rawBook &&
    typeof record.rawBook === 'object'
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

function buildRawBookFromNavigationParams(
  params: EnsureCanonicalBookNavigationParams,
  parsed: { source: 'googleBooks' | 'openLibrary'; providerExternalId: string }
): Record<string, unknown> {
  const title = String(params.title || '').trim() || 'Unknown Title';
  const author = String(params.author || '').trim() || 'Unknown';
  const externalId = parsed.providerExternalId;

  return {
    id: externalId,
    externalId,
    source: parsed.source,
    title,
    titleEn: title,
    titleAr: '',
    authors: [author],
    authorEn: author,
    authorAr: '',
    description: '',
    descriptionEn: '',
    descriptionAr: '',
    coverUrl: String(params.coverUrl || '').trim(),
  };
}

export async function ensureCanonicalBook(
  params: EnsureCanonicalBookParams
): Promise<EnsureCanonicalBookResult | null> {
  try {
    let resolvedParams: EnsureCanonicalBookIngestionParams;

    if (isIngestionParams(params)) {
      resolvedParams = params;
    } else {
      const navigationParams = params as EnsureCanonicalBookNavigationParams;
      const incomingBookId = String(navigationParams.bookId || '').trim();
      if (!incomingBookId) {
        return null;
      }

      const parsedSynthetic = parseSyntheticBookId(incomingBookId);
      if (!parsedSynthetic) {
        return {
          canonicalBookId: incomingBookId,
          bookId: incomingBookId,
          status: 'ALREADY_CANONICAL',
        };
      }

      resolvedParams = {
        providerExternalId: parsedSynthetic.providerExternalId,
        source: parsedSynthetic.source,
        rawBook: buildRawBookFromNavigationParams(navigationParams, parsedSynthetic),
      };
    }

    const functions = getFirebaseFunctions();
    const ingestFn = httpsCallable(functions, 'ingestBook');
    const result = await ingestFn({
      providerExternalId: resolvedParams.providerExternalId,
      source: resolvedParams.source,
      rawBook: resolvedParams.rawBook,
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
            source: resolvedParams.source,
            providerExternalId: resolvedParams.providerExternalId,
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
