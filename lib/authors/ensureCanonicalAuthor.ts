import { httpsCallable } from "firebase/functions";

import { getFirebaseFunctions } from "../firebase.ts";

export type EnsureCanonicalAuthorResult = {
  canonicalAuthorId: string;
  authorId: string;
  canonicalKey: string;
  status: string;
  providerExternalId?: string;
};

type EnsureCanonicalAuthorIngestionParams = {
  providerExternalId: string;
  source: "openLibrary" | "wikidata";
  rawAuthor: Record<string, unknown>;
};

type EnsureCanonicalAuthorNavigationParams = {
  authorId: string;
  source?: "openLibrary" | "wikidata";
  nameEn?: string;
  nameAr?: string;
  avatarUrl?: string;
};

type EnsureCanonicalAuthorParams =
  | EnsureCanonicalAuthorIngestionParams
  | EnsureCanonicalAuthorNavigationParams;

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

function isIngestionParams(
  value: EnsureCanonicalAuthorParams
): value is EnsureCanonicalAuthorIngestionParams {
  const record = value as Record<string, unknown>;

  return (
    typeof record.providerExternalId === "string" &&
    (record.source === "openLibrary" || record.source === "wikidata") &&
    Boolean(record.rawAuthor) &&
    typeof record.rawAuthor === "object"
  );
}

function parseSyntheticAuthorId(
  authorId: string
): { source: "openLibrary" | "wikidata"; providerExternalId: string } | null {
  const normalized = String(authorId || "").trim();
  if (!normalized) {
    return null;
  }

  const openLibrary = normalized.match(/^(?:ol_author_|author_ol_|ext_author_openlibrary_)?(OL\d+A)$/i);
  if (openLibrary) {
    return {
      source: "openLibrary",
      providerExternalId: openLibrary[1].toUpperCase(),
    };
  }

  const wikidata = normalized.match(/^(?:wd_|qid_|author_wikidata_)?(Q\d+)$/i);
  if (wikidata) {
    return {
      source: "wikidata",
      providerExternalId: wikidata[1].toUpperCase(),
    };
  }

  return null;
}

function buildRawAuthorFromNavigationParams(
  params: EnsureCanonicalAuthorNavigationParams
): Record<string, unknown> {
  const nameEn = String(params.nameEn || "").trim() || "Unknown";
  const nameAr = String(params.nameAr || "").trim();

  return {
    id: params.authorId,
    nameEn,
    nameAr,
    avatarUrl: String(params.avatarUrl || "").trim(),
  };
}

export async function ensureCanonicalAuthor(
  params: EnsureCanonicalAuthorParams
): Promise<EnsureCanonicalAuthorResult | null> {
  try {
    let resolvedParams: EnsureCanonicalAuthorIngestionParams;

    if (isIngestionParams(params)) {
      resolvedParams = params;
    } else {
      const navigationParams = params as EnsureCanonicalAuthorNavigationParams;
      const incomingAuthorId = String(navigationParams.authorId || "").trim();
      if (!incomingAuthorId) {
        return null;
      }

      const parsedSynthetic = parseSyntheticAuthorId(incomingAuthorId);
      if (!parsedSynthetic) {
        return {
          canonicalAuthorId: incomingAuthorId,
          authorId: incomingAuthorId,
          canonicalKey: "",
          status: "ALREADY_CANONICAL",
        };
      }

      resolvedParams = {
        providerExternalId: parsedSynthetic.providerExternalId,
        source: navigationParams.source || parsedSynthetic.source,
        rawAuthor: buildRawAuthorFromNavigationParams(navigationParams),
      };
    }

    const functions = getFirebaseFunctions();
    const ingestFn = httpsCallable(functions, "ingestAuthor");
    const result = await ingestFn({
      providerExternalId: resolvedParams.providerExternalId,
      source: resolvedParams.source,
      rawAuthor: resolvedParams.rawAuthor,
    });

    const payload = result?.data as unknown;
    const envelope =
      payload && typeof payload === "object"
        ? (payload as Partial<SuccessEnvelope<EnsureCanonicalAuthorResult>> & FailureEnvelope)
        : null;
    const data =
      envelope?.success === true && envelope.data
        ? envelope.data
        : (payload as Partial<EnsureCanonicalAuthorResult> | null);

    if (envelope?.success === false) {
      console.warn("[ensureCanonicalAuthor][BACKEND_FAILURE]", envelope.error);
      return null;
    }

    const canonicalAuthorId =
      typeof data?.canonicalAuthorId === "string" && data.canonicalAuthorId.trim().length > 0
        ? data.canonicalAuthorId
        : typeof data?.authorId === "string" && data.authorId.trim().length > 0
          ? data.authorId
          : null;

    if (!canonicalAuthorId) {
      return null;
    }

    return {
      canonicalAuthorId,
      authorId: canonicalAuthorId,
      canonicalKey:
        typeof data?.canonicalKey === "string" && data.canonicalKey.trim().length > 0
          ? data.canonicalKey
          : "",
      status:
        typeof data?.status === "string" && data.status.trim().length > 0
          ? data.status
          : "CREATED",
      ...(typeof data?.providerExternalId === "string" &&
      data.providerExternalId.trim().length > 0
        ? { providerExternalId: data.providerExternalId }
        : {}),
    };
  } catch (error) {
    console.warn("[ensureCanonicalAuthor][FAILURE]", error);
    return null;
  }
}
