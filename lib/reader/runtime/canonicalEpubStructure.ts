import type {
  EpubCanonicalLocationPayload,
  ReaderManifestLocationIdentityV1,
  ReaderManifestSnapshot,
} from './contracts.ts';

export type CanonicalEpubLocationMap = {
  identity: ReaderManifestLocationIdentityV1;
  sourceIdentity: string;
  generationChars: number;
  locationCount: number;
  payload: EpubCanonicalLocationPayload;
};

function isCanonicalLocationPayload(value: unknown): value is EpubCanonicalLocationPayload {
  return typeof value === 'string' || Array.isArray(value);
}

function isLocationIdentity(value: unknown): value is ReaderManifestLocationIdentityV1 {
  const identity = value as Partial<ReaderManifestLocationIdentityV1> | null;
  return Boolean(
    identity &&
      typeof identity.bookId === 'string' &&
      identity.bookId.trim().length > 0 &&
      typeof identity.manifestVersion === 'number' &&
      Number.isFinite(identity.manifestVersion) &&
      identity.manifestVersion > 0 &&
      typeof identity.pipelineVersion === 'string' &&
      identity.pipelineVersion.trim().length > 0 &&
      typeof identity.sourceSignatureHash === 'string' &&
      identity.sourceSignatureHash.trim().length > 0 &&
      typeof identity.generationChars === 'number' &&
      Number.isFinite(identity.generationChars) &&
      identity.generationChars > 0
  );
}

export function buildCanonicalEpubLocationSourceIdentity(
  identity: ReaderManifestLocationIdentityV1
): string {
  return [
    'canonical_epub_location_map',
    identity.bookId,
    identity.manifestVersion,
    identity.pipelineVersion,
    identity.sourceSignatureHash,
    identity.generationChars,
  ].join(':');
}

export function resolveCanonicalEpubLocationMap(
  manifest: ReaderManifestSnapshot | null | undefined,
  expectedGenerationChars: number
): CanonicalEpubLocationMap | null {
  if (!manifest || manifest.format !== 'epub') return null;
  const locationMap = manifest.locationMap;
  if (locationMap.version !== 'v1') return null;
  if (locationMap.status !== 'ready') return null;
  if (locationMap.source !== 'server_precomputed') return null;
  if (!isLocationIdentity(locationMap.identity)) return null;
  if (locationMap.identity.generationChars !== expectedGenerationChars) return null;
  if (locationMap.generationChars !== expectedGenerationChars) return null;
  if (
    typeof locationMap.locationCount !== 'number' ||
    !Number.isFinite(locationMap.locationCount) ||
    locationMap.locationCount <= 0
  ) {
    return null;
  }
  if (!isCanonicalLocationPayload(locationMap.payload)) return null;

  return {
    identity: locationMap.identity,
    sourceIdentity: buildCanonicalEpubLocationSourceIdentity(locationMap.identity),
    generationChars: expectedGenerationChars,
    locationCount: Math.trunc(locationMap.locationCount),
    payload: locationMap.payload,
  };
}
