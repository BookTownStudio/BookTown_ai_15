// app/lib/offline/offlineManager.ts

import { httpsCallable } from "firebase/functions";
import { getFunctions } from "firebase/functions";

/**
 * OfflineEbookRecord
 *
 * Local-only representation of an offline ebook.
 * Stored in localStorage / Cache.
 */
export interface OfflineEbookRecord {
  bookId: string;
  format: "pdf" | "epub" | "unknown";
  storedAt: number;
  expiresAt: number;
  bytes?: number;
  checksum?: string | null;
  integrityState?: "verified" | "unverified";
  lastKnownPage?: number;
}

/**
 * OFFLINE STORAGE KEYS
 * Centralized to prevent drift
 */
const OFFLINE_NAMESPACE = "booktown_offline_ebooks";
const OFFLINE_CACHE_PATH_PREFIX = "/__booktown_offline__/ebooks/";

function buildStorageKey(bookId: string): string {
  return `${OFFLINE_NAMESPACE}:${bookId}`;
}

export function buildCacheKey(bookId: string): string {
  return new URL(
    `${OFFLINE_CACHE_PATH_PREFIX}${encodeURIComponent(bookId)}`,
    window.location.origin
  ).toString();
}

function resolveOfflineContentType(format: OfflineEbookRecord["format"]): string {
  if (format === "pdf") return "application/pdf";
  if (format === "epub") return "application/epub+zip";
  return "application/octet-stream";
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

function isSha256Checksum(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

async function computeSha256Hex(blob: Blob): Promise<string> {
  if (!crypto?.subtle) {
    throw new Error("Offline integrity verification is unavailable in this browser.");
  }

  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function assertOfflineBlobIntegrity(blob: Blob, checksum: string | null): Promise<"verified" | "unverified"> {
  if (!checksum) return "unverified";
  if (!isSha256Checksum(checksum)) {
    throw new Error("Unsupported offline checksum format.");
  }

  const actual = await computeSha256Hex(blob);
  if (actual !== checksum.toLowerCase()) {
    throw new Error("Offline file integrity check failed.");
  }

  return "verified";
}

/**
 * downloadAndStore
 *
 * Downloads ebook binary and stores it locally.
 * This does NOT expose the file to the OS.
 */
async function downloadAndStore(
  record: OfflineEbookRecord,
  signedUrl: string,
  maxBytes: number | null
) {
  const res = await fetch(signedUrl);

  if (!res.ok) {
    throw new Error("Offline download failed.");
  }

  const blob = await res.blob();
  if (maxBytes && blob.size > maxBytes) {
    throw new Error("Offline file exceeds allowed size.");
  }

  const integrityState = await assertOfflineBlobIntegrity(blob, record.checksum || null);

  // Cache API (preferred for large binaries)
  const cache = await caches.open(OFFLINE_NAMESPACE);
  await cache.put(
    buildCacheKey(record.bookId),
    new Response(blob, {
      headers: {
        "Content-Type": blob.type || resolveOfflineContentType(record.format),
      },
    })
  );

  return {
    bytes: blob.size,
    integrityState,
  };
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

  const { bytes, integrityState } = await downloadAndStore(record, signedUrl, maxBytes);

  record.bytes = bytes;
  record.integrityState = integrityState;

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
  if (isSha256Checksum(record.checksum)) {
    try {
      await assertOfflineBlobIntegrity(blob, record.checksum);
    } catch (error) {
      await clearOfflineEbook(bookId);
      throw error;
    }
  }
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
