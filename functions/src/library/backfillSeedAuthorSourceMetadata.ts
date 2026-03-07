import { FieldValue } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import { admin } from "../firebaseAdmin";
import {
  assertActiveAuthenticatedUser,
  assertRoleFromClaims,
} from "../shared/auth";

type BackfillSeedAuthorSourceMetadataRequest = {
  dryRun?: boolean;
  pageSize?: number;
  maxDocs?: number;
  cursorDocId?: string;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_DOCS = 500;
const MAX_MAX_DOCS = 5_000;
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

function hasProviderSourceIds(sourceIds: Record<string, unknown> | null): boolean {
  return Boolean(
    asNonEmptyString(sourceIds?.openLibrary) ||
      asNonEmptyString(sourceIds?.wikidata) ||
      asNonEmptyString(sourceIds?.googleBooks)
  );
}

function shouldMarkSyntheticSeedAuthor(author: Record<string, unknown>): boolean {
  if (!asNonEmptyString(author.seedNamespace)) {
    return false;
  }

  const sourceIds = asRecord(author.sourceIds);
  if (hasProviderSourceIds(sourceIds)) {
    return false;
  }

  return (
    sourceIds === null ||
    asNonEmptyString(author.sourceRecordType) !== "synthetic_seed" ||
    author.enrichmentEligible !== false
  );
}

export const backfillSeedAuthorSourceMetadata = onCall(
  { cors: true, timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    const caller = await assertActiveAuthenticatedUser(request.auth);
    assertRoleFromClaims(caller, "superadmin");

    const payload = (request.data ?? {}) as BackfillSeedAuthorSourceMetadataRequest;
    const dryRun = payload.dryRun !== false;
    const pageSize = clampPositiveInt(payload.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const maxDocs = clampPositiveInt(payload.maxDocs, DEFAULT_MAX_DOCS, MAX_MAX_DOCS);
    const initialCursor = asNonEmptyString(payload.cursorDocId);

    const db = admin.firestore();
    let processed = 0;
    let updated = 0;
    let unchanged = 0;
    let skippedHasProviderIds = 0;
    let hasMore = false;
    let nextCursorDocId: string | null = initialCursor || null;
    const previewAuthorIds: string[] = [];

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

        const author = (doc.data() || {}) as Record<string, unknown>;
        const sourceIds = asRecord(author.sourceIds);

        if (asNonEmptyString(author.seedNamespace) && hasProviderSourceIds(sourceIds)) {
          skippedHasProviderIds += 1;
          continue;
        }

        if (!shouldMarkSyntheticSeedAuthor(author)) {
          unchanged += 1;
          continue;
        }

        if (previewAuthorIds.length < PREVIEW_LIMIT) {
          previewAuthorIds.push(doc.id);
        }

        if (dryRun) {
          updated += 1;
          continue;
        }

        await db
          .collection("authors")
          .doc(doc.id)
          .set(
            {
              sourceIds: sourceIds || {},
              sourceRecordType: "synthetic_seed",
              enrichmentEligible: false,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        updated += 1;
      }

      hasMore = snap.docs.length === take && processed < maxDocs;
      if (snap.docs.length < take) {
        break;
      }
    }

    logger.info("[AUTHOR_SOURCE_STATE_BACKFILL][COMPLETE]", {
      dryRun,
      processed,
      updated,
      unchanged,
      skippedHasProviderIds,
      hasMore,
      nextCursorDocId,
    });

    return {
      dryRun,
      processed,
      updated,
      unchanged,
      skippedHasProviderIds,
      hasMore,
      ...(hasMore && nextCursorDocId ? { nextCursorDocId } : {}),
      previewAuthorIds,
    };
  }
);
