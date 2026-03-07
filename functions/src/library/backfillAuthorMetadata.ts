import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import { admin } from "../firebaseAdmin";
import {
  assertActiveAuthenticatedUser,
  assertRoleFromClaims,
} from "../shared/auth";
import {
  MaterializeCanonicalAuthorResult,
  SupportedAuthorSource,
  materializeCanonicalAuthorInTransaction,
} from "./authors/authorCatalog";
import { resolveAuthorProviderPayload } from "./authors/providerSources";

type BackfillAuthorMetadataRequest = {
  dryRun?: boolean;
  pageSize?: number;
  maxDocs?: number;
  cursorDocId?: string;
};

type BackfillPreviewItem = {
  authorId: string;
  source: SupportedAuthorSource;
  providerExternalId: string;
  changedFields: string[];
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_DOCS = 200;
const MAX_MAX_DOCS = 2_000;
const PREVIEW_LIMIT = 20;

function clampPositiveInt(
  value: unknown,
  fallback: number,
  hardMax: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.trunc(value);
  if (normalized <= 0) {
    return fallback;
  }

  return Math.min(normalized, hardMax);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function chooseProviderSource(author: Record<string, unknown>): {
  source: SupportedAuthorSource;
  providerExternalId: string;
} | null {
  const sourceIds = asRecord(author.sourceIds);
  const openLibraryId = asNonEmptyString(sourceIds?.openLibrary);
  if (openLibraryId) {
    return {
      source: "openLibrary",
      providerExternalId: openLibraryId,
    };
  }

  const wikidataId = asNonEmptyString(sourceIds?.wikidata);
  if (wikidataId) {
    return {
      source: "wikidata",
      providerExternalId: wikidataId,
    };
  }

  return null;
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((entry) => entry.length > 0)));
}

function collectChangedFields(
  existingAuthor: Record<string, unknown>,
  resolvedRawAuthor: Record<string, unknown>
): string[] {
  const changed = new Set<string>();
  const existingSourceIds = asRecord(existingAuthor.sourceIds);
  const resolvedSourceIds = {
    ...(asRecord(resolvedRawAuthor.sourceIds) || {}),
    ...(asRecord(resolvedRawAuthor.remote_ids)?.wikidata
      ? { wikidata: asNonEmptyString(asRecord(resolvedRawAuthor.remote_ids)?.wikidata) }
      : {}),
  };

  const existingBioEn = asNonEmptyString(existingAuthor.bioEn);
  const incomingBioEn =
    asNonEmptyString(resolvedRawAuthor.bioEn) ||
    asNonEmptyString(asRecord(resolvedRawAuthor.bio)?.value) ||
    asNonEmptyString(resolvedRawAuthor.bio);
  if (incomingBioEn && incomingBioEn !== existingBioEn) {
    changed.add("bioEn");
  }

  const existingBioAr = asNonEmptyString(existingAuthor.bioAr);
  const incomingBioAr = asNonEmptyString(resolvedRawAuthor.bioAr);
  if (incomingBioAr && incomingBioAr !== existingBioAr) {
    changed.add("bioAr");
  }

  const existingNameAr = asNonEmptyString(existingAuthor.nameAr);
  const incomingNameAr =
    asNonEmptyString(resolvedRawAuthor.nameAr) ||
    asNonEmptyString(asRecord(asRecord(resolvedRawAuthor.labels)?.ar)?.value);
  if (incomingNameAr && incomingNameAr !== existingNameAr) {
    changed.add("nameAr");
  }

  const existingOfficialLinks = asStringArray(existingAuthor.officialLinks);
  const incomingOfficialLinks = uniqueStrings([
    ...((Array.isArray(resolvedRawAuthor.links) ? resolvedRawAuthor.links : [])
      .map((entry) => asRecord(entry))
      .map((entry) => asNonEmptyString(entry?.url))
      .filter(Boolean)),
  ]);
  if (
    incomingOfficialLinks.length > 0 &&
    incomingOfficialLinks.join("|") !== existingOfficialLinks.join("|")
  ) {
    changed.add("officialLinks");
  }

  const existingWorkCount = Number(existingAuthor.workCount || 0);
  const incomingWorkCount =
    typeof resolvedRawAuthor.workCount === "number" && Number.isFinite(resolvedRawAuthor.workCount)
      ? Math.trunc(resolvedRawAuthor.workCount)
      : 0;
  if (incomingWorkCount > 0 && incomingWorkCount !== existingWorkCount) {
    changed.add("workCount");
  }

  const existingTopWorks = Array.isArray(existingAuthor.topWorks) ? existingAuthor.topWorks.length : 0;
  const incomingTopWorks = Array.isArray(resolvedRawAuthor.topWorks) ? resolvedRawAuthor.topWorks.length : 0;
  if (incomingTopWorks > 0 && incomingTopWorks !== existingTopWorks) {
    changed.add("topWorks");
  }

  if (
    asNonEmptyString(resolvedSourceIds.wikidata) &&
    asNonEmptyString(existingSourceIds?.wikidata) !== asNonEmptyString(resolvedSourceIds.wikidata)
  ) {
    changed.add("sourceIds.wikidata");
  }

  return Array.from(changed);
}

export const backfillAuthorMetadata = onCall(
  { cors: true, timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    assertRoleFromClaims(caller, "superadmin");

    const payload = (request.data ?? {}) as BackfillAuthorMetadataRequest;
    const dryRun = payload.dryRun !== false;
    const pageSize = clampPositiveInt(payload.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const maxDocs = clampPositiveInt(payload.maxDocs, DEFAULT_MAX_DOCS, MAX_MAX_DOCS);
    const initialCursor = asNonEmptyString(payload.cursorDocId);

    const db = admin.firestore();
    let processed = 0;
    let enriched = 0;
    let unchanged = 0;
    let skippedNoSource = 0;
    let skippedProviderFetch = 0;
    let hasMore = false;
    let nextCursorDocId: string | null = initialCursor || null;
    const previews: BackfillPreviewItem[] = [];
    const updatedAuthorIds: string[] = [];

    while (processed < maxDocs) {
      const remaining = maxDocs - processed;
      const take = Math.min(pageSize, remaining);

      let q = db
        .collection("authors")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(take);

      if (nextCursorDocId) {
        q = q.startAfter(nextCursorDocId);
      }

      const snap = await q.get();
      if (snap.empty) {
        hasMore = false;
        break;
      }

      for (const doc of snap.docs) {
        processed += 1;
        nextCursorDocId = doc.id;

        const existingAuthor = (doc.data() || {}) as Record<string, unknown>;
        const provider = chooseProviderSource(existingAuthor);
        if (!provider) {
          skippedNoSource += 1;
          continue;
        }

        let resolvedRawAuthor: Record<string, unknown>;
        try {
          resolvedRawAuthor = await resolveAuthorProviderPayload({
            source: provider.source,
            providerExternalId: provider.providerExternalId,
            rawAuthor: existingAuthor,
          });
        } catch (error) {
          skippedProviderFetch += 1;
          logger.warn("[AUTHOR_BACKFILL][PROVIDER_FETCH_FAILED]", {
            authorId: doc.id,
            source: provider.source,
            providerExternalId: provider.providerExternalId,
            error: String(error),
          });
          continue;
        }

        const changedFields = collectChangedFields(existingAuthor, resolvedRawAuthor);
        if (changedFields.length === 0) {
          unchanged += 1;
          continue;
        }

        if (previews.length < PREVIEW_LIMIT) {
          previews.push({
            authorId: doc.id,
            source: provider.source,
            providerExternalId: provider.providerExternalId,
            changedFields,
          });
        }

        if (dryRun) {
          enriched += 1;
          continue;
        }

        let transactionResult: MaterializeCanonicalAuthorResult | null = null;
        try {
          transactionResult = await db.runTransaction((tx) =>
            materializeCanonicalAuthorInTransaction({
              tx,
              source: provider.source,
              providerExternalId: provider.providerExternalId,
              rawAuthor: resolvedRawAuthor,
            })
          );
        } catch (error) {
          skippedProviderFetch += 1;
          logger.warn("[AUTHOR_BACKFILL][WRITE_FAILED]", {
            authorId: doc.id,
            source: provider.source,
            providerExternalId: provider.providerExternalId,
            error: String(error),
          });
          continue;
        }

        enriched += 1;
        if (updatedAuthorIds.length < PREVIEW_LIMIT) {
          updatedAuthorIds.push(transactionResult.authorId);
        }
      }

      hasMore = snap.docs.length === take && processed < maxDocs;
      if (snap.docs.length < take) {
        break;
      }
    }

    logger.info("[AUTHOR_BACKFILL][COMPLETE]", {
      dryRun,
      processed,
      enriched,
      unchanged,
      skippedNoSource,
      skippedProviderFetch,
      hasMore,
      nextCursorDocId,
    });

    return {
      dryRun,
      processed,
      enriched,
      unchanged,
      skippedNoSource,
      skippedProviderFetch,
      hasMore,
      ...(hasMore && nextCursorDocId ? { nextCursorDocId } : {}),
      previews,
      ...(updatedAuthorIds.length > 0 ? { updatedAuthorIds } : {}),
    };
  }
);
