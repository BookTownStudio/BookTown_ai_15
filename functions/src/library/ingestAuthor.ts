import { onCall, HttpsError } from "firebase-functions/v2/https";

import { admin } from "../firebaseAdmin";
import {
  materializeCanonicalAuthorInTransaction,
  SupportedAuthorSource,
} from "./authors/authorCatalog";
import { resolveAuthorProviderPayload } from "./authors/providerSources";

type IngestionRequest = {
  providerExternalId?: string;
  authorId?: string;
  source: Exclude<SupportedAuthorSource, "googleBooks">;
  rawAuthor: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSource(input: unknown): Exclude<SupportedAuthorSource, "googleBooks"> | null {
  const raw = String(input || "").trim();

  if (["openLibrary", "open_library", "openlibrary"].includes(raw)) {
    return "openLibrary";
  }

  if (["wikidata", "wikiData", "WIKIDATA"].includes(raw)) {
    return "wikidata";
  }

  return null;
}

export const ingestAuthor = onCall<IngestionRequest>({ cors: true }, async (request) => {
  const payload =
    request.data && typeof request.data === "object" && "data" in request.data
      ? (request.data as { data: IngestionRequest }).data
      : request.data;

  const source = normalizeSource(payload?.source);
  const rawAuthor = asRecord(payload?.rawAuthor);
  const providerExternalId =
    asNonEmptyString(payload?.providerExternalId) ||
    asNonEmptyString(payload?.authorId);

  if (!source || !rawAuthor || !providerExternalId) {
    throw new HttpsError("invalid-argument", "Missing or invalid parameters.");
  }

  const resolvedRawAuthor = await resolveAuthorProviderPayload({
    source,
    providerExternalId,
    rawAuthor,
  });

  const db = admin.firestore();
  const result = await db.runTransaction((tx) =>
    materializeCanonicalAuthorInTransaction({
      tx,
      source,
      providerExternalId,
      rawAuthor: resolvedRawAuthor,
    })
  );

  return {
    canonicalAuthorId: result.canonicalAuthorId,
    authorId: result.authorId,
    canonicalKey: result.canonicalKey,
    status: result.status,
    ...(result.providerExternalId ? { providerExternalId: result.providerExternalId } : {}),
  };
});
