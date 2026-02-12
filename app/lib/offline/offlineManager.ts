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
  ebookId: string;
  storedAt: number;
  expiresAt: number;
  bytes?: number;
  checksum?: string | null;
}

/**
 * OFFLINE STORAGE KEYS
 * Centralized to prevent drift
 */
const OFFLINE_NAMESPACE = "booktown_offline_ebooks";

/**
 * requestOfflineAccess
 *
 * Calls server to validate eligibility and issue signed URL.
 */
async function requestOfflineAccess(ebookId: string) {
  const fn = httpsCallable(
    getFunctions(),
    "requestEbookOfflineAccess"
  );
  const res = await fn({ ebookId });

  return res.data as {
    ebookId: string;
    signedUrl: string;
    expiresAt: number;
    checksum: string | null;
    maxBytes: number | null;
  };
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
  await cache.put(record.ebookId, new Response(blob));

  return blob.size;
}

/**
 * markOffline
 *
 * Public API — entry point
 */
export async function markEbookOffline(
  ebookId: string
): Promise<OfflineEbookRecord> {
  const {
    signedUrl,
    expiresAt,
    checksum,
    maxBytes,
  } = await requestOfflineAccess(ebookId);

  const record: OfflineEbookRecord = {
    ebookId,
    storedAt: Date.now(),
    expiresAt,
    checksum,
  };

  const bytes = await downloadAndStore(record, signedUrl);

  if (maxBytes && bytes > maxBytes) {
    throw new Error("Offline file exceeds allowed size.");
  }

  record.bytes = bytes;

  localStorage.setItem(
    `${OFFLINE_NAMESPACE}:${ebookId}`,
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
  ebookId: string
): OfflineEbookRecord | null {
  const raw = localStorage.getItem(
    `${OFFLINE_NAMESPACE}:${ebookId}`
  );

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

/**
 * clearOfflineEbook
 *
 * Used on expiry or manual cleanup.
 */
export async function clearOfflineEbook(
  ebookId: string
) {
  const cache = await caches.open(OFFLINE_NAMESPACE);
  await cache.delete(ebookId);

  localStorage.removeItem(
    `${OFFLINE_NAMESPACE}:${ebookId}`
  );
}
