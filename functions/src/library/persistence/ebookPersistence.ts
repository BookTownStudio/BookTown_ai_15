// functions/src/library/persistence/ebookPersistence.ts
//
// Canonical Firestore persistence for Public Domain ebook metadata.
// Backend-only. No storage, no network, no ingestion logic.
//
// Tier-1 invariant:
//   - This module ONLY persists metadata
//   - Caller must already have evaluated Public Domain
//   - Binary handling happens in a later phase

import { FieldValue, Firestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

import {
  EbookBinaryMetadata,
  EBOOK_FIRESTORE_FIELDS,
} from "../policy/ebookStoragePolicy";

export interface PersistEbookMetadataParams {
  db: Firestore;
  editionId: string;

  // Result from PD evaluation
  publicDomain: boolean;

  // Ebook metadata (binary-independent)
  ebook: EbookBinaryMetadata;
}

/**
 * Persist Public Domain ebook metadata into:
 *   editions/{editionId}.ebook
 *
 * This function is intentionally strict and defensive.
 */
export async function persistPublicDomainEbookMetadata(
  params: PersistEbookMetadataParams
): Promise<void> {
  const { db, editionId, publicDomain, ebook } = params;

  if (!publicDomain) {
    logger.warn("[EBOOK][DENY] Attempted to persist ebook for non-PD edition", {
      editionId,
    });
    return;
  }

  const editionRef = db.collection("editions").doc(editionId);

  const now = FieldValue.serverTimestamp();

  const payload = {
    [EBOOK_FIRESTORE_FIELDS.schema.format]: ebook.format,
    [EBOOK_FIRESTORE_FIELDS.schema.bytes]: ebook.bytes,
    [EBOOK_FIRESTORE_FIELDS.schema.sha256]: ebook.sha256,
    [EBOOK_FIRESTORE_FIELDS.schema.source]: ebook.source,
    [EBOOK_FIRESTORE_FIELDS.schema.sourceUrl]: ebook.sourceUrl ?? null,
    [EBOOK_FIRESTORE_FIELDS.schema.storagePath]: ebook.storagePath,
    [EBOOK_FIRESTORE_FIELDS.schema.access]: ebook.access,
    [EBOOK_FIRESTORE_FIELDS.schema.createdAt]: now,
    [EBOOK_FIRESTORE_FIELDS.schema.updatedAt]: now,
  };

  await editionRef.set(
    {
      [EBOOK_FIRESTORE_FIELDS.rootField]: payload,
      updatedAt: now,
    },
    { merge: true }
  );

  logger.info("[EBOOK][METADATA_PERSISTED]", {
    editionId,
    format: ebook.format,
    source: ebook.source,
  });
}