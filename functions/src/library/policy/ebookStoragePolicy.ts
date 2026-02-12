// functions/src/library/policy/ebookStoragePolicy.ts
//
// Canonical backend-only storage contract for ebooks.
// Tier-1 invariant:
//   ✅ We store ebook binaries ONLY for editions that are confirmed Public Domain.
//   ❌ Never store binaries for non-PD, unknown-PD, or user-uploaded private books (those are handled elsewhere).
//
// This file contains ONLY pure policy + path/metadata contracts (no network, no Firestore writes).

import { createHash } from "crypto";
// FIX: Added Buffer import from 'buffer' to resolve "Cannot find name 'Buffer'" error.
import { Buffer } from "buffer";

export type EbookFormat = "epub" | "pdf";

export type EbookSource =
  | "gutenberg"
  | "internetArchive"
  | "hathitrust"
  | "wikidata"
  | "wikisource"
  | "qdl"
  | "other"
  | "userUpload"; // user uploads are not PD-gated here (handled in a separate user-content pipeline)

export type EbookAccess = "public" | "private";

export interface EbookBinaryMetadata {
  // Identity
  editionId: string;

  // Format + integrity
  format: EbookFormat;
  bytes: number;
  sha256: string; // canonical integrity checksum

  // Provenance
  source: EbookSource;
  sourceUrl?: string | null; // optional reference to origin

  // Storage pointer (bucket path)
  storagePath: string;

  // Access model (for PD binaries: always public)
  access: EbookAccess;

  // Timestamps (set by the caller using serverTimestamp / Date)
  createdAt?: any;
  updatedAt?: any;
}

export interface EbookStorageDecisionInput {
  editionId: string;
  publicDomain: boolean; // authoritative from editions.publicDomain
  format: EbookFormat;
  source: EbookSource;

  // For user uploads, PD gating is NOT applied by this policy (must be routed to user upload pipeline).
  isUserUploaded?: boolean;
}

/**
 * Canonical path contract for PD ebooks.
 *
 * IMPORTANT:
 * - We store ebooks under editions/{editionId}/ebooks/{sha256}.{ext}
 * - Using sha256 in the filename makes storage immutable + deduplicable.
 */
export function buildPublicEbookStoragePath(params: {
  editionId: string;
  sha256: string;
  format: EbookFormat;
}): string {
  const ext = params.format;
  return `editions/${params.editionId}/ebooks/${params.sha256}.${ext}`;
}

/**
 * Public Domain gating.
 * Returns ok=false if binary storage is not allowed.
 */
export function decideEbookBinaryStorage(input: EbookStorageDecisionInput): {
  ok: boolean;
  reason:
    | "ALLOW_PD_BINARY"
    | "DENY_NOT_PUBLIC_DOMAIN"
    | "DENY_USER_UPLOAD_PIPELINE"
    | "DENY_UNSUPPORTED_FORMAT";
} {
  // User uploads are handled by a different pipeline (private content, permissions, etc.)
  if (input.isUserUploaded) {
    return { ok: false, reason: "DENY_USER_UPLOAD_PIPELINE" };
  }

  // Supported formats only (v1)
  if (input.format !== "epub" && input.format !== "pdf") {
    return { ok: false, reason: "DENY_UNSUPPORTED_FORMAT" };
  }

  // Hard PD gate
  if (!input.publicDomain) {
    return { ok: false, reason: "DENY_NOT_PUBLIC_DOMAIN" };
  }

  return { ok: true, reason: "ALLOW_PD_BINARY" };
}

/**
 * Compute sha256 for a binary payload.
 * Used to enforce immutability + storage dedup.
 */
export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Assemble canonical metadata for a PD ebook binary.
 * Caller provides timestamps and writes to Firestore (this policy does not write).
 */
export function createPublicEbookBinaryMetadata(params: {
  editionId: string;
  format: EbookFormat;
  source: EbookSource;
  bytes: number;
  sha256: string;
  storagePath: string;
  sourceUrl?: string | null;
}): EbookBinaryMetadata {
  return {
    editionId: params.editionId,
    format: params.format,
    bytes: params.bytes,
    sha256: params.sha256,
    source: params.source,
    sourceUrl: params.sourceUrl ?? null,
    storagePath: params.storagePath,
    access: "public",
  };
}

/**
 * Canonical Firestore field contract (where the caller will persist).
 * We lock these field names now to avoid future migrations.
 */
export const EBOOK_FIRESTORE_FIELDS = {
  // Recommended location under editions/{editionId}
  // editions/{editionId}.ebook = { ... }
  rootField: "ebook",

  // Exact field names under editions/{editionId}.ebook
  schema: {
    format: "format",
    bytes: "bytes",
    sha256: "sha256",
    source: "source",
    sourceUrl: "sourceUrl",
    storagePath: "storagePath",
    access: "access",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
} as const;