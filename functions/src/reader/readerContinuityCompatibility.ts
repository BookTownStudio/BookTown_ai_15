import * as logger from "firebase-functions/logger";
import type { ReaderManifestInternal } from "./readerManifestService";

export type ContinuityCompatibilityStatus =
  | "compatible"
  | "legacy_compatible"
  | "migrated"
  | "approximate"
  | "incompatible";

export interface ReaderSourceProvenance {
  manifestVersion: number;
  sourceSignatureHash: string;
  attachmentId: string | null;
  sourceType: string;
  editionId?: string | null;
}

export interface ContinuityCompatibilityResult {
  status: ContinuityCompatibilityStatus;
  compatible: boolean;
  reasons: string[];
  provenance: ReaderSourceProvenance;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

function stableManifestHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function provenanceFromManifest(manifest: ReaderManifestInternal): ReaderSourceProvenance {
  return {
    manifestVersion: manifest.version,
    sourceSignatureHash: stableManifestHash(manifest.sourceSignature),
    attachmentId: manifest.attachmentId,
    sourceType: manifest.sourceType,
  };
}

export function provenanceFromStoredRecord(
  data: Record<string, unknown> | null | undefined,
  anchor: Record<string, unknown> | null | undefined
): Partial<ReaderSourceProvenance> {
  const manifestVersion =
    asPositiveInt(data?.manifestVersion) ??
    asPositiveInt(data?.anchorManifestVersion) ??
    asPositiveInt(anchor?.manifestVersion);

  return {
    ...(manifestVersion ? { manifestVersion } : {}),
    ...(asNonEmptyString(data?.sourceSignatureHash)
      ? { sourceSignatureHash: asNonEmptyString(data?.sourceSignatureHash) as string }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(data || {}, "attachmentId")
      ? { attachmentId: asNonEmptyString(data?.attachmentId) }
      : {}),
    ...(asNonEmptyString(data?.sourceType)
      ? { sourceType: asNonEmptyString(data?.sourceType) as string }
      : {}),
    ...(asNonEmptyString(data?.editionId)
      ? { editionId: asNonEmptyString(data?.editionId) as string }
      : {}),
  };
}

export function writeSourceProvenance(
  payload: Record<string, unknown>,
  provenance: ReaderSourceProvenance
): void {
  payload.manifestVersion = provenance.manifestVersion;
  payload.sourceSignatureHash = provenance.sourceSignatureHash;
  payload.attachmentId = provenance.attachmentId;
  payload.sourceType = provenance.sourceType;
  if (provenance.editionId) {
    payload.editionId = provenance.editionId;
  }
}

export function evaluateContinuityCompatibility(params: {
  current: ReaderSourceProvenance;
  stored: Partial<ReaderSourceProvenance>;
}): ContinuityCompatibilityResult {
  const { current, stored } = params;
  const reasons: string[] = [];

  if (!stored.manifestVersion) {
    reasons.push("missing_manifest_version");
  } else if (stored.manifestVersion !== current.manifestVersion) {
    reasons.push("manifest_version_mismatch");
  }

  if (
    stored.sourceSignatureHash &&
    stored.sourceSignatureHash !== current.sourceSignatureHash
  ) {
    reasons.push("source_signature_mismatch");
  }

  if (
    Object.prototype.hasOwnProperty.call(stored, "attachmentId") &&
    (stored.attachmentId || null) !== current.attachmentId
  ) {
    reasons.push("attachment_mismatch");
  }

  if (stored.sourceType && stored.sourceType !== current.sourceType) {
    reasons.push("source_type_mismatch");
  }

  if (reasons.length > 0) {
    return {
      status: "incompatible",
      compatible: false,
      reasons,
      provenance: current,
    };
  }

  const hasFullSourceProvenance =
    Boolean(stored.sourceSignatureHash) &&
    Object.prototype.hasOwnProperty.call(stored, "attachmentId") &&
    Boolean(stored.sourceType);

  return {
    status: hasFullSourceProvenance ? "compatible" : "legacy_compatible",
    compatible: true,
    reasons: hasFullSourceProvenance ? [] : ["legacy_missing_source_provenance"],
    provenance: current,
  };
}

export async function attemptStableAnchorMigration(params: {
  bookId: string;
  uid: string;
  anchor: Record<string, unknown> | null;
  current: ReaderSourceProvenance;
}): Promise<{ anchor: Record<string, unknown>; status: "migrated" } | null> {
  const { bookId, uid, anchor, current } = params;
  if (!anchor) return null;

  logger.info("[READER][CONTINUITY_MIGRATION_UNAVAILABLE]", {
    uid,
    bookId,
    manifestVersion: current.manifestVersion,
    reason: "stable_anchor_map_lookup_not_materialized_for_anchor",
  });
  return null;
}
