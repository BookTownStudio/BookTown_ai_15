// app/lib/offline/offlineManager.ts

import { httpsCallable } from "firebase/functions";
import { getFunctions } from "firebase/functions";

/**
 * OfflineEbookRecord
 *
 * Local-only representation of an offline ebook.
 * Stored in IndexedDB / Cache (implementation-agnostic).
 */
export interface OfflineEbookRecord {
  bookId: string;
  format: "pdf" | "epub" | "unknown";
  storedAt: number;
  expiresAt: number;
  bytes?: number;
  checksum?: string | null;
  lastKnownPage?: number;
}

/**
 * OFFLINE STORAGE KEYS
 * Centralized to prevent drift
 */
const OFFLINE_NAMESPACE = "booktown_offline_ebooks";
const OFFLINE_CACHE_KEY_PREFIX = "offline-book://";

function buildStorageKey(bookId: string): string {
  return `${OFFLINE_NAMESPACE}:${bookId}`;
}

function buildCacheKey(bookId: string): string {
  return `${OFFLINE_CACHE_KEY_PREFIX}${bookId}`;
}

function normalizeEnvelope<T>(value: unknown): T {
  const payload = value as any;

  if (payload?.success === false) {
    const code =
      typeof payload?.error?.code === "string" ? payload.error.code : "UNKNOWN";
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message
        : "Offline access request failed.";
    throw new Error(`[${code}] ${message}`);
  }

  return (payload?.success === true ? payload.data : payload) as T;
}

/**
 * requestOfflineAccess
 *
 * Calls server to validate eligibility and issue signed URL.
 */
async function requestOfflineAccess(bookId: string) {
  const fn = httpsCallable(
    getFunctions(),
    "requestEbookOfflineAccess"
  );
  const res = await fn({ bookId });

  return normalizeEnvelope<{
    bookId: string;
    format: "pdf" | "epub" | "unknown";
    signedUrl: string;
    expiresAt: number;
    checksum: string | null;
    maxBytes: number | null;
  }>(res.data);
}

/**
 * downloadAndStore
 *
 * Downloads ebook binary and stores it locally.
 * This does NOT expose the file to the OS.
 */
async function downloadAndStore(
  record: OfflineEbookRecord,
  signedUrl: string
) {
  const res = await fetch(signedUrl);

  if (!res.ok) {
    throw new Error("Offline download failed.");
  }

  const blob = await res.blob();

  // Cache API (preferred for large binaries)
  const cache = await caches.open(OFFLINE_NAMESPACE);
  await cache.put(buildCacheKey(record.bookId), new Response(blob));

  return blob.size;
}

/**
 * markOffline
 *
 * Public API — entry point
 */
export async function markEbookOffline(
  bookId: string
): Promise<OfflineEbookRecord> {
  const {
    signedUrl,
    expiresAt,
    checksum,
    maxBytes,
    format,
  } = await requestOfflineAccess(bookId);

  const record: OfflineEbookRecord = {
    bookId,
    format,
    storedAt: Date.now(),
    expiresAt,
    checksum,
    lastKnownPage: 1,
  };

  const bytes = await downloadAndStore(record, signedUrl);

  if (maxBytes && bytes > maxBytes) {
    await clearOfflineEbook(bookId);
    throw new Error("Offline file exceeds allowed size.");
  }

  record.bytes = bytes;

  localStorage.setItem(
    buildStorageKey(bookId),
    JSON.stringify(record)
  );

  return record;
}

/**
 * getOfflineRecord
 *
 * Safe lookup — no assumptions
 */
export function getOfflineRecord(
  bookId: string
): OfflineEbookRecord | null {
  const raw = localStorage.getItem(buildStorageKey(bookId));

  if (!raw) return null;

  try {
    return JSON.parse(raw) as OfflineEbookRecord;
  } catch {
    return null;
  }
}

/**
 * isOfflineValid
 *
 * Server-driven expiry only.
 */
export function isOfflineValid(
  record: OfflineEbookRecord
): boolean {
  return Date.now() < record.expiresAt;
}

export function getAllOfflineBookIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(`${OFFLINE_NAMESPACE}:`)) continue;
    ids.push(key.slice(`${OFFLINE_NAMESPACE}:`.length));
  }
  return ids;
}

export function updateOfflineLastKnownPage(
  bookId: string,
  page: number
): OfflineEbookRecord | null {
  const record = getOfflineRecord(bookId);
  if (!record) return null;

  const nextRecord: OfflineEbookRecord = {
    ...record,
    lastKnownPage: Math.max(1, Math.trunc(page)),
  };

  localStorage.setItem(buildStorageKey(bookId), JSON.stringify(nextRecord));
  return nextRecord;
}

export async function getOfflineBookObjectUrl(
  bookId: string
): Promise<string | null> {
  const record = getOfflineRecord(bookId);
  if (!record || !isOfflineValid(record)) {
    return null;
  }

  const cache = await caches.open(OFFLINE_NAMESPACE);
  const response = await cache.match(buildCacheKey(bookId));
  if (!response) {
    return null;
  }

  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

/**
 * clearOfflineEbook
 *
 * Used on expiry or manual cleanup.
 */
export async function clearOfflineEbook(
  bookId: string
) {
  const cache = await caches.open(OFFLINE_NAMESPACE);
  await cache.delete(buildCacheKey(bookId));

  localStorage.removeItem(buildStorageKey(bookId));
}
