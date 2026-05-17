const EPUB_LOCATION_CACHE_PREFIX = 'booktown:reader:epub_locations:v1';
const EPUB_LOCATION_CACHE_VERSION = 1;
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE_RECORD_BYTES = 1_500_000;

export type EpubLocationCachePayload = string | Record<string, unknown> | unknown[];

export type EpubLocationCacheRecord = {
  version: 1;
  sourceKey: string;
  generatedAtMs: number;
  generationChars: number;
  locationCount: number;
  payload: EpubLocationCachePayload;
};

type ReadOptions = {
  url: string;
  generationChars: number;
  sourceIdentity?: string | null;
  maxAgeMs?: number;
};

type WriteOptions = {
  url: string;
  generationChars: number;
  locationCount: number;
  payload: EpubLocationCachePayload;
  sourceIdentity?: string | null;
};

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeEpubLocationCacheSource(url: string): string {
  try {
    const parsed = new URL(url, typeof window !== 'undefined' ? window.location.href : undefined);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('#')[0]?.split('?')[0] ?? url;
  }
}

function resolveCacheSource(options: { url: string; sourceIdentity?: string | null }): string {
  const identity = typeof options.sourceIdentity === 'string' ? options.sourceIdentity.trim() : '';
  return identity.length > 0 ? identity : normalizeEpubLocationCacheSource(options.url);
}

export function buildEpubLocationCacheKey(url: string, generationChars: number): string {
  const sourceKey = normalizeEpubLocationCacheSource(url);
  return `${EPUB_LOCATION_CACHE_PREFIX}:${stableHash(sourceKey)}:${generationChars}`;
}

export function buildEpubLocationCacheKeyForSource(
  sourceIdentity: string,
  generationChars: number
): string {
  return `${EPUB_LOCATION_CACHE_PREFIX}:${stableHash(sourceIdentity)}:${generationChars}`;
}

function isCachePayload(value: unknown): value is EpubLocationCachePayload {
  return typeof value === 'string' || Array.isArray(value) || (typeof value === 'object' && value !== null);
}

function parseCacheRecord(raw: string, sourceKey: string, generationChars: number): EpubLocationCacheRecord | null {
  try {
    const parsed = JSON.parse(raw) as Partial<EpubLocationCacheRecord>;
    if (parsed.version !== EPUB_LOCATION_CACHE_VERSION) return null;
    if (parsed.sourceKey !== sourceKey) return null;
    if (parsed.generationChars !== generationChars) return null;
    if (typeof parsed.generatedAtMs !== 'number' || !Number.isFinite(parsed.generatedAtMs)) return null;
    if (typeof parsed.locationCount !== 'number' || parsed.locationCount <= 0) return null;
    if (!isCachePayload(parsed.payload)) return null;
    return parsed as EpubLocationCacheRecord;
  } catch {
    return null;
  }
}

export function readCachedEpubLocations(options: ReadOptions): EpubLocationCacheRecord | null {
  if (!hasLocalStorage()) return null;

  const sourceKey = resolveCacheSource(options);
  const cacheKey = buildEpubLocationCacheKeyForSource(sourceKey, options.generationChars);
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;

    const record = parseCacheRecord(raw, sourceKey, options.generationChars);
    if (!record) {
      window.localStorage.removeItem(cacheKey);
      return null;
    }

    if (Date.now() - record.generatedAtMs > maxAgeMs) {
      window.localStorage.removeItem(cacheKey);
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

export function writeCachedEpubLocations(options: WriteOptions): boolean {
  if (!hasLocalStorage()) return false;
  if (options.locationCount <= 0) return false;
  if (!isCachePayload(options.payload)) return false;

  const sourceKey = resolveCacheSource(options);
  const cacheKey = buildEpubLocationCacheKeyForSource(sourceKey, options.generationChars);
  const record: EpubLocationCacheRecord = {
    version: EPUB_LOCATION_CACHE_VERSION,
    sourceKey,
    generatedAtMs: Date.now(),
    generationChars: options.generationChars,
    locationCount: Math.trunc(options.locationCount),
    payload: options.payload,
  };

  try {
    const serialized = JSON.stringify(record);
    if (serialized.length > MAX_CACHE_RECORD_BYTES) {
      return false;
    }
    window.localStorage.setItem(cacheKey, serialized);
    return true;
  } catch {
    return false;
  }
}
